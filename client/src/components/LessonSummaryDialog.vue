<template>
  <el-dialog
    :model-value="modelValue"
    :title="t('homeworkDialogs.summary.title')"
    width="94%"
    style="max-width: 1320px"
    top="4vh"
    append-to-body
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="summary-layout" v-loading="loading">
      <!-- 左：编辑 -->
      <div class="summary-form">
        <div v-if="homeworkTitle" class="summary-hw">
          {{ t('homeworkDialogs.summary.homeworkOf', { title: homeworkTitle }) }}
        </div>
        <el-form label-width="86px" size="small">
          <el-form-item :label="t('summaryList.student')">
            <el-select
              v-model="form.studentId"
              clearable
              :placeholder="t('homeworkDialogs.summary.studentPlaceholder')"
              style="width: 100%"
              @change="onStudentChange"
            >
              <el-option
                v-for="s in students"
                :key="s.id"
                :label="s.grade ? `${s.name}（${gradeLabel(s.grade)}）` : s.name"
                :value="s.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('summaryList.lessonTime')">
            <el-date-picker
              v-model="form.lessonAt"
              type="datetime"
              value-format="YYYY-MM-DD HH:mm:ss"
              :placeholder="t('homeworkDialogs.summary.lessonTimePlaceholder')"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('homeworkDialogs.summary.lessonNo')">
            <el-input-number v-model="form.lessonNo" :min="1" :max="999" />
            <span class="opt-hint">{{ t('homeworkDialogs.summary.lessonNoHint') }}</span>
          </el-form-item>
          <el-form-item :label="t('homeworkDialogs.summary.extraNotes')">
            <el-input
              v-model="form.extraNotes"
              :placeholder="t('homeworkDialogs.summary.extraNotesPlaceholder')"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :icon="MagicStick" :loading="generating" @click="generate">{{
              t('homeworkDialogs.summary.generate')
            }}</el-button>
            <span class="opt-hint">{{
              t('homeworkDialogs.summary.questionCount', { n: questionCount })
            }}</span>
          </el-form-item>
        </el-form>

        <div class="summary-field">
          <div class="summary-field__label">{{ t('homeworkDialogs.summary.sectionContent') }}</div>
          <el-input
            v-model="form.content"
            type="textarea"
            :autosize="{ minRows: 3, maxRows: 7 }"
            :placeholder="t('homeworkDialogs.summary.contentPlaceholder')"
          />
        </div>
        <div class="summary-field">
          <div class="summary-field__label">{{ t('homeworkDialogs.summary.sectionStatus') }}</div>
          <el-input
            v-model="form.classStatus"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 6 }"
            :placeholder="t('homeworkDialogs.summary.statusPlaceholder')"
          />
        </div>
        <div class="summary-field">
          <div class="summary-field__label">{{ t('homeworkDialogs.summary.sectionTask') }}</div>
          <el-input
            v-model="form.homeworkTask"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 6 }"
            :placeholder="t('homeworkDialogs.summary.taskPlaceholder')"
          />
        </div>

        <div v-if="history.length" class="summary-history">
          <div class="summary-field__label">{{ t('homeworkDialogs.summary.historyTitle') }}</div>
          <div
            v-for="h in history"
            :key="h.id"
            class="summary-history__item"
            :class="{ 'is-active': h.id === form.id }"
            @click="applySummary(h)"
          >
            <span class="summary-history__time">{{
              h.lessonAt ? formatDateTime(h.lessonAt) : t('homeworkDialogs.summary.noTime')
            }}</span>
            <span class="summary-history__no">{{
              t('summaryList.lessonNo', { n: h.lessonNo ?? '—' })
            }}</span>
            <span class="summary-history__who">{{
              h.student?.name || t('homeworkDialogs.summary.noStudent')
            }}</span>
            <el-button link type="danger" size="small" @click.stop="remove(h)">{{
              t('common.delete')
            }}</el-button>
          </div>
        </div>
      </div>

      <!-- 右：预览（导出图片/PDF 的目标） -->
      <div class="summary-preview">
        <div ref="cardRef" class="summary-card">
          <div class="summary-card__head">
            <div v-if="schoolName" class="summary-card__school">{{ schoolName }}</div>
            <div class="summary-card__title">
              {{ t('homeworkDialogs.summary.title') }}
            </div>
            <div class="summary-card__meta">
              <span>{{
                t('homeworkDialogs.summary.cardStudent', { name: studentName || '—' })
              }}</span>
              <span>{{
                t('homeworkDialogs.summary.cardTime', {
                  value: form.lessonAt ? formatDateTime(form.lessonAt) : '—'
                })
              }}</span>
              <span>{{
                t('homeworkDialogs.summary.cardLessonNo', { n: form.lessonNo ?? '—' })
              }}</span>
            </div>
          </div>
          <div class="summary-card__body">
            <section v-for="sec in sections" :key="sec.label">
              <h4>{{ sec.label }}</h4>
              <template v-if="paragraphs(sec.text).length">
                <p v-for="(para, i) in paragraphs(sec.text)" :key="i">{{ para }}</p>
              </template>
              <p v-else class="summary-card__empty">
                {{ t('homeworkDialogs.summary.pending') }}
              </p>
            </section>
          </div>
          <div class="summary-card__foot">{{ t('homeworkDialogs.summary.cardFooter') }}</div>
        </div>
      </div>
    </div>
    <template #footer>
      <div class="summary-footer">
        <span class="summary-tip">{{ t('homeworkDialogs.summary.footerTip') }}</span>
        <span class="summary-actions">
          <el-button @click="emit('update:modelValue', false)">{{
            t('homeworkDialogs.summary.close')
          }}</el-button>
          <el-button :icon="Download" :loading="exporting" @click="exportImage">{{
            t('homeworkDialogs.summary.exportImage')
          }}</el-button>
          <el-button :icon="Printer" @click="exportPdf">{{ t('homework.exportPdf') }}</el-button>
          <el-button type="primary" :loading="saving" @click="save">{{
            t('common.save')
          }}</el-button>
        </span>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Download, Printer, MagicStick } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { toPng } from 'html-to-image'
import {
  getSummary,
  getSummaries,
  createSummary,
  updateSummary,
  deleteSummary
} from '../api/summary'
import { getHomework, getHomeworkQuestions } from '../api/homework'
import { getStudents } from '../api/student'
import { generateLessonSummary, getAiConfig } from '../api/ai'
import { loadAiConfig } from '../utils/aiConfig'
import { gradeLabel } from '../utils/i18nLabels'
import { printHtml, PAPER_FONT } from '../utils/printHtml'

const props = defineProps<{
  modelValue: boolean
  /** 从作业列表进入时传入 */
  homeworkId?: number | null
  /** 从总结列表进入时传入（编辑已有总结） */
  summaryId?: number | null
  /** 导出时页眉显示学校名（可选） */
  schoolName?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'saved'): void
}>()

const { t } = useI18n()

const cardRef = ref<HTMLElement>()
const loading = ref(false)
const generating = ref(false)
const saving = ref(false)
const exporting = ref(false)

const homeworkId = ref<number | null>(null)
const homeworkTitle = ref('')
const students = ref<any[]>([])
const questionCount = ref(0)
const history = ref<any[]>([])

const form = reactive<any>({
  id: null,
  studentId: null,
  lessonAt: '',
  lessonNo: 1,
  content: '',
  classStatus: '',
  homeworkTask: '',
  extraNotes: ''
})

const studentName = computed(() => students.value.find((s) => s.id === form.studentId)?.name || '')

const sections = computed(() => [
  { label: t('homeworkDialogs.summary.sectionContent'), text: form.content },
  { label: t('homeworkDialogs.summary.sectionStatus'), text: form.classStatus },
  { label: t('homeworkDialogs.summary.sectionTask'), text: form.homeworkTask }
])

// 日期格式化统一走 utils/format：以前这里另写了一份 YYYY-MM-DD HH:mm，
// 与列表页的 Intl 格式在同一屏里出现两种写法（D10）。
import { formatDateTime } from '../utils/format'

// 文本按换行拆成段落，保证「一段一段」的排版
const paragraphs = (text: unknown): string[] =>
  String(text || '')
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)


const nowDateTime = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:00`
}

// 依据历史记录推荐「第几次课」：同一学生取最大次数 +1
const suggestLessonNo = (studentId: number | null): number => {
  const rel = history.value.filter((h) => (studentId ? h.studentId === studentId : true))
  const max = rel.reduce((m: number, h: any) => Math.max(m, Number(h.lessonNo) || 0), 0)
  return max + 1
}

const resetForm = () => {
  form.id = null
  form.studentId = null
  form.lessonAt = nowDateTime()
  form.lessonNo = 1
  form.content = ''
  form.classStatus = ''
  form.homeworkTask = ''
  form.extraNotes = ''
}

// 用一条已有总结填充表单
const applySummary = (row: any) => {
  form.id = row.id
  form.studentId = row.studentId ?? null
  form.lessonAt = row.lessonAt ? String(row.lessonAt).replace('T', ' ').slice(0, 19) : ''
  form.lessonNo = row.lessonNo ?? 1
  form.content = row.content || ''
  form.classStatus = row.classStatus || ''
  form.homeworkTask = row.homeworkTask || ''
  form.extraNotes = ''
}

// 打开时载入：作业信息 + 可选学生 + 题目数 + 历史总结
const open = async () => {
  loading.value = true
  try {
    let hwId = props.homeworkId ?? null
    let preset: any = null
    if (props.summaryId) {
      preset = await getSummary(props.summaryId)
      hwId = preset?.homeworkId ?? hwId
    }
    if (!hwId) return
    homeworkId.value = hwId

    const detail = await getHomework(hwId)
    homeworkTitle.value = detail?.title || ''
    const ids: number[] = (detail as any)?.studentIds || []

    const [qs, hist, all] = await Promise.all([
      getHomeworkQuestions(hwId),
      getSummaries({ homeworkId: hwId }),
      ids.length ? getStudents() : Promise.resolve([])
    ])
    questionCount.value = qs.length
    history.value = hist || []
    students.value = (all as any[]).filter((s: any) => ids.includes(s.id))

    if (preset) {
      applySummary(preset)
    } else {
      resetForm()
      if (students.value.length === 1) form.studentId = students.value[0].id
      form.lessonNo = suggestLessonNo(form.studentId)
    }
  } catch {
    // 错误提示已由 request.ts 统一弹出
  } finally {
    loading.value = false
  }
}

watch(
  () => props.modelValue,
  (v) => {
    if (v) open()
  },
  { immediate: true }
)

const onStudentChange = () => {
  form.lessonNo = suggestLessonNo(form.studentId)
}

// AI 生成：后端读取该作业题目 → 三段文本
const generate = async () => {
  if (!homeworkId.value) return
  generating.value = true
  try {
    const cfg = loadAiConfig()
    const payload: any = {
      homeworkId: homeworkId.value,
      studentId: form.studentId || null,
      extraNotes: form.extraNotes || ''
    }
    if (cfg.apiKey) {
      payload.apiKey = cfg.apiKey
      payload.baseUrl = cfg.baseUrl
      payload.model = cfg.model
    } else {
      const backend = await getAiConfig()
      if (!backend.hasBackendKey) {
        await ElMessageBox.confirm(
          t('homeworkDialogs.summary.noAiKey'),
          t('common.tips'),
          {
            confirmButtonText: t('homeworkDialogs.summary.goSettings'),
            cancelButtonText: t('common.cancel'),
            type: 'warning'
          }
        )
        return
      }
      payload.baseUrl = backend.baseUrl
      payload.model = backend.model
    }
    const res = await generateLessonSummary(payload)
    if (res.content) form.content = res.content
    if (res.classStatus) form.classStatus = res.classStatus
    if (res.homeworkTask) form.homeworkTask = res.homeworkTask
    ElMessage.success(t('homeworkDialogs.summary.generated'))
  } catch (err: any) {
    if (err !== 'cancel' && err !== 'close' && !err?.isApiError) {
      console.error('生成课时总结失败', err)
    }
  } finally {
    generating.value = false
  }
}

const reloadHistory = async () => {
  if (!homeworkId.value) return
  history.value = (await getSummaries({ homeworkId: homeworkId.value })) || []
}

const save = async () => {
  if (!homeworkId.value) return
  if (!form.lessonAt) {
    ElMessage.warning(t('homeworkDialogs.summary.noLessonTime'))
    return
  }
  const payload = {
    homeworkId: homeworkId.value,
    studentId: form.studentId || null,
    lessonAt: form.lessonAt,
    lessonNo: form.lessonNo ?? null,
    content: form.content || null,
    classStatus: form.classStatus || null,
    homeworkTask: form.homeworkTask || null
  }
  saving.value = true
  try {
    if (form.id) {
      await updateSummary(form.id, payload)
      ElMessage.success(t('homeworkDialogs.summary.updated'))
    } else {
      const created: any = await createSummary(payload)
      form.id = created?.id ?? null
      ElMessage.success(t('homeworkDialogs.summary.saved'))
    }
    await reloadHistory()
    emit('saved')
  } catch (err) {
    console.error('保存课时总结失败', err)
  } finally {
    saving.value = false
  }
}

const remove = async (row: any) => {
  try {
    await ElMessageBox.confirm(t('summaryList.deleteConfirm'), t('common.tips'), {
      type: 'warning'
    })
  } catch {
    return
  }
  try {
    await deleteSummary(row.id)
    if (form.id === row.id) resetForm()
    ElMessage.success(t('summaryList.deleted'))
    await reloadHistory()
    emit('saved')
  } catch (err) {
    console.error('删除课时总结失败', err)
  }
}

// 导出 PNG：克隆到离屏固定容器里截图（隔离弹窗/滚动/transform 偏移），
// skipFonts 避免字体嵌入失败导致文字重排，显式宽高避免取整误差。
const exportImage = async () => {
  const node = cardRef.value
  if (!node) return
  exporting.value = true
  const holder = document.createElement('div')
  try {
    holder.style.cssText = 'position:fixed;left:-10000px;top:0;background:#ffffff;z-index:-1;'
    const clone = node.cloneNode(true) as HTMLElement
    clone.style.margin = '0'
    clone.style.boxShadow = 'none'
    holder.appendChild(clone)
    document.body.appendChild(holder)

    const width = Math.ceil(clone.getBoundingClientRect().width) || 660
    const height = Math.ceil(clone.getBoundingClientRect().height) || 800
    const dataUrl = await toPng(clone, {
      width,
      height,
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      skipFonts: true,
      style: { margin: '0', boxShadow: 'none' }
    })
    const name = `${summaryFileName()}.png`
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    ElMessage.success(t('homeworkDialogs.summary.imageExported'))
  } catch (err) {
    console.error('导出图片失败', err)
    ElMessage.error(t('homeworkDialogs.summary.imageExportFailed'))
  } finally {
    holder.remove()
    exporting.value = false
  }
}

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

// 打印 HTML（与预览卡片同款排版；$...$ 公式由 printHtml 渲染）
const buildPrintHtml = () => {
  const fs = 15
  const section = (label: string, text: string) => {
    const ps = paragraphs(text)
    return `<div style="margin-top:18px;">
      <div style="font-size:${fs + 1}px;font-weight:700;color:#2f4f45;margin-bottom:6px;">${label}</div>
      ${
        ps.length
          ? ps
              .map(
                (t) =>
                  `<p style="margin:0 0 6px;text-indent:2em;text-align:justify;line-height:1.9;">${escapeHtml(t)}</p>`
              )
              .join('')
          : `<p style="margin:0;color:#aaa;">${escapeHtml(t('homeworkDialogs.summary.emptySection'))}</p>`
      }
    </div>`
  }
  return `<div style="font-family:${PAPER_FONT};font-size:${fs}px;color:#222;padding:32px 40px;max-width:760px;margin:0 auto;background:#fff;">
    <div style="text-align:center;border-bottom:2px solid #333;padding-bottom:12px;">
      ${props.schoolName ? `<div style="font-size:${fs + 1}px;letter-spacing:3px;color:#444;">${escapeHtml(props.schoolName)}</div>` : ''}
      <div style="font-size:${fs + 9}px;font-weight:700;letter-spacing:6px;margin:6px 0 10px;">${escapeHtml(t('homeworkDialogs.summary.title'))}</div>
      <div style="display:flex;justify-content:space-between;font-size:${fs - 2}px;color:#555;">
        <span>${escapeHtml(t('homeworkDialogs.summary.cardStudent', { name: studentName.value || '—' }))}</span>
        <span>${escapeHtml(t('homeworkDialogs.summary.cardTime', { value: form.lessonAt || '—' }))}</span>
        <span>${escapeHtml(t('homeworkDialogs.summary.cardLessonNo', { n: form.lessonNo ?? '—' }))}</span>
      </div>
    </div>
    ${section(t('homeworkDialogs.summary.sectionContent'), form.content)}
    ${section(t('homeworkDialogs.summary.sectionStatus'), form.classStatus)}
    ${section(t('homeworkDialogs.summary.sectionTask'), form.homeworkTask)}
    <div style="margin-top:26px;padding-top:10px;border-top:1px dashed #ccc;text-align:center;font-size:${fs - 3}px;color:#999;">${escapeHtml(t('homeworkDialogs.summary.cardFooter'))}</div>
  </div>`
}

// 导出文件名：两种格式共用一个来源，避免图片与 PDF 的文件名不一致
const summaryFileName = () =>
  t('homeworkDialogs.summary.fileName', {
    student: studentName.value || t('homeworkDialogs.summary.unspecified'),
    date: (form.lessonAt || '').slice(0, 10) || String(Date.now())
  })

const exportPdf = () => {
  const okFlag = printHtml(summaryFileName(), buildPrintHtml())
  if (!okFlag) ElMessage.warning(t('gradeAnalysis.popupBlocked'))
}
</script>

<style scoped>
.summary-layout {
  display: flex;
  gap: 16px;
  height: 72vh;
}
.summary-form {
  width: 460px;
  flex-shrink: 0;
  overflow-y: auto;
  padding-right: 6px;
  border-right: 1px solid var(--line);
}
.summary-hw {
  margin-bottom: 10px;
  padding: 6px 10px;
  border-radius: var(--radius-xs);
  background: var(--paper-deep);
  color: var(--ink-soft);
  font-size: 12px;
}
.summary-field {
  margin-bottom: 12px;
}
.summary-field__label {
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
}
.opt-hint {
  margin-left: 6px;
  font-size: 12px;
  color: var(--ink-soft);
}
.summary-history {
  margin-top: 18px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}
.summary-history__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  margin-bottom: 6px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  font-size: 12px;
  color: var(--ink-soft);
  cursor: pointer;
  transition:
    border-color var(--dur) var(--ease),
    background-color var(--dur) var(--ease);
}
.summary-history__item:hover {
  border-color: var(--moss);
}
.summary-history__item.is-active {
  background: var(--moss-soft);
  border-color: var(--moss);
  color: var(--moss-deep);
}
.summary-history__time {
  flex: 1;
  min-width: 0;
}
.summary-history__no,
.summary-history__who {
  flex-shrink: 0;
}
.summary-history__who {
  max-width: 72px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.summary-preview {
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: 16px;
  background: var(--paper-deep);
  border-radius: var(--radius);
}

/* 导出目标卡片：颜色/字体写死，保证导出的 PNG 与预览一致 */
.summary-card {
  width: 660px;
  margin: 0 auto;
  padding: 34px 40px 26px;
  /* 卡片内部颜色/字体写死：它是导出 PNG 的目标，必须与导出结果完全一致，
     只有卡片外部的投影属于界面层，可以跟随主题。 */
  background: #ffffff;
  color: #222;
  font-family: 'Times New Roman', 'Times', '宋体', 'SimSun', serif;
  font-size: 15px;
  line-height: 1.9;
  box-shadow: var(--shadow-paper);
}
.summary-card__head {
  padding-bottom: 12px;
  border-bottom: 2px solid #333;
}
.summary-card__school {
  text-align: center;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 3px;
  color: #444;
}
.summary-card__title {
  margin: 6px 0 10px;
  text-align: center;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 6px;
}
.summary-card__meta {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
  color: #555;
}
.summary-card__body h4 {
  margin: 20px 0 6px;
  font-size: 15px;
  font-weight: 700;
  color: #2f4f45;
}
.summary-card__body p {
  margin: 0 0 6px;
  text-align: justify;
  text-indent: 2em;
  word-break: break-word;
}
.summary-card__empty {
  color: #aaa;
  text-indent: 0;
}
.summary-card__foot {
  margin-top: 26px;
  padding-top: 10px;
  border-top: 1px dashed #ccc;
  text-align: center;
  font-size: 12px;
  color: #999;
}
.summary-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  text-align: left;
}
.summary-tip {
  font-size: 12px;
  color: var(--ink-soft);
  line-height: 1.5;
}
.summary-actions {
  flex-shrink: 0;
}
</style>
