// 粘贴 LaTeX 源码时的转换：整篇 \documentclass...\end{document} 或片段 → 富文本 HTML
//
// 为什么需要它：编辑器只认 $...$ / $$...$$，也不认 \documentclass / \usepackage /
// \begin{enumerate} / \item / \section 这些 LaTeX 文档级命令。直接粘进来的话，
// 公式和结构都会原样显示成源码。
//
// 处理顺序（顺序很关键）：
//   1) 去掉导言区与 document 外壳
//   2) 先把数学片段摘成占位符：既把 \(...\)/\[...\] 换成 $...$/$$...$$，
//      又避免后面的结构转换误伤公式内部（比如 \begin{array} 被当成列表环境）
//   3) 转义 HTML 特殊字符（此时生成的标签还没出现）
//   4) 翻译结构命令：标题 / 加粗斜体下划线 / 列表 / 换行 / 注释转义符
//   5) 空行分段、单换行成 <br>
//   6) 还原数学片段（保持未转义，交给 KaTeX 渲染）

// 强特征：出现这些几乎可以确定是 LaTeX 源码，而不是普通文本
const STRONG_RE = /\\documentclass|\\begin\{document\}|\\usepackage|\\end\{document\}/
// 结构性命令：命中 3 个以上也按 LaTeX 处理
const MARKER_RES = [
  /\\item\b/g,
  /\\begin\{[a-z*]+\}/g,
  /\\end\{[a-z*]+\}/g,
  /\\section\*?\{/g,
  /\\subsection\*?\{/g,
  /\\textbf\{/g,
  /\\emph\{/g,
  /\\\(/g,
  /\\\[/g
]
// 已经是块级标签开头的内容不再包 <p>
const BLOCK_START_RE = /^<(h[1-6]|ol|ul|li|p|blockquote|pre|table|div|figure)\b/i
// 把数学片段换成不可见占位符（\u0000M<n>\u0000）。
// 后面的正文处理会大量动反斜杠，若不先摘出来，$…$ 里的 \frac 会被当成 LaTeX 命令改写掉。
const MATH_TOKEN = (i: number) => `\u0000M${i}\u0000`
const MATH_TOKEN_RE = /\u0000M(\d+)\u0000/g

/** 这段粘贴内容看起来是不是 LaTeX 源码 */
export const looksLikeLatex = (text: string): boolean => {
  const t = String(text || '')
  if (!t.trim()) return false
  if (STRONG_RE.test(t)) return true
  let hits = 0
  for (const re of MARKER_RES) hits += (t.match(re) || []).length
  return hits >= 3
}

// 连续 \item 行合并成 <ol>（片段里常常没有 \begin{enumerate} 包裹）
const convertOrphanItems = (text: string): string => {
  const lines = text.split('\n')
  const out: string[] = []
  let items: string[] = [] // 每项可能由多行组成

  // 把累积的 \item 行落成一个 <ol> 并清空缓冲。
  // 遇到非续行就调用它，实现「列表 / 正文」交替时的分段。
  const flush = () => {
    if (!items.length) return
    out.push(
      `<ol>${items.map((s) => `<li>${s.replace(/\n+/g, '<br>').trim()}</li>`).join('')}</ol>`
    )
    items = []
  }

  for (const line of lines) {
    if (/^\s*\\item\b/.test(line)) {
      items.push(line.replace(/^\s*\\item\b\s*/, ''))
      continue
    }
    // 续行：归属于上一个 item
    if (items.length && line.trim() && !BLOCK_START_RE.test(line.trim())) {
      items[items.length - 1] += `\n${line}`
      continue
    }
    flush()
    out.push(line)
  }
  flush()
  return out.join('\n')
}

// \begin{enumerate|itemize|description} → <ol>/<ul>。
// 只处理最外层、不递归嵌套：正则无法可靠配对嵌套环境，贪心匹配反而会吞掉整段。
const convertEnvironments = (text: string): string =>
  text.replace(
    /\\begin\{(enumerate|itemize|description|enumerate\*|itemize\*)\}([\s\S]*?)\\end\{\1\}/g,
    (_m, env: string, body: string) => {
      const tag = env.startsWith('item') ? 'ul' : env.startsWith('description') ? 'ul' : 'ol'
      const items = body
        .split(/\\item\b/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => `<li>${s.replace(/\n+/g, '<br>')}</li>`)
        .join('')
      return `\n<${tag}>${items}</${tag}>\n`
    }
  )

// \section*{X} → <h2>，\subsection → <h3>，\subsubsection → <h4>
const convertSections = (text: string): string =>
  text.replace(/\\(sub)*section\*?\{([^{}]*)\}/g, (_m, sub: string | undefined, title: string) => {
    const level = sub === 'subsub' ? 4 : sub ? 3 : 2
    return `\n<h${level}>${title.trim()}</h${level}>\n`
  })

// 行内命令 \textbf / \emph / \underline / \texttt → 标签。
// 跑两轮是为了剥掉 \textbf{\emph{…}} 这类嵌套——一遍只能处理最外层。
const convertInlineStyles = (text: string): string => {
  // 反复两轮：处理 \textbf{\emph{...}} 这种嵌套
  let out = text
  for (let i = 0; i < 2; i++) {
    out = out
      .replace(/\\textbf\{([^{}]*)\}/g, '<strong>$1</strong>')
      .replace(/\\(?:emph|textit)\{([^{}]*)\}/g, '<em>$1</em>')
      .replace(/\\underline\{([^{}]*)\}/g, '<u>$1</u>')
      .replace(/\\texttt\{([^{}]*)\}/g, '<code>$1</code>')
  }
  return out
}

// 纯文本转义。只处理 & < > 三个字符：文本节点里的引号不会破坏结构，转了反而要多一层反转义。
const escapeHtmlText = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** LaTeX（整篇或片段）→ 编辑器可渲染的 HTML */
export const latexToHtml = (text: string): string => {
  let src = String(text || '').replace(/\r\n?/g, '\n')

  // 1) 去掉导言区与 document 外壳
  if (/\\begin\{document\}/.test(src)) {
    src = src.replace(/^[\s\S]*?\\begin\{document\}/, '')
    src = src.replace(/\\end\{document\}[\s\S]*$/, '')
  }

  // 2) 摘出数学片段：\ \[ \] → $$...$$、\ ( \) → $...$，已有的 $ 形式原样保留
  const math: string[] = []
  // 把数学片段暂存进数组，返回占位符。等 HTML 结构处理完统一还原，保证公式内容逐字不变。
  const keep = (latex: string) => MATH_TOKEN(math.push(latex) - 1)
  src = src
    .replace(/\\\[([\s\S]*?)\\\]/g, (_m, inner: string) => keep(`$$${inner.trim()}$$`))
    .replace(/\\\(([\s\S]*?)\\\)/g, (_m, inner: string) => keep(`$${inner.trim()}$`))
    .replace(/\$\$([\s\S]*?)\$\$/g, (raw) => keep(raw))
    .replace(/\$([^$\n]+?)\$/g, (raw) => keep(raw))

  // 3) LaTeX 注释：% 到行尾（必须放在还原 \% 之前，并且跳过转义的 \%，否则「100\% 及格」会被截断）
  src = src.replace(/(^|[^\\])%.*$/gm, '$1')

  // 4) LaTeX 转义字符还原（\% \& \_ \# \$）
  src = src
    .replace(/\\%/g, '%')
    .replace(/\\&/g, '&')
    .replace(/\\_/g, '_')
    .replace(/\\#/g, '#')
    .replace(/\\\$/g, '$')

  // 5) 文本转义（放到结构转换之前，避免把生成的标签也转义掉）
  src = escapeHtmlText(src)

  // 6) 结构：换行 → 列表环境 → 孤立 \item → 标题 → 行内样式
  //    \\ 换行必须放在 HTML 转义之后，否则生成的 <br> 会被转义成 &lt;br&gt;
  src = src.replace(/\\\\/g, '<br>')
  src = convertEnvironments(src)
  src = convertOrphanItems(src)
  src = convertSections(src)
  src = convertInlineStyles(src)

  // 6) 空行分段、单换行成 <br>；独立成段的块级公式不包 <p>
  const html = src
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) =>
      BLOCK_START_RE.test(chunk) || chunk.startsWith('\u0000M')
        ? chunk
        : `<p>${chunk.replace(/\n/g, '<br>')}</p>`
    )
    .join('')

  // 7) 还原数学片段（不做 HTML 转义，交给 KaTeX）
  return html.replace(MATH_TOKEN_RE, (_m, i: string) => math[Number(i)] || '')
}
