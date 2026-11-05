<template>
  <!-- 抽题框 -->
  <el-drawer v-model="visible" :title="t('homeworkPick.title')" size="84%">
    <div class="picker-toolbar">
      <el-input
        v-model="qKeyword"
        :placeholder="t('homeworkPick.searchPlaceholder')"
        clearable
        style="width: 220px"
        @keyup.enter="qSearch"
      />
      <el-select
        v-model="qType"
        :placeholder="t('homeworkPick.typePlaceholder')"
        clearable
        style="width: 130px"
        @change="qSearch"
      >
        <el-option :label="t('questionType.choice')" value="choice" />
        <el-option :label="t('questionType.fill')" value="fill" />
        <el-option :label="t('questionType.solve')" value="solve" />
      </el-select>
      <el-select
        v-model="qKnowledgeTag"
        :placeholder="t('homeworkPick.tagPlaceholder')"
        clearable
        filterable
        style="width: 140px"
        @change="onPrimaryKnowledgeChange"
      >
        <el-option v-for="t in qKnowledgeOptions" :key="t" :label="t" :value="t" />
      </el-select>
      <el-select
        v-model="qKnowledgeSubTag"
        :placeholder="t('homeworkPick.subTagPlaceholder')"
        clearable
        filterable
        style="width: 140px"
        :disabled="!qKnowledgeTag"
        @change="qSearch"
      >
        <!-- 输入框前缀：显示所选二级知识点的等级圆点 -->
        <template #prefix>
          <i
            v-if="qKnowledgeSubTag"
            class="lvdot"
            :class="{ 'is-none': !qCurrentSubLevel }"
            :style="qCurrentSubLevel ? { background: lvColor(qCurrentSubLevel) } : undefined"
          />
        </template>
        <el-option v-for="t in qSubKnowledgeOptions" :key="t.name" :label="t.name" :value="t.name">
          <span class="lv-opt">
            <i
              class="lvdot"
              :class="{ 'is-none': !t.level }"
              :style="t.level ? { background: lvColor(t.level) } : undefined"
            />
            {{ t.name }}
          </span>
        </el-option>
      </el-select>
      <el-button type="primary" @click="qSearch">{{ t('common.search') }}</el-button>
      <el-checkbox v-model="pickerFull">{{ t('homeworkPick.fullQuestion') }}</el-checkbox>
      <span class="picker-hint">{{ t('homeworkPick.hint') }}</span>
      <span class="picked-count">{{ t('homeworkPick.selected', { n: pickedIds.length }) }}</span>
      <el-button v-if="pickedIds.length" size="small" @click="clearPicked">{{
        t('homeworkPick.clearPicked')
      }}</el-button>
    </div>

    <el-table
      :data="questions"
      border
      stripe
      v-loading="qLoading"
      @row-click="onRowClick"
      :row-class-name="rowClassName"
    >
      <el-table-column :label="t('homeworkPick.selectColumn')" width="70">
        <template #default="{ row }">
          <el-checkbox
            v-if="pickMode === 'multi'"
            class="pick-check"
            :model-value="isPicked(row.id)"
            @click.stop
            @change="(v: boolean) => togglePick(row.id, v)"
          />
          <el-radio
            v-else
            class="pick-check"
            :model-value="pickedIds[0]"
            :value="row.id"
            @click.stop
            @change="() => pickSingle(row.id)"
          />
        </template>
      </el-table-column>
      <el-table-column :label="t('homeworkPick.questionColumn')" min-width="360">
        <template #default="{ row }">
          <div class="q-cell" :class="{ 'is-compact': !pickerFull }" @click="onQuestionCellClick">
            <RichContent class="q-cell-preview" :html="row.title || ''" />
            <template v-if="pickerFull">
              <div v-if="optionTexts(row).length" class="q-cell-options">
                <div v-for="(opt, oi) in optionTexts(row)" :key="oi" class="q-cell-option">
                  {{ String.fromCharCode(65 + oi) }}. {{ opt }}
                </div>
              </div>
              <RichContent v-if="row.body" class="q-cell-body" :html="row.body" />
            </template>
          </div>
        </template>
      </el-table-column>
      <el-table-column :label="t('homeworkPick.typeColumn')" width="90">
        <template #default="{ row }">{{ typeLabel(row.type) }}</template>
      </el-table-column>
      <el-table-column prop="difficulty" :label="t('homeworkPick.difficultyColumn')" width="70" />
      <el-table-column :label="t('homeworkPick.tagColumn')" width="170">
        <template #default="{ row }">
          {{ row.knowledgeTag || '—' }}{{ row.knowledgeSubTag ? ' › ' + row.knowledgeSubTag : '' }}
        </template>
      </el-table-column>
      <el-table-column :label="t('homeworkPick.actionsColumn')" width="100">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click.stop="showDetail(row)">{{
            t('homeworkPick.viewDetail')
          }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div v-if="qTotal > qPageSize" class="pager">
      <el-pagination
        v-model:current-page="qPage"
        :page-size="qPageSize"
        :total="qTotal"
        layout="prev, pager, next, total"
        background
        @current-change="loadQuestions"
      />
    </div>

    <template #footer>
      <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" @click="confirmPick">{{
        t('knowledgeQuestions.confirm')
      }}</el-button>
    </template>
  </el-drawer>

  <!-- 题目详情 -->
  <el-dialog v-model="qDetailVisible" :title="t('homeworkPick.detailTitle')" width="640px">
    <template v-if="currentQuestion">
      <div class="q-title"><RichContent :html="currentQuestion.title" /></div>
      <el-descriptions :column="3" border class="q-meta">
        <el-descriptions-item :label="t('homeworkPick.typeColumn')">{{
          typeLabel(currentQuestion.type)
        }}</el-descriptions-item>
        <el-descriptions-item :label="t('homeworkPick.difficultyLabel')">{{
          currentQuestion.difficulty
        }}</el-descriptions-item>
        <el-descriptions-item :label="t('homeworkPick.tagColumn')"
          >{{ currentQuestion.knowledgeTag || '—'
          }}{{
            currentQuestion.knowledgeSubTag ? ' › ' + currentQuestion.knowledgeSubTag : ''
          }}</el-descriptions-item
        >
      </el-descriptions>
      <div v-if="currentQuestion.options" class="q-section">
        <div class="q-label">{{ t('homeworkPick.options') }}</div>
        <template v-if="Array.isArray(currentQuestion.options)">
          <div v-for="(opt, i) in currentQuestion.options" :key="i" class="q-option">
            {{ String.fromCharCode(65 + i) }}.
            {{ typeof opt === 'string' ? opt : (opt && typeof opt === 'object' && 'text' in opt ? opt.text : JSON.stringify(opt)) }}
          </div>
        </template>
        <div v-else>{{ JSON.stringify(currentQuestion.options) }}</div>
      </div>
      <div v-if="currentQuestion.body" class="q-section">
        <div class="q-label">{{ t('homeworkPick.notes') }}</div>
        <RichContent :html="currentQuestion.body" />
      </div>
      <div v-if="currentQuestion.answer" class="q-section">
        <div class="q-label">{{ t('homeworkPick.answer') }}</div>
        <RichContent :html="currentQuestion.answer" />
      </div>
      <div v-if="currentQuestion.analysis" class="q-section">
        <div class="q-label">{{ t('homeworkPick.analysis') }}</div>
        <div class="q-text">{{ currentQuestion.analysis }}</div>
      </div>
    </template>
    <template #footer>
      <el-button type="primary" @click="qDetailVisible = false">{{
        t('homeworkPick.close')
      }}</el-button>
    </template>
  </el-dialog>

  <!-- 题目图片放大预览 -->
  <el-dialog
    v-model="imgPreviewVisible"
    :title="t('questionCard.previewTitle')"
    width="70%"
    top="6vh"
  >
    <div class="img-preview">
      <img :src="imgPreviewUrl" :alt="t('questionCard.imageAlt')" />
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { getQuestions, getQuestionTags, getQuestionSubTags } from '../../api/question'
import type { QuestionSubTag } from '../../api/question'
import { knowledgeLevelMeta, KNOWLEDGE_LEVEL_UNSET_COLOR } from '../../utils/knowledgeLevel'
import { questionOptionTexts as optionTexts } from '../../utils/format'
import RichContent from '../RichContent.vue'

const { t, te } = useI18n()

const typeLabel = (type: string) =>
  te(`questionType.${type}`) ? t(`questionType.${type}`) : type || ''

const props = defineProps<{
  modelValue: boolean
  /** 表单当前的选题模式：multi | single */
  mode: string
  /** 打开时回填的已选题目（来自表单） */
  initialIds: number[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: [ids: number[]]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v)
})
const pickMode = computed(() => props.mode)

const questions = ref<any[]>([])
const pickedIds = ref<number[]>([])
const qKeyword = ref('')
const qType = ref('')
const qKnowledgeTag = ref('')
const qKnowledgeOptions = ref<string[]>([])
const qKnowledgeSubTag = ref('')
const qSubKnowledgeOptions = ref<QuestionSubTag[]>([])
// 二级知识点下拉里显示等级圆点（颜色 = 基础/中等/进阶，空心 = 未定级）
const lvColor = (level?: string | null) =>
  knowledgeLevelMeta(level)?.color || KNOWLEDGE_LEVEL_UNSET_COLOR
const qCurrentSubLevel = computed(
  () => qSubKnowledgeOptions.value.find((t) => t.name === qKnowledgeSubTag.value)?.level || null
)
const qLoading = ref(false)
const qPage = ref(1)
const qPageSize = 10
const qTotal = ref(0)
const pickerFull = ref(true) // 抽题列表默认完整显示题目；题库题量大时可关掉只看摘要
const qDetailVisible = ref(false)
const currentQuestion = ref<any>(null)
const imgPreviewVisible = ref(false)
const imgPreviewUrl = ref('')

// 新建/编辑作业时由表单调用：筛选条件跟着新表单重新开始
const resetFilters = () => {
  qKeyword.value = ''
  qType.value = ''
  qKnowledgeTag.value = ''
  qKnowledgeSubTag.value = ''
  qSubKnowledgeOptions.value = []
}

// 按当前一级知识点加载二级候选
const loadSubKnowledgeOptions = async () => {
  if (!qKnowledgeTag.value) {
    qSubKnowledgeOptions.value = []
    return
  }
  try {
    const subs = await getQuestionSubTags(qKnowledgeTag.value)
    qSubKnowledgeOptions.value = subs
  } catch {
    qSubKnowledgeOptions.value = []
  }
}

// 一级知识点变化：清空已选二级，刷新二级候选并重新查询
const onPrimaryKnowledgeChange = async () => {
  qKnowledgeSubTag.value = ''
  await loadSubKnowledgeOptions()
  qSearch()
}

// 加载题目列表（抽题框内搜索/筛选）
const loadQuestions = async () => {
  qLoading.value = true
  try {
    const params: any = {
      keyword: qKeyword.value,
      type: qType.value,
      page: qPage.value,
      pageSize: qPageSize
    }
    if (qKnowledgeTag.value) params.knowledgeTag = qKnowledgeTag.value
    if (qKnowledgeSubTag.value) params.knowledgeSubTag = qKnowledgeSubTag.value
    const res = await getQuestions(params)
    questions.value = res.list
    qTotal.value = res.total
  } finally {
    qLoading.value = false
  }
}

const qSearch = () => {
  qPage.value = 1
  loadQuestions()
}

// 打开时回填已选、刷新知识点选项，并拉取第一页
watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return
    pickedIds.value = [...(props.initialIds || [])]
    qPage.value = 1
    // 每次打开刷新知识点选项，题库新增知识点后可立即筛选
    qKnowledgeOptions.value = await getQuestionTags().catch(() => [])
    await loadSubKnowledgeOptions()
    await loadQuestions()
  }
)

const isPicked = (id: number) => pickedIds.value.includes(id)

const togglePick = (id: number, checked: boolean) => {
  if (checked) {
    if (!pickedIds.value.includes(id)) pickedIds.value.push(id)
  } else {
    pickedIds.value = pickedIds.value.filter((x) => x !== id)
  }
}

const pickSingle = (id: number) => {
  pickedIds.value = [id]
}

// 单选/多选：点击整行即可选中/取消（多选模式点行切换，单选模式点行即选中）
const onRowClick = (row: any) => {
  if (pickMode.value === 'single') pickSingle(row.id)
  else togglePick(row.id, !isPicked(row.id))
}

// 点击题干中的图片：放大预览，并阻止触发行选中/切换
const onQuestionCellClick = (e: MouseEvent) => {
  const target = e.target as HTMLElement
  if (target?.tagName !== 'IMG') return
  const src = target.getAttribute('src')
  if (!src) return
  e.stopPropagation()
  imgPreviewUrl.value = src
  imgPreviewVisible.value = true
}

// 已选行高亮
const rowClassName = ({ row }: { row: any }) => (isPicked(row.id) ? 'row-picked' : '')

// 清空已选
const clearPicked = () => {
  pickedIds.value = []
}

// 确认抽题
const confirmPick = () => {
  if (pickMode.value === 'single' && !pickedIds.value.length) {
    ElMessage.warning(t('homeworkPick.noSelection'))
    return
  }
  emit('confirm', [...pickedIds.value])
  visible.value = false
}

// 查看题目详情
const showDetail = (row: any) => {
  currentQuestion.value = row
  qDetailVisible.value = true
}

defineExpose({ resetFilters })
</script>

<style scoped>
/* 二级知识点等级圆点：颜色 = 基础/中等/进阶，空心 = 未定级 */
.lvdot {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  vertical-align: middle;
}
.lvdot.is-none {
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--line-strong);
}
.lv-opt {
  display: inline-flex;
  align-items: center;
}
.picked-count {
  color: var(--ink-soft);
  font-size: 13px;
}
/* 抽题列表题目预览：默认完整展示题干 + 选项 + 补充说明；关闭「完整题目」后只保留两行摘要 */
.q-cell-preview {
  font-size: 13px;
  line-height: 1.6;
}
.q-cell.is-compact .q-cell-preview {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.q-cell-preview :deep(img),
.q-cell-body :deep(img) {
  max-width: 100%;
  max-height: 320px;
  object-fit: contain;
  cursor: zoom-in;
}
.q-cell-preview :deep(.katex-display),
.q-cell-body :deep(.katex-display) {
  overflow-x: auto;
  overflow-y: hidden;
}
.q-cell-options {
  margin: 6px 0 0 4px;
}
.q-cell-option {
  line-height: 1.7;
  color: var(--ink);
}
.q-cell-body {
  margin-top: 6px;
  font-size: 13px;
}
.picker-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}
.picker-hint {
  color: var(--ink-soft);
  font-size: 12px;
}
/* 抽题表格：整行可点击 */
:deep(.el-table__body tr) {
  cursor: pointer;
}
/* 已选行高亮（含 hover 时保持） */
:deep(.el-table .row-picked),
:deep(.el-table .row-picked:hover > td.el-table__cell) {
  background: var(--moss-soft) !important;
}
/* 放大选择框，便于点击 */
.pick-check {
  transform: scale(1.35);
}
.pager {
  margin-top: 16px;
  display: flex;
  justify-content: center;
}
.q-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 12px;
  line-height: 1.5;
}
.q-meta {
  margin-bottom: 12px;
}
.q-section {
  margin-bottom: 12px;
}
.q-label {
  font-weight: 600;
  color: var(--ink);
  margin-bottom: 4px;
}
.q-text {
  white-space: pre-wrap;
  line-height: 1.6;
  color: var(--ink);
}
.q-option {
  line-height: 1.8;
  color: var(--ink);
}
.img-preview {
  display: flex;
  justify-content: center;
  align-items: center;
  max-height: 72vh;
  overflow: auto;
}
.img-preview img {
  max-width: 100%;
  max-height: 72vh;
  object-fit: contain;
}
</style>
