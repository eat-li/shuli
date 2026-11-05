// 试卷 / 答题卡打印样式。
//
// ⚠️ 这里是**印刷介质**，全部色值写字面量（黑 / 白 / 灰阶），不接屏幕主题令牌。
// 打印件的墨量、灰度与屏幕完全不是一套约束：套用主题的群青 #1a3d8f，
// 黑白激光打印后会变成一片接近黑的中灰，反而看不出层级。
// 遵循 .impeccable.md「打印 / 位图介质一律固定字面色值」的约定，
// 每处字面色值都用 /* audit-allow */ 登记理由，不要顺手统一成 var(--*)。
//
// 尺寸一律用 mm / pt：屏幕 px 与纸张 mm 的换算依赖 DPI，
// 只有 mm 才能保证换台电脑、换个浏览器打出来还是 210×297。

import { FIGURE_MAX_HEIGHT_MM, FIGURE_MAX_WIDTH_MM } from './printHtml'

export const PAPER_FONT_SERIF =
  "'Times New Roman','Times','宋体','SimSun','STSong','Songti SC','Noto Serif SC',serif"

export const PAPER_FONT_HEI =
  "'SimHei','Heiti SC','Microsoft YaHei','Noto Sans SC','Source Han Sans SC',sans-serif"

/** A4 纵向，左侧 20mm 留装订线 */
export const PAPER_GEOMETRY = {
  pageWidthMm: 210,
  pageHeightMm: 297,
  padTopMm: 20,
  padRightMm: 16,
  padBottomMm: 18,
  padLeftMm: 20,
  /** 内容区尺寸 */
  contentWidthMm: 174,
  contentHeightMm: 259,
  /** 页脚占位（落在下边距里，不挤占内容区） */
  footerBottomMm: 8,
  /** 装订线距左边缘 */
  bindingLeftMm: 6
}

// 生成试卷 / 答题卡共用的打印样式表（含 @page 与纸张骨架）。
// 返回值直接塞进打印窗口，所以这里是字面色值——canvas 与打印窗口都取不到 CSS 变量。
export const buildPaperCss = (): string => `
@page { size: A4 portrait; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; } /* audit-allow —— 纸张底色固定白 */
body { font-family: ${PAPER_FONT_SERIF}; color: #000; } /* audit-allow —— 印刷正文固定黑 */

/* —— 页面骨架 —— */
.paper-page {
  position: relative;
  width: ${PAPER_GEOMETRY.pageWidthMm}mm;
  height: ${PAPER_GEOMETRY.pageHeightMm}mm;
  padding: ${PAPER_GEOMETRY.padTopMm}mm ${PAPER_GEOMETRY.padRightMm}mm
    ${PAPER_GEOMETRY.padBottomMm}mm ${PAPER_GEOMETRY.padLeftMm}mm;
  overflow: hidden;
  page-break-after: always;
  break-after: page;
  background: #fff; /* audit-allow —— 纸张底色固定白 */
}
.paper-page:last-child { page-break-after: auto; break-after: auto; }
.paper-page__footer {
  position: absolute;
  left: ${PAPER_GEOMETRY.padLeftMm}mm;
  right: ${PAPER_GEOMETRY.padRightMm}mm;
  bottom: ${PAPER_GEOMETRY.footerBottomMm}mm;
  text-align: center;
  font-size: 9pt;
  color: #000; /* audit-allow —— 印刷正文固定黑 */
}
/* 装订线：落在左边距里，虚线不压正文 */
.paper-page__binding {
  position: absolute;
  left: ${PAPER_GEOMETRY.bindingLeftMm}mm;
  top: ${PAPER_GEOMETRY.padTopMm}mm;
  bottom: ${PAPER_GEOMETRY.padBottomMm}mm;
  border-left: 1px dashed #666; /* audit-allow —— 印刷虚线 */
  width: 0;
}
.paper-page__binding-text {
  position: absolute;
  left: ${PAPER_GEOMETRY.bindingLeftMm - 3.2}mm;
  top: 50%;
  transform: translateY(-50%);
  writing-mode: vertical-rl;
  font-size: 8pt;
  color: #666; /* audit-allow —— 印刷辅助文字 */
  letter-spacing: 2mm;
}

/* 测量容器：与内容区同宽，供装箱时读取真实高度 */
.paper-flow { width: ${PAPER_GEOMETRY.contentWidthMm}mm; }
.paper-flow .pblock { break-inside: auto; }
.paper-page .pblock { break-inside: avoid; page-break-inside: avoid; }

/* —— 卷头 —— */
.paper-head { margin-bottom: 4mm; }
.paper-head__row {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  font-size: 9pt;
  margin-bottom: 2mm;
}
.paper-head__title {
  text-align: center;
  font-family: ${PAPER_FONT_HEI};
  font-size: 18pt;
  font-weight: 700;
  letter-spacing: 1pt;
  margin: 1mm 0 2mm;
}
.paper-head__sub {
  text-align: center;
  font-size: 10.5pt;
  margin-bottom: 2mm;
}
.paper-head__rule { border-top: 1.2pt double #000; height: 0; } /* audit-allow —— 印刷双线 */

/* —— 注意事项 —— */
.paper-notice {
  border: 1px solid #000; /* audit-allow —— 印刷边框 */
  padding: 2mm 3mm;
  margin: 3mm 0 4mm;
  font-size: 9pt;
  line-height: 1.65;
}
.paper-notice__title { font-family: ${PAPER_FONT_HEI}; font-weight: 700; }
.paper-notice ol { margin: 1mm 0 0; padding-left: 5mm; }

/* —— 卷 / 大题标题 —— */
.paper-volume {
  text-align: center;
  font-family: ${PAPER_FONT_HEI};
  font-size: 12pt;
  font-weight: 700;
  margin: 3mm 0 2mm;
}
.paper-section-title {
  font-family: ${PAPER_FONT_HEI};
  font-size: 10.5pt;
  font-weight: 700;
  line-height: 1.6;
  margin: 3mm 0 2mm;
  break-after: avoid;
  page-break-after: avoid;
}

/* —— 题目 —— */
.q { margin-bottom: 4mm; }
.q__head { display: flex; align-items: baseline; gap: 1.5mm; }
.q__no {
  font-family: ${PAPER_FONT_HEI};
  font-weight: 700;
  font-size: 10.5pt;
  flex: none;
}
.q__body { flex: 1; min-width: 0; font-size: 10.5pt; line-height: 1.75; }
.q__score { flex: none; font-size: 10pt; }
.q__extra { margin-top: 1mm; font-size: 10.5pt; line-height: 1.75; }
.q-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 6mm;
  row-gap: 1mm;
  margin: 1.5mm 0 0 7mm;
  font-size: 10.5pt;
}
.q-options--one { grid-template-columns: 1fr; }
.q-option { display: flex; gap: 1mm; }
.q-option__key { flex: none; font-family: ${PAPER_FONT_HEI}; }
.q-gap { width: 100%; }

/* —— 通用排版兜底（这三条是踩过的坑） —— */
/* 1) 打印时不能滚动：原来的 overflow-x:auto 在纸上等于把长公式裁掉 */
.katex-display { overflow: visible !important; max-width: 100% !important; }
.katex { white-space: normal; overflow-wrap: break-word; max-width: 100%; }
/* 2) 宽表：markdown 表格没有外层容器，只能在这里兜 */
.paper-page table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 9pt; }
.paper-page th, .paper-page td { border: 1px solid #000; padding: 1mm 1.5mm; word-break: break-word; } /* audit-allow —— 印刷表格线 */
.paper-page table img { max-width: 100%; max-height: none; }
/* 3) 图片：打印窗口不保证图片已解码，样式上先兜住「宽 × 高」两道上限。
   只兜宽度的话，超高图会撑破 .paper-page 的 overflow:hidden 被裁掉一截。 */
.paper-page img {
  max-width: min(100%, ${FIGURE_MAX_WIDTH_MM}mm);
  max-height: ${FIGURE_MAX_HEIGHT_MM}mm;
  height: auto;
  object-fit: contain;
}
.paper-page pre {
  white-space: pre-wrap;
  word-break: break-word;
  border: 1px solid #000; /* audit-allow —— 印刷边框 */
  padding: 2mm;
  font-size: 9pt;
}
.paper-page p { margin: 0 0 1mm; }
.wide-math .katex-display { font-size: 0.92em; }

/* —— 答题卡 —— */
.as-title {
  text-align: center;
  font-family: ${PAPER_FONT_HEI};
  font-size: 16pt;
  font-weight: 700;
  margin-bottom: 3mm;
}
.as-info { width: 100%; border-collapse: collapse; margin-bottom: 4mm; }
.as-info th, .as-info td {
  border: 1px solid #000; /* audit-allow —— 印刷表格线 */
  height: 9mm;
  font-size: 10pt;
  padding: 1mm 2mm;
}
.as-info th { font-family: ${PAPER_FONT_HEI}; width: 18mm; text-align: center; }
.as-hint { font-size: 9pt; margin: 2mm 0; }
.as-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  column-gap: 2mm;
  row-gap: 2mm;
  margin: 2mm 0 4mm;
}
.as-item { font-size: 10pt; display: flex; align-items: center; gap: 1mm; }
.as-item__no { font-family: ${PAPER_FONT_HEI}; min-width: 6mm; }
.bubble {
  display: inline-block;
  width: 5mm;
  height: 2.6mm;
  border: 1px solid #000; /* audit-allow —— 填涂框 */
  border-radius: 1mm;
}
.as-block {
  border: 1px solid #000; /* audit-allow —— 作答区外框 */
  margin-bottom: 3mm;
  position: relative;
  padding: 2mm;
}
.as-block__head { font-family: ${PAPER_FONT_HEI}; font-size: 10pt; margin-bottom: 1mm; }
.as-block__score {
  position: absolute;
  right: 2mm;
  top: 2mm;
  font-size: 10pt;
}
`
