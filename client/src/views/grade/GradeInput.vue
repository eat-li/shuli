<template>
  <el-card class="grade-input">
    <div class="page-head">
      <div class="page-head__main">
        <span class="page-count">{{ t('gradeInput.subtitle', { n: cards.length }) }}</span>
        <span class="page-tip">{{ t('gradeInput.hint') }}</span>
      </div>
      <div class="page-head__actions">
        <el-button :icon="Upload" @click="openBatch">{{ t('gradeInput.batchEntry') }}</el-button>
        <el-button type="primary" :icon="Plus" @click="openDialog()">{{
          t('gradeInput.addGrade')
        }}</el-button>
      </div>
    </div>

    <div class="filter-panel">
      <el-input
        v-model="fName"
        class="filter-search"
        :placeholder="t('gradeInput.searchStudent')"
        :aria-label="t('gradeInput.searchStudent')"
        clearable
        @input="onNameInput"
        @clear="onNameInput"
      >
        <template #prefix
          ><el-icon><Search /></el-icon
        ></template>
      </el-input>
      <el-select
        v-model="fExamType"
        class="filter-type"
        :placeholder="t('gradeInput.examType')"
        :aria-label="t('gradeInput.examType')"
        clearable
      >
        <el-option v-for="et in examTypes" :key="et.key" :label="et.name" :value="et.key" />
      </el-select>
      <el-date-picker
        v-model="fExamDate"
        type="date"
        value-format="YYYY-MM-DD"
        :placeholder="t('gradeInput.examDate')"
        :aria-label="t('gradeInput.examDate')"
        class="filter-date"
      />
      <el-button :icon="Search" @click="reloadGrades">{{ t('common.search') }}</el-button>
      <el-button :icon="RefreshRight" @click="reset">{{ t('common.reset') }}</el-button>
      <span class="filter-spacer"></span>
      <el-button link type="primary" @click="openTypes">{{
        t('gradeInput.manageTypes')
      }}</el-button>
    </div>

    <ListError :message="cardsError" @retry="reloadGrades" />

    <!-- 学生卡片：默认全量展示，按姓名实时过滤 -->
    <div v-if="!cardsError" class="cards" v-loading="loading">
      <article
        v-for="c in visibleCards"
        :key="c.id"
        class="stu-card"
        :class="{ 'stu-card--empty': !c.latest }"
        role="button"
        tabindex="0"
        @click="openDrawer(c)"
        @keydown.enter.prevent="openDrawer(c)"
        @keydown.space.prevent="openDrawer(c)"
      >
        <header class="stu-card__head">
          <span class="stu-name">{{ c.name }}</span>
          <span class="stu-meta">
            <span v-if="c.grade" class="stu-grade">{{ gradeLabel(c.grade) }}</span>
            <span class="stu-count">{{ c.examCount }} {{ t('gradeInput.examCount') }}</span>
          </span>
        </header>

        <template v-if="c.latest">
          <div class="stu-latest">
            <el-tag size="small" effect="plain">{{ typeName(c.latest.examType) }}</el-tag>
            <span class="stu-date">{{ formatDate(c.latest.examDate) }}</span>
          </div>
          <div class="stu-score">
            <span class="stu-score__num">{{ c.latest.score }}</span>
            <span class="stu-score__full">/ {{ c.latest.fullScore }}</span>
            <span class="stu-score__pct" :class="pctClass(c.latest)">{{ percent(c.latest) }}%</span>
          </div>
          <div class="stu-bar" :class="pctClass(c.latest)">
            <i :style="{ width: percent(c.latest) + '%' }" />
          </div>
        </template>
        <div v-else class="stu-empty">
          <span>{{ t('gradeInput.noGrades') }}</span>
          <span class="stu-empty__cta">{{ t('gradeInput.addFirst') }}</span>
        </div>

        <footer class="stu-card__foot">{{ t('gradeInput.viewAll') }}</footer>
      </article>

      <el-empty
        v-if="!loading && !visibleCards.length"
        :description="fName ? t('gradeInput.noMatch') : t('gradeInput.noStudents')"
      />
    </div>

    <!-- 学生成绩详情抽屉 -->
    <el-drawer
      v-model="drawerVisible"
      :title="t('gradeInput.gradesOf', { name: currentStudent?.name || '' })"
      size="640px"
    >
      <div v-if="fExamType || fExamDate" class="drawer-filter">
        {{ t('gradeInput.filteredBy') }}
        <el-tag v-if="fExamType" size="small" style="margin-right: 6px">{{
          typeName(fExamType)
        }}</el-tag>
        <el-tag v-if="fExamDate" size="small">{{ formatDate(fExamDate) }}</el-tag>
      </div>

      <div class="drawer-actions">
        <el-button
          type="primary"
          :icon="Plus"
          size="small"
          @click="openDialog(null, currentStudent)"
        >
          {{ t('gradeInput.addForStudent') }}
        </el-button>
      </div>

      <el-table
        :data="currentGrades"
        border
        stripe
        max-height="60vh"
        v-loading="drawerLoading"
        class="grade-table"
      >
        <el-table-column :label="t('gradeInput.date')" width="110">
          <template #default="{ row }">{{ formatDate(row.examDate) }}</template>
        </el-table-column>
        <el-table-column :label="t('gradeInput.type')" width="86">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ typeName(row.examType) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('gradeInput.score')" width="96">
          <template #default="{ row }">
            <span class="score">{{ row.score }}</span>
            <span class="score-full">/ {{ row.fullScore }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('gradeInput.percent')" width="78">
          <template #default="{ row }"
            ><span :class="pctClass(row)">{{ percent(row) }}%</span></template
          >
        </el-table-column>
        <el-table-column
          prop="comment"
          :label="t('common.notes')"
          min-width="110"
          show-overflow-tooltip
        />
        <el-table-column :label="t('common.actions')" width="96" align="right" fixed="right">
          <template #default="{ row }">
            <div class="row-actions">
              <el-button link type="primary" @click="openDialog(row)">{{
                t('common.edit')
              }}</el-button>
              <el-button link type="danger" @click="remove(row)">{{
                t('common.delete')
              }}</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <el-empty
        v-if="!drawerLoading && !currentGrades.length"
        :description="t('gradeInput.noMatchingGrades')"
      />
    </el-drawer>

    <!-- 新增 / 编辑 -->
    <el-dialog
      v-model="dialogVisible"
      :title="form.id ? t('gradeInput.editGrade') : t('gradeInput.addGrade')"
      width="460px"
    >
      <el-form :model="form" label-width="80px" @keydown.enter="(e) => submitOnEnter(e, save)">
        <el-form-item :label="t('gradeInput.student')">
          <el-select
            v-model="form.studentId"
            filterable
            :placeholder="t('gradeInput.selectStudents')"
            style="width: 100%"
          >
            <el-option
              v-for="s in students"
              :key="s.id"
              :label="s.grade ? `${s.name} (${gradeLabel(s.grade)})` : s.name"
              :value="s.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('gradeInput.examType')">
          <el-select v-model="form.examType" style="width: 100%">
            <el-option v-for="et in examTypes" :key="et.key" :label="et.name" :value="et.key" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('gradeInput.examDate')">
          <el-date-picker
            v-model="form.examDate"
            type="date"
            value-format="YYYY-MM-DD"
            :placeholder="t('common.selectDate')"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item :label="t('gradeInput.score')">
          <el-input-number
            v-model="form.score"
            :min="0"
            :max="form.fullScore || 1000"
            :precision="1"
            style="width: 140px"
          />
          <span class="inline-tip">{{ t('gradeInput.scoreDivider') }}</span>
          <el-input-number
            v-model="form.fullScore"
            :min="1"
            :precision="1"
            style="width: 120px; margin-left: 8px"
          />
        </el-form-item>
        <el-form-item :label="t('common.notes')">
          <el-input v-model="form.comment" :placeholder="t('gradeInput.commentPlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="save">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <!-- 批量录入 -->
    <el-dialog v-model="batchVisible" :title="t('gradeInput.batchTitle')" width="640px">
      <el-form label-width="80px">
        <div class="batch-session">
          <el-form-item :label="t('gradeInput.examType')">
            <el-select v-model="batchForm.examType" style="width: 150px">
              <el-option v-for="et in examTypes" :key="et.key" :label="et.name" :value="et.key" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('gradeInput.fullScore')">
            <el-input-number
              v-model="batchForm.fullScore"
              :min="1"
              :precision="1"
              style="width: 120px"
            />
          </el-form-item>
          <el-form-item :label="t('gradeInput.examDate')">
            <el-date-picker
              v-model="batchForm.examDate"
              type="date"
              value-format="YYYY-MM-DD"
              :placeholder="t('common.selectDate')"
              style="width: 150px"
            />
          </el-form-item>
        </div>

        <el-form-item :label="t('gradeInput.selectStudents')">
          <el-select
            v-model="batchStudentIds"
            multiple
            filterable
            collapse-tags
            collapse-tags-tooltip
            :placeholder="t('gradeInput.multiStudents')"
            style="width: 100%"
          >
            <el-option v-for="s in students" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
      </el-form>

      <el-table v-if="selectedStudents.length" :data="selectedStudents" border max-height="320">
        <el-table-column prop="name" :label="t('common.name')" width="140" />
        <el-table-column :label="t('gradeInput.score')">
          <template #default="{ row }">
            <el-input-number
              v-model="batchScores[row.id]"
              :min="0"
              :max="batchForm.fullScore"
              :precision="1"
              size="small"
              style="width: 160px"
            />
          </template>
        </el-table-column>
      </el-table>
      <div v-else class="batch-empty">{{ t('gradeInput.batchEmpty') }}</div>

      <template #footer>
        <el-button @click="batchVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button
          type="primary"
          :disabled="!selectedStudents.length || batchSaving"
          :loading="batchSaving"
          @click="submitBatch"
          >{{ t('gradeInput.confirmBatch') }}</el-button
        >
      </template>
    </el-dialog>

    <!-- 考试类型管理：名称可改，key 不动；有成绩在用的类型不能删 -->
    <el-dialog v-model="typesVisible" :title="t('gradeInput.typesTitle')" width="480px">
      <div class="type-add">
        <el-input
          v-model="newTypeName"
          maxlength="50"
          :placeholder="t('gradeInput.typeNamePlaceholder')"
          @keyup.enter="addType"
        />
        <el-button
          type="primary"
          :loading="typeSaving"
          :disabled="!newTypeName.trim()"
          @click="addType"
          >{{ t('gradeInput.typeAdd') }}</el-button
        >
      </div>
      <ul class="type-list">
        <li v-for="et in examTypes" :key="et.key" class="type-row">
          <span class="type-name">{{ et.name }}</span>
          <span class="type-count">{{ t('gradeInput.typeCount', { n: et.count }) }}</span>
          <el-button
            text
            size="small"
            :icon="Edit"
            :aria-label="t('gradeInput.renameType')"
            @click="renameType(et)"
          />
          <el-button
            text
            size="small"
            type="danger"
            :icon="Delete"
            :aria-label="t('common.delete')"
            @click="removeType(et)"
          />
        </li>
      </ul>
      <p class="type-hint">{{ t('gradeInput.typeHint') }}</p>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Plus, Upload, Search, Edit, Delete, RefreshRight } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getStudents } from '../../api/student'
import { getExamTypes, createExamType, renameExamType, deleteExamType } from '../../api/examType'
import type { ExamTypeItem } from '../../api/examType'
import {
  getGrades,
  getGradeCards,
  createGrade,
  updateGrade,
  deleteGrade,
  importGrades
} from '../../api/grade'
import { handleQuickAction } from '../../utils/quickAction'
import { gradeLabel } from '../../utils/i18nLabels'
import { formatDate } from '../../utils/format'
import { submitOnEnter } from '../../utils/formEnter'
import ListError from '../../components/ListError.vue'
import { queryText, stableQuery } from '../../utils/routeQuery'
import type { Student, ExamScore, GradeCard } from '../../types'

const route = useRoute()
const router = useRouter()
const { t, te } = useI18n()

// 类型来自后端字典（可新增/改名）；老数据的 key 用内置文案兜底
const examTypes = ref<ExamTypeItem[]>([])
const typeName = (key: string) =>
  examTypes.value.find((x) => x.key === key)?.name || (te(`exam.${key}`) ? t(`exam.${key}`) : key)
const defaultTypeKey = () => examTypes.value[0]?.key || ''

const loadExamTypes = async () => {
  try {
    examTypes.value = await getExamTypes({ silent: true })
  } catch {
    // 类型加载失败时下拉为空；新增保存会被后端拒绝并提示
  }
}

// 所有学生（用于下拉选择）
const students = ref<Student[]>([])
// 学生卡片聚合数据（由后端返回考试次数 + 最近一次成绩，不再把全量成绩拉到前端）
const cards = ref<GradeCard[]>([])
const loading = ref(false)
const cardsError = ref('')

// —— 提交防连点 ——
// 必须是 ref：模板里的 :loading / :disabled 直接绑这两个值，普通 let 不会触发重渲染
const saving = ref(false)
const batchSaving = ref(false)

// 统一的确认对话框封装：取消时不抛 unhandled rejection，返回是否确认
const confirmDialog = async (message: string, title?: string): Promise<boolean> => {
  try {
    await ElMessageBox.confirm(message, title || t('common.tips'), { type: 'warning' })
    return true
  } catch {
    return false
  }
}

// 筛选条件
const fName = ref('')
const fExamType = ref('')
const fExamDate = ref('')

// 筛选写进地址栏：姓名是前端实时过滤（防抖写入），类型/日期随查询提交
let lastSyncedQuery = ''
let nameTimer: number | undefined
const readQuery = () => {
  fName.value = queryText(route.query, 'keyword')
  fExamType.value = queryText(route.query, 'examType')
  fExamDate.value = queryText(route.query, 'examDate')
}
const writeQuery = () => {
  const q: Record<string, string> = {}
  if (fName.value.trim()) q.keyword = fName.value.trim()
  if (fExamType.value) q.examType = fExamType.value
  if (fExamDate.value) q.examDate = fExamDate.value
  lastSyncedQuery = stableQuery(q)
  router.replace({ path: route.path, query: q })
}
readQuery()

// 姓名实时过滤
const visibleCards = computed(() => {
  const kw = fName.value.trim().toLowerCase()
  if (!kw) return cards.value
  return cards.value.filter((c) => c.name.toLowerCase().includes(kw))
})

// 抽屉
const drawerVisible = ref(false)
const currentStudent = ref<GradeCard | null>(null)
const drawerLoading = ref(false) // 成绩抽屉加载态（区分加载中与"暂无成绩"）
const currentGrades = ref<ExamScore[]>([])

const percent = (row: any) =>
  row.fullScore > 0 ? Math.round((row.score / row.fullScore) * 100) : 0
const pctClass = (row: any) => {
  const p = percent(row)
  if (p >= 90) return 'pct pct--good'
  if (p >= 60) return 'pct pct--mid'
  return 'pct pct--bad'
}

const loadStudents = async () => {
  students.value = await getStudents()
}

// 拉取学生卡片聚合数据（考试类型 / 日期为可选筛选条件）
// 失败要单独给出错误态：否则接口挂掉时会落成「还没有学生」的假空态。
let gradesSeq = 0
const reloadGrades = async () => {
  const my = ++gradesSeq
  loading.value = true
  cardsError.value = ''
  try {
    const rows = await getGradeCards(
      {
        examType: fExamType.value || undefined,
        examDate: fExamDate.value || undefined
      },
      // 失败已由页内 ListError 呈现，不再重复弹全局提示
      { silent: true }
    )
    if (my === gradesSeq) {
      cards.value = rows
      writeQuery()
    }
  } catch (e) {
    if (my === gradesSeq) {
      cards.value = []
      cardsError.value = (e as Error)?.message || t('gradeInput.loadError')
    }
  } finally {
    if (my === gradesSeq) loading.value = false
  }
}

const loadStudentGrades = async (studentId: number) => {
  drawerLoading.value = true
  try {
    currentGrades.value = await getGrades({
      studentId,
      examType: fExamType.value || undefined,
      examDate: fExamDate.value || undefined
    })
  } finally {
    drawerLoading.value = false
  }
}

const onNameInput = () => {
  // 姓名仅过滤卡片，无需重新请求；地址栏做 250ms 防抖同步
  window.clearTimeout(nameTimer)
  nameTimer = window.setTimeout(writeQuery, 250)
}

// 前进/后退或外部带参跳进来时重新读取
watch(
  () => route.query,
  (q) => {
    if (stableQuery(q) === lastSyncedQuery) return
    readQuery()
    reloadGrades()
  }
)

const reset = () => {
  fName.value = ''
  fExamType.value = ''
  fExamDate.value = ''
  reloadGrades()
}

const openDrawer = async (c: any) => {
  currentStudent.value = c
  drawerVisible.value = true
  try {
    await loadStudentGrades(c.id)
  } catch {
    // 错误提示已由 request.ts 全局拦截器统一弹出
  }
}

// 新增 / 编辑
const dialogVisible = ref(false)
const form = reactive<any>({ examType: '', subject: '数学', fullScore: 100 })

const openDialog = (row?: any, student?: any) => {
  Object.keys(form).forEach((k) => delete form[k])
  if (row && row.id) {
    Object.assign(form, {
      id: row.id,
      studentId: row.studentId,
      subject: row.subject,
      examType: row.examType,
      examDate: row.examDate,
      score: row.score,
      fullScore: row.fullScore,
      comment: row.comment
    })
  } else if (student) {
    form.examType = defaultTypeKey()
    form.subject = '数学'
    form.fullScore = 100
    form.score = undefined
    form.examDate = ''
    form.studentId = student.id
  } else {
    form.examType = defaultTypeKey()
    form.subject = '数学'
    form.fullScore = 100
    form.score = undefined
    form.examDate = ''
  }
  dialogVisible.value = true
}

const save = async () => {
  if (saving.value) return
  if (!form.studentId) return ElMessage.warning(t('gradeInput.msg.selectStudent'))
  if (!form.examType) return ElMessage.warning(t('gradeInput.msg.selectType'))
  if (form.score == null || form.score === '')
    return ElMessage.warning(t('gradeInput.msg.enterScore'))
  if (!form.examDate) return ElMessage.warning(t('gradeInput.msg.selectExamDate'))
  if (form.score < 0 || form.score > form.fullScore)
    return ElMessage.warning(t('gradeInput.msg.scoreRange'))

  const payload = { ...form }
  saving.value = true
  try {
    if (form.id) {
      await updateGrade(form.id, payload)
      ElMessage.success(t('common.updateSuccess'))
    } else {
      await createGrade(payload)
      ElMessage.success(t('common.saveSuccess'))
    }
    dialogVisible.value = false
    await reloadGrades()
    if (drawerVisible.value && form.studentId) {
      await loadStudentGrades(form.studentId)
    }
  } catch (err) {
    // 错误提示已由 request.ts 全局弹出
    console.error('保存失败', err)
  } finally {
    saving.value = false
  }
}

// 批量录入
const batchVisible = ref(false)
const batchForm = reactive<any>({ examType: '', subject: '数学', fullScore: 100, examDate: '' })
const batchStudentIds = ref<number[]>([])
const batchScores = reactive<Record<number, number | undefined>>({})

const selectedStudents = computed(() =>
  students.value.filter((s) => batchStudentIds.value.includes(s.id))
)

const openBatch = () => {
  batchForm.examType = defaultTypeKey()
  batchForm.subject = '数学'
  batchForm.fullScore = 100
  batchForm.examDate = ''
  batchStudentIds.value = []
  Object.keys(batchScores).forEach((k) => delete batchScores[k])
  batchVisible.value = true
}

const submitBatch = async () => {
  if (batchSaving.value) return
  if (!batchForm.examDate) return ElMessage.warning(t('gradeInput.msg.selectExamDate'))
  if (!batchForm.examType) return ElMessage.warning(t('gradeInput.msg.selectType'))
  const rows = selectedStudents.value
    .map((s) => ({ studentId: s.id, score: batchScores[s.id] }))
    .filter((r) => r.score != null)
  if (!rows.length) return ElMessage.warning(t('gradeInput.msg.noScores'))
  // 有被选学生没填分数时先提示，避免静默跳过
  const missing = selectedStudents.value.length - rows.length
  if (missing > 0) {
    const okFlag = await confirmDialog(
      t('gradeInput.msg.missingScores', { n: missing }),
      t('gradeInput.msg.batchTips')
    )
    if (!okFlag) return
  }

  const payload = rows.map((r) => ({
    studentId: r.studentId,
    examType: batchForm.examType,
    subject: batchForm.subject,
    fullScore: batchForm.fullScore,
    examDate: batchForm.examDate,
    score: Number(r.score)
  }))
  batchSaving.value = true
  try {
    await importGrades(payload)
    ElMessage.success(t('gradeInput.msg.batchDone', { n: rows.length }))
    batchVisible.value = false
    await reloadGrades()
  } catch (err) {
    // 错误提示已由 request.ts 全局弹出
    console.error('批量录入失败', err)
  } finally {
    batchSaving.value = false
  }
}

/* ══════════════ 考试类型管理 ══════════════ */
const typesVisible = ref(false)
const newTypeName = ref('')
const typeSaving = ref(false)

const openTypes = () => {
  newTypeName.value = ''
  typesVisible.value = true
  void loadExamTypes()
}

const addType = async () => {
  const name = newTypeName.value.trim()
  if (!name || typeSaving.value) return
  typeSaving.value = true
  try {
    await createExamType(name)
    newTypeName.value = ''
    ElMessage.success(t('gradeInput.typeAdded'))
    await loadExamTypes()
  } catch {
    // 重名等错误已由 request.ts 提示
  } finally {
    typeSaving.value = false
  }
}

const renameType = async (et: ExamTypeItem) => {
  let name = ''
  try {
    const res = await ElMessageBox.prompt(
      t('gradeInput.renameTypePrompt'),
      t('gradeInput.renameType'),
      {
        inputValue: et.name,
        inputValidator: (v) => (v && v.trim() ? true : t('gradeInput.typeNameRequired')),
        confirmButtonText: t('common.save'),
        cancelButtonText: t('common.cancel')
      }
    )
    name = (res.value || '').trim()
  } catch {
    return
  }
  if (!name || name === et.name) return
  try {
    await renameExamType(et.key, name)
    ElMessage.success(t('gradeInput.saved'))
    await loadExamTypes()
  } catch {
    // 错误提示已由 request.ts 统一弹出
  }
}

const removeType = async (et: ExamTypeItem) => {
  try {
    await ElMessageBox.confirm(
      t('gradeInput.deleteTypeConfirm', { name: et.name, n: et.count }),
      t('common.tips'),
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
    await deleteExamType(et.key)
    ElMessage.success(t('gradeInput.typeDeleted'))
    if (fExamType.value === et.key) {
      fExamType.value = ''
      reloadGrades()
    }
    await loadExamTypes()
  } catch {
    // 「已有 N 条成绩在用」由后端说出具体数字
  }
}

const remove = async (row: any) => {
  try {
    await ElMessageBox.confirm(
      t('gradeInput.msg.deleteConfirm', {
        name: row.student?.name,
        subject: row.subject,
        exam: typeName(row.examType),
        score: row.score
      }),
      t('common.tips'),
      { type: 'warning' }
    )
  } catch {
    return // 用户取消
  }
  try {
    await deleteGrade(row.id)
    ElMessage.success(t('common.deleteSuccess'))
    await reloadGrades()
    if (drawerVisible.value && currentStudent.value) {
      await loadStudentGrades(currentStudent.value.id)
    }
  } catch (err) {
    // 错误提示已由 request.ts 全局弹出
    console.error('删除失败', err)
  }
}

onMounted(() => {
  loadStudents()
  loadExamTypes()
  reloadGrades()
  // 首页快捷入口：action=new 开新增成绩；action=batch 开批量录入
  handleQuickAction(route, router, { new: () => openDialog(), batch: openBatch })
})

onBeforeUnmount(() => window.clearTimeout(nameTimer))
</script>

<style scoped>
/* 页头：左侧人数/提示，右侧动作 */
.grade-input {
  display: block;
}
.page-head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.page-head__main {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}
.page-count {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 700;
  color: var(--ink);
}
.page-tip {
  font-size: 12.5px;
  color: var(--ink-soft);
}
.page-head__actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}

/* 筛选面板：一块浅底，与下方白卡区分 */
.filter-panel {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 10px 12px;
  margin-bottom: 16px;
  border: 1px solid var(--hair);
  border-radius: var(--radius);
  background: var(--surface-muted);
}
.filter-search {
  width: 190px;
}
.filter-type {
  width: 140px;
}
.filter-date {
  width: 170px;
}
.filter-spacer {
  flex: 1;
}

/* 学生卡片网格 */
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
  min-height: 120px;
}
.stu-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--card-edge);
  border-radius: var(--card-radius);
  background: var(--surface);
  cursor: pointer;
  transition:
    border-color var(--dur-hover) var(--ease),
    box-shadow var(--dur-hover) var(--ease);
}
.stu-card:hover {
  border-color: var(--card-edge-strong);
  box-shadow: var(--card-shadow);
}
.stu-card:focus-visible {
  outline: 2px solid var(--moss-ring);
  outline-offset: 2px;
}
.stu-card--empty {
  border-style: dashed;
  background: var(--surface-muted);
}
.stu-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.stu-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--ink);
}
.stu-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}
.stu-grade {
  padding: 1px 7px;
  border-radius: var(--radius-xs);
  background: var(--moss-soft);
  color: var(--ink-regular);
  font-size: 11.5px;
}
.stu-count {
  color: var(--ink-soft);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}
.stu-latest {
  display: flex;
  align-items: center;
  gap: 8px;
}
.stu-date {
  color: var(--ink-soft);
  font-size: 12px;
}
.stu-score {
  display: flex;
  align-items: baseline;
  gap: 2px;
}
.stu-score__num {
  color: var(--ink);
  font-size: 28px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.stu-score__full {
  margin-left: 4px;
  color: var(--ink-soft);
  font-size: 12px;
}
.stu-score__pct {
  margin-left: auto;
  font-size: 12.5px;
  font-weight: 600;
}
.stu-bar {
  height: 4px;
  border-radius: 999px;
  background: var(--hair);
  overflow: hidden;
}
.stu-bar i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--ink-soft);
}
.stu-bar.pct--good i {
  background: var(--success);
}
.stu-bar.pct--mid i {
  background: var(--warning);
}
.stu-bar.pct--bad i {
  background: var(--danger);
}
.stu-empty {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  min-height: 52px;
  color: var(--ink-soft);
  font-size: 13px;
}
.stu-empty__cta {
  color: var(--ink-regular);
  font-size: 12px;
}
.stu-card__foot {
  margin-top: auto;
  color: var(--ink-soft);
  font-size: 12px;
}
.stu-card:hover .stu-card__foot {
  color: var(--ink);
}

/* 类型管理 */
.type-add {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.type-list {
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 300px;
  overflow-y: auto;
}
.type-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 2px;
  border-bottom: 1px solid var(--hair);
}
.type-row:last-child {
  border-bottom: 0;
}
.type-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
.type-count {
  color: var(--ink-soft);
  font-size: 12px;
}
.type-hint {
  margin: 10px 0 0;
  color: var(--ink-soft);
  font-size: 12px;
}

/* 抽屉内 */
.drawer-filter {
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--ink-soft);
}
.drawer-actions {
  margin-bottom: 12px;
}
.row-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  white-space: nowrap;
}
.row-actions .el-button + .el-button {
  margin-left: 0;
}
.grade-table :deep(.el-table__cell) {
  vertical-align: middle;
}

.score {
  font-weight: 600;
  color: var(--ink);
}
.score-full {
  color: var(--ink-soft);
  font-size: 12px;
}
.pct {
  font-weight: 600;
}
.pct--good {
  color: var(--olive);
}
.pct--mid {
  color: var(--ochre);
}
.pct--bad {
  color: var(--el-color-danger);
}
.inline-tip {
  margin: 0 8px;
  color: var(--ink-soft);
  font-size: 13px;
}
.batch-session {
  display: flex;
  flex-wrap: wrap;
  gap: 0 16px;
}
.batch-empty {
  padding: 24px 0;
  text-align: center;
  color: var(--ink-soft);
  font-size: 13px;
}
</style>
