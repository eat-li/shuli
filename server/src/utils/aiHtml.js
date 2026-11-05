// AI 输出的确定性处理：HTML 清洗、公式定界符归一、防泄题截断。
//
// 为什么独立成文件：这些规则**不依赖网络与数据库**，却能决定「答案会不会漏进题干」。
// 之前它们和 callChat/streamChat 混在一个 900 行的控制器里，只能靠人工审查，
// 现在抽出来可以逐条单测（见 test/aiHtml.test.js）。

/** 富文本 → 纯文本（拼装题目清单、判定答案标记都用它） */
function plainText(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 清洗 AI 返回的 HTML：去代码块与文档壳、归一化公式定界符、压缩空白 */
function cleanAiHtml(html) {
  let out = String(html || '')
    .trim()
    .replace(/^```(?:html|HTML)?\s*/g, '')
    .replace(/```\s*$/g, '')
    .replace(/<\/?(?:html|body|head)[^>]*>/gi, '')
  // 模型可能用 \(...\) / \[...\] 而非 $...$ / $$...$$，统一转成 KaTeX 约定。
  // 注意内层必须用 [\s\S]*? 而不是 [^()]*?：数学公式里带括号极其常见
  // （如 \((x-2)(x+1)=0\)），排除括号会导致这类公式整段匹配不上、原样留在正文里。
  out = out.replace(/\\\[([\s\S]*?)\\\]/g, (_, inner) => `$$${inner.trim()}$$`)
  out = out.replace(/\\\(([\s\S]*?)\\\)/g, (_, inner) => `$${inner.trim()}$`)
  // 压缩多余空行
  out = out.replace(/\n{3,}/g, '\n\n').trim()
  return out
}

/* ===================== 答案泄漏兜底 ===================== */
// 背景：提示词写得再严，模型偶尔仍会在「题干」里凭空补出一段答案与解析。
// 题干会被题库列表、作业预览、PDF 导出直接展示，答案漏出去等于泄题，
// 所以这里做一道确定性兜底，而不是只靠模型自觉。

// 原文里出现这些字样，说明用户排版的本来就是答案内容（或在题干里提到了答案），不做任何删除
const ANSWER_HINT_RE = /答案|解析|参考解答|参考答案/

// 「整段就是答案」的判定：答案标记必须出现在这一段的开头。
// 不能用「包含」——否则「…求 f(2) 的值。答案：5」这种把答案跟在正文后面的段落会被整段误删。
const ANSWER_HEAD_RE =
  /^\s*(?:【\s*(?:参考)?(?:答案|解析|解答)\s*】|(?:参考)?(?:答案|解析)(?:\s*[：:]|\s*$)|解\s*[：:])/

// 行内答案标记：句末标点或换行之后紧跟「答案：」「解析：」这类字样。
// 第一组捕获句末标点本身，截断时把它留在原地，否则会把正文的句号一起切掉。
const ANSWER_INLINE_RE =
  /((?:[。；;！？!?]|<br\s*\/?>)\s*)(?:(?:<[^>]+>\s*)*(?:【\s*)?(?:参考)?(?:答案|解析)(?:\s*】)?\s*[：:])/

const VOID_TAGS = new Set(['br', 'img', 'hr', 'input', 'meta', 'link', 'source', 'col'])

// 截断很可能切在段落中间，留下未闭合的标签；配平一下，让返回的 HTML 结构完整。
// （模型输出通常是扁平的 p / strong / br，简单栈配平足够）
function balanceTags(html) {
  const open = []
  const re = /<(\/?)([a-zA-Z][\w-]*)(?:\s[^>]*)?>/g
  let m
  while ((m = re.exec(html))) {
    const name = m[2].toLowerCase()
    if (VOID_TAGS.has(name)) continue
    if (m[1] === '/') {
      const i = open.lastIndexOf(name)
      if (i >= 0) open.splice(i, 1)
    } else {
      open.push(name)
    }
  }
  return (
    html +
    open
      .reverse()
      .map((n) => `</${n}>`)
      .join('')
  )
}

/**
 * 去掉模型凭空补出的答案解析；field === 'answer' 时整段内容本来就是答案，直接放行。
 * 返回空串表示「整份结果都是多余的答案」，由调用方报错，避免把答案静默写进题干。
 */
function stripUnrequestedAnswer(sourceText, html, field) {
  if (String(field || '') === 'answer') return html
  if (!html) return html
  // 原文自带答案 → 交给模型按格式规范化，不删
  if (ANSWER_HINT_RE.test(plainText(sourceText))) return html

  // 原文完全没有「答案 / 解析」字样，因此输出里出现的任何一处都是模型自己加的。
  // 先按块级标签切开，从第一段「以答案标记开头」的段落起整体截掉。
  const blocks = html.split(/(?<=<\/(?:p|div|li|h[1-6]|blockquote|td|tr)>)/i)
  let cut = blocks.length
  for (let i = 0; i < blocks.length; i++) {
    if (ANSWER_HEAD_RE.test(plainText(blocks[i]))) {
      cut = i
      break
    }
  }
  let kept = cut < blocks.length ? blocks.slice(0, cut).join('') : html

  // 答案跟在正文同一段里（如「…求 f(2) 的值。答案：5」）时，从标记处截断，句末标点保留
  const inline = ANSWER_INLINE_RE.exec(kept)
  if (inline) kept = kept.slice(0, inline.index + inline[1].length)

  kept = kept.trim()
  return kept ? balanceTags(kept) : ''
}

module.exports = {
  plainText,
  cleanAiHtml,
  balanceTags,
  stripUnrequestedAnswer,
  ANSWER_HINT_RE,
  ANSWER_HEAD_RE,
  ANSWER_INLINE_RE
}
