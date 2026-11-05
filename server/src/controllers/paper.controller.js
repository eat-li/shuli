// 试卷控制器：只做 HTTP 层——解析请求、调服务、组响应。
//
// 业务规则（分区校验、题序归一化、整卷装配、事务）都在 services/paper.service.js，
// 字段规则在 utils/schemas.js。这个文件里不该再出现 SQL、事务或业务判断。
const { Op } = require('sequelize')
const { Paper } = require('../models')
const { ok, fail } = require('../utils/response')
const { parsePaper } = require('../utils/schemas')
const paperService = require('../services/paper.service')

// 试卷列表：分页 + 关键词，并补上每份卷的题数与总分。
// 题数/总分用一次聚合查出来，避免为每行各查一次。
exports.list = async (req, res, next) => {
  try {
    const { keyword, page, pageSize } = req.query
    const where = {}
    if (keyword) where.title = { [Op.like]: `%${keyword}%` }

    const pageNum = Math.max(1, Number(page) || 1)
    const size = Math.min(100, Math.max(1, Number(pageSize) || 20))
    const { rows, count } = await Paper.findAndCountAll({
      where,
      order: [['id', 'DESC']],
      limit: size,
      offset: (pageNum - 1) * size
    })

    const stats = await paperService.countByPaperIds(rows.map((r) => r.id))
    const list = rows.map((r) => {
      const s = stats.get(Number(r.id))
      return {
        ...r.toJSON(),
        questionCount: s ? s.count : 0,
        scoreSum: s ? s.sum : 0
      }
    })
    ok(res, { list, total: count, page: pageNum, pageSize: size })
  } catch (e) {
    next(e)
  }
}

// 取试卷详情：卷头 + 题目 + 分值快照，由 service 装配。
exports.get = async (req, res, next) => {
  try {
    const paper = await Paper.findByPk(req.params.id)
    if (!paper) return fail(res, 40400, '试卷不存在')
    ok(res, await paperService.assemblePaper(paper))
  } catch (e) {
    next(e)
  }
}

// 建卷：先按 schema 校验卷头，再让 service 校验题目与分区是否匹配。
exports.create = async (req, res, next) => {
  try {
    const { values: payload, error } = parsePaper(req.body)
    if (error) return fail(res, 40000, error)

    const prepared = await paperService.prepareItems(req.body.items || [])
    if (prepared.error) return fail(res, 40000, prepared.error)

    const paper = await paperService.createPaper({ payload, items: prepared.items })
    ok(res, await paperService.assemblePaper(paper), '试卷已保存')
  } catch (e) {
    next(e)
  }
}

// 更新卷：items 不传 = 只改卷头，传了 = 整表替换（与作业题目关联的写法一致）。
exports.update = async (req, res, next) => {
  try {
    const paper = await Paper.findByPk(req.params.id)
    if (!paper) return fail(res, 40400, '试卷不存在')

    const { values: payload, error: parseError } = parsePaper(req.body, { partial: true })
    if (parseError) return fail(res, 40000, parseError)

    // items 不传 = 只改卷头；传了 = 整表替换（与作业题目关联的写法一致）
    let items = null
    if (req.body.items !== undefined) {
      const prepared = await paperService.prepareItems(req.body.items)
      if (prepared.error) return fail(res, 40000, prepared.error)
      items = prepared.items
    }

    await paperService.updatePaper(paper, { payload, items })
    ok(res, await paperService.assemblePaper(paper), '试卷已更新')
  } catch (e) {
    next(e)
  }
}

// 删卷。
exports.remove = async (req, res, next) => {
  try {
    const paper = await Paper.findByPk(req.params.id)
    if (!paper) return fail(res, 40400, '试卷不存在')
    await paperService.removePaper(paper)
    ok(res, null, '试卷已删除')
  } catch (e) {
    next(e)
  }
}

// 复制试卷，返回复制出来的新卷详情。
exports.duplicate = async (req, res, next) => {
  try {
    const paper = await Paper.findByPk(req.params.id)
    if (!paper) return fail(res, 40400, '试卷不存在')
    const copy = await paperService.duplicatePaper(paper)
    ok(res, await paperService.assemblePaper(copy), '已复制')
  } catch (e) {
    next(e)
  }
}
