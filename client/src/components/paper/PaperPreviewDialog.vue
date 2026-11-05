<template>
  <el-dialog
    :model-value="modelValue"
    :title="t('paperPreview.title')"
    width="920px"
    top="4vh"
    :close-on-click-modal="false"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <div class="preview">
      <div class="preview__bar">
        <el-radio-group v-model="tab" size="small">
          <el-radio-button value="paper">{{ t('paperPreview.paperTab') }}</el-radio-button>
          <el-radio-button value="sheet">{{ t('paperPreview.sheetTab') }}</el-radio-button>
        </el-radio-group>
        <div class="preview__actions">
          <span class="preview__hint">{{ t('paperPreview.hint') }}</span>
          <el-button size="small" @click="emit('print', tab)">{{
            t('paperPreview.print')
          }}</el-button>
        </div>
      </div>
      <iframe class="preview__frame" :srcdoc="doc" :title="t('paperPreview.frameTitle')" />
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
// 打印预览：用 iframe 承载，CSS 与打印窗口完全同一份，
// 这样预览里看到的字号、行距、留白就是纸上的样子。
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { buildPreviewDocument } from '../../utils/paperPrint'
import type { PaperLayout } from '../../utils/paperLayout'
import type { PaperMetaInput } from '../../utils/paperTemplate'

const { t } = useI18n()

const props = defineProps<{
  modelValue: boolean
  layout: PaperLayout
  meta: PaperMetaInput
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'print', kind: 'paper' | 'sheet'): void
}>()

const tab = ref<'paper' | 'sheet'>('paper')
const doc = computed(() => buildPreviewDocument(props.layout, props.meta, tab.value))
</script>

<style scoped>
.preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.preview__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.preview__actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.preview__hint {
  font-size: 12px;
  color: var(--ink-soft);
}
.preview__frame {
  width: 100%;
  height: 68vh;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--paper);
}
</style>
