// 富文本里的图片瘦身：把 <img> 换成 OSS 缩略图，并补 lazy / async。
//
// 为什么必须在「渲染时」做而不是「入库时」做：
//   入库的 src 保持原图地址，原始尺寸随时可取（点开预览、导出 PDF 都要原图）；
//   展示时才降级成 960w WebP，同一份数据可以服务列表和详情两种场景。
//
// 为什么相信 width/height 属性：浏览器会用 <img> 的 width/height 属性推导长宽比
// （CSS 规范里的 attr() 映射），因此在 max-width:100% + height:auto 下，
// 图片还没下载完就能占住正确高度——这是消除布局抖动的关键，不是可有可无的冗余属性。
import { thumbUrl } from './imageUrl'

const IMG_TAG_RE = /<img\b[^>]*>/gi

// 构造「匹配某个属性」的正则，用于判断属性是否已存在（存在就替换，不存在才追加）。
const attrRe = (name: string) => new RegExp(`\\s${name}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)`, 'i')

// 读属性值，兼容双引号 / 单引号 / 无引号三种写法——富文本来源不统一，只认双引号会漏读。
const getAttr = (tag: string, name: string): string | null => {
  const re = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')
  const m = re.exec(tag)
  if (!m) return null
  return m[1] ?? m[2] ?? m[3] ?? ''
}

// 写属性值：已有则替换，没有则插到标签收尾之前（同时兼容 `>` 与 `/>` 两种写法）。
const setAttr = (tag: string, name: string, value: string): string => {
  const re = attrRe(name)
  if (re.test(tag)) return tag.replace(re, ` ${name}="${value}"`)
  // 插到标签收尾之前：兼容 `<img …>` 与 `<img … />`
  return tag.replace(/\s*\/?>$/, (tail) => ` ${name}="${value}"${tail}`)
}

/** 宽度档位：列表 / 正文用 960，小卡片可用 480 */
export const rewriteRichImages = (html: string, width = 960): string => {
  if (!html || html.indexOf('<img') === -1) return html
  return html.replace(IMG_TAG_RE, (tag) => {
    let out = tag
    const src = getAttr(out, 'src')
    if (src) out = setAttr(out, 'src', thumbUrl(src, width))
    out = setAttr(out, 'loading', 'lazy')
    out = setAttr(out, 'decoding', 'async')
    return out
  })
}
