<template>
  <div class="cl">
    <el-card class="cl-page">
      <div class="toolbar">
        <span class="title">{{ t('nav.conclusions') }}</span>
        <span class="count">{{ t('conclusionList.count', { n: total }) }}</span>
        <span class="spacer"></span>
        <el-button :icon="Download" :disabled="!list.length" @click="doExport">{{
          t('conclusionList.exportPdf')
        }}</el-button>
        <el-button :icon="FolderOpened" @click="goCategories">{{
          t('conclusionList.manageCategories')
        }}</el-button>
        <el-button type="primary" :icon="Plus" @click="goPublish">{{
          t('conclusionList.publish')
        }}</el-button>
      </div>

      <div class="filters">
        <el-select
          v-model="query.categoryId"
          :placeholder="t('conclusionList.allCategories')"
          clearable
          style="width: 200px"
          @change="onFilter"
        >
          <el-option v-for="c in flatCategories" :key="c.value" :label="c.label" :value="c.value" />
        </el-select>
        <el-select
          v-model="query.status"
          :placeholder="t('conclusionList.allStatuses')"
          clearable
          style="width: 140px"
          @change="onFilter"
        >
          <el-option :label="t('conclusionList.draft')" value="draft" />
          <el-option :label="t('conclusionList.published')" value="published" />
        </el-select>
        <el-input
          v-model="query.keyword"
          :placeholder="t('conclusionList.searchPlaceholder')"
          :aria-label="t('conclusionList.searchAria')"
          clearable
          style="width: 240px"
          @keyup.enter="onFilter"
          @clear="onFilter"
        >
          <template #append>
            <el-button :icon="Search" :aria-label="t('conclusionList.search')" @click="onFilter" />
          </template>
        </el-input>
        <span class="spacer"></span>
        <!-- 只剩一个知识点时卡片已全展开，这组开关没有可操作对象 -->
        <el-button
          v-if="groups.length > 1"
          text
          :icon="allExpanded ? Fold : Expand"
          @click="toggleAllGroups"
        >
          {{ allExpanded ? t('conclusionList.collapseAll') : t('conclusionList.expandAll') }}
        </el-button>
      </div>

      <ListError :message="error" @retry="run" />

      <el-empty
        v-if="!error && !loading && !list.length"
        :description="hasFilter ? t('conclusionList.emptyFiltered') : t('conclusionList.emptyNone')"
      />

      <!-- 题库墙结构：一张卡 = 一个知识点，卡内直接列出结论标题。
           卡片宽度随结果集自适应（筛到只剩一个知识点时铺满整行），
           卡内标题按可用宽度自动分列——一个知识点十几条时单列会把右侧空出来。
           点标题进详情页读正文——墙负责「找」，详情页负责「读」。 -->
      <div v-if="!error" v-loading="loading" class="cl-grid">
        <section
          v-for="g in groups"
          :key="g.key"
          class="cl-card"
          :class="{ 'cl-card--empty': g.key === 0 }"
        >
          <header class="cl-card__head">
            <button
              type="button"
              class="cl-card__name"
              :title="t('conclusionList.filterHint', { name: g.name })"
              @click="filterByGroup(g)"
            >
              {{ g.name }}
            </button>
            <div class="cl-card__count">
              <strong>{{ g.items.length }}</strong>
              <span>{{ t('conclusionList.unit') }}</span>
            </div>
          </header>

          <div class="cl-card__meta">
            <span v-if="g.published" class="cl-card__pill">{{
              t('conclusionList.publishedCount', { n: g.published })
            }}</span>
            <span v-if="g.draft" class="cl-card__pill cl-card__pill--muted">
              {{ t('conclusionList.draftCount', { n: g.draft }) }}
            </span>
            <span class="spacer"></span>
            <span class="cl-card__time">{{ latestTime(g) }}</span>
          </div>

          <!-- 发布/草稿占比：把两个状态变成可一眼比较的形状，
               明度与上面的胶囊一一对应。纯装饰，信息仍由文字承担。 -->
          <div class="cl-bars" aria-hidden="true">
            <i
              v-if="g.published"
              class="cl-bars__seg cl-bars__seg--published"
              :style="{ flexGrow: g.published }"
            ></i>
            <i
              v-if="g.draft"
              class="cl-bars__seg cl-bars__seg--draft"
              :style="{ flexGrow: g.draft }"
            ></i>
          </div>

          <ul class="cl-rows">
            <li v-for="row in shown(g)" :key="row.id" class="cl-row">
              <router-link class="cl-row__title" :to="`/conclusions/${row.id}`" :title="row.title">
                <span class="cl-row__dot" :class="`is-${row.status}`" aria-hidden="true"></span>
                <span class="cl-row__text">{{ row.title }}</span>
              </router-link>
              <router-link
                class="cl-row__edit"
                :to="`/conclusions/edit/${row.id}`"
                :title="t('conclusionList.editTitle', { title: row.title })"
                :aria-label="t('conclusionList.editTitle', { title: row.title })"
              >
                <el-icon><Edit /></el-icon>
              </router-link>
            </li>
          </ul>

          <button
            v-if="hiddenCount(g) > 0"
            type="button"
            class="cl-more"
            @click="toggleGroup(g.key)"
          >
            {{
              isOpen(g.key)
                ? t('conclusionList.collapse')
                : t('conclusionList.more', { n: hiddenCount(g) })
            }}
            <el-icon class="cl-more__chev" :class="{ 'is-up': isOpen(g.key) }">
              <ArrowDown />
            </el-icon>
          </button>
        </section>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
// 结论列表：题库墙版式（对齐 QuestionBank.vue）——一屏看完整棵「知识点 → 结论」，
// 不再有右侧常驻详情栏。正文在 /conclusions/:id 独立页里读。
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  ArrowDown,
  Download,
  Edit,
  Expand,
  Fold,
  FolderOpened,
  Plus,
  Search
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getConclusions } from '../../api/conclusion'
import { getCategories } from '../../api/category'
import { PAPER_FONT } from '../../utils/printStyle'
import { formatDateTime, escapeHtml } from '../../utils/format'
import ListError from '../../components/ListError.vue'
import { useListQuery } from '../../composables/useListQuery'
import type { Conclusion, KnowledgeCategory, PageResult } from '../../types'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()

/** 分类卡内默认露几条，超出折叠 */
const GROUP_LIMIT = 5
/** 服务端单页上限；结论墙需要按分类一次看全，超过一页时由 fetchAll 取齐 */
const PAGE_SIZE = 100

const query = reactive({
  categoryId: undefined as number | undefined,
  status: '',
  keyword: ''
})

/* ══════════════ 分类名 ══════════════ */
const flatCategories = ref<{ value: number; label: string }[]>([])
const categoryNames = ref<Record<number, string>>({})

const buildFlat = (nodes: KnowledgeCategory[], prefix = '') => {
  for (const n of nodes) {
    const label = prefix ? `${prefix} / ${n.name}` : n.name
    flatCategories.value.push({ value: n.id, label })
    categoryNames.value[n.id] = n.name
    if (n.children?.length) buildFlat(n.children, label)
  }
}
const loadCategories = async () => {
  const tree = await getCategories()
  flatCategories.value = []
  categoryNames.value = {}
  buildFlat(tree)
}

const categoryName = (row?: Conclusion | null) => {
  if (!row) return t('page.uncategorized')
  if (row.category?.name) return row.category.name
  return row.categoryId != null
    ? categoryNames.value[row.categoryId] || t('page.uncategorized')
    : t('page.uncategorized')
}

/* ══════════════ 取数 ══════════════ */
// 后端单页最多 100 条，传更大的 pageSize 会被静默压回 100。
// 结论墙又不做分页（同一分类被切到两页就很难读），所以先取第一页拿 total，
// 再把剩余页并发取回拼成完整列表——筛选与导出都基于这份完整数据。
const fetchAll = async (params: Record<string, any>): Promise<PageResult<Conclusion>> => {
  const first = await getConclusions({ ...params, page: 1, pageSize: PAGE_SIZE }, { silent: true })
  const pages = Math.ceil((first.total || 0) / PAGE_SIZE)
  if (pages <= 1) return first
  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, i) =>
      getConclusions({ ...params, page: i + 2, pageSize: PAGE_SIZE }, { silent: true })
    )
  )
  return { ...first, list: [first.list, ...rest.map((r) => r.list)].flat() }
}

const { list, total, loading, error, run } = useListQuery<Conclusion>(
  () => {
    const params: Record<string, any> = {}
    if (query.categoryId != null) params.categoryId = query.categoryId
    if (query.status) params.status = query.status
    if (query.keyword) params.keyword = query.keyword
    return fetchAll(params)
  },
  {
    onLoaded: () => writeQuery(),
    // 首屏必须先 readQuery() 再取数（筛选条件在地址栏里）
    immediate: false
  }
)

const onFilter = () => run()

/* ══════════════ 按分类分组 ══════════════ */
type Group = {
  key: number
  name: string
  items: Conclusion[]
  published: number
  draft: number
}

const groups = computed<Group[]>(() => {
  const map = new Map<number, Group>()
  for (const row of list.value) {
    const key = row.categoryId ?? 0
    let g = map.get(key)
    if (!g) {
      g = { key, name: categoryName(row), items: [], published: 0, draft: 0 }
      map.set(key, g)
    }
    g.items.push(row)
    if (row.status === 'published') g.published++
    else g.draft++
  }
  // 条数降序：内容多的分类先出现；同数量按分类 id，保证顺序稳定
  return [...map.values()].sort((a, b) => b.items.length - a.items.length || a.key - b.key)
})

/** 卡内最近更新时间：一眼判断这块内容是不是「最近动过」 */
const latestTime = (g: Group) => {
  const times = g.items
    .map((r) => String(r.updatedAt || ''))
    .filter(Boolean)
    .sort()
  return times.length ? formatDateTime(times[times.length - 1]) : ''
}

const openGroups = ref<Set<number>>(new Set())
const isOpen = (key: number) => openGroups.value.has(key)
const toggleGroup = (key: number) => {
  const next = new Set(openGroups.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  openGroups.value = next
}
const allExpanded = computed(
  () => groups.value.length > 0 && groups.value.every((g) => isOpen(g.key))
)
const toggleAllGroups = () => {
  // 已全展开 → 全部收起；否则全部展开（与筛选行按钮的语义一致）
  openGroups.value = allExpanded.value ? new Set() : new Set(groups.value.map((g) => g.key))
}

/** 只剩一个知识点时不折叠：筛选后就该一次看全这一分类，「还有 N 条」只会多一次点击 */
const autoExpanded = computed(() => groups.value.length === 1)

const shown = (g: Group) =>
  isOpen(g.key) || autoExpanded.value ? g.items : g.items.slice(0, GROUP_LIMIT)
const hiddenCount = (g: Group) =>
  autoExpanded.value ? 0 : Math.max(0, g.items.length - GROUP_LIMIT)

/** 点分类名 = 只筛这个分类：比滚到卡底再筛更快，也顺带把 URL 记下来可分享 */
const filterByGroup = (g: Group) => {
  query.categoryId = g.key === 0 ? undefined : g.key
  onFilter()
}

/* ══════════════ 地址栏同步 ══════════════ */
const readQuery = () => {
  const q = route.query
  const cid = Number(q.categoryId)
  query.categoryId = Number.isInteger(cid) && cid > 0 ? cid : undefined
  query.status = q.status === 'draft' || q.status === 'published' ? String(q.status) : ''
  query.keyword = q.keyword ? String(q.keyword) : ''
}

const stableQuery = (o: Record<string, any>) =>
  Object.keys(o)
    .sort()
    .map((k) => `${k}=${o[k]}`)
    .join('&')
let lastSyncedQuery = ''

const writeQuery = () => {
  const q: Record<string, string> = {}
  if (query.categoryId != null) q.categoryId = String(query.categoryId)
  if (query.status) q.status = query.status
  if (query.keyword) q.keyword = query.keyword
  // 记下这次是自己写的，避免 watcher 当成外部跳转再拉一次
  lastSyncedQuery = stableQuery(q)
  router.replace({ path: route.path, query: q })
}

// 空状态要能区分「一条都没有」和「筛掉了」
const hasFilter = computed(
  () => query.categoryId != null || !!query.status || !!query.keyword.trim()
)

/* ══════════════ 操作 ══════════════ */
const goPublish = () => router.push('/conclusions/new')
const goCategories = () => router.push('/conclusions/categories')

// —— 导出 PDF：导出「当前筛选下的全部结论」——
// 「导出范围 = 当前筛选」比逐条勾选更好预期，勾选框也会把卡片行挤乱。
const doExport = async () => {
  const items = list.value
  if (!items.length) {
    ElMessage.warning(t('conclusionList.noExport'))
    return
  }
  let header = hasFilter.value
    ? t('conclusionList.exportHeaderScoped', { range: filterLabel() })
    : t('conclusionList.exportHeader')
  try {
    const { value } = await ElMessageBox.prompt(
      t('conclusionList.exportPrompt', { n: items.length }),
      t('conclusionList.exportTitle'),
      {
        inputValue: header,
        confirmButtonText: t('conclusionList.exportConfirm'),
        cancelButtonText: t('common.cancel'),
        inputPattern: /\S+/,
        inputErrorMessage: t('conclusionList.headerRequired')
      }
    )
    if (value) header = value.trim()
  } catch {
    return
  }
  // printHtml 会拉入 KaTeX；列表页本身不显示公式，等到真正导出再加载
  const { printHtml } = await import('../../utils/printHtml')
  const okFlag = printHtml(header, buildExportHtml(items, header))
  if (!okFlag) ElMessage.warning(t('conclusionList.popupBlocked'))
}

/** 导出抬头补一个「范围」后缀，省得打印出来分不清是哪次导的 */
const filterLabel = () => {
  const parts: string[] = []
  if (query.categoryId != null)
    parts.push(categoryNames.value[query.categoryId] || t('conclusionList.specifiedCategory'))
  if (query.status)
    parts.push(
      query.status === 'published' ? t('conclusionList.published') : t('conclusionList.draft')
    )
  if (query.keyword.trim())
    parts.push(t('conclusionList.includeKeyword', { kw: query.keyword.trim() }))
  return parts.join(' · ')
}

const buildExportHtml = (items: Conclusion[], header: string) => {
  const fs = 15
  const cards = items
    .map(
      (c, i) => `
      <div style="margin-bottom:16px;padding:14px 16px;border:1px solid #ddd;border-radius:6px;page-break-inside:avoid;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;gap:12px;">
          <span style="font-weight:700;font-size:${fs}px;">${i + 1}. ${escapeHtml(c.title)}</span>
          <span style="color:#888;font-size:${fs - 3}px;flex-shrink:0;">${escapeHtml(t('conclusionList.printCategory', { name: categoryName(c) }))}</span>
        </div>
        ${c.summary ? `<div style="color:#555;font-size:${fs - 1}px;margin-bottom:4px;">${escapeHtml(t('conclusionList.printSummary', { text: c.summary }))}</div>` : ''}
        <div style="border-top:1px dashed #ccc;margin:8px 0;"></div>
        <div style="font-size:${fs}px;">${c.content || ''}</div>
      </div>`
    )
    .join('')

  return `
    <div style="font-family:${PAPER_FONT};font-size:${fs}px;line-height:1.8;color:#222;padding:28px;max-width:800px;margin:0 auto;background:#fff;">
      <div style="text-align:center;border-bottom:2px solid #333;padding-bottom:12px;margin-bottom:18px;">
        <div style="font-size:${fs + 6}px;font-weight:700;">${escapeHtml(header)}</div>
        <div style="font-size:${fs - 3}px;color:#555;margin-top:6px;">${t('conclusionList.printTotal', { n: items.length })}</div>
      </div>
      ${cards}
    </div>`
}

onMounted(() => {
  readQuery()
  loadCategories()
  run()
})

// 前进/后退、或从别处带 query 跳进来时重新读取
watch(
  () => route.query,
  (q) => {
    if (stableQuery(q) === lastSyncedQuery) return
    readQuery()
    run()
  }
)
</script>

<style scoped>
.cl {
  display: flex;
  flex-direction: column;
}

/* 面板退成「底」，让分类卡成为页面上唯一的「面」——与题库页同一套层级逻辑 */
.cl-page.el-card,
.cl-page.el-card.is-always-shadow,
.cl-page.el-card.is-never-shadow {
  background-color: var(--paper);
  border: 0;
  box-shadow: none;
}
.cl-page {
  --el-card-padding: 16px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
  row-gap: 8px;
}
.title {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
  color: var(--ink);
  white-space: nowrap;
}
.count,
.cl-card__time {
  font-family: var(--font-data);
  font-size: var(--text-xs);
  color: var(--ink-soft);
  white-space: nowrap;
}
.spacer {
  flex: 1;
}

.filters {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

/* 整宽网格：与题库页同参。卡是「面」，灰台面是「底」。
   用 auto-fit 而不是 auto-fill：筛到只剩一个知识点时，空的列轨道要收掉，
   否则卡片仍只占一列（300px），右侧整片空白。 */
.cl-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
  /* 这里刻意用 start 而不是题库页的 stretch：
     题库卡内容量级相近，等高能对齐底边；结论卡是 1 条 vs 14 条这种量级差，
     拉伸会让「2 条结论」的卡底部空出一大块，比参差不齐更难看。 */
  align-items: start;
}

.cl-card {
  display: flex;
  flex-direction: column;
  padding: 16px 16px 14px;
  border: 1px solid var(--kb-card-edge);
  border-radius: var(--card-radius);
  background-color: var(--card-bg);
  box-shadow: var(--card-shadow);
  transition:
    border-color var(--dur-hover) var(--ease),
    box-shadow var(--dur-hover) var(--ease);
}
.cl-card:hover {
  border-color: var(--card-edge-strong);
  box-shadow: var(--card-shadow-hover);
}
/* 未分类是系统兜底桶：虚线边 + 浅底，一眼与真实知识点区分开 */
.cl-card--empty {
  background-color: var(--el-fill-color-lighter);
  border-style: dashed;
  box-shadow: none;
}

.cl-card__head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--hair);
}
.cl-card__name {
  min-width: 0;
  flex: 1;
  padding: 0;
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 600;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-bottom: 1px solid transparent;
  transition: border-color var(--dur) var(--ease);
}
.cl-card__name:hover {
  border-bottom-color: var(--moss);
}
/* 条数与题库卡同构：大号数字 + 小号单位，右对齐 */
.cl-card__count {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  flex-shrink: 0;
  color: var(--moss);
  white-space: nowrap;
}
.cl-card__count strong {
  font-family: var(--font-data);
  font-size: 19px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.cl-card__count span {
  font-family: var(--font-data);
  font-size: 11px;
}

.cl-card__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 12px;
  flex-wrap: wrap;
}
/* 「已发布」用墨色淡染而不是语义绿：
   本主题的强调色是近黑（--moss #111418），整页只有黑/灰两族；
   一个绿色圆点会成为页面上唯一的彩色，与题库页的观感对不上。
   发布与否的信息仍由文字承担，颜色只做强弱区分。 */
.cl-card__pill {
  font-size: var(--text-2xs);
  color: var(--moss-deep);
  background: var(--moss-soft);
  border-radius: var(--radius-pill);
  padding: 2px 7px;
}
.cl-card__pill--muted {
  color: var(--ink-soft);
  background: var(--surface-muted);
}

/* 发布/草稿构成条：4px 高、按条数分段的横条，与题库页的题型构成条同一形状。
   段间 2px 缝隙用卡片底色「露」出来，比 gap + 背景色更省一层绘制。 */
.cl-bars {
  display: flex;
  gap: 2px;
  height: 4px;
  margin-top: 8px;
}
.cl-bars__seg {
  flex-grow: 0;
  flex-shrink: 1;
  flex-basis: 0;
  /* 只有 1 条也要看得见，否则会被读成 0 */
  min-width: 3px;
  border-radius: var(--radius-pill);
}
.cl-bars__seg--published {
  background: var(--moss);
}
.cl-bars__seg--draft {
  background: var(--el-color-primary-light-7);
}

/* 结论行：卡宽时按 280px 一列自动折行（14 条分 4 列，卡不会再拉得又长又空），
   卡窄时仍是单列。外扩 8px 让悬停底色连成片，行内再补 8px，
   标题的 x 起点仍落在卡头的 16px。 */
.cl-rows {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 2px 4px;
  list-style: none;
  margin: 14px -8px 0;
  padding: 0;
}
.cl-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 0 8px;
  border-radius: var(--radius-xs);
  transition: background-color var(--dur) var(--ease);
}
.cl-row:hover {
  background: var(--surface-muted);
}
.cl-row__title {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  color: var(--ink);
  text-decoration: none;
  font-size: var(--text-sm);
}
.cl-row__text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cl-row:hover .cl-row__text {
  color: var(--moss-deep);
}
/* 状态点：发布与否是这批结论最要紧的信息，用 6px 圆点表达，
   不占行宽也不用再挤一个 tag（tag 会把标题挤成省略号） */
.cl-row__dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ink-disabled);
}
.cl-row__dot.is-published {
  background: var(--moss);
}
/* 编辑入口：悬停才出现，只改透明度不改宽度，标题的省略号位置不会跳 */
.cl-row__edit {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: var(--radius-sm);
  color: var(--ink-soft);
  opacity: 0;
  transition:
    opacity var(--dur) var(--ease),
    color var(--dur) var(--ease),
    background-color var(--dur) var(--ease);
}
.cl-row:hover .cl-row__edit,
.cl-row:focus-within .cl-row__edit {
  opacity: 1;
}
.cl-row__edit:hover {
  color: var(--moss-deep);
  background: var(--card-tile-bg-hover);
}
/* 键盘聚焦时给标题一个可见焦点环（链接默认环在深色下几乎看不见） */
.cl-row__title:focus-visible {
  outline: 2px solid var(--moss-ring);
  outline-offset: 2px;
  border-radius: var(--radius-xs);
}

/* 「还有 N 条 / 收起」：紧跟在列表最后一行下面，占满整行。
   同样用负 margin 外扩，让悬停底色通铺到卡片边缘。 */
.cl-more {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
  width: calc(100% + 32px);
  margin: 4px -16px -6px;
  padding: 8px 16px;
  background: none;
  border: 0;
  cursor: pointer;
  font-family: inherit;
  font-size: var(--text-sm);
  color: var(--moss);
  text-align: left;
  transition: background-color var(--dur) var(--ease);
}
.cl-more:hover {
  background: var(--moss-soft);
}
.cl-more__chev {
  font-size: var(--text-xs);
  transition: transform var(--dur) var(--ease);
}
.cl-more__chev.is-up {
  transform: rotate(180deg);
}

/* 触屏没有 hover：把只在悬停时出现的编辑入口按「弱可见」常驻 */
@media (hover: none) {
  .cl-row__edit {
    opacity: 0.45;
  }
}

@media (max-width: 640px) {
  .cl-card {
    padding: 14px 14px 12px;
  }
  .cl-row {
    min-height: 36px;
  }
  .cl-more {
    width: calc(100% + 28px);
    margin-left: -14px;
    margin-right: -14px;
    padding-left: 14px;
    padding-right: 14px;
  }
}

/* Element Plus 给相邻按钮加 12px margin-left，会和 flex gap 叠加导致间距不匀 */
.toolbar :deep(.el-button + .el-button),
.filters :deep(.el-button + .el-button) {
  margin-left: 0;
}
</style>
