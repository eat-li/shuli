<template>
  <div class="handout">
    <!-- 顶栏：历史讲义 / 新建 / 标题 / 保存 / 导出 -->
    <div class="topbar">
      <div class="topbar-side">
        <el-select
          v-model="savedId"
          class="saved-select"
          :placeholder="t('handoutBuilder.savedPlaceholder')"
          clearable
          size="default"
          @change="onPickSaved"
        >
          <el-option v-for="h in savedList" :key="h.id" :label="h.title" :value="h.id">
            <span class="saved-option">{{ h.title }}</span>
            <span class="saved-option__date">{{ formatDate(h.updatedAt || h.createdAt) }}</span>
          </el-option>
        </el-select>
        <el-button @click="resetBuilder">{{ t('handoutBuilder.new') }}</el-button>
        <el-button v-if="editingId" type="danger" plain :icon="Delete" @click="removeSaved">{{
          t('common.delete')
        }}</el-button>
      </div>
      <input
        v-model="title"
        class="title-input"
        type="text"
        name="handout-title"
        :aria-label="t('handoutBuilder.titleAria')"
        autocomplete="off"
        :placeholder="
          editingId
            ? t('handoutBuilder.titlePlaceholderEdit')
            : t('handoutBuilder.titlePlaceholderNew')
        "
        maxlength="200"
        @input="touch"
      />
      <div class="topbar-side topbar-side--right">
        <span v-if="dirty" class="save-state save-state--dirty">{{
          draftSavedAt ? t('draft.saved') : t('handoutBuilder.unsaved')
        }}</span>
        <span v-else-if="editingId" class="save-state">{{ t('handoutBuilder.savedState') }}</span>
        <el-button type="primary" :loading="saving" @click="save">{{
          t('handoutBuilder.save')
        }}</el-button>
        <el-button type="primary" plain :icon="Download" @click="doExport">{{
          t('handoutBuilder.exportPdf')
        }}</el-button>
      </div>
    </div>

    <div class="split">
      <!-- 左栏：素材池。点一行＝把内容插入到右侧光标处（插入后即可自由编辑） -->
      <aside class="left">
        <div class="pool-tip">
          <span class="pool-tip__main">{{ t('handoutBuilder.poolTip') }}</span>
          <label class="pool-tip__opt">
            <el-switch v-model="insertWithAnswer" size="small" />{{
              t('handoutBuilder.withAnswer')
            }}
          </label>
        </div>
        <div class="pool">
          <el-tabs v-model="poolTab" class="pool-tabs">
            <!-- 题目素材 -->
            <el-tab-pane :label="t('handoutBuilder.tabQuestions')" name="question">
              <div class="pool-filters">
                <el-input
                  v-model="qKeyword"
                  :placeholder="t('handoutBuilder.qSearchPlaceholder')"
                  clearable
                  @keyup.enter="qSearch"
                  @clear="qSearch"
                />
                <el-select
                  v-model="qType"
                  :placeholder="t('handoutBuilder.typeFilter')"
                  clearable
                  @change="qSearch"
                >
                  <el-option :label="t('questionType.choice')" value="choice" />
                  <el-option :label="t('questionType.fill')" value="fill" />
                  <el-option :label="t('questionType.solve')" value="solve" />
                </el-select>
                <el-select
                  v-model="qTag"
                  :placeholder="t('handoutBuilder.tagFilter')"
                  clearable
                  filterable
                  @change="qSearch"
                >
                  <el-option v-for="t in tagOptions" :key="t" :label="t" :value="t" />
                </el-select>
              </div>
              <div v-loading="qLoading" class="pool-list">
                <ListError v-if="qError" :message="qError" @retry="loadQuestionPool" />
                <el-empty
                  v-else-if="!qLoading && !qRows.length"
                  :description="t('handoutBuilder.noQuestions')"
                />
                <button
                  v-for="row in qRows"
                  :key="row.id"
                  type="button"
                  class="pool-row"
                  @click="insertQuestion(row)"
                >
                  <RichContent class="pool-row__title" :html="row.title || ''" />
                  <div class="pool-row__meta">
                    <span>{{ typeLabel(row.type) }}</span>
                    <span class="stars">{{ '★'.repeat(row.difficulty || 0) || '—' }}</span>
                    <span v-if="row.knowledgeTag" class="kp">{{
                      row.knowledgeTag + (row.knowledgeSubTag ? ' › ' + row.knowledgeSubTag : '')
                    }}</span>
                    <span class="pool-row__action">{{ t('handoutBuilder.insert') }}</span>
                  </div>
                </button>
              </div>
              <div v-if="qTotal > qPageSize" class="pool-pager">
                <el-pagination
                  v-model:current-page="qPage"
                  :page-size="qPageSize"
                  :total="qTotal"
                  layout="prev, pager, next"
                  small
                  background
                  @current-change="loadQuestionPool"
                />
              </div>
            </el-tab-pane>

            <!-- 结论素材 -->
            <el-tab-pane :label="t('handoutBuilder.tabConclusions')" name="conclusion">
              <div class="pool-filters">
                <el-input
                  v-model="cKeyword"
                  :placeholder="t('handoutBuilder.cSearchPlaceholder')"
                  clearable
                  @keyup.enter="cSearch"
                  @clear="cSearch"
                />
                <el-select
                  v-model="cCategory"
                  :placeholder="t('handoutBuilder.categoryFilter')"
                  clearable
                  filterable
                  @change="cSearch"
                >
                  <el-option
                    v-for="c in flatCategories"
                    :key="c.id"
                    :label="c.label"
                    :value="c.id"
                  />
                </el-select>
              </div>
              <div v-loading="cLoading" class="pool-list">
                <ListError v-if="cError" :message="cError" @retry="loadConclusionPool" />
                <el-empty
                  v-else-if="!cLoading && !cRows.length"
                  :description="t('handoutBuilder.noConclusions')"
                />
                <button
                  v-for="row in cRows"
                  :key="row.id"
                  type="button"
                  class="pool-row"
                  @click="insertConclusion(row)"
                >
                  <div class="pool-row__name">{{ row.title }}</div>
                  <div class="pool-row__meta">
                    <span class="kp">{{ row.category?.name || t('page.uncategorized') }}</span>
                    <span class="pool-row__action">{{ t('handoutBuilder.insert') }}</span>
                  </div>
                </button>
              </div>
              <div v-if="cTotal > cPageSize" class="pool-pager">
                <el-pagination
                  v-model:current-page="cPage"
                  :page-size="cPageSize"
                  :total="cTotal"
                  layout="prev, pager, next"
                  small
                  background
                  @current-change="loadConclusionPool"
                />
              </div>
            </el-tab-pane>

            <!-- 知识点素材（整块插入：标题 + 下属结论） -->
            <el-tab-pane :label="t('handoutBuilder.tabKnowledge')" name="knowledge">
              <p class="kp-hint">{{ t('handoutBuilder.kpHint') }}</p>
              <div v-loading="kLoading" class="pool-list">
                <el-empty
                  v-if="!kLoading && !flatCategories.length"
                  :description="t('handoutBuilder.noCategories')"
                />
                <button
                  v-for="c in flatCategories"
                  :key="c.id"
                  type="button"
                  class="pool-row pool-row--kp"
                  :class="{ 'is-empty': !kpCount[c.id] }"
                  :disabled="!kpCount[c.id]"
                  :style="{ paddingLeft: 10 + c.level * 18 + 'px' }"
                  @click="insertKnowledge(c)"
                >
                  <div class="pool-row__name">
                    <span v-if="c.level > 0" class="kp-tree-mark">└</span>{{ c.name }}
                    <span class="kp-count">{{
                      t('handoutBuilder.conclusionCount', { n: kpCount[c.id] || 0 })
                    }}</span>
                  </div>
                  <span v-if="kpCount[c.id]" class="pool-row__action">{{
                    t('handoutBuilder.insert')
                  }}</span>
                </button>
              </div>
            </el-tab-pane>
          </el-tabs>
        </div>
      </aside>

      <!-- 右栏：可编辑的「纸张」。所见即所得——这里排版什么样，导出就什么样 -->
      <section class="right">
        <div class="options-bar">
          <span class="opt-group">
            {{ t('handoutBuilder.fontSize') }}
            <el-radio-group v-model="layout.fontSize" size="small" @change="touch">
              <el-radio-button value="14">{{ t('handoutBuilder.fontSmall') }}</el-radio-button>
              <el-radio-button value="16">{{ t('handoutBuilder.fontMedium') }}</el-radio-button>
              <el-radio-button value="18">{{ t('handoutBuilder.fontLarge') }}</el-radio-button>
            </el-radio-group>
          </span>
          <span class="opt-group">
            {{ t('handoutBuilder.lineHeight') }}
            <el-radio-group v-model="layout.lineHeight" size="small" @change="touch">
              <el-radio-button value="1.6">{{ t('handoutBuilder.lineTight') }}</el-radio-button>
              <el-radio-button value="1.8">{{ t('handoutBuilder.lineNormal') }}</el-radio-button>
              <el-radio-button value="2.2">{{ t('handoutBuilder.lineLoose') }}</el-radio-button>
            </el-radio-group>
          </span>
          <span class="opt-group">
            {{ t('handoutBuilder.paperWidth') }}
            <el-radio-group v-model="layout.contentWidth" size="small" @change="touch">
              <el-radio-button value="160">{{ t('handoutBuilder.widthNarrow') }}</el-radio-button>
              <el-radio-button value="180">{{ t('handoutBuilder.widthStandard') }}</el-radio-button>
              <el-radio-button value="full">{{ t('handoutBuilder.widthFull') }}</el-radio-button>
            </el-radio-group>
          </span>
          <el-tooltip :content="t('handoutBuilder.optionsHint')" placement="top" :show-after="400">
            <span class="opt-hint">{{ t('handoutBuilder.optionsHintLabel') }}</span>
          </el-tooltip>
        </div>

        <div class="paper-scroll">
          <div
            class="paper-doc"
            :style="{
              maxWidth: paperWidthPx + 'px',
              fontSize: layout.fontSize + 'px',
              lineHeight: layout.lineHeight
            }"
          >
            <RichEditor
              ref="richEditorRef"
              :model-value="content"
              @update:model-value="onContentUpdate"
            />
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Download, Delete } from '@element-plus/icons-vue'
import {
  getHandouts,
  getHandout,
  getHandoutItems,
  createHandout,
  updateHandout,
  deleteHandout
} from '../../api/handout'
import type { Handout, KnowledgeBlock } from '../../api/handout'
import { getQuestions, getQuestionTags } from '../../api/question'
import { getConclusions, getConclusionCategoryCounts } from '../../api/conclusion'
import { getCategories } from '../../api/category'
import RichEditor from '../../components/RichEditor.vue'
import RichContent from '../../components/RichContent.vue'
import ListError from '../../components/ListError.vue'
import { printHtml, escapeHtml, PAPER_FONT } from '../../utils/printHtml'
import { renderMathInHtml } from '../../utils/mathRender'
import { sanitizeHtml } from '../../utils/sanitizeHtml'
import { useLocalDraft } from '../../composables/useLocalDraft'
import type { Question, Conclusion, KnowledgeCategory } from '../../types'

const route = useRoute()
const router = useRouter()
const { t, te } = useI18n()

const typeLabel = (type: string) =>
  te(`questionType.${type}`) ? t(`questionType.${type}`) : type || ''

/* ===================== 文档状态 ===================== */
const title = ref('')
// 讲义正文（富文本 HTML）。这是权威内容——插入的题目、图片、表格、公式都在里面，
// 全部可再编辑。改造前的旧讲义没有 content，打开时用 items 惰性转换一次。
const content = ref('')
const editingId = ref<number | null>(null)
const saving = ref(false)
const richEditorRef = ref<InstanceType<typeof RichEditor> | null>(null)

// 未保存标记：编辑正文/标题/排版都会置脏，保存或加载后清零
const dirty = ref(false)
const touch = () => {
  dirty.value = true
}
// 加载文档时 RichEditor 会把内容回吐一次 v-model，那不是用户编辑，不能置脏
let applyingDoc = false
const onContentUpdate = (v: string) => {
  content.value = v
  if (!applyingDoc) touch()
}
const applyDoc = async (html: string) => {
  applyingDoc = true
  content.value = html
  await nextTick()
  applyingDoc = false
}

// —— 本地草稿：标题 + 正文 HTML；切换/新建/删除时由各入口 stop/start ——
type HandoutDraft = { title: string; content: string }
const {
  savedAt: draftSavedAt,
  peek: peekDraft,
  clear: clearDraft,
  start: startDraft,
  stop: stopDraft,
  restore: applyDraft
} = useLocalDraft<HandoutDraft>({
  key: () => (editingId.value ? `handout:${editingId.value}` : 'handout:new'),
  snapshot: () => ({ title: title.value, content: content.value }),
  apply: async (data) => {
    title.value = data.title || ''
    await applyDoc(data.content || '')
    dirty.value = true
  },
  isEmpty: (d) =>
    !d.title.trim() &&
    !(d.content || '').replace(/<[^>]*>/g, '').trim() &&
    !/<(img|table)\b/i.test(d.content || '')
})

const restoreDraftIfAny = async () => {
  const rec = peekDraft()
  if (!rec) return
  try {
    await ElMessageBox.confirm(t('draft.restoreConfirm'), t('draft.restoreTitle'), {
      type: 'info',
      confirmButtonText: t('draft.restore'),
      cancelButtonText: t('draft.discard')
    })
    await applyDraft(rec)
  } catch {
    clearDraft()
  }
}

/* ===================== 插入素材 ===================== */
// 插入时是否带上答案与解析（讲义给学生做时通常不带，讲解版才带）
const insertWithAnswer = ref(false)

// 新插入题目的编号：数一遍文档里已有的「N.」取最大值 +1。
// 编号写成纯文本（不是标记），改起来自由；顺序调了手工改数字即可。
const nextQuestionNo = () => {
  const text = richEditorRef.value?.getText?.() || ''
  let max = 0
  for (const m of text.matchAll(/^\s*(\d+)\s*[.．、]/gm)) {
    const n = Number(m[1])
    if (n > max) max = n
  }
  return max + 1
}

const doInsert = (html: string, okTip: string) => {
  const ok = richEditorRef.value?.insertContent?.(html)
  if (!ok) {
    ElMessage.warning(t('handoutBuilder.editorNotReady'))
    return false
  }
  ElMessage.success(okTip)
  return true
}

// 题目 → 可编辑副本：题干、选项、解析都变成普通段落，想删想改都行
const buildQuestionHtml = (q: Question, no: number, withAnswer: boolean, withMeta = false) => {
  const parts: string[] = []
  const meta =
    withMeta && (q.knowledgeTag || q.type)
      ? `<span style="color:#8a8f95;font-size:13px;">【${escapeHtml(typeLabel(q.type))}${
          q.knowledgeTag
            ? '·' +
              escapeHtml(q.knowledgeTag) +
              (q.knowledgeSubTag ? '›' + escapeHtml(q.knowledgeSubTag) : '')
            : ''
        }】</span> `
      : ''
  parts.push(`<p><strong>${no}.</strong> ${meta}${String(q.title ?? '')}</p>`)
  const opts = Array.isArray(q.options) ? q.options : []
  if (opts.length) {
    const lines = opts
      .map((o: any, j: number) => {
        const text =
          typeof o === 'string'
            ? o
            : o && typeof o === 'object' && 'text' in o
              ? o.text
              : JSON.stringify(o)
        return `${String.fromCharCode(65 + j)}. ${escapeHtml(text)}`
      })
      .join('<br>')
    parts.push(`<p>${lines}</p>`)
  }
  if (q.body) parts.push(`<p>${String(q.body)}</p>`)
  if (withAnswer && q.answer) {
    parts.push(`<p><strong>【答案与解析】</strong>${String(q.answer)}</p>`)
  }
  return parts.join('')
}

const buildConclusionHtml = (c: Conclusion, asHeading = true) => {
  const head = asHeading ? `<p><strong>${escapeHtml(c.title)}</strong></p>` : ''
  return `${head}${String(c.content ?? '')}`
}

const buildKnowledgeHtml = (name: string, conclusions: Conclusion[]) => {
  const head = `<p><strong>知识点：${escapeHtml(name)}</strong></p>`
  const body = conclusions.map((c) => buildConclusionHtml(c)).join('')
  return head + (body || '<p>（该分类下暂无结论）</p>')
}

const insertQuestion = (row: Question) => {
  const no = nextQuestionNo()
  doInsert(
    buildQuestionHtml(row, no, insertWithAnswer.value, true),
    t('handoutBuilder.insertedQuestion', { n: no })
  )
}

const insertConclusion = (row: Conclusion) => {
  doInsert(buildConclusionHtml(row), t('handoutBuilder.insertedConclusion'))
}

const insertKnowledge = async (c: FlatCategory) => {
  if (!kpCount.value[c.id]) {
    ElMessage.warning(t('handoutBuilder.knowledgeNoConclusions'))
    return
  }
  kLoading.value = true
  try {
    // 取该分类 + 全部后代分类下的结论。翻页拉取直到取完，
    // 避免结论数超过单页上限时只带入前 100 条。
    const ids: number[] = []
    const collect = (nodes: KnowledgeCategory[], within: boolean) => {
      for (const n of nodes) {
        const hit = within || n.id === c.id
        if (hit) ids.push(n.id)
        if (n.children?.length) collect(n.children, hit)
      }
    }
    collect(categories.value, false)

    const all: Conclusion[] = []
    for (const cid of ids) {
      let p = 1
      for (;;) {
        const res = await getConclusions({ categoryId: cid, page: p, pageSize: 100 })
        all.push(...res.list)
        if (all.length >= res.total || !res.list.length) break
        p += 1
      }
    }
    doInsert(
      buildKnowledgeHtml(c.name, all),
      t('handoutBuilder.insertedKnowledge', { name: c.name })
    )
  } finally {
    kLoading.value = false
  }
}

/* ===================== 素材池：题目 ===================== */
const poolTab = ref('question')
const qKeyword = ref('')
const qType = ref('')
const qTag = ref('')
const tagOptions = ref<string[]>([])
const qRows = ref<Question[]>([])
const qLoading = ref(false)
const qError = ref('')
const qPage = ref(1)
const qPageSize = 8
const qTotal = ref(0)

const loadQuestionPool = async () => {
  qLoading.value = true
  qError.value = ''
  try {
    const params: any = {
      keyword: qKeyword.value,
      type: qType.value,
      page: qPage.value,
      pageSize: qPageSize
    }
    if (qTag.value) params.knowledgeTag = qTag.value
    const res = await getQuestions(params, { silent: true })
    qRows.value = res.list
    qTotal.value = res.total
  } catch (e: any) {
    // 失败不能显示「没有符合条件的题目」——会让人以为题库里真没有
    qError.value = e?.message || t('handoutBuilder.loadQuestionsError')
    qRows.value = []
    qTotal.value = 0
  } finally {
    qLoading.value = false
  }
}
const qSearch = () => {
  qPage.value = 1
  loadQuestionPool()
}

/* ===================== 素材池：结论 ===================== */
const cKeyword = ref('')
const cCategory = ref<number | null>(null)
const cRows = ref<Conclusion[]>([])
const cLoading = ref(false)
const cError = ref('')
const cPage = ref(1)
const cPageSize = 8
const cTotal = ref(0)

const loadConclusionPool = async () => {
  cLoading.value = true
  cError.value = ''
  try {
    const res = await getConclusions(
      {
        keyword: cKeyword.value || undefined,
        categoryId: cCategory.value || undefined,
        page: cPage.value,
        pageSize: cPageSize
      },
      { silent: true }
    )
    cRows.value = res.list
    cTotal.value = res.total
  } catch (e: any) {
    cError.value = e?.message || t('handoutBuilder.loadConclusionsError')
    cRows.value = []
    cTotal.value = 0
  } finally {
    cLoading.value = false
  }
}
const cSearch = () => {
  cPage.value = 1
  loadConclusionPool()
}

/* ===================== 素材池：知识点 ===================== */
const categories = ref<KnowledgeCategory[]>([])
const kLoading = ref(false)

interface FlatCategory {
  id: number
  name: string
  label: string
  level: number
}
const flatCategories = ref<FlatCategory[]>([])

const flattenCategories = (nodes: KnowledgeCategory[], level = 0, parentLabel = '') => {
  const out: FlatCategory[] = []
  for (const n of nodes) {
    const label = parentLabel ? `${parentLabel} / ${n.name}` : n.name
    out.push({ id: n.id, name: n.name, label, level })
    if (n.children?.length) out.push(...flattenCategories(n.children, level + 1, label))
  }
  return out
}

// 知识点池里每个分类下面有多少条结论（含子分类），用来判断「能不能插入」
const kpCount = ref<Record<number, number>>({})

const loadCategories = async () => {
  kLoading.value = true
  try {
    categories.value = await getCategories()
    flatCategories.value = flattenCategories(categories.value)
    await loadKpCounts()
  } finally {
    kLoading.value = false
  }
}

// 每个分类下面有多少条结论（含子分类），用来判断「能不能插入」以及提示条数。
// 一次请求拿全部计数（后端 GROUP BY），不再逐分类请求——
// 93 个分类逐个请求会让打开页面变成 90+ 次往返，还会撞限流。
const loadKpCounts = async () => {
  let counts: Record<string, number> = {}
  try {
    counts = await getConclusionCategoryCounts()
  } catch {
    counts = {}
  }
  // 父分类的总数 = 自身 + 后代（用已拍平的层级关系累加）
  const withDescendants: Record<number, number> = {}
  for (const c of flatCategories.value) withDescendants[c.id] = Number(counts[c.id]) || 0
  for (const c of [...flatCategories.value].reverse()) {
    if (c.level === 0) continue
    const parent = flatCategories.value
      .slice(0, flatCategories.value.indexOf(c))
      .reverse()
      .find((p) => p.level === c.level - 1)
    if (parent)
      withDescendants[parent.id] = (withDescendants[parent.id] || 0) + (withDescendants[c.id] || 0)
  }
  kpCount.value = withDescendants
}

/* ===================== 页面级排版 ===================== */
// 只保留三项整篇设置：正文的字号/字号大小由编辑器工具栏逐段控制。
// 纸张宽度按 96dpi 换算（1mm ≈ 3.7795px），预览与导出同宽，所见即所得。
const layout = reactive({ fontSize: '16', lineHeight: '1.8', contentWidth: '180' })
const paperWidthPx = computed(() =>
  layout.contentWidth === 'full' ? 1123 : Math.round(Number(layout.contentWidth) * 3.7795) + 56
)

/* ===================== 导出 PDF ===================== */
const buildPrintHtml = () => {
  const fs = Number(layout.fontSize)
  const header = `
    <div style="text-align:center;border-bottom:2px solid #333;padding-bottom:12px;margin-bottom:18px;">
      <div style="font-size:${fs + 6}px;font-weight:700;">${escapeHtml(title.value || t('handoutBuilder.defaultTitle'))}</div>
    </div>`
  const body = sanitizeHtml(content.value || '')
  return `<div style="font-family:${PAPER_FONT};font-size:${fs}px;line-height:${layout.lineHeight};color:#222;padding:28px;max-width:${paperWidthPx.value}px;margin:0 auto;background:#fff;">${header}${body}</div>`
}

const doExport = () => {
  if (!hasContent.value) {
    ElMessage.warning(t('handoutBuilder.emptyHandout'))
    return
  }
  const okFlag = printHtml(
    title.value || t('handoutBuilder.defaultTitle'),
    renderMathInHtml(sanitizeHtml(buildPrintHtml()))
  )
  if (!okFlag) ElMessage.warning(t('conclusionList.popupBlocked'))
}

// 空文档判定：Tiptap 空内容是 <p></p>，去掉标签后没有可见字符才算空
const hasContent = computed(() => (content.value || '').replace(/<[^>]*>/g, '').trim().length > 0)

// 日期显示统一走 utils/format，不在页面里另写一份（D10）
import { formatDate } from '../../utils/format'

/* ===================== 保存 / 加载 / 删除 ===================== */
const savedList = ref<Handout[]>([])
const savedId = ref<number | null>(null)

const loadSavedList = async () => {
  const res = await getHandouts({ page: 1, pageSize: 100 })
  savedList.value = res.list
}

const save = async () => {
  if (!title.value.trim()) {
    ElMessage.warning(t('handoutBuilder.titleRequired'))
    return
  }
  if (!hasContent.value) {
    ElMessage.warning(t('handoutBuilder.emptyHandoutSave'))
    return
  }
  saving.value = true
  try {
    // 不写 items：文档模型下它是旧结构的残留，继续写只会得到一份会过期的索引
    const payload = {
      title: title.value.trim(),
      content: content.value,
      status: 'published' as const
    }
    if (editingId.value) {
      await updateHandout(editingId.value, payload)
      clearDraft()
      ElMessage.success(t('handoutBuilder.updated'))
    } else {
      const created = await createHandout(payload)
      // 新建的草稿键是 handout:new，保存成功后要清掉，再切到 id 键
      clearDraft('handout:new')
      editingId.value = created.id
      clearDraft()
      ElMessage.success(t('handoutBuilder.saved'))
    }
    savedId.value = editingId.value
    dirty.value = false
    startDraft()
    syncUrl(editingId.value)
    await loadSavedList()
  } finally {
    saving.value = false
  }
}

// 地址栏始终反映当前编辑的讲义，刷新/转发都能回到同一份。
// 新建态在 /handouts/new，已保存的在 /handouts/edit/:id（id 写进路径而不是 query）。
const syncUrl = (id: number | null) => {
  const current = Number(route.params.id) || null
  if (current === id) return
  if (id) router.replace(`/handouts/edit/${id}`)
  else router.replace('/handouts/new')
}

// 旧讲义（只有 items 引用数组）自动展开成文档内容：
// 题目按顺序编号、结论与知识点块原样展开。原始 items 不动，作为备份留在库里。
const convertLegacyItems = async (id: number): Promise<{ html: string; items: number }> => {
  const res = await getHandoutItems(id)
  const parts: string[] = []
  let qNo = 0
  for (const it of res.items) {
    if (it.type === 'question') {
      const q = res.questions.find((x) => x.id === it.id)
      if (q) {
        qNo += 1
        parts.push(buildQuestionHtml(q, qNo, false, true))
      }
    } else if (it.type === 'conclusion') {
      const c = res.conclusions.find((x) => x.id === it.id)
      if (c) parts.push(buildConclusionHtml(c))
    } else {
      const k = (res.knowledges as KnowledgeBlock[]).find((x) => x.id === it.id)
      if (k) parts.push(buildKnowledgeHtml(k.name, k.conclusions))
    }
  }
  return { html: parts.join(''), items: res.items.length }
}

const loadHandout = async (id: number) => {
  // 切记录前先停掉自动保存，避免把上一份内容写到新 id 的草稿键
  stopDraft()
  const detail = await getHandout(id)
  editingId.value = detail.id
  title.value = detail.title

  if (detail.content && detail.content.trim()) {
    await applyDoc(detail.content)
  } else if ((detail.items || []).length) {
    // 改造前保存的讲义：惰性转换一次，保存后即以文档为准
    const { html, items } = await convertLegacyItems(id)
    await applyDoc(html)
    ElMessage.info(t('handoutBuilder.legacyConverted', { n: items }))
  } else {
    await applyDoc('')
  }

  savedId.value = detail.id
  dirty.value = false
  syncUrl(detail.id)
}

const onPickSaved = async (id: number | '') => {
  if (!id) {
    if (editingId.value) await resetBuilder()
    return
  }
  if (!(await confirmDiscard(t('handoutBuilder.actionSwitch')))) {
    savedId.value = editingId.value
    return
  }
  try {
    await loadHandout(Number(id))
    await restoreDraftIfAny()
    startDraft()
  } catch {
    ElMessage.warning(t('handoutBuilder.notFound'))
    await resetBuilder()
  }
}

// 有未保存修改时先问一句，避免辛苦排的讲义被一次误点清掉
const confirmDiscard = async (action: string): Promise<boolean> => {
  if (!dirty.value) return true
  try {
    await ElMessageBox.confirm(
      t('handoutBuilder.unsavedConfirm', { action }),
      t('handoutBuilder.unsavedTitle'),
      {
        type: 'warning',
        confirmButtonText: t('handoutBuilder.discard'),
        cancelButtonText: t('handoutBuilder.keepEditing')
      }
    )
    clearDraft()
    return true
  } catch {
    return false
  }
}

const resetBuilder = async () => {
  if (!(await confirmDiscard(t('handoutBuilder.actionNew')))) return
  stopDraft()
  editingId.value = null
  title.value = ''
  await applyDoc('')
  savedId.value = null
  dirty.value = false
  await restoreDraftIfAny()
  startDraft()
  syncUrl(null)
}

const removeSaved = async () => {
  if (!editingId.value) return
  const removedId = editingId.value
  try {
    await ElMessageBox.confirm(
      t('handoutBuilder.deleteConfirm', { title: title.value }),
      t('handoutBuilder.deleteTitle'),
      {
        type: 'warning',
        confirmButtonText: t('common.delete'),
        cancelButtonText: t('common.cancel')
      }
    )
  } catch {
    return
  }
  stopDraft()
  await deleteHandout(removedId)
  clearDraft(`handout:${removedId}`)
  ElMessage.success(t('common.deleteSuccess'))
  editingId.value = null
  title.value = ''
  await applyDoc('')
  savedId.value = null
  dirty.value = false
  startDraft()
  syncUrl(null)
  await loadSavedList()
}

/* ===================== 离开保护 ===================== */
onBeforeRouteLeave(async () => await confirmDiscard(t('handoutBuilder.actionLeave')))
const onBeforeUnload = (e: BeforeUnloadEvent) => {
  if (!dirty.value) return
  e.preventDefault()
  e.returnValue = ''
}

onMounted(async () => {
  window.addEventListener('beforeunload', onBeforeUnload)
  await Promise.all([loadSavedList(), loadCategories(), loadQuestionPool(), loadConclusionPool()])
  tagOptions.value = await getQuestionTags().catch(() => [])

  const id = Number(route.params.id)
  if (Number.isInteger(id) && id > 0) {
    try {
      await loadHandout(id)
    } catch {
      await applyDoc('')
      ElMessage.warning(t('handoutBuilder.notFound'))
    }
  } else {
    await applyDoc('')
  }

  await restoreDraftIfAny()
  startDraft()
})

onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))
</script>

<style scoped>
.handout {
  display: flex;
  flex-direction: column;
  /* 顶栏(68) + 上边距(14) + 主区上下内边距(54) ≈ 136，留 6px 缓冲 */
  height: calc(100vh - 142px);
  min-height: 540px;
}

/* —— 顶栏 —— */
.topbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 8px 14px;
  margin-bottom: 10px;
  border: 1px solid var(--edge);
  border-radius: var(--radius-sm);
  background: var(--card-tile-bg);
}
.topbar-side {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.topbar-side--right {
  margin-left: auto;
}
.saved-select {
  width: 220px;
}
.saved-option {
  margin-right: 12px;
}
.saved-option__date {
  float: right;
  color: var(--ink-soft);
  font-size: 12px;
}
.title-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 700;
  color: var(--ink);
  letter-spacing: 0.02em;
  outline: none;
  padding: 4px 6px;
  border-bottom: 1px dashed transparent;
  transition: border-color var(--dur) var(--ease);
}
.title-input:focus {
  border-bottom-color: var(--moss);
}
.title-input::placeholder {
  font-weight: 500;
  color: var(--ink-soft);
}
.save-state {
  font-size: 12px;
  color: var(--ink-soft);
}
.save-state--dirty {
  color: var(--moss-deep);
  font-weight: 600;
}

/* —— 主体两栏 —— */
.split {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
}
.left {
  width: 460px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid var(--edge);
  border-radius: var(--radius-sm);
  background: var(--surface);
  overflow: hidden;
}
.pool-tip {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--hair);
  font-size: 12.5px;
  color: var(--ink-soft);
}
.pool-tip__main {
  flex: 1;
  min-width: 0;
}
.pool-tip__opt {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  white-space: nowrap;
}
.pool {
  flex: 1;
  min-height: 0;
  padding: 0 12px 10px;
}
.pool-tabs {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.pool-tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.pool-tabs :deep(.el-tab-pane) {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.pool-filters {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}
.pool-filters :deep(.el-input) {
  width: 100%;
}
.pool-filters :deep(.el-select) {
  width: calc(50% - 4px);
}
.pool-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}
/* 素材行是真正的 <button>（键盘可达）：补上 button 需要显式继承的几条 */
.pool-row {
  display: block;
  width: 100%;
  text-align: left;
  font: inherit;
  color: inherit;
  padding: 8px 10px;
  margin-bottom: 6px;
  border: 1px solid var(--hair);
  border-radius: var(--radius-sm);
  background: var(--card-tile-bg);
  cursor: pointer;
  transition:
    border-color var(--dur) var(--ease),
    background-color var(--dur) var(--ease);
}
.pool-row:hover {
  border-color: var(--moss);
  background: var(--moss-soft);
}
.pool-row:hover .pool-row__action {
  opacity: 1;
}
.pool-row:disabled {
  cursor: not-allowed;
}
.pool-row--kp {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pool-row--kp.is-empty {
  opacity: 0.5;
  cursor: not-allowed;
}
.pool-row__title {
  font-size: 13px;
  line-height: 1.6;
  color: var(--ink);
  /* 素材池只需要认出是哪道题，长题干截断即可（插入的是完整内容） */
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.pool-row__name {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pool-row__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 5px;
  font-size: 11.5px;
  color: var(--ink-soft);
}
.pool-row__meta .kp {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pool-row__action {
  margin-left: auto;
  flex-shrink: 0;
  color: var(--moss-deep);
  font-weight: 600;
  opacity: 0;
  transition: opacity var(--dur) var(--ease);
}
.kp-hint {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--ink-soft);
}
.kp-tree-mark {
  color: var(--ink-soft);
  margin-right: 2px;
}
.kp-count {
  margin-left: 6px;
  font-size: 11.5px;
  color: var(--ink-soft);
}
.stars {
  color: var(--moss);
  letter-spacing: 1px;
}
.pool-pager {
  flex-shrink: 0;
  padding-top: 8px;
  display: flex;
  justify-content: center;
}

/* —— 右栏：可编辑纸张 —— */
.right {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.options-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 16px;
  padding: 8px 14px;
  margin-bottom: 10px;
  border: 1px solid var(--edge);
  border-radius: var(--radius-sm);
  background: var(--card-tile-bg);
  font-size: 13px;
  color: var(--ink-regular);
}
.opt-group {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.opt-hint {
  margin-left: auto;
  font-size: 12px;
  color: var(--ink-soft);
}
.paper-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  /* 工具栏是 sticky 的：给滚动区留出它的高度，否则 Tab 到上方元素时会被工具栏盖住 */
  scroll-padding-top: 48px;
  background: var(--paper-deep, #dee3f0);
  border-radius: var(--radius-sm);
  padding: 14px;
}
.paper-doc {
  margin: 0 auto;
  /* audit-allow —— 编辑区就是纸张：底色/圆角/正文墨色必须与导出的 PDF 完全一致，
     属打印介质，不跟随界面主题（导出侧同样是 #fff / #222 / 2px）。 */
  background: #fff;
  border-radius: 2px;
  box-shadow: var(--shadow-paper);
  /* 编辑区就是纸张：宽度/字号/行距与导出保持一致，改完所见即所得 */
  padding: 28px;
}
/* 让 RichEditor 融进纸张：去掉它自带的边框与外框，正文区撑满 */
.paper-doc :deep(.rich-editor) {
  border: none;
  border-radius: 0;
  background: transparent;
  /* 关键：默认的 overflow:hidden 会把下面用负 margin 出血到纸张边缘的工具栏裁掉，
     只剩一条缝（图标正好在裁掉的部分里，表现为「工具栏看不见，hover 才有提示」）。 */
  overflow: visible;
}
.paper-doc :deep(.re-toolbar) {
  position: sticky;
  /* 吸顶到滚动区顶部；原来是 -28px，会把工具栏顶出可视区 */
  top: 0;
  z-index: 3;
  /* 负 margin 让工具栏横向铺满纸张（抵消 .paper-doc 的 28px 内边距） */
  margin: -28px -28px 12px;
  padding: 6px 10px;
  /* 吸顶工具栏必须是实心的：它下面会滚过纸张正文，
     任何透明度都会让文字从工具栏里透出来（上一版 0.94 就已经能看出重影）。 */
  background: var(--surface);
  border-bottom: 1px solid var(--hair);
}
.paper-doc :deep(.re-content) {
  padding: 0;
  min-height: 420px;
  font-size: inherit;
  line-height: inherit;
  /* audit-allow —— 正文墨色与导出侧保持一致（导出同样是 #222），属打印介质 */
  color: #222;
}
.paper-doc :deep(.re-content img) {
  max-width: 100%;
}
/* 窄屏：左右栏改上下堆叠，高度交给页面滚动 */
@media (max-width: 1000px) {
  .handout {
    height: auto;
    min-height: 0;
  }
  .split {
    flex-direction: column;
  }
  .left {
    width: 100%;
    max-height: 55vh;
  }
  .right {
    min-height: 60vh;
  }
}
</style>
