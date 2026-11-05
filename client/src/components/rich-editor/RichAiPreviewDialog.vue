<template>
  <el-dialog
    v-model="visible"
    :title="title"
    width="860px"
    top="5vh"
    append-to-body
    destroy-on-close
  >
    <el-alert
      v-if="issueText"
      :title="issueText"
      type="warning"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
    />
    <div class="ai-preview-layout">
      <div class="ai-preview-pane">
        <div class="ai-preview-head">{{ t('ai.preview.original') }}</div>
        <div class="ai-preview-body" v-html="originalHtml"></div>
      </div>
      <div class="ai-preview-pane">
        <div class="ai-preview-head">{{ t('ai.preview.result') }}</div>
        <div class="ai-preview-body" v-html="resultHtml"></div>
      </div>
    </div>
    <template #footer>
      <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
      <el-button v-if="canRetry" :loading="retrying" @click="emit('retry')">
        {{ t('ai.preview.retry') }}
      </el-button>
      <el-button type="primary" :loading="applying" @click="emit('apply')">
        {{ t('ai.preview.replace') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  modelValue: boolean
  title: string
  issueText: string
  /** 已消毒并渲染公式的 HTML，仅供预览展示 */
  originalHtml: string
  resultHtml: string
  canRetry: boolean
  retrying: boolean
  applying: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  retry: []
  apply: []
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v)
})
</script>

<style scoped>
.ai-preview-layout {
  display: flex;
  gap: 14px;
  height: 52vh;
}
.ai-preview-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.ai-preview-head {
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
  background: var(--surface-muted);
  border-bottom: 1px solid var(--hair);
}
.ai-preview-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px;
  font-size: 14px;
  line-height: 1.8;
  color: var(--ink);
  word-break: break-word;
  background: var(--surface);
}
.ai-preview-body p {
  margin: 0 0 4px;
}
.ai-preview-body table {
  border-collapse: collapse;
  width: 100%;
  margin: 6px 0;
}
.ai-preview-body th,
.ai-preview-body td {
  border: 1px solid var(--line);
  padding: 5px 9px;
}
.ai-preview-body th {
  background: var(--surface-muted);
  font-weight: 600;
}
.ai-preview-body img {
  max-width: 100%;
}
</style>
