// 作业与成绩控制器
const { Op, literal } = require('sequelize')
const {
  sequelize,
  Homework,
  HomeworkCategory,
  HomeworkQuestion,
  HomeworkStudent,
  Submission,
  Student,
  Question,
  LessonSummary
} = require('../models')
const { ok, fail } = require('../utils/response')
const { cacheDel } = require('../utils/cache')

const STATUSES = ['draft', 'published', 'closed']
const DEFAULT_LIST_LIMIT = Number(process.env.DEFAULT_LIST_LIMIT) || 1000

// 分类必须先存在：否则外键抛错会被兜底成 500，前端只看到「服务器错误」。
async function findCategoryError(categoryId) {
  if (categoryId === undefined || categoryId === null) return null
  const exists = await HomeworkCategory.findByPk(categoryId)
  return exists ? null : '所选作业分类不存在'
}

// 把 id 数组归一成正整数，过滤掉 undefined / 0 / 字符串脏值。
// 传了非数组则返回 null，由 validate 统一报错——这里不悄悄改成空数组。
const normalizeIdArray = (value) => {
  if (value === undefined) return undefined
  if (value === null || !Array.isArray(value)) return null
  return value.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
}

// 白名单取字段。categoryId 显式传 null/空串即「移出分类」，与「不传」语义不同，必须区分。
const pick = (body = {}) => {
  const out = {}
  if (body.title !== undefined) out.title = String(body.title).slice(0, 200)
  if (body.questionIds !== undefined) out.questionIds = normalizeIdArray(body.questionIds)
  if (body.studentIds !== undefined) out.studentIds = normalizeIdArray(body.studentIds)
  if (body.startAt !== undefined) out.startAt = body.startAt || null
  if (body.endAt !== undefined) out.endAt = body.endAt || null
  if (body.status !== undefined) out.status = body.status
  // 分类归属：显式传 null / 空串表示移出分类（变成「未分类」）
  if (body.categoryId !== undefined) {
    out.categoryId =
      body.categoryId === null || body.categoryId === '' ? null : Number(body.categoryId) || null
  }
  if (body.remark !== undefined) out.remark = body.remark ? String(body.remark) : null
  return out
}

// 标题必填、状态枚举、分类为正整数、起止时间可解析。
// 时间格式必须在这里拦住：数据库收到非法日期只会抛 500，前端看不到原因。
const validate = (payload, { partial = false } = {}) => {
  if (payload.title !== undefined && !String(payload.title).trim()) return '作业标题不能为空'
  if (!partial && (!payload.title || !String(payload.title).trim())) return '作业标题不能为空'
  if (payload.questionIds !== undefined && payload.questionIds === null) return '题目列表必须是数组'
  if (payload.studentIds !== undefined && payload.studentIds === null) return '学生列表必须是数组'
  if (payload.status !== undefined && !STATUSES.includes(payload.status)) return '作业状态不合法'
  if (payload.categoryId !== undefined && payload.categoryId !== null) {
    if (!Number.isInteger(payload.categoryId) || payload.categoryId <= 0) return '作业分类不合法'
  }
  for (const key of ['startAt', 'endAt']) {
    if (payload[key] && Number.isNaN(new Date(payload[key]).getTime())) {
      return `${key === 'startAt' ? '开始时间' : '截止时间'}格式不正确`
    }
  }
  return null
}

// 把关联表数据挂回 homework 实例，保持前端兼容 questionIds / studentIds 数组
async function attachRelationsToInstance(homework) {
  await attachRelationsToInstances([homework])
  return homework
}

// 批量给作业补关联与题数统计。一次性按 id 集合查两张关联表，
// 避免列表页为每行各查一次（N+1）。
async function attachRelationsToInstances(homeworks) {
  const ids = homeworks.map((h) => h.id).filter(Boolean)
  if (!ids.length) return homeworks

  const [questions, students] = await Promise.all([
    HomeworkQuestion.findAll({
      where: { homeworkId: { [Op.in]: ids } },
      order: [
        ['homeworkId', 'ASC'],
        ['sort', 'ASC'],
        ['id', 'ASC']
      ]
    }),
    HomeworkStudent.findAll({
      where: { homeworkId: { [Op.in]: ids } },
      order: [
        ['homeworkId', 'ASC'],
        ['id', 'ASC']
      ]
    })
  ])

  const questionsByHomework = new Map()
  for (const relation of questions) {
    if (!questionsByHomework.has(relation.homeworkId))
      questionsByHomework.set(relation.homeworkId, [])
    questionsByHomework.get(relation.homeworkId).push(relation.questionId)
  }

  const studentsByHomework = new Map()
  for (const relation of students) {
    if (!studentsByHomework.has(relation.homeworkId))
      studentsByHomework.set(relation.homeworkId, [])
    studentsByHomework.get(relation.homeworkId).push(relation.studentId)
  }

  for (const homework of homeworks) {
    homework.setDataValue('questionIds', questionsByHomework.get(homework.id) || [])
    homework.setDataValue('studentIds', studentsByHomework.get(homework.id) || [])
  }
  return homeworks
}

// 列表专用：默认只给题数，不把每份作业的完整题目 id 数组塞进响应。
// 列表页只显示「共几题」；真正需要完整 id 的只有「加入作业」弹窗
// （它要判断某道题是否已在目标作业里），由它显式传 withQuestionIds=1。
// studentIds 保留：作业导出 PDF 按名单分份，每份都要用它。
async function attachRelationSummary(homeworks, { withQuestionIds = false } = {}) {
  const ids = homeworks.map((h) => h.id).filter(Boolean)
  if (!ids.length) return homeworks

  const [questionRows, studentRows] = await Promise.all([
    withQuestionIds
      ? HomeworkQuestion.findAll({
          where: { homeworkId: { [Op.in]: ids } },
          attributes: ['homeworkId', 'questionId'],
          order: [
            ['homeworkId', 'ASC'],
            ['sort', 'ASC'],
            ['id', 'ASC']
          ],
          raw: true
        })
      : HomeworkQuestion.findAll({
          where: { homeworkId: { [Op.in]: ids } },
          attributes: ['homeworkId', [literal('COUNT(*)'), 'count']],
          group: ['homeworkId'],
          raw: true
        }),
    HomeworkStudent.findAll({
      where: { homeworkId: { [Op.in]: ids } },
      attributes: ['homeworkId', 'studentId'],
      order: [
        ['homeworkId', 'ASC'],
        ['id', 'ASC']
      ],
      raw: true
    })
  ])

  const questionsByHomework = new Map()
  const questionCounts = new Map()
  if (withQuestionIds) {
    for (const row of questionRows) {
      if (!questionsByHomework.has(row.homeworkId)) questionsByHomework.set(row.homeworkId, [])
      questionsByHomework.get(row.homeworkId).push(row.questionId)
    }
  } else {
    for (const row of questionRows) questionCounts.set(Number(row.homeworkId), Number(row.count))
  }

  const studentsByHomework = new Map()
  for (const row of studentRows) {
    if (!studentsByHomework.has(row.homeworkId)) studentsByHomework.set(row.homeworkId, [])
    studentsByHomework.get(row.homeworkId).push(row.studentId)
  }

  for (const homework of homeworks) {
    const studentIds = studentsByHomework.get(homework.id) || []
    homework.setDataValue('studentIds', studentIds)
    homework.setDataValue('studentCount', studentIds.length)
    if (withQuestionIds) {
      const questionIds = questionsByHomework.get(homework.id) || []
      homework.setDataValue('questionIds', questionIds)
      homework.setDataValue('questionCount', questionIds.length)
    } else {
      homework.setDataValue('questionCount', questionCounts.get(homework.id) || 0)
    }
  }
  return homeworks
}

// 整表替换作业题目（先清后插），sort 按传入顺序写入。必须在调用方的事务里执行。
async function replaceHomeworkQuestions(homeworkId, questionIds, transaction) {
  await HomeworkQuestion.destroy({ where: { homeworkId }, transaction })
  if (questionIds && questionIds.length) {
    await HomeworkQuestion.bulkCreate(
      questionIds.map((questionId, index) => ({ homeworkId, questionId, sort: index })),
      { transaction }
    )
  }
}

// 整表替换作业的学生名单。同样依赖调用方的事务。
async function replaceHomeworkStudents(homeworkId, studentIds, transaction) {
  await HomeworkStudent.destroy({ where: { homeworkId }, transaction })
  if (studentIds && studentIds.length) {
    await HomeworkStudent.bulkCreate(
      studentIds.map((studentId) => ({ homeworkId, studentId })),
      { transaction }
    )
  }
}

// 作业列表。categoryId=none 取「未分类」，不传则不过滤；
// 传了 page 才分页，否则返回全集（下拉选择用）。
exports.list = async (req, res, next) => {
  try {
    const { status, page, pageSize, categoryId, keyword } = req.query
    const where = {}
    if (status) where.status = status
    // 分类筛选：categoryId=none 取「未分类」；数字取指定分类；不传则不过滤（返回全部）
    if (categoryId === 'none') {
      where.categoryId = null
    } else if (categoryId !== undefined && categoryId !== '') {
      const cid = Number(categoryId)
      if (Number.isInteger(cid) && cid > 0) where.categoryId = cid
    }
    // 标题搜索：与题库列表同一口径（LIKE 模糊匹配）
    if (typeof keyword === 'string') {
      const kw = keyword.trim().slice(0, 100)
      if (kw) where.title = { [Op.like]: `%${kw}%` }
    }

    const order = [['id', 'DESC']]
    const withQuestionIds = ['1', 'true'].includes(String(req.query.withQuestionIds || ''))

    // 传了 page 才分页；兼容旧调用方（不传 page 时仍返回数组）
    if (page !== undefined || pageSize !== undefined) {
      const pageNum = Math.max(1, Number(page) || 1)
      const size = Math.min(100, Math.max(1, Number(pageSize) || 20))
      const { rows, count } = await Homework.findAndCountAll({
        where,
        order,
        limit: size,
        offset: (pageNum - 1) * size
      })
      await attachRelationSummary(rows, { withQuestionIds })
      return ok(res, { list: rows, total: count, page: pageNum, pageSize: size })
    }

    const list = await Homework.findAll({ where, order, limit: DEFAULT_LIST_LIMIT })
    await attachRelationSummary(list, { withQuestionIds })
    ok(res, list)
  } catch (e) {
    next(e)
  }
}

// 发布作业：分类必须先存在，否则外键报错会被兜底成 500。
// 作业本体与两张关联表在同一事务内写入。
exports.create = async (req, res, next) => {
  try {
    const payload = pick(req.body)
    const err = validate(payload)
    if (err) return fail(res, 40000, err)
    const categoryErr = await findCategoryError(payload.categoryId)
    if (categoryErr) return fail(res, 40000, categoryErr)
    if (payload.title !== undefined) payload.title = payload.title.trim()

    const homeworkData = { ...payload }
    delete homeworkData.questionIds
    delete homeworkData.studentIds
    let homework
    await sequelize.transaction(async (t) => {
      homework = await Homework.create(homeworkData, { transaction: t })
      if (payload.questionIds && payload.questionIds.length) {
        await HomeworkQuestion.bulkCreate(
          payload.questionIds.map((questionId, index) => ({
            homeworkId: homework.id,
            questionId,
            sort: index
          })),
          { transaction: t }
        )
      }
      if (payload.studentIds && payload.studentIds.length) {
        await HomeworkStudent.bulkCreate(
          payload.studentIds.map((studentId) => ({ homeworkId: homework.id, studentId })),
          { transaction: t }
        )
      }
    })
    await attachRelationsToInstance(homework)
    cacheDel('stats:overview')
    ok(res, homework, '创建成功')
  } catch (e) {
    next(e)
  }
}

// 详情（含成绩记录与学生信息）
exports.get = async (req, res, next) => {
  try {
    const homework = await Homework.findByPk(req.params.id, {
      include: [{ model: Submission, include: [Student] }]
    })
    if (!homework) return fail(res, 40400, '作业不存在')
    await attachRelationsToInstance(homework)
    ok(res, homework)
  } catch (e) {
    next(e)
  }
}

// 作业包含的题目详情（按布置顺序，供导出 PDF 使用）
exports.getQuestions = async (req, res, next) => {
  try {
    const homework = await Homework.findByPk(req.params.id)
    if (!homework) return fail(res, 40400, '作业不存在')
    const relations = await HomeworkQuestion.findAll({
      where: { homeworkId: homework.id },
      order: [
        ['sort', 'ASC'],
        ['id', 'ASC']
      ]
    })
    const ids = relations.map((h) => h.questionId)
    if (!ids.length) return ok(res, [])
    const questions = await Question.findAll({ where: { id: ids } })
    // 按布置顺序重排
    const map = new Map(questions.map((q) => [q.id, q]))
    const ordered = ids.map((id) => map.get(id)).filter(Boolean)
    ok(res, ordered)
  } catch (e) {
    next(e)
  }
}

// 更新作业。questionIds / studentIds 传了才整表替换，不传则保持原样——
// 这一点对「只改标题」的场景很关键，否则会静默清空题目。
exports.update = async (req, res, next) => {
  try {
    const homework = await Homework.findByPk(req.params.id)
    if (!homework) return fail(res, 40400, '作业不存在')
    const payload = pick(req.body)
    const err = validate(payload, { partial: true })
    if (err) return fail(res, 40000, err)
    const categoryErr = await findCategoryError(payload.categoryId)
    if (categoryErr) return fail(res, 40000, categoryErr)
    if (payload.title !== undefined) payload.title = payload.title.trim()

    const homeworkData = { ...payload }
    delete homeworkData.questionIds
    delete homeworkData.studentIds
    await sequelize.transaction(async (t) => {
      await homework.update(homeworkData, { transaction: t })
      if (payload.questionIds !== undefined) {
        await replaceHomeworkQuestions(homework.id, payload.questionIds, t)
      }
      if (payload.studentIds !== undefined) {
        await replaceHomeworkStudents(homework.id, payload.studentIds, t)
      }
    })
    await attachRelationsToInstance(homework)
    cacheDel('stats:overview')
    ok(res, homework, '更新成功')
  } catch (e) {
    next(e)
  }
}

// 追加题目到已有作业（题库页「加入作业」的入口）。
//
// 为什么不复用 PATCH /:id：它的 questionIds 语义是**整表替换** ——
// replaceHomeworkQuestions 会先 destroy 掉该作业的全部关联行，再按收到的数组重建。
// 用它做「给已发布的作业补一道题」时，前端手里的题目列表只要不是最新的
// （另一个标签页刚改过、或页面上是几分钟前拉的），就会把别人加的题静默删掉，
// 而且不会有任何报错。这里只做增量：跳过已存在的，sort 接在末尾。
exports.appendQuestions = async (req, res, next) => {
  try {
    const homework = await Homework.findByPk(req.params.id)
    if (!homework) return fail(res, 40400, '作业不存在')

    // closed = 已结束（老师多半已经录完成绩）。这时还能加题的话，
    // 成绩单上的「应有题量」和学生实际拿到的要求就对不上了，所以直接拒绝。
    if (homework.status === 'closed') {
      return fail(res, 40000, `「${homework.title}」已结束，不能再加题`)
    }

    const ids = normalizeIdArray(req.body?.questionIds)
    if (ids === null) return fail(res, 40000, '题目列表必须是数组')
    const wanted = [...new Set(ids || [])]
    if (!wanted.length) return fail(res, 40000, '请先选择要加入的题目')

    // 只保留真实存在的题目：前端可能停在过期列表上，题目已在别处被删掉，
    // 这时硬插关联行会撞外键并兜底成 500，用户只看到「服务器错误」。
    const existing = await Question.findAll({ where: { id: wanted }, attributes: ['id'] })
    const existingIds = new Set(existing.map((q) => q.id))
    const missing = wanted.filter((id) => !existingIds.has(id))

    const relations = await HomeworkQuestion.findAll({
      where: { homeworkId: homework.id },
      attributes: ['questionId', 'sort']
    })
    const alreadyIn = new Set(relations.map((r) => r.questionId))
    const toAdd = wanted.filter((id) => existingIds.has(id) && !alreadyIn.has(id))
    const duplicated = wanted.filter((id) => alreadyIn.has(id)).length

    if (!toAdd.length) {
      // 分清「本来就在里面」和「题目没了」——两种都是 0 新增，但用户要做的事完全不同
      if (missing.length && !duplicated) return fail(res, 40400, '题目不存在（可能已被删除）')
      return fail(res, 40000, `这道题已经在「${homework.title}」里了`)
    }

    const maxSort = relations.reduce((max, r) => Math.max(max, r.sort ?? 0), -1)
    await HomeworkQuestion.bulkCreate(
      toAdd.map((questionId, index) => ({
        homeworkId: homework.id,
        questionId,
        sort: maxSort + 1 + index
      }))
    )
    cacheDel('stats:overview')

    const total = relations.length + toAdd.length
    ok(
      res,
      { added: toAdd.length, duplicated, missing, total },
      `已加入「${homework.title}」（现共 ${total} 题）`
    )
  } catch (e) {
    next(e)
  }
}

// 删除作业（单条 / 批量共用）：先清理关联数据，再删作业本身
// 说明：submission 有 ON DELETE CASCADE 会随作业自动删除；
// lesson_summaries 无外键约束，必须显式删除，否则会留下打不开的孤儿记录。
async function purgeHomeworks(ids, transaction) {
  if (!ids.length) return { summaries: 0 }
  const summaries = await LessonSummary.count({
    where: { homeworkId: ids },
    transaction
  })
  await HomeworkQuestion.destroy({ where: { homeworkId: ids }, transaction })
  await HomeworkStudent.destroy({ where: { homeworkId: ids }, transaction })
  await LessonSummary.destroy({ where: { homeworkId: ids }, transaction })
  await Homework.destroy({ where: { id: ids }, transaction })
  return { summaries }
}

// 删作业：题目关联、学生关联、课时总结一并清理，同一事务内完成。
exports.remove = async (req, res, next) => {
  try {
    const homework = await Homework.findByPk(req.params.id)
    if (!homework) return fail(res, 40400, '作业不存在')
    await sequelize.transaction((t) => purgeHomeworks([homework.id], t))
    cacheDel('stats:overview')
    ok(res, null, '删除成功')
  } catch (e) {
    next(e)
  }
}

// 批量删除作业：{ ids: [1,2,3] }
exports.bulkRemove = async (req, res, next) => {
  try {
    const raw = Array.isArray(req.body?.ids) ? req.body.ids : []
    const ids = [...new Set(raw.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0))]
    if (!ids.length) return fail(res, 40000, '请先选择要删除的作业')

    const found = await Homework.findAll({ where: { id: ids }, attributes: ['id'] })
    if (!found.length) return fail(res, 40400, '所选作业都不存在（可能已被删除）')

    const existingIds = found.map((h) => h.id)
    let summaries = 0
    await sequelize.transaction(async (t) => {
      const result = await purgeHomeworks(existingIds, t)
      summaries = result.summaries
    })
    cacheDel('stats:overview')
    ok(
      res,
      { deleted: existingIds.length, summaries },
      `已删除 ${existingIds.length} 个作业` + (summaries ? `（含 ${summaries} 条课时总结）` : '')
    )
  } catch (e) {
    next(e)
  }
}

// 老师给作业的学生批量录入分数（学生线下做题，老师直接打分）
exports.score = async (req, res, next) => {
  try {
    const homework = await Homework.findByPk(req.params.id)
    if (!homework) return fail(res, 40400, '作业不存在')

    const scores = Array.isArray(req.body.scores) ? req.body.scores : []
    if (!scores.length) return ok(res, { saved: 0, skipped: 0 }, '没有需要保存的成绩')

    // 只接受「本次作业名单里的学生 + 合法分值」：
    // 早先只做 Number(score)||0，负分和 999 都能写进去，污染趋势图与分数段统计；
    // 而 studentId 不在名单里会直接撞外键/唯一索引，变成 500。
    const links = await HomeworkStudent.findAll({
      where: { homeworkId: homework.id },
      attributes: ['studentId'],
      raw: true
    })
    const allowed = new Set(links.map((l) => Number(l.studentId)))

    const records = []
    const problems = []
    const seen = new Set()
    for (let i = 0; i < scores.length; i++) {
      const item = scores[i] || {}
      const studentId = Number(item.studentId)
      if (!Number.isInteger(studentId) || studentId <= 0) {
        problems.push(`第 ${i + 1} 条缺少学生`)
        continue
      }
      if (!allowed.has(studentId)) {
        problems.push(`学生 ${studentId} 不在本次作业名单里`)
        continue
      }
      if (seen.has(studentId)) {
        problems.push(`学生 ${studentId} 重复提交`)
        continue
      }
      const raw = Number(item.score)
      // 上限放到 1000：主观题卷面分可能远超 100，过窄的上限会误伤
      if (!Number.isFinite(raw) || raw < 0 || raw > 1000) {
        problems.push(`学生 ${studentId} 的分数不合法（需 0–1000）`)
        continue
      }
      seen.add(studentId)
      records.push({
        homeworkId: homework.id,
        studentId,
        score: Math.round(raw * 10) / 10
      })
    }

    if (records.length) {
      // 利用 (homework_id, student_id) 唯一索引，一条 bulkCreate 完成新增+更新
      await Submission.bulkCreate(records, { updateOnDuplicate: ['score'] })
    }

    cacheDel('stats:overview')
    // 好数据照常保存，坏数据明确报出来 —— 一条输错就整批拒绝，老师得逐条排查
    const skipped = scores.length - records.length
    const message = skipped
      ? `已保存 ${records.length} 条，${skipped} 条未保存：${problems.slice(0, 3).join('；')}${problems.length > 3 ? '…' : ''}`
      : '成绩已保存'
    ok(res, { saved: records.length, skipped, problems }, message)
  } catch (e) {
    next(e)
  }
}
