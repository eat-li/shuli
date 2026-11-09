<template>
  <node-view-wrapper
    class="re-fig"
    :class="{ 'is-selected': selected }"
    :data-align="align"
    @click="selectNode"
  >
    <div ref="frameEl" class="re-fig__frame" :style="frameStyle">
      <img
        ref="imgEl"
        :src="node.attrs.src"
        :alt="node.attrs.alt || ''"
        draggable="false"
        @dblclick.stop="openPreview"
      />

      <!-- 工具条压在图片右上角：不参与文档流、不会被 .re-content 的滚动容器裁掉，
           也不需要跟着滚动重算位置。mousedown.prevent 防止点按钮时丢掉图片选区。 -->
      <div v-if="selected" class="re-fig__bar" contenteditable="false" @mousedown.prevent>
        <el-tooltip
          v-for="a in ALIGNS"
          :key="a.value"
          :content="t(a.label)"
          placement="top"
          :show-after="400"
        >
          <button
            type="button"
            class="re-fig__btn re-fig__btn--icon"
            :class="{ 'is-on': align === a.value }"
            :aria-label="t(a.label)"
            :aria-pressed="align === a.value"
            @click="setAlign(a.value)"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <line
                v-for="(l, i) in a.lines"
                :key="i"
                :x1="l[0]"
                :x2="l[1]"
                :y1="l[2]"
                :y2="l[2]"
              />
            </svg>
          </button>
        </el-tooltip>

        <span class="re-fig__sep" />

        <button
          v-for="p in PERCENTS"
          :key="p"
          type="button"
          class="re-fig__btn"
          :aria-label="t('editor.image.sizePercent', { n: p })"
          @click="setPercent(p)"
        >
          {{ p }}%
        </button>
        <button
          type="button"
          class="re-fig__btn"
          :aria-label="t('editor.image.sizeOriginal')"
          @click="setOriginal"
        >
          {{ t('editor.image.sizeOriginalShort') }}
        </button>

        <span class="re-fig__size">{{
          shownWidth ? shownWidth + 'px' : t('editor.image.sizeAuto')
        }}</span>

        <span class="re-fig__sep" />

        <el-tooltip :content="t('editor.image.viewLarge')" placement="top" :show-after="400">
          <button
            type="button"
            class="re-fig__btn re-fig__btn--icon"
            :aria-label="t('editor.image.viewLarge')"
            @click="openPreview"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="16.5" x2="21" y1="16.5" y2="21" />
              <line x1="8" x2="14" y1="11" y2="11" />
              <line x1="11" x2="11" y1="8" y2="14" />
            </svg>
          </button>
        </el-tooltip>
        <el-tooltip :content="t('editor.image.remove')" placement="top" :show-after="400">
          <button
            type="button"
            class="re-fig__btn re-fig__btn--icon is-danger"
            :aria-label="t('editor.image.remove')"
            @click="remove"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M3 6h18" />
              <path d="M8 6V4h8v2" />
              <path d="M19 6l-1 14H6L5 6" />
            </svg>
          </button>
        </el-tooltip>
      </div>

      <!-- 左右把手：只改宽度（高度始终按比例），拖动中只改样式，松手才写节点 -->
      <span
        v-if="selected"
        class="re-fig__grip re-fig__grip--w"
        role="separator"
        :aria-label="t('editor.image.resizeHint')"
        @pointerdown="startResize(-1, $event)"
      />
      <span
        v-if="selected"
        class="re-fig__grip re-fig__grip--e"
        role="separator"
        :aria-label="t('editor.image.resizeHint')"
        @pointerdown="startResize(1, $event)"
      />
    </div>
  </node-view-wrapper>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'

const props = defineProps(nodeViewProps)
const { t } = useI18n()

const MIN_WIDTH = 60
const MAX_WIDTH = 1600

const ALIGNS = [
  {
    value: 'left',
    label: 'editor.image.alignLeft',
    lines: [
      [4, 20, 6],
      [4, 14, 12],
      [4, 17, 18]
    ]
  },
  {
    value: 'center',
    label: 'editor.image.alignCenter',
    lines: [
      [4, 20, 6],
      [7, 17, 12],
      [6, 18, 18]
    ]
  },
  {
    value: 'right',
    label: 'editor.image.alignRight',
    lines: [
      [4, 20, 6],
      [10, 20, 12],
      [7, 20, 18]
    ]
  }
] as const

const PERCENTS = [25, 50, 75] as const

const imgEl = ref<HTMLImageElement>()
const frameEl = ref<HTMLElement>()

const align = computed(() => (props.node.attrs.align as string) || 'center')

const widthPx = computed(() => {
  const w = Number.parseInt(String(props.node.attrs.width ?? ''), 10)
  return Number.isFinite(w) && w > 0 ? w : 0
})

// 拖拽过程中用本地宽度驱动样式：只依赖响应式数据，避免「直接改 DOM 被下一次
// patch 覆盖」这一类问题（工具条上的 px 读数也要跟着动）。
const dragging = ref(false)
const liveWidth = ref(0)
const shownWidth = computed(() => (dragging.value ? liveWidth.value : widthPx.value))
const frameStyle = computed(() => {
  const w = shownWidth.value
  return w ? { width: `${w}px` } : {}
})

const selectNode = () => {
  if (props.selected) return
  const pos = props.getPos()
  if (typeof pos === 'number') props.editor.commands.setNodeSelection(pos)
}

const setAlign = (value: string) => {
  props.updateAttributes({ align: value })
}

const commitWidth = (w: number | null) => {
  props.updateAttributes({ width: w == null ? null : String(Math.round(w)), height: null })
}

const contentWidth = () => props.editor.view.dom.clientWidth || 0

const setPercent = (percent: number) => {
  const base = contentWidth()
  if (!base) return
  commitWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, (base * percent) / 100)))
}

const setOriginal = () => {
  const natural = imgEl.value?.naturalWidth || 0
  if (!natural) return
  commitWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, natural)))
}

const startResize = (dir: 1 | -1, e: PointerEvent) => {
  e.preventDefault()
  e.stopPropagation()
  const startW = widthPx.value || frameEl.value?.clientWidth || 0
  if (!startW) return
  const startX = e.clientX
  liveWidth.value = startW
  dragging.value = true

  const onMove = (ev: PointerEvent) => {
    const next = startW + dir * (ev.clientX - startX)
    liveWidth.value = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(next)))
  }
  const detach = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onEnd)
    window.removeEventListener('pointercancel', onCancel)
  }
  const onEnd = () => {
    detach()
    dragging.value = false
    commitWidth(liveWidth.value)
  }
  // 触屏被系统手势打断、拖到窗口外、切走页面都会发 pointercancel 而不是 pointerup。
  // 只听 pointerup 的话这一路永远走不到：监听器留在 window 上、dragging 卡在 true，
  // 图片宽度停在拖拽中间值，之后任意一次 pointerup 还会把这个过期宽度
  // 写进可能已经被删掉的节点。取消时不提交，宽度自然回落到上一次的值。
  const onCancel = () => {
    detach()
    dragging.value = false
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onEnd)
  window.addEventListener('pointercancel', onCancel)
}

const remove = () => props.deleteNode()

// 预览交给宿主 RichEditor：节点视图里拿不到它的状态，用自定义事件上报图片地址
const openPreview = () => {
  props.editor.view.dom.dispatchEvent(
    new CustomEvent('re:image-preview', {
      bubbles: true,
      detail: { src: props.node.attrs.src }
    })
  )
}
</script>

<style scoped>
.re-fig {
  display: flex;
  margin: 8px 0;
  line-height: 0;
}
.re-fig[data-align='left'] {
  justify-content: flex-start;
}
.re-fig[data-align='center'] {
  justify-content: center;
}
.re-fig[data-align='right'] {
  justify-content: flex-end;
}
.re-fig__frame {
  position: relative;
  max-width: 100%;
  border-radius: var(--radius-xs);
}
.re-fig.is-selected .re-fig__frame {
  outline: 2px solid var(--moss);
  outline-offset: 2px;
}
.re-fig__frame img {
  display: block;
  width: 100%;
  height: auto;
  margin: 0;
  border-radius: var(--radius-xs);
  cursor: default;
}
.re-fig__bar {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  background: var(--surface);
  border: 1px solid var(--hair);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-pop);
  line-height: 1;
  cursor: default;
}
.re-fig__btn {
  height: 24px;
  padding: 0 6px;
  border: 0;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--ink-regular);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.re-fig__btn:hover {
  background: var(--surface-muted);
}
.re-fig__btn.is-on {
  background: var(--moss-soft);
  color: var(--ink);
}
.re-fig__btn--icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  padding: 0;
}
.re-fig__btn--icon svg {
  width: 15px;
  height: 15px;
}
.re-fig__btn.is-danger:hover {
  color: var(--danger);
}
.re-fig__sep {
  width: 1px;
  height: 16px;
  margin: 0 2px;
  background: var(--hair);
}
.re-fig__size {
  min-width: 34px;
  padding: 0 2px;
  font-size: 11px;
  color: var(--ink-soft);
  font-variant-numeric: tabular-nums;
}
.re-fig__grip {
  position: absolute;
  top: 50%;
  width: 8px;
  height: 36px;
  border-radius: 3px;
  background: var(--moss);
  opacity: 0.8;
  cursor: ew-resize;
  transform: translateY(-50%);
  touch-action: none;
}
.re-fig__grip:hover {
  opacity: 1;
}
.re-fig__grip--w {
  left: -5px;
}
.re-fig__grip--e {
  right: -5px;
}
</style>
