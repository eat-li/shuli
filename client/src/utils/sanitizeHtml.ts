import DOMPurify from 'dompurify'

const ALLOWED_TAGS = [
  'p',
  'br',
  'hr',
  'div',
  'span',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'strike',
  'ul',
  'ol',
  'li',
  'blockquote',
  'code',
  'pre',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'img',
  'a',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'sub',
  'sup',
  'figure',
  'figcaption',
  'section',
  'header',
  'footer',
  'article',
  'main'
]

const ALLOWED_ATTR = [
  'href',
  'src',
  'alt',
  'title',
  'width',
  'height',
  'target',
  'rel',
  'class',
  'style',
  'colspan',
  'rowspan',
  'start',
  'type'
]

export interface SanitizeHtmlOptions {
  allowStyle?: boolean
}

// 白名单放行了 style 属性，但 style 里仍可能藏 javascript: / expression() 这类注入。
// 用模板元素解析后逐个检查，命中就整条 style 移除——只删危险声明太容易漏掉变形写法。
function scrubStyleValues(html: string): string {
  if (!html || typeof document === 'undefined') return html || ''
  const template = document.createElement('template')
  template.innerHTML = html
  for (const el of Array.from(template.content.querySelectorAll<HTMLElement>('[style]'))) {
    const style = el.getAttribute('style') || ''
    const unsafe =
      /(?:javascript\s*:|vbscript\s*:|expression\s*\(|url\s*\(\s*['"]?\s*(?:javascript|vbscript)\s*:)/i
    if (unsafe.test(style)) el.removeAttribute('style')
  }
  return template.innerHTML
}

// 白名单里的标签名（带闭合 `/` 与自闭合判断）。判定「这个 < 到底是标签还是小于号」。
// 判定只看「像不像标签」，不看白名单：<script> 也必须保持是标签，
// 否则会被转义成可见文本，消毒器认不出来，页面上还会留下 "<script>" 字样。
const KNOWN_TAG_START_RE = /^(?:\/?[a-zA-Z][a-zA-Z0-9:-]*[\s/>]|!)/

/**
 * 把「不像标签开头」的 `<` 转义成 `&lt;`。
 *
 * 数学公式里的 `<` 是不转义的裸字符，直接交给 DOM 解析会被当成标签开头：
 * `$...(0<r<3)$，点 $P$…` 会变成「伪造标签 + 一串属性」，渲染只剩前半句，
 * 而且看不出是哪一步丢的。HTTP 层面没有任何报错，只有肉眼能发现。
 */
export function escapeStrayLt(html: string): string {
  if (!html) return html || ''
  let out = ''
  let cursor = 0
  for (;;) {
    const idx = html.indexOf('<', cursor)
    if (idx < 0) {
      out += html.slice(cursor)
      break
    }
    out += html.slice(cursor, idx)
    // 标签名最长十几个字符，24 个足够做前缀判断
    const ahead = html.slice(idx + 1, idx + 25)
    out += KNOWN_TAG_START_RE.test(ahead) ? '<' : '&lt;'
    cursor = idx + 1
  }
  return out
}

// 富文本消毒唯一出口：按白名单过滤标签与属性，并禁用 script/style/iframe/form 等整类标签。
// allowStyle=false 用于「只读站、导出」这类不需要行内样式的场景，能进一步收窄攻击面。
export function sanitizeHtml(html: string, options: SanitizeHtmlOptions = {}): string {
  if (!html || typeof window === 'undefined') return html || ''

  // 解析前先把「不像标签」的裸 < 转义掉。数学公式里的小于号是不转义的，
  // 而浏览器会把它当成标签开头，一路吞到下一个 >——`(0<r<3)` 足以让整句后半段消失。
  // 服务端 utils/aiHtml.js 的 escapeStrayLt 是同一套规则（那边管落库，这里管渲染，
  // 兼顾修复改造前已经存进库里的脏数据）。
  const escaped = escapeStrayLt(html)

  const allowStyle = options.allowStyle !== false
  const clean = DOMPurify.sanitize(escaped, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: allowStyle ? ALLOWED_ATTR : ALLOWED_ATTR.filter((attr) => attr !== 'style'),
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['target'],
    FORBID_TAGS: [
      'script',
      'style',
      'iframe',
      'object',
      'embed',
      'link',
      'meta',
      'template',
      'form',
      'input',
      'button',
      'textarea',
      'select',
      'option',
      'video',
      'audio'
    ]
  })

  return allowStyle ? scrubStyleValues(clean) : clean
}

// 不需要行内样式的场景的快捷入口（只读站正文展示、导出纯排版内容）。
export const sanitizeRichHtml = (html: string): string => sanitizeHtml(html, { allowStyle: false })

/**
 * 给裸 <table> 套一层横向滚动容器。
 *
 * 编辑器里插入的表格（以及老数据里手写的）是裸 <table>，没有这层包裹时
 * 宽表格会把整页撑出横向滚动条——手机上尤其明显。Markdown 转换来的表格
 * 已经在 utils/markdownTable.ts 里包好了，这里兜住剩下的那些。
 *
 * 用 DOM 而不是正则：正则替换 <table>…</table> 碰到嵌套表格就会错位。
 */
export function wrapRichTables(html: string): string {
  if (!html || typeof document === 'undefined') return html || ''
  const template = document.createElement('template')
  template.innerHTML = html
  for (const table of Array.from(template.content.querySelectorAll('table'))) {
    const parent = table.parentElement
    if (parent?.classList.contains('tableWrapper')) continue
    const wrap = document.createElement('div')
    wrap.className = 'tableWrapper'
    parent?.insertBefore(wrap, table)
    wrap.appendChild(table)
  }
  return template.innerHTML
}
