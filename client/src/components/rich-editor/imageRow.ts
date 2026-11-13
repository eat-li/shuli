// 并排图行：把连续的 image 节点包进一个块级容器，等宽成列渲染。
// 对外（浏览 / 打印 / 导出）只认 class re-img-row：sanitizeRichHtml 会剥
// style 与 data 属性，class 才能穿过保存、浏览、打印整条链路。
import { Node } from '@tiptap/core'
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import ImageRowView from './ImageRowView.vue'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    imageRow: {
      /** 选中图片时：与相邻连续图片合并成并排行；已在行内则拆行 */
      toggleImageRow: () => ReturnType
    }
  }
}

export const ImageRow = Node.create({
  name: 'imageRow',
  group: 'block',
  content: 'image+',

  parseHTML() {
    return [{ tag: 'div.re-img-row' }]
  },

  renderHTML() {
    return ['div', { class: 're-img-row' }, 0]
  },

  addNodeView() {
    return VueNodeViewRenderer(ImageRowView)
  },

  addCommands() {
    return {
      toggleImageRow:
        () =>
        ({ state, tr, dispatch }) => {
          const { selection } = state
          if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'image') {
            return false
          }
          const pos = selection.from
          const $pos = state.doc.resolve(pos)
          const parent = $pos.parent
          const index = $pos.index()

          if (parent.type.name === 'imageRow') {
            const rowPos = $pos.before()
            if (dispatch) {
              tr.replaceWith(rowPos, rowPos + parent.nodeSize, parent.content)
              tr.setSelection(NodeSelection.create(tr.doc, rowPos))
              dispatch(tr)
            }
            return true
          }

          // 向两侧扩展出包含当前图的「连续 image」区间；孤图不成立
          let first = index
          let last = index
          while (first > 0 && parent.child(first - 1).type.name === 'image') first--
          while (last < parent.childCount - 1 && parent.child(last + 1).type.name === 'image') {
            last++
          }
          if (first === last) return false

          const start = $pos.start()
          let from = -1
          let to = -1
          const nodes: PMNode[] = []
          parent.forEach((child, offset, i) => {
            if (i < first || i > last) return
            if (from < 0) from = start + offset
            to = start + offset + child.nodeSize
            nodes.push(child)
          })
          if (dispatch) {
            tr.replaceWith(from, to, state.schema.nodes.imageRow.create(null, nodes))
            let imagePos = from + 1
            for (let i = first; i < index; i++) imagePos += parent.child(i).nodeSize
            tr.setSelection(NodeSelection.create(tr.doc, imagePos))
            dispatch(tr)
          }
          return true
        }
    }
  },

  addProseMirrorPlugins() {
    // 两图行删掉一张后只剩单图：「并排」失去意义，自动拆回普通图片，
    // 不让用户再手动点一次取消并排。从后往前替换，避免位置偏移。
    return [
      new Plugin({
        key: new PluginKey('imageRowGuard'),
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((t) => t.docChanged)) return null
          const fixes: { pos: number; node: PMNode }[] = []
          newState.doc.descendants((node, pos) => {
            if (node.type.name === 'imageRow' && node.childCount < 2) fixes.push({ pos, node })
          })
          if (!fixes.length) return null
          const tr = newState.tr
          // 不设 addToHistory:false：追加事务默认并入删除的同一撤销事件，
          // 一次 Ctrl+Z 能同时找回被删的图和行结构
          for (let i = fixes.length - 1; i >= 0; i--) {
            const { pos, node } = fixes[i]
            if (node.childCount === 0) tr.delete(pos, pos + node.nodeSize)
            else tr.replaceWith(pos, pos + node.nodeSize, node.content)
          }
          return tr
        }
      })
    ]
  }
})