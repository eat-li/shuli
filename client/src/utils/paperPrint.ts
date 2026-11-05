// 试卷打印：在打印窗口内按真实高度装箱分页，再交给 printHtml 触发打印。
//
// 为什么要自己分页，而不是交给浏览器的 `break-inside: avoid`：
// 高考卷要求每页都有页码与装订线，而 Chrome 不支持 `@page` 的 margin box
// （`@bottom-center { content: counter(page) }` 不生效），`position:fixed` 页脚
// 又不会自增页码。唯一不引第三方库的办法就是：先把每个不可分割块量出高度，
// 贪心装进固定高度的页盒，页码在生成 HTML 时写死。
import katexCss from 'katex/dist/katex.min.css?raw'
import { printHtml, renderMathHtml } from './printHtml'
import { sanitizeHtml } from './sanitizeHtml'
import { buildPaperCss, PAPER_GEOMETRY } from './paperPrintCss'
import { buildPaperBlocks, type PaperBlock, type PaperMetaInput } from './paperTemplate'
import { buildAnswerSheetBlocks } from './answerSheetTemplate'
import { layoutPaper, type PaperLayout } from './paperLayout'
import type { PaperDetail } from '../types'

/** 等字体与图片就绪：分页高度依赖字体度量，字体没就绪会量出偏小的高度 */
const waitLayoutReady = (win: Window): Promise<unknown> => {
  const doc = win.document
  const fonts: Promise<unknown> = doc.fonts?.ready ?? Promise.resolve()
  const images = Array.from(doc.images).map((img) =>
    img.complete
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          img.addEventListener('load', () => resolve(), { once: true })
          img.addEventListener('error', () => resolve(), { once: true })
        })
  )
  return Promise.race([
    Promise.all([fonts, ...images]),
    new Promise((r) => setTimeout(r, 6000))
  ])
}

interface PaginateOptions {
  footerLabel: string
  /** 是否在每页左侧画装订线 */
  binding?: boolean
  /** 调试钩子：回调里拿到页高预算、各块测量高度与分页结果（调排版用，不传则无副作用） */
  debug?: (info: { budget: number; heights: number[]; pages: number[][] }) => void
}

/**
 * 把块数组装进页盒，返回完整的多页 HTML。
 * 会在 win.document 里临时插入一个测量容器，结束后移除。
 */
export async function paginateBlocks(
  win: Window,
  blocks: PaperBlock[],
  opts: PaginateOptions
): Promise<string> {
  const doc = win.document
  const probe = doc.createElement('div')
  probe.style.cssText = `width:${PAPER_GEOMETRY.contentWidthMm}mm;height:${PAPER_GEOMETRY.contentHeightMm}mm;position:absolute;left:-9999px;top:0;`
  // 测量容器必须与真实页盒同款（.paper-page 的宽度、padding、行高全都参与高度），
  // 早先用 .paper-flow 量出来比实际高约 20%，导致每页都提前换页、留出大片空白。
  // 这里复用同一个 class，只把高度改成 auto、允许溢出。
  const flow = doc.createElement('div')
  flow.className = 'paper-page'
  flow.style.cssText =
    'position:absolute;left:-9999px;top:0;height:auto;min-height:0;overflow:visible;page-break-after:auto;'
  doc.body.appendChild(probe)
  doc.body.appendChild(flow)

  // 先渲染公式再测量：KaTeX 会改变行高，量在渲染前会偏小
  const rendered = blocks.map((b) => ({
    ...b,
    html: renderMathHtml(sanitizeHtml(b.html))
  }))

  const nodes: HTMLElement[] = rendered.map((b) => {
    const wrap = doc.createElement('div')
    wrap.className = 'pblock'
    wrap.innerHTML = b.html
    flow.appendChild(wrap)
    return wrap
  })

  await waitLayoutReady(win)

  // 内容区高度用 px 计（mm→px 依赖 DPI，直接量一个同尺寸盒子最可靠）
  const contentHeight = probe.getBoundingClientRect().height
  // 用「相邻块顶部之差」而不是块自身高度：题目之间有 4mm margin，
  // 自身高度不含它，逐块累加会少算 150px 左右，最后一页就会被撑破（overflow:hidden 直接裁掉）。
  // 顶部差天然把（可能已折叠的）外边距算进来。
  const tops = nodes.map((n) => n.getBoundingClientRect().top)
  const heights = nodes.map((n, i) => {
    const rect = n.getBoundingClientRect()
    return i + 1 < nodes.length ? tops[i + 1] - tops[i] : rect.height
  })
  // 页脚落在下边距里，不占内容区；这里留 2px 容差防止 0.4px 误差多出一页
  const pageBudget = Math.max(200, contentHeight - 4)

  const pages: number[][] = []
  let current: number[] = []
  let used = 0

  // 收口当前页并重置已用高度。只有 current 非空才 push，避免连续 forceBreak 产生空白页。
  const startNewPage = () => {
    if (current.length) pages.push(current)
    current = []
    used = 0
  }

  for (let i = 0; i < rendered.length; i++) {
    const block = rendered[i]
    if (block.forceBreak && current.length) startNewPage()
    const h = heights[i]
    // 标题类块不允许留在页尾单独出现：连下一块一起放不下就整体换页
    const keepWithNext = block.kind === 'volume' || block.kind === 'section'
    const nextH = keepWithNext ? heights[i + 1] || 0 : 0
    if (current.length && used + h + nextH > pageBudget) startNewPage()
    // 单块比整页还高（极少见：超长解答题），仍单独占一页，靠 CSS 兜住溢出
    current.push(i)
    used += h
  }
  if (current.length) pages.push(current)
  opts.debug?.({ budget: pageBudget, heights, pages })

  flow.remove()
  probe.remove()

  const total = pages.length || 1
  const pagesHtml = pages
    .map((idxList, pageIndex) => {
      const body = idxList.map((i) => `<div class="pblock">${rendered[i].html}</div>`).join('')
      const binding = opts.binding
        ? '<div class="paper-page__binding"><span class="paper-page__binding-text">装订线</span></div>'
        : ''
      return `<div class="paper-page">${binding}${body}<div class="paper-page__footer">${opts.footerLabel}　第 ${pageIndex + 1} 页（共 ${total} 页）</div></div>`
    })
    .join('')

  // 一页都没有（空卷）时给一个空页，避免打印出纯白
  return (
    pagesHtml ||
    `<div class="paper-page"><div class="paper-page__footer">${opts.footerLabel}　第 1 页（共 1 页）</div></div>`
  )
}

/** 打印整份试卷正文 */
export const printPaper = (layout: PaperLayout, meta: PaperMetaInput): boolean =>
  printHtml(
    `${meta.title || '试卷'}（试卷）`,
    (win) =>
      paginateBlocks(win, buildPaperBlocks(layout, meta), {
        footerLabel: '数学试题',
        binding: true
      }),
    {
      extraCss: buildPaperCss(),
      renderMath: false,
      sanitize: false,
      waitForImages: true,
      width: 1000,
      height: 820
    }
  )

/** 打印答题卡 */
export const printAnswerSheet = (layout: PaperLayout, meta: PaperMetaInput): boolean =>
  printHtml(
    `${meta.title || '试卷'}（答题卡）`,
    (win) =>
      paginateBlocks(win, buildAnswerSheetBlocks(layout, meta), {
        footerLabel: '数学答题卡',
        binding: false
      }),
    {
      extraCss: buildPaperCss(),
      renderMath: false,
      sanitize: false,
      waitForImages: true,
      width: 1000,
      height: 820
    }
  )

/**
 * 从接口返回的试卷装配「版面 + 卷头」。
 * 列表页、编辑器、打印入口都走这里，避免三处各自算一遍 gapRatio。
 */
export const buildPrintContext = (
  detail: PaperDetail
): { layout: PaperLayout; meta: PaperMetaInput } => {
  const cfg = detail.paper.layout || {}
  const layout = layoutPaper(
    detail.items.map((it) => ({
      questionId: it.questionId,
      section: it.section,
      score: Number(it.score) || 0,
      question: it.question
    })),
    { gapRatio: cfg.gapRatio ?? 1 }
  )
  const meta: PaperMetaInput = {
    title: detail.paper.title,
    subtitle: detail.paper.subtitle,
    stage: detail.paper.stage,
    duration: detail.paper.duration,
    layout: cfg,
    notices: detail.paper.notices
  }
  return { layout, meta }
}

/**
 * 预览文档：给编辑器右侧 iframe 用。
 * 不做分页（实时预览每次敲键都分页太贵），但 CSS 与打印完全一致，
 * 看到的就是打出来的样子，只有分页位置需要点「预览」确认。
 */
export const buildPreviewDocument = (
  layout: PaperLayout,
  meta: PaperMetaInput,
  kind: 'paper' | 'sheet' = 'paper'
): string => {
  const blocks =
    kind === 'sheet' ? buildAnswerSheetBlocks(layout, meta) : buildPaperBlocks(layout, meta)
  const body = blocks
    .map((b) => `<div class="pblock">${renderMathHtml(sanitizeHtml(b.html))}</div>`)
    .join('')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${katexCss}${buildPaperCss()}
    body{display:flex;justify-content:center;background:#e9e9e6;} /* audit-allow —— 预览画布底色，非打印内容 */
    .paper-page{height:auto;min-height:${PAPER_GEOMETRY.pageHeightMm}mm;box-shadow:0 1px 6px rgba(0,0,0,.18);margin:8px 0;}
  </style></head><body><div class="paper-page">${body}</div></body></html>`
}
