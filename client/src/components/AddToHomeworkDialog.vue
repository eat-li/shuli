<template>
  <el-dialog
    :model-value="modelValue"
    :title="t('addToHomework.title')"
    width="520px"
    @update:model-value="emit('update:modelValue', $event)"
    @open="onOpen"
  >
    <!-- 这道题本身：题干截断一行，确认用户加的是他想加的那道 -->
    <div class="target">
      <span class="target__no">{{
        t('addToHomework.questionNo', { n: question?.id ?? '—' })
      }}</span>
      <span class="target__stem">{{ stemPreview }}</span>
    </div>

    <el-input
      v-model="keyword"
      :placeholder="t('addToHomework.searchPlaceholder')"
      :prefix-icon="Search"
      clearable
      class="search"
      @keyup.enter="pickFirst"
    />

    <div v-loading="loading" class="list">
      <button
        v-for="hw in shown"
        :key="hw.id"
        type="button"
        class="hw"
        :class="{ 'is-in': joined(hw), 'is-active': picked === hw.id }"
        :disabled="joined(hw)"
        @click="picked = hw.id"
      >
        <span class="hw__title">{{ hw.title }}</span>
        <span class="hw__meta">{{ meta(hw) }}</span>
        <span v-if="joined(hw)" class="hw__badge">{{ t('addToHomework.joined') }}</span>
        <span v-else-if="picked === hw.id" class="hw__badge hw__badge--pick">{{
          t('addToHomework.willJoin')
        }}</span>
      </button>

      <el-empty v-if="!loading && !shown.length" :description="emptyText" :image-size="70" />
    </div>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="saving" :disabled="!picked" @click="confirm">
        {{ t('addToHomework.submit') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import { getHomeworks, addHomeworkQuestions } from '../api/homework'
import { listHomeworkCategories } from '../api/homeworkCategory'
import type { Homework, HomeworkCategory } from '../types'

const props = defineProps<{
  modelValue: boolean
  /** 要加入作业的题目（只用到 id 与题干 title） */
  question?: { id: number; title?: string | null } | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
}>()

const { t } = useI18n()

const loading = ref(false)
const saving = ref(false)
const keyword = ref('')
const picked = ref<number | null>(null)
const homeworks = ref<Homework[]>([])
const categories = ref<HomeworkCategory[]>([])

// 题干可能很长且带 HTML/LaTeX，这里只取纯文本前 60 字做标识
const stemPreview = computed(() => {
  const raw = (props.question?.title || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!raw) return t('addToHomework.noStem')
  return raw.length > 60 ? `${raw.slice(0, 60)}…` : raw
})

const categoryName = (id?: number | null) => {
  const fallback = t('homework.uncategorized')
  if (id == null) return fallback
  return categories.value.find((c) => c.id === id)?.name || fallback
}

const fmtDate = (v?: string | null) => {
  if (!v) return t('addToHomework.noDue')
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return t('addToHomework.noDue')
  return t('addToHomework.due', { month: d.getMonth() + 1, day: d.getDate() })
}

const meta = (hw: Homework) =>
  [
    categoryName(hw.categoryId),
    t('addToHomework.count', { n: (hw.questionIds || []).length }),
    fmtDate(hw.endAt)
  ].join(' · ')

// 已在目标作业里：后端会拒绝重复，这里提前置灰，省一次失败往返
const joined = (hw: Homework) =>
  props.question?.id != null && (hw.questionIds || []).includes(props.question.id)

const shown = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  return k
    ? homeworks.value.filter((h) => (h.title || '').toLowerCase().includes(k))
    : homeworks.value
})

const emptyText = computed(() =>
  keyword.value.trim() ? t('addToHomework.emptyNoMatch') : t('addToHomework.emptyNone')
)

// 回车：直接选中第一条可加入的，省一次点击
const pickFirst = () => {
  const first = shown.value.find((hw) => !joined(hw))
  if (first) picked.value = first.id
}

const onOpen = async () => {
  picked.value = null
  keyword.value = ''
  loading.value = true
  try {
    // 只列已发布：草稿还没发给学生，加题应该走作业编辑；
    // 已结束的作业后端会直接拒（成绩已录，题量不能再变），所以也不列出来徒增失败
    const [list, cats] = await Promise.all([
      // 这里要判断「该题是否已在目标作业里」，必须拿到完整题目 id
      getHomeworks({ status: 'published', withQuestionIds: true }),
      listHomeworkCategories().catch(() => [] as HomeworkCategory[])
    ])
    homeworks.value = Array.isArray(list) ? list : []
    categories.value = cats
  } catch {
    homeworks.value = []
  } finally {
    loading.value = false
  }
}

const confirm = async () => {
  const target = homeworks.value.find((hw) => hw.id === picked.value)
  if (!target || props.question?.id == null) return

  saving.value = true
  try {
    const res = await addHomeworkQuestions(target.id, [props.question.id])
    ElMessage.success(t('addToHomework.added', { title: target.title, n: res.total }))
    // 广播给题库页：作业题目已变，刷「已做过」标记
    window.dispatchEvent(new CustomEvent('question-used-changed'))
    emit('update:modelValue', false)
  } catch {
    // 错误提示由 request.ts 统一弹出（作业已结束 / 题目已被删除都会走到这里）
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.target {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 10px 14px;
  background: var(--paper-deep);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
}
.target__no {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
  color: var(--moss-deep);
  background: var(--moss-soft);
  border-radius: var(--radius-pill);
  padding: 3px 9px;
}
.target__stem {
  font-size: 13px;
  color: var(--ink-soft);
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search {
  margin-bottom: 10px;
}

.list {
  max-height: 320px;
  min-height: 120px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hw {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  font: inherit;
  text-align: left;
  cursor: pointer;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}
.hw:hover:not(:disabled) {
  border-color: var(--moss);
}
.hw.is-active {
  border-color: var(--moss);
  background: var(--moss-soft);
}
.hw:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.hw__title {
  font-weight: 600;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hw__meta {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--ink-soft);
}
.hw__badge {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--ink-soft);
  background: var(--paper-deep);
  border-radius: var(--radius-pill);
  padding: 2px 8px;
}
.hw__badge--pick {
  color: var(--moss-deep);
  background: var(--moss-soft);
}
</style>
