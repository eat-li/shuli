// 阿里云 OSS 存储驱动（可选）
//
// 与本地驱动同一套接口，切换只需改 STORAGE_DRIVER=oss 并补齐 OSS_* 配置。
// 和本地驱动的差别只有两点：
//   1. 能生成缩略图（x-oss-process），本地驱动退化为原图；
//   2. URL 是带域名的绝对地址。
const { client, BASE_URL } = require('../config/oss')

const PREFIX = String(process.env.STORAGE_PATH_PREFIX || '')
  .trim()
  .replace(/^\/+|\/+$/g, '')

const withPrefix = (key) => (PREFIX ? `${PREFIX}/${key}` : key)

// 等比缩到指定宽度 + 转 WebP + 质量 80。
// 原图常是 1–4MB 的手机截图 / Retina 截屏，列表里直出原图是首屏流量的主要来源。
const IMG_PROCESS = (width) =>
  `x-oss-process=image/resize,m_lfit,w_${width}/format,webp/quality,q_80`

function urlFor(key) {
  return `${BASE_URL}/${withPrefix(key)}`
}

/**
 * 缩略图地址。GIF 转 WebP 会丢帧（动图变静图），这类文件退化为原图。
 * 与本地驱动保持同名同参，调用方不必区分驱动。
 */
function thumbUrl(key, mime, width = 960) {
  const base = urlFor(key)
  return mime === 'image/gif' ? base : `${base}?${IMG_PROCESS(width)}`
}

/** 判断 URL 是否指向本 bucket（老数据里可能混着其它存储的地址） */
function ownsUrl(url) {
  if (!url || !BASE_URL) return false
  return url.startsWith(`${BASE_URL}/`)
}

async function put(key, buffer, opts = {}) {
  const fullKey = withPrefix(key)
  await client.put(fullKey, buffer, { mime: opts.mime, headers: opts.headers })
  return { key, url: urlFor(key) }
}

async function remove(key) {
  await client.delete(withPrefix(key))
  return { deleted: true }
}

// ali-oss 的 getStream 解析为 { stream, res }，这里统一成 { stream }
async function getStream(key) {
  const { stream } = await client.getStream(withPrefix(key))
  return { stream }
}

module.exports = {
  driver: 'oss',
  put,
  delete: remove,
  getStream,
  urlFor,
  ownsUrl,
  thumbUrl
}
