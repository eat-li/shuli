<template>
  <div class="analysis">
    <div class="analysis__head">
      <div>
        <h1 class="analysis__title">{{ t('questionAnalysis.title') }}</h1>
        <p class="analysis__sub">{{ t('questionAnalysis.intro') }}</p>
      </div>
      <div class="analysis__filters">
        <el-button @click="aiVisible = true">{{ t('questionAnalysis.aiRate') }}</el-button>
        <el-select v-model="kind" style="width: 130px" @change="load">
          <el-option :label="t('questionAnalysis.allTypes')" value="" />
          <el-option :label="t('questionAnalysis.typeSingle')" value="single" />
          <el-option :label="t('questionAnalysis.typeMultiple')" value="multiple" />
          <el-option :label="t('questionAnalysis.typeFill')" value="fill" />
          <el-option :label="t('questionAnalysis.typeSolve')" value="solve" />
        </el-select>
        <el-select
          v-model="knowledgeTag"
          style="width: 180px"
          clearable
          filterable
          :placeholder="t('questionAnalysis.allKnowledge')"
          @change="load"
        >
          <el-option v-for="t in tags" :key="t" :label="t" :value="t" />
        </el-select>
        <el-button @click="load">{{ t('common.refresh') }}</el-button>
      </div>
    </div>

    <ListError v-if="error" :message="error" @retry="load" />

    <div v-if="!error" v-loading="loading" class="analysis__stats">
      <div class="stat">
        <span class="stat__label">{{ t('questionAnalysis.stats.total') }}</span>
        <span class="stat__value">{{ data?.total ?? '—' }}</span>
      </div>
      <div class="stat">
        <span class="stat__label">{{ t('questionAnalysis.stats.rated') }}</span>
        <span class="stat__value">{{ data?.rated ?? '—' }}</span>
        <span class="stat__meta">{{
          t('questionAnalysis.stats.coverage', { percent: coverageText })
        }}</span>
      </div>
      <div class="stat">
        <span class="stat__label">{{ t('questionAnalysis.stats.unrated') }}</span>
        <span class="stat__value">{{ data?.unrated ?? '—' }}</span>
        <span class="stat__meta">{{ t('questionAnalysis.stats.unratedHint') }}</span>
      </div>
      <div class="stat">
        <span class="stat__label">{{ t('questionAnalysis.stats.average') }}</span>
        <span class="stat__value">{{ data?.avgDifficulty ?? '—' }}</span>
        <span class="stat__meta">{{ t('questionAnalysis.stats.averageHint') }}</span>
      </div>
    </div>

    <div v-if="!error" class="analysis__charts">
      <section class="card">
        <h2 class="card__title">{{ t('questionAnalysis.charts.distributionTitle') }}</h2>
        <p class="card__hint">{{ t('questionAnalysis.charts.distributionHint') }}</p>
        <div ref="distEl" class="card__chart" />
      </section>
      <section class="card">
        <h2 class="card__title">{{ t('questionAnalysis.charts.typeTitle') }}</h2>
        <p class="card__hint">{{ t('questionAnalysis.charts.typeHint') }}</p>
        <div ref="typeEl" class="card__chart" />
      </section>
      <section class="card card--wide">
        <h2 class="card__title">{{ t('questionAnalysis.charts.knowledgeTitle') }}</h2>
        <p class="card__hint">{{ t('questionAnalysis.charts.knowledgeHint') }}</p>
        <div ref="knowledgeEl" class="card__chart card__chart--tall" />
      </section>
    </div>

    <AiDifficultyDialog v-model="aiVisible" @applied="load" />

    <p class="analysis__foot">
      {{ t('questionAnalysis.footer') }}
      <el-button text type="primary" size="small" @click="goBrowse">{{
        t('questionAnalysis.footerBrowse')
      }}</el-button>
      {{ t('questionAnalysis.footerEnd') }}
    </p>
  </div>
</template>

<script setup lang="ts">
// 题库难度分析：与首页 Dashboard 的区别是「下钻」——
// 首页只给全库单维度概览，这里做题型/知识点的交叉，并单独暴露「未标注」这一数据质量问题。
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { vLoading } from 'element-plus'
import { getQuestionAnalysis, getQuestionTags, type QuestionAnalysis } from '../../api/question'
import ListError from '../../components/ListError.vue'
import AiDifficultyDialog from '../../components/question/AiDifficultyDialog.vue'
import { useECharts } from '../../composables/useECharts'
import { CHART_GRID_LINE, DIFFICULTY_PALETTE, UNRATED_COLOR } from '../../utils/chartPalette'
import { queryText, stableQuery } from '../../utils/routeQuery'
const router = useRouter()
const route = useRoute()
const { t, locale } = useI18n()
const { init, disposeAll } = useECharts()

const loading = ref(false)
const error = ref('')
const kind = ref('')
const knowledgeTag = ref('')
const tags = ref<string[]>([])

// 筛选写进地址栏：刷新、后退、分享链接都能回到同一组图表
const KIND_VALUES = ['', 'single', 'multiple', 'fill', 'solve']
let lastSyncedQuery = ''
const readQuery = () => {
  const k = queryText(route.query, 'kind')
  kind.value = KIND_VALUES.includes(k) ? k : ''
  knowledgeTag.value = queryText(route.query, 'knowledgeTag')
}
const writeQuery = () => {
  const q: Record<string, string> = {}
  if (kind.value) q.kind = kind.value
  if (knowledgeTag.value) q.knowledgeTag = knowledgeTag.value
  lastSyncedQuery = stableQuery(q)
  router.replace({ path: route.path, query: q })
}
readQuery()
const data = ref<QuestionAnalysis | null>(null)
const aiVisible = ref(false)

const distEl = ref<HTMLElement>()
const typeEl = ref<HTMLElement>()
const knowledgeEl = ref<HTMLElement>()

const coverageText = computed(() => {
  const d = data.value
  if (!d || !d.total) return '—'
  return `${Math.round((d.rated / d.total) * 100)}%`
})

const params = () => {
  const p: Record<string, string> = {}
  if (knowledgeTag.value) p.knowledgeTag = knowledgeTag.value
  if (kind.value === 'single' || kind.value === 'multiple') {
    p.type = 'choice'
    p.choiceMode = kind.value
  } else if (kind.value) {
    p.type = kind.value
  }
  return p
}

// 图表的坐标轴/图例文案也要跟着语言走：这两处原来写死中文，
// 语言切成英文后图表里还是「1 星 / 未标注」。
// 用 t(key, n) 触发 vue-i18n 的复数规则：英文是 "1 star / 2 stars"，
// 传具名参数 { n } 不会走复数、会得到 "1 stars"。
const levelLabel = (level: number | null) =>
  level == null ? t('questionAnalysis.charts.unrated') : t('questionAnalysis.charts.star', level)

const levelLabels = () => [1, 2, 3, 4, 5, null].map(levelLabel)

// 题型名走 i18n 而不是 utils/format 的 questionTypeLabel ——
// 后者是只读家长端也在用的中文口径（那边不随后台语言切换，见 ADR 0002）。
const typeLabel = (type: string) => t(`questionType.${type}`)

const renderCharts = () => {
  const d = data.value
  if (!d) return
  disposeAll()

  // ① 难度分布：未标注单独一根灰柱，绝不当 0 星
  if (distEl.value) {
    init(distEl.value, {
      grid: { top: 16, left: 40, right: 16, bottom: 28 },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: levelLabels(), axisTick: { show: false } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: CHART_GRID_LINE } } },
      series: [
        {
          type: 'bar',
          barMaxWidth: 42,
          data: d.byDifficulty.map((b, i) => ({
            value: b.count,
            itemStyle: {
              color: b.difficulty == null ? UNRATED_COLOR : DIFFICULTY_PALETTE[b.difficulty - 1]
            },
            label: { show: b.count > 0, position: 'top', fontSize: 11 }
          }))
        }
      ]
    })
  }

  // ② 题型 × 难度：堆叠柱，看每个题型的难度重心
  if (typeEl.value) {
    const types = ['choice', 'fill', 'solve']
    init(typeEl.value, {
      grid: { top: 24, left: 40, right: 16, bottom: 28 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 11 } },
      xAxis: { type: 'category', data: types.map((k) => typeLabel(k)) },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: CHART_GRID_LINE } } },
      series: [1, 2, 3, 4, 5, null].map((level) => ({
        name: levelLabel(level),
        type: 'bar',
        stack: 'total',
        barMaxWidth: 46,
        itemStyle: {
          color: level == null ? UNRATED_COLOR : DIFFICULTY_PALETTE[(level as number) - 1]
        },
        data: types.map(
          (k) =>
            d.byTypeDifficulty.find(
              (x) => x.type === k && (x.difficulty ?? null) === (level ?? null)
            )?.count || 0
        )
      }))
    })
  }

  // ③ 知识点 × 难度：横向堆叠条，Top 12
  if (knowledgeEl.value) {
    const rows = d.byKnowledgeDifficulty
    init(knowledgeEl.value, {
      grid: { top: 28, left: 96, right: 24, bottom: 24 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 11 } },
      xAxis: { type: 'value', splitLine: { lineStyle: { color: CHART_GRID_LINE } } },
      yAxis: {
        type: 'category',
        data: rows.map((r) => r.label),
        axisLabel: { width: 88, overflow: 'truncate', fontSize: 11 }
      },
      series: [1, 2, 3, 4, 5, null].map((level) => ({
        name: levelLabel(level),
        type: 'bar',
        stack: 'total',
        barMaxWidth: 16,
        itemStyle: {
          color: level == null ? UNRATED_COLOR : DIFFICULTY_PALETTE[(level as number) - 1]
        },
        data: rows.map((r) => r.levels[level == null ? 'null' : String(level)] || 0)
      }))
    })
  }
}

const load = async () => {
  loading.value = true
  error.value = ''
  try {
    data.value = await getQuestionAnalysis(params(), { silent: true })
    await nextTick()
    renderCharts()
    writeQuery()
  } catch (e: any) {
    // 失败时四张统计卡会全是「—」，看起来像「没有题目」；必须换成可重试错误态
    error.value = e?.message || t('questionAnalysis.loadError')
  } finally {
    loading.value = false
  }
}

// 前进/后退或外部带参跳进来时重新读取
watch(
  () => route.query,
  (q) => {
    if (stableQuery(q) === lastSyncedQuery) return
    readQuery()
    load()
  }
)

const goBrowse = () => router.push('/browse')

onMounted(async () => {
  getQuestionTags()
    .then((list) => (tags.value = list || []))
    .catch(() => (tags.value = []))
  await load()
})

// 图表是 canvas，不参与 Vue 的响应式重渲染：切语言后必须手动重绘，
// 否则页面文字变了、图里的「1 星 / 未标注」还是旧语言。
watch(locale, () => {
  if (data.value) renderCharts()
})
</script>

<style scoped>
.analysis {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.analysis__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
}
.analysis__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 22px;
}
.analysis__sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--ink-soft);
  max-width: 620px;
  line-height: 1.7;
}
.analysis__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.analysis__stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.stat {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--card-radius);
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.stat__label {
  font-size: 12px;
  color: var(--ink-soft);
}
.stat__value {
  font-family: var(--font-data);
  font-size: 24px;
  line-height: 1.2;
}
.stat__meta {
  font-size: 11px;
  color: var(--ink-placeholder);
}
.analysis__charts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--card-radius);
  padding: 14px 16px;
}
.card--wide {
  grid-column: 1 / -1;
}
.card__title {
  margin: 0 0 4px;
  font-family: var(--font-display);
  font-size: 15px;
}
.card__hint {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--ink-soft);
}
.card__chart {
  height: 220px;
}
.card__chart--tall {
  height: 300px;
}
.analysis__foot {
  margin: 0;
  font-size: 13px;
  color: var(--ink-soft);
}
</style>
