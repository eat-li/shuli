// 试卷版面计算：纯函数，不碰 DOM、不碰网络。
//
// 为什么单独抽出来：题号连续性、分区顺序、答题留白高度这三件事，
// 试卷模板与答题卡模板都必须算出**完全一致**的结果——两处各算一份，
// 迟早会出现「试卷第 12 题」对上「答题卡第 13 题」。这里算一次，两边只消费。
import type { Question } from '../types'

export type PaperSectionKey = 'single' | 'multiple' | 'fill' | 'solve'

/** 分区顺序 = 卷面顺序。单选与多选同属第Ⅰ卷，填空与解答属第Ⅱ卷。 */
export const SECTION_ORDER: PaperSectionKey[] = ['single', 'multiple', 'fill', 'solve']

export const SECTION_LABEL: Record<PaperSectionKey, string> = {
  single: '单项选择题',
  multiple: '多项选择题',
  fill: '填空题',
  solve: '解答题'
}

/** 第Ⅰ卷（选择题）/ 第Ⅱ卷（非选择题）分界：从这一项开始另起一页 */
export const VOLUME_OF: Record<PaperSectionKey, 1 | 2> = {
  single: 1,
  multiple: 1,
  fill: 2,
  solve: 2
}

export const VOLUME_LABEL: Record<1 | 2, string> = {
  1: '第Ⅰ卷（选择题）',
  2: '第Ⅱ卷（非选择题）'
}

export const CN_INDEX = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

/**
 * 各分区的默认单题分值：单选 8×5 + 多选 3×6 + 填空 3×5 = 73 分。
 * 解答题不是均分，见 defaultScoresFor()——五题各 13 分只有 65 分，整卷二算下来
 * 是 138 而不是 150，卷头「满分」与各题分值就打架了。这里的 13 只是占位默认值。
 */
export const DEFAULT_SECTION_SCORE: Record<PaperSectionKey, number> = {
  single: 5,
  multiple: 6,
  fill: 5,
  solve: 13
}

/** 新高考数学卷解答题分值：13 + 15 + 15 + 17 + 17 = 77（5 题） */
export const SOLVE_SCORE_PATTERN = [13, 15, 15, 17, 17]
export const SOLVE_TOTAL_SCORE = 77

/**
 * 某个分区「标准分值」的逐题拆分。
 * 选择/填空是均分；解答题按新高考的 13/15/15/17/17 递增给分。
 * 题量与标准卷不一致时，把 77 分均摊到每题（最后一题吸收余数），保证总分不漂。
 */
export function defaultScoresFor(section: PaperSectionKey, count: number): number[] {
  if (count <= 0) return []
  if (section !== 'solve') {
    return Array.from({ length: count }, () => DEFAULT_SECTION_SCORE[section])
  }
  if (count === SOLVE_SCORE_PATTERN.length) return [...SOLVE_SCORE_PATTERN]
  const base = Math.round(SOLVE_TOTAL_SCORE / count)
  const scores = Array.from({ length: count }, () => base)
  scores[count - 1] += SOLVE_TOTAL_SCORE - base * count
  return scores
}

export interface PaperLayoutOptions {
  /** 答题留白整体缩放，1 = 标准 */
  gapRatio?: number
  /** 解答题是否在题号行右侧标（N 分） */
  showScoreTag?: boolean
}

export interface PaperItem {
  questionId: number
  section: PaperSectionKey
  score: number
  question: Question
}

export interface LaidOutItem extends PaperItem {
  /** 卷内连续题号（跨大题不重置） */
  no: number
  /** 该题后留出的答题空白（px），选择题为 0 */
  gapPx: number
}

export interface LaidOutSection {
  key: PaperSectionKey
  /** 「一、单项选择题」 */
  ordinal: string
  label: string
  volume: 1 | 2
  items: LaidOutItem[]
  totalScore: number
  /** 本大题统一分值（同大题内各题分值相同时给出，用于标题行「每小题 N 分」） */
  uniformScore: number | null
  noStart: number
  noEnd: number
}

export interface PaperLayout {
  sections: LaidOutSection[]
  totalScore: number
  totalCount: number
  ratedCount: number
  /** 难度分布：1-5 与「未标注」，试卷页脚与双向细目表可复用 */
  difficultyBuckets: { level: number | null; count: number }[]
}

/**
 * 答题留白高度。填空与解答按分值给，选择题不给（答案写在答题卡或题后括号里）。
 *
 * 系数来自实际排版手感：12 分的解答题约 288px（≈7.6cm），
 * 正好够写一个完整的两问推导，又不会让整卷多出两三页。
 */
export const gapOf = (section: PaperSectionKey, score: number, ratio = 1): number => {
  const base = section === 'solve' ? 24 : section === 'fill' ? 22 : 0
  if (!base) return 0
  return Math.round(Math.max(0, score) * base * (ratio > 0 ? ratio : 1))
}

/** 卷面顺序：先按分区顺序，分区内保持用户排列的相对顺序 */
const orderRank = (k: PaperSectionKey) => SECTION_ORDER.indexOf(k)

// 把题目列表排版成「分区 + 连续题号 + 分值小计」的版式数据。
// 分区内用稳定排序保持用户拖拽的相对顺序，因此这里不能改用可能不稳定的排序实现。
export function layoutPaper(items: PaperItem[], options: PaperLayoutOptions = {}): PaperLayout {
  const ratio = options.gapRatio ?? 1
  const sorted = [...items].sort((a, b) => {
    const d = orderRank(a.section) - orderRank(b.section)
    return d !== 0 ? d : 0 // 分区内保持传入顺序（稳定排序）
  })

  const sections: LaidOutSection[] = []
  let no = 0

  for (const key of SECTION_ORDER) {
    const list = sorted.filter((it) => it.section === key)
    if (!list.length) continue
    const noStart = no + 1
    const laid: LaidOutItem[] = list.map((it) => {
      no += 1
      return { ...it, no, gapPx: gapOf(key, it.score, ratio) }
    })
    const totalScore = laid.reduce((s, it) => s + (Number(it.score) || 0), 0)
    const firstScore = Number(laid[0].score) || 0
    const uniformScore = laid.every((it) => (Number(it.score) || 0) === firstScore)
      ? firstScore
      : null
    sections.push({
      key,
      ordinal: CN_INDEX[sections.length] || String(sections.length + 1),
      label: SECTION_LABEL[key],
      volume: VOLUME_OF[key],
      items: laid,
      totalScore,
      uniformScore,
      noStart,
      noEnd: no
    })
  }

  const difficultyBuckets = [1, 2, 3, 4, 5, null].map((level) => ({
    level,
    count: sorted.filter((it) => (it.question?.difficulty ?? null) === level).length
  }))

  return {
    sections,
    totalScore: sections.reduce((s, sec) => s + sec.totalScore, 0),
    totalCount: no,
    ratedCount: sorted.filter((it) => it.question?.difficulty != null).length,
    difficultyBuckets
  }
}

/**
 * 大题标题的完整句子（高考卷的固定句式）。
 * 分值不是均分时不写「每小题 N 分」，避免与实际分值打架。
 */
export function sectionTitle(section: LaidOutSection): string {
  const count = section.items.length
  const total = section.totalScore
  const per = section.uniformScore
  const rule =
    section.key === 'single'
      ? '在每小题给出的四个选项中，只有一项是符合题目要求的。'
      : section.key === 'multiple'
        ? '在每小题给出的选项中，有多项符合题目要求。全部选对的得全部分，部分选对的得部分分，有选错的得 0 分。'
        : section.key === 'solve'
          ? '解答应写出文字说明、证明过程或演算步骤。'
          : ''
  const scorePart = per
    ? `本题共 ${count} 小题，每小题 ${fmtScore(per)} 分，共 ${fmtScore(total)} 分。`
    : `本题共 ${count} 小题，共 ${fmtScore(total)} 分。`
  return `${section.ordinal}、${section.label}：${scorePart}${rule}`
}

/** 分值显示：整数不带小数尾巴，0.5 分保留一位 */
export const fmtScore = (n: number): string =>
  Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10)
