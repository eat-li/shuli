// 图片上传控制器：接收文件流交给存储层（默认本地磁盘，可切 OSS），返回可访问 URL
const crypto = require('crypto')
const storage = require('../storage')
const { ok, fail } = require('../utils/response')

// 允许的图片类型 -> 扩展名
const ALLOWED = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp'
}

// 图片上传：校验类型白名单后落盘/上传，按 日期/UUID 命名避免覆盖。
// 返回 url + thumb + thumbSm 三个字段，缩略图是纯增量字段，老调用方只读 url 也不受影响。
// 本地存储没有图片处理能力，thumb 与 url 相同；切到 OSS 后自动变成缩放后的 WebP。
exports.upload = async (req, res, next) => {
  try {
    if (!req.file) return fail(res, 40000, '未接收到文件')

    const ext = ALLOWED[req.file.mimetype]
    if (!ext) return fail(res, 40000, '仅支持 jpg / png / gif / webp 图片')

    // 按日期分目录 + 唯一文件名，避免重名覆盖
    const now = new Date()
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')}`
    const key = `questions/${day}/${crypto.randomUUID()}${ext}`

    const { url } = await storage.put(key, req.file.buffer, { mime: req.file.mimetype })

    ok(
      res,
      {
        url,
        key,
        thumb: storage.thumbUrl(key, req.file.mimetype, 960),
        thumbSm: storage.thumbUrl(key, req.file.mimetype, 480)
      },
      '上传成功'
    )
  } catch (e) {
    next(e)
  }
}
