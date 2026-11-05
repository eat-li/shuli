<template>
  <section class="re-source">
    <header class="re-source__head">
      <span class="re-source__title">{{ t('editor.source.title') }}</span>
      <span class="re-source__hint">{{ t('editor.source.readonly') }}</span>
      <el-button
        v-if="html"
        class="re-source__copy"
        size="small"
        text
        @click="copy"
      >
        {{ copied ? t('editor.source.copied') : t('editor.source.copy') }}
      </el-button>
    </header>
    <pre v-if="html" class="re-source__code"><code>{{ displayHtml }}</code></pre>
    <p v-else class="re-source__empty">{{ t('editor.source.empty') }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { writeClipboard } from '../../utils/clipboard'

const props = defineProps<{
  /** 编辑器当前 HTML（与保存进库的内容一致） */
  html: string
}>()

const { t } = useI18n()

// 块级标签之间断行：只影响展示，不改动实际保存的 HTML
const displayHtml = computed(() => (props.html || '').replace(/></g, '>\n<'))

const copied = ref(false)
let timer: number | undefined

const copy = async () => {
  try {
    await writeClipboard(props.html || '')
    copied.value = true
    window.clearTimeout(timer)
    timer = window.setTimeout(() => (copied.value = false), 1500)
  } catch {
    ElMessage.error(t('editor.source.copyFailed'))
  }
}

onBeforeUnmount(() => window.clearTimeout(timer))
</script>

<style scoped>
.re-source {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--surface-muted);
}

.re-source__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px 4px 12px;
  border-bottom: 1px solid var(--hair);
  flex: 0 0 auto;
}

.re-source__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-soft);
}

.re-source__hint {
  font-size: 11px;
  color: var(--ink-placeholder);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.re-source__copy {
  margin-left: auto;
  flex: 0 0 auto;
}

.re-source__code {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 8px 12px;
  overflow: auto;
  font-family: var(--font-data);
  font-size: 12px;
  line-height: 1.65;
  color: var(--ink-regular);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.re-source__empty {
  margin: 0;
  padding: 16px 12px;
  font-size: 12px;
  color: var(--ink-placeholder);
}
</style>
