<template>
  <el-card>
    <div class="toolbar">
      <span class="toolbar-title">{{ t('homeworkView.title') }}</span>
      <span class="toolbar-count">{{ t('homeworkView.count', { n: list.length }) }}</span>
      <el-button size="small" @click="load">{{ t('common.refresh') }}</el-button>
    </div>

    <!-- 分类卡片：点击即把下方列表筛成该分类的已发布作业（二级）。
         只读浏览页不给「分类管理」入口，分类维护统一在作业管理页做。 -->
    <HomeworkCategoryCards
      :cards="categoryCards"
      :active-key="activeCategory"
      :default-key="defaultCategoryKey"
      @select="onSelectCategory"
    />

    <ListError v-if="error" :message="error" @retry="load" />

    <el-table v-else :data="list" border stripe v-loading="loading">
      <el-table-column
        prop="title"
        :label="t('homework.title')"
        min-width="220"
        show-overflow-tooltip
      />
      <el-table-column :label="t('homeworkView.category')" width="110">
        <template #default="{ row }">
          <el-tag v-if="row.categoryId" size="small" type="info">{{
            categoryName(row.categoryId)
          }}</el-tag>
          <span v-else class="cat-none">{{ t('page.uncategorized') }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('homeworkView.questionCount')" width="90">
        <template #default="{ row }">{{
          row.questionCount ?? (row.questionIds || []).length
        }}</template>
      </el-table-column>
      <el-table-column :label="t('homeworkView.endAt')" width="180">
        <template #default="{ row }">
          <!-- 没设截止时间时写「未设置」，而不是整列破折号（像数据没加载出来） -->
          <span :class="{ 'end-at--expired': isExpired(row.endAt) }">{{
            formatDateTime(row.endAt, t('homeworkView.endAtUnset'))
          }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.actions')" width="200">
        <template #default="{ row }">
          <el-button size="small" type="primary" @click="openView(row)">{{
            t('homeworkView.view')
          }}</el-button>
          <el-button size="small" @click="openExport(row)">{{
            t('homeworkView.exportPdf')
          }}</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!error && !loading && !list.length" :description="t('homeworkView.empty')" />
  </el-card>

  <!-- 查看作业内容（学生视角，不显示答案）：与作业管理列表共用抽屉 -->
  <HomeworkPreviewDrawer v-model="viewVisible" :homework="current" />

  <!-- 导出作业 PDF：与作业管理页共用 HomeworkExportDialog 组件 -->
  <HomeworkExportDialog
    v-model="exportVisible"
    :homework="exportHomework"
    :questions="exportQuestions"
    :students="exportStudents"
  />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getHomeworks, getHomeworkQuestions } from '../../api/homework'
import type { HomeworkQuery } from '../../api/homework'
import { getHomeworkCategoryBoard } from '../../api/homeworkCategory'
import type { HomeworkCategoryBoard } from '../../api/homeworkCategory'
import HomeworkCategoryCards from '../../components/homework/HomeworkCategoryCards.vue'
import HomeworkExportDialog from '../../components/HomeworkExportDialog.vue'
import HomeworkPreviewDrawer from '../../components/homework/HomeworkPreviewDrawer.vue'
import ListError from '../../components/ListError.vue'
import { getStudents } from '../../api/student'
import { formatDateTime } from '../../utils/format'
import { queryText, stableQuery } from '../../utils/routeQuery'
import type { Homework, Question } from '../../types'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const list = ref<Homework[]>([])
const loading = ref(false)
const error = ref('')
const viewVisible = ref(false)
const current = ref<Homework | null>(null)

// —— 导出 PDF（复用 HomeworkExportDialog：选项、配色、预览都在组件内）——
const exportVisible = ref(false)
const exportHomework = ref<Homework | null>(null)
const exportQuestions = ref<Question[]>([])
const exportStudents = ref<any[]>([])

const openExport = async (row: any) => {
  exportHomework.value = row
  exportQuestions.value = []
  exportStudents.value = []
  exportVisible.value = true
  try {
    exportQuestions.value = await getHomeworkQuestions(row.id)
    // 作业选中的学生：导出时按人各一份并预填姓名/年级
    const ids: number[] = row.studentIds || []
    if (ids.length) {
      const students = await getStudents()
      exportStudents.value = students.filter((s: any) => ids.includes(s.id))
    }
  } catch {
    exportQuestions.value = []
  }
}

// —— 分类卡片（口径只算已发布作业，否则卡片数字会和下方列表对不上）——
const categoryBoard = ref<HomeworkCategoryBoard>({
  list: [],
  total: 0,
  uncategorized: 0,
  defaultCategoryId: null
})
// 'all' = 全部；'none' = 未分类；其余为分类 id 的字符串形式
const activeCategory = ref('all')

// 分类写进地址栏：刷新/后退/分享链接都能回到同一筛选；有 URL 分类时不再套默认分类
let lastSyncedQuery = ''
let categoryFromQuery = false
const readQuery = () => {
  const c = queryText(route.query, 'category')
  const valid = !!c && (c === 'none' || /^\d+$/.test(c))
  activeCategory.value = valid ? c : 'all'
  categoryFromQuery = valid
}
const writeQuery = () => {
  const q: Record<string, string> = {}
  if (activeCategory.value !== 'all') q.category = activeCategory.value
  lastSyncedQuery = stableQuery(q)
  router.replace({ path: route.path, query: q })
}
readQuery()
// 默认分类的卡片 key，用于在卡片上打「默认」标记（无默认时为空串）
const defaultCategoryKey = computed(() =>
  categoryBoard.value.defaultCategoryId == null ? '' : String(categoryBoard.value.defaultCategoryId)
)

const categoryCards = computed(() => {
  if (!categoryBoard.value.list.length) return []
  const cards = [{ key: 'all', name: t('homeworkView.all'), count: categoryBoard.value.total }]
  for (const c of categoryBoard.value.list) {
    cards.push({ key: String(c.id), name: c.name, count: c.count || 0 })
  }
  if (categoryBoard.value.uncategorized > 0) {
    cards.push({
      key: 'none',
      name: t('page.uncategorized'),
      count: categoryBoard.value.uncategorized
    })
  }
  return cards
})

const categoryName = (id: number) => categoryBoard.value.list.find((c) => c.id === id)?.name || '—'

const onSelectCategory = (key: string) => {
  if (activeCategory.value === key) return
  activeCategory.value = key
  load()
}

// applyDefault 只在首次进入页面时为 true：之后回刷不能顶掉用户手动选中的分类
const loadBoard = async (applyDefault = false) => {
  try {
    const board = await getHomeworkCategoryBoard({ status: 'published' })
    categoryBoard.value = board
    if (applyDefault && !categoryFromQuery && board.defaultCategoryId != null) {
      if (board.list.some((c) => c.id === board.defaultCategoryId)) {
        activeCategory.value = String(board.defaultCategoryId)
      }
    }
  } catch {
    // 看板拉取失败不应挡住作业列表：降级成「没有分类」的形态
  }
}

// 截止时间是否已过
const isExpired = (d: any) => {
  if (!d) return false
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return false
  return date.getTime() < Date.now()
}

// 仅加载已发布的作业；按当前选中的分类卡片再筛一层
const load = async () => {
  loading.value = true
  error.value = ''
  try {
    const query: HomeworkQuery = { status: 'published' }
    if (activeCategory.value !== 'all') query.categoryId = activeCategory.value
    list.value = await getHomeworks(query, { silent: true })
    writeQuery()
  } catch (e: any) {
    // 失败不能落成「还没有已发布的作业」——那会让人以为数据没了
    error.value = e?.message || t('homeworkView.listError')
  } finally {
    loading.value = false
  }
}

// 前进/后退或外部带参跳进来时重新读取（看板不重拉，只切换列表分类）
watch(
  () => route.query,
  (q) => {
    if (stableQuery(q) === lastSyncedQuery) return
    readQuery()
    load()
  }
)

const openView = (row: any) => {
  current.value = row
  viewVisible.value = true
}

onMounted(async () => {
  // 先取看板再取列表：默认分类要先知道，否则会先按「全部」拉一次再跳过去，
  // 列表会闪动一下
  await loadBoard(true)
  await load()
})
</script>

<style scoped>
.toolbar {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.toolbar-title {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 700;
  color: var(--ink);
}
.toolbar-count {
  color: var(--ink-soft);
  font-size: 13px;
}
.end-at--expired {
  color: var(--el-color-danger);
  font-weight: 600;
}
/* 未分类是「没有值」而不是一种状态，不用标签样式，压到次要层级 */
.cat-none {
  color: var(--ink-placeholder);
  font-size: 12px;
}
</style>
