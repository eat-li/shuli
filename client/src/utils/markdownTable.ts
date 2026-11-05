// Markdown 表格 → HTML 表格（GitHub 风格）
// 支持：表头行、分隔行（:--- 左对齐 / ---: 右对齐 / :---: 居中）、
// 单元格文本转义（保留 $...$ 公式文本，供 KaTeX 渲染）、反斜杠转义的管道 \|
import { escapeHtml } from './format'

// 粘贴内容 → HTML 表格；判断不出是表格时返回 null，由调用方继续尝试其它解析方式。
// 要求「表头 + 分隔行」同时存在才算表格，单行带竖线的正文不会被误判。
export function markdownTableToHtml(text: string): string | null {
  if (!text || !text.includes('|')) return null

  const lines = text.split(/\r?\n/)
  // 定位表格块起始（第一个以 | 开头的行）
  const start = lines.findIndex((l) => l.trim().startsWith('|'))
  if (start < 0) return null

  const block: string[] = []
  for (let i = start; i < lines.length; i++) {
    const t = lines[i].trim()
    if (!t.startsWith('|')) break
    block.push(t)
  }
  if (block.length < 2) return null // 至少要有表头 + 分隔行

  // 解析一行单元格（支持 \| 转义）
  const parseRow = (line: string): string[] => {
    const s = line.replace(/^\|/, '').replace(/\|$/, '')
    return s.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim())
  }

  // 分隔行判断：| --- | :--: | ---: |
  const isSep = (cells: string[]) =>
    cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c.replace(/\s/g, '')))

  const header = parseRow(block[0])
  const rest = block.slice(1)
  const sepIndex = rest.findIndex((r) => isSep(parseRow(r)))
  if (sepIndex < 0) return null // 没有分隔行，不是 Markdown 表格

  const align = parseRow(rest[sepIndex]).map((c) => {
    const s = c.replace(/\s/g, '')
    if (s.startsWith(':') && s.endsWith(':')) return 'center'
    if (s.endsWith(':')) return 'right'
    return 'left'
  })
  const bodyRows = rest.slice(sepIndex + 1)

  // 生成单元格：按分隔行声明的对齐方式挂 text-align。
  // 内容先转义再交给 KaTeX，所以 $…$ 会以纯文本进 DOM，公式不会被转义坏掉。
  const cellHtml = (content: string, tag: string, i: number) => {
    const al = align[i] || 'left'
    const style = al === 'left' ? '' : ` style="text-align:${al}"`
    return `<${tag}${style}>${escapeHtml(content)}</${tag}>`
  }

  const thead = `<thead><tr>${header.map((c, i) => cellHtml(c, 'th', i)).join('')}</tr></thead>`
  const tbody = bodyRows.length
    ? `<tbody>${bodyRows
        .map(
          (r) =>
            `<tr>${parseRow(r)
              .map((c, i) => cellHtml(c, 'td', i))
              .join('')}</tr>`
        )
        .join('')}</tbody>`
    : ''

  // 外层必须包一层可横向滚动的容器：手机上表格几乎必然比屏宽，
  // 裸 <table> 会把整页撑破（D8）。样式见 RichContent.vue 的 .tableWrapper。
  return `<div class="tableWrapper"><table>${thead}${tbody}</table></div>`
}
