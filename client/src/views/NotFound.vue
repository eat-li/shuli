<template>
  <div class="nf">
    <el-card class="nf__card">
      <p class="nf__code" aria-hidden="true">404</p>
      <p class="nf__desc">{{ t('notFound.description') }}</p>
      <p class="nf__path">{{ t('notFound.pathHint', { path: route.path }) }}</p>
      <div class="nf__actions">
        <el-button type="primary" @click="router.push('/dashboard')">{{
          t('notFound.backHome')
        }}</el-button>
        <a class="nf__link" :href="readonlyHref" target="_blank" rel="noopener noreferrer">{{
          t('notFound.openReadonly')
        }}</a>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
// 后台兜底页：路由没匹配到时渲染，而不是留一片空白。
// 只读端不套这个页面（只读端有自己的壳层），未知深链由路由重定向回首页。
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const readonlyHref = router.resolve({ name: 'readonlyHome' }).href
</script>

<style scoped>
.nf {
  max-width: 640px;
  margin: 8vh auto 0;
}
.nf__card.el-card,
.nf__card.el-card.is-always-shadow,
.nf__card.el-card.is-never-shadow {
  border-radius: var(--card-radius);
}
.nf :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 32px;
  text-align: center;
}
.nf__code {
  margin: 0 0 12px;
  font-family: var(--font-display);
  font-size: 64px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.04em;
  color: var(--ink-disabled);
  font-variant-numeric: tabular-nums;
}
.nf__desc {
  margin: 0;
  font-size: var(--text-lg);
  color: var(--ink);
}
.nf__path {
  margin: 8px 0 0;
  max-width: 100%;
  font-family: var(--font-data);
  font-size: var(--text-xs);
  color: var(--ink-soft);
  word-break: break-all;
}
.nf__actions {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 24px;
}
.nf__link {
  font-size: var(--text-sm);
  color: var(--ink-soft);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.nf__link:hover {
  color: var(--ink);
}
.nf__link:focus-visible {
  outline: 2px solid var(--moss-ring);
  outline-offset: 2px;
  border-radius: var(--radius-xs);
}
</style>
