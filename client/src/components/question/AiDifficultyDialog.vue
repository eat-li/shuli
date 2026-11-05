<template>
  <el-dialog
    :model-value="modelValue"
    :title="t('aiDifficulty.title')"
    width="880px"
    top="6vh"
    :close-on-click-modal="false"
    @update:model-value="onClose"
  >
    <div class="aid">
      <el-alert type="info" :closable="false" show-icon class="aid__tip">
        <template #title>{{ t('aiDifficulty.tipTitle') }}</template>
        {{ t('aiDifficulty.tipPrefix') }}<strong>{{ t('aiDifficulty.tipStrong') }}</strong
        >{{ t('aiDifficulty.tipSuffix') }}
      </el-alert>

      <div class="aid__bar">
        <el-radio-group v-model="scope" size="small" :disabled="running" @change="loadCandidates">
          <el-radio-button value="unrated">
            {{ t('aiDifficulty.scopeUnrated', { n: counts.unrated }) }}
          </el-radio-button>
          <el-radio-button value="suspicious">
            {{ t('aiDifficulty.scopeSuspicious', { n: counts.suspicious }) }}
          </el-radio-button>
          <el-radio-button value="all">
            {{ t('aiDifficulty.scopeAll', { n: counts.all }) }}
          </el-radio-button>
        </el-radio-group>
        <el-select
          v-model="typeFilter"
          size="small"
          style="width: 110px"
          :disabled="running"
          @change="loadCandidates"
        >
          <el-option :label="t('aiDifficulty.typeAll')" value="" />
          <el-option :label="t('aiDifficulty.typeSingle')" value="single" />
          <el-option :label="t('aiDifficulty.typeMultiple')" value="multiple" />
          <el-option :label="t('aiDifficulty.typeFill')" value="fill" />
          <el-option :label="t('aiDifficulty.typeSolve')" value="solve" />
        </el-select>
        <span class="aid__status">
          <template v-if="running">
            {{ t('aiDifficulty.statusRunning', { done: doneCount, total: rows.length }) }}
          </template>
          <template v-else-if="rows.length">
            {{ t('aiDifficulty.statusDone', { done: doneCount, total: rows.length }) }}
          </template>
          <template v-else>{{ t('aiDifficulty.statusEmpty') }}</template>
        </span>
      </div>

      <el-table
        v-loading="loading"
        :data="rows"
        height="360px"
        size="small"
        border
        class="aid__table"
      >
        <el-table-column
          prop="title"
          :label="t('aiDifficulty.colQuestion')"
          min-width="240"
          show-overflow-tooltip
        />
        <el-table-column :label="t('aiDifficulty.colOriginal')" width="90" align="center">
          <template #default="{ row }">
            <span :class="{ 'aid__unrated': row.difficulty == null }">
              {{
                row.difficulty == null
                  ? t('aiDifficulty.unrated')
                  : t('aiDifficulty.stars', row.difficulty)
              }}
            </span>
          </template>
        </el-table-column>
        <el-table-column :label="t('aiDifficulty.colAi')" width="90" align="center">
          <template #default="{ row }">
            <b v-if="row.suggested" :class="{ 'aid__changed': row.suggested !== row.difficulty }">
              {{ t('aiDifficulty.stars', row.suggested) }}
            </b>
            <span v-else-if="row.status === 'running'" class="aid__muted">…</span>
            <span v-else class="aid__muted">—</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('aiDifficulty.colReason')" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            <span :class="{ 'aid__error': row.status === 'error' }">{{ row.reason || '—' }}</span>
          </template>
        </el-table-column>
      </el-table>

      <p class="aid__hint">{{ t('aiDifficulty.hint', { n: CONCURRENCY }) }}</p>
    </div>

    <template #footer>
      <el-button @click="onClose(false)">{{ t('aiDifficulty.close') }}</el-button>
      <el-button v-if="running" type="danger" plain @click="stop">{{
        t('aiDifficulty.stop')
      }}</el-button>
      <el-button v-else :disabled="!rows.length" :loading="false" @click="start">{{
        t('aiDifficulty.start')
      }}</el-button>
      <el-button
        type="primary"
        :disabled="!changedRows.length || applying"
        :loading="applying"
        @click="adopt"
      >
        {{ t('aiDifficulty.adopt', { n: changedRows.length }) }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
// AI 批量判难度：前端并发调用单题接口，不占后端长连接，可随时中断。
// 判定结果先落在这张表里，采纳时才 PATCH —— 模型一次批量覆盖全库的风险太大。
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, vLoading } from 'element-plus'
import { judgeDifficulty } from '../../api/ai'
import { getDifficultyCandidates, updateQuestion } from '../../api/question'
import type { DifficultyCandidateFilter } from '../../api/question'
import { resolveAiCreds } from '../../utils/aiConfig'
import type { DifficultyCandidate } from '../../types'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'applied'): void
}>()

const { t } = useI18n()

const CONCURRENCY = 3

type Row = DifficultyCandidate & {
  suggested: number | null
  reason: string
  status: 'idle' | 'running' | 'done' | 'error'
}

const scope = ref<'unrated' | 'suspicious' | 'all'>('unrated')
// 题型筛选：single/multiple 走 choice+choiceMode，fill/solve 直接按 type（与分析页同口径）
const typeFilter = ref<'' | 'single' | 'multiple' | 'fill' | 'solve'>('')
const counts = reactive({ unrated: 0, suspicious: 0, all: 0 })
const rows = ref<Row[]>([])
const loading = ref(false)
const running = ref(false)
const applying = ref(false)
const doneCount = ref(0)
let aborted = false

const changedRows = computed(() =>
  rows.value.filter((r) => r.suggested && r.suggested !== r.difficulty)
)

const loadCounts = async () => {
  // 计数与列表同筛选口径，否则「未标注（300）」和实际列表对不上
  const f = filterParams()
  const [u, s, a] = await Promise.all([
    getDifficultyCandidates('unrated', f),
    getDifficultyCandidates('suspicious', f),
    getDifficultyCandidates('all', f)
  ])
  counts.unrated = u.total
  counts.suspicious = s.total
  counts.all = a.total
}

// 显式标注返回类型 + 先取到局部常量：
// 不标注时三个 return 会被推成 `type: string` 的联合，赋给 DifficultyCandidateFilter
// 就报 TS2345；而 `typeFilter.value` 是 ref 的 getter，跨 return 的收窄并不可靠。
const filterParams = (): DifficultyCandidateFilter => {
  const kind = typeFilter.value
  if (!kind) return {}
  if (kind === 'single' || kind === 'multiple') return { type: 'choice', choiceMode: kind }
  return { type: kind }
}

const loadCandidates = async () => {
  loading.value = true
  try {
    const res = await getDifficultyCandidates(scope.value, filterParams())
    rows.value = res.list.map((q) => ({ ...q, suggested: null, reason: '', status: 'idle' }))
    doneCount.value = 0
  } finally {
    loading.value = false
  }
}

const start = async () => {
  if (!rows.value.length) return
  running.value = true
  aborted = false
  doneCount.value = 0

  const creds = (await resolveAiCreds()) || {}
  let cursor = 0

  const worker = async () => {
    while (!aborted) {
      const index = cursor++
      if (index >= rows.value.length) return
      const row = rows.value[index]
      row.status = 'running'
      try {
        const res = await judgeDifficulty({ questionId: row.id, ...creds })
        row.suggested = res.difficulty
        row.reason = res.reason
        row.status = 'done'
      } catch (e: any) {
        row.status = 'error'
        row.reason = e?.message || t('aiDifficulty.judgeFailed')
        // 缺少 Key 之类的配置问题会对每一题重复报同一条错，没有继续的意义
        if (/API Key/.test(row.reason)) {
          aborted = true
          ElMessage.error(row.reason)
        }
      } finally {
        doneCount.value++
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  running.value = false
  if (!aborted && changedRows.value.length === 0) {
    ElMessage.success(t('aiDifficulty.doneNoChanges'))
  }
}

const stop = () => {
  aborted = true
  running.value = false
}

const adopt = async () => {
  const targets = changedRows.value.slice()
  if (!targets.length) return
  applying.value = true
  let cursor = 0
  let ok = 0
  let failed = 0
  const worker = async () => {
    while (cursor < targets.length) {
      const row = targets[cursor++]
      try {
        await updateQuestion(row.id, { difficulty: row.suggested as number })
        row.difficulty = row.suggested
        row.suggested = null
        ok++
      } catch {
        failed++
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  applying.value = false
  ElMessage[failed ? 'warning' : 'success'](
    failed
      ? t('aiDifficulty.updatedWithFailures', { ok, failed })
      : t('aiDifficulty.updated', { n: ok })
  )
  emit('applied')
}

const onClose = (v: boolean) => {
  if (running.value) stop()
  emit('update:modelValue', v)
}

watch(
  () => props.modelValue,
  async (v) => {
    if (!v) return
    scope.value = 'unrated'
    typeFilter.value = ''
    rows.value = []
    doneCount.value = 0
    await Promise.all([loadCounts(), loadCandidates()])
  }
)
</script>

<style scoped>
.aid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.aid__tip :deep(.el-alert__title) {
  font-weight: 600;
}
.aid__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.aid__status {
  font-family: var(--font-data);
  font-size: 13px;
  color: var(--ink-soft);
}
.aid__table {
  border-radius: var(--radius-sm);
}
.aid__unrated,
.aid__muted {
  color: var(--ink-placeholder);
}
.aid__changed {
  color: var(--moss);
}
.aid__error {
  color: var(--danger);
}
.aid__hint {
  margin: 0;
  font-size: 12px;
  color: var(--ink-soft);
}
</style>
