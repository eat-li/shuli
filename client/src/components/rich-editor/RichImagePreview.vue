<template>
  <teleport to="body">
    <div v-if="visible" class="img-preview" @click.self="emit('close')">
      <div class="img-preview-panel">
        <img :src="src" alt="" :style="imgStyle" @load="onLoad" />
        <div class="img-preview-tools">
          <el-button-group>
            <el-button size="small" @click="zoom(-25)">
              {{ t('editor.imagePreview.zoomOut') }}
            </el-button>
            <el-button size="small" @click="zoom(25)">
              {{ t('editor.imagePreview.zoomIn') }}
            </el-button>
            <el-button size="small" @click="scale = 100">
              {{ t('editor.imagePreview.actualSize') }}
            </el-button>
          </el-button-group>
          <span class="img-preview-scale">{{ scale }}%</span>
          <el-button size="small" type="primary" @click="emit('close')">
            {{ t('editor.imagePreview.close') }}
          </el-button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

// 纯查看器：宽度/对齐的调整在编辑器里就地完成（ImageNodeView），
// 这里只负责「把图放大看清楚」，不再有任何写回文档的动作。
const props = defineProps<{ visible: boolean; src: string }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()

const MIN_SCALE = 10
const MAX_SCALE = 400

const natural = ref({ w: 0, h: 0 })
const scale = ref(100)

watch(
  () => [props.visible, props.src],
  () => {
    if (props.visible) {
      natural.value = { w: 0, h: 0 }
      scale.value = 100
    }
  }
)

const imgStyle = computed(() =>
  natural.value.w ? { width: `${(natural.value.w * scale.value) / 100}px` } : undefined
)

// 打开时先缩到「整张图能看见」，再让老师自己放大看细节。
// 100% = 原始像素，可能超出窗口 —— 面板自己滚动。
const onLoad = (e: Event) => {
  const el = e.target as HTMLImageElement
  const w = el.naturalWidth || 0
  const h = el.naturalHeight || 0
  natural.value = { w, h }
  if (!w || !h) return
  const byWidth = (window.innerWidth * 0.88) / w
  const byHeight = (window.innerHeight * 0.78) / h
  const fit = Math.min(1, byWidth, byHeight)
  scale.value = Math.max(MIN_SCALE, Math.round(fit * 100))
}

const zoom = (delta: number) => {
  scale.value = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale.value + delta))
}
</script>

<style scoped>
.img-preview {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(24, 30, 36, 0.82);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.img-preview-panel {
  max-width: 92vw;
  max-height: 88vh;
  overflow: auto;
}
.img-preview-panel img {
  display: block;
  margin: 0 auto;
  max-width: none;
  border-radius: var(--radius);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
  /* audit-allow —— 透明 PNG 的衬底，必须是纯白，否则透明区会透出遮罩 */
  background: #fff;
}
.img-preview-tools {
  display: flex;
  flex-wrap: wrap;
  width: fit-content;
  margin: 16px auto 0;
  align-items: center;
  justify-content: center;
  gap: 12px;
  /* 这是全站唯一一处「暗底浮层」（图片预览压在深色遮罩上），
     所以半透明白底在这里成立 —— 对比来自明度，而不是来自模糊。 */
  background: rgba(255, 255, 255, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.22);
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  position: sticky;
  bottom: 0;
}
.img-preview-scale {
  /* audit-allow —— 压在深色遮罩上的文字，白字是唯一可行解 */
  color: #fff;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  min-width: 44px;
  text-align: center;
}
</style>
