// 考试类型字典控制器：期末 / 期中 / 月考 / 模拟考 / 小测 …
const crypto = require('crypto')
const { literal } = require('sequelize')
const { ExamType, ExamScore } = require('../models')
const { ok, fail } = require('../utils/response')

const NAME_MAX = 50
// 归一类型名（去空白 + 截断到 50 字）。截断而非报错：超长多半是粘贴带进来的脏字符。
const cleanName = (value) =>
  String(value ?? '')
    .trim()
    .slice(0, NAME_MAX)

// 取类型字典并附上「已被多少条成绩使用」。
// 计数用一次 group by 聚合，避免为每个类型各查一次（N+1）。
exports.list = async (req, res, next) => {
  try {
    const [rows, counts] = await Promise.all([
      ExamType.findAll({
        order: [
          ['sort', 'ASC'],
          ['createdAt', 'ASC']
        ],
        raw: true
      }),
      ExamScore.findAll({
        attributes: ['examType', [literal('COUNT(*)'), 'count']],
        group: ['examType'],
        raw: true
      })
    ])
    const countMap = new Map(counts.map((row) => [row.examType, Number(row.count)]))
    ok(
      res,
      rows.map((row) => ({
        key: row.key,
        name: row.name,
        sort: row.sort,
        count: countMap.get(row.key) || 0
      }))
    )
  } catch (e) {
    next(e)
  }
}

// 新建类型。key 由后端随机生成且永不变更——成绩按 key 关联，
// 让老师看见或修改 key 只会制造断链风险。重名直接拒绝。
exports.create = async (req, res, next) => {
  try {
    const name = cleanName(req.body?.name)
    if (!name) return fail(res, 40000, '类型名称不能为空')
    const exists = await ExamType.findOne({ where: { name } })
    if (exists) return fail(res, 40000, '同名类型已存在')

    // key 只用于引用，不暴露给老师；t_ + 8 位十六进制足够避免碰撞
    let key
    for (;;) {
      key = `t_${crypto.randomBytes(4).toString('hex')}`
      if (!(await ExamType.findByPk(key))) break
    }
    const max = await ExamType.max('sort')
    const row = await ExamType.create({ key, name, sort: (Number(max) || 0) + 10 })
    ok(res, { key: row.key, name: row.name, sort: row.sort, count: 0 }, '类型已创建')
  } catch (e) {
    next(e)
  }
}

// 只允许改显示名，key 保持不变，因此历史成绩不受影响。
exports.update = async (req, res, next) => {
  try {
    const row = await ExamType.findByPk(req.params.key)
    if (!row) return fail(res, 40400, '类型不存在')
    const name = cleanName(req.body?.name)
    if (!name) return fail(res, 40000, '类型名称不能为空')
    if (name !== row.name) {
      const exists = await ExamType.findOne({ where: { name } })
      if (exists) return fail(res, 40000, '同名类型已存在')
      await row.update({ name })
    }
    ok(res, row, '已保存')
  } catch (e) {
    next(e)
  }
}

// 删除前必须确认没有成绩在用：否则这些记录会显示成一个裸 key
exports.remove = async (req, res, next) => {
  try {
    const row = await ExamType.findByPk(req.params.key)
    if (!row) return fail(res, 40400, '类型不存在')

    const used = await ExamScore.count({ where: { examType: row.key } })
    if (used) {
      return fail(res, 40000, `已有 ${used} 条成绩使用「${row.name}」，请先修改或删除这些成绩`)
    }
    const total = await ExamType.count()
    if (total <= 1) return fail(res, 40000, '至少要保留一种考试类型')

    await row.destroy()
    ok(res, null, '类型已删除')
  } catch (e) {
    next(e)
  }
}
