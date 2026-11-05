// 讲义控制器：讲义 = 有序内容项（题目 / 结论 / 知识点区块）
const { Op } = require('sequelize')
const { Handout, Question, Conclusion, KnowledgeCategory } = require('../models')
const { ok, fail } = require('../utils/response')

const ITEM_TYPES = ['question', 'conclusion', 'knowledge']

// 归一化内容项数组：只保留合法类型与正整数 id
const normalizeItems = (value) => {
  if (value === undefined) return undefined
  if (value === null || !Array.isArray(value)) return null
  const out = []
  for (const it of value) {
    if (!it || !ITEM_TYPES.includes(it.type)) continue
    const id = Number(it.id)
    if (Number.isInteger(id) && id > 0) out.push({ type: it.type, id })
  }
  return out
}

// 白名单取字段。content 是文档式编辑后的权威正文，items 仅作旧数据与「内容构成」参考。
const pick = (body = {}) => {
  const out = {}
  if (body.title !== undefined) out.title = String(body.title).slice(0, 200)
  if (body.status !== undefined) out.status = body.status === 'draft' ? 'draft' : 'published'
  if (body.remark !== undefined) out.remark = body.remark ? String(body.remark) : null
  if (body.items !== undefined) out.items = normalizeItems(body.items)
  // 讲义正文（富文本 HTML）。改为文档式编辑后它是权威内容；
  // items 仍然保留，仅供旧数据与列表页的「内容构成」参考。
  if (body.content !== undefined) out.content = body.content ? String(body.content) : null
  return out
}

// 标题必填；items 传了就必须是数组（null 会把下游的 .filter 打成 500）。
const validate = (payload, { partial = false } = {}) => {
  if (!partial && (!payload.title || !String(payload.title).trim())) return '讲义标题不能为空'
  if (payload.title !== undefined && !String(payload.title).trim()) return '讲义标题不能为空'
  if (payload.items !== undefined && payload.items === null) return '内容项必须是数组'
  return null
}

// 讲义列表。只回「篇幅统计」（字数/图数/表数）不回正文：
// 整份富文本一页几十条就是几 MB，正文只在编辑页按需取。
exports.list = async (req, res, next) => {
  try {
    const { keyword, page, pageSize } = req.query
    const where = {}
    if (keyword) where.title = { [Op.like]: `%${keyword}%` }

    const pageNum = Math.max(1, Number(page) || 1)
    const size = Math.min(100, Math.max(1, Number(pageSize) || 20))
    const { rows, count } = await Handout.findAndCountAll({
      where,
      order: [['id', 'DESC']],
      limit: size,
      offset: (pageNum - 1) * size
    })
    // 列表页只需要「篇幅统计」，不需要正文。讲义正文是整份富文本，
    // 一页几十份就能到几 MB；统计在这里算好，正文只在编辑页按需取。
    const list = rows.map((row) => {
      const data = row.toJSON()
      const html = String(data.content || '')
      data.contentChars = html
        ? html
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, '')
            .trim().length
        : 0
      data.contentImages = (html.match(/<img\b/gi) || []).length
      data.contentTables = (html.match(/<table\b/gi) || []).length
      delete data.content
      return data
    })
    ok(res, { list, total: count, page: pageNum, pageSize: size })
  } catch (e) {
    next(e)
  }
}

// 新建讲义。
exports.create = async (req, res, next) => {
  try {
    const payload = pick(req.body)
    const err = validate(payload)
    if (err) return fail(res, 40000, err)
    if (payload.title !== undefined) payload.title = payload.title.trim()
    const handout = await Handout.create(payload)
    ok(res, handout, '创建成功')
  } catch (e) {
    next(e)
  }
}

// 取讲义全文（含正文）。
exports.get = async (req, res, next) => {
  try {
    const handout = await Handout.findByPk(req.params.id)
    if (!handout) return fail(res, 40400, '讲义不存在')
    ok(res, handout)
  } catch (e) {
    next(e)
  }
}

// 按项类型取 id 集合（保持存储顺序，由调用方自行按 items 重排）
const idsOf = (items, type) => items.filter((i) => i.type === type).map((i) => i.id)

// 知识点区块：分类本身 + 全部后代分类下的结论（含分类名）。
//
// 改成「一次查询 + 内存分组」：早先是 for 循环里每个区块查一次结论，
// 讲义里放 5 个知识点就是 5 次往返 —— 编辑页每次打开都会触发。
async function resolveKnowledgeBlocks(kIds) {
  if (!kIds.length) return []
  const categories = await KnowledgeCategory.findAll()
  const byId = new Map(categories.map((c) => [c.id, c]))

  // 先算出每个区块要覆盖的分类集合（自身 + 全部后代）
  const families = new Map()
  const allIds = new Set()
  for (const id of kIds) {
    if (!byId.has(id)) continue
    const familyIds = [id]
    let frontier = [id]
    while (frontier.length) {
      const next = categories
        .filter((c) => c.parentId && frontier.includes(c.parentId))
        .map((c) => c.id)
      frontier = next.filter((nid) => !familyIds.includes(nid))
      familyIds.push(...frontier)
    }
    families.set(id, familyIds)
    familyIds.forEach((fid) => allIds.add(fid))
  }
  if (!allIds.size) return []

  const rows = await Conclusion.findAll({
    where: { categoryId: [...allIds] },
    include: [{ model: KnowledgeCategory, as: 'category', attributes: ['id', 'name'] }],
    order: [
      ['categoryId', 'ASC'],
      ['id', 'ASC']
    ]
  })

  // 按分类分组（保持查询顺序，输出与逐块查询时一致）
  const byCategory = new Map()
  for (const row of rows) {
    const key = Number(row.categoryId)
    if (!byCategory.has(key)) byCategory.set(key, [])
    byCategory.get(key).push(row)
  }

  const blocks = []
  for (const [id, familyIds] of families) {
    const conclusions = familyIds.flatMap((fid) => byCategory.get(fid) || [])
    blocks.push({ id, name: byId.get(id).name, conclusions })
  }
  return blocks
}

// 讲义内容解析：把 items 还原为可渲染的完整数据（已删除的题目/结论/分类自动剔除）
exports.getItems = async (req, res, next) => {
  try {
    const handout = await Handout.findByPk(req.params.id)
    if (!handout) return fail(res, 40400, '讲义不存在')
    const items = Array.isArray(handout.items) ? handout.items : []

    const [questions, conclusions, knowledges] = await Promise.all([
      idsOf(items, 'question').length
        ? Question.findAll({ where: { id: idsOf(items, 'question') } })
        : Promise.resolve([]),
      idsOf(items, 'conclusion').length
        ? Conclusion.findAll({
            where: { id: idsOf(items, 'conclusion') },
            include: [{ model: KnowledgeCategory, as: 'category', attributes: ['id', 'name'] }]
          })
        : Promise.resolve([]),
      resolveKnowledgeBlocks(idsOf(items, 'knowledge'))
    ])

    const qMap = new Map(questions.map((q) => [q.id, q]))
    const cMap = new Map(conclusions.map((c) => [c.id, c]))
    const kMap = new Map(knowledges.map((k) => [k.id, k]))
    // 只保留仍存在的项，顺序与存储顺序一致
    const resolvedItems = items.filter(
      (i) =>
        (i.type === 'question' && qMap.has(i.id)) ||
        (i.type === 'conclusion' && cMap.has(i.id)) ||
        (i.type === 'knowledge' && kMap.has(i.id))
    )

    ok(res, { items: resolvedItems, questions, conclusions, knowledges })
  } catch (e) {
    next(e)
  }
}

// 保存讲义。单表更新，不需要事务。
exports.update = async (req, res, next) => {
  try {
    const handout = await Handout.findByPk(req.params.id)
    if (!handout) return fail(res, 40400, '讲义不存在')
    const payload = pick(req.body)
    const err = validate(payload, { partial: true })
    if (err) return fail(res, 40000, err)
    if (payload.title !== undefined) payload.title = payload.title.trim()
    // 单表更新，无需事务
    await handout.update(payload)
    ok(res, handout, '更新成功')
  } catch (e) {
    next(e)
  }
}

// 删除讲义。
exports.remove = async (req, res, next) => {
  try {
    const handout = await Handout.findByPk(req.params.id)
    if (!handout) return fail(res, 40400, '讲义不存在')
    await handout.destroy()
    ok(res, null, '删除成功')
  } catch (e) {
    next(e)
  }
}
