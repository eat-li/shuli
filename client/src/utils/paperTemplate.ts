// 高考试卷正文模板：把 layout 结果拼成一串「块」。
//
// 为什么返回块数组而不是整段 HTML：分页必须在浏览器里按真实高度装箱，
// 而以「一道题 + 它的选项 + 留白」为单位才能保证题目不被切断。
// 块数组交给 utils/paperPrint.ts 去测量与分页。
import { escapeHtml, questionOptionTexts } from './format'
import { sanitizeHtml } from './sanitizeHtml'
import {
  fmtScore,
  sectionTitle,
  VOLUME_LABEL,
  type PaperLayout,
  type LaidOutSection
} from './paperLayout'
import type { PaperSectionKey } from './paperLayout'

export interface PaperBlock {
  /** 块内的 HTML（不含外层容器，分页时统一包进 .pblock） */
  html: string
  /** true = 必须从新的一页开始（第Ⅱ卷） */
  forceBreak?: boolean
  kind: 'head' | 'notice' | 'volume' | 'section' | 'question'
}

export interface PaperMetaInput {
  title: string
  subtitle?: string | null
  stage?: string
  duration?: number
  /** 排版选项，存在 paper.layout 里 */
  layout?: {
    /** 学校名称：留空则不显示（不同学校/年级共用一份数据时不写死） */
    school?: string
    /** 卷头第一行左侧，如「2026 学年第一学期」；留空用学段代替 */
    session?: string
    gapRatio?: number
    showScoreTag?: boolean
    optionColumns?: 1 | 2
  } | null
  notices?: string | null
}

export const STAGE_LABEL: Record<string, string> = {
  primary: '小学',
  junior1: '初一年级',
  junior2: '初二年级',
  junior3: '初三年级',
  senior1: '高一年级',
  senior2: '高二年级',
  senior3: '高三年级'
}

const DEFAULT_NOTICES = [
  '答题前，请将自己的姓名、班级、考场号、座位号填写在答题卡上。',
  '选择题的作答：每小题选出答案后，用 2B 铅笔把答题卡上对应题目的答案标号涂黑。',
  '非选择题的作答：用黑色签字笔直接答在答题卡上对应的答题区域内，超出答题区域书写的答案无效。',
  '考试结束后，请将本试卷和答题卡一并交回。'
]

/** 选项超过 18 个字（去标签后）或含多行公式时改单列，双列会挤成竖排 */
const optionsSingleColumn = (texts: string[]): boolean =>
  texts.some((t) => t.replace(/<[^>]+>/g, '').length > 18 || /\\begin\{(array|align)/.test(t))

// 渲染选项列表。默认双列省纸，超过 18 字或含多行公式时自动改单列——双列会把长选项挤成竖排。
const renderOptions = (q: any, forced?: 1 | 2): string => {
  const texts = questionOptionTexts(q)
  if (!texts.length) return ''
  const cols = forced === 1 || optionsSingleColumn(texts) ? 1 : 2
  const cls = cols === 1 ? 'q-options q-options--one' : 'q-options'
  const items = texts
    .map(
      (t, i) =>
        `<div class="q-option"><span class="q-option__key">${String.fromCharCode(65 + i)}.</span><span>${t}</span></div>`
    )
    .join('')
  return `<div class="${cls}">${items}</div>`
}

// 卷头：左侧考试阶段、右侧时长与满分、中间标题。全部转义，标题里带 & 之类字符也不会破坏结构。
const renderHead = (layout: PaperLayout, meta: PaperMetaInput): string => {
  const l = meta.layout || {}
  const left = l.session || STAGE_LABEL[meta.stage || 'senior3'] || ''
  const right = `考试时间：${meta.duration ?? 120} 分钟　　满分：${fmtScore(layout.totalScore)} 分`
  const title = l.school ? `${l.school}${meta.title}` : meta.title
  return `
    <div class="paper-head">
      <div class="paper-head__row"><span>${escapeHtml(left)}</span><span>${escapeHtml(right)}</span></div>
      <div class="paper-head__title">${escapeHtml(title)}</div>
      ${meta.subtitle ? `<div class="paper-head__sub">（${escapeHtml(meta.subtitle)}）</div>` : ''}
      <div class="paper-head__rule"></div>
    </div>`
}

// 注意事项。用户自定义了就用用户的，没填才用默认四条，因此留空不会得到一张没有说明的卷子。
const renderNotice = (meta: PaperMetaInput): string => {
  const custom = (meta.notices || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
  const lines = custom.length ? custom : DEFAULT_NOTICES
  return `
    <div class="paper-notice">
      <div class="paper-notice__title">注意事项：</div>
      <ol>${lines.map((s) => `<li>${sanitizeHtml(s)}</li>`).join('')}</ol>
    </div>`
}

/** 第Ⅰ卷 / 第Ⅱ卷 标题，带本卷总分 */
const renderVolume = (volume: 1 | 2, sections: LaidOutSection[]): string => {
  const total = sections
    .filter((s) => s.volume === volume)
    .reduce((sum, s) => sum + s.totalScore, 0)
  return `<div class="paper-volume">${VOLUME_LABEL[volume]}（共 ${fmtScore(total)} 分）</div>`
}

const renderQuestion = (
  item: { no: number; score: number; gapPx: number; question: any },
  opts: {
    showScoreTag: boolean
    optionColumns?: 1 | 2
    section: PaperSectionKey
  }
): string => {
  const q = item.question || {}
  const body = q.body ? `<div class="q__extra">${sanitizeHtml(q.body)}</div>` : ''
  // 填空/解答不逐题标分：大题标题已经说明「每小题 N 分」
  const needScore = opts.showScoreTag && (opts.section === 'solve' || opts.section === 'fill')
  return `
    <div class="q">
      <div class="q__head">
        <span class="q__no">${item.no}.</span>
        <div class="q__body">${sanitizeHtml(q.title || '')}${body}</div>
        ${needScore ? `<span class="q__score">（${fmtScore(item.score)} 分）</span>` : ''}
      </div>
      ${renderOptions(q, opts.optionColumns)}
      ${item.gapPx > 0 ? `<div class="q-gap" style="min-height:${item.gapPx}px"></div>` : ''}
    </div>`
}

// 把版式数据装配成有序的打印块（卷头 / 注意事项 / 分卷 / 各分区 / 各题）。
// 块与块之间不带分页信息，分页留给打印环节按实际高度装箱。
export function buildPaperBlocks(layout: PaperLayout, meta: PaperMetaInput): PaperBlock[] {
  const blocks: PaperBlock[] = []
  const l = meta.layout || {}
  blocks.push({ html: renderHead(layout, meta), kind: 'head' })
  blocks.push({ html: renderNotice(meta), kind: 'notice' })

  let lastVolume: 1 | 2 | null = null
  for (const section of layout.sections) {
    if (section.volume !== lastVolume) {
      blocks.push({
        html: renderVolume(section.volume, layout.sections),
        kind: 'volume',
        // 第Ⅱ卷另起一页：这是高考卷的硬规矩，不能靠「恰好装满」凑
        forceBreak: section.volume === 2
      })
      lastVolume = section.volume
    }
    blocks.push({
      html: `<div class="paper-section-title">${sectionTitle(section)}</div>`,
      kind: 'section'
    })
    for (const item of section.items) {
      blocks.push({
        html: renderQuestion(item, {
          showScoreTag: l.showScoreTag !== false,
          optionColumns: l.optionColumns,
          section: section.key
        }),
        kind: 'question'
      })
    }
  }
  return blocks
}
