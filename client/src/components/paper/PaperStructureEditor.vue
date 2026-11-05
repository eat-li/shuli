<template>
  <div class="struct">
    <el-table :data="rows" size="small" :show-header="true" border>
      <el-table-column prop="label" :label="t('paperStructure.sectionColumn')" width="110" />
      <el-table-column :label="t('paperStructure.countColumn')" width="70" align="center">
        <template #default="{ row }">{{ row.count }}</template>
      </el-table-column>
      <el-table-column :label="t('paperStructure.perScoreColumn')" width="132" align="center">
        <template #default="{ row }">
          <el-input-number
            :model-value="row.score"
            :min="0"
            :max="100"
            :step="1"
            size="small"
            controls-position="right"
            :disabled="row.count === 0"
            @update:model-value="(v: number | undefined) => onScoreChange(row.key, v)"
          />
          <div v-if="row.count && !row.uniform" class="struct__mixed">
            {{ t('paperStructure.mixed') }}
          </div>
        </template>
      </el-table-column>
      <el-table-column :label="t('paperStructure.subtotalColumn')" width="70" align="center">
        <template #default="{ row }">{{ fmtScore(row.subtotal) }}</template>
      </el-table-column>
      <el-table-column :label="t('paperStructure.standardColumn')" width="160" align="center">
        <template #default="{ row }">
          <span class="struct__pattern">{{ patternText(row.key, row.count) }}</span>
          <el-button
            link
            type="primary"
            size="small"
            :disabled="!row.count"
            @click="emit('apply-standard', row.key)"
          >
            {{ t('paperStructure.apply') }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="struct__sum">
      {{ t('paperStructure.summary', { n: totalCount, m: fmtScore(totalScore) }) }}
      <span v-if="totalScore !== metaTotalScore" class="struct__warn">
        {{ t('paperStructure.totalWarn', { m: fmtScore(metaTotalScore) }) }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
// 结构编辑器：只调整「每大题的单题分值」。
// 题量由实际选题决定，不在这里虚设——填了 8 题却没有题，卷面会出现空号。
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { defaultScoresFor, fmtScore, SECTION_ORDER } from '../../utils/paperLayout'
import type { PaperSectionKey } from '../../types'
import type { PaperItemDetail } from '../../types'

const { t } = useI18n()

const props = defineProps<{
  items: PaperItemDetail[]
  metaTotalScore: number
}>()

const emit = defineEmits<{
  (e: 'set-section-score', key: PaperSectionKey, score: number): void
  (e: 'apply-standard', key: PaperSectionKey): void
}>()

const rows = computed(() =>
  SECTION_ORDER.map((key) => {
    const list = props.items.filter((it) => it.section === key)
    const scores = list.map((it) => Number(it.score) || 0)
    return {
      key,
      label: t(`paperSection.${key}`),
      count: list.length,
      score: scores.length ? scores[0] : 0,
      // 解答题是 13/15/15/17/17 的梯度，写「每小题 N 分」会误导
      uniform: scores.every((s) => s === scores[0]),
      subtotal: scores.reduce((s, n) => s + n, 0)
    }
  })
)

/** 该大题的标准分值文本：解答题显示梯度 13/15/15/17/17，其余大题均分只显示一个数 */
const patternText = (key: PaperSectionKey, count: number): string => {
  if (!count) return '—'
  if (key !== 'solve') return fmtScore(defaultScoresFor(key, count)[0])
  return defaultScoresFor(key, count).map(fmtScore).join(' / ')
}

const totalScore = computed(() => rows.value.reduce((s, r) => s + r.subtotal, 0))
const totalCount = computed(() => rows.value.reduce((s, r) => s + r.count, 0))

const onScoreChange = (key: PaperSectionKey, v: number | undefined) => {
  emit('set-section-score', key, Number(v) || 0)
}
</script>

<style scoped>
.struct__sum {
  margin-top: 8px;
  font-size: 13px;
  color: var(--ink-regular);
}
.struct__warn {
  color: var(--danger);
}
.struct__pattern {
  font-family: var(--font-data);
  font-size: 12px;
  color: var(--ink-regular);
  margin-right: 6px;
}
.struct__mixed {
  font-size: 11px;
  color: var(--warning);
  line-height: 1.2;
}
</style>
