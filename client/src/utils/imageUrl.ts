// 粘贴内容识别：把「整段就是一个图片地址」的粘贴转成图片节点
// 支持两种形态：
//   1) 纯链接：https://…/x.png（可带 ?x-oss-process=… 参数或 #锚点）
//   2) Markdown 图片：![alt](https://…/x.png)
// 只认「整段匹配」——正文里夹着的普通超链接保持原样，避免误判成图片。
const PLAIN_RE = /^https?:\/\/[^\s<>"']+\.(?:png|jpe?g|gif|webp|bmp|svg)(?:[?#][^\s<>"']*)?$/i
const MD_RE = /^!\[[^\]]*\]\(\s*(https?:\/\/[^\s)]+?)\s*\)$/

// 判断整段粘贴内容是否「就是一张图」，是则返回图片地址。
// 只认整段匹配：正文里夹带的普通超链接必须保持原样，误判会让用户丢内容。
export const matchImageUrl = (text: string): string | null => {
  const raw = String(text || '').trim()
  if (!raw) return null
  const md = MD_RE.exec(raw)
  if (md) return md[1]
  return PLAIN_RE.test(raw) ? raw : null
}

/* ===================== OSS 缩略图 ===================== */

// 与 server/src/controllers/upload.controller.js 的 IMG_PROCESS 保持一致
const IMG_PROCESS = (width: number) =>
  `x-oss-process=image/resize,m_lfit,w_${width}/format,webp/quality,q_80`

// 私有桶的签名参数：拼 x-oss-process 会让签名失效（403），这种情况原样透传。
const SIGNED_RE = /[?&](?:Signature|OSSAccessKeyId|security-token)=/i

/**
 * 把 OSS 原图地址转成指定宽度的 WebP 缩略图地址。
 * 非 OSS 域名（自建桶 / 换存储商 / 第三方图）一律原样返回，功能降级但不报错。
 */
export const thumbUrl = (url: string, width = 960): string => {
  const raw = String(url || '').trim()
  if (!raw || !/^https?:\/\//i.test(raw)) return raw
  if (!/aliyuncs\.com/i.test(raw)) return raw
  if (SIGNED_RE.test(raw)) return raw
  const base = raw.split('?')[0].split('#')[0]
  return `${base}?${IMG_PROCESS(width)}`
}
