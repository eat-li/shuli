<template>
  <div class="page">
    <div class="page__head">
      <div>
        <p class="page__sub">{{ t('paperList.subtitle') }}</p>
      </div>
      <div class="page__actions">
        <el-input
          v-model="keyword"
          :placeholder="t('paperList.searchPlaceholder')"
          :aria-label="t('paperList.searchAria')"
          clearable
          style="width: 200px"
          @keyup.enter="reload"
          @clear="reload"
        />
        <el-button @click="reload">{{ t('common.refresh') }}</el-button>
        <el-button type="primary" @click="createNew">{{ t('paperList.newPaper') }}</el-button>
      </div>
    </div>

    <ListError :message="error" @retry="run" />

    <el-table v-if="!error" v-loading="loading" :data="list" border class="page__table">
      <el-table-column prop="title" :label="t('paperList.titleColumn')" min-width="260">
        <template #default="{ row }">
          <div class="cell-title">{{ row.title }}</div>
          <div v-if="row.subtitle" class="cell-sub">{{ row.subtitle }}</div>
        </template>
      </el-table-column>
      <el-table-column :label="t('paperList.stageColumn')" width="90" align="center">
        <template #default="{ row }">{{ stageLabel(row.stage) }}</template>
      </el-table-column>
      <el-table-column :label="t('paperList.countColumn')" width="120" align="center">
        <template #default="{ row }">
          {{ t('paperList.countValue', { n: row.questionCount, m: row.scoreSum }) }}
        </template>
      </el-table-column>
      <el-table-column :label="t('paperList.sourceColumn')" width="90" align="center">
        <template #default="{ row }">
          <el-tag size="small" :type="row.source === 'ai' ? 'success' : 'info'" effect="plain">
            {{ row.source === 'ai' ? t('paperList.sourceAi') : t('paperList.sourceManual') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('paperList.updatedColumn')" width="160" align="center">
        <template #default="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
      </el-table-column>
      <el-table-column :label="t('paperList.actionsColumn')" width="230" align="right">
        <template #default="{ row }">
          <el-button text size="small" @click="edit(row)">{{ t('common.edit') }}</el-button>
          <el-button text size="small" @click="print(row)">{{ t('paperList.print') }}</el-button>
          <el-button text size="small" @click="duplicate(row)">{{
            t('paperList.duplicate')
          }}</el-button>
          <el-button text size="small" type="danger" @click="remove(row)">{{
            t('common.delete')
          }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-if="!error && !loading && !list.length" :description="t('paperList.empty')" />

    <el-pagination
      v-if="!error && total > 0"
      v-model:current-page="page"
      class="page__pager"
      layout="total, prev, pager, next"
      :page-size="PAGE_SIZE"
      :total="total"
      @current-change="run"
    />
  </div>
</template>

<script setup lang="ts">
// 试卷列表：入口页。新建不落库，直接进编辑器（避免产生一堆空卷）
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox, vLoading } from 'element-plus'
import { getPapers, getPaper, deletePaper, duplicatePaper } from '../../api/paper'
import { formatDateTime } from '../../utils/format'
import { buildPrintContext, printPaper } from '../../utils/paperPrint'
import type { Paper } from '../../types'
import ListError from '../../components/ListError.vue'
import { useListQuery } from '../../composables/useListQuery'
import { queryNumber, queryText, stableQuery } from '../../utils/routeQuery'

const PAGE_SIZE = 20
const router = useRouter()
const route = useRoute()
const { t, te } = useI18n()

const page = ref(1)
const keyword = ref('')

// 筛选与页码写进地址栏：刷新、后退、分享链接都能回到同一视图
let lastSyncedQuery = ''
const readQuery = () => {
  keyword.value = queryText(route.query, 'keyword')
  page.value = queryNumber(route.query, 'page', 1)
}
const writeQuery = () => {
  const q: Record<string, string> = {}
  if (keyword.value.trim()) q.keyword = keyword.value.trim()
  if (page.value > 1) q.page = String(page.value)
  lastSyncedQuery = stableQuery(q)
  router.replace({ path: route.path, query: q })
}
readQuery()

const { list, total, loading, error, run, backoffIfLastPageEmpty } = useListQuery<Paper>(
  () =>
    getPapers(
      {
        page: page.value,
        pageSize: PAGE_SIZE,
        ...(keyword.value ? { keyword: keyword.value } : {})
      },
      { silent: true }
    ),
  { onLoaded: () => writeQuery() }
)

watch(
  () => route.query,
  (q) => {
    if (stableQuery(q) === lastSyncedQuery) return
    readQuery()
    run()
  }
)

const stageLabel = (s: string) =>
  s === 'primary' ? t('paperList.stagePrimary') : te(`gradeLevel.${s}`) ? t(`gradeLevel.${s}`) : s

const reload = () => {
  page.value = 1
  run()
}

const createNew = () => router.push('/papers/new')
const edit = (row: Paper) => router.push(`/papers/${row.id}`)

const print = async (row: Paper) => {
  const detail = await getPaper(row.id)
  const { layout, meta } = buildPrintContext(detail)
  if (!printPaper(layout, meta)) ElMessage.warning(t('paperList.printBlocked'))
}

const duplicate = async (row: Paper) => {
  await duplicatePaper(row.id)
  ElMessage.success(t('paperList.duplicated'))
  run()
}

const remove = async (row: Paper) => {
  try {
    await ElMessageBox.confirm(
      t('paperList.deleteConfirm', { title: row.title }),
      t('paperList.deleteTitle'),
      { type: 'warning' }
    )
  } catch {
    return
  }
  await deletePaper(row.id)
  ElMessage.success(t('paperList.deleted'))
  backoffIfLastPageEmpty(page)
  run()
}
</script>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.page__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}
.page__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 22px;
}
.page__sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--ink-soft);
}
.page__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.page__table {
  background: var(--surface);
  border-radius: var(--card-radius);
}
.page__pager {
  justify-content: flex-end;
}
.cell-title {
  font-weight: 600;
}
.cell-sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--ink-soft);
}
</style>
