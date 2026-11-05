<template>
  <el-tooltip :content="t('search.trigger')" placement="bottom" :show-after="400">
    <button type="button" class="gs-trigger" :aria-label="t('search.trigger')" @click="openSearch">
      <el-icon><Search /></el-icon>
    </button>
  </el-tooltip>

  <el-dialog
    v-model="visible"
    :title="t('search.title')"
    width="min(680px, 92vw)"
    top="8vh"
    append-to-body
    class="gs-dialog"
    @opened="focusInput"
    @closed="reset"
  >
    <el-input
      ref="inputRef"
      v-model="keyword"
      size="large"
      clearable
      :placeholder="t('search.placeholder')"
      :aria-label="t('search.placeholder')"
      @keydown="onInputKeydown"
    >
      <template #prefix>
        <el-icon><Search /></el-icon>
      </template>
    </el-input>

    <div class="gs-body">
      <p v-if="!keyword.trim()" class="gs-hint">{{ t('search.startHint') }}</p>
      <p v-else-if="loading" class="gs-hint">{{ t('search.loading') }}</p>
      <p v-else-if="error" class="gs-hint gs-hint--error">{{ t('search.error') }}</p>
      <p v-else-if="!flat.length" class="gs-hint">{{ t('search.empty') }}</p>
      <div v-else class="gs-groups">
        <section v-for="g in groups" :key="g.key" class="gs-group">
          <header class="gs-group__head">
            <span class="gs-group__label">{{ g.label }}</span>
            <span class="gs-group__count">{{ t('search.total', { n: g.total }) }}</span>
          </header>
          <button
            v-for="item in g.items"
            :key="item.key"
            type="button"
            class="gs-item"
            :class="{ 'is-active': activeIndex === item.index }"
            @mouseenter="activeIndex = item.index"
            @click="go(item)"
          >
            <span class="gs-item__title">{{ item.title }}</span>
            <span v-if="item.meta" class="gs-item__meta">{{ item.meta }}</span>
          </button>
          <router-link
            v-if="g.total > g.items.length"
            class="gs-all"
            :to="g.allTo"
            @click="close"
            >{{ t('search.viewAll', { n: g.total }) }}</router-link
          >
        </section>
      </div>
    </div>

    <div class="gs-foot">{{ t('search.footer') }}</div>
  </el-dialog>
</template>

<script setup lang="ts">
// 管理端全局搜索：学生 / 题目 / 结论 / 讲义 / 作业。只做只读检索，所有写操作仍在各自页面。
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Search } from '@element-plus/icons-vue'
import { getQuestions } from '../api/question'
import { getConclusions } from '../api/conclusion'
import { getHandouts } from '../api/handout'
import { getHomeworks } from '../api/homework'
import { getStudents } from '../api/student'
import { stripHtml, formatDate } from '../utils/format'
import { gradeLabel } from '../utils/i18nLabels'

const { t } = useI18n()
const router = useRouter()

const visible = ref(false)
const keyword = ref('')
const loading = ref(false)
const error = ref(false)
const activeIndex = ref(0)
const inputRef = ref<any>()

const PAGE = 4
const emptyPage = { list: [] as any[], total: 0 }
const emptyResults = () => ({
  students: [] as any[],
  sTotal: 0,
  questions: [] as any[],
  qTotal: 0,
  conclusions: [] as any[],
  cTotal: 0,
  handouts: [] as any[],
  hTotal: 0,
  homeworks: [] as any[],
  wTotal: 0
})
const results = ref(emptyResults())

let seq = 0
let timer: number | undefined

const kw = () => keyword.value.trim()
const enc = (v: string) => encodeURIComponent(v)

const run = async () => {
  const q = kw()
  if (!q) return
  const my = ++seq
  loading.value = true
  error.value = false
  try {
    const settled = await Promise.allSettled([
      getStudents({ keyword: q, page: 1, pageSize: PAGE }, { silent: true }),
      getQuestions({ keyword: q, page: 1, pageSize: PAGE }, { silent: true }),
      getConclusions({ keyword: q, page: 1, pageSize: PAGE }, { silent: true }),
      getHandouts({ keyword: q, page: 1, pageSize: PAGE }, { silent: true }),
      getHomeworks({ keyword: q, page: 1, pageSize: PAGE }, { silent: true })
    ])
    if (my !== seq) return
    if (settled.every((s) => s.status === 'rejected')) {
      error.value = true
      return
    }
    const val = (i: number) =>
      settled[i].status === 'fulfilled' ? (settled[i] as any).value : emptyPage
    const sRes = val(0)
    const qRes = val(1)
    const cRes = val(2)
    const hRes = val(3)
    const wRes = val(4)
    results.value = {
      students: sRes.list || [],
      sTotal: sRes.total || 0,
      questions: qRes.list || [],
      qTotal: qRes.total || 0,
      conclusions: cRes.list || [],
      cTotal: cRes.total || 0,
      handouts: hRes.list || [],
      hTotal: hRes.total || 0,
      homeworks: wRes.list || [],
      wTotal: wRes.total || 0
    }
    activeIndex.value = 0
  } catch {
    if (my === seq) error.value = true
  } finally {
    if (my === seq) loading.value = false
  }
}

const groups = computed(() => {
  let index = 0
  const q = kw()
  const make = (
    key: string,
    labelKey: string,
    rows: any[],
    total: number,
    map: (row: any) => { title: string; meta?: string; to: string },
    allTo: string
  ) => {
    const items = rows.map((row) => {
      const m = map(row)
      return { key: `${key}:${row.id}`, title: m.title, meta: m.meta, to: m.to, index: index++ }
    })
    return { key, label: t(labelKey), total, items, allTo }
  }
  return [
    make(
      'students',
      'search.groups.students',
      results.value.students,
      results.value.sTotal,
      (row) => ({
        title: row.name || t('search.untitled'),
        meta: row.grade ? gradeLabel(row.grade) : '',
        to: `/grades?keyword=${enc(row.name)}`
      }),
      `/students?keyword=${enc(q)}`
    ),
    make(
      'questions',
      'search.groups.questions',
      results.value.questions,
      results.value.qTotal,
      (row) => {
        const title = stripHtml(row.title).trim()
        return {
          title: title || t('search.untitled'),
          meta: [row.knowledgeTag, row.knowledgeSubTag].filter(Boolean).join(' · '),
          to: `/browse?keyword=${enc(title)}`
        }
      },
      `/browse?keyword=${enc(q)}`
    ),
    make(
      'conclusions',
      'search.groups.conclusions',
      results.value.conclusions,
      results.value.cTotal,
      (row) => ({
        title: row.title || t('search.untitled'),
        meta: row.category?.name || '',
        to: `/conclusions/${row.id}`
      }),
      `/conclusions?keyword=${enc(q)}`
    ),
    make(
      'handouts',
      'search.groups.handouts',
      results.value.handouts,
      results.value.hTotal,
      (row) => ({
        title: row.title || t('search.untitled'),
        meta: formatDate(row.updatedAt || row.createdAt),
        to: `/handouts/edit/${row.id}`
      }),
      `/handouts?keyword=${enc(q)}`
    ),
    make(
      'homeworks',
      'search.groups.homeworks',
      results.value.homeworks,
      results.value.wTotal,
      (row) => ({
        title: row.title || t('search.untitled'),
        meta: row.endAt ? formatDate(row.endAt) : t('search.noDeadline'),
        to: `/homeworks?keyword=${enc(stripHtml(row.title).trim())}`
      }),
      `/homeworks?keyword=${enc(q)}`
    )
  ].filter((g) => g.items.length)
})

const flat = computed(() => groups.value.flatMap((g) => g.items))

watch(keyword, () => {
  window.clearTimeout(timer)
  activeIndex.value = 0
  if (!kw()) {
    seq++
    loading.value = false
    error.value = false
    results.value = emptyResults()
    return
  }
  timer = window.setTimeout(run, 250)
})

const focusInput = () => nextTick(() => inputRef.value?.focus())

const openSearch = () => {
  visible.value = true
  nextTick(() => {
    focusInput()
    if (kw()) run()
  })
}

const close = () => {
  visible.value = false
}

const reset = () => {
  window.clearTimeout(timer)
  seq++
  keyword.value = ''
  loading.value = false
  error.value = false
  activeIndex.value = 0
  results.value = emptyResults()
}

const go = (item: { to: string }) => {
  close()
  router.push(item.to)
}

const onInputKeydown = (e: KeyboardEvent) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (flat.value.length) activeIndex.value = (activeIndex.value + 1) % flat.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (flat.value.length) {
      activeIndex.value = (activeIndex.value - 1 + flat.value.length) % flat.value.length
    }
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const item = flat.value[activeIndex.value]
    if (item) go(item)
  } else if (e.key === 'Escape') {
    close()
  }
}

const onGlobalKeydown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    if (visible.value) close()
    else openSearch()
  }
}

onMounted(() => window.addEventListener('keydown', onGlobalKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
  window.clearTimeout(timer)
})
</script>

<style scoped>
.gs-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--ink-soft);
  cursor: pointer;
  transition:
    color var(--dur) var(--ease),
    background-color var(--dur) var(--ease);
}
.gs-trigger:hover {
  color: var(--ink);
  background: var(--surface-muted);
}
.gs-trigger:focus-visible {
  outline: 2px solid var(--moss-ring);
  outline-offset: 2px;
}

.gs-body {
  margin-top: 14px;
  max-height: 56vh;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.gs-hint {
  margin: 26px 0;
  text-align: center;
  font-size: var(--text-sm);
  color: var(--ink-soft);
}
.gs-hint--error {
  color: var(--danger);
}
.gs-groups {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.gs-group__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 0 8px 4px;
}
.gs-group__label {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--ink-soft);
}
.gs-group__count {
  font-family: var(--font-data);
  font-size: var(--text-2xs);
  color: var(--ink-soft);
}
.gs-item {
  display: flex;
  align-items: baseline;
  gap: 12px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  color: inherit;
  text-align: left;
  font: inherit;
  cursor: pointer;
}
.gs-item:hover,
.gs-item.is-active {
  background: var(--moss-soft);
}
.gs-item:focus-visible {
  outline: 2px solid var(--moss-ring);
  outline-offset: -2px;
}
.gs-item__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-sm);
  color: var(--ink);
}
.gs-item__meta {
  flex-shrink: 0;
  max-width: 45%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-xs);
  color: var(--ink-soft);
}
.gs-all {
  display: inline-block;
  margin: 2px 0 0 10px;
  font-size: var(--text-xs);
  color: var(--moss-deep);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.gs-foot {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--hair);
  font-size: var(--text-xs);
  color: var(--ink-soft);
  text-align: right;
}
</style>
