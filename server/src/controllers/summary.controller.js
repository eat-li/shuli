// 课时总结控制器：增删改查（AI 生成在 ai.controller 中，走同一张表）
const { LessonSummary, Student, Homework } = require('../models')
const { ok, fail } = require('../utils/response')

// 字段白名单：只允许写入模型字段
const pick = (body = {}) => {
  const out = {}
  if (body.homeworkId !== undefined) out.homeworkId = Number(body.homeworkId) || null
  if (body.studentId !== undefined)
    out.studentId = body.studentId === null || body.studentId === '' ? null : Number(body.studentId)
  if (body.lessonAt !== undefined) out.lessonAt = body.lessonAt || null
  if (body.lessonNo !== undefined)
    out.lessonNo =
      body.lessonNo === null || body.lessonNo === '' ? null : Number(body.lessonNo) || null
  if (body.content !== undefined) out.content = body.content ? String(body.content) : null
  if (body.classStatus !== undefined)
    out.classStatus = body.classStatus ? String(body.classStatus) : null
  if (body.homeworkTask !== undefined)
    out.homeworkTask = body.homeworkTask ? String(body.homeworkTask) : null
  return out
}

// 新建必须带作业；上课时间给了就必须是合法日期（前端日期控件可被手改成非法串）。
const validate = (payload, { partial = false } = {}) => {
  if (!partial && !payload.homeworkId) return '缺少所属作业'
  if (payload.lessonAt && Number.isNaN(new Date(payload.lessonAt).getTime()))
    return '上课时间格式不正确'
  return null
}

// 列表：按作业 / 学生筛选（默认按上课时间倒序）
exports.list = async (req, res, next) => {
  try {
    const { homeworkId, studentId } = req.query
    const where = {}
    if (homeworkId) where.homeworkId = Number(homeworkId)
    if (studentId) where.studentId = Number(studentId)
    const rows = await LessonSummary.findAll({
      where,
      order: [
        ['lessonAt', 'DESC'],
        ['id', 'DESC']
      ],
      include: [
        { model: Student, as: 'student', attributes: ['id', 'name', 'grade'] },
        { model: Homework, as: 'homework', attributes: ['id', 'title'] }
      ]
    })
    ok(res, rows)
  } catch (e) {
    next(e)
  }
}

// 取单条总结，连同学生名与作业标题一起返回，避免详情页再发两个请求。
exports.get = async (req, res, next) => {
  try {
    const row = await LessonSummary.findByPk(req.params.id, {
      include: [
        { model: Student, as: 'student', attributes: ['id', 'name', 'grade'] },
        { model: Homework, as: 'homework', attributes: ['id', 'title'] }
      ]
    })
    if (!row) return fail(res, 40400, '课时总结不存在')
    ok(res, row)
  } catch (e) {
    next(e)
  }
}

// 新建课时总结前先确认作业存在——作业被删后旧的表单页面仍可能提交上来。
exports.create = async (req, res, next) => {
  try {
    const payload = pick(req.body)
    const err = validate(payload)
    if (err) return fail(res, 40000, err)
    const homework = await Homework.findByPk(payload.homeworkId)
    if (!homework) return fail(res, 40400, '关联的作业不存在')
    const row = await LessonSummary.create(payload)
    ok(res, row, '保存成功')
  } catch (e) {
    next(e)
  }
}

// 部分更新三段内容与上课信息。
exports.update = async (req, res, next) => {
  try {
    const row = await LessonSummary.findByPk(req.params.id)
    if (!row) return fail(res, 40400, '课时总结不存在')
    const payload = pick(req.body)
    const err = validate(payload, { partial: true })
    if (err) return fail(res, 40000, err)
    await row.update(payload)
    ok(res, row, '更新成功')
  } catch (e) {
    next(e)
  }
}

// 删除课时总结。
exports.remove = async (req, res, next) => {
  try {
    const row = await LessonSummary.findByPk(req.params.id)
    if (!row) return fail(res, 40400, '课时总结不存在')
    await row.destroy()
    ok(res, null, '删除成功')
  } catch (e) {
    next(e)
  }
}
