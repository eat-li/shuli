// 公共格式化工具：日期、题型、富文本清洗、HTML 转义
export const questionTypeMap: Record<string, string> = {
  choice: '选择题',
  fill: '填空题',
  solve: '解答题'
}

// 题型枚举 → 中文名；未知值原样返回，避免历史脏数据在界面上变成空白。
export const questionTypeLabel = (t: string) => questionTypeMap[t] || t

/**
 * 单选 / 多选的完整题型名。只给试卷排版用——
 * 作业导出与题目卡片继续用 questionTypeLabel（「选择题」），
 * 否则同一道题在已导出的旧 PDF 与新页面里会显示成两种叫法。
 * choiceMode 为 NULL 时是存量题，语义上等同单选。
 */
export const questionTypeFullLabel = (q: { type?: string; choiceMode?: string | null }) => {
  if (q?.type === 'choice') return q.choiceMode === 'multiple' ? '多项选择题' : '单项选择题'
  return questionTypeLabel(q?.type || '')
}

/** 卡片/列表上的题型显示：多选单独叫「多选题」，其余沿用旧文案（不动存量叫法） */
export const questionTypeDisplay = (q: { type?: string; choiceMode?: string | null }) =>
  q?.type === 'choice' && q.choiceMode === 'multiple' ? '多选题' : questionTypeLabel(q?.type || '')

/**
 * 选项可能是字符串或对象（历史数据里有 `{ text: … }` 之类的形态），统一转成可读文本。
 * 题目卡片、试卷导出、单题导出共用同一口径 —— 三处各写一份的话，
 * 同一道题在页面上和在导出的 PDF / 图片里会显示得不一样。
 */
export const questionOptionTexts = (q: any): string[] => {
  const raw = q?.options
  if (!Array.isArray(raw)) return []
  return raw.map((o: any) => {
    if (typeof o === 'string') return o
    if (o && typeof o === 'object' && 'text' in o) return o.text
    return JSON.stringify(o)
  })
}

// 用 Intl 而不是手写模板：日期格式交给运行环境按用户语言决定，
// 也避免「2026-09-27 12:38」这类硬编码格式在别的区域下不合规。
// locale 传 undefined = 使用运行时默认语言（浏览器设置）。
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
})

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
})

/**
 * 格式化日期时间；空值返回 fallback（默认「—」）。
 * 整列都是「—」时读者会怀疑数据没加载出来，那种场合传 fallback='未设置' 更清楚。
 */
export const formatDateTime = (d: any, fallback = '—') => {
  if (!d) return fallback
  const date = new Date(d)
  if (isNaN(date.getTime())) return String(d)
  return dateTimeFormatter.format(date)
}

/**
 * 只到日的日期（考试日期、截止日等）；与 formatDateTime 共用同一套
 * 空值/非法值兜底。全站不再保留「今天 10:58」「10-26」等第二套写法。
 */
export const formatDate = (d: any, fallback = '—') => {
  if (!d) return fallback
  const date = new Date(d)
  if (isNaN(date.getTime())) return String(d)
  return dateFormatter.format(date)
}

// 富文本转纯文本（列表摘要、导出文件名等场景用）。只做去标签 + 反转义，不处理 <br> 换行。
export const stripHtml = (html: string) =>
  (html || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')

// HTML 转义，用于把用户输入拼进字符串模板。
// 入参放宽成 any 是刻意的：分值、题号这类可能是 number / null，统一走这里避免各处判空。
export const escapeHtml = (s: any) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }
    return map[c]
  })
