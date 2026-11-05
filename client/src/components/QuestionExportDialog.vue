<template>
  <el-dialog
    :model-value="modelValue"
    :title="t('questionExport.title')"
    width="460px"
    @update:model-value="emit('update:modelValue', $event)"
    @open="onOpen"
  >
    <div class="scope">
      <span class="scope__label">{{ t('questionExport.scopeLabel') }}</span>
      <span class="scope__name">{{ scopeLabel }}</span>
      <span class="scope__count">{{
        loading ? t('questionExport.counting') : t('questionExport.count', { n: questions.length })
      }}</span>
    </div>

    <el-form label-width="104px" class="opts">
      <el-form-item :label="t('questionExport.answerLabel')">
        <el-switch v-model="withAnswer" />
        <span class="hint">{{ t('questionExport.answerHint') }}</span>
      </el-form-item>
      <el-form-item :label="t('questionExport.blankLabel')">
        <el-switch v-model="showAnswerArea" />
        <el-input-number
          v-if="showAnswerArea"
          v-model="answerAreaHeight"
          :min="20"
          :max="500"
          :step="20"
          size="small"
          style="margin-left: 10px; width: 110px"
        />
        <span v-if="showAnswerArea" class="hint">{{ t('questionExport.pixelHint') }}</span>
      </el-form-item>
      <el-form-item v-if="allowGroup" :label="t('questionExport.groupLabel')">
        <el-switch v-model="groupByKnowledge" />
        <span class="hint">{{ t('questionExport.groupHint') }}</span>
      </el-form-item>
      <el-form-item :label="t('questionExport.bgLabel')">
        <el-color-picker v-model="backgroundColor" :predefine="PRESET_BG_COLORS" />
        <input
          v-model="bgColorInput"
          type="color"
          :title="t('questionExport.bgPickerTitle')"
          style="
            margin-left: 10px;
            width: 42px;
            height: 32px;
            padding: 0;
            border: 1px solid var(--el-border-color);
            border-radius: var(--radius-xs);
            background: none;
            cursor: pointer;
          "
        />
        <span class="hint">{{ t('questionExport.bgHint') }}</span>
      </el-form-item>
      <el-form-item v-if="backgroundColor" :label="t('questionExport.textLabel')">
        <el-color-picker v-model="textColor" :predefine="PRESET_TEXT_COLORS" />
        <span class="hint">{{ t('questionExport.textHint') }}</span>
      </el-form-item>
    </el-form>

    <el-alert type="info" :closable="false" show-icon :title="t('questionExport.printHint')" />

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">{{ t('common.cancel') }}</el-button>
      <el-button
        type="primary"
        :loading="busy"
        :disabled="loading || !questions.length"
        @click="doExport"
      >
        {{ t('questionExport.exportBtn') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { getAllQuestions } from '../api/question'
import type { QuestionQuery } from '../api/question'
import { buildQuestionPaperHtml } from '../utils/questionPaper'
import { printHtml } from '../utils/printHtml'

const { t } = useI18n()

const props = defineProps<{
  modelValue: boolean
  /** 导出范围（筛选条件）；不传即整个题库 */
  scope?: QuestionQuery
  /** 范围名称：同时作为对话框里的说明与试卷大标题 */
  scopeLabel: string
  /** 是否提供「按知识点分组」（整库导出才有意义） */
  allowGroup?: boolean
  /** 试卷副标题（如筛选条件描述） */
  subtitle?: string
}>()

const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const loading = ref(false)
const busy = ref(false)
const questions = ref<any[]>([])
const withAnswer = ref(false)
const showAnswerArea = ref(false)
const answerAreaHeight = ref(100)
const groupByKnowledge = ref(false)
const backgroundColor = ref('')
const textColor = ref('')
// 原生取色框的当前值（不参与导出，仅作快捷选色入口）
const bgColorInput = ref('#ffffff')

// 预设色板：按 skill 设计规范的柔和色系挑的常用纸底色与配套文字色
const PRESET_BG_COLORS = [
  '#FFFFFF',
  '#FBF7EF',
  '#F5F1E8',
  '#EEF3EA',
  '#EAF2F8',
  '#FDF6EC',
  '#22303F',
  '#1A1A2E'
]
const PRESET_TEXT_COLORS = ['#222222', '#555555', '#F5F0E6', '#E8E8E8', '#FFD700']

// 快捷取色框选色 → 应用背景（原生 input 只认 #rrggbb 小写）
watch(bgColorInput, (v) => {
  if (v) backgroundColor.value = v.toUpperCase()
})
// 从选择器选色后同步取色框显示；清空选择器（恢复白底）时取色框回到白色
watch(backgroundColor, (v) => {
  bgColorInput.value = v ? v.slice(0, 7) : '#ffffff'
})

const onOpen = async () => {
  groupByKnowledge.value = Boolean(props.allowGroup)
  withAnswer.value = false
  showAnswerArea.value = false
  backgroundColor.value = ''
  textColor.value = ''
  bgColorInput.value = '#ffffff'
  loading.value = true
  try {
    questions.value = await getAllQuestions(props.scope || {})
  } catch {
    // 错误提示已由 request.ts 统一弹出
    questions.value = []
  } finally {
    loading.value = false
  }
}

const doExport = async () => {
  if (!questions.value.length) {
    ElMessage.warning(t('questionExport.noQuestions'))
    return
  }
  busy.value = true
  // 题量大时 renderMath + 打印窗口写入会占用主线程，先让浏览器把 loading 画出来再开工
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)))
  try {
    const title = t('questionExport.setTitle', { label: props.scopeLabel })
    const opened = printHtml(
      title,
      buildQuestionPaperHtml({
        title,
        subtitle: props.subtitle || '',
        questions: questions.value,
        withAnswer: withAnswer.value,
        answerAreaHeight: showAnswerArea.value ? answerAreaHeight.value : 0,
        groupByKnowledge: groupByKnowledge.value,
        backgroundColor: backgroundColor.value || undefined,
        textColor: textColor.value || undefined
      }),
      // 背景色同时交给打印工具：html/body 同色，保证多页导出时页边距区域也统一
      { backgroundColor: backgroundColor.value || undefined }
    )
    if (!opened) {
      ElMessage.warning(t('conclusionList.popupBlocked'))
      return
    }
    emit('update:modelValue', false)
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.scope {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding: 10px 14px;
  background: var(--paper-deep);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
}
.scope__label {
  font-size: 13px;
  color: var(--ink-soft);
  flex-shrink: 0;
}
.scope__name {
  font-weight: 700;
  color: var(--ink);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.scope__count {
  margin-left: auto;
  flex-shrink: 0;
  font-family: var(--font-data);
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  color: var(--moss-deep);
  background: var(--moss-soft);
  border-radius: var(--radius-pill);
  padding: 3px 9px;
}
.opts {
  margin-bottom: 4px;
}
.hint {
  margin-left: 10px;
  font-size: 12px;
  color: var(--ink-soft);
}
</style>
