<template>
  <div class="editor">
    <div class="editor__head">
      <div class="editor__title-wrap">
        <el-button text @click="router.push('/papers')">← {{ t('paperEditor.back') }}</el-button>
        <h1 class="editor__title">
          {{ isNew ? t('paperEditor.titleNew') : form.title || t('paperEditor.titleEditFallback') }}
        </h1>
        <span class="editor__sum">
          {{ t('paperEditor.summary', { n: layout.totalCount, m: layout.totalScore }) }}
          <span v-if="scoreMismatch" class="editor__warn">
            {{ t('paperEditor.fullScoreWarn', { n: form.totalScore }) }}
          </span>
        </span>
      </div>
      <div class="editor__actions">
        <el-button :disabled="!!loadError" @click="aiVisible = true">{{
          t('paperEditor.aiAssemble')
        }}</el-button>
        <el-button :disabled="!!loadError" @click="addQuestions">{{
          t('paperEditor.pickQuestions')
        }}</el-button>
        <el-button :disabled="!!loadError" @click="previewVisible = true">{{
          t('paperEditor.printPreview')
        }}</el-button>
        <el-button
          type="primary"
          :loading="saving"
          :disabled="!!loadError || loading"
          @click="save"
          >{{ t('paperEditor.save') }}</el-button
        >
      </div>
    </div>

    <!-- 读失败必须挡住编辑：空白表单 + 真实 id 下按保存，会把原卷覆盖成空卷 -->
    <ListError v-if="loadError" :message="loadError" @retry="load" />

    <div v-else class="editor__body" v-loading="loading">
      <div class="editor__left">
        <section class="panel">
          <h2 class="panel__title">{{ t('paperEditor.metaPanel') }}</h2>
          <PaperMetaForm v-model="form" />
        </section>

        <section class="panel">
          <div class="panel__head">
            <h2 class="panel__title">{{ t('paperEditor.structurePanel') }}</h2>
            <!-- 解答题不是均分（13/15/15/17/17 共 77 分），一键把整卷改回标准分值 -->
            <el-button
              v-if="items.length"
              link
              type="primary"
              size="small"
              @click="resetSectionScores()"
            >
              {{ t('paperEditor.resetScores') }}
            </el-button>
          </div>
          <PaperStructureEditor
            :items="items"
            :meta-total-score="form.totalScore"
            @set-section-score="setSectionScore"
            @apply-standard="resetSectionScores"
          />
        </section>

        <section class="panel">
          <h2 class="panel__title">{{ t('paperEditor.questionsPanel') }}</h2>
          <el-empty v-if="!items.length" :description="t('paperEditor.noQuestions')" />
          <div v-for="(sec, si) in layout.sections" :key="sec.key" class="group">
            <div class="group__head">
              {{ locale.startsWith('en') ? `${si + 1}. ` : `${sec.ordinal}、`
              }}{{ t(`paperSection.${sec.key}`) }}
              <span class="group__meta">
                {{
                  t('paperEditor.sectionMeta', {
                    n: sec.items.length,
                    m: sec.totalScore,
                    a: sec.noStart,
                    b: sec.noEnd
                  })
                }}
              </span>
            </div>
            <div v-for="it in sec.items" :key="it.questionId" class="row">
              <span class="row__no">{{ it.no }}</span>
              <div class="row__body">
                <RichContent stem class="row__title" :html="it.question.title" />
                <div class="row__meta">
                  <span v-if="it.question.difficulty">{{
                    '★'.repeat(it.question.difficulty)
                  }}</span>
                  <span v-else>{{ t('paperEditor.unrated') }}</span>
                  <span v-if="it.question.knowledgeTag">· {{ it.question.knowledgeTag }}</span>
                </div>
              </div>
              <!-- 绑定原始 items 里的分值：layout 里的是快照副本，改它不会回写 -->
              <el-input-number
                :model-value="it.score"
                :min="0"
                :max="100"
                :step="1"
                size="small"
                controls-position="right"
                class="row__score"
                @update:model-value="(v: number | undefined) => setItemScore(it.questionId, v)"
              />
              <div class="row__ops">
                <el-button
                  text
                  size="small"
                  :disabled="!canMove(it.questionId, -1)"
                  @click="move(it.questionId, -1)"
                >
                  ↑
                </el-button>
                <el-button
                  text
                  size="small"
                  :disabled="!canMove(it.questionId, 1)"
                  @click="move(it.questionId, 1)"
                >
                  ↓
                </el-button>
                <el-button text size="small" type="danger" @click="removeItem(it.questionId)">
                  {{ t('paperEditor.remove') }}
                </el-button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div class="editor__right">
        <div class="preview-head">
          <el-radio-group v-model="previewKind" size="small">
            <el-radio-button value="paper">{{ t('paperEditor.previewPaper') }}</el-radio-button>
            <el-radio-button value="sheet">{{ t('paperEditor.previewSheet') }}</el-radio-button>
          </el-radio-group>
          <el-button text size="small" @click="printCurrent">{{
            t('paperEditor.printCurrent')
          }}</el-button>
        </div>
        <iframe
          class="preview-frame"
          :srcdoc="previewDoc"
          :title="t('paperEditor.previewFrameTitle')"
        />
      </div>
    </div>

    <PaperPreviewDialog
      v-model="previewVisible"
      :layout="layout"
      :meta="metaInput"
      @print="onDialogPrint"
    />
    <PaperQuestionPicker
      v-model="pickerVisible"
      :existing-ids="items.map((i) => i.questionId)"
      @confirm="onPicked"
    />
    <AiPaperDialog
      v-model="aiVisible"
      :stage="form.stage"
      :duration="form.duration"
      @apply="onAiApplied"
    />
  </div>
</template>

<script setup lang="ts">
// 试卷编辑器：左侧结构、右侧实时 A4 预览。
// 校验与保存都在服务端做二次确认，这里只做即时反馈（不阻止编辑）。
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import PaperMetaForm from '../../components/paper/PaperMetaForm.vue'
import PaperStructureEditor from '../../components/paper/PaperStructureEditor.vue'
import PaperQuestionPicker from '../../components/paper/PaperQuestionPicker.vue'
import PaperPreviewDialog from '../../components/paper/PaperPreviewDialog.vue'
import AiPaperDialog from '../../components/paper/AiPaperDialog.vue'
import RichContent from '../../components/RichContent.vue'
import ListError from '../../components/ListError.vue'
import { getPaper, createPaper, updatePaper } from '../../api/paper'
import {
  DEFAULT_SECTION_SCORE,
  defaultScoresFor,
  layoutPaper,
  type PaperSectionKey
} from '../../utils/paperLayout'
import {
  buildPreviewDocument,
  buildPrintContext,
  printAnswerSheet,
  printPaper
} from '../../utils/paperPrint'
import type { PaperMetaInput } from '../../utils/paperTemplate'
import type { PaperItemDetail, PaperMetaFormState, Question } from '../../types'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()

const paperId = computed(() => String(route.params.id || 'new'))
const isNew = computed(() => paperId.value === 'new')

const saving = ref(false)
const loading = ref(false)
const loadError = ref('')
const pickerVisible = ref(false)
const aiVisible = ref(false)
const previewVisible = ref(false)
const previewKind = ref<'paper' | 'sheet'>('paper')
const previewDoc = ref('')

const form = reactive<PaperMetaFormState>({
  title: '',
  subtitle: '',
  stage: 'senior3',
  paperType: 'mock',
  duration: 120,
  totalScore: 150,
  layout: {
    school: '',
    session: '',
    gapRatio: 1,
    showScoreTag: true,
    optionColumns: 2
  },
  noticesText: ''
})

const items = ref<PaperItemDetail[]>([])

// 老师手动改过分值的题：自动套用「标准分值」时不能把它们改回去。
// 打开已有试卷时整卷标为自定义——读一次就把别人的卷子重排了，比显示旧分值更糟。
const customScores = ref(new Set<number>())

// —— 未保存守卫 ——
// 试卷结构、分值和卷头都是重活，返回/刷新丢掉一次等于白排。
const snapshot = () =>
  JSON.stringify({
    form: { ...form, layout: { ...form.layout } },
    items: items.value.map((it) => ({
      q: it.questionId,
      s: it.section,
      v: Number(it.score) || 0
    })),
    custom: [...customScores.value]
  })
let pristine = ''
const isDirty = () => pristine !== '' && snapshot() !== pristine

const layout = computed(() =>
  layoutPaper(
    items.value.map((it) => ({
      questionId: it.questionId,
      section: it.section,
      score: Number(it.score) || 0,
      question: it.question
    })),
    { gapRatio: form.layout.gapRatio }
  )
)

const metaInput = computed<PaperMetaInput>(() => ({
  title: form.title,
  subtitle: form.subtitle,
  stage: form.stage,
  duration: form.duration,
  layout: {
    school: form.layout.school,
    session: form.layout.session,
    gapRatio: form.layout.gapRatio,
    showScoreTag: form.layout.showScoreTag,
    optionColumns: form.layout.optionColumns
  },
  notices: form.noticesText || null
}))

/** 题型 → 分区：存量题 choiceMode 为 null 时按单选 */
const sectionOf = (q: Question): PaperSectionKey => {
  if (q.type === 'choice') return q.choiceMode === 'multiple' ? 'multiple' : 'single'
  return q.type as PaperSectionKey
}

const scoreOfSection = (key: PaperSectionKey): number => {
  const hit = items.value.find((it) => it.section === key)
  return hit ? Number(hit.score) || 0 : DEFAULT_SECTION_SCORE[key]
}

/**
 * 按标准分值重排某个分区：解答题 13/15/15/17/17，其余分区均分。
 * force=false 时保留老师手改过的题（customScores），force=true 用于「应用标准分值」。
 */
const applyStandardScores = (key: PaperSectionKey, force = false) => {
  const list = items.value.filter((it) => it.section === key)
  if (!list.length) return
  const scores = defaultScoresFor(key, list.length)
  let pos = 0
  items.value = items.value.map((it) => {
    if (it.section !== key) return it
    const i = pos++
    if (!force && customScores.value.has(it.questionId)) return it
    return { ...it, score: scores[i] ?? it.score }
  })
}

/** 大题结构里的「应用标准分值」：整卷一把改回 8×5 + 3×6 + 3×5 + 13/15/15/17/17 */
const resetSectionScores = (key?: PaperSectionKey) => {
  const keys = key ? [key] : (['single', 'multiple', 'fill', 'solve'] as PaperSectionKey[])
  for (const k of keys) {
    for (const it of items.value) if (it.section === k) customScores.value.delete(it.questionId)
    applyStandardScores(k, true)
  }
  syncTotalScore()
  ElMessage.success(key ? t('paperEditor.resetSectionDone') : t('paperEditor.resetAllDone'))
}

const onPicked = (questions: Question[]) => {
  for (const q of questions) {
    if (items.value.some((it) => it.questionId === q.id)) continue
    const section = sectionOf(q)
    items.value.push({
      questionId: q.id,
      section,
      score: scoreOfSection(section),
      question: q
    })
  }
  // 解答题不是均分（13/15/15/17/17 共 77 分），凑齐后要按标准重排一次，
  // 否则 5×13=65，整卷只有 138 分，和卷头「满分 150」对不上。
  applyStandardScores('solve')
  syncTotalScore()
}

/** AI 组卷结果直接替换整卷题目：它给的是「完整结构」，合并只会让结构对不上 */
const onAiApplied = async (
  payload: { section: PaperSectionKey; score: number; questions: Question[] }[]
) => {
  if (items.value.length) {
    try {
      await ElMessageBox.confirm(
        t('paperEditor.aiReplaceConfirm'),
        t('paperEditor.aiReplaceTitle'),
        { type: 'warning' }
      )
    } catch {
      return
    }
  }
  customScores.value = new Set()
  items.value = payload.flatMap((sec) =>
    sec.questions.map((q) => ({
      questionId: q.id,
      section: sec.section,
      score: Number(sec.score) || 0,
      question: q
    }))
  )
  // 整卷重排后按标准分值落一遍（解答题 13/15/15/17/17）；其余分区本来就是均分
  for (const key of ['solve'] as PaperSectionKey[]) applyStandardScores(key, true)
  syncTotalScore()
  ElMessage.success(t('paperEditor.aiApplied'))
}

const addQuestions = () => {
  pickerVisible.value = true
}

const setItemScore = (questionId: number, score: number | undefined) => {
  // 手改过的分值打标记，之后自动套用标准分值时不再覆盖
  customScores.value.add(questionId)
  items.value = items.value.map((it) =>
    it.questionId === questionId ? { ...it, score: Number(score) || 0 } : it
  )
  syncTotalScore()
}

const removeItem = (questionId: number) => {
  customScores.value.delete(questionId)
  const removed = items.value.find((it) => it.questionId === questionId)
  items.value = items.value.filter((it) => it.questionId !== questionId)
  // 解答题少一道后分值梯度要重排（5 道 77 分 → 4 道仍 77 分）
  if (removed?.section === 'solve') applyStandardScores('solve')
  syncTotalScore()
}

const sectionList = (key: PaperSectionKey) => items.value.filter((it) => it.section === key)

const canMove = (questionId: number, dir: -1 | 1) => {
  const item = items.value.find((it) => it.questionId === questionId)
  if (!item) return false
  const sibs = sectionList(item.section)
  const idx = sibs.findIndex((it) => it.questionId === questionId)
  return idx + dir >= 0 && idx + dir < sibs.length
}

/** 只在同一分区内换位：跨分区换位会让「大题」概念失效 */
const move = (questionId: number, dir: -1 | 1) => {
  const item = items.value.find((it) => it.questionId === questionId)
  if (!item) return
  const sibs = sectionList(item.section)
  const idx = sibs.findIndex((it) => it.questionId === questionId)
  const target = sibs[idx + dir]
  if (!target) return
  const a = items.value.indexOf(item)
  const b = items.value.indexOf(target)
  const next = [...items.value]
  ;[next[a], next[b]] = [next[b], next[a]]
  items.value = next
}

const setSectionScore = (key: PaperSectionKey, score: number) => {
  // 显式把某大题改成统一分值，等于老师自己定了这组数，之后不再自动重排
  for (const it of items.value) if (it.section === key) customScores.value.add(it.questionId)
  items.value = items.value.map((it) =>
    it.section === key ? { ...it, score: Number(score) || 0 } : it
  )
  syncTotalScore()
}

/** 满分跟着实际分值走：否则卷头写 150、题分合计 143，打印出来就是错的 */
const syncTotalScore = () => {
  const sum = items.value.reduce((s, it) => s + (Number(it.score) || 0), 0)
  if (sum > 0) form.totalScore = Math.round(sum)
}

// 卷头满分与题分合计不一致的提示。
// 必须两边都按同一口径取整再比：服务端存的是 Math.round(分值之和)（paper.service.js
// 的 sumScore），而 layout.totalScore 是原始和。用 0.5 分档分值时 143.5 永远不等于 144，
// 原来直接比会把这个警告变成常驻，真正的「卷头与题分不符」反而看不出来。
const scoreMismatch = computed(
  () => layout.value.totalCount > 0 && Math.round(layout.value.totalScore) !== form.totalScore
)

const save = async () => {
  // 加载失败/加载中绝不落库：此时表单是空的，保存等于清空原卷
  if (loadError.value || loading.value) return
  if (!form.title.trim()) {
    ElMessage.warning(t('paperEditor.titleRequired'))
    return
  }
  if (!items.value.length) {
    ElMessage.warning(t('paperEditor.atLeastOne'))
    return
  }
  saving.value = true
  try {
    const payload = {
      title: form.title.trim(),
      subtitle: form.subtitle || null,
      stage: form.stage,
      paperType: form.paperType,
      duration: form.duration,
      layout: { ...form.layout },
      notices: form.noticesText || null,
      items: items.value.map((it) => ({
        questionId: it.questionId,
        section: it.section,
        score: Number(it.score) || 0
      }))
    }
    if (isNew.value) {
      const created = await createPaper(payload as any)
      pristine = snapshot()
      ElMessage.success(t('paperEditor.saved'))
      router.replace(`/papers/${created.paper.id}`)
    } else {
      await updatePaper(paperId.value, payload as any)
      pristine = snapshot()
      ElMessage.success(t('paperEditor.updated'))
    }
  } finally {
    saving.value = false
  }
}

const load = async () => {
  loadError.value = ''
  if (isNew.value) {
    form.title = t('paperEditor.defaultTitle')
    pristine = snapshot()
    return
  }
  loading.value = true
  try {
    const detail = await getPaper(paperId.value, { silent: true })
    const p = detail.paper
    form.title = p.title
    form.subtitle = p.subtitle || ''
    form.stage = p.stage
    form.paperType = p.paperType
    form.duration = p.duration
    form.totalScore = p.totalScore
    form.noticesText = p.notices || ''
    form.layout = {
      school: p.layout?.school || '',
      session: p.layout?.session || '',
      gapRatio: p.layout?.gapRatio ?? 1,
      showScoreTag: p.layout?.showScoreTag !== false,
      optionColumns: (p.layout?.optionColumns as 1 | 2) || 2
    }
    items.value = detail.items.map((it) => ({ ...it, score: Number(it.score) || 0 }))
    // 打开既有试卷时整卷视作「已自定义」：读一次就悄悄改分值，比显示旧值更糟
    customScores.value = new Set(items.value.map((it) => it.questionId))
    if (detail.missing) ElMessage.warning(t('paperEditor.missing', { n: detail.missing }))
    pristine = snapshot()
  } catch (e: any) {
    loadError.value = e?.message || t('paperEditor.loadError')
  } finally {
    loading.value = false
  }
}

const printCurrent = () => {
  const ok =
    previewKind.value === 'sheet'
      ? printAnswerSheet(layout.value, metaInput.value)
      : printPaper(layout.value, metaInput.value)
  if (!ok) ElMessage.warning(t('paperList.printBlocked'))
}

const onDialogPrint = (kind: 'paper' | 'sheet') => {
  previewKind.value = kind
  printCurrent()
}

// 实时预览：KaTeX 渲染 + 整篇文档重建较重，做 400ms 防抖
let timer: ReturnType<typeof setTimeout> | null = null
const schedulePreview = () => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    previewDoc.value = buildPreviewDocument(layout.value, metaInput.value, previewKind.value)
  }, 400)
}

watch([layout, metaInput, previewKind], schedulePreview, { immediate: true })

onMounted(load)

// 未保存离开：路由内跳转先确认，刷新/关标签交给浏览器原生提示
onBeforeRouteLeave(async () => {
  if (!isDirty()) return true
  try {
    await ElMessageBox.confirm(t('paperEditor.unsavedConfirm'), t('paperEditor.unsavedTitle'), {
      type: 'warning',
      confirmButtonText: t('paperEditor.discard'),
      cancelButtonText: t('paperEditor.keepEditing')
    })
    return true
  } catch {
    return false
  }
})

const warnBeforeUnload = (e: BeforeUnloadEvent) => {
  if (!isDirty()) return
  e.preventDefault()
  e.returnValue = ''
}
onMounted(() => window.addEventListener('beforeunload', warnBeforeUnload))
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', warnBeforeUnload)
  // 预览是 400ms 防抖 + 整篇 KaTeX 重建，离开页面时不取消的话，
  // 还会在一个已经卸载的组件上多跑一次全量排版
  if (timer) clearTimeout(timer)
})
</script>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: calc(100vh - 142px);
}
.editor__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}
.editor__title-wrap {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 10px;
  min-width: 0;
}
.editor__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 20px;
  white-space: nowrap;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.editor__sum {
  font-family: var(--font-data);
  font-size: 13px;
  color: var(--ink-soft);
}
.editor__warn {
  color: var(--warning);
}
.editor__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.editor__body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(420px, 1fr) 460px;
  gap: 14px;
}
.editor__left {
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--card-radius);
  padding: 14px 16px;
}
.panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.panel__title {
  margin: 0 0 10px;
  font-family: var(--font-display);
  font-size: 15px;
}
.group {
  margin-top: 10px;
}
.group__head {
  font-family: var(--font-display);
  font-size: 14px;
  padding: 6px 0;
  border-bottom: 1px solid var(--line);
}
.group__meta {
  margin-left: 8px;
  font-size: 12px;
  color: var(--ink-soft);
}
.row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 8px 0;
  border-bottom: 1px dashed var(--line);
}
.row__no {
  font-family: var(--font-data);
  width: 22px;
  flex: none;
  color: var(--ink-soft);
}
.row__body {
  flex: 1;
  min-width: 0;
}
.row__title {
  font-size: 13px;
  line-height: 1.6;
  max-height: 62px;
  overflow: hidden;
}
.row__meta {
  margin-top: 2px;
  font-size: 12px;
  color: var(--ink-soft);
}
.row__score {
  width: 96px;
  flex: none;
}
.row__ops {
  flex: none;
  display: flex;
  gap: 2px;
}
.editor__right {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.preview-frame {
  flex: 1;
  min-height: 0;
  width: 100%;
  border: 1px solid var(--line);
  border-radius: var(--card-radius);
  background: var(--paper);
}
/* 窄屏：取消固定视口高度，左右改上下堆叠（预览给一个可读的高度） */
@media (max-width: 1000px) {
  .editor {
    height: auto;
  }
  .editor__body {
    grid-template-columns: minmax(0, 1fr);
  }
  .editor__left {
    overflow: visible;
  }
  .editor__right {
    min-height: 60vh;
  }
}
</style>
