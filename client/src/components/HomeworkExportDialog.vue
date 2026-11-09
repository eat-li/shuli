<template>
  <el-dialog
    :model-value="modelValue"
    :title="t('homeworkDialogs.export.title')"
    width="1000px"
    top="4vh"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <div class="export-layout">
      <div class="export-options">
        <el-form label-width="90px" size="small">
          <el-form-item :label="t('homeworkDialogs.export.showAnswer')">
            <el-switch v-model="layout.showAnswer" />
          </el-form-item>
          <el-form-item :label="t('homeworkDialogs.export.fontSize')">
            <el-radio-group v-model="layout.fontSize">
              <el-radio-button value="14">{{
                t('homeworkDialogs.export.sizeSmall')
              }}</el-radio-button>
              <el-radio-button value="16">{{
                t('homeworkDialogs.export.sizeMedium')
              }}</el-radio-button>
              <el-radio-button value="18">{{
                t('homeworkDialogs.export.sizeLarge')
              }}</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item :label="t('homeworkDialogs.export.lineHeight')">
            <el-radio-group v-model="layout.lineHeight">
              <el-radio-button value="1.6">{{
                t('homeworkDialogs.export.spacingCompact')
              }}</el-radio-button>
              <el-radio-button value="1.8">{{
                t('homeworkDialogs.export.spacingNormal')
              }}</el-radio-button>
              <el-radio-button value="2.2">{{
                t('homeworkDialogs.export.spacingLoose')
              }}</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item :label="t('homeworkDialogs.export.onePerPage')">
            <el-switch v-model="layout.onePerPage" />
          </el-form-item>
          <el-form-item v-if="layout.onePerPage" label=" ">
            <span class="opt-hint">{{ t('homeworkDialogs.export.onePerPageHint') }}</span>
          </el-form-item>
          <el-form-item :label="t('homeworkDialogs.export.answerArea')">
            <el-switch v-model="layout.showAnswerArea" :disabled="layout.onePerPage" />
          </el-form-item>
          <el-form-item
            v-if="layout.showAnswerArea && !layout.onePerPage"
            :label="t('homeworkDialogs.export.answerAreaHeight')"
          >
            <el-slider v-model="layout.answerAreaHeight" :min="20" :max="160" :step="10" />
          </el-form-item>
          <el-form-item :label="t('homeworkDialogs.export.showScore')">
            <el-switch v-model="layout.showScore" />
          </el-form-item>
          <el-form-item
            v-if="layout.showScore"
            :label="t('homeworkDialogs.export.scorePerQuestion')"
          >
            <el-input-number v-model="layout.scorePerQuestion" :min="1" :max="100" />
          </el-form-item>
          <el-form-item :label="t('homeworkDialogs.export.schoolName')">
            <el-input
              v-model="layout.schoolName"
              :placeholder="t('homeworkDialogs.export.schoolPlaceholder')"
            />
          </el-form-item>
          <el-form-item :label="t('homeworkDialogs.export.nameLine')">
            <el-switch v-model="layout.showNameLine" />
          </el-form-item>
          <el-form-item :label="t('homeworkDialogs.export.showType')">
            <el-switch v-model="layout.showType" />
          </el-form-item>
          <el-form-item :label="t('homeworkDialogs.export.showKnowledge')">
            <el-switch v-model="layout.showKnowledge" />
          </el-form-item>
          <el-form-item :label="t('homeworkDialogs.export.backgroundColor')">
            <el-color-picker v-model="layout.backgroundColor" :predefine="PRESET_BG_COLORS" />
            <input
              v-model="bgColorInput"
              type="color"
              :title="t('homeworkDialogs.export.pickBgColor')"
              class="bg-color-input"
            />
          </el-form-item>
          <el-form-item
            v-if="layout.backgroundColor"
            :label="t('homeworkDialogs.export.textColor')"
          >
            <el-color-picker v-model="layout.textColor" :predefine="PRESET_TEXT_COLORS" />
            <span class="opt-hint">{{ t('homeworkDialogs.export.textColorHint') }}</span>
          </el-form-item>
        </el-form>
      </div>
      <div class="export-preview">
        <div class="paper" v-html="previewHtml"></div>
      </div>
    </div>
    <template #footer>
      <div class="export-footer">
        <span class="export-tip">{{ t('homeworkDialogs.export.footerTip') }}</span>
        <span class="export-actions">
          <el-button @click="emit('update:modelValue', false)">{{ t('common.cancel') }}</el-button>
          <el-button
            :loading="publishingParentPdf"
            :title="t('homeworkDialogs.export.publishHint')"
            @click="publishParentPdf"
            >{{ t('homeworkDialogs.export.publishParentPdf') }}</el-button
          >
          <el-button type="primary" @click="doExport">{{ t('homework.exportPdf') }}</el-button>
        </span>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { printHtml, buildPrintDocument, PAPER_FONT } from '../utils/printHtml'
import { renderMathInHtml } from '../utils/mathRender'
import { sanitizeHtml, sanitizeRichHtml } from '../utils/sanitizeHtml'
import { publishHomeworkPdf } from '../api/homework'
import type { Homework, Question } from '../types'

const props = defineProps<{
  modelValue: boolean
  homework: Homework | null
  questions: Question[]
  students?: any[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
}>()

const { t, te } = useI18n()

// —— 排版选项 ——
const layout = reactive({
  showAnswer: false,
  fontSize: '16', // px
  lineHeight: '1.8',
  onePerPage: false, // 每题独占一页，余下为空白书写区
  showAnswerArea: true,
  answerAreaHeight: 60, // px
  showScore: false,
  scorePerQuestion: 5,
  schoolName: '',
  showNameLine: false,
  showType: false,
  showKnowledge: false,
  backgroundColor: '', // 留空 = 默认白底
  textColor: ''
})

// 预设色板（与题目导出对话框一致）
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

// 原生取色框的当前值（不参与导出，仅作快捷选色入口）
const bgColorInput = ref('#ffffff')
// 取色框选色 → 应用背景（原生 input 只认 #rrggbb 小写）
watch(bgColorInput, (v) => {
  if (v) layout.backgroundColor = v.toUpperCase()
})
// 选择器选色后同步取色框；清空选择器（恢复白底）时取色框回到白色
watch(
  () => layout.backgroundColor,
  (v) => {
    bgColorInput.value = v ? v.slice(0, 7) : '#ffffff'
  }
)

const typeLabel = (type: string) =>
  te(`questionType.${type}`) ? t(`questionType.${type}`) : type || ''

// HTML 转义，避免题目内容被解析为标签
const escapeHtml = (s: any) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }
    return map[c]
  })

const safeQuestionHtml = (html: unknown) => sanitizeRichHtml(String(html ?? ''))

// 生成「姓名/年级/分数」填写框（有值则预填，无值留空方框）
const fillLine = (val?: string) =>
  `<span style="display:inline-block;min-width:80px;height:1.6em;line-height:1.6em;border:1px solid #666;border-radius:2px;padding:0 6px;vertical-align:middle;">${escapeHtml(val ?? '') || '&nbsp;'}</span>`

type ExportLayout = typeof layout

// 根据排版选项生成作业纸 HTML（预览、导出、家长端 PDF 共用，保证所见即所得）
// overrides 用于「家长端 PDF」这类固定版式：不改弹窗里的选项，只改这一次的输出
const buildHomeworkHtml = (overrides: Partial<ExportLayout> = {}) => {
  const L: ExportLayout = { ...layout, ...overrides }
  const fs = Number(L.fontSize)
  const lh = L.lineHeight
  const title = props.homework?.title || t('homeworkDialogs.export.defaultTitle')
  const questions = props.questions
  const total = questions.reduce((s: number) => s + (L.showScore ? L.scorePerQuestion : 0), 0)

  // 自定义配色：未设置时沿用经典白底黑字；深色背景需同步传浅色文字
  const dark = !!L.textColor && L.textColor !== '#222222' && L.textColor !== '#222'
  const ink = L.textColor || '#222'
  const inkSoft = dark ? '#bbb' : '#555'
  const inkMuted = dark ? '#999' : '#777'
  const line = dark ? '#888' : '#333'
  const paperBg = L.backgroundColor || '#fff'

  const renderHeader = (st?: any) => `
    <div style="text-align:center;border-bottom:2px solid ${line};padding-bottom:12px;margin-bottom:18px;">
      ${L.schoolName ? `<div style="font-size:${fs + 2}px;font-weight:600;letter-spacing:3px;">${escapeHtml(L.schoolName)}</div>` : ''}
      <div style="font-size:${fs + 6}px;font-weight:700;margin:6px 0;">${escapeHtml(title)}</div>
      <div style="font-size:${fs - 2}px;color:${inkSoft};display:flex;justify-content:space-between;align-items:center;padding:0 6px;">
        ${
          L.showNameLine
            ? `<span>${escapeHtml(t('homeworkDialogs.export.fieldName'))}${fillLine(st?.name)}　${escapeHtml(t('homeworkDialogs.export.fieldGrade'))}${fillLine(st?.grade)}　${escapeHtml(t('homeworkDialogs.export.fieldScore'))}${fillLine('')}</span>`
            : '<span></span>'
        }
        ${L.showScore ? `<span>${escapeHtml(t('homeworkDialogs.export.totalScore', { n: total }))}</span>` : ''}
      </div>
    </div>`

  const renderBody = () =>
    questions
      .map((q, i) => {
        const no = i + 1
        const opts =
          q.options && Array.isArray(q.options)
            ? `<div style="margin:6px 0 0 22px;">${q.options
                .map((o: any, j: number) => {
                  const text =
                    typeof o === 'string'
                      ? o
                      : o && typeof o === 'object' && 'text' in o
                        ? o.text
                        : JSON.stringify(o)
                  return `<div style="margin:2px 0;">${String.fromCharCode(65 + j)}. ${escapeHtml(text)}</div>`
                })
                .join('')}</div>`
            : ''
        return `
      <div style="margin-bottom:16px;page-break-inside:avoid;">
        <div style="margin-bottom:4px;">
          <span style="font-weight:700;">${no}.</span>
          ${L.showType ? `<span style="color:${inkMuted};font-size:${fs - 2}px;margin-left:6px;">${escapeHtml(t('homeworkDialogs.export.typeTag', { type: typeLabel(q.type) }))}</span>` : ''}
          ${L.showKnowledge && q.knowledgeTag ? `<span style="color:${inkMuted};font-size:${fs - 2}px;margin-left:6px;">${escapeHtml(q.knowledgeTag)}${q.knowledgeSubTag ? ' › ' + escapeHtml(q.knowledgeSubTag) : ''}</span>` : ''}
          ${L.showScore ? `<span style="float:right;color:${inkMuted};">${escapeHtml(t('homeworkDialogs.export.scoreTag', { n: L.scorePerQuestion }))}</span>` : ''}
        </div>
        <div>${safeQuestionHtml(q.title)}</div>
        ${opts}
        ${q.body ? `<div style="margin-top:4px;">${safeQuestionHtml(q.body)}</div>` : ''}
        ${L.showAnswerArea && !L.onePerPage ? `<div style="height:${L.answerAreaHeight}px;"></div>` : ''}
        ${L.showAnswer && q.answer ? `<div style="color:${dark ? '#ff8a80' : '#c0392b'};margin-top:4px;"><b>${escapeHtml(t('homeworkDialogs.export.answerHeading'))}</b>${safeQuestionHtml(q.answer)}</div>` : ''}
      </div>
      ${
        L.onePerPage && i < questions.length - 1
          ? '<div class="page-break" style="page-break-after:always;"></div>'
          : ''
      }`
      })
      .join('')

  // 作业选中了学生：按学生每人一份（分页）；否则生成一份空模板
  const students = (props.students || []).length ? props.students! : [null]
  const paperStyle = `font-family:${PAPER_FONT};font-size:${fs}px;line-height:${lh};color:${ink};padding:28px;max-width:800px;margin:0 auto;background:${paperBg};`

  return students
    .map(
      (st, idx) =>
        `<div style="${paperStyle}${idx < students.length - 1 ? 'page-break-after:always;' : ''}">${renderHeader(st)}${renderBody()}</div>`
    )
    .join('')
}

// 预览 HTML：先消毒再公式渲染（与打印路径一致，堵住题目富文本潜在 XSS）
const previewHtml = computed(() => renderMathInHtml(sanitizeHtml(buildHomeworkHtml())))

// 每次打开恢复默认排版：默认不勾选分值/姓名栏/题型（用户可在对话框内手动勾选覆盖）
watch(
  () => props.modelValue,
  (v) => {
    if (!v) return
    layout.showAnswer = false
    layout.showScore = false
    layout.showNameLine = false
    layout.showType = false
    layout.showKnowledge = false
    layout.onePerPage = false
    layout.showAnswerArea = true
    layout.answerAreaHeight = 60
    layout.scorePerQuestion = 5
    layout.fontSize = '16'
    layout.lineHeight = '1.8'
    layout.backgroundColor = ''
    layout.textColor = ''
    bgColorInput.value = '#ffffff'
  },
  { immediate: true }
)

// 导出：写入独立打印窗口，触发浏览器“另存为 PDF”
const doExport = () => {
  if (!props.questions.length) {
    ElMessage.warning(t('homeworkDialogs.export.noQuestions'))
    return
  }
  // 背景色同时交给打印工具：html/body 同色，保证多页导出时页边距区域也统一
  const okFlag = printHtml(
    props.homework?.title || t('homeworkDialogs.export.defaultTitle'),
    buildHomeworkHtml(),
    {
      backgroundColor: layout.backgroundColor || undefined
    }
  )
  if (!okFlag) ElMessage.warning(t('gradeAnalysis.popupBlocked'))
}

// 家长端 PDF：固定「只有题目」的版式（不含答案/分数/姓名栏），
// 生成后上传 OSS（homework-pdf/<id>.pdf），小程序按作业 id 直接下载
const publishingParentPdf = ref(false)
const publishParentPdf = async () => {
  const homeworkId = Number(props.homework?.id)
  if (!homeworkId) return
  if (!props.questions.length) {
    ElMessage.warning(t('homeworkDialogs.export.noQuestions'))
    return
  }

  publishingParentPdf.value = true
  try {
    const body = buildHomeworkHtml({
      showAnswer: false,
      showScore: false,
      showNameLine: false,
      showType: false,
      showKnowledge: false
    })
    const html = buildPrintDocument(
      props.homework?.title || t('homeworkDialogs.export.defaultTitle'),
      body,
      { backgroundColor: layout.backgroundColor || undefined }
    )
    await publishHomeworkPdf(homeworkId, html)
    ElMessage.success(t('homeworkDialogs.export.publishSuccess'))
  } catch (e) {
    // 失败提示由请求拦截器统一弹出
  } finally {
    publishingParentPdf.value = false
  }
}
</script>

<style scoped>
.export-layout {
  display: flex;
  gap: 16px;
  height: 66vh;
}
.export-options {
  width: 300px;
  flex-shrink: 0;
  overflow-y: auto;
  border-right: 1px solid var(--line);
  padding-right: 12px;
}
.opt-hint {
  font-size: 12px;
  line-height: 1.6;
  color: var(--ink-soft);
}
.bg-color-input {
  margin-left: 10px;
  width: 42px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--el-border-color);
  border-radius: var(--radius-xs);
  background: none;
  cursor: pointer;
}
.export-preview {
  flex: 1;
  overflow: auto;
  background: var(--paper-deep);
  padding: 12px;
  border-radius: var(--radius-xs);
}
/* 预览中的分页标记：分页符本身无高度，打印窗口也没有这段样式，故只在预览里可见 */
.export-preview :deep(.page-break) {
  position: relative;
  margin: 20px 0;
  border-top: 1px dashed var(--line-strong);
}
.export-preview :deep(.page-break)::after {
  content: '分页';
  position: absolute;
  right: 0;
  top: -9px;
  padding: 0 8px;
  font-size: 11px;
  color: var(--ink-soft);
  /* audit-allow —— 必须与下方 .paper 预览的纸面同色（默认 #fff，由 layout.backgroundColor
     控制），否则遮挡线框的方角会露出底色。属打印介质，不随屏幕主题漂移。 */
  background: #fff;
}
.paper {
  box-shadow: var(--shadow-paper);
  /* audit-allow —— 纸张圆角：打印介质规格，不跟随界面圆角刻度 */
  border-radius: 2px;
  min-height: 100%;
}

.export-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  text-align: left;
}
.export-tip {
  font-size: 12px;
  color: var(--ink-soft);
  line-height: 1.5;
}
.export-actions {
  flex-shrink: 0;
}
</style>
