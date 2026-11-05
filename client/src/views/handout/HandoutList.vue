<template>
  <div class="handout-list">
    <el-card>
      <div class="toolbar">
        <span class="title">{{ t('handoutList.title') }}</span>
        <span class="count">{{ t('handoutList.total', { n: total }) }}</span>
        <span class="spacer"></span>
        <el-input
          v-model="keyword"
          class="search"
          :placeholder="t('handoutList.searchPlaceholder')"
          :aria-label="t('handoutList.searchAria')"
          clearable
          @keyup.enter="onFilter"
          @clear="onFilter"
        >
          <template #append>
            <el-button :icon="Search" :aria-label="t('handoutList.search')" @click="onFilter" />
          </template>
        </el-input>
        <el-button type="primary" :icon="Plus" @click="goCreate">{{
          t('handoutList.create')
        }}</el-button>
      </div>

      <ListError :message="error" @retry="run" />

      <el-table
        v-if="!error"
        v-loading="loading"
        :data="list"
        row-key="id"
        border
        stripe
        :empty-text="keyword ? t('handoutList.emptyFiltered') : t('handoutList.emptyNone')"
        @row-click="open"
      >
        <!-- 标题做成真链接：键盘可达，Cmd/Ctrl+点击与中键可开新标签 -->
        <el-table-column
          :label="t('handoutList.titleColumn')"
          min-width="240"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            <router-link class="row-link" :to="`/handouts/edit/${row.id}`" @click.stop>
              {{ row.title }}
            </router-link>
          </template>
        </el-table-column>
        <el-table-column :label="t('handoutList.lengthColumn')" min-width="300">
          <template #default="{ row }">
            <div class="compose">
              <template v-if="statOf(row).chars">
                <span class="chip">{{ t('handoutList.chars', { n: statOf(row).chars }) }}</span>
                <span v-if="statOf(row).images" class="chip">{{
                  t('handoutList.images', { n: statOf(row).images })
                }}</span>
                <span v-if="statOf(row).tables" class="chip">{{
                  t('handoutList.tables', { n: statOf(row).tables })
                }}</span>
              </template>
              <!-- 改造前的旧讲义只有 items 引用、没有正文，如实标出来 -->
              <span v-else-if="statOf(row).legacy" class="chip chip--legacy">{{
                t('handoutList.legacy', { n: statOf(row).legacy })
              }}</span>
              <span v-else class="compose-empty">{{ t('handoutList.emptyHandout') }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column :label="t('handoutList.updatedColumn')" width="170">
          <template #default="{ row }">{{
            formatDateTime(row.updatedAt || row.createdAt)
          }}</template>
        </el-table-column>
        <el-table-column :label="t('handoutList.actionsColumn')" width="200" fixed="right">
          <template #default="{ row }">
            <div class="row-actions">
              <el-button size="small" :icon="EditPen" @click.stop="open(row)">{{
                t('handoutList.openEdit')
              }}</el-button>
              <el-button size="small" type="danger" :icon="Delete" @click.stop="remove(row)">{{
                t('common.delete')
              }}</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="!error && total > pageSize" class="pager">
        <el-pagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="total"
          layout="prev, pager, next, total"
          background
          @current-change="run"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, EditPen, Delete } from '@element-plus/icons-vue'
import { getHandouts, deleteHandout, type Handout } from '../../api/handout'
import { formatDateTime } from '../../utils/format'
import ListError from '../../components/ListError.vue'
import { useListQuery } from '../../composables/useListQuery'
import { queryNumber, queryText, stableQuery } from '../../utils/routeQuery'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()

const keyword = ref('')
const page = ref(1)
const pageSize = 20

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

const { list, total, loading, error, run, backoffIfLastPageEmpty } = useListQuery<Handout>(
  () =>
    getHandouts(
      {
        keyword: keyword.value.trim() || undefined,
        page: page.value,
        pageSize
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

// 篇幅统计：列表接口已按正文算好字数/图片数/表格数（正文本身不传，避免整页 HTML）；
// 改造前的旧讲义没有正文，退回显示 items 项数并标注「旧格式」。
const statOf = (row: Handout) => {
  const chars = row.contentChars || 0
  const items = Array.isArray(row.items) ? row.items : []
  return {
    chars,
    images: row.contentImages || 0,
    tables: row.contentTables || 0,
    legacy: chars ? 0 : items.length
  }
}

const onFilter = () => {
  page.value = 1
  run()
}

// 打开：进入该讲义的编辑页（id 在路径里）
const open = (row: Handout) => router.push(`/handouts/edit/${row.id}`)
const goCreate = () => router.push('/handouts/new')

const remove = async (row: Handout) => {
  try {
    await ElMessageBox.confirm(
      t('handoutList.deleteConfirm', { title: row.title }),
      t('handoutList.deleteTitle'),
      {
        type: 'warning',
        confirmButtonText: t('common.delete'),
        cancelButtonText: t('common.cancel')
      }
    )
  } catch {
    return
  }
  await deleteHandout(row.id)
  ElMessage.success(t('common.deleteSuccess'))
  // 删掉当页最后一条时回退一页，避免停在空页
  backoffIfLastPageEmpty(page)
  run()
}
</script>

<style scoped>
.toolbar {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.title {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
  color: var(--ink);
}
.count {
  font-size: 13px;
  color: var(--ink-soft);
}
.spacer {
  flex: 1;
}
.search {
  width: 240px;
}
.compose {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
/* 表格里的标题链接：保持正文观感，hover 才露出可点 */
.row-link {
  color: var(--ink);
  font-weight: 600;
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: border-color var(--dur) var(--ease);
}
.row-link:hover {
  border-bottom-color: var(--moss);
}
.chip {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  padding: 2px 10px;
  border-radius: var(--radius-pill);
  background: var(--surface-muted);
  border: 1px solid var(--hair);
  font-size: 12px;
  color: var(--ink-regular);
}
.chip b {
  font-family: var(--font-data);
  font-size: 13px;
  color: var(--ink);
}
.chip--kp {
  background: var(--moss-soft);
  border-color: transparent;
  color: var(--moss-deep);
}
.chip--kp b {
  color: var(--moss-deep);
}
/* 旧格式标记：中性偏暖，提示需要打开转换一次 */
.chip--legacy {
  color: var(--ink-soft);
  border-style: dashed;
}
.compose-total {
  font-size: 12px;
  color: var(--ink-soft);
}
.compose-empty {
  font-size: 13px;
  color: var(--ink-soft);
}
.row-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pager {
  margin-top: 16px;
  display: flex;
  justify-content: center;
}
:deep(.el-table__row) {
  cursor: pointer;
}
</style>
