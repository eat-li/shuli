// 图表工具（纯函数，与 Vue/DOM 无关的部分集中在这里，便于复用与单测）
// 负责：渲染字体、dataURL → Blob、ECharts option JSON 解析。
import { i18n } from '../i18n'

// 图表内文字字体：与界面字体保持一致，并带中文字体回退，
// 保证导出的 PNG 中文不出现方框（mermaid 的 SVG 与 ECharts canvas 都用它）
export const DIAGRAM_FONT =
  "'PingFang SC','Microsoft YaHei','Helvetica Neue',Arial,'Noto Sans SC',sans-serif"

// dataURL（PNG）→ Blob：用于走已有的 POST /upload 上传 OSS，
// 避免把几百 KB 的 base64 直接写进结论/题目内容里。
export const dataUrlToBlob = (dataUrl: string): Blob => {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) throw new Error('图片数据格式异常')
  const head = dataUrl.slice(0, comma)
  const body = dataUrl.slice(comma + 1)
  const mime = /^data:([^;,]+)/.exec(head)?.[1] || 'image/png'
  if (/;base64/i.test(head)) {
    const bin = atob(body)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new Blob([bytes], { type: mime })
  }
  return new Blob([decodeURIComponent(body)], { type: mime })
}

// 高级模式：解析老师手写的 ECharts option JSON
// 返回 { option, error }：error 为空串表示可用；合法但为空时 option 为 null
export const parseChartOption = (text: string): { option: any | null; error: string } => {
  const raw = (text || '').trim()
  if (!raw) return { option: null, error: '' }
  try {
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return { option: null, error: i18n.global.t('diagram.error.jsonTopLevel') }
    }
    return { option: obj, error: '' }
  } catch (e: any) {
    return {
      option: null,
      error: i18n.global.t('diagram.error.jsonParseFailed', { message: String(e?.message || e) })
    }
  }
}
