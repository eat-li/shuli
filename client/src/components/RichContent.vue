<template>
  <div class="rich-content" v-html="safeHtml"></div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { sanitizeRichHtml, wrapRichTables } from '../utils/sanitizeHtml'
import { renderMathInHtml } from '../utils/mathRender'
import { rewriteRichImages } from '../utils/richImages'
import { normalizeStemHtml } from '../utils/stemFormat'

const props = defineProps<{ html: string; stem?: boolean }>()

// 四步走的字符串级管道，一次 v-html 落地：
//   0) 题干开关：老数据格式混杂（手写题号 / 加粗来源行 / 整段粗体），渲染前归一
//   1) 消毒：剥掉 style / script，只留结构标签
//   2) 表格：给裸 <table> 套横向滚动容器（否则宽表格撑破整页）
//   3) 公式：$...$ / $$...$$ 跨 <br> 也能正确匹配
//   4) 图片：换成 OSS 缩略图 + lazy/async（放在最后，避免子串被公式渲染打乱）
const safeHtml = computed(() =>
  rewriteRichImages(
    renderMathInHtml(
      wrapRichTables(
        sanitizeRichHtml(props.stem ? normalizeStemHtml(props.html || '') : props.html || '')
      )
    )
  )
)
</script>

<style scoped>
.rich-content {
  /* 字号与行高由 styles/content-typography.css 统一定义，这里不再硬编码 */
  line-height: var(--content-line-height, 1.75);
  color: var(--ink);
  word-break: break-word;
}
.rich-content :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: var(--radius-xs);
}
.rich-content :deep(p) {
  margin: 0 0 4px;
}
/* 表格（含 Markdown 转换的表格）
   容器负责横向滚动：表格自身保持 width:100%，但在窄屏下用 min-width 撑出
   可读的列宽——否则「能滚」和「挤成一团」是同一个结果。 */
.rich-content :deep(.tableWrapper) {
  overflow-x: auto;
  margin: 8px 0;
  -webkit-overflow-scrolling: touch;
}
.rich-content :deep(table) {
  border-collapse: collapse;
  width: 100%;
}
.rich-content :deep(th),
.rich-content :deep(td) {
  border: 1px solid var(--line);
  padding: 6px 10px;
  vertical-align: top;
  text-align: left;
}
.rich-content :deep(th) {
  background: var(--surface-muted);
  font-weight: 600;
}
/* 代码块：长行不该把页面撑宽（D8） */
.rich-content :deep(pre) {
  overflow-x: auto;
  max-width: 100%;
  white-space: pre;
  -webkit-overflow-scrolling: touch;
}
.rich-content :deep(pre code) {
  white-space: inherit;
}
</style>
