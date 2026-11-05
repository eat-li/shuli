<template>
  <el-drawer v-model="visible" :title="t('homeworkView.drawerTitle')" size="60%">
    <div v-loading="loading" class="hw-view">
      <div v-if="error" class="hw-error">
        <p class="hw-error__text">{{ t('homeworkView.detailError') }}</p>
        <el-button size="small" type="primary" @click="load">{{
          t('homeworkView.retry')
        }}</el-button>
      </div>
      <template v-else-if="homework">
        <div class="hw-view__head">
          <h2 class="hw-view__title">{{ homework.title }}</h2>
          <div class="hw-view__meta">
            <span>{{ t('homeworkView.totalQuestions', { n: questions.length }) }}</span>
            <span>{{
              t('homeworkView.dueAt', {
                date: formatDateTime(homework.endAt, t('homeworkView.endAtUnset'))
              })
            }}</span>
          </div>
        </div>

        <div v-for="(q, i) in questions" :key="q.id" class="hw-q">
          <div class="hw-q__no">
            <span>{{ i + 1 }}.</span>
            <el-tag size="small" type="info">{{ typeLabel(q.type) }}</el-tag>
            <el-tag v-if="q.knowledgeTag" size="small" type="warning" class="hw-q__tag"
              >{{ q.knowledgeTag }}{{ q.knowledgeSubTag ? ' › ' + q.knowledgeSubTag : '' }}</el-tag
            >
          </div>
          <div class="hw-q__title"><RichContent :html="q.title" /></div>
          <div v-if="q.options && q.options.length" class="hw-q__opts">
            <div v-for="(opt, j) in q.options" :key="j" class="hw-q__opt">
              {{ String.fromCharCode(65 + j) }}.
              {{ typeof opt === 'string' ? opt : (opt && typeof opt === 'object' && 'text' in opt ? opt.text : JSON.stringify(opt)) }}
            </div>
          </div>
          <div v-if="q.body" class="hw-q__body"><RichContent :html="q.body" /></div>
        </div>

        <el-empty
          v-if="!loading && !questions.length"
          :description="t('homeworkView.noQuestions')"
        />
      </template>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
// 学生视角的作业预览：只展示题干与选项，不显示答案。
// 作业管理列表和「查看作业」页共用，避免两边各写一份抽屉。
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { vLoading } from 'element-plus'
import { getHomeworkQuestions } from '../../api/homework'
import RichContent from '../RichContent.vue'
import { questionTypeLabel, formatDateTime } from '../../utils/format'
import type { Homework, Question } from '../../types'

const props = defineProps<{ modelValue: boolean; homework: Homework | null }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void }>()

const { t, te } = useI18n()

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const typeLabel = (type: string) =>
  te(`questionType.${type}`) ? t(`questionType.${type}`) : questionTypeLabel(type)

const questions = ref<Question[]>([])
const loading = ref(false)
const error = ref(false)
let seq = 0

const load = async () => {
  const id = props.homework?.id
  if (!id) return
  const my = ++seq
  loading.value = true
  error.value = false
  questions.value = []
  try {
    const rows = await getHomeworkQuestions(id)
    if (my === seq) questions.value = rows
  } catch {
    if (my === seq) error.value = true
  } finally {
    if (my === seq) loading.value = false
  }
}

// 打开抽屉或换成另一份作业时再取数；关闭时保留内容，重开同一份也会刷新
watch(
  () => [props.modelValue, props.homework?.id] as const,
  ([open]) => {
    if (open) load()
  }
)
</script>

<style scoped>
.hw-error {
  padding: 48px 0;
  text-align: center;
}
.hw-error__text {
  margin: 0 0 12px;
  color: var(--ink-soft);
  font-size: var(--text-base);
}

.hw-view__head {
  padding-bottom: 16px;
  margin-bottom: 16px;
  border-bottom: 2px solid var(--line);
}
.hw-view__title {
  margin: 0 0 8px;
  font-size: var(--text-xl);
  color: var(--ink);
}
.hw-view__meta {
  display: flex;
  gap: 16px;
  color: var(--ink-soft);
  font-size: var(--text-sm);
}

.hw-q {
  padding: 14px 0;
  border-bottom: 1px dashed var(--line);
}
.hw-q__no {
  font-weight: 700;
  color: var(--ink);
  margin-bottom: 6px;
}
.hw-q__tag {
  margin-left: 6px;
}
.hw-q__title {
  margin: 4px 0;
}
.hw-q__opts {
  margin: 8px 0 0 22px;
}
.hw-q__opt {
  margin: 2px 0;
  color: var(--ink-regular);
}
.hw-q__body {
  margin-top: 8px;
  color: var(--ink-regular);
}
</style>
