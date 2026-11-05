// 题型推断：从题干富文本 + 选项数组反推题型，避免每题手选。
// 只做三种类型（choice/fill/solve）—— 系统不自动判卷，单选/多选/判断在教学上没有
// 行为差异，刻意不再细分（见 GLOSSARY.md「题型」条目）。

export type InferredType = 'choice' | 'fill' | 'solve'

/** 把富文本拆成「行」：块级标签与 <br> 当作换行，其余标签剥掉 */
const toLines = (html: string): string[] =>
  (html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .split('\n')

/**
 * 行首的选项标记：A. / A、 / A． / A)
 * 只要字母，不管后面是什么内容 —— 选项文字本身就是题干的一部分。
 */
const LEADING_OPTION = /^\s*([A-Za-z])\s*[.、．)）]/

/**
 * 是否像选择题。
 * 要求 A 和 B 同时出现：题干里「点 A 与点 B 的距离」这类表述只有单个字母，
 * 只认一个会把大量解答题误判成选择题。
 */
const looksLikeChoice = (lines: string[]): boolean => {
  const letters = new Set<string>()
  for (const line of lines) {
    const m = line.match(LEADING_OPTION)
    if (m) letters.add(m[1].toUpperCase())
    if (letters.has('A') && letters.has('B')) return true
  }
  return false
}

/** 选项数组里真正有内容的项数 ≥ 2 就算选择题（选项存的是字符串或对象） */
const optionCount = (options: unknown): number => {
  if (!Array.isArray(options)) return 0
  return options.filter((o) => {
    const text = typeof o === 'string' ? o : o && typeof o === 'object' ? JSON.stringify(o) : ''
    return text.replace(/\s|&nbsp;/g, '').length > 0
  }).length
}

// 占位空：连续下划线（半角/全角）、空括号、空下划线标签
const BLANK_UNDERSCORES = /(_{2,}|＿{2,})/
const EMPTY_PAREN = /（\s*）|\(\s*\)/
const EMPTY_UNDERLINE_TAG = /<u>\s*<\/u>/i

/**
 * 推断题型。
 * @param html 题干富文本
 * @param options 选项数组（可为空）
 */
export const inferQuestionType = (html: string, options?: unknown): InferredType => {
  if (optionCount(options) >= 2) return 'choice'

  const lines = toLines(html)
  const plain = lines.join('\n')

  if (looksLikeChoice(lines)) return 'choice'
  if (BLANK_UNDERSCORES.test(plain) || EMPTY_PAREN.test(plain)) return 'fill'
  if (EMPTY_UNDERLINE_TAG.test(html || '')) return 'fill'
  return 'solve'
}
