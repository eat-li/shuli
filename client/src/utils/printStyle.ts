// 打印样式常量：不依赖 KaTeX / 窗口 API。
// 页面如果只是搭导出 HTML、并不立即打印，可以只引这个模块，
// 避免把 KaTeX 的 JS 一起拽进页面首屏。

// 试卷导出字体（经典试卷风）：英文/数字/标点用 Times New Roman（与 KaTeX 公式的
// Times 风格字形统一），中文回退到宋体/思源宋体等衬线中文字体。
// 各导出模板（作业/题目/结论）统一引用，避免各写一份。
export const PAPER_FONT =
  "'Times New Roman','Times','宋体','SimSun','STSong','Songti SC','Noto Serif SC',serif"

// —— 题图的纸上尺寸上限 ——
// 富文本里的图片带的是上传瞬间写进 <img> 的自然像素 width（常见 1400px 以上），
// 不设上限时它会按 A4 版心（174mm）铺满，一张几何图就吃掉半页，或者干脆被
// 分页容器 overflow:hidden 裁掉。这里用 mm 而不是 px：换台电脑、换个浏览器，
// 纸上还是同一个尺寸（与 paperPrintCss.ts 的约定一致）。
// 只设上限不设固定尺寸：小图不会被放大，用户手动缩小的图仍按自身宽度排。
export const FIGURE_MAX_WIDTH_MM = 110
export const FIGURE_MAX_HEIGHT_MM = 70

/** 题图在纸上的兜底样式；屏幕/编辑器另有自己的上限，不要混用 */
export const PRINT_FIGURE_CSS =
  `img{max-width:min(100%,${FIGURE_MAX_WIDTH_MM}mm);max-height:${FIGURE_MAX_HEIGHT_MM}mm;` +
  `height:auto;object-fit:contain;display:block;margin:6px auto}` +
  // 对齐由编辑器写进 class（内联 style 会被消毒器剥掉）
  `img.re-img--left{margin-left:0;margin-right:auto}` +
  `img.re-img--right{margin-left:auto;margin-right:0}` +
  // 表格里的图跟随单元格宽度，mm 上限会把它顶出格子
  `table img{max-width:100%;max-height:none;display:inline;margin:0}`
