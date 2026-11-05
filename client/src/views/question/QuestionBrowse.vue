<template>
  <div class="browse">
    <!-- 筛选栏：拆成「检索」与「条件」两层。
         旧版把搜索框、5 个下拉、3 个按钮、计数全塞进一条 flex-wrap 里，
         结果是所有元素等权、随窗口宽度随机折行（1280 宽下按钮组会单独掉到
         第二行的左半边），左侧还留一大片空白。分层的收益不是「好看」，
         而是**让折行位置可预测**：搜索与操作永远在第一行，条件在第二行。 -->
    <el-card class="filter-card" shadow="never">
      <div class="fbar">
        <div class="fbar__main">
          <el-input
            v-model="keyword"
            class="fbar__search"
            :placeholder="t('questionBrowse.searchPlaceholder')"
            :aria-label="t('questionBrowse.searchAria')"
            clearable
            :prefix-icon="Search"
            @keyup.enter="search"
          />
          <el-button type="primary" :icon="Search" @click="search">{{
            t('common.search')
          }}</el-button>
          <el-button :icon="RefreshLeft" @click="reset">{{ t('common.reset') }}</el-button>
          <!-- 计数紧跟操作组：它是「刚才那次查询」的反馈，不是页面属性。
               用等宽数字并加粗，让它在余光里也能被扫到。 -->
          <span class="fbar__count"
            >{{ t('questionBrowse.countPrefix') }}<b>{{ total }}</b
            >{{ t('questionBrowse.countSuffix') }}</span
          >
          <el-button text :icon="Download" @click="exportVisible = true">{{
            t('questionBrowse.exportPdf')
          }}</el-button>
        </div>

        <div class="fbar__cond">
          <span class="fbar__cond-label">{{ t('questionBrowse.filterLabel') }}</span>
          <!-- 四项：单选/多选分开筛，否则「想找多选」只能翻整张选择题列表 -->
          <el-select
            v-model="typeKey"
            :placeholder="t('questionBrowse.allTypes')"
            clearable
            style="width: 140px"
          >
            <el-option :label="t('questionBrowse.typeSingle')" value="single" />
            <el-option :label="t('questionBrowse.typeMultiple')" value="multiple" />
            <el-option :label="t('questionBrowse.typeFill')" value="fill" />
            <el-option :label="t('questionBrowse.typeSolve')" value="solve" />
          </el-select>
          <el-select
            v-model="difficulty"
            :placeholder="t('questionBrowse.allDifficulty')"
            clearable
            style="width: 130px"
          >
            <el-option v-for="d in 5" :key="d" :label="'★'.repeat(d)" :value="d" />
          </el-select>
          <el-select
            v-model="knowledgeTag"
            :placeholder="t('questionBrowse.allTags')"
            clearable
            filterable
            style="width: 190px"
            @change="onPrimaryTagChange"
          >
            <el-option v-for="t in tags" :key="t" :label="t" :value="t" />
          </el-select>
          <el-select
            v-model="subTag"
            :placeholder="t('questionBrowse.allSubTags')"
            clearable
            filterable
            style="width: 170px"
            :disabled="!knowledgeTag"
          >
            <el-option v-for="t in subTagOptions" :key="t" :label="t" :value="t" />
          </el-select>
          <span class="fbar__spacer" aria-hidden="true"></span>
          <!-- 排序与其余筛选一致：改完点「查询」生效，不单独自动刷新 -->
          <el-select v-model="sort" style="width: 210px">
            <el-option v-for="o in sortOptions" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </div>
      </div>
    </el-card>

    <!-- 题目卡片列表 -->
    <div v-loading="loading" class="q-list">
      <ListError :message="error" @retry="run" />
      <el-empty
        v-if="!error && !loading && !list.length"
        :description="t('questionBrowse.empty')"
      />

      <QuestionCard
        v-for="(q, idx) in list"
        :key="q.id"
        :question="q"
        :no="(page - 1) * pageSize + idx + 1"
        :used="usedIds?.has(q.id) ?? false"
        rateable
        @generated="(html: string) => (q.answer = html)"
        @rate="(v: number | null) => onRate(q, v)"
      />
    </div>

    <!-- 分页 -->
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

    <!-- 导出当前筛选结果为 PDF -->
    <QuestionExportDialog
      v-model="exportVisible"
      :scope="exportScope"
      :scope-label="exportLabel"
      :subtitle="exportSubtitle"
      allow-group
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Search, RefreshLeft, Download } from '@element-plus/icons-vue'
import {
  getQuestions,
  getQuestionTags,
  getQuestionSubTags,
  getQuestionUsedIds
} from '../../api/question'
import { updateQuestion } from '../../api/question'
import type { QuestionQuery } from '../../api/question'
import QuestionCard from '../../components/QuestionCard.vue'
import QuestionExportDialog from '../../components/QuestionExportDialog.vue'
import ListError from '../../components/ListError.vue'
import { useListQuery } from '../../composables/useListQuery'
import type { Question } from '../../types'
import {
  DEFAULT_SORT,
  QUESTION_SORT_OPTIONS,
  questionSortParam,
  questionSortSubtitle
} from '../../utils/questionSort'

const sortOptions = computed(() =>
  QUESTION_SORT_OPTIONS.map((o) => ({ ...o, label: t(`questionSort.${o.value}`) }))
)

const typeFilterLabel = (key: string) => {
  switch (key) {
    case 'single':
      return t('questionBrowse.typeSingle')
    case 'multiple':
      return t('questionBrowse.typeMultiple')
    case 'fill':
      return t('questionBrowse.typeFill')
    case 'solve':
      return t('questionBrowse.typeSolve')
    default:
      return key
  }
}

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const tags = ref<string[]>([])
// 「已做过」：被作业选过的题目 id 集合。接口失败时置 null → 不显示任何标记，页面照常可用
const usedIds = ref<Set<number> | null>(null)
const refreshUsedIds = async () => {
  try {
    usedIds.value = new Set(await getQuestionUsedIds())
  } catch {
    usedIds.value = null
  }
}

// 难度就地标注：先改本地让点击立刻有反馈，失败再退回原值
const onRate = async (q: Question, value: number | null) => {
  const prev = q.difficulty ?? null
  q.difficulty = value
  try {
    await updateQuestion(q.id, { difficulty: value })
  } catch {
    q.difficulty = prev
    ElMessage.error(t('questionBrowse.difficultySaveError'))
  }
}

// 筛选条件
const keyword = ref('')
const type = ref('')
const choiceMode = ref<'' | 'single' | 'multiple'>('')

/**
 * 下拉用复合值：'' / single / multiple / fill / solve。
 * 底层仍是 type + choiceMode 两个字段（接口契约不变），
 * 只是把「多选」提到和单选同级，和录题表单保持一致。
 */
const typeKey = computed({
  get: () => {
    if (type.value !== 'choice') return type.value
    return choiceMode.value === 'multiple' ? 'multiple' : 'single'
  },
  set: (v: string) => {
    if (v === 'single' || v === 'multiple') {
      type.value = 'choice'
      choiceMode.value = v
    } else {
      type.value = v
      choiceMode.value = ''
    }
  }
})
const difficulty = ref<number | ''>('')
const knowledgeTag = ref('')
const subTag = ref('')
const subTagOptions = ref<string[]>([])
// 排序：'default' = 按 id 倒序（最新录入在前），与改动前行为一致
const sort = ref(DEFAULT_SORT)

// 一级知识点变化：清空二级并刷新二级候选
const loadSubTagOptions = async () => {
  subTagOptions.value = []
  if (!knowledgeTag.value) return
  try {
    const subs = await getQuestionSubTags(knowledgeTag.value)
    subTagOptions.value = subs.map((s) => s.name)
  } catch {
    subTagOptions.value = []
  }
}
const onPrimaryTagChange = async () => {
  subTag.value = ''
  await loadSubTagOptions()
  search()
}

// 分页
const page = ref(1)
const pageSize = 10

// 当前筛选条件：列表查询与 PDF 导出共用同一份，避免两处逻辑走样
const currentFilters = (): QuestionQuery => {
  const params: QuestionQuery = {}
  if (keyword.value) params.keyword = keyword.value
  if (type.value) params.type = type.value
  // choiceMode 单独传：服务端会把 single 同时匹配到「未区分」的存量题
  if (choiceMode.value) params.choiceMode = choiceMode.value
  if (difficulty.value) params.difficulty = Number(difficulty.value)
  if (knowledgeTag.value) params.knowledgeTag = knowledgeTag.value
  if (subTag.value) params.knowledgeSubTag = subTag.value
  const sortParam = questionSortParam(sort.value)
  if (sortParam) params.sort = sortParam
  return params
}

// 取数骨架：loading / 错误态 / 防竞态都在这里。
// immediate:false —— 首屏必须先 readQuery()（筛选在地址栏里）并等二级知识点选项就位，
// 否则会用默认条件先拉一次，白跑一趟。
const { list, total, loading, error, run } = useListQuery<Question>(
  () => getQuestions({ ...currentFilters(), page: page.value, pageSize }, { silent: true }),
  {
    onLoaded: () => {
      // 拉完再写地址栏：保证 URL 反映的是「已经生效的」筛选，而不是正在输入的中间态
      writeQuery()
    },
    immediate: false
  }
)

// —— 导出 PDF（当前筛选结果）——
const exportVisible = ref(false)
const exportScope = computed(() => currentFilters())
const exportLabel = computed(() => {
  const f = exportScope.value
  const parts: string[] = []
  if (f.knowledgeTag)
    parts.push(f.knowledgeSubTag ? `${f.knowledgeTag} › ${f.knowledgeSubTag}` : f.knowledgeTag)
  if (f.type) parts.push(typeFilterLabel(f.type))
  if (f.difficulty) parts.push(t('questionBrowse.filterDifficulty', { n: f.difficulty }))
  if (f.keyword) parts.push(t('questionBrowse.filterKeyword', { kw: f.keyword }))
  return parts.length ? parts.join(' · ') : t('questionBrowse.filterAll')
})
// 试卷副标题：把当前排序印在卷首；默认排序时不写
const exportSubtitle = computed(() => questionSortSubtitle(sort.value))

// 查询/重置时回到第一页
const search = () => {
  page.value = 1
  run()
}

const reset = () => {
  keyword.value = ''
  type.value = ''
  choiceMode.value = ''
  difficulty.value = ''
  knowledgeTag.value = ''
  subTag.value = ''
  subTagOptions.value = []
  sort.value = DEFAULT_SORT
  search()
}

const loadTags = async () => {
  tags.value = await getQuestionTags()
}

/* ══════════════ 地址栏同步 ══════════════
   筛选条件与页码写进 query，好处有三：
   - 能把「某知识点 + 某题型 + 某排序」的链接直接发给别人 / 存书签
   - 刷新和浏览器前进后退不会丢筛选状态
   - 用 replace 而非 push：逐项调筛选不必塞满历史记录 */
const readQuery = () => {
  const q = route.query
  keyword.value = q.keyword ? String(q.keyword) : ''
  type.value = q.type ? String(q.type) : ''
  choiceMode.value = q.cm === 'multiple' ? 'multiple' : q.cm === 'single' ? 'single' : ''
  difficulty.value = q.difficulty ? Number(q.difficulty) : ''
  knowledgeTag.value = q.tag ? String(q.tag) : ''
  subTag.value = q.sub ? String(q.sub) : ''
  sort.value = q.sort ? String(q.sort) : DEFAULT_SORT
  const p = Number(q.page)
  page.value = Number.isInteger(p) && p > 0 ? p : 1
}

// 键序无关的 query 指纹：vue-router 可能重排 query 的键，直接 JSON.stringify 比较会误判
const stableQuery = (o: Record<string, any>) =>
  Object.keys(o)
    .sort()
    .map((k) => `${k}=${o[k]}`)
    .join('&')
let lastSyncedQuery = ''

const writeQuery = () => {
  const query: Record<string, string> = {}
  if (keyword.value) query.keyword = keyword.value
  if (type.value) query.type = type.value
  if (choiceMode.value) query.cm = choiceMode.value
  if (difficulty.value) query.difficulty = String(difficulty.value)
  if (knowledgeTag.value) query.tag = knowledgeTag.value
  if (subTag.value) query.sub = subTag.value
  if (sort.value !== DEFAULT_SORT) query.sort = sort.value
  if (page.value > 1) query.page = String(page.value)
  // 记下「这次是我们自己写的」，避免 watcher 把它当成外部跳转再拉一遍（会来回死循环）
  lastSyncedQuery = stableQuery(query)
  router.replace({ path: route.path, query })
}

onMounted(async () => {
  readQuery()
  loadTags()
  refreshUsedIds()
  await loadSubTagOptions()
  await run()
})

// 前进/后退、或从别处带着 query 跳进来时，重新读取并拉取
watch(
  () => route.query,
  (q) => {
    if (stableQuery(q) === lastSyncedQuery) return
    readQuery()
    loadSubTagOptions().then(run)
  }
)

// 作业保存/修改后广播：立即刷新「已做过」标记（无需离开本页）
onMounted(() => window.addEventListener('question-used-changed', refreshUsedIds))
onBeforeUnmount(() => window.removeEventListener('question-used-changed', refreshUsedIds))
</script>

<style scoped>
.browse {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.filter-card :deep(.el-card__body) {
  padding: 16px 20px;
}

/* —— 筛选栏：两层结构 ——
   第 1 层「检索」= 搜索 + 操作 + 结果计数，第 2 层「条件」= 5 个下拉。
   两层的分界用一条细线而不是纯间距：一堆等权元素之间，间距读不出分组。 */
.fbar {
  display: flex;
  flex-direction: column;
}
.fbar__main {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.fbar__search {
  flex: 1 1 240px;
  max-width: 380px;
}
.fbar__count {
  margin-left: auto;
  color: var(--ink-soft);
  font-size: var(--text-sm);
  white-space: nowrap;
}
/* 计数里的数字用等宽 + 深色：它是这一行里唯一会变的量 */
.fbar__count b {
  margin: 0 2px;
  font-family: var(--font-data);
  font-size: var(--text-base);
  font-weight: 700;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}
.fbar__cond {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--card-hair);
}
.fbar__cond-label {
  padding-right: 2px;
  font-family: var(--font-data);
  font-size: 11px;
  letter-spacing: 0.1em;
  color: var(--ink-soft);
  user-select: none;
}
/* 排序回答的是「怎么排」而不是「筛什么」，用一条竖线把它和筛选条件分开，
   并把它推到右端 —— 它是最少改的一项，不该占着视线中心。 */
.fbar__spacer {
  width: 1px;
  height: 20px;
  margin: 0 4px 0 auto;
  background: var(--line);
}

/* 题目卡片的本体样式已抽到 components/QuestionCard.vue，这里只管列表间距 */
.q-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 200px;
}

.pager {
  display: flex;
  justify-content: center;
  padding: 4px 0 8px;
}
</style>
