// 公共打印工具：统一「打开独立打印窗口 + 注入 KaTeX 样式 + 渲染公式 + 触发打印」逻辑。
// 供结论导出、作业导出、知识点题目导出、试卷打印共用，避免各处重复 window.open / print 样板代码。
import katexCss from 'katex/dist/katex.min.css?raw'
import { sanitizeHtml } from './sanitizeHtml'
import { renderMathInHtml } from './mathRender'
import { escapeHtml } from './format'
import { PAPER_FONT, PRINT_FIGURE_CSS } from './printStyle'

export { escapeHtml }
// 兼容既有调用方：常量本身不依赖 KaTeX，新代码可直接从 printStyle 引入。
export {
  PAPER_FONT,
  FIGURE_MAX_WIDTH_MM,
  FIGURE_MAX_HEIGHT_MM,
  PRINT_FIGURE_CSS
} from './printStyle'

// 独立打印窗口只注入 katex.min.css，不会带上 theme.css，这里补一份换行兜底样式，
// 防止长公式 / 块级公式在打印时溢出页面；同时给窗口设置试卷基础字体。
// 注意：.katex-display 这里是 overflow-x:auto（屏幕上可滚动），
// 试卷样式（utils/paperPrintCss.ts）会用 overflow:visible 覆盖它 —— 纸上滚动等于裁切。
const katexWrapCss =
  `.katex{white-space:normal;overflow-wrap:break-word;max-width:100%}` +
  `.katex-display>.katex{white-space:normal}` +
  `.katex-display{max-width:100%;overflow-x:auto;overflow-y:hidden;padding:.4em 0}` +
  PRINT_FIGURE_CSS +
  `body{font-family:${PAPER_FONT};color:#222;}`

// 把 HTML 中的 $...$ / $$...$$ 公式渲染成 KaTeX HTML
// （字符串级渲染，公式被 <br> 拆成多段也能正确匹配，如 \begin{array} 表格）
export const renderMathHtml = (html: string): string => renderMathInHtml(html)

// 独立文档的样式块：KaTeX + 换行兜底 + 页面背景 + 调用方额外样式
function buildStyleBlock(extraCss: string, backgroundColor: string): string {
  // 背景色兜底校验：只放行 hex 色值，非法输入静默回退默认白底
  const bg =
    typeof backgroundColor === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(backgroundColor)
      ? backgroundColor
      : ''
  // html/body 同色 + print-color-adjust:exact：浏览器默认不打印背景色，
  // 显式要求按屏幕色打印；body 背景按页绘制，多页导出时每页背景一致
  const bgCss = bg
    ? `html,body{background:${bg}!important;}body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}`
    : ''
  return `${katexCss}${katexWrapCss}${bgCss}${extraCss}`
}

export interface PrintDocumentOptions {
  extraCss?: string
  backgroundColor?: string
  renderMath?: boolean
  sanitize?: boolean
}

// 生成一份独立打印文档（不经过 window.open）。服务端无头打印 PDF 时用：
// 公式仍在浏览器侧渲染好，服务端只负责打印，避免在 Node 里再引一份 KaTeX。
export function buildPrintDocument(
  title: string,
  bodyHtml: string,
  opts: PrintDocumentOptions = {}
): string {
  const { extraCss = '', backgroundColor = '', renderMath = true, sanitize = true } = opts
  const safeBody = sanitize ? sanitizeHtml(bodyHtml) : bodyHtml
  const body = renderMath ? renderMathHtml(safeBody) : safeBody
  return (
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
    `<style>${buildStyleBlock(extraCss, backgroundColor)}</style></head>` +
    `<body>${body}</body></html>`
  )
}

/**
 * 正文来源：
 * - 字符串：直接写入（原有行为）
 * - 函数：拿到**已经打开的窗口**再做后续处理。这是为试卷分页准备的：
 *   分页必须在目标窗口里按真实字体、真实宽度测量，而 window.open 必须同步调用，
 *   否则会被浏览器当成弹窗拦截。回调里可以先把内容塞进 body 量高度，再返回最终 HTML。
 */
type BodySource = string | ((win: Window) => string | Promise<string>)

interface PrintHtmlOptions {
  // 额外注入的 CSS（如排版样式）；默认只注入 katex 与换行兜底
  extraCss?: string
  // 是否先把 bodyHtml 中的 $...$ 公式渲染成 KaTeX，默认 true
  renderMath?: boolean
  // 打印窗口尺寸
  width?: number
  height?: number
  // 自定义页面背景色（hex）。设置后注入到 html/body，保证打印/导出 PDF
  // 的每一页（含页边距区域）都统一应用该背景色；留空保持默认白底
  backgroundColor?: string
  // 打印前是否等图片解码完成。默认 false（结论/作业导出保持原行为），
  // 试卷必须打开：只等字体不等图片时，题干里的图会打成白框。
  waitForImages?: boolean
  // 是否对最终 HTML 过一遍消毒器，默认 true（原有行为）。
  // 试卷分页在调用前已逐块消毒并渲染了公式，这里再消毒会把 KaTeX 的 MathML 剥掉，
  // 因此试卷路径传 false。
  sanitize?: boolean
}

// 等待字体与（可选）图片就绪；超时兜底防止卡死
const waitReady = (win: Window, waitForImages: boolean): Promise<unknown> => {
  const doc = win.document
  const fontsReady: Promise<unknown> = doc.fonts?.ready ?? Promise.resolve()
  const imagesReady: Promise<unknown>[] = waitForImages
    ? Array.from(doc.images).map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.addEventListener('load', () => resolve(), { once: true })
              img.addEventListener('error', () => resolve(), { once: true })
            })
      )
    : []
  return Promise.race([
    Promise.all([fontsReady, ...imagesReady]),
    new Promise((r) => setTimeout(r, waitForImages ? 8000 : 3000))
  ])
}

// 打开打印窗口并触发浏览器「打印 / 另存为 PDF」
// 返回是否成功打开窗口（false 表示被浏览器弹窗拦截）
export const printHtml = (
  title: string,
  bodyHtml: BodySource,
  opts: PrintHtmlOptions = {}
): boolean => {
  const {
    extraCss = '',
    renderMath = true,
    width = 900,
    height = 700,
    backgroundColor = '',
    waitForImages = false,
    sanitize = true
  } = opts

  // 背景色兜底校验：只放行 hex 色值，非法输入静默回退默认白底
  const styleBlock = buildStyleBlock(extraCss, backgroundColor)

  const win = window.open('', '_blank', `width=${width},height=${height}`)
  if (!win) return false

  // 先只写 head，body 留空：函数式正文需要在这个窗口里先量高度，再把结果填回来
  win.document.write(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(
      title
    )}</title><style>${styleBlock}</style></head><body></body></html>`
  )
  win.document.close()
  win.focus()

  let printed = false
  // 触发打印，并用 printed 闸门保证只打一次：
  // waitForImages 的超时兜底与实际就绪可能同时到达，不去重会弹出两个打印对话框。
  const doPrint = () => {
    if (printed) return
    printed = true
    try {
      win.print()
    } catch (e) {
      console.error('[print] 触发打印失败:', e)
    }
  }

  // 把正文写进打印窗口，等图片/字体就绪后触发打印。
  // 无论就绪检测成功还是超时都会打——宁可少一张图，也不让用户对着空白窗口等。
  const finish = (raw: string) => {
    const safeBody = sanitize ? sanitizeHtml(raw) : raw
    const html = renderMath ? renderMathHtml(safeBody) : safeBody
    win.document.body.innerHTML = html
    waitReady(win, waitForImages).then(doPrint).catch(doPrint)
  }

  if (typeof bodyHtml === 'function') {
    Promise.resolve()
      .then(() => bodyHtml(win))
      .then(finish)
      .catch((e) => {
        console.error('[print] 生成打印内容失败:', e)
        win.close()
      })
  } else {
    finish(bodyHtml)
  }
  return true
}
