// 单题的两个动作：导出为图片、复制源码（含 LaTeX 公式）。
//
// 为什么不直接截图页面上的 .qcard：
//   卡片上有工具条、悬停/按压态和「已做过」角标，截出来是「界面」而不是「题」。
//   这里用试卷模板重建一个干净的离屏节点再栅格化，与「导出 PDF」共用同一套排版 ——
//   同一道题导成 PDF 和导成图片，版式应当是同一份东西。
import { toPng, getFontEmbedCSS } from 'html-to-image'
import { buildQuestionFragmentHtml } from './questionPaper'
import { PAPER_FONT, PRINT_FIGURE_CSS } from './printHtml'
import { sanitizeHtml } from './sanitizeHtml'
import { renderMathInHtml } from './mathRender'
import { questionOptionTexts, questionTypeLabel as typeLabel, stripHtml } from './format'
import { writeClipboard } from './clipboard'
import type { Question } from '../types'

/** 导出图片的纸张宽度；内容区 = 800 - 28×2 = 744px，与 PDF 模板的 max-width 一致 */
const PAPER_WIDTH = 800
const PAPER_PADDING = 28

// —— 复制源码 ——

/**
 * 题目的「源码」文本。
 *
 * 题干 / 选项 / 补充说明 / 答案全部原样输出：HTML 标签和 $…$、$$…$$ 定界符都保留。
 * 不做渲染也不做转义 —— 复制出去就是为了再编辑或转投他处，转义过就换不回来了。
 */
export const buildQuestionSource = (question: Question, no?: number | string): string => {
  const head: string[] = []
  if (no !== undefined && no !== '') head.push(`题目 ${no}`)
  head.push(typeLabel(question.type))
  if (question.difficulty) head.push(`难度 ${question.difficulty}/5`)
  const tags = [question.knowledgeTag, question.knowledgeSubTag].filter(Boolean).join(' / ')
  if (tags) head.push(tags)

  const blocks: string[] = []
  if (question.title) blocks.push(`题干\n${question.title}`)
  const opts = questionOptionTexts(question)
  if (opts.length) {
    blocks.push(`选项\n${opts.map((t, i) => `${String.fromCharCode(65 + i)}. ${t}`).join('\n')}`)
  }
  if (question.body) blocks.push(`补充说明\n${question.body}`)
  if (question.answer) blocks.push(`参考答案与解析\n${question.answer}`)

  return [head.join('｜'), ...blocks].join('\n\n')
}

// 把单题源码复制到剪贴板，供用户贴到别处或做备份。
export const copyQuestionSource = (question: Question, no?: number | string): Promise<void> =>
  writeClipboard(buildQuestionSource(question, no))

// —— 导出图片 ——

// 字体要按「这一份内容实际用到的字体」内联，不能预先缓存一份全局的。
// html-to-image 的 getFontEmbedCSS(node) 会遍历 node 子树、按 computed font-family
// 过滤 @font-face 规则：拿 document.body 去算，结果取决于当时页面上正好有什么，
// 公式字体可能整段漏掉，导出后公式就换成系统衬线体了（KaTeX 的排版依赖自身字形宽度）。
// 所以每次都按离屏节点算。抓取到的 CSS 文本由 html-to-image 内部缓存，重复调用不会重发请求，
// 这里付出的只是把真正用到的那几个字体文件 base64 内联一次。
const embedFontsFor = async (node: HTMLElement): Promise<string> => {
  try {
    return await getFontEmbedCSS(node)
  } catch (err) {
    // 字体内联失败不该让整次导出失败。传空串会短路 html-to-image 的内联分支
    // （它判断的是 `fontEmbedCSS != null`，空串不算 null），于是退回系统字体：
    // 公式字形不完美，但仍然可读，比直接报错好。
    console.warn('字体内联失败，本次导出退回系统字体', err)
    return ''
  }
}

// 图片没解码完就截图会丢图（html-to-image 会跳过未就绪的帧）
const waitForImages = async (root: HTMLElement): Promise<void> => {
  await Promise.all(
    Array.from(root.querySelectorAll('img')).map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true })
            img.addEventListener('error', () => resolve(), { once: true })
          })
    )
  )
}

// Windows 文件名不能含 \ / : * ? " < > |，而题干里 LaTeX 的 \ 往往出现在首段
const fileStem = (question: Question, no?: number | string): string => {
  const stem = stripHtml(question.title || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24)
  const parts = ['题目']
  if (no !== undefined && no !== '') parts.push(String(no))
  if (stem) parts.push(stem)
  return parts.join('-')
}

export interface ExportQuestionImageOptions {
  /** 连答案与解析一起导出（默认只导题目本身） */
  withAnswer?: boolean
}

/** 把一道题栅格化成 PNG 并触发下载。失败时抛错，由调用方给提示。 */
export const exportQuestionImage = async (
  question: Question,
  no?: number | string,
  opts: ExportQuestionImageOptions = {}
): Promise<void> => {
  // 两层：holder 只负责把内容挪出视口，paper 才是被栅格化的节点。
  // 不能把 holder 直接交给 toPng —— html-to-image 会克隆 getComputedStyle 的结果，
  // holder 上的 position:fixed;left:-10000px 会被原样带进 SVG 的 foreignObject，
  // 内容整体画在画布外，导出就是一张尺寸正确但全白的图。
  // （LessonSummaryDialog / DiagramDialog 用的是同一套「固定容器 + 里面那个节点」写法。）
  const holder = document.createElement('div')
  holder.style.cssText = 'position:fixed;left:-10000px;top:0;pointer-events:none;z-index:-1;'

  const paper = document.createElement('div')
  paper.style.cssText =
    `width:${PAPER_WIDTH}px;box-sizing:border-box;padding:${PAPER_PADDING}px;` +
    'background:#ffffff;' +
    `font-family:${PAPER_FONT};font-size:16px;line-height:1.8;color:#222;`

  try {
    // 与 PDF 同模板；题干是富文本，先消毒再渲染 $…$ 公式（与 printHtml 同序）。
    // 离屏节点不带全局样式表，题图会按上传时的自然像素宽度（常见 1400px+）撑出
    // 800px 的纸面，toPng 再按矩形裁剪 —— 结果就是导出的图右半边没了。
    // 这里内联一份与打印窗口相同的 mm 上限。
    paper.innerHTML =
      `<style>${PRINT_FIGURE_CSS}</style>` +
      renderMathInHtml(
        sanitizeHtml(buildQuestionFragmentHtml(question, no ?? 1, { withAnswer: opts.withAnswer }))
      )
    holder.appendChild(paper)
    document.body.appendChild(holder)

    await waitForImages(paper)
    await document.fonts?.ready

    // 必须在 appendChild 之后取：getFontEmbedCSS 要读节点子树的 computed style，
    // 不在 document 里就抛「Provided element is not within a Document」。
    const fontEmbedCSS = await embedFontsFor(paper)

    const rect = paper.getBoundingClientRect()
    const dataUrl = await toPng(paper, {
      width: Math.ceil(rect.width),
      height: Math.ceil(rect.height),
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      fontEmbedCSS,
      // 兜底：万一哪里给 paper 带了定位偏移，克隆时按静态流处理
      style: { position: 'static', left: 'auto', top: 'auto', margin: '0' }
    })

    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `${fileStem(question, no)}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    holder.remove()
  }
}
