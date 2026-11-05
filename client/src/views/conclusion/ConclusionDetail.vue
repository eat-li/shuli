<template>
  <div class="cd">
    <div class="cd-toolbar">
      <el-button :icon="ArrowLeft" @click="goBack">{{ t('conclusionDetail.back') }}</el-button>
    </div>

    <ListError :message="error" @retry="load" />

    <article v-if="!error" v-loading="loading" class="cd-sheet">
      <template v-if="row">
        <header class="cd-head">
          <div class="cd-meta">
            <span class="chip" :class="{ 'chip--accent': row.status === 'published' }">
              {{
                row.status === 'published'
                  ? t('conclusionDetail.published')
                  : t('conclusionDetail.draft')
              }}
            </span>
            <span class="chip">{{ categoryName }}</span>
            <span v-for="tag in tagList" :key="tag" class="chip chip--muted">{{ tag }}</span>
            <span class="spacer"></span>
            <time class="cd-time">{{ formatDateTime(row.updatedAt) }}</time>
          </div>
          <h1 class="cd-title">{{ row.title }}</h1>
          <p v-if="row.summary" class="cd-summary">
            {{ t('conclusionDetail.summary', { text: row.summary }) }}
          </p>
        </header>

        <div class="cd-body">
          <RichContent :html="row.content || ''" />
        </div>

        <footer class="cd-foot">
          <el-button type="danger" plain :icon="Delete" @click="remove">{{
            t('common.delete')
          }}</el-button>
          <span class="spacer"></span>
          <el-button @click="toggleStatus">
            {{
              row.status === 'published'
                ? t('conclusionDetail.unpublish')
                : t('conclusionDetail.publish')
            }}
          </el-button>
          <el-button type="primary" :icon="Edit" @click="goEdit">{{ t('common.edit') }}</el-button>
        </footer>
      </template>

      <el-empty v-else-if="!loading" :description="t('conclusionDetail.notFound')" />
    </article>
  </div>
</template>

<script setup lang="ts">
// 单条结论详情：列表墙点进来的阅读页。
// 整栏宽度留给正文——结论常带公式与多行推导，420px 的侧栏会把行尾挤断。
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ArrowLeft, Delete, Edit } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getConclusion, deleteConclusion, updateConclusionStatus } from '../../api/conclusion'
import { formatDateTime } from '../../utils/format'
import RichContent from '../../components/RichContent.vue'
import ListError from '../../components/ListError.vue'
import type { Conclusion } from '../../types'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const row = ref<Conclusion | null>(null)
const loading = ref(false)
const error = ref('')

const id = computed(() => Number(route.params.id))

const load = async () => {
  if (!Number.isInteger(id.value) || id.value <= 0) {
    row.value = null
    return
  }
  loading.value = true
  error.value = ''
  try {
    row.value = await getConclusion(id.value, { silent: true })
  } catch (e: any) {
    error.value = e?.message || t('conclusionDetail.loadError')
  } finally {
    loading.value = false
  }
}

const categoryName = computed(() => {
  const c = row.value?.category
  return c?.name || t('page.uncategorized')
})

// tags 在库里是一串逗号分隔的关键词
const tagList = computed(() =>
  String(row.value?.tags || '')
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
)

// 从带筛选条件的列表进来时，返回要回到那次筛选；深链直接打开时没有上一条，回列表首页
const goBack = () => {
  if (window.history.state?.back) router.back()
  else router.push('/conclusions')
}

const goEdit = () => {
  if (row.value) router.push(`/conclusions/edit/${row.value.id}`)
}

const toggleStatus = async () => {
  if (!row.value) return
  const next = row.value.status === 'published' ? 'draft' : 'published'
  await updateConclusionStatus(row.value.id, next)
  row.value.status = next
  ElMessage.success(
    next === 'published' ? t('conclusionDetail.publishedMsg') : t('conclusionDetail.unpublishedMsg')
  )
}

const remove = async () => {
  if (!row.value) return
  const title = row.value.title
  try {
    await ElMessageBox.confirm(
      t('conclusionDetail.deleteConfirm', { title }),
      t('conclusionDetail.deleteTitle'),
      {
        type: 'warning',
        confirmButtonText: t('common.delete'),
        cancelButtonText: t('common.cancel')
      }
    )
  } catch {
    return
  }
  await deleteConclusion(row.value.id)
  ElMessage.success(t('common.deleteSuccess'))
  router.replace('/conclusions')
}

onMounted(load)
</script>

<style scoped>
.cd {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cd-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  /* 与阅读栏同宽同中心：返回按钮落在正文左边缘，而不是漂在内容区最左侧 */
  width: 100%;
  max-width: 860px;
  margin: 0 auto;
}

/* 阅读栏：比列表窄、居中，一行落在 60–75 字之间才不散行 */
.cd-sheet {
  width: 100%;
  max-width: 860px;
  margin: 0 auto;
  box-sizing: border-box;
  padding: 32px 36px 24px;
  border: 1px solid var(--kb-card-edge);
  border-radius: var(--card-radius);
  background-color: var(--card-bg);
  box-shadow: var(--card-shadow);
  min-height: 240px;
}

.cd-head {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--hair);
}
.cd-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.cd-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-title);
  font-weight: 600;
  line-height: 1.35;
  color: var(--ink);
}
.cd-time {
  font-family: var(--font-data);
  font-size: var(--text-xs);
  color: var(--ink-soft);
}
.spacer {
  flex: 1;
}

/* 标签一律自绘：el-tag 的 success/info 走 Element Plus 自己的调色板，
   会带进不属于「中性墨」体系的色相。 */
.chip {
  padding: 1px 8px;
  border: 1px solid var(--hair);
  border-radius: var(--radius-pill);
  font-size: var(--text-2xs);
  color: var(--ink-soft);
  background: transparent;
  white-space: nowrap;
}
.chip--accent {
  border-color: transparent;
  color: var(--moss-deep);
  background: var(--moss-soft);
}
.chip--muted {
  background: var(--surface-muted);
}

.cd-summary {
  margin: 0;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
  font-size: var(--text-sm);
  line-height: 1.6;
  color: var(--ink-soft);
}

.cd-body {
  padding: 18px 0 22px;
  font-size: var(--text-base);
  line-height: 1.8;
  color: var(--ink);
}

.cd-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 14px;
  border-top: 1px solid var(--hair);
}

/* Element Plus 给相邻按钮加 12px margin-left，会和 flex gap 叠加导致间距不匀 */
.cd-foot :deep(.el-button + .el-button) {
  margin-left: 0;
}

@media (max-width: 640px) {
  .cd-sheet {
    padding: 20px 18px 16px;
  }
  .cd-title {
    font-size: var(--text-xl);
  }
}
</style>
