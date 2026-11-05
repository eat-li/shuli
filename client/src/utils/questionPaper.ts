// 题目试卷 HTML 生成：知识点题目导出、整库导出、题目浏览导出共用同一套排版模板。
// 之前这段模板只存在于 KnowledgeQuestions.vue 内部，新增导出入口时若不共用，
// 同一份排版逻辑很快就会在各处走样。
import { PAPER_FONT, escapeHtml } from './printHtml'
import { questionOptionTexts, questionTypeLabel as typeLabel } from './format'

export interface QuestionPaperOptions {
  /** 试卷大标题 */
  title: string
  /** 标题下的副标题（如筛选条件说明），留空不显示 */
  subtitle?: string
  questions: any[]
  /** 附上答案与解析 */
  withAnswer?: boolean
  /** > 0 时每题后留出该高度的答题空白 */
  answerAreaHeight?: number
  /** 按一级知识点分组并加小标题（整库导出时用） */
  groupByKnowledge?: boolean
  /** 正文字号，默认 16 */
  fontSize?: number
  /** 纸张背景色（hex），留空保持默认白底 */
  backgroundColor?: string
  /** 标题/正文文字色，默认 #222；深色背景时建议调浅 */
  textColor?: string
  /** 标题底部与分组标题的分隔线颜色，默认 #333 */
  lineColor?: string
}

const UNCLASSIFIED = '未分类'

// hex 色值校验：3-8 位 hex（#abc / #aabbcc / #aabbccdd），非法时回退默认值
export const safeColor = (v: string | undefined, fallback: string): string =>
  typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : fallback

// 选择题选项：A. / B. / C. …
const renderOptions = (q: any) => {
  const opts = questionOptionTexts(q)
  if (!opts.length) return ''
  return `<div style="margin:6px 0 0 22px;">${opts
    .map(
      (text, j) =>
        `<div style="margin:2px 0;">${String.fromCharCode(65 + j)}. ${escapeHtml(text)}</div>`
    )
    .join('')}</div>`
}

// 一级知识点大标题：作为「章」，字号最大 + 粗底线
const renderGroupHeading = (
  name: string,
  count: number,
  fs: number,
  line: string,
  ink: string,
  inkMuted: string
) =>
  `<div style="margin:26px 0 10px;padding-bottom:6px;border-bottom:2px solid ${line};` +
  `font-size:${fs + 3}px;font-weight:700;color:${ink};page-break-after:avoid;">${escapeHtml(name)}` +
  `<span style="font-weight:400;color:${inkMuted};font-size:${fs - 3}px;margin-left:10px;">${count} 题</span></div>`

// 二级知识点小标题：作为「节」，左侧墨蓝竖条 + 极浅墨蓝底 + 墨蓝字。
// 彩色打印时一眼能看出分节；黑白打印时竖条与加粗也仍能把层级区分开。
//
// ⚠️ 这里的墨蓝 #0b4f6c 是**有意保留的旧值**，不跟随屏幕主题的群青 #1a3d8f：
// 试卷是打印介质，配色要考虑墨量与黑白打印后的灰度，与界面不是同一套约束。
// 这一点与 theme-tokens.css 顶部「有意不做的部分」一致 ——
// 看到本文件与 --moss 不同色时不要「顺手统一」。
// 注意：这里以前是旧主题的琥珀金（#96681a / #f7f2e7 / #7d5511 / #8a7a5c），
// 迁移主题时被漏掉了，导出给学生的试卷上还留着两版之前的配色。
const SUB_HEADING = {
  bar: '#0b4f6c',
  bg: '#eef3f6',
  ink: '#083d54',
  meta: '#5d7b88'
}
// 二级知识点小标题：左侧竖条 + 浅底 + 题量。
// page-break-after:avoid 是必须的——标题被单独推到页尾、题目在下一页，是最典型的打印排版事故。
const renderSubHeading = (name: string, count: number, fs: number) =>
  `<div style="margin:16px 0 8px;padding:5px 12px;border-left:4px solid ${SUB_HEADING.bar};background:${SUB_HEADING.bg};` +
  `font-size:${fs + 1}px;font-weight:700;color:${SUB_HEADING.ink};page-break-after:avoid;">${escapeHtml(name)}` +
  `<span style="font-weight:400;color:${SUB_HEADING.meta};font-size:${fs - 3}px;margin-left:8px;">${count} 题</span></div>`

// 按二级知识点分桶：题量降序（与题库侧栏顺序一致）
const bucketBySubTag = (list: any[]) => {
  const map = new Map<string, any[]>()
  for (const q of list) {
    const key = q.knowledgeSubTag || UNCLASSIFIED
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(q)
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length)
}

export interface QuestionFragmentOptions {
  /** 正文字号，默认 16 */
  fontSize?: number
  /** 附上答案与解析 */
  withAnswer?: boolean
  /** > 0 时在题后留出该高度的答题空白 */
  answerAreaHeight?: number
  /** 标题/正文文字色，默认 #222；深色背景时建议调浅 */
  textColor?: string
}

/**
 * 单题 HTML 片段：试卷导出与「导出图片」共用。
 *
 * 单题导出如果另写一份模板，题干、选项、答案这三处的字号与间距很快会和 PDF 走样；
 * 同一道题导成 PDF 和导成图片，版式应当是同一份东西。
 */
export const buildQuestionFragmentHtml = (
  q: any,
  no: number | string,
  opts: QuestionFragmentOptions = {}
): string => {
  const fs = opts.fontSize ?? 16
  const ink = safeColor(opts.textColor, '#222')
  const dark = ink !== '#222'
  const inkMuted = dark ? '#999' : '#777'
  const withAnswer = opts.withAnswer ?? false
  const answerAreaHeight = opts.answerAreaHeight ?? 0

  return `
      <div style="margin-bottom:18px;page-break-inside:avoid;">
        <div style="margin-bottom:4px;">
          <span style="font-weight:700;">${no}.</span>
          <span style="color:${inkMuted};font-size:${fs - 2}px;margin-left:6px;">【${escapeHtml(typeLabel(q.type))}】</span>
          ${q.difficulty ? `<span style="color:${inkMuted};font-size:${fs - 2}px;margin-left:6px;">难度 ${q.difficulty} 星</span>` : ''}
        </div>
        <div>${q.title || ''}</div>
        ${renderOptions(q)}
        ${q.body ? `<div style="margin-top:4px;">${q.body}</div>` : ''}
        ${answerAreaHeight > 0 ? `<div style="height:${answerAreaHeight}px;"></div>` : ''}
        ${withAnswer && q.answer ? `<div style="color:${dark ? '#ff8a80' : '#c0392b'};margin-top:6px;"><b>【答案与解析】</b>${q.answer}</div>` : ''}
      </div>`
}

// 生成「按知识点浏览」页的整篇导出 HTML（可含答案解析与作答区）。
// 深色背景必须由调用方同时传浅色文字，这里不做自动反色：自动反色在低饱和主题上会得到读不清的组合。
export const buildQuestionPaperHtml = (opts: QuestionPaperOptions): string => {
  const {
    title,
    subtitle = '',
    questions,
    withAnswer = false,
    answerAreaHeight = 0,
    groupByKnowledge = false,
    fontSize: fs = 16,
    backgroundColor,
    textColor,
    lineColor
  } = opts

  // 设计变量：默认沿用经典白底黑字试卷风；深色背景需调用方同步传浅色文字
  const dark = safeColor(textColor, '#222') !== '#222'
  const ink = safeColor(textColor, '#222')
  const inkSoft = dark ? '#bbb' : '#555'
  const inkMuted = dark ? '#999' : '#777'
  const line = safeColor(lineColor, '#333')
  const paperBg = safeColor(backgroundColor, '#fff')

  // 单题排版真源在 buildQuestionFragmentHtml，这里只把本函数的排版选项传下去
  const renderQuestion = (q: any, no: number) =>
    buildQuestionFragmentHtml(q, no, { fontSize: fs, withAnswer, answerAreaHeight, textColor })

  let body = ''
  let no = 0

  /*
   * 一组题先按二级知识点分节。
   * 只有该组确实跨了多个二级时才加小标题——整组都是同一个二级时，
   * 小标题只是把同一件事说了两遍，属于噪音。
   * 题号跨小节连续编号，与抬头「共 N 题」对得上。
   */
  const renderGroupBody = (list: any[]) => {
    const buckets = bucketBySubTag(list)
    const showSubHeading = buckets.length > 1
    return buckets
      .map(
        ([name, items]) =>
          (showSubHeading ? renderSubHeading(name, items.length, fs) : '') +
          items.map((q) => renderQuestion(q, ++no)).join('')
      )
      .join('')
  }

  if (groupByKnowledge) {
    // 一级知识点按题量降序（与题库卡片顺序一致），组内再按二级分节
    const map = new Map<string, any[]>()
    for (const q of questions) {
      const key = q.knowledgeTag || UNCLASSIFIED
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(q)
    }
    body = [...map.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(
        ([name, list]) =>
          renderGroupHeading(name, list.length, fs, line, ink, inkMuted) + renderGroupBody(list)
      )
      .join('')
  } else {
    // 不按一级分组时（如知识点页导出），二级小标题同样能让题目按类别分开
    body = renderGroupBody(questions)
  }

  return `<div style="font-family:${PAPER_FONT};font-size:${fs}px;line-height:1.8;color:${ink};padding:28px;max-width:800px;margin:0 auto;background:${paperBg};">
    <div style="text-align:center;border-bottom:2px solid ${line};padding-bottom:12px;margin-bottom:18px;">
      <div style="font-size:${fs + 6}px;font-weight:700;">${escapeHtml(title)}</div>
      ${subtitle ? `<div style="font-size:${fs - 1}px;color:${inkSoft};margin-top:6px;">${escapeHtml(subtitle)}</div>` : ''}
      <div style="font-size:${fs - 2}px;color:${inkSoft};margin-top:6px;">共 ${questions.length} 题${withAnswer ? '（含答案）' : ''}</div>
    </div>
    ${body}
  </div>`
}
