<template>
  <div class="dashboard" v-loading="loading">
    <el-alert
      v-if="loadError"
      :title="t('dashboard.loadError')"
      type="error"
      :closable="false"
      show-icon
      style="margin-bottom: 16px"
    >
      <el-button link type="primary" @click="load">{{ t('dashboard.retry') }}</el-button>
    </el-alert>

    <!-- 快捷操作：老师每天的高频动作，放在统计前面，进首页第一眼就能点。
         v4 把六个独立浮卡合并成一块面板内的平铺入口，减少一屏的卡片数量。 -->
    <section class="quick">
      <div class="quick-head">
        <span class="quick-title">{{ t('dashboard.quickTitle') }}</span>
        <span class="quick-count">{{ t('dashboard.quickCount', { n: quickActions.length }) }}</span>
      </div>
      <div class="quick-grid">
        <!-- 用 router-link 而不是 button+router.push：这样 Cmd/Ctrl+点击能开新标签，中键也可用 -->
        <router-link
          v-for="a in quickActions"
          :key="a.key"
          :to="a.to"
          class="quick-card"
          :class="{ 'is-primary': a.primary }"
        >
          <span class="quick-icon">
            <el-icon :size="18"><component :is="a.icon" /></el-icon>
          </span>
          <span class="quick-text">
            <span class="quick-label">{{ a.label }}</span>
            <span class="quick-desc">{{ a.desc }}</span>
          </span>
        </router-link>
      </div>
    </section>

    <!-- 待办：把「今天要处理什么」放在统计前面，首页先回答行动问题，再看读数 -->
    <section class="todo">
      <div class="todo-head">
        <span class="todo-title">{{ t('dashboard.todoTitle') }}</span>
        <span class="todo-sub">{{ t('dashboard.todoSubtitle') }}</span>
      </div>
      <div class="todo-grid">
        <router-link
          v-for="item in todoItems"
          :key="item.key"
          :to="item.to"
          class="todo-item"
          :class="{ 'is-clear': !item.count }"
        >
          <span class="todo-badge" aria-hidden="true">{{ item.count || '✓' }}</span>
          <span class="todo-text">
            <span class="todo-label">{{ item.label }}</span>
            <span class="todo-detail">{{ item.detail }}</span>
          </span>
          <el-icon class="todo-arrow"><ArrowRight /></el-icon>
        </router-link>
      </div>
    </section>

    <!-- 统计卡片：v4 去掉彩色图标块，只留「标签 + 大数字」。
         参考图的 KPI 卡就是这种两极排版，少一个图标块，四个数字才排得整齐。 -->
    <div class="stat-grid">
      <router-link v-for="c in statCards" :key="c.label" class="stat-card" :to="c.to">
        <div class="stat-label">{{ c.label }}</div>
        <div class="stat-value">{{ c.value }}</div>
      </router-link>
    </div>

    <!-- 图表 -->
    <div class="chart-grid">
      <el-card class="chart-card">
        <template #header>
          <div class="chart-head">
            <span class="chart-title">{{ t('dashboard.charts.typeTitle') }}</span>
            <span class="chart-sub">{{ t('dashboard.charts.typeSub') }}</span>
          </div>
        </template>
        <div ref="typeRef" class="chart"></div>
      </el-card>

      <el-card class="chart-card">
        <template #header>
          <div class="chart-head">
            <span class="chart-title">{{ t('dashboard.charts.difficultyTitle') }}</span>
            <span class="chart-sub">{{ t('dashboard.charts.difficultySub') }}</span>
          </div>
        </template>
        <div ref="difficultyRef" class="chart"></div>
      </el-card>

      <el-card class="chart-card chart-card--wide">
        <template #header>
          <div class="chart-head">
            <span class="chart-title">{{ t('dashboard.charts.knowledgeTitle') }}</span>
            <span class="chart-sub">{{ t('dashboard.charts.knowledgeSub') }}</span>
          </div>
        </template>
        <div ref="knowledgeRef" class="chart"></div>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import {
  Plus,
  Collection,
  DocumentAdd,
  Memo,
  Files,
  FolderOpened,
  ArrowRight
} from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { getStats } from '../api/stats'
import { getBackupStatus } from '../api/backup'
import type { BackupStatus } from '../api/backup'
import { useECharts } from '../composables/useECharts'
import {
  CHART_PALETTE,
  CHART_DIFFICULTY_SCALE,
  CHART_PRIMARY,
  CHART_LABEL,
  CHART_AXIS_LINE,
  CHART_SPLIT_LINE,
  CHART_SURFACE
} from '../utils/chartPalette'
import { questionTypeLabel, formatDate } from '../utils/format'
import { quickActionPath } from '../utils/quickAction'

// 快捷操作：按老师的日常高频顺序排，第一个是最高频的「发布作业」，
// 按全站颜色语义给它主色（群青=唯一强调色），其余保持中性瓦片底，避免一排全是强调色。
// 文案放语言包，key 与 dashboard.quick.* 对应。
const QUICK_ACTIONS = [
  {
    key: 'homework',
    to: quickActionPath('/homeworks', 'new'),
    icon: Plus,
    primary: true
  },
  {
    key: 'question',
    to: quickActionPath('/questions', 'new'),
    icon: Collection
  },
  {
    key: 'grade',
    to: quickActionPath('/grades', 'new'),
    icon: DocumentAdd
  },
  {
    key: 'conclusion',
    to: '/conclusions/new',
    icon: Memo
  },
  {
    key: 'handout',
    to: '/handouts/new',
    icon: Files
  },
  {
    key: 'backup',
    to: '/backup',
    icon: FolderOpened
  }
]

const { t, te, locale } = useI18n()

const quickActions = computed(() =>
  QUICK_ACTIONS.map((a) => ({
    ...a,
    label: t(`dashboard.quick.${a.key}.label`),
    desc: t(`dashboard.quick.${a.key}.desc`)
  }))
)

const stats = ref<any>(null)
const backupStatus = ref<BackupStatus | null>(null)
const loading = ref(false)
const loadError = ref(false)
const typeRef = ref<HTMLElement>()
const difficultyRef = ref<HTMLElement>()
const knowledgeRef = ref<HTMLElement>()

const { init: initChart, resizeAll, disposeAll } = useECharts()

// 题型名走语言包，缺键时退回原来的中文映射（历史数据出现未知类型也不至于显示成空）
const typeLabel = (type: string) =>
  te(`questionType.${type}`) ? t(`questionType.${type}`) : questionTypeLabel(type)

// 数据未就绪时卡片显示「—」，避免慢网先闪 0 值
const statCards = computed(() => {
  const c = stats.value?.counts || {}
  const v = (n: number | undefined) => (stats.value ? (n ?? 0) : '—')
  return [
    { label: t('dashboard.stats.questions'), value: v(c.questionCount), to: '/questions' },
    { label: t('dashboard.stats.students'), value: v(c.studentCount), to: '/students' },
    { label: t('dashboard.stats.homeworks'), value: v(c.homeworkCount), to: '/homeworks' },
    { label: t('dashboard.stats.submissions'), value: v(c.submissionCount), to: '/grade-analysis' }
  ]
})

// 首页待办：作业截止/缺截止时间、未标注难度、备份状态。
// 数据全部来自已有的 /stats 与 /backup/status，不额外拉整张作业表。
const todoItems = computed(() => {
  const todo = stats.value?.todo || {}
  const upcomingCount = Number(todo.upcomingCount || 0)
  const first = todo.upcoming?.[0]
  const noDeadline = Number(todo.noDeadlineCount || 0)
  const unratedRow = (stats.value?.byDifficulty || []).find(
    (d: any) => d.difficulty == null || String(d.difficulty) === 'null'
  )
  const unrated = Number(unratedRow?.count || 0)

  const b = backupStatus.value
  const daysSince = Number(b?.daysSince ?? 0)
  const backupDue = !!b && b.enabled && (!b.lastAt || daysSince >= b.intervalDays)
  let backupLabel = t('dashboard.todo.backupUnknown')
  let backupDetail = ''
  if (b) {
    if (!b.enabled) {
      backupLabel = t('dashboard.todo.backupOff')
      backupDetail = b.lastAt
        ? t('dashboard.todo.backupDetail', { date: formatDate(b.lastAt), n: daysSince })
        : t('dashboard.todo.backupNeverDetail')
    } else if (!b.lastAt) {
      backupLabel = t('dashboard.todo.backupNever')
      backupDetail = t('dashboard.todo.backupNeverDetail')
    } else {
      backupLabel = backupDue ? t('dashboard.todo.backupDue') : t('dashboard.todo.backupOk')
      backupDetail = t('dashboard.todo.backupDetail', {
        date: formatDate(b.lastAt),
        n: daysSince
      })
    }
  }

  return [
    {
      key: 'upcoming',
      count: upcomingCount,
      label: upcomingCount
        ? t('dashboard.todo.upcoming', { n: upcomingCount })
        : t('dashboard.todo.upcomingNone'),
      detail: first
        ? t('dashboard.todo.upcomingDetail', {
            title: first.title,
            date: formatDate(first.endAt)
          })
        : t('dashboard.todo.clear'),
      to: '/homeworks'
    },
    {
      key: 'noDeadline',
      count: noDeadline,
      label: noDeadline
        ? t('dashboard.todo.noDeadline', { n: noDeadline })
        : t('dashboard.todo.noDeadlineNone'),
      detail: noDeadline ? t('dashboard.todo.noDeadlineDetail') : t('dashboard.todo.clear'),
      to: '/homeworks'
    },
    {
      key: 'unrated',
      count: unrated,
      label: unrated
        ? t('dashboard.todo.unrated', { n: unrated })
        : t('dashboard.todo.unratedNone'),
      detail: unrated ? t('dashboard.todo.unratedDetail') : t('dashboard.todo.clear'),
      to: '/question-analysis'
    },
    {
      key: 'backup',
      count: backupDue ? 1 : 0,
      label: backupLabel,
      detail: backupDetail,
      to: '/backup'
    }
  ]
})

const renderOne = (el: HTMLElement, option: any) => {
  initChart(el, option)
}

const renderCharts = () => {
  const s = stats.value
  if (!s) return

  // 题型饼图
  const typeData = (s.byType || []).map((it: any) => ({
    name: typeLabel(it.type),
    value: Number(it.count)
  }))
  renderOne(typeRef.value!, {
    tooltip: {
      trigger: 'item',
      formatter: (p: any) =>
        t('dashboard.charts.typeTooltip', { name: p.name, value: p.value, percent: p.percent })
    },
    legend: { bottom: 0, icon: 'circle', itemWidth: 8, itemHeight: 8 },
    color: CHART_PALETTE,
    series: [
      {
        type: 'pie',
        radius: ['46%', '68%'],
        center: ['50%', '44%'],
        avoidLabelOverlap: true,
        // 扇区之间留白而不是画描边：描边会在相邻扇区间形成一圈深色接缝，
        // 留白则是「间隙」，在浅底上读起来更干净。
        itemStyle: { borderRadius: 3, borderColor: CHART_SURFACE, borderWidth: 3 },
        // 标签只留百分比：类别名已经在图例里，再印一遍是重复信息。
        // 题数保留 —— 图例给不出这个量级感。
        label: {
          formatter: (p: { percent: number }) => `${p.percent.toFixed(1)}%`,
          fontSize: 12,
          color: CHART_LABEL
        },
        labelLine: { length: 8, length2: 10, lineStyle: { color: CHART_AXIS_LINE } },
        data: typeData
      }
    ]
  })

  // 难度柱状图
  // 「未标注」单列一根灰柱：难度可以留空（录入时不再默认填 3），
  // 把它并进某一档或悄悄丢掉，都会让「难度分布」看起来比实际更整齐。
  const diffMap = new Map<string, number>(
    (s.byDifficulty || []).map(
      (it: any) => [String(it.difficulty), Number(it.count)] as [string, number]
    )
  )
  const diffLabels = ['★1', '★2', '★3', '★4', '★5']
  const diffData = [1, 2, 3, 4, 5].map((d) => diffMap.get(String(d)) || 0)
  const diffColors = [...CHART_DIFFICULTY_SCALE]
  const unrated = diffMap.get('null') || diffMap.get('undefined') || 0
  if (unrated > 0) {
    diffLabels.push(t('dashboard.charts.unrated'))
    diffData.push(unrated)
    // 未标注不是难度档位，用中性灰，避免被读成第 6 档
    diffColors.push(CHART_AXIS_LINE)
  }
  renderOne(difficultyRef.value!, {
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 16, top: 24, bottom: 28 },
    xAxis: {
      type: 'category',
      data: diffLabels,
      axisLine: { lineStyle: { color: CHART_AXIS_LINE } },
      axisTick: { show: false },
      axisLabel: { color: CHART_LABEL }
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: CHART_SPLIT_LINE } },
      axisLabel: { color: CHART_LABEL }
    },
    series: [
      {
        type: 'bar',
        // 难度是有序变量：颜色随难度递进加深，柱子自己就把「偏难/偏基础」
        // 说了出来，不必回头看坐标轴。见 chartPalette 里的说明。
        data: diffData.map((v, i) => ({
          value: v,
          itemStyle: { color: diffColors[i] }
        })),
        barWidth: '48%',
        itemStyle: { borderRadius: [3, 3, 0, 0] }
      }
    ]
  })

  // 知识点横向柱状图
  const know = (s.byKnowledge || []).map((it: any) => ({
    name: it.knowledgeTag,
    value: Number(it.count)
  }))
  renderOne(knowledgeRef.value!, {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 90, right: 30, top: 10, bottom: 28 },
    xAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: CHART_SPLIT_LINE } },
      axisLabel: { color: CHART_LABEL }
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: know.map((k: any) => k.name),
      axisLine: { lineStyle: { color: CHART_AXIS_LINE } },
      axisTick: { show: false },
      axisLabel: { color: CHART_LABEL }
    },
    series: [
      {
        type: 'bar',
        data: know.map((k: any) => k.value),
        barWidth: '54%',
        // 单一系列不编码额外信息，所以用主色而不是对照色 ——
        // 颜色在这里只承担「这是一组数据」的作用。
        itemStyle: { color: CHART_PRIMARY, borderRadius: [0, 3, 3, 0] }
      }
    ]
  })
}

// 图表文案（题型图例、未标注档、tooltip）画在 canvas 里，切换语言后必须重绘；
// echarts.init 对同一容器重复初始化会告警，所以先销毁再按新语言重建。
watch(locale, async () => {
  if (!stats.value) return
  disposeAll()
  await nextTick()
  renderCharts()
})

const handleResize = resizeAll

const load = async () => {
  loading.value = true
  loadError.value = false
  try {
    const [s, b] = await Promise.all([
      getStats(),
      // 备份状态失败不拖垮整页：待办卡显示「状态未读取」即可
      getBackupStatus({ silent: true }).catch(() => null)
    ])
    stats.value = s
    backupStatus.value = b
    await nextTick()
    renderCharts()
  } catch (err) {
    loadError.value = true
    // 错误提示已由 request.ts 全局弹出
    console.error('首页数据加载失败', err)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
})
</script>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 1440px;
  margin: 0 auto;
}

/* —— 快捷操作：一块面板里的平铺入口，不再是一排独立浮卡 —— */
.quick {
  background-color: var(--card-bg);
  border: 1px solid var(--card-edge);
  border-radius: var(--card-radius);
  box-shadow: var(--card-shadow);
  padding: 16px 18px;
}
.quick-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}
.quick-title {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--ink);
  letter-spacing: -0.005em;
}
.quick-count {
  font-size: var(--text-xs);
  color: var(--ink-soft);
}
.quick-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}
/* 入口本身是一格可悬停的平铺项：无边框、无投影，
   悬停只浮出一层浅灰底，和参考图的导航/列表手感一致。 */
.quick-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  text-align: left;
  cursor: pointer;
  font: inherit;
  color: var(--ink);
  text-decoration: none;
  background-color: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  transition:
    background-color var(--dur) var(--ease),
    border-color var(--dur) var(--ease);
}
.quick-card:hover {
  background-color: var(--surface-muted);
  border-color: var(--card-hair);
}
.quick-card:active {
  background-color: var(--paper-deep);
}
.quick-card:focus-visible {
  outline: 2px solid var(--moss);
  outline-offset: 2px;
}
.quick-icon {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
  color: var(--ink-soft);
  transition:
    background-color var(--dur) var(--ease),
    color var(--dur) var(--ease);
}
.quick-card:hover .quick-icon {
  color: var(--ink);
  background: var(--paper-deep);
}
/* 主操作：全页唯一的实心色块，对应「强调色=主操作」的语义。 */
.quick-card.is-primary .quick-icon {
  background: var(--moss);
  color: var(--on-accent);
}
.quick-card.is-primary:hover .quick-icon {
  background: var(--moss-deep);
  color: var(--on-accent);
}
.quick-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.quick-label {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--ink);
  line-height: 1.4;
}
.quick-desc {
  margin-top: 1px;
  font-size: var(--text-xs);
  color: var(--ink-soft);
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* —— 待办：与快捷操作同一块「面」，四行两列；清零项退成灰阶 —— */
.todo {
  background-color: var(--card-bg);
  border: 1px solid var(--card-edge);
  border-radius: var(--card-radius);
  box-shadow: var(--card-shadow);
  padding: 16px 18px;
}
.todo-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 12px;
}
.todo-title {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--ink);
  letter-spacing: -0.005em;
}
.todo-sub {
  font-size: var(--text-xs);
  color: var(--ink-soft);
}
.todo-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}
.todo-item {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 10px 12px;
  color: inherit;
  text-decoration: none;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  transition:
    background-color var(--dur) var(--ease),
    border-color var(--dur) var(--ease);
}
.todo-item:hover {
  background-color: var(--surface-muted);
  border-color: var(--card-hair);
}
.todo-item:focus-visible {
  outline: 2px solid var(--moss-ring);
  outline-offset: 2px;
}
.todo-badge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  height: 30px;
  padding: 0 6px;
  border-radius: var(--radius-sm);
  background: var(--moss-soft);
  color: var(--moss-deep);
  font-family: var(--font-data);
  font-size: var(--text-sm);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.todo-item.is-clear .todo-badge {
  background: var(--surface-muted);
  color: var(--ink-soft);
}
.todo-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.todo-label {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--ink);
  line-height: 1.4;
}
.todo-item.is-clear .todo-label {
  color: var(--ink-soft);
  font-weight: 400;
}
.todo-detail {
  margin-top: 1px;
  font-size: var(--text-xs);
  color: var(--ink-soft);
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.todo-arrow {
  flex-shrink: 0;
  margin-left: auto;
  color: var(--ink-disabled);
  font-size: 12px;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
/* 统计卡：标签在上、数字在下，容器只负责提供一个白面。
   没有图标块、没有 hover 位移 —— 四张卡是同一层级的读数，不装成按钮。 */
.stat-card {
  display: flex;
  color: inherit;
  text-decoration: none;
  cursor: pointer;
  flex-direction: column;
  gap: 6px;
  min-height: 96px;
  justify-content: center;
  background-color: var(--card-bg);
  border: 1px solid var(--card-edge);
  border-radius: var(--card-radius);
  padding: 18px 20px;
  box-shadow: var(--card-shadow);
  transition: border-color var(--dur) var(--ease);
}
.stat-card:hover {
  border-color: var(--card-edge-strong);
}
.stat-card:focus-visible {
  outline: 2px solid var(--moss-ring);
  outline-offset: 2px;
}
.stat-label {
  font-size: var(--text-xs);
  color: var(--ink-soft);
  letter-spacing: 0.01em;
}
.stat-value {
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  font-weight: 600;
  color: var(--ink);
  line-height: 1.1;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.chart-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.chart-card--wide {
  grid-column: span 2;
}
/*
 * 关键：网格子项默认 min-width:auto，不肯收缩到内容以下。
 * ECharts 的 canvas 带固定像素宽度（初始化时按当时的容器算出来），于是窄屏时
 * 卡片被 canvas 顶住不缩 → 容器尺寸不变 → chart.resize() 读到旧尺寸，形成死锁，
 * 整块图表区横向溢出被 .main 裁掉。给卡片 min-width:0 才能让它跟着网格收缩，
 * 之后 resize 事件里 c.resize() 才能拿到新宽度重画。
 */
.chart-card {
  min-width: 0;
}
.chart-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.chart-title {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--ink);
  letter-spacing: -0.005em;
}
.chart-sub {
  font-size: var(--text-xs);
  font-weight: 400;
  color: var(--ink-soft);
}
.chart {
  width: 100%;
  min-width: 0;
  height: 280px;
}

@media (max-width: 900px) {
  .stat-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .quick-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .todo-grid {
    grid-template-columns: 1fr;
  }
  .chart-grid {
    grid-template-columns: 1fr;
  }
  .chart-card--wide {
    grid-column: span 1;
  }
}

@media (max-width: 520px) {
  .stat-grid {
    grid-template-columns: 1fr;
  }
  .quick-grid {
    grid-template-columns: 1fr;
  }
}
</style>
