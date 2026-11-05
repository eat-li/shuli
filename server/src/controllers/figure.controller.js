// 图形库控制器：只管理图片元数据（文件本体走 POST /upload，交给存储层落盘）
const { Op } = require('sequelize')
const { Figure, Question, Conclusion } = require('../models')
const storage = require('../storage')
const { ok, fail } = require('../utils/response')

const MAX_PAGE_SIZE = 100
const DEFAULT_PAGE_SIZE = 30

// 只保留允许写入的字段
const pick = (body) => {
  const out = {}
  if (body.title !== undefined) out.title = String(body.title).trim().slice(0, 200)
  if (body.url !== undefined) out.url = String(body.url).trim().slice(0, 500)
  if (body.key !== undefined) out.key = body.key ? String(body.key).slice(0, 255) : null
  if (body.width !== undefined) out.width = Math.max(0, Number(body.width) || 0)
  if (body.height !== undefined) out.height = Math.max(0, Number(body.height) || 0)
  if (body.size !== undefined) out.size = Math.max(0, Number(body.size) || 0)
  if (body.tags !== undefined) out.tags = body.tags ? String(body.tags).slice(0, 255) : null
  return out
}

// 列表：按关键字搜名称/关键词，最新的在前（图形库是"最近上传优先"的浏览场景）
exports.list = async (req, res, next) => {
  try {
    const { keyword } = req.query
    const page = Math.max(Number(req.query.page) || 1, 1)
    const pageSize = Math.min(
      Math.max(Number(req.query.pageSize) || DEFAULT_PAGE_SIZE, 1),
      MAX_PAGE_SIZE
    )

    const where = {}
    const kw = String(keyword || '').trim()
    if (kw) {
      where[Op.or] = [{ title: { [Op.like]: `%${kw}%` } }, { tags: { [Op.like]: `%${kw}%` } }]
    }

    const { rows, count } = await Figure.findAndCountAll({
      where,
      order: [['id', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize
    })
    ok(res, { list: rows, total: count, page, pageSize })
  } catch (e) {
    next(e)
  }
}

// 把已上传的图片登记进图形库。名称为空时用日期兜底，避免列表里出现空标题行。
exports.create = async (req, res, next) => {
  try {
    const payload = pick(req.body || {})
    if (!payload.url) return fail(res, 40000, '缺少图片地址')
    // 名称允许为空：前端会退化成上传时间命名，这里兜一下底避免空标题
    if (!payload.title) payload.title = `图形 ${new Date().toISOString().slice(0, 10)}`
    const row = await Figure.create(payload)
    ok(res, row, '已加入图形库')
  } catch (e) {
    next(e)
  }
}

// 只允许改名称与关键词：url / key 由上传决定，改了会让记录指向不存在的文件。
exports.update = async (req, res, next) => {
  try {
    const row = await Figure.findByPk(req.params.id)
    if (!row) return fail(res, 40400, '图片不存在')
    const payload = pick(req.body || {})
    // 图片本体不可改，只允许改名称/关键词
    delete payload.url
    delete payload.key
    if (payload.title !== undefined && !payload.title) {
      return fail(res, 40000, '名称不能为空')
    }
    await row.update(payload)
    ok(res, row, '已保存')
  } catch (e) {
    next(e)
  }
}

// 统计这张图被多少处内容引用：富文本里插入的是 OSS 地址（题干/补充说明/答案解析/结论正文）
async function countReferences(url) {
  if (!url) return 0
  const like = { [Op.like]: `%${url}%` }
  const [questionCount, conclusionCount] = await Promise.all([
    Question.count({
      where: { [Op.or]: [{ title: like }, { body: like }, { answer: like }] }
    }),
    Conclusion.count({ where: { content: like } })
  ])
  return Number(questionCount || 0) + Number(conclusionCount || 0)
}

/**
 * 删除图形库记录。
 * 默认只删记录、保留 OSS 文件；带 with_file=1 时连 OSS 文件一起删。
 * 若这张图已被结论/题目引用，会先返回 { needConfirm: true, refs } 让前端确认，
 * 确认后带 force=1 再调一次才真正删文件。
 */
exports.remove = async (req, res, next) => {
  try {
    const row = await Figure.findByPk(req.params.id)
    if (!row) return fail(res, 40400, '图片不存在')

    // 把 query 里的 1 / true / yes 归一成布尔。带不带值都能用，前端两种写法都出现过。
    const flag = (v) => ['1', 'true', 'yes'].includes(String(v || '').toLowerCase())
    const withFile = flag(req.query.with_file)
    const force = flag(req.query.force)

    const refs = await countReferences(row.url)
    if (withFile && refs > 0 && !force) {
      return ok(
        res,
        { needConfirm: true, refs, ossDeleted: false },
        `该图片已被 ${refs} 处内容引用`
      )
    }

    let ossDeleted = false
    let ossSkipped = false
    let ossError = ''
    if (withFile && row.key) {
      try {
        // 文件可能属于另一种存储（例如老数据在 OSS、当前驱动是本地）：
        // 归属不符时不动文件，只删记录，并如实回报给调用方。
        if (!storage.ownsUrl(row.url)) {
          ossSkipped = true
        } else {
          const { deleted } = await storage.delete(row.key)
          ossDeleted = deleted
        }
      } catch (e) {
        // 删除失败不阻塞记录删除（文件可能早已不存在、或网络抖动），但要如实回报
        ossError = e?.message || String(e)
        console.warn(`[figure] 删除文件失败 ${row.key}: ${ossError}`)
      }
    } else if (withFile) {
      ossSkipped = true // 历史记录没有 key，只能删记录
    }

    await row.destroy()
    const message = ossDeleted ? '已删除图片及其文件' : '已从图形库移除'
    ok(res, { ossDeleted, ossSkipped, ossError, refs, withFile }, message)
  } catch (e) {
    next(e)
  }
}
