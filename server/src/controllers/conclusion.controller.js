// 结论控制器
const { Op } = require('sequelize')
const { sequelize, Conclusion, KnowledgeCategory } = require('../models')
const { ok, fail } = require('../utils/response')

/**
 * 各分类下的结论条数：{ [categoryId]: total }。
 *
 * 讲义页的知识点素材池要给 90+ 个分类标条数（还得知道哪些分类可插入）。
 * 之前前端是「逐个分类发一次请求」，93 个分类就是 93 次往返 ——
 * 打开讲义页要好几秒，在远程库（每次约 43ms）上更明显，还会撞到限流。
 * 这里用一次 GROUP BY 查完。
 */
exports.categoryCounts = async (req, res, next) => {
  try {
    const rows = await Conclusion.findAll({
      attributes: ['categoryId', [sequelize.fn('COUNT', sequelize.col('id')), 'total']],
      group: ['categoryId'],
      raw: true
    })
    const counts = {}
    for (const r of rows) counts[r.categoryId] = Number(r.total) || 0
    ok(res, counts)
  } catch (e) {
    next(e)
  }
}

// 校验：标题/分类/内容必填，内容去掉空格与标签后不能为空
const validate = (payload) => {
  if (!payload.title || !String(payload.title).trim()) return '标题不能为空'
  if (payload.categoryId == null) return '请选择所属分类'
  const plain = String(payload.content || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim()
  if (!plain) return '内容不能为空'
  return null
}

// 归一化输入字段，只保留允许写入的键
const pick = (body) => {
  const out = {}
  if (body.title !== undefined) out.title = String(body.title).slice(0, 200)
  if (body.categoryId !== undefined) out.categoryId = Number(body.categoryId) || null
  if (body.content !== undefined) out.content = String(body.content)
  if (body.summary !== undefined)
    out.summary = body.summary ? String(body.summary).slice(0, 500) : null
  if (body.status !== undefined) out.status = body.status === 'published' ? 'published' : 'draft'
  if (body.tags !== undefined) out.tags = body.tags ? String(body.tags).slice(0, 255) : null
  return out
}

// 列表（分类/状态/关键词筛选 + 分页，含分类名）
exports.list = async (req, res, next) => {
  try {
    const { categoryId, status, keyword, page, pageSize } = req.query
    const where = {}
    if (categoryId) where.categoryId = Number(categoryId)
    if (status) where.status = status
    if (keyword) {
      where[Op.or] = [
        { title: { [Op.like]: `%${keyword}%` } },
        { summary: { [Op.like]: `%${keyword}%` } },
        { tags: { [Op.like]: `%${keyword}%` } }
      ]
    }

    const pageNum = Math.max(1, Number(page) || 1)
    const size = Math.min(100, Math.max(1, Number(pageSize) || 20))

    const { rows, count } = await Conclusion.findAndCountAll({
      where,
      include: [{ model: KnowledgeCategory, as: 'category', attributes: ['id', 'name'] }],
      order: [['id', 'DESC']],
      limit: size,
      offset: (pageNum - 1) * size,
      distinct: true
    })
    ok(res, { list: rows, total: count })
  } catch (e) {
    next(e)
  }
}

// 新建结论。
exports.create = async (req, res, next) => {
  try {
    const payload = pick(req.body)
    const err = validate(payload)
    if (err) return fail(res, 40000, err)
    const conclusion = await Conclusion.create(payload)
    ok(res, conclusion, '创建成功')
  } catch (e) {
    next(e)
  }
}

// 取结论详情，连同分类名一起返回，省掉详情页的第二次请求。
exports.get = async (req, res, next) => {
  try {
    const conclusion = await Conclusion.findByPk(req.params.id, {
      include: [{ model: KnowledgeCategory, as: 'category', attributes: ['id', 'name'] }]
    })
    if (!conclusion) return fail(res, 40400, '结论不存在')
    ok(res, conclusion)
  } catch (e) {
    next(e)
  }
}

// 改结论。校验时把「库里的旧值 + 本次改动」合并后再判，
// 否则只改正文也会因为别的字段为空被判不合法。
exports.update = async (req, res, next) => {
  try {
    const conclusion = await Conclusion.findByPk(req.params.id)
    if (!conclusion) return fail(res, 40400, '结论不存在')
    const payload = pick(req.body)
    const err = validate({ ...conclusion.toJSON(), ...payload })
    if (err) return fail(res, 40000, err)
    await conclusion.update(payload)
    ok(res, conclusion, '更新成功')
  } catch (e) {
    next(e)
  }
}

// 删除结论。
exports.remove = async (req, res, next) => {
  try {
    const conclusion = await Conclusion.findByPk(req.params.id)
    if (!conclusion) return fail(res, 40400, '结论不存在')
    await conclusion.destroy()
    ok(res, null, '删除成功')
  } catch (e) {
    next(e)
  }
}

// 发布 / 撤下
exports.updateStatus = async (req, res, next) => {
  try {
    const conclusion = await Conclusion.findByPk(req.params.id)
    if (!conclusion) return fail(res, 40400, '结论不存在')
    const status = req.body.status === 'published' ? 'published' : 'draft'
    await conclusion.update({ status })
    ok(res, conclusion, status === 'published' ? '已发布' : '已撤下为草稿')
  } catch (e) {
    next(e)
  }
}
