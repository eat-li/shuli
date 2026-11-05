<template>
  <el-card>
    <div class="toolbar">
      <el-button type="primary" :icon="Plus" @click="openCreate">{{
        t('homework.publish')
      }}</el-button>
      <!-- 分类维护的唯一入口。原先挂在「查看作业」页上，但那是只读浏览面，
           与「分类维护在作业管理页做」的分工相反；且那个页面当时把按钮
           藏在 manageable 后面没打开。放在这里与行内「编辑」同层：都是管理动作。 -->
      <el-button :icon="Files" @click="openCategories">{{ t('homework.categories') }}</el-button>
      <el-button
        v-if="selectedIds.length"
        type="danger"
        plain
        :icon="Delete"
        :loading="bulkDeleting"
        @click="bulkRemove"
        >{{ t('homework.bulkDelete', { n: selectedIds.length }) }}</el-button
      >
      <el-button v-if="selectedIds.length" text @click="clearSelection">{{
        t('homework.clearSelection')
      }}</el-button>
      <span v-if="selectedIds.length" class="picked-count">{{
        t('homework.selected', { n: selectedIds.length })
      }}</span>
    </div>

    <div class="filters">
      <el-input
        v-model="filters.keyword"
        :placeholder="t('homework.searchPlaceholder')"
        :aria-label="t('homework.searchPlaceholder')"
        clearable
        style="width: 220px"
        @keyup.enter="applyFilters"
        @clear="applyFilters"
      >
        <template #append>
          <el-button :icon="Search" :aria-label="t('common.search')" @click="applyFilters" />
        </template>
      </el-input>
      <el-select
        v-model="filters.status"
        :placeholder="t('homework.allStatuses')"
        clearable
        style="width: 140px"
        @change="applyFilters"
      >
        <el-option v-for="(s, key) in statusMap" :key="key" :label="s.label" :value="key" />
      </el-select>
      <el-select
        v-model="filters.categoryId"
        :placeholder="t('homework.allCategories')"
        clearable
        style="width: 180px"
        @change="applyFilters"
      >
        <el-option :label="t('homework.uncategorized')" value="none" />
        <el-option v-for="c in categoryOptions" :key="c.id" :label="c.name" :value="c.id" />
      </el-select>
      <el-button :icon="RefreshRight" @click="resetFilters">{{ t('common.reset') }}</el-button>
      <span class="spacer"></span>
      <span class="count">{{ t('common.totalItems', { n: total }) }}</span>
    </div>

    <ListError :message="error" @retry="run" />

    <el-table
      v-if="!error && (loading || list.length)"
      ref="tableRef"
      :data="list"
      border
      stripe
      row-key="id"
      v-loading="loading"
      @selection-change="onSelectionChange"
    >
      <el-table-column type="selection" width="46" reserve-selection />
      <el-table-column
        prop="title"
        :label="t('homework.title')"
        min-width="240"
        show-overflow-tooltip
      />
      <el-table-column :label="t('homework.category')" width="110">
        <!-- 与「浏览作业」页同一套口径：有分类给蓝色标签，没有就把「未分类」
             压到次要层级（它是「没有值」而不是一种状态，不该用标签样式）。 -->
        <template #default="{ row }">
          <el-tag v-if="row.categoryId" size="small" type="info">{{
            categoryName(row.categoryId)
          }}</el-tag>
          <span v-else class="cat-none">{{ t('homework.uncategorized') }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('homework.status')" width="100">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)" size="small">{{
            statusLabel(row.status)
          }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('homework.questionCount')" width="90">
        <template #default="{ row }">{{
          row.questionCount ?? (row.questionIds || []).length
        }}</template>
      </el-table-column>
      <el-table-column :label="t('homework.endAt')" width="180">
        <template #default="{ row }">
          <span :class="{ 'end-at--expired': isExpired(row.endAt) }">{{
            formatDateTime(row.endAt)
          }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.actions')" width="250">
        <template #default="{ row }">
          <!-- 一行只留两个常驻动作：编辑（管理入口）与查看（学生视角预览）。
               其余收进「更多」，避免操作列把表格撑到横向滚动。 -->
          <el-button size="small" type="primary" :icon="EditPen" @click="openEdit(row)">{{
            t('common.edit')
          }}</el-button>
          <el-button size="small" :icon="View" @click="openView(row)">{{
            t('homework.view')
          }}</el-button>
          <el-dropdown trigger="click" @command="(cmd) => onRowCommand(cmd, row)">
            <el-button size="small" :icon="MoreFilled">
              {{ t('homework.more') }}
              <el-icon class="more-chev"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="summary">
                  <el-icon class="menu-icon"><Notebook /></el-icon>{{ t('homework.lessonSummary') }}
                </el-dropdown-item>
                <el-dropdown-item command="score">
                  <el-icon class="menu-icon"><Edit /></el-icon>{{ t('homework.score') }}
                </el-dropdown-item>
                <el-dropdown-item command="export">
                  <el-icon class="menu-icon"><Download /></el-icon>{{ t('homework.exportPdf') }}
                </el-dropdown-item>
                <el-dropdown-item command="delete" divided style="color: var(--el-color-danger)">
                  <el-icon class="menu-icon"><Delete /></el-icon>{{ t('common.delete') }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </el-table-column>
    </el-table>

    <el-empty
      v-if="!error && !loading && !list.length"
      :description="hasFilter ? t('homework.emptyFiltered') : t('common.noData')"
    />

    <div v-if="total > pageSize" class="pager">
      <el-pagination
        v-if="!error"
        v-model:current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="prev, pager, next, total"
        background
        @current-change="run"
      />
    </div>
  </el-card>

  <!-- 发布 / 编辑作业：表单与三个选题弹层都由组件内部编排 -->
  <HomeworkFormDialog
    v-model="formVisible"
    :homework="editDetail"
    :category-options="categoryOptions"
    @saved="onSaved"
    @refresh-categories="loadCategoryOptions"
  />

  <!-- 导出作业 PDF（与「查看作业」页共用 HomeworkExportDialog 组件） -->
  <HomeworkExportDialog
    v-model="exportVisible"
    :homework="exportHomework"
    :questions="exportQuestions"
    :students="exportStudents"
  />

  <!-- 课时总结：复用可复用组件（作业列表与总结列表共用） -->
  <LessonSummaryDialog
    v-model="summaryVisible"
    :homework-id="summaryHomeworkId"
    :summary-id="summaryEditId"
    :school-name="layout.schoolName"
    @saved="run"
  />

  <!-- 录入成绩：学生与已有成绩由组件自己取，页面只传作业 id -->
  <HomeworkScoreDialog v-model="scoreVisible" :homework-id="scoreHomeworkId" />

  <!-- 查看作业（学生视角，不显示答案）：与「查看作业」页共用抽屉 -->
  <HomeworkPreviewDrawer v-model="previewVisible" :homework="previewHomework" />

  <!-- 作业分类管理：新建 / 重命名 / 删除 / 设默认 / 拖拽排序。
       弹窗自己取数与写库，页面只接 changed 回拉列表——
       因为分类改名会让表格里的分类列显示变旧，删除分类会把作业打回未分类。
       分类选项也要一起重拉：表格的「分类」列与发布表单的下拉都从
       categoryOptions 反查名字，只刷作业列表的话，改名后列里还是旧名、
       下拉里还会留着一个已经被删掉的分类。 -->
  <HomeworkCategoryDialog v-model="catVisible" @changed="onCategoriesChanged" />
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  Plus,
  Edit,
  EditPen,
  Download,
  Delete,
  Notebook,
  Files,
  Search,
  RefreshRight,
  MoreFilled,
  ArrowDown,
  View
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getHomeworks,
  getHomework,
  getHomeworkQuestions,
  deleteHomework,
  bulkDeleteHomeworks
} from '../../api/homework'
import { listHomeworkCategories } from '../../api/homeworkCategory'
import { getStudents } from '../../api/student'
import { getSummaries } from '../../api/summary'
import { formatDateTime } from '../../utils/format'
import { handleQuickAction } from '../../utils/quickAction'
import { useListQuery } from '../../composables/useListQuery'
import ListError from '../../components/ListError.vue'
import HomeworkFormDialog from '../../components/homework/HomeworkFormDialog.vue'
import HomeworkScoreDialog from '../../components/homework/HomeworkScoreDialog.vue'
import HomeworkCategoryDialog from '../../components/homework/HomeworkCategoryDialog.vue'
import HomeworkExportDialog from '../../components/HomeworkExportDialog.vue'
import LessonSummaryDialog from '../../components/LessonSummaryDialog.vue'
import HomeworkPreviewDrawer from '../../components/homework/HomeworkPreviewDrawer.vue'
import type { Homework, HomeworkCategory } from '../../types'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

// 作业列表分页
const page = ref(1)
const pageSize = 20

// —— 筛选：标题关键字 / 状态 / 分类 ——
// 状态与分类后端已支持；关键字由后端按标题模糊匹配。
const filters = reactive({
  keyword: '',
  status: '' as '' | 'draft' | 'published' | 'closed',
  categoryId: undefined as undefined | '' | 'none' | number
})
const hasFilter = computed(
  () => !!filters.keyword.trim() || !!filters.status || (filters.categoryId ?? '') !== ''
)

// 发布 / 编辑弹窗。editDetail 非空 = 编辑已有作业
const formVisible = ref(false)
const editDetail = ref<any | null>(null)

// 查看作业（学生视角，不显示答案）
const previewVisible = ref(false)
const previewHomework = ref<Homework | null>(null)
const openView = (row: Homework) => {
  previewHomework.value = row
  previewVisible.value = true
}

// 录入成绩
const scoreVisible = ref(false)
const scoreHomeworkId = ref<number | null>(null)

// 分类管理弹窗。不传 status：这里管的是全部分类的增删改，
// 若按 published 计数，未发布作业会凭空消失，删除保护判断也会失准。
const catVisible = ref(false)
const openCategories = () => {
  catVisible.value = true
}

// —— 分类归属（发布/编辑表单里的下拉 + 表格的「分类」列）——
// 与 catVisible 那个弹窗共用同一份数据源，但用途不同：这个只读、只取 id/name/isDefault。
const categoryOptions = ref<HomeworkCategory[]>([])

const loadCategoryOptions = async () => {
  try {
    categoryOptions.value = await listHomeworkCategories()
  } catch {
    // 分类没取到不该挡住「发布作业」：降级成一个空的分类下拉，
    // 用户仍能发布成未分类，事后再用「分类管理」调整。
    categoryOptions.value = []
  }
}

const categoryName = (id: number) => categoryOptions.value.find((c) => c.id === id)?.name || '—'

// 分类被增删改后：列表与选项都要重拉（见模板里那段注释）。
// 顺序无要求，用 Promise.all 让两者并发。
const onCategoriesChanged = () => Promise.all([run(), loadCategoryOptions()])

const openCreate = () => {
  editDetail.value = null
  formVisible.value = true
}

// 编辑已有作业：先把详情拉好再打开，避免弹窗先显示空表单再跳成真值
const openEdit = async (row: any) => {
  editDetail.value = await getHomework(row.id)
  formVisible.value = true
}

const onSaved = () => {
  editDetail.value = null
  // 广播给题库浏览页：作业题目已变，让它刷新「已做过」标记
  window.dispatchEvent(new CustomEvent('question-used-changed'))
  run()
}

// —— 状态与截止时间的展示辅助 ——
const statusMap = computed<
  Record<string, { label: string; type: 'success' | 'warning' | 'info' | 'primary' | 'danger' }>
>(() => ({
  draft: { label: t('homework.statusDraft'), type: 'info' },
  published: { label: t('homework.statusPublished'), type: 'success' },
  closed: { label: t('homework.statusClosed'), type: 'warning' }
}))
const statusLabel = (s: string) => statusMap.value[s]?.label || s || '—'
const statusTagType = (s: string): 'success' | 'warning' | 'info' | 'primary' | 'danger' =>
  statusMap.value[s]?.type || 'info'

// 截止时间是否已过（用于标红提示）
const isExpired = (d: any) => {
  if (!d) return false
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return false
  return date.getTime() < Date.now()
}

// 取数骨架：loading / 错误态 / 防竞态 / 末页回退。
// 页面里另外三个取数（题目池 / 学生名单 / 分类选项）是弹窗内的独立数据，
// 各有自己的 loading，不并入这里。
const { list, total, loading, error, run, backoffIfLastPageEmpty } = useListQuery<Homework>(
  () => {
    const params: any = { page: page.value, pageSize }
    const keyword = filters.keyword.trim()
    if (keyword) params.keyword = keyword
    if (filters.status) params.status = filters.status
    if (filters.categoryId !== undefined && filters.categoryId !== '') {
      params.categoryId = filters.categoryId
    }
    return getHomeworks(params, { silent: true })
  },
  // immediate:false —— 下面 onMounted 要和分类选项并行拉，别让骨架先自己拉一遍
  { immediate: false }
)

/* ===================== 导出 PDF ===================== */
const exportVisible = ref(false)
const exportHomework = ref<any>(null)
const exportQuestions = ref<any[]>([])
const exportStudents = ref<any[]>([])

// 学校名称：页眉展示（导出对话框内单独编辑，这里保留一份供课时总结复用）
const layout = reactive({ schoolName: '' })

// 打开导出预览：先拉题目与学生，再交给对话框渲染
const openExport = async (row: any) => {
  exportHomework.value = row
  exportQuestions.value = []
  exportStudents.value = []
  exportVisible.value = true
  try {
    exportQuestions.value = await getHomeworkQuestions(row.id)
    // 作业选中的学生，导出时预填姓名/年级
    const ids: number[] = row.studentIds || []
    if (ids.length) {
      const students = await getStudents()
      exportStudents.value = students.filter((s: any) => ids.includes(s.id))
    }
  } catch {
    exportQuestions.value = []
  }
}

/* ===================== 课时总结 ===================== */
// 编辑器已抽成 LessonSummaryDialog 组件（作业列表与「课时总结」菜单页共用）
const summaryVisible = ref(false)
const summaryHomeworkId = ref<number | null>(null)
const summaryEditId = ref<number | null>(null)

// 从作业行打开：组件内部自行载入该作业的学生/题目数/历史记录
const openSummary = (row: any) => {
  summaryHomeworkId.value = row.id
  summaryEditId.value = null
  summaryVisible.value = true
}

/* ===================== 录入成绩 ===================== */
// 学生与已有成绩由 HomeworkScoreDialog 自己取；没选学生时组件内提示并关闭
const openScore = (row: any) => {
  scoreHomeworkId.value = row.id
  scoreVisible.value = true
}

/** 行内「更多」菜单：把低频动作收起来，保留全部入口 */
const onRowCommand = (cmd: string, row: any) => {
  if (cmd === 'summary') openSummary(row)
  else if (cmd === 'score') openScore(row)
  else if (cmd === 'export') openExport(row)
  else if (cmd === 'delete') remove(row)
}

/* ===================== 删除 ===================== */
const remove = async (row: any) => {
  // 该作业下的课时总结会一并删除，删除前提示数量，避免误删教学记录
  let summaryCount = 0
  try {
    summaryCount = ((await getSummaries({ homeworkId: row.id })) || []).length
  } catch {
    /* 统计失败不阻塞删除 */
  }
  try {
    await ElMessageBox.confirm(
      t('homework.deleteConfirm', {
        title: row.title,
        summaries: summaryCount ? t('homework.summariesSuffix', { n: summaryCount }) : ''
      }),
      t('homework.deleteTitle'),
      {
        type: 'warning',
        confirmButtonText: t('common.delete'),
        cancelButtonText: t('common.cancel')
      }
    )
  } catch {
    return
  }
  try {
    await deleteHomework(row.id)
    ElMessage.success(t('common.deleteSuccess'))
    backoffIfLastPageEmpty(page)
    await run()
  } catch (err) {
    // 错误提示已由 request.ts 全局弹出
    console.error('删除作业失败', err)
  }
}

/* ===================== 批量删除 ===================== */
const tableRef = ref<any>()
const selectedIds = ref<number[]>([])
const bulkDeleting = ref(false)

const onSelectionChange = (rows: any[]) => {
  selectedIds.value = rows.map((r) => r.id)
}

const clearSelection = () => {
  tableRef.value?.clearSelection()
  selectedIds.value = []
}

// 筛选变化后回到第一页，并清掉跨页勾选——避免「筛完再批量删」误删看不见的作业
const applyFilters = () => {
  clearSelection()
  page.value = 1
  run()
}

const resetFilters = () => {
  filters.keyword = ''
  filters.status = ''
  filters.categoryId = undefined
  applyFilters()
}

const bulkRemove = async () => {
  const ids = [...selectedIds.value]
  if (!ids.length) return

  let summaryCount = 0
  try {
    const all = (await getSummaries({})) || []
    summaryCount = all.filter((s) => ids.includes(s.homeworkId)).length
  } catch {
    /* 统计失败不阻塞删除 */
  }

  try {
    await ElMessageBox.confirm(
      t('homework.bulkDeleteConfirm', {
        n: ids.length,
        summaries: summaryCount ? t('homework.summariesSuffix', { n: summaryCount }) : ''
      }),
      t('homework.bulkDeleteTitle'),
      {
        type: 'warning',
        confirmButtonText: t('homework.bulkDeleteButton', { n: ids.length }),
        cancelButtonText: t('common.cancel')
      }
    )
  } catch {
    return
  }

  bulkDeleting.value = true
  try {
    const res = await bulkDeleteHomeworks(ids)
    ElMessage.success(
      t('homework.bulkDeleted', { n: res.deleted }) +
        (res.summaries ? t('homework.bulkDeletedSummaries', { n: res.summaries }) : '')
    )
    clearSelection()
    // 删除后当前页可能已空，回退页码避免停在空白页
    backoffIfLastPageEmpty(page, ids.length)
    await run()
  } catch (err) {
    console.error('批量删除作业失败', err)
  } finally {
    bulkDeleting.value = false
  }
}

onMounted(async () => {
  // 分类选项要在列表渲染前就绪：表格的「分类」列靠 categoryName() 反查名字，
  // 晚一步就会先显示一串「—」再跳成真名。
  await Promise.all([run(), loadCategoryOptions()])
  // 首页快捷入口：/homeworks?action=new 直接打开发布作业对话框
  handleQuickAction(route, router, { new: openCreate })
})
</script>

<style scoped>
.toolbar {
  margin-bottom: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.filters {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.spacer {
  flex: 1;
}
.count {
  color: var(--ink-soft);
  font-size: var(--text-xs);
  white-space: nowrap;
}
.more-chev {
  margin-left: 4px;
}
.menu-icon {
  margin-right: 8px;
}
.picked-count {
  color: var(--ink-soft);
  font-size: 13px;
}
/* 「分类」列的空值：与「浏览作业」页同款处理——未分类是「没有值」而不是一种状态，
   不用标签样式，压到次要层级 */
.cat-none {
  color: var(--ink-placeholder);
  font-size: 12px;
}
.end-at--expired {
  color: var(--el-color-danger);
  font-weight: 600;
}
.pager {
  margin-top: 16px;
  display: flex;
  justify-content: center;
}
</style>
