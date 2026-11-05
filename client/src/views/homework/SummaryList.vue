<template>
  <el-card>
    <div class="toolbar">
      <el-input
        v-model="keyword"
        :placeholder="t('summaryList.searchPlaceholder')"
        :aria-label="t('summaryList.searchPlaceholder')"
        clearable
        style="width: 300px"
        @input="onKeywordInput"
        @clear="onClearKw"
      />
      <el-select
        v-model="studentId"
        :placeholder="t('summaryList.allStudents')"
        clearable
        filterable
        style="width: 180px"
        @change="onStudentFilter"
      >
        <el-option
          v-for="s in students"
          :key="s.id"
          :label="s.grade ? `${s.name} (${gradeLabel(s.grade)})` : s.name"
          :value="s.id"
        />
      </el-select>
      <el-button :icon="RefreshLeft" @click="reset">{{ t('common.reset') }}</el-button>
      <span class="count">{{ t('common.totalItems', { n: filtered.length }) }}</span>
      <el-button type="primary" :icon="Plus" class="new-entry" @click="goHomeworks">
        {{ t('summaryList.newByHomework') }}
      </el-button>
    </div>

    <ListError :message="error" @retry="run" />

    <el-table v-if="!error" :data="filtered" border stripe v-loading="loading">
      <el-table-column :label="t('summaryList.lessonTime')" width="160">
        <template #default="{ row }">{{ formatDateTime(row.lessonAt) }}</template>
      </el-table-column>
      <el-table-column :label="t('summaryList.lessonNoHeader')" width="80" align="center">
        <template #default="{ row }">
          <el-tag size="small" type="info">{{
            t('summaryList.lessonNo', { n: row.lessonNo ?? '—' })
          }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('summaryList.student')" width="120">
        <template #default="{ row }">{{ row.student?.name || '—' }}</template>
      </el-table-column>
      <el-table-column :label="t('summaryList.homework')" min-width="160" show-overflow-tooltip>
        <template #default="{ row }">{{ row.homework?.title || '—' }}</template>
      </el-table-column>
      <el-table-column :label="t('summaryList.content')" min-width="220" show-overflow-tooltip>
        <template #default="{ row }">{{ row.content || '—' }}</template>
      </el-table-column>
      <el-table-column :label="t('common.actions')" width="240" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" :icon="EditPen" @click="openEditor(row)">{{
            t('summaryList.editExport')
          }}</el-button>
          <el-button size="small" type="danger" :icon="Delete" @click="remove(row)">{{
            t('common.delete')
          }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-empty
      v-if="!loading && !filtered.length"
      :description="hasFilter ? t('summaryList.noMatch') : t('summaryList.empty')"
    >
      <el-button v-if="!hasFilter" type="primary" :icon="Plus" @click="goHomeworks">{{
        t('summaryList.emptyAction')
      }}</el-button>
    </el-empty>

    <!-- 复用作业列表同一套编辑器（含 AI 生成、图片/PDF 导出） -->
    <LessonSummaryDialog
      v-model="editorVisible"
      :homework-id="editingHomeworkId"
      :summary-id="editingSummaryId"
      @saved="run"
    />
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { RefreshLeft, EditPen, Delete, Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getSummaries, deleteSummary } from '../../api/summary'
import { getStudents } from '../../api/student'
import LessonSummaryDialog from '../../components/LessonSummaryDialog.vue'
import ListError from '../../components/ListError.vue'
import { useListQuery } from '../../composables/useListQuery'
import { formatDateTime } from '../../utils/format'
import { gradeLabel } from '../../utils/i18nLabels'
import { queryNumber, queryText, stableQuery } from '../../utils/routeQuery'

const { t } = useI18n()

const router = useRouter()
const route = useRoute()
const goHomeworks = () => router.push('/homeworks')
// 清搜索词：关键词是前端过滤，无需请求；清空后同步地址栏
const onClearKw = () => {
  keyword.value = ''
  window.clearTimeout(kwTimer)
  writeQuery()
}

const students = ref<any[]>([])
const keyword = ref('')
const studentId = ref<number | undefined>()

// 筛选写进地址栏：关键词是前端过滤，输入时做 250ms 防抖；学生筛选走接口
let lastSyncedQuery = ''
let kwTimer: number | undefined
const readQuery = () => {
  keyword.value = queryText(route.query, 'keyword')
  const id = queryNumber(route.query, 'studentId', 0)
  studentId.value = id || undefined
}
const writeQuery = () => {
  const q: Record<string, string> = {}
  if (keyword.value.trim()) q.keyword = keyword.value.trim()
  if (studentId.value != null) q.studentId = String(studentId.value)
  lastSyncedQuery = stableQuery(q)
  router.replace({ path: route.path, query: q })
}
const onKeywordInput = () => {
  window.clearTimeout(kwTimer)
  kwTimer = window.setTimeout(writeQuery, 250)
}
const onStudentFilter = () => run()
readQuery()

const editorVisible = ref(false)
const editingHomeworkId = ref<number | null>(null)
const editingSummaryId = ref<number | null>(null)

// 关键词在前端过滤（单教师数据量小，省一次往返）
const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return list.value.filter((row) => {
    if (studentId.value && row.studentId !== studentId.value) return false
    if (!kw) return true
    const hay = [
      row.student?.name,
      row.homework?.title,
      row.content,
      row.classStatus,
      row.homeworkTask
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return hay.includes(kw)
  })
})

// 本地筛选是否生效：用于区分「还没有数据」和「筛掉了」
const hasFilter = computed(() => !!keyword.value.trim() || studentId.value != null)

// 取数骨架：错误态与重试 / 防竞态。这里没有分页，total 即列表长度。
const { list, loading, error, run } = useListQuery<any>(
  () => getSummaries({ studentId: studentId.value }, { silent: true }).then((rows) => rows || []),
  // immediate:false —— onMounted 里还要并行拉学生名单
  { immediate: false, onLoaded: () => writeQuery() }
)

watch(
  () => route.query,
  (q) => {
    if (stableQuery(q) === lastSyncedQuery) return
    readQuery()
    run()
  }
)

const reset = () => {
  keyword.value = ''
  studentId.value = undefined
  run()
}

// 打开编辑器：带上作业 id 与总结 id，组件会自行载入全部上下文
const openEditor = (row: any) => {
  editingHomeworkId.value = row.homeworkId ?? null
  editingSummaryId.value = row.id ?? null
  editorVisible.value = true
}

const remove = async (row: any) => {
  try {
    await ElMessageBox.confirm(t('summaryList.deleteConfirm'), t('common.tips'), {
      type: 'warning'
    })
  } catch {
    return
  }
  try {
    await deleteSummary(row.id)
    ElMessage.success(t('summaryList.deleted'))
    run()
  } catch (err) {
    console.error('删除课时总结失败', err)
  }
}

onMounted(async () => {
  run()
  try {
    students.value = (await getStudents()) as any[]
  } catch {
    /* 学生列表失败不影响主列表 */
  }
})

onBeforeUnmount(() => window.clearTimeout(kwTimer))
</script>

<style scoped>
.toolbar {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.count {
  color: var(--ink-soft);
  font-size: 13px;
}
.new-entry {
  margin-left: auto;
}
</style>
