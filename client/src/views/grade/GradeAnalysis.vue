<template>
  <div class="analysis">
    <!-- 筛选器 -->
    <el-card class="filter-card">
      <div class="filters">
        <el-select
          v-model="fStudentId"
          :placeholder="t('gradeAnalysis.studentPlaceholder')"
          clearable
          filterable
          style="width: 220px"
          @change="load"
        >
          <el-option
            v-for="s in students"
            :key="s.id"
            :label="s.grade ? `${s.name} (${gradeLabel(s.grade)})` : s.name"
            :value="s.id"
          />
        </el-select>
        <el-select
          v-model="fExamType"
          :placeholder="t('gradeInput.examType')"
          clearable
          style="width: 140px"
          @change="load"
        >
          <el-option v-for="et in examTypes" :key="et.key" :label="et.name" :value="et.key" />
        </el-select>
        <el-date-picker
          v-model="fDateRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          :range-separator="t('gradeAnalysis.dateTo')"
          :start-placeholder="t('gradeAnalysis.startDate')"
          :end-placeholder="t('gradeAnalysis.endDate')"
          style="width: 260px"
          @change="load"
        />
        <el-button type="primary" :icon="Search" @click="load">{{ t('common.search') }}</el-button>
        <div class="toolbar-spacer"></div>
        <el-button :icon="Download" :disabled="!trendChart" @click="exportTrendPNG">{{
          t('gradeAnalysis.exportTrend')
        }}</el-button>
        <el-button :icon="Download" @click="exportCSV">{{
          t('gradeAnalysis.exportCsv')
        }}</el-button>
      </div>
    </el-card>

    <ListError v-if="error" :message="error" @retry="load" />

    <el-empty v-if="!error && !loading && !hasData" :description="t('gradeAnalysis.empty')" />

    <div v-else-if="!error" class="chart-grid" v-loading="loading">
      <!-- 趋势折线图（单学生） -->
      <el-card v-if="summary.trend.length" class="chart-card chart-card--wide">
        <template #header>
          <span class="chart-title">{{ t('gradeAnalysis.trendTitle') }}</span>
          <span class="chart-sub">{{ trendStudentName }}</span>
        </template>
        <div ref="trendRef" class="chart chart--line"></div>
      </el-card>

      <!-- 班级对比柱状图 -->
      <el-card class="chart-card">
        <template #header
          ><span class="chart-title">{{ t('gradeAnalysis.compareTitle') }}</span></template
        >
        <div ref="compareRef" class="chart"></div>
      </el-card>

      <!-- 分数段饼图 -->
      <el-card class="chart-card">
        <template #header
          ><span class="chart-title">{{ t('gradeAnalysis.pieTitle') }}</span></template
        >
        <div ref="pieRef" class="chart"></div>
      </el-card>

      <!-- 能力雷达（单学生各科平均百分比）
           雷达至少要 3 个轴才有意义：只录数学一科时是 1 个轴，画出来是个点，
           所以少于 3 个科目就整块不渲染。 -->
      <el-card v-if="summary.radar.length >= 3" class="chart-card">
        <template #header>
          <span class="chart-title">{{ t('gradeAnalysis.radarTitle') }}</span>
          <span class="chart-sub">{{ t('gradeAnalysis.radarSub') }}</span>
        </template>
        <div ref="radarRef" class="chart"></div>
      </el-card>

      <!-- 家长反馈单 -->
      <el-card v-if="summary.trend.length" class="chart-card">
        <template #header
          ><span class="chart-title">{{ t('gradeAnalysis.feedbackTitle') }}</span></template
        >
        <div class="feedback">
          <p class="feedback-summary">
            {{ feedbackSummary || t('gradeAnalysis.feedbackEmpty') }}
          </p>
          <el-input
            v-model="feedbackComment"
            type="textarea"
            :rows="3"
            :placeholder="t('gradeAnalysis.commentPlaceholder')"
          />
          <div class="feedback-actions">
            <el-button type="primary" :icon="Printer" @click="printFeedback">{{
              t('gradeAnalysis.print')
            }}</el-button>
          </div>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Search, Download, Printer } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { getStudents } from '../../api/student'
import { getGrades, getGradeSummary } from '../../api/grade'
import { getExamTypes } from '../../api/examType'
import type { ExamTypeItem } from '../../api/examType'
import ListError from '../../components/ListError.vue'
import { escapeHtml } from '../../utils/format'
import { useECharts } from '../../composables/useECharts'
import {
  CHART_PALETTE,
  CHART_PRIMARY,
  CHART_LABEL,
  CHART_AXIS_LINE,
  CHART_AREA_SOFT,
  CHART_SURFACE
} from '../../utils/chartPalette'
import { gradeLabel } from '../../utils/i18nLabels'
import { queryNumber, queryText, stableQuery } from '../../utils/routeQuery'
import type { GradeSummary, GradeTrendPoint, Student } from '../../types'

const { t, te, locale } = useI18n()
const route = useRoute()
const router = useRouter()

// 类型来自后端字典（可自定义）；老数据的 key 用内置文案兜底
const examTypes = ref<ExamTypeItem[]>([])
const palette = CHART_PALETTE

const examTypeLabel = (type: string) =>
  examTypes.value.find((x) => x.key === type)?.name ||
  (te(`exam.${type}`) ? t(`exam.${type}`) : type)

const students = ref<Student[]>([])
const summary = ref<GradeSummary>({ trend: [], radar: [], distribution: [], compare: [] })
const loading = ref(false)
const error = ref('')

const fStudentId = ref<number | undefined>()
const fExamType = ref('')
const fDateRange = ref<any>(null)

// 筛选写进地址栏：刷新、后退、分享链接都能回到同一组图表
let lastSyncedQuery = ''
const readQuery = () => {
  fStudentId.value = queryNumber(route.query, 'studentId', 0) || undefined
  fExamType.value = queryText(route.query, 'examType')
  const start = queryText(route.query, 'startDate')
  const end = queryText(route.query, 'endDate')
  fDateRange.value = start && end ? [start, end] : null
}
const writeQuery = () => {
  const q: Record<string, string> = {}
  if (fStudentId.value) q.studentId = String(fStudentId.value)
  if (fExamType.value) q.examType = fExamType.value
  const range = fDateRange.value
  if (Array.isArray(range) && range[0] && range[1]) {
    q.startDate = String(range[0])
    q.endDate = String(range[1])
  }
  lastSyncedQuery = stableQuery(q)
  router.replace({ path: route.path, query: q })
}
readQuery()

const feedbackComment = ref('')

const trendRef = ref<HTMLElement>()
const compareRef = ref<HTMLElement>()
const pieRef = ref<HTMLElement>()
const radarRef = ref<HTMLElement>()

const { init: initChart, resizeAll, disposeAll } = useECharts()
let trendChart: any = null

const hasData = computed(() => summary.value.compare.length > 0 || summary.value.trend.length > 0)
const trendStudentName = computed(() => {
  const s = students.value.find((x) => x.id === fStudentId.value)
  return s ? t('gradeAnalysis.trendStudent', { name: s.name }) : ''
})

// 自动小结：按科目比较首末次，得出进步/退步/持平
const feedbackSummary = computed(() => {
  const en = locale.value.startsWith('en')
  const trend = summary.value?.trend || []
  const parts: string[] = []
  for (const tr of trend) {
    const pts = tr.points || []
    if (pts.length < 1) continue
    const avg =
      Math.round(
        (pts.reduce((s: number, p: GradeTrendPoint) => s + p.percent, 0) / pts.length) * 10
      ) / 10
    if (pts.length < 2) {
      parts.push(
        t('gradeAnalysis.feedbackSummaryOnlyOne', {
          subject: tr.subject,
          percent: pts[0].percent
        })
      )
      continue
    }
    const first = pts[0].percent
    const last = pts[pts.length - 1].percent
    const diff = Math.round((last - first) * 10) / 10
    const change =
      diff > 2
        ? t('gradeAnalysis.feedbackUp', { diff })
        : diff < -2
          ? t('gradeAnalysis.feedbackDown', { diff: Math.abs(diff) })
          : t('gradeAnalysis.feedbackFlat')
    parts.push(
      t('gradeAnalysis.feedbackSummaryTrend', {
        subject: tr.subject,
        count: pts.length,
        avg,
        last,
        change
      })
    )
  }
  return parts.join(en ? '; ' : '；') + (parts.length ? (en ? '.' : '。') : '')
})

const buildFilters = () => ({
  studentId: fStudentId.value || undefined,
  examType: fExamType.value || undefined,
  startDate: fDateRange.value?.[0] || undefined,
  endDate: fDateRange.value?.[1] || undefined
})

const renderTrend = () => {
  if (!trendRef.value || !summary.value.trend.length) return
  const labels: string[] = []
  const seriesMap = new Map<string, Map<string, GradeTrendPoint>>()
  for (const t of summary.value.trend) {
    const m = new Map<string, GradeTrendPoint>()
    for (const p of t.points) {
      if (!labels.includes(p.date)) labels.push(p.date)
      m.set(p.date, p)
    }
    seriesMap.set(t.subject, m)
  }
  labels.sort()

  // 收集全部百分制分数，用于纵轴自适应缩放 + 平均值参考线
  const allPercents: number[] = []
  // 先按 ECharts 的宽松结构声明，下面按需补 markLine / areaStyle
  const series: any[] = [...seriesMap.entries()].map(([subj, m], i) => ({
    name: subj,
    type: 'line',
    smooth: true,
    connectNulls: true,
    symbol: 'circle',
    symbolSize: 8,
    lineStyle: { width: 3 },
    itemStyle: { color: palette[i % palette.length] },
    // 数据点直接标原始分（如 135/150），曲线仍用百分制保证可比
    label: {
      show: true,
      position: 'top',
      color: CHART_LABEL,
      fontSize: 11,
      formatter: (p: any) => {
        const d = p.data
        return d && d.value != null ? `${d.score}/${d.fullScore}` : ''
      }
    },
    labelLayout: { hideOverlap: true },
    data: labels.map((d) => {
      const pt = m.get(d)
      if (!pt) return null
      allPercents.push(pt.percent)
      return {
        value: pt.percent,
        score: pt.score,
        fullScore: pt.fullScore,
        date: pt.date,
        examType: pt.examType
      }
    })
  }))

  // 纵轴按数据自适应缩放：让 1~2 分的波动也能看清，但保底给一个最小跨度避免过度放大
  const rawMin = Math.min(...allPercents)
  const rawMax = Math.max(...allPercents)
  const span = rawMax - rawMin
  const pad = Math.max(6, span * 0.25)
  let yMin = Math.floor(Math.max(0, rawMin - pad))
  let yMax = Math.ceil(Math.min(100, rawMax + pad))
  if (yMax - yMin < 12) {
    const mid = (rawMin + rawMax) / 2
    yMin = Math.max(0, Math.floor(mid - 6))
    yMax = Math.ceil(mid + 6)
  }

  const avg = allPercents.length
    ? Math.round((allPercents.reduce((s, x) => s + x, 0) / allPercents.length) * 10) / 10
    : 0

  // 平均参考线（画在第一条曲线上）
  if (series[0]) {
    series[0].markLine = {
      silent: true,
      symbol: 'none',
      lineStyle: { type: 'dashed', color: CHART_AXIS_LINE, width: 1.5 },
      label: {
        show: true,
        formatter: t('gradeAnalysis.avgLine', { value: avg }),
        position: 'insideEndTop',
        color: CHART_LABEL,
        fontSize: 11
      },
      data: [{ yAxis: avg }]
    }
  }
  // 单科目时叠加淡色面积，让走势更醒目
  if (series.length === 1) {
    series[0].areaStyle = { color: CHART_AREA_SOFT }
  }

  const chart = initChart(trendRef.value, {
    color: palette,
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        if (!params || !params.length) return ''
        return params
          .map((p: any) => {
            const d = p.data
            if (!d || d.value == null)
              return `${p.marker} ${p.seriesName}: ${t('gradeAnalysis.tooltipEmpty')}`
            return `${p.marker} ${p.seriesName}: <b>${d.score} / ${d.fullScore}</b> (${d.value}%)`
          })
          .join('<br>')
      }
    },
    legend: { top: 0, icon: 'circle' },
    grid: { left: 44, right: 24, top: 48, bottom: 36 },
    xAxis: {
      type: 'category',
      data: labels,
      boundaryGap: false,
      axisLine: { lineStyle: { color: 'rgba(26, 32, 38, 0.16)' } },
      axisTick: { show: false },
      axisLabel: { color: CHART_LABEL }
    },
    yAxis: {
      type: 'value',
      min: yMin,
      max: yMax,
      axisLabel: { color: CHART_LABEL, formatter: '{value}' },
      splitLine: { lineStyle: { color: 'rgba(26, 32, 38, 0.07)' } }
    },
    series
  })
  trendChart = chart
}

const renderCompare = () => {
  if (!compareRef.value) return
  const data = summary.value.compare || []
  const chart = initChart(compareRef.value, {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 44, right: 20, top: 20, bottom: 40 },
    xAxis: {
      type: 'category',
      data: data.map((d: any) => d.name),
      axisLine: { lineStyle: { color: 'rgba(26, 32, 38, 0.16)' } },
      axisTick: { show: false },
      axisLabel: { color: CHART_LABEL, interval: 0, rotate: data.length > 8 ? 30 : 0 }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLabel: { color: CHART_LABEL },
      splitLine: { lineStyle: { color: 'rgba(26, 32, 38, 0.07)' } }
    },
    series: [
      {
        type: 'bar',
        data: data.map((d: any) => d.avgPercent),
        barWidth: '52%',
        itemStyle: { color: CHART_PRIMARY, borderRadius: [6, 6, 0, 0] },
        label: { show: true, position: 'top', color: CHART_LABEL, fontSize: 11 }
      }
    ]
  })
}

const renderPie = () => {
  if (!pieRef.value) return
  const data = (summary.value.distribution || [])
    .filter((d: any) => d.count > 0)
    .map((d: any) => ({ name: d.label, value: d.count }))
  const chart = initChart(pieRef.value, {
    tooltip: {
      trigger: 'item',
      formatter: (p: any) =>
        t('gradeAnalysis.pieTooltip', { name: p.name, value: p.value, percent: p.percent })
    },
    legend: { bottom: 0, icon: 'circle' },
    color: CHART_PALETTE,
    series: [
      {
        type: 'pie',
        radius: ['40%', '64%'],
        center: ['50%', '44%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 6, borderColor: CHART_SURFACE, borderWidth: 2 },
        label: {
          formatter: (p: any) => t('gradeAnalysis.pieLabel', { name: p.name, value: p.value }),
          fontSize: 12,
          color: CHART_LABEL
        },
        data
      }
    ]
  })
}

// 能力雷达：单学生各科平均百分比。
// 后端在不传 studentId 时返回空数组（雷达是「一个人对多科」的形状），
// 科目数少于 3 时画出来是个点或一条线，没有信息量，所以一并挡掉。
const renderRadar = () => {
  const data = summary.value.radar || []
  if (!radarRef.value || data.length < 3) return
  initChart(radarRef.value, {
    tooltip: { trigger: 'item' },
    radar: {
      center: ['50%', '52%'],
      radius: '64%',
      // 满分固定 100（数据已是百分制折算），保证多次查看时尺度一致
      indicator: data.map((d: any) => ({ name: d.subject, max: 100 })),
      axisName: { color: CHART_LABEL, fontSize: 12 },
      splitLine: { lineStyle: { color: 'rgba(26, 32, 38, 0.12)' } },
      splitArea: { areaStyle: { color: ['rgba(252,252,251,0.6)', 'rgba(245,246,245,0.6)'] } },
      axisLine: { lineStyle: { color: 'rgba(26, 32, 38, 0.12)' } }
    },
    series: [
      {
        type: 'radar',
        symbolSize: 6,
        lineStyle: { color: CHART_PRIMARY, width: 2 },
        itemStyle: { color: CHART_PRIMARY },
        areaStyle: { color: 'rgba(37, 99, 235, 0.14)' },
        // 标签直接标出各科均分，省得逐个悬停
        label: {
          show: true,
          color: CHART_LABEL,
          fontSize: 11,
          formatter: (p: any) => `${p.value}%`
        },
        data: [{ value: data.map((d: any) => d.avgPercent), name: trendStudentName.value }]
      }
    ]
  })
}

const renderAll = () => {
  disposeAll()
  trendChart = null
  renderTrend()
  renderCompare()
  renderPie()
  renderRadar()
}

const handleResize = resizeAll

// 图表文案在 canvas 内，切换语言后重绘；先销毁避免重复 init 告警
watch(locale, async () => {
  if (!hasData.value) return
  await nextTick()
  renderAll()
})

// 请求序号：筛选多次快速触发时只采纳最新一次响应，丢弃过期结果
let loadSeq = 0
const load = async () => {
  const seq = ++loadSeq
  loading.value = true
  error.value = ''
  try {
    const data = await getGradeSummary(buildFilters(), { silent: true })
    if (seq !== loadSeq) return // 已有更新的请求，丢弃本次响应
    summary.value = data
    await nextTick()
    renderAll()
    writeQuery()
  } catch (e: any) {
    if (seq === loadSeq) error.value = e?.message || t('gradeAnalysis.loadError')
  } finally {
    if (seq === loadSeq) loading.value = false
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

// 导出趋势图为高清 PNG。backgroundColor 固定纯白而不接 CHART_SURFACE：
// 导出的是一张位图，底色不能随主题漂移，否则暗色主题下会导出灰底图。
const exportTrendPNG = () => {
  if (!trendChart) return ElMessage.warning(t('gradeAnalysis.noTrend'))
  const url = trendChart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' })
  const a = document.createElement('a')
  a.href = url
  a.download = t('gradeAnalysis.trendFile', {
    name: trendStudentName.value || t('gradeAnalysis.csv.student'),
    ts: Date.now()
  })
  a.click()
}

// 导出原始数据为 CSV（带 BOM，Excel 可直接打开）
const exportCSV = async () => {
  const rows = await getGrades(buildFilters())
  if (!rows.length) return ElMessage.warning(t('gradeAnalysis.noExport'))

  const esc = (v: any) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const header = [
    t('gradeAnalysis.csv.student'),
    t('gradeAnalysis.csv.subject'),
    t('gradeAnalysis.csv.examType'),
    t('gradeAnalysis.csv.date'),
    t('gradeAnalysis.csv.score'),
    t('gradeAnalysis.csv.fullScore'),
    t('gradeAnalysis.csv.percent'),
    t('gradeAnalysis.csv.notes')
  ]
  const lines = [header.join(',')]
  for (const r of rows) {
    const pct = r.fullScore > 0 ? Math.round((r.score / r.fullScore) * 100) : 0
    lines.push(
      [
        r.student?.name,
        r.subject,
        examTypeLabel(r.examType),
        r.examDate,
        r.score,
        r.fullScore,
        pct + '%',
        r.comment
      ]
        .map(esc)
        .join(',')
    )
  }
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = t('gradeAnalysis.csvFile', { ts: Date.now() })
  a.click()
  URL.revokeObjectURL(a.href)
}

// 家长反馈单：趋势图 + 小结 + 评语，打印另存 PDF
const printFeedback = () => {
  const student = students.value.find((s) => s.id === fStudentId.value)
  const name = student?.name || t('gradeAnalysis.csv.student')
  const img = trendChart
    ? trendChart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' })
    : ''
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(t('gradeAnalysis.printDoc.title'))}</title>
<style>
  body{font-family:'PingFang SC','Microsoft YaHei',sans-serif;color:#222;padding:32px;max-width:760px;margin:0 auto;}
  h1{font-size:22px;border-bottom:2px solid #333;padding-bottom:12px;}
  .meta{color:#666;font-size:13px;margin:8px 0 16px;}
  .img{max-width:100%;}
  .section{margin:20px 0;}
  .section h2{font-size:16px;margin-bottom:8px;}
  .summary{line-height:1.7;}
  .comment{border:1px solid #ccc;border-radius:6px;padding:12px;min-height:60px;line-height:1.7;white-space:pre-wrap;}
  .foot{margin-top:28px;color:#999;font-size:12px;}
</style></head><body>
<h1>${escapeHtml(t('gradeAnalysis.printDoc.title'))}</h1>
<div class="meta">${escapeHtml(
    t('gradeAnalysis.printDoc.meta', {
      name,
      date: new Date().toLocaleDateString(locale.value)
    })
  )}</div>
${img ? `<img class="img" src="${img}" />` : ''}
<div class="section"><h2>${escapeHtml(t('gradeAnalysis.printDoc.summary'))}</h2><div class="summary">${escapeHtml(feedbackSummary.value || t('gradeAnalysis.printDoc.noData'))}</div></div>
<div class="section"><h2>${escapeHtml(t('gradeAnalysis.printDoc.comments'))}</h2><div class="comment">${escapeHtml(feedbackComment.value || t('gradeAnalysis.printDoc.placeholder')).replace(/\n/g, '<br>')}</div></div>
<div class="foot">${escapeHtml(t('gradeAnalysis.printDoc.footer'))}</div>
</body></html>`
  const win = window.open('', '_blank', 'width=820,height=900')
  if (!win) return ElMessage.warning(t('gradeAnalysis.popupBlocked'))
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 400)
}

onMounted(async () => {
  try {
    students.value = await getStudents()
  } catch {
    // 学生下拉只是筛选辅助；数据本身失败会由 load() 的错误条兜住
  }
  try {
    examTypes.value = await getExamTypes({ silent: true })
  } catch {
    // 类型加载失败时筛选只看老 key（文案退回 i18n）
  }
  load()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  disposeAll()
})
</script>

<style scoped>
.analysis {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.filter-card {
  margin-bottom: 0;
}
.filters {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.toolbar-spacer {
  flex: 1;
}
.chart-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.chart-card--wide {
  grid-column: span 2;
}
.chart-title {
  font-family: var(--font-display);
  font-weight: 700;
  color: var(--ink);
  letter-spacing: 0.02em;
}
.chart-sub {
  margin-left: 12px;
  font-size: 13px;
  color: var(--ink-soft);
}
.chart {
  height: 300px;
}
.chart--line {
  height: 340px;
}
.feedback {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.feedback-summary {
  margin: 0;
  line-height: 1.8;
  color: var(--ink);
  font-size: 14px;
  background: var(--moss-soft);
  border-radius: var(--radius);
  padding: 12px 14px;
}
.feedback-actions {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 900px) {
  .chart-grid {
    grid-template-columns: 1fr;
  }
  .chart-card--wide {
    grid-column: span 1;
  }
}
</style>
