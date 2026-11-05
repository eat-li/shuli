// 作业分类控制器
// list 一次性返回「每个分类下的作业数」与「未分类作业数」——卡片要显示数量，
// 若让前端逐类再请求一次，分类一多就是 N+1 次往返。
const { sequelize, HomeworkCategory, Homework } = require('../models')
const { ok, fail } = require('../utils/response')

const STATUSES = ['draft', 'published', 'closed']

// 归一化输入字段，只保留允许写入的键。
// isDefault 刻意不在这里：默认分类必须走 setDefault，否则「至多一个默认」的
// 不变量就得在通用更新接口里再实现一遍排他逻辑，两处迟早会不一致。
const pick = (body = {}) => {
  const out = {}
  if (body.name !== undefined) out.name = String(body.name).slice(0, 50)
  if (body.sort !== undefined) out.sort = Number(body.sort) || 0
  if (body.remark !== undefined) out.remark = body.remark ? String(body.remark).slice(0, 255) : null
  return out
}

// 列表 + 计数。可选 ?status=published ——「浏览作业」页只统计已发布作业，
// 否则卡片上的数字会和下方列表对不上。
exports.list = async (req, res, next) => {
  try {
    const { status } = req.query
    if (status !== undefined && status !== '' && !STATUSES.includes(status)) {
      return fail(res, 40000, '作业状态不合法')
    }
    const where = status ? { status } : {}

    const [rows, grouped] = await Promise.all([
      HomeworkCategory.findAll({
        order: [
          ['sort', 'ASC'],
          ['id', 'ASC']
        ]
      }),
      Homework.findAll({
        // 显式取别名，raw 模式下返回的键才稳定是 categoryId / count
        attributes: [
          [sequelize.col('category_id'), 'categoryId'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        where,
        group: ['category_id'],
        raw: true
      })
    ])

    const countByCategory = new Map()
    let uncategorized = 0
    for (const g of grouped) {
      const n = Number(g.count) || 0
      if (g.categoryId == null) uncategorized = n
      else countByCategory.set(Number(g.categoryId), n)
    }

    const list = rows.map((r) => ({ ...r.toJSON(), count: countByCategory.get(r.id) || 0 }))
    // total 是「全部」卡片上的数字，必须包含未分类，否则和作业总数不一致
    const total = list.reduce((sum, c) => sum + c.count, 0) + uncategorized
    // 直接把默认分类 id 一并给出：两个页面都要用它决定初始视图，
    // 让前端各自去 find 一遍等于把同一段推导写两遍。
    const defaultCategoryId = list.find((c) => c.isDefault)?.id ?? null

    ok(res, { list, total, uncategorized, defaultCategoryId })
  } catch (e) {
    next(e)
  }
}

// 新建作业分类。同名直接拒：卡片上两个一样的入口，用户无法分辨该点哪个。
exports.create = async (req, res, next) => {
  try {
    const payload = pick(req.body)
    if (!payload.name || !payload.name.trim()) return fail(res, 40000, '分类名不能为空')
    payload.name = payload.name.trim()

    // 同名分类会让卡片出现两个看起来一样的入口，直接挡掉
    const exists = await HomeworkCategory.findOne({ where: { name: payload.name } })
    if (exists) return fail(res, 40000, '已存在同名分类')

    const category = await HomeworkCategory.create(payload)
    ok(res, category, '创建成功')
  } catch (e) {
    next(e)
  }
}

// 改名 / 改排序。重名检查排除自身，否则「只改排序」也会被误判为重复。
exports.update = async (req, res, next) => {
  try {
    const category = await HomeworkCategory.findByPk(req.params.id)
    if (!category) return fail(res, 40400, '分类不存在')

    const payload = pick(req.body)
    if (payload.name !== undefined) {
      if (!payload.name.trim()) return fail(res, 40000, '分类名不能为空')
      payload.name = payload.name.trim()
      const dup = await HomeworkCategory.findOne({ where: { name: payload.name } })
      if (dup && dup.id !== category.id) return fail(res, 40000, '已存在同名分类')
    }

    await category.update(payload)
    ok(res, category, '更新成功')
  } catch (e) {
    next(e)
  }
}

// 分类下还有作业时拒绝删除，避免一批作业被静默降级成「未分类」。
// 删掉的若是默认分类无需清理：is_default 属于这一行，行没了默认自然消失。
exports.remove = async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const category = await HomeworkCategory.findByPk(id)
    if (!category) return fail(res, 40400, '分类不存在')

    // 关联保护：分类下还有作业时禁止删除，避免一批作业被静默变成未分类
    const homeworkCount = await Homework.count({ where: { categoryId: id } })
    if (homeworkCount > 0) {
      return fail(res, 40000, `该分类下还有 ${homeworkCount} 份作业，请先移出或删除这些作业`)
    }

    // 删掉的正好是默认分类时无需额外清理：is_default 是这一行自己的字段，
    // 行没了默认自然就没了，不会留下指向不存在分类的悬空配置。
    await category.destroy()
    ok(res, null, '删除成功')
  } catch (e) {
    next(e)
  }
}

// 设置 / 取消默认分类。
// 不走通用 PUT /:id 而是单开一个动作接口：把「至多一个默认」这个不变量
// 收在同一个事务里，先清空再置位，任何时刻都不会出现两个默认。
exports.setDefault = async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const category = await HomeworkCategory.findByPk(id)
    if (!category) return fail(res, 40400, '分类不存在')

    // 不传 isDefault 视为「设为默认」；显式传 false 表示取消
    const on = req.body?.isDefault === undefined ? true : !!req.body.isDefault

    await sequelize.transaction(async (t) => {
      await HomeworkCategory.update(
        { isDefault: false },
        { where: { isDefault: true }, transaction: t }
      )
      if (on) {
        await HomeworkCategory.update({ isDefault: true }, { where: { id }, transaction: t })
      }
    })

    const fresh = await HomeworkCategory.findByPk(id)
    ok(res, fresh, on ? '已设为默认分类' : '已取消默认分类')
  } catch (e) {
    next(e)
  }
}
