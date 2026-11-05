// 答题卡模板。与试卷模板消费**同一份 layout**：
// 题号、分区、分值全部来自 layoutPaper()，两套模板都不再自己数题，
// 否则改一道题的顺序就可能出现「试卷第 12 题」对应「答题卡第 13 题」。
import { escapeHtml } from './format'
import { fmtScore, SECTION_LABEL } from './paperLayout'
import type { PaperLayout, LaidOutSection } from './paperLayout'
import type { PaperBlock } from './paperTemplate'
import { STAGE_LABEL, type PaperMetaInput } from './paperTemplate'

/** 非选择题作答区高度：每分 26px，12 分 ≈ 312px，够写完整推导 */
const fillAreaHeight = (score: number) => Math.round(Math.max(0, score) * 26)

// 答题卡抬头：题目名 + 学段，学段为空时不留空括号。
const renderTitle = (meta: PaperMetaInput): string => {
  const stage = STAGE_LABEL[meta.stage || 'senior3'] || ''
  return `<div class="as-title">${escapeHtml(meta.title || '数学')}　答题卡${stage ? `（${escapeHtml(stage)}）` : ''}</div>`
}

// 考生信息栏。故意留空单元格——答题卡是打印出来手写填的，不能带占位文字。
const renderInfo = (): string => `
  <table class="as-info">
    <tr>
      <th>姓　名</th><td></td>
      <th>班　级</th><td></td>
    </tr>
    <tr>
      <th>考场号</th><td></td>
      <th>座位号</th><td></td>
    </tr>
    <tr>
      <th>学　号</th><td colspan="3"></td>
    </tr>
    <tr>
      <th>总分</th><td colspan="3"></td>
    </tr>
  </table>`

// 选择题填涂区：每题固定 4 个气泡（A–D）。
// 多选不额外加气泡，只在分区标题上标「（多选）」提示阅卷口径。
const renderChoiceSection = (section: LaidOutSection): string => {
  const items = section.items
    .map(
      (it) => `
      <div class="as-item">
        <span class="as-item__no">${it.no}.</span>
        <span class="bubble"></span><span class="bubble"></span>
        <span class="bubble"></span><span class="bubble"></span>
      </div>`
    )
    .join('')
  const tag = section.key === 'multiple' ? '（多选）' : ''
  return `
    <div class="as-section">
      <div class="paper-section-title">${section.ordinal}、${SECTION_LABEL[section.key]}${tag}（第 ${section.noStart}–${section.noEnd} 题）</div>
      <div class="as-grid">${items}</div>
    </div>`
}

// 非选择题作答区：按分值折算高度（每分 26px），保证 12 分的推导题有足够书写空间。
const renderFillSection = (section: LaidOutSection): string => {
  const blocks = section.items
    .map(
      (it) => `
      <div class="as-block" style="height:${fillAreaHeight(it.score)}px">
        <div class="as-block__head">${it.no}.</div>
        <div class="as-block__score">（${fmtScore(it.score)} 分）</div>
      </div>`
    )
    .join('')
  return `
    <div class="as-section">
      <div class="paper-section-title">${section.ordinal}、${SECTION_LABEL[section.key]}（第 ${section.noStart}–${section.noEnd} 题）</div>
      <div class="as-hint">请在各题指定的答题区域内作答，超出黑色矩形边框限定区域的答案无效。</div>
      ${blocks}
    </div>`
}

// 把 layout 装配成「抬头 → 信息栏 → 选择题卷 → 非选择题卷」的有序块。
// 分卷与强制换页都靠 forceBreak 表达，具体怎么分页由打印环节决定，这里不测量高度。
export function buildAnswerSheetBlocks(
  layout: PaperLayout,
  meta: PaperMetaInput
): PaperBlock[] {
  const blocks: PaperBlock[] = []
  blocks.push({ html: renderTitle(meta), kind: 'head' })
  blocks.push({ html: renderInfo(), kind: 'notice' })

  const choiceSections = layout.sections.filter(
    (s) => s.key === 'single' || s.key === 'multiple'
  )
  const writtenSections = layout.sections.filter((s) => s.key === 'fill' || s.key === 'solve')

  if (choiceSections.length) {
    blocks.push({
      html: `<div class="as-hint">选择题填涂区：请用 2B 铅笔将对应选项涂黑，修改时用橡皮擦干净。</div>`,
      kind: 'volume'
    })
    for (const s of choiceSections) {
      blocks.push({ html: renderChoiceSection(s), kind: 'section' })
    }
  }
  if (writtenSections.length) {
    blocks.push({
      html: `<div class="paper-volume">第Ⅱ卷（非选择题）</div>`,
      kind: 'volume',
      forceBreak: choiceSections.length > 0
    })
    for (const s of writtenSections) {
      blocks.push({ html: renderFillSection(s), kind: 'section' })
    }
  }
  return blocks
}
