// 题干格式归一：去手写题号、归一年份来源行、整段加粗 / 标题 / Markdown 标题残留压成普通段落。
//
// 为什么需要：题库数据来源混杂（手录、粘贴、早期 AI 排版），题干里混着
// 「18.」式题号、「● 2016 上海高考」式加粗来源行、整段粗体、Markdown 标题，
// 同一道题在不同屏幕长得各不相同。题号本就由系统在导出时统一编（paperLayout
// 连续编号），手写题号是纯噪声；来源是元信息，存在时应是一条标准化轻注行。
//
// 只作用于题干：答案 / 解析字段保留自己的强调（<strong>答案：</strong> 等）。
// 幂等：重复调用结果不变，渲染 / 保存 / AI 应用三条链路可安全叠加。
// 安全：本函数只做结构归一，不做消毒；所有渲染出口（RichContent / 导出）
// 都会在其后过 sanitizeRichHtml，与库里其它富文本工具同一约定。

import { escapeStrayLt } from './sanitizeHtml'

const isSourceText = (t: string): boolean =>
  /^(?:19|20)\d{2}/.test(t) && t.length <= 20 && !/[$，。；？！,;?!]/.test(t)

const cleanSourceText = (t: string): string =>
  t
    .replace(/^[●•·▪◦\-*\s]+/, '')
    .replace(/^[（(]\s*/, '')
    .replace(/\s*[)）]$/, '')
    .trim()

// 「2016 上海高考」「2016年上海高考」→「2016·上海高考」
const formatSource = (t: string): string => {
  const m = t.match(/^((?:19|20)\d{2})\s*[·年.\-—]?\s*(.*)$/)
  if (!m) return t
  const rest = m[2].replace(/\s+/g, '')
  return rest ? `${m[1]}·${rest}` : m[1]
}

const sourceParagraph = (text: string): HTMLParagraphElement => {
  const p = document.createElement('p')
  p.className = 're-source'
  p.textContent = text
  return p
}

// 从块开头的文本节点里按正则消费一段前缀（题号可能裹在 <strong>18.</strong> 里，
// 逐文本节点消费比序列化 innerHTML 再正则更稳，不会碰公式与标签结构）。
const stripLeadingMatch = (block: Element, re: RegExp): boolean => {
  const texts: Text[] = []
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
  let acc = ''
  let n: Node | null
  while ((n = walker.nextNode()) && acc.length < 40) {
    texts.push(n as Text)
    acc += n.textContent || ''
  }
  const m = acc.match(re)
  if (!m || !m[0]) return false
  // 整块只有题号时不剥，避免把题干剥空
  if (acc.trim() === m[0].trim()) return false
  let remaining = m[0].length
  for (const t of texts) {
    if (remaining <= 0) break
    const take = Math.min((t.textContent || '').length, remaining)
    t.textContent = (t.textContent || '').slice(take)
    remaining -= take
  }
  block.querySelectorAll('strong, b').forEach((el) => {
    if (!el.textContent?.trim() && !el.querySelector('img')) el.remove()
  })
  return true
}

const LEADING_NUM_RE = /^\s*(?:\d{1,3}\s*[.、．)](?!\d)|[（(]\s*\d{1,3}\s*[)）])\s*/
const INLINE_SOURCE_RE = /^[（(]\s*((?:19|20)\d{2}[^)）]{0,16})\s*[)）]\s*/

/** 题干 HTML → 统一格式（幂等）。非浏览器环境原样返回。 */
export function normalizeStemHtml(html: string): string {
  if (!html || typeof document === 'undefined') return html || ''
  const template = document.createElement('template')
  // 公式里的裸 < 先转义再解析，否则 DOM 会把 $0<r<3$ 当成标签吞掉后半句
  template.innerHTML = escapeStrayLt(html)
  const root = template.content

  // 顶层裸文本包成段落，后续按块处理
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE && (node.textContent || '').trim()) {
      const p = document.createElement('p')
      p.textContent = node.textContent
      root.replaceChild(p, node)
    }
  }

  const blocks = (): Element[] => Array.from(root.children)

  // Markdown 整行加粗残留（**2018 四川模拟**）先剥星号，来源识别才认得
  for (const b of blocks()) {
    const t = (b.textContent || '').trim()
    if (/^\*\*[^*]+\*\*$/.test(t)) b.textContent = t.slice(2, -2)
  }

  let list = blocks()
  const first = list[0]
  if (first) {
    const raw = (first.textContent || '').trim()
    const cleaned = cleanSourceText(raw)
    if (isSourceText(cleaned)) {
      first.replaceWith(sourceParagraph(formatSource(cleaned)))
    } else {
      const m = raw.match(INLINE_SOURCE_RE)
      if (m && isSourceText(cleanSourceText(m[1]))) {
        stripLeadingMatch(first, INLINE_SOURCE_RE)
        first.before(sourceParagraph(formatSource(cleanSourceText(m[1]))))
      }
    }
  }

  // 手写题号只可能出现在首个正文块开头
  list = blocks()
  const firstBody = list.find((b) => !b.classList.contains('re-source'))
  if (firstBody) stripLeadingMatch(firstBody, LEADING_NUM_RE)

  for (const b of blocks()) {
    // 标题压成普通段落：题干不该有标题层级
    if (/^h[1-6]$/i.test(b.tagName)) {
      const p = document.createElement('p')
      while (b.firstChild) p.appendChild(b.firstChild)
      b.replaceWith(p)
      continue
    }
    // 整段被一个 <strong>/<b> 包住 → 剥掉（「有的粗体有的黑体」的根源）
    const only = b.children.length === 1 ? b.children[0] : null
    if (
      only &&
      /^(strong|b)$/i.test(only.tagName) &&
      (b.textContent || '').trim() === (only.textContent || '').trim()
    ) {
      while (only.firstChild) b.appendChild(only.firstChild)
      only.remove()
    }
  }

  // 空壳段落清掉（含 img 的保留；<p><br></p> 是编辑器空壳，一并清）
  for (const b of blocks()) {
    if (!(b.textContent || '').trim() && !b.querySelector('img')) b.remove()
  }

  return template.innerHTML
}