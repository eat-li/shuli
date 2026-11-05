// 字符串级数学公式渲染：把 HTML 中的 $...$ / $$...$$ 渲染成 KaTeX HTML。
//
// 为什么不用 KaTeX auto-render（DOM 级）：auto-render 按文本节点逐个匹配，
// 多行粘贴的公式会被 <br> 硬换行拆成多个文本节点，$$ 与 $$ 不在同一节点，
// 导致公式整体渲染不出来（表格 \begin{array} 也因此显示为源码）。
// 这里在字符串层面用正则匹配，允许公式内部包含 <br> / <p> 等换行标签，
// 匹配后替换为 KaTeX 渲染结果，任何录入方式都能正确渲染。
import katex from 'katex'
import { escapeHtml } from './format'

// 还原被转义的字符，让 KaTeX 收到的是真 LaTeX 而不是 HTML 实体。
const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

// 公式内部的换行标签替换为空格（LaTeX 对空白不敏感）
const stripBreakTags = (s: string) =>
  s
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?p[^>]*>/gi, ' ')
    .replace(/\s+/g, ' ')

// 调用 KaTeX 渲染单个公式。throwOnError=false：公式写错时保留源码原样显示，
// 不能因为一个 $ 没配对就让整页白屏。
const render = (content: string, displayMode: boolean): string =>
  katex.renderToString(content, { displayMode, throwOnError: false, strict: false })

// 字符串级公式渲染（块级先匹配，行内后匹配）。
// 先 $$ 后 $ 的顺序不能调换：否则 $$…$$ 会被行内规则先吃掉一半，剩下的 $ 再配错位。
// 块级规则允许公式内含 <br>/<p>，这是多行粘贴公式能渲染出来的关键。
export function renderMathInHtml(html: string): string {
  if (!html || !html.includes('$')) return html

  // 1) 块级公式 $$...$$（可跨 <br>/<p> 换行标签；渲染结果不含 $，不会二次匹配）
  let out = html.replace(/\$\$([\s\S]*?)\$\$/g, (raw, inner: string) => {
    // 去掉块内多余的 $（如 $$...$...$$ 的嵌套定界符，AI 生成公式常见），
    // 以及 <br>/<p> 换行标签，再交给 KaTeX 渲染
    const content = decodeEntities(stripBreakTags(inner)).replace(/\$/g, '').trim()
    if (!content) return raw
    return render(content, true)
  })

  // 2) 行内公式 $...$（不跨标签/换行）
  out = out.replace(/\$([^$\n<]+?)\$/g, (raw, inner: string) => {
    const content = decodeEntities(inner).trim()
    if (!content) return raw
    return render(content, false)
  })

  return out
}

// 归一化粘贴文本中的数学公式定界符：
// - LaTeX 的 \[...\] / \(...\) → $$...$$ / $...$（很多资料用的是这种定界符）
// - 把 $$...$$ 块压成单行（去掉内部换行，LaTeX 对空白不敏感）
// - 去掉 $$ 块内多余的 $（嵌套 $...$ 的错误写法）
// 返回与原文本不同则说明做了归一化（供调用方决定是否走自定义插入路径）
export function normalizeMathDelimiters(text: string): string {
  if (!text) return text
  let out = text
  if (out.includes('\\[') || out.includes('\\(')) {
    out = out
      .replace(/\\\[([\s\S]*?)\\\]/g, (_m, inner: string) => `$$${inner.trim()}$$`)
      .replace(/\\\(([\s\S]*?)\\\)/g, (_m, inner: string) => `$${inner.trim()}$`)
  }
  if (out.includes('$$')) {
    out = out.replace(/\$\$([\s\S]*?)\$\$/g, (raw, inner: string) => {
      const clean = inner.replace(/\$/g, '').replace(/\s+/g, ' ').trim()
      return `$$${clean}$$`
    })
  }
  return out
}

// 纯文本 → HTML 段落（空行分段、单换行转 <br>），用于按 HTML 解析插入
export function textToParagraphsHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
}
