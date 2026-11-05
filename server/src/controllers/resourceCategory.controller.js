// 资料目录控制器（多级；删除目录时资料上移到其父目录，没有父目录则移回「未分类」）
const { literal } = require('sequelize')
const { sequelize, ResourceCategory, Resource } = require('../models')
const { ok, fail } = require('../utils/response')

const NAME_MAX = 50
// 目录名归一（去空白 + 截断 50 字）。
const cleanName = (value) =>
  String(value ?? '')
    .trim()
    .slice(0, NAME_MAX)

// 上级目录：'' / null / undefined 表示顶层；其余必须是已存在的目录
async function resolveParent(value) {
  if (value === undefined || value === null || value === '') return { parentId: null }
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) return { error: '上级目录不合法' }
  const exists = await ResourceCategory.findByPk(id, { attributes: ['id'] })
  if (!exists) return { error: '上级目录不存在' }
  return { parentId: id }
}

// 同级重名判断：顶层（parent_id IS NULL）也要拦住
async function nameTaken(name, parentId, excludeId = null) {
  const where = { name, parentId }
  const row = await ResourceCategory.findOne({ where })
  return Boolean(row && row.id !== excludeId)
}

// 把扁平目录行整理成「父 → 子 id 列表」，并准备一个缓存表供子树计数使用。
function buildTreeMaps(rows) {
  const children = new Map()
  const counts = new Map()
  for (const row of rows) {
    const key = row.parentId ?? null
    if (!children.has(key)) children.set(key, [])
    children.get(key).push(row.id)
  }
  return { children, counts }
}

// 返回目录列表与总数：左侧目录树要显示「全部 / 未分类」与每棵子树的计数，
// 这里一次算清，免得前端再发一轮统计请求。
exports.list = async (req, res, next) => {
  try {
    const [rows, directCounts] = await Promise.all([
      ResourceCategory.findAll({ order: [['id', 'ASC']], raw: true }),
      Resource.findAll({
        attributes: ['categoryId', [literal('COUNT(*)'), 'count']],
        group: ['categoryId'],
        raw: true
      })
    ])
    const countMap = new Map(
      directCounts.map((row) => [
        row.categoryId == null ? null : Number(row.categoryId),
        Number(row.count)
      ])
    )

    const { children, counts } = buildTreeMaps(rows)
    // 子树资料数：选中上级目录时列表包含所有后代，计数必须与之一致
    const subtreeTotal = (id) => {
      if (counts.has(id)) return counts.get(id)
      let sum = countMap.get(id) || 0
      for (const childId of children.get(id) || []) sum += subtreeTotal(childId)
      counts.set(id, sum)
      return sum
    }
    const list = rows.map((row) => ({
      ...row,
      count: countMap.get(row.id) || 0,
      totalCount: subtreeTotal(row.id)
    }))

    ok(res, {
      list,
      uncategorized: countMap.get(null) || 0,
      total:
        rows.reduce((sum, row) => sum + (countMap.get(row.id) || 0), 0) + (countMap.get(null) || 0)
    })
  } catch (e) {
    next(e)
  }
}

// 新建目录。上级必须已存在，且同级不允许重名——同一层两个同名目录在树里无法区分。
exports.create = async (req, res, next) => {
  try {
    const name = cleanName(req.body?.name)
    if (!name) return fail(res, 40000, '目录名称不能为空')
    const parent = await resolveParent(req.body?.parentId)
    if (parent.error) return fail(res, 40000, parent.error)
    if (await nameTaken(name, parent.parentId)) return fail(res, 40000, '同级目录下已有同名目录')
    const row = await ResourceCategory.create({ name, parentId: parent.parentId })
    ok(res, row, '目录已创建')
  } catch (e) {
    next(e)
  }
}

// 只允许改名。换父级会让一整棵子树的路径变化，属于高风险操作，这里不开放。
exports.update = async (req, res, next) => {
  try {
    const row = await ResourceCategory.findByPk(req.params.id)
    if (!row) return fail(res, 40400, '目录不存在')
    const name = cleanName(req.body?.name)
    if (!name) return fail(res, 40000, '目录名称不能为空')
    if (name !== row.name) {
      if (await nameTaken(name, row.parentId, row.id)) {
        return fail(res, 40000, '同级目录下已有同名目录')
      }
      await row.update({ name })
    }
    ok(res, row, '已保存')
  } catch (e) {
    next(e)
  }
}

// 删目录不删资料：有子目录先拦住（避免一次误删整棵树）；
// 没有子目录时把资料移到上级目录，顶层目录的资料移回未分类。
exports.remove = async (req, res, next) => {
  try {
    const row = await ResourceCategory.findByPk(req.params.id)
    if (!row) return fail(res, 40400, '目录不存在')

    const childCount = await ResourceCategory.count({ where: { parentId: row.id } })
    if (childCount) {
      return fail(res, 40000, `该目录下还有 ${childCount} 个子目录，请先删除子目录`)
    }

    const parent = row.parentId
      ? await ResourceCategory.findByPk(row.parentId, { attributes: ['id', 'name'] })
      : null
    const targetId = parent ? parent.id : null

    let moved = 0
    await sequelize.transaction(async (t) => {
      const [affected] = await Resource.update(
        { categoryId: targetId },
        { where: { categoryId: row.id }, transaction: t }
      )
      moved = affected
      await row.destroy({ transaction: t })
    })
    const target = parent ? `「${parent.name}」` : '「未分类」'
    ok(
      res,
      { moved, movedTo: targetId },
      moved ? `目录已删除，${moved} 份资料移到${target}` : '目录已删除'
    )
  } catch (e) {
    next(e)
  }
}
