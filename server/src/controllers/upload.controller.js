// 图片上传控制器：接收文件流并上传到阿里云 OSS，返回可公开访问的 URL
const crypto = require('crypto')
const { client, BASE_URL } = require('../config/oss')
const { ok, fail } = require('../utils/response')

// 允许的图片类型 -> 扩展名
const ALLOWED = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp'
}

// OSS 图片处理串：等比缩到指定宽度 + 转 WebP + 质量 80。
// 原图常是 1–4MB 的手机截图 / Retina 截屏，列表里直出原图是首屏流量的主要来源。
const IMG_PROCESS = (width) =>
  `x-oss-process=image/resize,m_lfit,w_${width}/format,webp/quality,q_80`

// GIF 转 WebP 会丢帧（动图变静图），这类文件缩略图退化为原图。
const thumbOf = (key, mime, width) =>
  mime === 'image/gif' ? `${BASE_URL}/${key}` : `${BASE_URL}/${key}?${IMG_PROCESS(width)}`

// 图片上传：校验类型白名单后直传 OSS，按 日期/UUID 命名避免覆盖。
// 返回 url + thumb + thumbSm 三个字段，缩略图是纯增量字段，老调用方只读 url 也不受影响。
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

    await client.put(key, req.file.buffer, { mime: req.file.mimetype })

    const url = `${BASE_URL}/${key}`
    // thumb / thumbSm 是纯增量字段：只读 url 的老调用方不受影响。
    ok(
      res,
      {
        url,
        key,
        thumb: thumbOf(key, req.file.mimetype, 960),
        thumbSm: thumbOf(key, req.file.mimetype, 480)
      },
      '上传成功'
    )
  } catch (e) {
    next(e)
  }
}
