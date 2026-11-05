import { Mark, mergeAttributes } from '@tiptap/core'

/**
 * 字号标记：把选中的文字包成 <span style="font-size:…">。
 *
 * 为什么要自己写：Tiptap v2 的 StarterKit 不含字号，而官方做法要额外装
 * @tiptap/extension-text-style —— 为一个功能引一个依赖不划算。
 * 渲染结果就是普通行内样式，保存成 HTML 后能原样往返，打印导出直接生效。
 *
 * 用内置命令即可操作，无需自定义命令：
 *   editor.chain().focus().setMark('fontSize', { size: '18px' }).run()
 *   editor.chain().focus().unsetMark('fontSize').run()
 */
export const FontSize = Mark.create({
  name: 'fontSize',

  addAttributes() {
    return {
      size: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).style.fontSize || null,
        renderHTML: (attrs) => (attrs.size ? { style: `font-size:${attrs.size}` } : {})
      }
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[style*="font-size"]',
        // 返回 false 表示「这个 span 不是字号标记」，交给其它扩展处理
        getAttrs: (el) => ((el as HTMLElement).style.fontSize ? null : false)
      }
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0]
  }
})
