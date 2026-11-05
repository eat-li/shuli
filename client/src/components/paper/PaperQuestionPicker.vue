<template>
  <el-drawer
    :model-value="modelValue"
    :title="t('paperPicker.title')"
    size="720px"
    :close-on-click-modal="false"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <div class="picker">
      <div class="picker__filters">
        <el-input
          v-model="query.keyword"
          :placeholder="t('paperPicker.searchPlaceholder')"
          clearable
          style="width: 180px"
          @keyup.enter="reload"
          @clear="reload"
        />
        <el-select v-model="query.kind" style="width: 130px" @change="reload">
          <el-option :label="t('paperPicker.allTypes')" value="" />
          <el-option :label="t('paperPicker.single')" value="single" />
          <el-option :label="t('paperPicker.multiple')" value="multiple" />
          <el-option :label="t('paperPicker.fill')" value="fill" />
          <el-option :label="t('paperPicker.solve')" value="solve" />
        </el-select>
        <el-select v-model="query.difficulty" style="width: 120px" @change="reload">
          <el-option :label="t('paperPicker.allDifficulty')" :value="0" />
          <el-option
            v-for="d in [1, 2, 3, 4, 5]"
            :key="d"
            :label="t('paperPicker.stars', { n: d })"
            :value="d"
          />
        </el-select>
        <el-select v-model="query.knowledgeTag" style="width: 160px" clearable @change="reload">
          <el-option :label="t('paperPicker.allTags')" value="" />
          <el-option v-for="t in tags" :key="t" :label="t" :value="t" />
        </el-select>
        <el-button @click="reload">{{ t('common.refresh') }}</el-button>
      </div>

      <div v-loading="loading" class="picker__list">
        <el-empty v-if="!loading && !list.length" :description="t('paperPicker.noMatch')" />
        <div
          v-for="q in list"
          :key="q.id"
          class="picker__row"
          :class="{ picked: picked.has(q.id) }"
        >
          <el-checkbox
            :model-value="picked.has(q.id)"
            :disabled="excluded.has(q.id)"
            @update:model-value="(v: boolean) => toggle(q, v)"
          />
          <div class="picker__body" @click="!excluded.has(q.id) && toggle(q, !picked.has(q.id))">
            <div class="picker__meta">
              <el-tag size="small" effect="plain">{{ typeFullLabel(q) }}</el-tag>
              <span v-if="q.difficulty" class="picker__stars">
                {{ '★'.repeat(q.difficulty) }}
              </span>
              <span v-else class="picker__unrated">{{ t('paperPicker.unrated') }}</span>
              <span v-if="q.knowledgeTag" class="picker__tag">{{ q.knowledgeTag }}</span>
              <span v-if="excluded.has(q.id)" class="picker__tag">{{
                t('paperPicker.alreadyInPaper')
              }}</span>
            </div>
            <RichContent class="picker__title" :html="q.title" />
          </div>
        </div>
      </div>

      <div class="picker__footer">
        <span>{{ t('paperPicker.selected', { n: picked.size }) }}</span>
        <div>
          <el-button text @click="picked.clear()">{{ t('paperPicker.clear') }}</el-button>
          <el-button type="primary" :disabled="!picked.size" @click="confirm">{{
            t('paperPicker.add')
          }}</el-button>
        </div>
      </div>

      <el-pagination
        v-model:current-page="page"
        class="picker__pager"
        layout="prev, pager, next"
        :page-size="PAGE_SIZE"
        :total="total"
        @current-change="load"
      />
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
// 抽题抽屉：复用题库筛选能力，只允许「加入」不在这里排序；
// 排序在编辑器里做，避免同一道题在两个地方都能改顺序。
import { ref, reactive, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, vLoading } from 'element-plus'
import { getQuestions, getQuestionTags } from '../../api/question'
import { questionTypeFullLabel } from '../../utils/format'
import RichContent from '../RichContent.vue'
import type { Question } from '../../types'

const { t, te } = useI18n()

const typeFullLabel = (q: Question) => {
  if (q.type === 'choice') {
    return q.choiceMode === 'multiple'
      ? t('questionAnalysis.typeMultiple')
      : t('questionAnalysis.typeSingle')
  }
  return te(`questionType.${q.type}`) ? t(`questionType.${q.type}`) : questionTypeFullLabel(q)
}

const props = defineProps<{
  modelValue: boolean
  /** 已在卷中的题目 id：置灰，避免重复添加 */
  existingIds: number[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'confirm', questions: Question[]): void
}>()

const PAGE_SIZE = 10

const loading = ref(false)
const list = ref<Question[]>([])
const total = ref(0)
const page = ref(1)
const tags = ref<string[]>([])

const query = reactive({ keyword: '', kind: '', difficulty: 0, knowledgeTag: '' })
const picked = ref<Map<number, Question>>(new Map())
const excluded = computed(() => new Set(props.existingIds))

const paramsOf = () => {
  const p: Record<string, unknown> = { page: page.value, pageSize: PAGE_SIZE }
  if (query.keyword) p.keyword = query.keyword
  if (query.difficulty) p.difficulty = query.difficulty
  if (query.knowledgeTag) p.knowledgeTag = query.knowledgeTag
  if (query.kind === 'single') {
    p.type = 'choice'
    p.choiceMode = 'single'
  } else if (query.kind === 'multiple') {
    p.type = 'choice'
    p.choiceMode = 'multiple'
  } else if (query.kind) {
    p.type = query.kind
  }
  return p
}

const load = async () => {
  loading.value = true
  try {
    const res = await getQuestions(paramsOf() as any)
    list.value = res.list
    total.value = res.total
  } finally {
    loading.value = false
  }
}

const reload = () => {
  page.value = 1
  load()
}

const toggle = (q: Question, on: boolean) => {
  const next = new Map(picked.value)
  if (on) next.set(q.id, q)
  else next.delete(q.id)
  picked.value = next
}

const confirm = () => {
  const list = [...picked.value.values()]
  if (!list.length) {
    ElMessage.warning(t('paperPicker.noSelection'))
    return
  }
  emit('confirm', list)
  picked.value = new Map()
  emit('update:modelValue', false)
}

watch(
  () => props.modelValue,
  (v) => {
    if (!v) return
    picked.value = new Map()
    reload()
    if (!tags.value.length) getQuestionTags().then((t) => (tags.value = t || []))
  }
)
</script>

<style scoped>
.picker {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 10px;
}
.picker__filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.picker__list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  padding: 6px;
}
.picker__row {
  display: flex;
  gap: 10px;
  padding: 8px;
  border-bottom: 1px solid var(--line);
  cursor: pointer;
}
.picker__row:last-child {
  border-bottom: none;
}
.picker__row.picked {
  background: var(--moss-soft);
}
.picker__body {
  flex: 1;
  min-width: 0;
}
.picker__meta {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  color: var(--ink-soft);
  margin-bottom: 2px;
}
.picker__stars {
  color: var(--warning);
  letter-spacing: 1px;
}
.picker__unrated {
  color: var(--ink-placeholder);
}
.picker__tag {
  color: var(--ink-soft);
}
.picker__title {
  font-size: 13px;
  line-height: 1.6;
  max-height: 68px;
  overflow: hidden;
}
.picker__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--line);
  padding-top: 8px;
}
.picker__pager {
  justify-content: flex-end;
}
</style>
