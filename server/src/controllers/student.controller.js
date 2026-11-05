// 学生管理控制器
const { Op } = require('sequelize')
const {
  sequelize,
  Student,
  HomeworkStudent,
  Submission,
  ExamScore,
  LessonSummary
} = require('../models')
const { ok, fail } = require('../utils/response')
const { cacheDel } = require('../utils/cache')

const DEFAULT_LIST_LIMIT = Number(process.env.DEFAULT_LIST_LIMIT) || 1000

// 字段白名单：只允许写入模型定义中允许的字段，并做基本长度归一化
const pick = (body = {}) => {
  const out = {}
  if (body.name !== undefined) out.name = String(body.name).slice(0, 50)
  if (body.grade !== undefined) out.grade = body.grade ? String(body.grade).slice(0, 50) : null
  if (body.contact !== undefined)
    out.contact = body.contact ? String(body.contact).slice(0, 100) : null
  if (body.remark !== undefined) out.remark = body.remark ? String(body.remark) : null
  return out
}

// 姓名是唯一必填项。partial=true 用于 PATCH：只校验实际传了的字段，不强制补全。
const validate = (payload, { partial = false } = {}) => {
  if (payload.name !== undefined && !String(payload.name).trim()) return '姓名不能为空'
  if (!partial && (!payload.name || !String(payload.name).trim())) return '姓名不能为空'
  return null
}

// 列表（支持关键词 + 年级筛选，支持分页）
exports.list = async (req, res, next) => {
  try {
    const { keyword, grade, page, pageSize } = req.query
    const where = {}
    if (keyword) where.name = { [Op.like]: `%${keyword}%` }
    if (grade) where.grade = grade

    const order = [['id', 'ASC']]

    // 传了 page 才分页；兼容旧调用方（不传 page 时仍返回数组）
    if (page !== undefined || pageSize !== undefined) {
      const pageNum = Math.max(1, Number(page) || 1)
      const size = Math.min(100, Math.max(1, Number(pageSize) || 20))
      const { rows, count } = await Student.findAndCountAll({
        where,
        order,
        limit: size,
        offset: (pageNum - 1) * size
      })
      return ok(res, { list: rows, total: count, page: pageNum, pageSize: size })
    }

    const list = await Student.findAll({ where, order, limit: DEFAULT_LIST_LIMIT })
    ok(res, list)
  } catch (e) {
    next(e)
  }
}

// 新增学生。顺带清掉首页统计缓存，否则概览里的学生数会滞后 10 秒。
exports.create = async (req, res, next) => {
  try {
    const payload = pick(req.body)
    const err = validate(payload)
    if (err) return fail(res, 40000, err)
    payload.name = payload.name.trim()
    const student = await Student.create(payload)
    cacheDel('stats:overview')
    ok(res, student, '创建成功')
  } catch (e) {
    next(e)
  }
}

// 取单个学生。
exports.get = async (req, res, next) => {
  try {
    const student = await Student.findByPk(req.params.id)
    if (!student) return fail(res, 40400, '学生不存在')
    ok(res, student)
  } catch (e) {
    next(e)
  }
}

// 改学生信息。同样要清统计缓存。
exports.update = async (req, res, next) => {
  try {
    const student = await Student.findByPk(req.params.id)
    if (!student) return fail(res, 40400, '学生不存在')
    const payload = pick(req.body)
    const err = validate(payload, { partial: true })
    if (err) return fail(res, 40000, err)
    if (payload.name !== undefined) payload.name = payload.name.trim()
    await student.update(payload)
    cacheDel('stats:overview')
    ok(res, student, '更新成功')
  } catch (e) {
    next(e)
  }
}

// 删学生必须连带清理 homework_students / submissions / exam_scores 三张非空外键表。
// 外包 MySQL 常见没开外键校验，裸删会留下孤儿行，备份包换库恢复时会整包失败。
exports.remove = async (req, res, next) => {
  try {
    const student = await Student.findByPk(req.params.id)
    if (!student) return fail(res, 40400, '学生不存在')

    // 删学生必须一并清掉引用它的数据：homework_students / submissions / exam_scores 都带着
    // 非空 studentId 外键。库里没开外键校验时（外包 MySQL 常见）裸删会留下孤儿行，
    // 之后备份出来的包不自洽，换到有外键的库恢复时就会整包失败。
    await sequelize.transaction(async (t) => {
      await HomeworkStudent.destroy({ where: { studentId: student.id }, transaction: t })
      await Submission.destroy({ where: { studentId: student.id }, transaction: t })
      await ExamScore.destroy({ where: { studentId: student.id }, transaction: t })
      // 课时总结属于作业而不是学生，删学生时只解除关联，保留总结本身
      await LessonSummary.update(
        { studentId: null },
        { where: { studentId: student.id }, transaction: t }
      )
      await student.destroy({ transaction: t })
    })

    cacheDel('stats:overview')
    ok(res, null, '删除成功')
  } catch (e) {
    next(e)
  }
}

// 导出学生信息为 JSON 文件
exports.export = async (req, res, next) => {
  try {
    const students = await Student.findAll({ order: [['id', 'ASC']] })
    const data = students.map((s) => ({
      name: s.name,
      grade: s.grade,
      contact: s.contact,
      remark: s.remark
    }))
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="students-${Date.now()}.json"`)
    res.send(JSON.stringify(data, null, 2))
  } catch (e) {
    next(e)
  }
}

// 导入学生信息（body 为学生数组，按姓名判断：存在则更新，否则新增）
exports.import = async (req, res, next) => {
  try {
    const items = Array.isArray(req.body) ? req.body : []
    if (!items.length) return fail(res, 40000, '没有可导入的数据')

    let created = 0
    let updated = 0
    let failed = 0

    // 一次性取出全部已有学生，按姓名建索引（1 次查询）；
    // 已有学生的更新也收集后一次批量写，避免逐条 UPDATE 的 N+1 写。
    const existing = await Student.findAll({ attributes: ['id', 'name'] })
    const byName = new Map(existing.map((s) => [s.name, s]))

    const toCreate = []
    const toUpdate = []
    for (const it of items) {
      if (!it || !it.name) {
        failed++
        continue
      }
      const payload = pick(it)
      if (!payload.name || !String(payload.name).trim()) {
        failed++
        continue
      }
      payload.name = payload.name.trim()
      const student = byName.get(payload.name)
      if (student) {
        // 携带主键 id，bulkCreate 按主键触发更新，不依赖 name 唯一索引
        toUpdate.push({ id: student.id, ...payload })
        updated++
      } else {
        toCreate.push(payload)
        created++
      }
    }
    // 两批写入必须同一事务：新增成功、更新失败会留下「一半导入」的状态，
    // 而导入是按姓名匹配的，重跑也无法判断哪一半已经进去了。
    await sequelize.transaction(async (t) => {
      if (toCreate.length) await Student.bulkCreate(toCreate, { transaction: t })
      if (toUpdate.length) {
        await Student.bulkCreate(toUpdate, {
          updateOnDuplicate: ['name', 'grade', 'contact', 'remark'],
          transaction: t
        })
      }
    })

    cacheDel('stats:overview')
    ok(res, { created, updated, failed }, `导入完成：新增 ${created} 名，更新 ${updated} 名`)
  } catch (e) {
    next(e)
  }
}
