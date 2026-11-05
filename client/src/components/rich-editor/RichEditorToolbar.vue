<template>
  <div class="re-toolbar">
    <el-tooltip :content="t('editor.toolbar.bold')" placement="top" :show-after="400">
      <button
        type="button"
        :aria-label="t('editor.toolbar.bold')"
        :aria-pressed="isActive('bold')"
        :class="{ active: isActive('bold') }"
        @click="run((c) => c.toggleBold())"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8" />
        </svg>
      </button>
    </el-tooltip>
    <el-tooltip :content="t('editor.toolbar.italic')" placement="top" :show-after="400">
      <button
        type="button"
        :aria-label="t('editor.toolbar.italic')"
        :aria-pressed="isActive('italic')"
        :class="{ active: isActive('italic') }"
        @click="run((c) => c.toggleItalic())"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="19" x2="10" y1="4" y2="4" />
          <line x1="14" x2="5" y1="20" y2="20" />
          <line x1="15" x2="9" y1="4" y2="20" />
        </svg>
      </button>
    </el-tooltip>
    <el-tooltip :content="t('editor.toolbar.strike')" placement="top" :show-after="400">
      <button
        type="button"
        :aria-label="t('editor.toolbar.strike')"
        :aria-pressed="isActive('strike')"
        :class="{ active: isActive('strike') }"
        @click="run((c) => c.toggleStrike())"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M16 4H9a3 3 0 0 0-2.83 4" />
          <path d="M14 12a4 4 0 0 1 0 8H6" />
          <line x1="4" x2="20" y1="12" y2="12" />
        </svg>
      </button>
    </el-tooltip>
    <el-tooltip :content="t('editor.toolbar.bulletList')" placement="top" :show-after="400">
      <button
        type="button"
        :aria-label="t('editor.toolbar.bulletList')"
        :aria-pressed="isActive('bulletList')"
        :class="{ active: isActive('bulletList') }"
        @click="run((c) => c.toggleBulletList())"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="8" x2="21" y1="6" y2="6" />
          <line x1="8" x2="21" y1="12" y2="12" />
          <line x1="8" x2="21" y1="18" y2="18" />
          <line x1="3" x2="3.01" y1="6" y2="6" />
          <line x1="3" x2="3.01" y1="12" y2="12" />
          <line x1="3" x2="3.01" y1="18" y2="18" />
        </svg>
      </button>
    </el-tooltip>
    <el-tooltip :content="t('editor.toolbar.orderedList')" placement="top" :show-after="400">
      <button
        type="button"
        :aria-label="t('editor.toolbar.orderedList')"
        :aria-pressed="isActive('orderedList')"
        :class="{ active: isActive('orderedList') }"
        @click="run((c) => c.toggleOrderedList())"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="10" x2="21" y1="6" y2="6" />
          <line x1="10" x2="21" y1="12" y2="12" />
          <line x1="10" x2="21" y1="18" y2="18" />
          <path d="M4 6h1v4" />
          <path d="M4 10h2" />
          <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
        </svg>
      </button>
    </el-tooltip>
    <span class="re-sep" />
    <el-tooltip :content="t('editor.toolbar.insertImage')" placement="top" :show-after="400">
      <button type="button" :aria-label="t('editor.toolbar.insertImage')" @click="emit('pick-image')">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </svg>
      </button>
    </el-tooltip>
    <el-tooltip :content="t('editor.toolbar.insertMath')" placement="top" :show-after="400">
      <button type="button" :aria-label="t('editor.toolbar.insertMath')" @click="insertMath">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M18 7V4H6l6 8-6 8h12v-3" />
        </svg>
      </button>
    </el-tooltip>
    <el-tooltip :content="t('editor.toolbar.insertDiagram')" placement="top" :show-after="400">
      <button
        type="button"
        :aria-label="t('editor.toolbar.insertDiagram')"
        :aria-pressed="diagramVisible"
        :class="{ active: diagramVisible }"
        @click="emit('open-diagram')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M3 3v18h18" />
          <rect width="3.6" height="7" x="7" y="11" rx="1" />
          <rect width="3.6" height="11" x="12.2" y="7" rx="1" />
          <rect width="3.6" height="4.6" x="17.4" y="13.4" rx="1" />
        </svg>
      </button>
    </el-tooltip>
    <span class="re-sep" />
    <el-dropdown trigger="click" @command="onFontSizeCommand">
      <button
        type="button"
        class="re-table-btn"
        :aria-label="
          t('editor.toolbar.fontSizeAria', {
            size: currentFontSize() || t('editor.toolbar.defaultSize')
          })
        "
        aria-haspopup="menu"
      >
        <span class="re-fontsize-label" aria-hidden="true">{{ fontSizeLabel }}</span>
        <span class="re-table-caret" aria-hidden="true">▾</span>
      </button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item command="default" divided>{{
            t('editor.toolbar.fontSizeDefault')
          }}</el-dropdown-item>
          <el-dropdown-item v-for="s in FONT_SIZES" :key="s" :command="s">
            {{ s }}
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
    <el-dropdown trigger="click" @command="onTableCommand">
      <button
        type="button"
        class="re-table-btn"
        :aria-label="t('editor.toolbar.table')"
        aria-haspopup="menu"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect width="18" height="18" x="3" y="3" rx="1" />
          <line x1="3" x2="21" y1="9" y2="9" />
          <line x1="3" x2="21" y1="15" y2="15" />
          <line x1="9" x2="9" y1="3" y2="21" />
          <line x1="15" x2="15" y1="3" y2="21" />
        </svg>
        <span class="re-table-caret">▾</span>
      </button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item command="markdown">{{
            t('editor.toolbar.tableMarkdown')
          }}</el-dropdown-item>
          <el-dropdown-item command="blank">{{ t('editor.toolbar.tableBlank') }}</el-dropdown-item>
          <el-dropdown-item v-if="inTable" command="rowAfter" divided>{{
            t('editor.toolbar.tableRowAfter')
          }}</el-dropdown-item>
          <el-dropdown-item v-if="inTable" command="rowBefore">{{
            t('editor.toolbar.tableRowBefore')
          }}</el-dropdown-item>
          <el-dropdown-item v-if="inTable" command="colAfter">{{
            t('editor.toolbar.tableColAfter')
          }}</el-dropdown-item>
          <el-dropdown-item v-if="inTable" command="colBefore">{{
            t('editor.toolbar.tableColBefore')
          }}</el-dropdown-item>
          <el-dropdown-item v-if="inTable" command="deleteRow" divided>{{
            t('editor.toolbar.tableDeleteRow')
          }}</el-dropdown-item>
          <el-dropdown-item v-if="inTable" command="deleteCol">{{
            t('editor.toolbar.tableDeleteCol')
          }}</el-dropdown-item>
          <el-dropdown-item v-if="inTable" command="deleteTable" divided>{{
            t('editor.toolbar.tableDeleteTable')
          }}</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
    <el-dropdown trigger="click" @command="(cmd: string) => emit('ai-command', cmd)">
      <button
        type="button"
        class="re-table-btn"
        :aria-label="t('editor.toolbar.ai')"
        aria-haspopup="menu"
        :disabled="aiLoading"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M9.9 2.6l1.8 4.7 4.7 1.8-4.7 1.8-1.8 4.7-1.8-4.7-4.7-1.8 4.7-1.8z" />
          <path d="M18 14.5l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z" />
        </svg>
        <span class="re-table-caret">▾</span>
      </button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item command="local">{{
            t('editor.toolbar.aiLocal')
          }}</el-dropdown-item>
          <el-dropdown-item command="ai" divided>{{
            t('editor.toolbar.aiCloud')
          }}</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
    <span class="re-sep" />
    <el-tooltip :content="t('editor.toolbar.undo')" placement="top" :show-after="400">
      <button
        type="button"
        :aria-label="t('editor.toolbar.undo')"
        @click="run((c) => c.undo())"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M3 7v6h6" />
          <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
        </svg>
      </button>
    </el-tooltip>
    <el-tooltip :content="t('editor.toolbar.redo')" placement="top" :show-after="400">
      <button
        type="button"
        :aria-label="t('editor.toolbar.redo')"
        @click="run((c) => c.redo())"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 7v6h-6" />
          <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
        </svg>
      </button>
    </el-tooltip>
    <el-tooltip
      v-if="allowSource"
      :content="t('editor.source.toggle')"
      placement="top"
      :show-after="400"
    >
      <button
        type="button"
        :aria-label="t('editor.source.toggle')"
        :aria-pressed="sourceVisible"
        :class="{ active: sourceVisible }"
        @click="emit('toggle-source')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      </button>
    </el-tooltip>
    <el-tooltip
      :content="
        isFullscreen ? t('editor.toolbar.exitFullscreenHint') : t('editor.toolbar.fullscreen')
      "
      placement="top"
      :show-after="400"
    >
      <button
        type="button"
        :aria-label="
          isFullscreen ? t('editor.toolbar.exitFullscreen') : t('editor.toolbar.fullscreen')
        "
        :aria-pressed="isFullscreen"
        :class="{ active: isFullscreen }"
        @click="emit('toggle-fullscreen')"
      >
        <svg
          v-if="!isFullscreen"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M8 3H5a2 2 0 0 0-2 2v3" />
          <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
          <path d="M3 16v3a2 2 0 0 0 2 2h3" />
          <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
        </svg>
        <svg
          v-else
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M8 3v3a2 2 0 0 1-2 2H3" />
          <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
          <path d="M3 16h3a2 2 0 0 1 2 2v3" />
          <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
        </svg>
      </button>
    </el-tooltip>
  </div>
</template>

<script setup lang="ts">
// 工具栏从 RichEditor 拆出：只负责「按钮 → 编辑器命令」与下拉菜单，
// 图片选择、图表弹窗、AI 排版、全屏这些跨组件动作交回宿主处理。
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ChainedCommands, Editor } from '@tiptap/core'
import { ElMessage, ElMessageBox } from 'element-plus'
import { markdownTableToHtml } from '../../utils/markdownTable'

const props = defineProps<{
  editor: Editor
  isFullscreen: boolean
  aiLoading: boolean
  diagramVisible: boolean
  /** 是否显示「源码」开关（题目表单里开启，其它宿主保持原样） */
  allowSource: boolean
  sourceVisible: boolean
}>()

const { t } = useI18n()

const emit = defineEmits<{
  'pick-image': []
  'open-diagram': []
  'ai-command': [cmd: string]
  'toggle-fullscreen': []
  'toggle-source': []
}>()

// Tiptap 的事务不会让父组件重渲染（editor 这个 ref 本身没变），
// 按钮高亮 / 字号标签 / 表格菜单都依赖选区状态，所以自己订阅事务来触发重算。
const tick = ref(0)
const bump = () => {
  tick.value++
}
watch(
  () => props.editor,
  (ed) => {
    ed.on('transaction', bump)
    tick.value++
  },
  { immediate: true }
)
onBeforeUnmount(() => props.editor.off('transaction', bump))

const isActive = (name: string) => {
  void tick.value
  return props.editor.isActive(name)
}

const run = (fn: (chain: ChainedCommands) => ChainedCommands) => {
  const chain = props.editor.chain().focus()
  fn(chain).run()
}

// —— 字号 ——
const FONT_SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '32px']
const currentFontSize = () => {
  void tick.value
  return props.editor.getAttributes('fontSize')?.size || ''
}
const fontSizeLabel = computed(() => {
  const size = currentFontSize()
  return size ? String(size).replace('px', '') + 'px' : t('editor.toolbar.fontSize')
})
const onFontSizeCommand = (cmd: string) => {
  const chain = props.editor.chain().focus()
  if (cmd === 'default') chain.unsetMark('fontSize').run()
  else chain.setMark('fontSize', { size: cmd }).run()
}

// —— 表格 ——
const inTable = computed(() => {
  void tick.value
  return props.editor.isActive('table')
})

const onTableCommand = (cmd: string) => {
  const chain = props.editor.chain().focus()
  switch (cmd) {
    case 'markdown':
      insertTableByMarkdown()
      break
    case 'blank':
      chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
      break
    case 'rowAfter':
      chain.addRowAfter().run()
      break
    case 'rowBefore':
      chain.addRowBefore().run()
      break
    case 'colAfter':
      chain.addColumnAfter().run()
      break
    case 'colBefore':
      chain.addColumnBefore().run()
      break
    case 'deleteRow':
      chain.deleteRow().run()
      break
    case 'deleteCol':
      chain.deleteColumn().run()
      break
    case 'deleteTable':
      chain.deleteTable().run()
      break
  }
}

const insertTableByMarkdown = async () => {
  try {
    const { value } = await ElMessageBox.prompt(
      t('editor.table.markdownPrompt'),
      t('editor.table.markdownTitle'),
      {
        // ElMessageBox 没有 inputAutosize（那是 el-input 的属性），
        // 传了不会生效、只会被类型检查拦下；textarea 高度交给 EP 默认。
        inputType: 'textarea',
        confirmButtonText: t('editor.table.insert'),
        cancelButtonText: t('common.cancel')
      }
    )
    const html = markdownTableToHtml(value || '')
    if (!html) {
      ElMessage.warning(t('editor.table.markdownInvalid'))
      return
    }
    props.editor.chain().focus().insertContent(html).run()
  } catch {
    /* 用户取消 */
  }
}

const insertMath = async () => {
  try {
    const { value } = await ElMessageBox.prompt(
      t('editor.math.prompt'),
      t('editor.math.title'),
      {
        confirmButtonText: t('editor.table.insert'),
        cancelButtonText: t('common.cancel'),
        inputPattern: /\S+/,
        inputErrorMessage: t('editor.math.required')
      }
    )
    props.editor.chain().focus().insertContent(`$${value}$`).run()
  } catch {
    /* 用户取消 */
  }
}
</script>

<style scoped>
.re-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 6px;
  border-bottom: 1px solid var(--hair);
  background: var(--surface-muted);
}
.re-toolbar button {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  background: transparent;
  border-radius: var(--radius);
  cursor: pointer;
  color: var(--ink-regular);
  padding: 0;
  transition:
    background-color var(--dur) var(--ease),
    border-color var(--dur) var(--ease),
    color var(--dur) var(--ease);
}
.re-toolbar button svg {
  width: 16px;
  height: 16px;
}
.re-toolbar button:hover {
  background: var(--surface);
}
.re-toolbar button.active {
  background: var(--moss-soft);
  border-color: var(--moss-border);
  color: var(--moss-deep);
}
.re-toolbar button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
/* 分组分隔：13 个图标一路排开时分不清「写字 / 插图 / 处理」三类动作 */
.re-sep {
  width: 1px;
  height: 16px;
  margin: 0 4px;
  align-self: center;
  background: var(--hair);
}
.re-table-btn {
  width: auto !important;
  padding: 0 6px !important;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
/* 字号下拉的当前值：定宽避免数字变化时工具栏抖动 */
.re-fontsize-label {
  min-width: 26px;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
}
.re-table-caret {
  font-size: 10px;
  line-height: 1;
}
</style>
