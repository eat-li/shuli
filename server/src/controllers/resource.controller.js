// 资料库控制器：文件本体直传 OSS，这里管理元数据与分类
const crypto = require('crypto')
const archiver = require('archiver')
const { Op } = require('sequelize')
const { Resource, ResourceCategory } = require('../models')
const storage = require('../storage')
const { ok, fail } = require('../utils/response')

const MAX_PAGE_SIZE = 100
const DEFAULT_PAGE_SIZE = 30
// 一次打包的文件数上限：几百个并发 OSS 读会把带宽/句柄打满
const MAX_BATCH_DOWNLOAD = 200

// 扩展名白名单：只收常用文档、图片与压缩包。
// 不做「什么都能传」是有意的 —— 公开 OSS 桶里出现 .exe/.html 这类文件，
// 一旦链接被转发出去就是钓鱼载体；扩展名在服务端归一化后再判断，不信任 mimetype。
const TYPES = {
  '.pdf': { mime: 'application/pdf', inline: true },
  '.doc': { mime: 'application/msword' },
  '.docx': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  '.ppt': { mime: 'application/vnd.ms-powerpoint' },
  '.pptx': { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  '.xls': { mime: 'application/vnd.ms-excel' },
  '.xlsx': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  '.txt': { mime: 'text/plain; charset=utf-8' },
  '.md': { mime: 'text/markdown; charset=utf-8' },
  '.csv': { mime: 'text/csv; charset=utf-8' },
  '.zip': { mime: 'application/zip' },
  '.jpg': { mime: 'image/jpeg', inline: true },
  '.jpeg': { mime: 'image/jpeg', inline: true },
  '.png': { mime: 'image/png', inline: true },
  '.gif': { mime: 'image/gif', inline: true },
  '.webp': { mime: 'image/webp', inline: true }
}

// 取小写扩展名（含点）。没有扩展名返回空串，由调用方按「不支持的类型」拒绝。
const extOf = (name) => {
  const hit = /(\.[^.]+)$/.exec(String(name || '').trim())
  return hit ? hit[1].toLowerCase() : ''
}

// RFC 5987：中文文件名不能直接塞进 Content-Disposition，否则下载后是乱码
const rfc5987 = (name) =>
  encodeURIComponent(name).replace(
    /['()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`
  )

// 去空白 + 截断。资料标题 / 备注来自手输与粘贴，长度不可控。
const trim = (value, max) =>
  String(value ?? '')
    .trim()
    .slice(0, max)

// 分类：'' / null 表示未分类；显式给了数字就必须存在（否则外键兜底成 500）
async function resolveCategory(value) {
  if (value === undefined) return { skip: true }
  if (value === null || value === '') return { categoryId: null }
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) return { error: '分类不合法' }
  const exists = await ResourceCategory.findByPk(id)
  if (!exists) return { error: '所选分类不存在' }
  return { categoryId: id }
}

// 目录树里选中上级目录时，列表要包含所有后代目录的资料
async function categorySubtreeIds(rootId) {
  const rows = await ResourceCategory.findAll({ attributes: ['id', 'parentId'], raw: true })
  const children = new Map()
  for (const row of rows) {
    const key = row.parentId ?? null
    if (!children.has(key)) children.set(key, [])
    children.get(key).push(row.id)
  }
  const ids = []
  const stack = [rootId]
  while (stack.length) {
    const id = stack.pop()
    ids.push(id)
    for (const childId of children.get(id) || []) stack.push(childId)
  }
  return ids
}

// 资料列表：关键词、分类（含子树）、类型多维筛选 + 分页。
// 分页参数在这里夹取范围，避免 pageSize=100000 之类的请求把整表读出来。
exports.list = async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1)
    const pageSize = Math.min(
      Math.max(Number(req.query.pageSize) || DEFAULT_PAGE_SIZE, 1),
      MAX_PAGE_SIZE
    )

    const where = {}
    const keyword = trim(req.query.keyword, 100)
    if (keyword) {
      where[Op.or] = [
        { title: { [Op.like]: `%${keyword}%` } },
        { originalName: { [Op.like]: `%${keyword}%` } },
        { remark: { [Op.like]: `%${keyword}%` } }
      ]
    }
    if (req.query.categoryId === 'none') {
      where.categoryId = null
    } else if (req.query.categoryId !== undefined && req.query.categoryId !== '') {
      const cid = Number(req.query.categoryId)
      if (Number.isInteger(cid) && cid > 0) {
        where.categoryId = { [Op.in]: await categorySubtreeIds(cid) }
      }
    }

    const { rows, count } = await Resource.findAndCountAll({
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

// zip 内的文件名：去掉 Windows 不允许的字符；重名按「名字 (1).ext」递增
function zipEntryName(raw, used) {
  const cleaned =
    String(raw || 'file')
      .replace(/[\u0000-\u001f\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180) || 'file'
  const dot = cleaned.lastIndexOf('.')
  const stem = dot > 0 ? cleaned.slice(0, dot) : cleaned
  const ext = dot > 0 ? cleaned.slice(dot) : ''
  let name = cleaned
  let i = 1
  while (used.has(name.toLowerCase())) name = `${stem} (${i++})${ext}`
  used.add(name.toLowerCase())
  return name
}

// 勾选多个文件后打包下载：文件逐个从 OSS 取流写进 zip，不在内存里攒整包
exports.batchDownload = async (req, res, next) => {
  try {
    const ids = String(req.query.ids || '')
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((v) => Number.isInteger(v) && v > 0)
    const wanted = [...new Set(ids)]
    if (!wanted.length) return fail(res, 40000, '请选择要下载的文件')
    if (wanted.length > MAX_BATCH_DOWNLOAD) {
      return fail(res, 40000, `一次最多下载 ${MAX_BATCH_DOWNLOAD} 个文件`)
    }

    const rows = await Resource.findAll({ where: { id: { [Op.in]: wanted } } })
    if (!rows.length) return fail(res, 40400, '文件不存在')

    const date = new Date().toISOString().slice(0, 10)
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="resources-${date}.zip"; filename*=UTF-8''${rfc5987(`资料库-${date}.zip`)}`
    )

    // store: true（只打包不压缩）：资料多是已压缩的 PDF/图片/Office 包，deflate 收益很小，
    // 却会让"已接收字节 / 原文件总大小"的进度条严重偏低；不压缩还能省掉打包 CPU。
    const archive = archiver('zip', { store: true })
    // 响应头已经发出，出错时不能再走 next(e)（会把 JSON 拼进 zip），只断流
    archive.on('error', (e) => {
      console.warn('[resource] 打包失败:', e?.message || e)
      res.destroy(e)
    })
    archive.pipe(res)

    const used = new Set()
    for (const row of rows) {
      if (!row.key) continue
      try {
        const { stream } = await storage.getStream(row.key)
        stream.on('error', (e) => {
          console.warn('[resource] 读取文件失败:', row.key, e?.message || e)
          archive.destroy(e)
        })
        archive.append(stream, { name: zipEntryName(row.originalName || row.title, used) })
      } catch (e) {
        // 单个文件读不到不拖垮整包
        console.warn('[resource] 读取文件失败:', row.key, e?.message || e)
      }
    }
    await archive.finalize()
  } catch (e) {
    if (res.headersSent) {
      res.destroy(e)
      return
    }
    next(e)
  }
}

// 上传资料：按扩展名白名单定 mime 与「内联还是下载」，再直传 OSS。
// 文件名先剥掉控制字符——它要进 Content-Disposition，带换行会造成响应头注入。
// 文档强制 attachment + RFC 5987 编码，否则中文名下载下来是乱码。
exports.upload = async (req, res, next) => {
  try {
    if (!req.file) return fail(res, 40000, '未接收到文件')

    // 去掉控制字符：文件名会进 Content-Disposition，不能带换行
    const originalName = String(req.file.originalname || '')
      .replace(/\p{Cc}/gu, '')
      .trim()
      .slice(0, 255)
    const ext = extOf(originalName)
    const type = TYPES[ext]
    if (!type) {
      return fail(
        res,
        40000,
        `不支持的文件类型${ext ? `（${ext}）` : ''}：仅支持 PDF / Word / PPT / Excel / 文本 / 图片 / zip`
      )
    }

    const category = await resolveCategory(req.body?.categoryId)
    if (category.error) return fail(res, 40000, category.error)

    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const key = `resources/${month}/${crypto.randomUUID()}${ext}`

    // 文档存成「附件」下载，文件名用原始名；图片与 PDF 保持内联，方便直接预览。
    const headers = {}
    if (!type.inline) {
      headers['Content-Disposition'] = `attachment; filename*=UTF-8''${rfc5987(originalName)}`
    }
    await storage.put(key, req.file.buffer, { mime: type.mime, headers })

    const row = await Resource.create({
      title: trim(req.body?.title, 200) || originalName,
      originalName,
      ext,
      mime: type.mime,
      size: req.file.size || req.file.buffer.length,
      url: storage.urlFor(key),
      key,
      categoryId: category.skip ? null : category.categoryId,
      remark: trim(req.body?.remark, 500) || null
    })
    ok(res, row, '已上传')
  } catch (e) {
    next(e)
  }
}

// 改资料元数据（标题 / 备注 / 分类），不动 OSS 文件。
exports.update = async (req, res, next) => {
  try {
    const row = await Resource.findByPk(req.params.id)
    if (!row) return fail(res, 40400, '资料不存在')

    const patch = {}
    if (req.body?.title !== undefined) {
      const title = trim(req.body.title, 200)
      if (!title) return fail(res, 40000, '标题不能为空')
      patch.title = title
    }
    if (req.body?.remark !== undefined) {
      patch.remark = trim(req.body.remark, 500) || null
    }
    if (req.body?.categoryId !== undefined) {
      const category = await resolveCategory(req.body.categoryId)
      if (category.error) return fail(res, 40000, category.error)
      patch.categoryId = category.categoryId
    }
    if (!Object.keys(patch).length) return fail(res, 40000, '没有需要修改的内容')

    await row.update(patch)
    ok(res, row, '已保存')
  } catch (e) {
    next(e)
  }
}

// 删除：先删记录再删 OSS 对象。
// 反过来的话，OSS 删除成功而数据库删除失败会留下「点开 404」的条目。
exports.remove = async (req, res, next) => {
  try {
    const row = await Resource.findByPk(req.params.id)
    if (!row) return fail(res, 40400, '资料不存在')
    const key = row.key
    await row.destroy()
    if (key) {
      try {
        await storage.delete(key)
      } catch (e) {
        // 对象没删掉只是占一点存储，不该让用户看到「删除失败」却已经没有记录
        console.warn('[resource] 删除文件失败:', e?.message || e)
      }
    }
    ok(res, null, '已删除')
  } catch (e) {
    next(e)
  }
}
