// 自定义数学公式扩展：在原生 @tiptap/extension-mathematics 基础上，
// 增加对 $$...$$（块级）公式的支持，并在渲染时区分行内 / 块级显示模式。
//
// 与原生实现不同：这里按「段落」为单位拼接文本再匹配，公式即使被硬换行
// （多行粘贴产生的 <br>）拆成多个文本节点，也能整体匹配并渲染。
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import katex from 'katex'

// 匹配 $$...$$（块级，允许换行）与 $...$（行内，不跨行）
const mathRegex = /\$\$([\s\S]+?)\$\$|\$([^\$\n]+?)\$/gi

export const Mathematics = Extension.create({
  name: 'mathematics',

  addProseMirrorPlugins() {
    const editor = this.editor

    return [
      new Plugin({
        key: new PluginKey('mathematics'),
        props: {
          decorations(state) {
            const decorations: Decoration[] = []
            const { selection } = state
            const isEditable = editor.isEditable

            state.doc.descendants((node, pos) => {
              if (node.type.name !== 'paragraph') return

              // 拼接段落内所有文本节点（硬换行用 \n 连接），并记录每个片段的文档位置
              const pieces: { from: number; text: string }[] = []
              const breaks: number[] = [] // 段落内硬换行的文档位置
              let joined = ''
              node.forEach((child, offset) => {
                if (child.isText) {
                  pieces.push({ from: pos + offset + 1, text: child.text || '' })
                  joined += child.text || ''
                } else if (child.type.name === 'hardBreak') {
                  breaks.push(pos + offset + 1)
                  joined += '\n'
                }
              })
              if (!joined) return

              mathRegex.lastIndex = 0
              let match
              while ((match = mathRegex.exec(joined))) {
                const display = match[1] !== undefined
                // 块级公式内容中可能残留嵌套的 $（如 $$...$...$$），一并去掉
                const content = display ? (match[1] || '').replace(/\$/g, '') : match[2]
                if (!content) continue

                const mStart = match.index
                const mEnd = mStart + match[0].length

                // 把拼接串上的匹配区间映射回文档位置（可能覆盖多个文本片段）
                let cursor = 0
                let docFrom = -1
                let docTo = -1
                for (const p of pieces) {
                  const pStart = cursor
                  const pEnd = cursor + p.text.length
                  const s = Math.max(pStart, mStart)
                  const e = Math.min(pEnd, mEnd)
                  if (s < e) {
                    const f = p.from + (s - pStart)
                    const t = p.from + (e - pStart)
                    if (docFrom < 0) docFrom = f
                    docTo = t
                  }
                  cursor = pEnd
                }
                if (docFrom < 0 || docTo <= docFrom) continue

                // 光标位于公式内部时显示源码，便于编辑；否则隐藏源码、显示渲染结果
                const selectionSize = selection.from - selection.to
                const anchorIsInside = selection.anchor >= docFrom && selection.anchor <= docTo
                const rangeIsInside = selection.from >= docFrom && selection.to <= docTo
                const isEditing = (selectionSize === 0 && anchorIsInside) || rangeIsInside

                decorations.push(
                  Decoration.inline(
                    docFrom,
                    docTo,
                    {
                      class:
                        isEditing && isEditable
                          ? 'Tiptap-mathematics-editor'
                          : 'Tiptap-mathematics-editor Tiptap-mathematics-editor--hidden',
                      style:
                        !isEditing || !isEditable
                          ? 'display:inline-block;height:0;opacity:0;overflow:hidden;position:absolute;width:0;'
                          : undefined
                    },
                    { content, display }
                  )
                )

                // 公式内部的硬换行也隐藏，避免渲染结果下方出现多余空行
                for (const b of breaks) {
                  if (b > docFrom && b < docTo) {
                    decorations.push(
                      Decoration.node(b, b + 1, { style: 'display:none;' }, { content, display })
                    )
                  }
                }

                if (!isEditable || !isEditing) {
                  decorations.push(
                    Decoration.widget(
                      docFrom,
                      () => {
                        const element = document.createElement('span')
                        element.classList.add('Tiptap-mathematics-render')
                        if (display) element.classList.add('Tiptap-mathematics-render--display')
                        try {
                          katex.render(content, element, {
                            displayMode: display,
                            throwOnError: false,
                            strict: false
                          })
                        } catch {
                          element.textContent = content
                        }
                        return element
                      },
                      { content, display }
                    )
                  )
                }
              }
            })

            return DecorationSet.create(state.doc, decorations)
          }
        }
      })
    ]
  }
})
