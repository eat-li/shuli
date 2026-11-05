<template>
  <el-dialog
    :model-value="modelValue"
    :title="t('aiPaper.title')"
    width="720px"
    :close-on-click-modal="false"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <div class="ai">
      <p class="ai__intro">{{ t('aiPaper.intro') }}</p>

      <el-form label-width="96px" size="default" @submit.prevent>
        <el-form-item :label="t('aiPaper.stageLabel')">
          <el-select v-model="stage" style="width: 200px">
            <el-option v-for="s in STAGES" :key="s.value" :label="s.label" :value="s.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('aiPaper.structureLabel')">
          <el-table :data="rows" size="small" border style="width: 100%">
            <el-table-column :label="t('aiPaper.sectionColumn')" width="110">
              <template #default="{ row }">{{ t(`paperSection.${row.key}`) }}</template>
            </el-table-column>
            <el-table-column :label="t('aiPaper.countColumn')" width="110">
              <template #default="{ row }">
                <el-input-number
                  v-model="row.count"
                  :min="0"
                  :max="30"
                  size="small"
                  controls-position="right"
                />
              </template>
            </el-table-column>
            <el-table-column :label="t('aiPaper.scoreColumn')" width="150">
              <template #default="{ row }">
                <!-- 解答题不是均分：13/15/15/17/17 共 77 分，用小计倒推比填一个「13」准确 -->
                <span v-if="row.key === 'solve'" class="ai__pattern">
                  {{ solvePatternText(row.count) }}
                </span>
                <el-input-number
                  v-else
                  v-model="row.score"
                  :min="0"
                  :max="100"
                  size="small"
                  controls-position="right"
                />
              </template>
            </el-table-column>
            <el-table-column :label="t('aiPaper.subtotalColumn')" width="80" align="center">
              <template #default="{ row }">{{ rowSubtotal(row) }}</template>
            </el-table-column>
          </el-table>
          <div class="ai__sum">{{ t('aiPaper.total', { n: totalCount, m: totalScore }) }}</div>
        </el-form-item>
        <el-form-item :label="t('aiPaper.tagsLabel')">
          <el-select
            v-model="knowledgeTags"
            multiple
            filterable
            allow-create
            default-first-option
            :placeholder="t('aiPaper.tagsPlaceholder')"
            style="width: 100%"
          >
            <el-option v-for="t in tags" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('aiPaper.excludeLabel')">
          <el-switch v-model="excludeUsed" />
          <span class="ai__hint">{{ t('aiPaper.excludeHint') }}</span>
        </el-form-item>
        <el-form-item :label="t('aiPaper.agentLabel')">
          <el-switch v-model="agentMode" />
          <span class="ai__hint">{{ t('aiPaper.agentHint') }}</span>
        </el-form-item>
      </el-form>

      <el-alert
        v-if="result"
        :type="result.meta.degraded ? 'warning' : 'success'"
        :closable="false"
        show-icon
        class="ai__result"
      >
        <template #title>
          {{
            result.meta.degraded
              ? t('aiPaper.degraded')
              : result.meta.agentMode
                ? t('aiPaper.agentDone')
                : t('aiPaper.done')
          }}
          ·
          {{
            t('aiPaper.resultSummary', {
              sections: resultSections.length,
              n: resultCount,
              candidates: result.meta.candidateCount,
              ms: result.meta.elapsedMs
            })
          }}<template v-if="result.meta.agentMode">
            ·
            {{
              t('aiPaper.agentMeta', {
                steps: result.meta.agentSteps,
                calls: result.meta.agentToolCalls
              })
            }}</template
          >
        </template>
        <div v-if="result.notes" class="ai__notes">{{ result.notes }}</div>
        <ul v-if="result.warnings.length" class="ai__warnings">
          <li v-for="(w, i) in result.warnings" :key="i">{{ w }}</li>
        </ul>
        <div v-if="!result.warnings.length" class="ai__notes">{{ t('aiPaper.noProblems') }}</div>
      </el-alert>
    </div>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">{{ t('common.cancel') }}</el-button>
      <el-button :loading="running" @click="run">{{ t('aiPaper.run') }}</el-button>
      <el-button type="primary" :disabled="!result" @click="apply">{{
        t('aiPaper.apply')
      }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
// AI 组卷对话框：只负责收集约束与展示结果，选题逻辑全在服务端（可单测）。
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { composePaper, type ComposeResult } from '../../api/paper'
import { getQuestionTags } from '../../api/question'
import { DEFAULT_SECTION_SCORE, defaultScoresFor, SECTION_ORDER } from '../../utils/paperLayout'
import { resolveAiCreds } from '../../utils/aiConfig'
import type { PaperSectionKey, Question } from '../../types'

const { t } = useI18n()

const props = defineProps<{
  modelValue: boolean
  stage: string
  duration: number
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'apply', payload: { section: PaperSectionKey; score: number; questions: Question[] }[]): void
}>()

const STAGES = computed(() => [
  { value: 'senior3', label: t('gradeLevel.senior3') },
  { value: 'senior2', label: t('gradeLevel.senior2') },
  { value: 'senior1', label: t('gradeLevel.senior1') },
  { value: 'junior3', label: t('gradeLevel.junior3') },
  { value: 'junior2', label: t('gradeLevel.junior2') },
  { value: 'junior1', label: t('gradeLevel.junior1') }
])

const stage = ref(props.stage || 'senior3')
const knowledgeTags = ref<string[]>([])
const excludeUsed = ref(false)
const agentMode = ref(false)
const tags = ref<string[]>([])
const running = ref(false)
const result = ref<ComposeResult | null>(null)

// 默认题量按新高考数学卷：单选 8 + 多选 3 + 填空 3 + 解答 5
const DEFAULT_COUNT: Record<string, number> = { single: 8, multiple: 3, fill: 3, solve: 5 }

const rows = reactive(
  SECTION_ORDER.map((key) => ({
    key,
    count: DEFAULT_COUNT[key],
    score: DEFAULT_SECTION_SCORE[key]
  }))
)

const totalCount = computed(() => rows.reduce((s, r) => s + (r.count || 0), 0))

/** 该大题的合计分：解答题按标准梯度算（5 题 = 77 分），不是 count × 单题分值 */
const rowSubtotal = (row: { key: string; count: number; score: number }): number => {
  const count = row.count || 0
  if (!count) return 0
  if (row.key === 'solve') {
    return defaultScoresFor('solve', count).reduce((s, n) => s + n, 0)
  }
  return count * (row.score || 0)
}

const totalScore = computed(() => rows.reduce((s, r) => s + rowSubtotal(r), 0))

/** 解答题标准分值文本，题量变化时跟着变 */
const solvePatternText = (count: number): string =>
  count ? defaultScoresFor('solve', count).join(' / ') : '—'

const resultSections = computed(() => result.value?.sections || [])
const resultCount = computed(() =>
  resultSections.value.reduce((s, sec) => s + sec.questions.length, 0)
)

const run = async () => {
  if (!totalCount.value) {
    ElMessage.warning(t('aiPaper.needOne'))
    return
  }
  running.value = true
  result.value = null
  try {
    // 没有本地 Key 时返回 null：后端会用 .env 里的 Key，再没有就自动降级为规则组卷
    const creds = (await resolveAiCreds()) || {}
    result.value = await composePaper({
      stage: stage.value,
      totalScore: totalScore.value,
      duration: props.duration,
      structure: rows
        .filter((r) => r.count > 0)
        .map((r) => ({ section: r.key, count: r.count, score: r.score })),
      knowledgeTags: knowledgeTags.value,
      excludeUsed: excludeUsed.value,
      agentMode: agentMode.value,
      ...creds
    })
    if (result.value.meta.degraded) ElMessage.warning(t('aiPaper.degradedWarn'))
  } catch (e: any) {
    ElMessage.error(e?.message || t('aiPaper.failed'))
  } finally {
    running.value = false
  }
}

const apply = () => {
  if (!result.value) return
  const payload = result.value.sections
    .filter((s) => s.questions.length)
    .map((s) => ({ section: s.section, score: s.score, questions: s.questions }))
  if (!payload.length) {
    ElMessage.warning(t('aiPaper.noQuestions'))
    return
  }
  emit('apply', payload)
  emit('update:modelValue', false)
}

watch(
  () => props.modelValue,
  (v) => {
    if (!v) return
    result.value = null
    stage.value = props.stage || 'senior3'
    if (!tags.value.length) getQuestionTags().then((t) => (tags.value = t || []))
  }
)
</script>

<style scoped>
.ai__intro {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--ink-soft);
}
.ai__sum {
  margin-top: 6px;
  font-family: var(--font-data);
  font-size: 13px;
  color: var(--ink-regular);
}
.ai__hint {
  margin-left: 10px;
  font-size: 12px;
  color: var(--ink-soft);
}
.ai__result {
  margin-top: 4px;
}
.ai__notes {
  margin-top: 4px;
  font-size: 13px;
}
.ai__warnings {
  margin: 6px 0 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.7;
}
</style>
