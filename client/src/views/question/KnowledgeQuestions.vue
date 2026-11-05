<template>
  <el-card>
    <!-- 第一行：返回 + 题库名 + 题量 -->
    <div class="toolbar">
      <el-button link type="primary" :icon="ArrowLeft" @click="goBack">{{
        t('knowledgeQuestions.back')
      }}</el-button>
      <span class="title">{{ tagLabel }}</span>
      <el-tooltip
        v-if="tag !== '__empty__'"
        :content="t('knowledgeQuestions.rename')"
        placement="top"
        :show-after="400"
      >
        <el-icon
          class="toolbar-rename"
          role="button"
          tabindex="0"
          :aria-label="t('knowledgeQuestions.rename')"
          @click="renameCurrentTag"
          @keydown.enter="renameCurrentTag"
          @keydown.space.prevent="renameCurrentTag"
          ><EditPen
        /></el-icon>
      </el-tooltip>
      <span class="count">{{ t('knowledgeQuestions.count', { n: total }) }}</span>
    </div>

    <!-- 第二行：只有筛选；导出选项收进导出对话框，不再和筛选挤一行 -->
    <div class="filters">
      <el-radio-group v-model="type" @change="search">
        <el-radio-button value="all">{{ t('knowledgeQuestions.all') }}</el-radio-button>
        <el-radio-button value="choice">{{ t('knowledgeQuestions.typeChoice') }}</el-radio-button>
        <el-radio-button value="fill">{{ t('knowledgeQuestions.typeFill') }}</el-radio-button>
        <el-radio-button value="solve">{{ t('knowledgeQuestions.typeSolve') }}</el-radio-button>
      </el-radio-group>
      <el-select
        v-model="difficulty"
        :placeholder="t('knowledgeQuestions.difficultyPlaceholder')"
        clearable
        style="width: 130px"
        @change="search"
      >
        <el-option
          v-for="n in 5"
          :key="n"
          :label="t('knowledgeQuestions.stars', { n })"
          :value="n"
        />
      </el-select>
      <!-- 排序：作用在整个筛选结果上（后端排序），不是只排当前这一页 -->
      <el-select v-model="sort" style="width: 210px" @change="search">
        <el-option v-for="o in sortOptions" :key="o.value" :label="o.label" :value="o.value" />
      </el-select>
      <div class="filters__actions">
        <el-button type="primary" :icon="Download" @click="exportVisible = true">{{
          t('knowledgeQuestions.exportPdf')
        }}</el-button>
      </div>
    </div>

    <div class="klayout">
      <!-- 左栏：二级知识点列表。名称左对齐、题量右对齐；可点击筛选、拖放归类 -->
      <aside class="kside" :class="{ dragging: dragId !== null }">
        <div class="kside__head">
          <span>{{ t('knowledgeQuestions.subTagsTitle') }}</span>
          <span v-if="dragId !== null" class="kside__tip">{{
            t('knowledgeQuestions.dropHint')
          }}</span>
          <button
            v-else-if="subTag"
            type="button"
            class="kside__tip is-link"
            @click="selectSubTag('')"
          >
            {{ t('knowledgeQuestions.clearFilter') }}
          </button>
        </div>

        <ul class="ksubs">
          <li
            class="ksubs__item"
            :class="{ 'is-active': subTag === '' }"
            role="button"
            tabindex="0"
            @click="selectSubTag('')"
            @keydown.enter.prevent.self="selectSubTag('')"
            @keydown.space.prevent.self="selectSubTag('')"
          >
            <i class="ksubs__lv is-placeholder" />
            <span class="ksubs__name">{{ t('knowledgeQuestions.all') }}</span>
            <span class="ksubs__count">{{ allCount }}</span>
          </li>
          <li
            v-for="s in subTags"
            :key="s.name"
            class="ksubs__item"
            :class="{ 'is-active': subTag === s.name }"
            :title="t('knowledgeQuestions.filterHint', { name: s.name })"
            role="button"
            tabindex="0"
            @click="selectSubTag(s.name)"
            @keydown.enter.prevent.self="selectSubTag(s.name)"
            @keydown.space.prevent.self="selectSubTag(s.name)"
            @dragover.prevent
            @drop.prevent="onDropTo(s.name)"
          >
            <!-- 掌握等级：圆点颜色即等级，点圆点可直接改 -->
            <el-dropdown
              class="ksubs__lvdrop"
              trigger="click"
              placement="bottom-start"
              @click.stop
              @command="(lv: string) => onSetLevel(s, lv)"
            >
              <i
                class="ksubs__lv"
                :class="s.level ? `is-${s.level}` : 'is-none'"
                :style="levelDotStyle(s.level)"
                :title="t('knowledgeQuestions.levelHint', { level: levelLabel(s.level) })"
              />
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    v-for="lv in KNOWLEDGE_LEVELS"
                    :key="lv.value"
                    :command="lv.value"
                  >
                    <i class="lvdot" :style="{ background: lv.color }" />{{ levelLabel(lv.value) }}
                  </el-dropdown-item>
                  <el-dropdown-item divided command="__clear__">{{
                    t('knowledgeQuestions.clearLevel')
                  }}</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <span class="ksubs__name">{{ s.name }}</span>
            <span
              class="ksubs__count"
              :style="s.level ? { color: levelColor(s.level) } : undefined"
              >{{ s.total }}</span
            >
            <span
              class="ksubs__edit"
              role="button"
              tabindex="0"
              :aria-label="t('knowledgeQuestions.editSubAria', { name: s.name })"
              :title="t('knowledgeQuestions.editSubTitle')"
              @click.stop="openSubEdit(s)"
              @keydown.enter.stop="openSubEdit(s)"
              @keydown.space.prevent.stop="openSubEdit(s)"
            >
              <EditPen />
            </span>
          </li>
          <li
            class="ksubs__item is-dashed"
            :class="{ 'is-active': subTag === '__empty__' }"
            :title="t('knowledgeQuestions.uncategorizedFilter')"
            role="button"
            tabindex="0"
            @click="selectSubTag('__empty__')"
            @keydown.enter.prevent.self="selectSubTag('__empty__')"
            @keydown.space.prevent.self="selectSubTag('__empty__')"
            @dragover.prevent
            @drop.prevent="onDropTo(null)"
          >
            <i class="ksubs__lv is-placeholder" />
            <span class="ksubs__name">{{ t('knowledgeQuestions.uncategorized') }}</span>
            <span class="ksubs__count">{{ emptyCount }}</span>
          </li>
        </ul>

        <p v-if="!subTags.length" class="kside__hint">
          {{ t('knowledgeQuestions.noSubTags') }}
        </p>
        <!-- 等级图例：一眼看懂圆点颜色 -->
        <div v-if="subTags.length" class="kside__legend">
          <span v-for="lv in KNOWLEDGE_LEVELS" :key="lv.value" class="kside__legend-item">
            <i class="lvdot" :style="{ background: lv.color }" />{{ levelLabel(lv.value) }}
          </span>
        </div>
      </aside>

      <!-- 右栏：题目卡片列表，题干完整、选项齐全 -->
      <div v-loading="loading" class="kmain">
        <ListError :message="error" @retry="run" />
        <el-empty
          v-if="!error && !loading && !list.length"
          :description="t('knowledgeQuestions.empty')"
        />

        <div class="klist">
          <QuestionCard
            v-for="(q, idx) in list"
            :key="q.id"
            :question="q"
            :no="(page - 1) * pageSize + idx + 1"
            :show-tags="false"
            :used="usedIds?.has(q.id) ?? false"
            on-glass
            rateable
            @generated="(html: string) => (q.answer = html)"
            @rate="(v: number | null) => onRate(q, v)"
          >
            <template #handle>
              <span
                class="drag-handle"
                draggable="true"
                :title="
                  subTags.length
                    ? t('knowledgeQuestions.dragHint')
                    : t('knowledgeQuestions.dropdownHint')
                "
                @dragstart="onDragStart($event, q)"
                @dragend="onDragEnd"
              >
                <Rank />
              </span>
            </template>
            <template #tools>
              <el-select
                class="sub-pick"
                :model-value="q.knowledgeSubTag || ''"
                size="small"
                filterable
                allow-create
                default-first-option
                clearable
                :placeholder="t('knowledgeQuestions.uncategorized')"
                @change="(v: any) => onSubTagEdit(q, v)"
              >
                <el-option v-for="s in subTags" :key="s.name" :label="s.name" :value="s.name" />
              </el-select>
              <el-button size="small" :icon="FolderAdd" @click="openAddToHomework(q)">{{
                t('knowledgeQuestions.addToHomework')
              }}</el-button>
              <el-button size="small" :icon="Edit" @click="openEdit(q)">{{
                t('common.edit')
              }}</el-button>
              <el-button size="small" type="danger" :icon="Delete" @click="remove(q)">{{
                t('common.delete')
              }}</el-button>
            </template>
          </QuestionCard>
        </div>

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
      </div>
    </div>
  </el-card>

  <QuestionFormDialog v-model="editVisible" :question="editing" @saved="onEditedSaved" />

  <SubTagEditDialog
    v-model="subEditVisible"
    :sub-name="subEditTarget.name"
    :total="subEditTarget.total"
    :knowledge-tag="tag"
    :siblings="subTags"
    @saved="onSubTagSaved"
  />

  <QuestionExportDialog
    v-model="exportVisible"
    :scope="exportScope"
    :scope-label="exportLabel"
    :subtitle="exportSubtitle"
  />

  <AddToHomeworkDialog v-model="addVisible" :question="addTarget" />
</template>
<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  ArrowLeft,
  Download,
  Edit,
  Delete,
  Rank,
  EditPen,
  FolderAdd
} from '@element-plus/icons-vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getQuestions,
  getQuestionSubTags,
  setQuestionSubLevel,
  updateQuestion,
  deleteQuestion,
  renameQuestionTag,
  getQuestionUsedIds
} from '../../api/question'
import type { QuestionQuery } from '../../api/question'
import QuestionFormDialog from '../../components/QuestionFormDialog.vue'
import SubTagEditDialog from '../../components/SubTagEditDialog.vue'
import AddToHomeworkDialog from '../../components/AddToHomeworkDialog.vue'
import QuestionCard from '../../components/QuestionCard.vue'
import QuestionExportDialog from '../../components/QuestionExportDialog.vue'
import ListError from '../../components/ListError.vue'
import { useListQuery } from '../../composables/useListQuery'
import type { Question } from '../../types'
import { KNOWLEDGE_LEVELS, knowledgeLevelMeta } from '../../utils/knowledgeLevel'
import type { KnowledgeLevel } from '../../utils/knowledgeLevel'
import {
  DEFAULT_SORT,
  QUESTION_SORT_OPTIONS,
  questionSortParam,
  questionSortSubtitle
} from '../../utils/questionSort'

const route = useRoute()
const { t, te } = useI18n()
const router = useRouter()

// 知识点标识：路由参数；__empty__ 表示「未分类」
const tag = computed(() => String(route.params.tag || ''))
const tagLabel = computed(() => (tag.value === '__empty__' ? t('page.uncategorized') : tag.value))

const sortOptions = computed(() =>
  QUESTION_SORT_OPTIONS.map((o) => ({ ...o, label: t(`questionSort.${o.value}`) }))
)

// 「已做过」：被作业选过的题目 id 集合；null = 拉取失败，不显示标记
const usedIds = ref<Set<number> | null>(null)
const refreshUsedIds = async () => {
  try {
    usedIds.value = new Set(await getQuestionUsedIds())
  } catch {
    usedIds.value = null
  }
}
const type = ref('all')
const page = ref(1)
const pageSize = 20
const difficulty = ref<number>()
// 排序：'default' = 按 id 倒序（最新录入在前），与改动前行为一致
const sort = ref(DEFAULT_SORT)
const editVisible = ref(false)
const editing = ref<any>(null)

// —— 二级知识点筛选 ——
const subTag = ref('')
const subTags = ref<{ name: string; total: number; level?: KnowledgeLevel | null }[]>([])
// 未归类题量：subtags 接口只返回有值的二级，未分类要单独取一次
const emptyCount = ref(0)
// 「全部」= 各二级之和 + 未分类，正好覆盖该一级知识点下的所有题
const allCount = computed(() => subTags.value.reduce((n, s) => n + s.total, 0) + emptyCount.value)

// —— 导出 PDF（当前一级 + 当前二级筛选）——
const exportVisible = ref(false)
const exportScope = computed(() => {
  const p: QuestionQuery = { knowledgeTag: tag.value }
  if (subTag.value === '__empty__') p.knowledgeSubTag = '__empty__'
  else if (subTag.value) p.knowledgeSubTag = subTag.value
  // 带上排序，导出的试卷顺序与页面上看到的一致
  const s = questionSortParam(sort.value)
  if (s) p.sort = s
  return p
})
const exportLabel = computed(() => {
  if (!subTag.value) return tagLabel.value
  return `${tagLabel.value} › ${
    subTag.value === '__empty__' ? t('page.uncategorized') : subTag.value
  }`
})
// 试卷副标题：把当前排序印在卷首，方便核对与归档；默认排序时不写
const exportSubtitle = computed(() => questionSortSubtitle(sort.value))

// —— 加入已发布的作业（单题增量，不动作业里已有的题）——
const addVisible = ref(false)
const addTarget = ref<{ id: number; title?: string | null } | null>(null)

const openAddToHomework = (q: Question) => {
  addTarget.value = { id: q.id, title: q.title }
  addVisible.value = true
}

// —— 二级知识点编辑（重命名 / 合并 / 删除 / 换题库）——
const subEditVisible = ref(false)
const subEditTarget = ref<{ name: string; total: number }>({ name: '', total: 0 })

const openSubEdit = (s: { name: string; total: number }) => {
  subEditTarget.value = { name: s.name, total: s.total }
  subEditVisible.value = true
}

// 编辑完成后刷新列表与二级候选；若当前正在筛选的二级被改名/删除，跟随切换到新名称

// —— 二级知识点掌握等级（基础 / 中等 / 进阶）——
// 圆点颜色即等级，点圆点即可直接修改；没定级的显示空心圆点
const levelLabel = (lv?: string | null) =>
  lv && te(`knowledgeLevel.${lv}`) ? t(`knowledgeLevel.${lv}`) : t('knowledgeLevel.unset')
const levelColor = (lv?: string | null) => knowledgeLevelMeta(lv)?.color || 'transparent'
const levelDotStyle = (lv?: string | null) => {
  const meta = knowledgeLevelMeta(lv)
  return meta ? { background: meta.color, boxShadow: `0 0 0 3px ${meta.soft}` } : undefined
}

// 设置 / 取消等级：先本地变色（即时反馈），失败再回滚，避免整表刷新
const onSetLevel = async (item: { name: string; level?: KnowledgeLevel | null }, level: string) => {
  const next = level === '__clear__' ? null : (level as KnowledgeLevel)
  if ((item.level || null) === next) return
  const prev = item.level || null
  item.level = next
  try {
    await setQuestionSubLevel({ knowledgeTag: tag.value, name: item.name, level: next })
    ElMessage.success(
      next
        ? t('knowledgeQuestions.levelSet', { name: item.name, level: levelLabel(next) })
        : t('knowledgeQuestions.levelCleared', { name: item.name })
    )
  } catch {
    item.level = prev // 失败回滚；错误提示由 request.ts 统一弹出
  }
}

const onSubTagSaved = async (payload?: { name?: string }) => {
  const oldName = subEditTarget.value.name
  await Promise.all([loadSubTags(), run()])
  if (oldName && subTag.value === oldName) {
    const next = payload?.name
    subTag.value = next && subTags.value.some((s) => s.name === next) ? next : ''
    await run()
  }
}

// 加载当前一级知识点下的二级知识点（带题量）与未分类题量
const loadSubTags = async () => {
  try {
    subTags.value = await getQuestionSubTags(tag.value)
  } catch {
    subTags.value = []
  }
  try {
    const res = await getQuestions({
      knowledgeTag: tag.value,
      knowledgeSubTag: '__empty__',
      page: 1,
      pageSize: 1
    })
    emptyCount.value = res.total
  } catch {
    emptyCount.value = 0
  }
}

// 从路由 ?sub= 初始化二级筛选（仅在进入页面/切换一级时调用）
const applyRouteSub = () => {
  const initSub = route.query.sub ? String(route.query.sub) : ''
  subTag.value = initSub && subTags.value.some((s) => s.name === initSub) ? initSub : ''
}

// 点击芯片筛选（'' = 全部，'__empty__' = 未分类）
const selectSubTag = (name: string) => {
  subTag.value = name
  search()
}

// —— 归类操作：拖拽投放 / 行内下拉直接编辑 ——
const dragId = ref<number | null>(null)

const assignSubTag = async (questionId: number, subName: string | null) => {
  await updateQuestion(questionId, { knowledgeSubTag: subName })
  ElMessage.success(
    subName ? t('knowledgeQuestions.movedTo', { name: subName }) : t('knowledgeQuestions.movedBack')
  )
  await Promise.all([loadSubTags(), run()])
}

const onDragStart = (e: DragEvent, row: any) => {
  dragId.value = row.id
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(row.id))
  }
}

const onDragEnd = () => {
  dragId.value = null
}

// 拖到某个二级芯片上（null 表示拖到「未分类」，即清除归类）
const onDropTo = async (subName: string | null) => {
  const id = dragId.value
  dragId.value = null
  if (id == null) return
  try {
    await assignSubTag(id, subName)
  } catch {
    // 错误提示已由 request.ts 统一弹出
  }
}

// 行内下拉直接编辑（可选已有二级，或输入新名称创建）
const onSubTagEdit = async (row: any, value: any) => {
  const name = value != null && String(value).trim() ? String(value).trim() : null
  try {
    await assignSubTag(row.id, name)
  } catch {
    // 错误提示已由 request.ts 统一弹出
  }
}

// 取数骨架：loading / 错误态 / 防竞态 / 末页回退。
// immediate:false —— 首屏要等二级知识点候选与路由上的 subTag 就位再拉。
// 导出仍交给 QuestionExportDialog 统一处理（与列表取数无关）。
const { list, total, loading, error, run, backoffIfLastPageEmpty } = useListQuery<Question>(
  () => {
    const params: any = { knowledgeTag: tag.value, page: page.value, pageSize }
    if (type.value !== 'all') params.type = type.value
    if (difficulty.value != null) params.difficulty = difficulty.value
    const sortParam = questionSortParam(sort.value)
    if (sortParam) params.sort = sortParam
    if (subTag.value === '__empty__') params.knowledgeSubTag = '__empty__'
    else if (subTag.value) params.knowledgeSubTag = subTag.value
    return getQuestions(params, { silent: true })
  },
  { immediate: false }
)

const search = () => {
  page.value = 1
  run()
}

const goBack = () => router.push('/questions')

// 重命名当前题库（一级知识点），成功后跳转到新名称的页面
const renameCurrentTag = async () => {
  if (tag.value === '__empty__') return
  try {
    const { value } = await ElMessageBox.prompt(
      t('knowledgeQuestions.renamePrompt', { name: tagLabel.value, n: total.value }),
      t('knowledgeQuestions.renameTitle'),
      {
        inputValue: tag.value,
        inputPlaceholder: t('knowledgeQuestions.renamePlaceholder'),
        inputValidator: (v) => (v && v.trim() ? true : t('knowledgeQuestions.nameRequired')),
        confirmButtonText: t('knowledgeQuestions.confirm'),
        cancelButtonText: t('common.cancel')
      }
    )
    const to = value.trim()
    if (!to || to === tag.value) return
    await renameQuestionTag(tag.value, to)
    ElMessage.success(t('knowledgeQuestions.renamed', { name: to }))
    router.replace(`/questions/knowledge/${encodeURIComponent(to)}`)
  } catch (e: any) {
    if (e === 'cancel' || e === 'close') return
    // 其它错误已由 request.ts 统一提示
  }
}

const openEdit = (row: any) => {
  editing.value = row
  editVisible.value = true
}

// 编辑保存后：刷新列表 + 二级知识点计数（题目可能改了知识点归属）
const onEditedSaved = async () => {
  await Promise.all([run(), loadSubTags()])
}

// 难度就地标注：先改本地让点击立刻有反馈，失败再退回原值
const onRate = async (row: any, value: number | null) => {
  const prev = row.difficulty ?? null
  row.difficulty = value
  try {
    await updateQuestion(row.id, { difficulty: value })
  } catch {
    row.difficulty = prev
    ElMessage.error(t('questionBrowse.difficultySaveError'))
  }
}

const remove = async (row: any) => {
  try {
    await ElMessageBox.confirm(t('knowledgeQuestions.deleteConfirm'), t('common.tips'), {
      type: 'warning'
    })
  } catch {
    return // 用户取消
  }
  try {
    await deleteQuestion(row.id)
    ElMessage.success(t('common.deleteSuccess'))
    // 删除末页最后一条时回退页码，避免停留在空白页
    backoffIfLastPageEmpty(page)
    // 同步刷新列表与顶部二级知识点题量计数
    await Promise.all([run(), loadSubTags()])
  } catch (err) {
    // 错误提示已由 request.ts 全局弹出
    console.error('删除失败', err)
  }
}

onMounted(() => window.addEventListener('question-used-changed', refreshUsedIds))
onBeforeUnmount(() => window.removeEventListener('question-used-changed', refreshUsedIds))

onMounted(async () => {
  // 「已做过」标记：失败静默（usedIds 保持 null，页面照常）
  getQuestionUsedIds()
    .then((ids) => (usedIds.value = new Set(ids)))
    .catch(() => (usedIds.value = null))
  await loadSubTags()
  applyRouteSub()
  run()
})

// 在题库页切换一级知识点时（同路由实例复用）刷新数据与二级候选
watch(
  () => route.params.tag,
  async () => {
    subTag.value = ''
    await loadSubTags()
    applyRouteSub()
    run()
  }
)
</script>

<style scoped>
.toolbar {
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.title {
  font-family: var(--font-display);
  font-size: 19px;
  font-weight: 700;
  color: var(--ink);
  letter-spacing: 0.04em;
}
.count {
  color: var(--ink-soft);
  font-size: 13px;
}
.toolbar-rename {
  cursor: pointer;
  color: var(--ink-soft);
  font-size: 16px;
  padding: 4px;
  border-radius: var(--radius-xs);
  transition:
    color var(--dur) var(--ease),
    background-color var(--dur) var(--ease);
}
.toolbar-rename:hover {
  color: var(--moss-deep);
  background: var(--moss-soft);
}

.filters {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  /* 这一行有题型、难度筛选、排序三个控件加导出按钮，窄屏让它换行而不是横向溢出 */
  flex-wrap: wrap;
  gap: 12px;
}
.filters__actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 14px;
}

/* —— 主体：左栏二级知识点 + 右栏题目卡片 —— */
.klayout {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}
.kside {
  flex-shrink: 0;
  width: 246px;
  /*
   * 侧栏钉住，不随题目列表上下滚。
   * 前提：祖先里不能有「非 visible 的 overflow」，否则那个祖先会成为最近的滚动容器，
   * sticky 就被钉死在一个从不滚动的盒子上（Element Plus 的 .el-card / .el-card__body
   * 正是这种情况，已在 theme.css 里放开）。top 给一点间距，贴着顶栏不好看。
   */
  position: sticky;
  top: 12px;
  max-height: calc(100vh - 160px);
  overflow-y: auto;
  padding: 12px 10px;
  border: 1px solid var(--edge);
  border-radius: var(--radius);
  background-color: var(--surface);
  box-shadow: var(--shadow-soft);
}
.kside__head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px 8px;
  margin-bottom: 6px;
  border-bottom: 1px solid var(--hair);
  font-size: 12px;
  letter-spacing: 0.14em;
  color: var(--ink-soft);
}
.kside__tip {
  margin-left: auto;
  font-size: 11px;
  letter-spacing: 0;
  color: var(--moss-deep);
}
.kside__tip.is-link {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: 11px;
  letter-spacing: 0;
  color: var(--moss-deep);
  cursor: pointer;
}
.kside__tip.is-link:hover {
  text-decoration: underline;
  text-underline-offset: 2px;
}
.kside__tip.is-link:focus-visible {
  outline: 2px solid var(--moss-ring);
  outline-offset: 2px;
  border-radius: var(--radius-xs);
}
.kside__hint {
  margin: 10px 8px 2px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--ink-soft);
}

/* 二级知识点列表：名称左对齐成一列、题量右对齐成一列 */
.ksubs {
  list-style: none;
  margin: 0;
  padding: 0;
}
.ksubs__item {
  display: flex;
  align-items: center;
  /*
   * 这里刻意不用 gap：编辑图标即使宽度为 0，gap 依然占位，
   * 会让「有编辑图标的行」比「没有的」（全部 / 未分类）多出一个间距，题量列就对不齐了。
   * 名称的右间距改用 margin 表达。
   */
  gap: 0;
  padding: 6px 8px;
  border-radius: var(--radius);
  cursor: pointer;
  transition: background-color var(--dur) var(--ease);
}
.ksubs__item:hover {
  background: var(--surface);
}
.ksubs__item:focus-visible {
  outline: 2px solid var(--moss-ring);
  outline-offset: -2px;
}
.ksubs__item.is-active {
  background: var(--moss-soft);
}
.ksubs__name {
  flex: 1;
  min-width: 0;
  margin-right: 8px;
  font-size: 13px;
  color: var(--ink-regular);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ksubs__item.is-active .ksubs__name {
  color: var(--ink);
  font-weight: 600;
}
.ksubs__count {
  flex-shrink: 0;
  font-family: var(--font-data);
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  color: var(--ink-soft);
}
.ksubs__item.is-active .ksubs__count {
  color: var(--moss-deep);
}
/* 「未分类」用一条细线隔开，与真实二级知识点区分 */
.ksubs__item.is-dashed {
  margin-top: 6px;
  border-top: 1px solid var(--hair);
  border-radius: 0 0 var(--radius) var(--radius);
}
/* 编辑入口：宽度常驻、只切透明度——宽度 0→15 会把名称列挤窄，省略号跟着跳 */
.ksubs__edit {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  width: 15px;
  overflow: hidden;
  opacity: 0;
  font-size: 12px;
  cursor: pointer;
  transition: opacity var(--dur) var(--ease);
}
.ksubs__item:hover .ksubs__edit,
.ksubs__item:focus-within .ksubs__edit {
  opacity: 0.75;
}
/* 触屏没有 hover：编辑入口常驻弱可见，否则手机上无法编辑二级知识点 */
@media (hover: none) {
  .ksubs__edit {
    opacity: 0.45;
  }
}
.ksubs__edit:hover {
  opacity: 1;
}
/* 拖拽中：左侧每一项都是可投放目标 */
.kside.dragging .ksubs__item {
  outline: 1px dashed var(--moss);
  outline-offset: -2px;
}
.kside.dragging .ksubs__item:hover {
  background: var(--moss);
  outline-style: solid;
}
.kside.dragging .ksubs__item:hover .ksubs__name,
.kside.dragging .ksubs__item:hover .ksubs__count {
  color: var(--on-accent);
}

.kmain {
  flex: 1;
  min-width: 0;
}
.klist {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 200px;
}

/* 卡片头上的拖拽手柄 */
.drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: grab;
  color: var(--ink-soft);
  font-size: 16px;
  padding: 2px 4px;
  border-radius: var(--radius-xs);
  transition:
    color var(--dur) var(--ease),
    background-color var(--dur) var(--ease);
}
.drag-handle:hover {
  color: var(--moss-deep);
  background: var(--moss-soft);
}
.drag-handle:active {
  cursor: grabbing;
}
.sub-pick {
  width: 152px;
}
.pager {
  margin-top: 16px;
  display: flex;
  justify-content: center;
}

@media (max-width: 1000px) {
  .klayout {
    flex-direction: column;
  }
  .kside {
    width: 100%;
    position: static;
    max-height: none;
  }
  /* 窄屏排成两列，省一半高度 */
  .ksubs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px 8px;
  }
}
@media (max-width: 720px) {
  .sub-pick {
    width: 120px;
  }
}
/* —— 二级知识点掌握等级：圆点 + 图例 —— */
.ksubs__lvdrop {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}
.ksubs__lv {
  width: 7px;
  height: 7px;
  margin-right: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  cursor: pointer;
  transition: transform var(--dur) var(--ease);
}
.ksubs__lv:hover {
  transform: scale(1.35);
}
.ksubs__lv.is-none {
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--line-strong);
}
.ksubs__lv.is-placeholder {
  visibility: hidden;
  cursor: default;
}
.lvdot {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 6px;
  border-radius: 50%;
  vertical-align: middle;
}
.kside__legend {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin: 10px 8px 2px;
  padding-top: 8px;
  border-top: 1px dashed var(--hair);
  font-size: 11px;
  color: var(--ink-soft);
}
.kside__legend-item {
  display: inline-flex;
  align-items: center;
}
</style>
