// 测评成绩控制器（正式考试/小测，区别于作业练习分）
const { Op, col, fn, literal, where: sqlWhere } = require('sequelize')
const { ExamScore, Student, ExamType } = require('../models')
const { ok, fail } = require('../utils/response')
const { cacheGet, cacheSet, cacheDelByPrefix } = require('../utils/cache')

// 汇总聚合结果变化不频繁，加短 TTL 缓存降低数据库压力
const SUMMARY_TTL = 10000
const DEFAULT_LIST_LIMIT = Number(process.env.DEFAULT_LIST_LIMIT) || 1000

// 统一口径：把不同满分的考试折算成百分比再比较。
// 满分缺失/为 0 时按 0 分算，和原来逐行 percent() 的行为一致。
// 注意用真实列名（模型统一 underscored）：这里绕过 Sequelize 的属性名映射
// 百分比分数：score / full_score * 100，满分缺失或为 0 时按 0 处理，避免除零得到 NULL 再被 SUM 吞掉。
// 列名不加引号——都是本表唯一列，加反引号是 MySQL 习惯，SQLite 虽兼容但没必要。
const PERCENT_SQL = 'COALESCE(score / NULLIF(full_score, 0) * 100, 0)'

// 归一化单条成绩输入；非法行返回 null（分数越界、缺学生、分数非数字等）
const normalize = (it) => {
  if (!it || it.studentId == null) return null
  if (!it.examDate) return null
  const score = Number(it.score)
  const fullScore = Number(it.fullScore) || 100
  if (!Number.isFinite(score)) return null
  if (score < 0 || score > fullScore) return null
  return {
    studentId: it.studentId,
    // key 是否存在于字典由调用方校验（import 时批量查一次，避免逐行查库）
    examType: String(it.examType || '')
      .trim()
      .slice(0, 32),
    subject: (it.subject || '数学').toString().slice(0, 50),
    score,
    fullScore,
    examDate: it.examDate,
    comment: it.comment ? String(it.comment).slice(0, 255) : null
  }
}

// 唯一键：同一学生·类型·科目·日期视为同一场考试，重复录入走「更新」
const keyOf = (p) => `${p.studentId}|${p.examType}|${p.subject}|${p.examDate || ''}`

// 组装成绩表查询条件（list / summary 共用）
const buildWhere = (query) => {
  const { studentId, subject, examType, startDate, endDate, examDate } = query
  const where = {}
  if (studentId) where.studentId = Number(studentId)
  if (subject) where.subject = subject
  if (examType) where.examType = examType
  // 单日期精确匹配优先；否则按区间
  if (examDate) {
    where.examDate = examDate
  } else if (startDate || endDate) {
    where.examDate = {}
    if (startDate) where.examDate[Op.gte] = startDate
    if (endDate) where.examDate[Op.lte] = endDate
  }
  return where
}

// 组装关联学生表的查询条件（按姓名模糊匹配，可选）
const buildStudentWhere = (query) => {
  const { studentName } = query
  if (studentName) return { name: { [Op.like]: `%${studentName}%` } }
  return undefined
}

// 列表（支持学生/科目/考试类型/日期区间筛选，含学生信息）
exports.list = async (req, res, next) => {
  try {
    const list = await ExamScore.findAll({
      where: buildWhere(req.query),
      include: [
        { model: Student, attributes: ['id', 'name', 'grade'], where: buildStudentWhere(req.query) }
      ],
      order: [
        ['examDate', 'DESC'],
        ['id', 'DESC']
      ],
      limit: DEFAULT_LIST_LIMIT
    })
    ok(res, list)
  } catch (e) {
    next(e)
  }
}

// 单条新增（唯一键已存在则更新）
exports.create = async (req, res, next) => {
  try {
    const payload = normalize(req.body)
    if (!payload) return fail(res, 40000, '数据不合法：请检查学生与分数范围')
    const type = payload.examType ? await ExamType.findByPk(payload.examType) : null
    if (!type) return fail(res, 40000, '请选择有效的考试类型')
    const [record, created] = await ExamScore.findOrCreate({
      where: {
        studentId: payload.studentId,
        examType: payload.examType,
        subject: payload.subject,
        examDate: payload.examDate
      },
      defaults: payload
    })
    if (!created) await record.update(payload)
    cacheDelByPrefix('grades:summary:')
    ok(res, record, created ? '保存成功' : '已更新同场考试成绩')
  } catch (e) {
    next(e)
  }
}

// 批量导入（body 为成绩数组，按唯一键去重后区分新增/更新）
exports.import = async (req, res, next) => {
  try {
    const items = Array.isArray(req.body) ? req.body : []
    if (!items.length) return fail(res, 40000, '没有可导入的数据')

    let failed = 0
    // 0) 类型字典：一次查出合法 key，非法类型按「非法行」计入 failed
    const allowedTypes = new Set(
      (await ExamType.findAll({ attributes: ['key'], raw: true })).map((row) => row.key)
    )

    // 1) 输入去重：同一唯一键后者覆盖前者
    const inputMap = new Map()
    for (const it of items) {
      const payload = normalize(it)
      if (!payload || !payload.examType || !allowedTypes.has(payload.examType)) {
        failed++
        continue
      }
      inputMap.set(keyOf(payload), payload)
    }

    // 2) 只加载本次涉及学生的已有成绩，避免全表加载
    const studentIds = [...new Set([...inputMap.values()].map((p) => p.studentId))]
    const existing = studentIds.length
      ? await ExamScore.findAll({ where: { studentId: { [Op.in]: studentIds } } })
      : []
    const byKey = new Map(existing.map((r) => [keyOf(r), r]))

    // 3) 区分新增 / 更新，最后用一次 bulkCreate 批量写入
    const toWrite = []
    let updated = 0
    for (const [k, payload] of inputMap) {
      const record = byKey.get(k)
      if (record) {
        toWrite.push({ ...payload, id: record.id })
        updated++
      } else {
        toWrite.push(payload)
      }
    }
    if (toWrite.length) {
      await ExamScore.bulkCreate(toWrite, {
        updateOnDuplicate: ['score', 'fullScore', 'comment']
      })
    }
    cacheDelByPrefix('grades:summary:')

    const created = toWrite.length - updated
    ok(
      res,
      { created, updated, failed },
      `导入完成：新增 ${created} 条，更新 ${updated} 条${failed ? `，跳过 ${failed} 条非法行` : ''}`
    )
  } catch (e) {
    next(e)
  }
}

// 学生卡片聚合：每个学生的考试次数 + 最近一次成绩。
//
// 以前是把筛选后的全部成绩行拉进内存再逐行数；成绩表一多大，这个接口就等于
// 把整表搬一遍，前端却只用到「次数 + 最近一条」。现在次数交给 GROUP BY，
// 最近一次用「每人最大日期 → 该日期最大 id」两步取，返回的行数和学生数同量级。
exports.cards = async (req, res, next) => {
  try {
    const keyword = String(req.query.studentName || '')
      .trim()
      .toLowerCase()

    const students = await Student.findAll({ order: [['id', 'ASC']] })
    const picked = keyword
      ? students.filter((s) => s.name.toLowerCase().includes(keyword))
      : students

    // 只统计最终会展示的学生：姓名筛选在内存里做（学生表很小），成绩表只查这批 id。
    const where = buildWhere(req.query)
    let scopeIds = picked.map((s) => s.id)
    if (where.studentId != null) {
      scopeIds = scopeIds.filter((id) => id === Number(where.studentId))
    }
    const scope = scopeIds.length ? { ...where, studentId: { [Op.in]: scopeIds } } : null

    const countByStudent = new Map()
    const latestByStudent = new Map()

    if (scope) {
      const counts = await ExamScore.findAll({
        where: scope,
        attributes: ['studentId', [literal('COUNT(*)'), 'count']],
        group: ['studentId'],
        raw: true
      })
      for (const row of counts) countByStudent.set(Number(row.studentId), Number(row.count))

      // 取每个学生最近一次考试日期。不能直接 MAX 后原样拼进 WHERE：
      // 只要该列存的是 datetime（而不是纯 'YYYY-MM-DD'），拼回去就带时分秒，匹配不到当天。
      // substr(...,1,10) 把两种形态统一截成日期，且是 SQL 标准写法，不依赖某个库的日期函数。
      const maxRows = await ExamScore.findAll({
        where: scope,
        attributes: ['studentId', [literal('substr(MAX(exam_date), 1, 10)'), 'maxDate']],
        group: ['studentId'],
        raw: true
      })
      const latestPairs = maxRows.map((row) => ({
        [Op.and]: [{ studentId: Number(row.studentId) }, { examDate: row.maxDate }]
      }))
      if (latestPairs.length) {
        const latestRows = await ExamScore.findAll({
          where: { ...scope, [Op.or]: latestPairs },
          order: [
            ['examDate', 'DESC'],
            ['id', 'DESC']
          ],
          raw: true
        })
        for (const row of latestRows) {
          if (latestByStudent.has(row.studentId)) continue
          latestByStudent.set(row.studentId, {
            id: row.id,
            studentId: row.studentId,
            examType: row.examType,
            subject: row.subject,
            score: row.score,
            fullScore: row.fullScore,
            examDate: row.examDate,
            comment: row.comment
          })
        }
      }
    }

    ok(
      res,
      picked.map((s) => ({
        id: s.id,
        name: s.name,
        grade: s.grade,
        examCount: countByStudent.get(s.id) || 0,
        latest: latestByStudent.get(s.id) || null
      }))
    )
  } catch (e) {
    next(e)
  }
}

// 汇总聚合：趋势（折线）、能力（雷达）、分数段（饼图）、班级对比（柱状）
exports.summary = async (req, res, next) => {
  try {
    const { studentId, subject, examType, startDate, endDate } = req.query
    const cacheKey =
      'grades:summary:' +
      JSON.stringify({
        studentId: studentId || null,
        subject: subject || null,
        examType: examType || null,
        startDate: startDate || null,
        endDate: endDate || null,
        // 姓名筛选同样决定结果集，漏进缓存键会让换个名字查到上一个学生的汇总
        studentName: req.query.studentName || null
      })
    const cached = cacheGet(cacheKey)
    if (cached) return ok(res, cached)

    const where = buildWhere(req.query)
    // 姓名筛选先缩成学生 id 集合：成绩表按 id 过滤，不为一处姓名匹配去 JOIN 大表。
    // 用 instr(被查找串, 关键字) 而不是 LIKE：关键字被当作字面量，
    // 用户输入 % / _（数学老师写「%」很常见）不会被当成通配符。
    // 注意 instr 的两个参数顺序与 MySQL 的 LOCATE(关键字, 被查找串) 相反。
    const keyword = String(req.query.studentName || '').trim()
    if (keyword) {
      const matched = await Student.findAll({
        where: sqlWhere(fn('instr', col('name'), keyword), { [Op.gt]: 0 }),
        attributes: ['id'],
        raw: true
      })
      const ids = matched.map((row) => row.id)
      if (where.studentId == null) where.studentId = { [Op.in]: ids }
      else if (!ids.includes(Number(where.studentId))) where.studentId = { [Op.in]: [] }
    }

    // —— 分数段分布（数据库直接计数，不再把明细搬进内存逐行分桶）——
    const bands = [
      { key: 'excellent', label: '优秀(≥90)', when: `${PERCENT_SQL} >= 90` },
      { key: 'good', label: '良好(80-89)', when: `${PERCENT_SQL} >= 80 AND ${PERCENT_SQL} < 90` },
      { key: 'pass', label: '及格(60-79)', when: `${PERCENT_SQL} >= 60 AND ${PERCENT_SQL} < 80` },
      { key: 'fail', label: '不及格(<60)', when: `${PERCENT_SQL} < 60` }
    ]
    const bandRow = await ExamScore.findOne({
      where,
      attributes: bands.map((band) => [
        literal(`SUM(CASE WHEN ${band.when} THEN 1 ELSE 0 END)`),
        band.key
      ]),
      raw: true
    })
    const distribution = bands.map((band) => ({
      key: band.key,
      label: band.label,
      count: Number(bandRow?.[band.key]) || 0
    }))

    // —— 班级对比（各学生平均百分比，数据库分组求平均）——
    const compareRows = await ExamScore.findAll({
      where,
      attributes: [
        'studentId',
        [literal(`ROUND(AVG(${PERCENT_SQL}), 1)`), 'avgPercent'],
        [literal('COUNT(*)'), 'count']
      ],
      group: ['studentId'],
      raw: true
    })
    const compareIds = [...new Set(compareRows.map((row) => row.studentId))]
    const compareStudents = compareIds.length
      ? await Student.findAll({
          where: { id: { [Op.in]: compareIds } },
          attributes: ['id', 'name', 'grade'],
          raw: true
        })
      : []
    const studentById = new Map(compareStudents.map((s) => [s.id, s]))
    const compare = compareRows
      .map((row) => ({
        studentId: row.studentId,
        name: studentById.get(row.studentId)?.name || `学生${row.studentId}`,
        grade: studentById.get(row.studentId)?.grade || null,
        avgPercent: Number(row.avgPercent) || 0,
        count: Number(row.count) || 0
      }))
      .sort((a, b) => b.avgPercent - a.avgPercent)

    // —— 趋势（单学生时按科目分组时间序列）——
    const trend = []
    // —— 雷达（单学生各科平均百分比，忽略科目筛选以呈现全科能力）——
    const radar = []

    if (studentId) {
      // 单学生的明细只有几十行，趋势与雷达继续在内存里折算，口径与改动前完全一致
      const rows = await ExamScore.findAll({
        where,
        order: [
          ['examDate', 'ASC'],
          ['id', 'ASC']
        ],
        raw: true
      })
      // 折算百分比（满分可能不同，用百分比统一可比口径）
      const percent = (r) => (r.fullScore > 0 ? (r.score / r.fullScore) * 100 : 0)

      // 雷达：忽略 subject 过滤，看该学生所有科目
      const radarWhere = { studentId: Number(studentId) }
      if (examType) radarWhere.examType = examType
      if (startDate || endDate) {
        radarWhere.examDate = {}
        if (startDate) radarWhere.examDate[Op.gte] = startDate
        if (endDate) radarWhere.examDate[Op.lte] = endDate
      }
      const radarRows = await ExamScore.findAll({ where: radarWhere, raw: true })
      const subjectAgg = new Map()
      for (const r of radarRows) {
        if (!subjectAgg.has(r.subject)) subjectAgg.set(r.subject, { sum: 0, count: 0 })
        const agg = subjectAgg.get(r.subject)
        agg.sum += percent(r)
        agg.count++
      }
      for (const [subj, agg] of subjectAgg) {
        radar.push({
          subject: subj,
          avgPercent: Math.round((agg.sum / agg.count) * 10) / 10,
          count: agg.count
        })
      }

      // 趋势：按科目分组，组内按日期升序
      const trendMap = new Map()
      for (const r of rows) {
        if (!trendMap.has(r.subject)) trendMap.set(r.subject, [])
        trendMap.get(r.subject).push(r)
      }
      for (const [subj, rs] of trendMap) {
        trend.push({
          subject: subj,
          points: rs.map((r) => ({
            date: r.examDate,
            examType: r.examType,
            score: r.score,
            fullScore: r.fullScore,
            percent: Math.round(percent(r) * 10) / 10
          }))
        })
      }
    }

    const payload = { trend, radar, distribution, compare }
    cacheSet(cacheKey, payload, SUMMARY_TTL)
    ok(res, payload)
  } catch (e) {
    next(e)
  }
}

// 取单条成绩，连同学生姓名一起返回，省掉详情页的二次请求。
exports.get = async (req, res, next) => {
  try {
    const record = await ExamScore.findByPk(req.params.id, {
      include: [{ model: Student, attributes: ['id', 'name', 'grade'] }]
    })
    if (!record) return fail(res, 40400, '成绩记录不存在')
    ok(res, record)
  } catch (e) {
    next(e)
  }
}

// 改成绩。改完必须按前缀清掉图表汇总缓存，否则折线图会停在旧数据上。
exports.update = async (req, res, next) => {
  try {
    const payload = normalize(req.body)
    if (!payload) return fail(res, 40000, '数据不合法：请检查学生与分数范围')
    const type = payload.examType ? await ExamType.findByPk(payload.examType) : null
    if (!type) return fail(res, 40000, '请选择有效的考试类型')
    const record = await ExamScore.findByPk(req.params.id)
    if (!record) return fail(res, 40400, '成绩记录不存在')
    await record.update(payload)
    cacheDelByPrefix('grades:summary:')
    ok(res, record, '更新成功')
  } catch (e) {
    next(e)
  }
}

// 删成绩。同样清汇总缓存。
exports.remove = async (req, res, next) => {
  try {
    const record = await ExamScore.findByPk(req.params.id)
    if (!record) return fail(res, 40400, '成绩记录不存在')
    await record.destroy()
    cacheDelByPrefix('grades:summary:')
    ok(res, null, '删除成功')
  } catch (e) {
    next(e)
  }
}
