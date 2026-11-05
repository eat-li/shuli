<template>
  <el-dialog
    :model-value="modelValue"
    :title="t('diagramDialog.title')"
    width="920px"
    top="4vh"
    append-to-body
    destroy-on-close
    @update:model-value="onModelValue"
    @opened="onOpened"
  >
    <div class="dg-body">
      <!-- ── 左：配置 ── -->
      <div class="dg-side">
        <el-radio-group v-model="kind" size="small" class="dg-kind">
          <el-radio-button value="mermaid">{{ t('diagramDialog.tabMermaid') }}</el-radio-button>
          <el-radio-button value="chart">{{ t('diagramDialog.tabChart') }}</el-radio-button>
        </el-radio-group>

        <template v-if="kind === 'mermaid'">
          <div class="dg-field">
            <span class="dg-field__label">{{ t('diagramDialog.templateLabel') }}</span>
            <el-select v-model="mmdTemplate" size="small" @change="onMermaidTemplateChange">
              <el-option
                v-for="(tpl, key) in MERMAID_TEMPLATES"
                :key="key"
                :label="t(`diagramTemplates.${key}`)"
                :value="key"
              />
            </el-select>
          </div>
          <el-input
            v-model="mmdCode"
            type="textarea"
            :rows="12"
            spellcheck="false"
            class="dg-code"
            :placeholder="t('diagramDialog.mermaidPlaceholder')"
          />
          <p class="dg-tip">
            {{ t('diagramDialog.hint1') }}<code>graph TD</code>{{ t('diagramDialog.hint2')
            }}<code>graph LR</code>{{ t('diagramDialog.hint3') }}<code>mindmap</code
            >{{ t('diagramDialog.hint4') }}<code>A[&quot;$x^2$&quot;]</code
            >{{ t('diagramDialog.hint5') }}
          </p>
        </template>

        <template v-else>
          <div class="dg-field">
            <span class="dg-field__label">{{ t('diagramDialog.typeLabel') }}</span>
            <el-radio-group v-model="chartKind" size="small">
              <el-radio-button v-for="(tpl, key) in CHART_TEMPLATES" :key="key" :value="key">
                {{ t(`diagramTemplates.${key}`) }}
              </el-radio-button>
            </el-radio-group>
          </div>
          <div class="dg-field dg-field--between">
            <span class="dg-field__label">{{ t('diagramDialog.dataLabel') }}</span>
            <el-switch
              v-model="chartAdvanced"
              size="small"
              :active-text="t('diagramDialog.advancedJson')"
            />
          </div>
          <el-input
            v-if="!chartAdvanced"
            v-model="chartRaw"
            type="textarea"
            :rows="7"
            spellcheck="false"
            class="dg-code"
            :placeholder="CHART_TEMPLATES[chartKind].placeholder"
          />
          <el-input
            v-else
            v-model="chartJson"
            type="textarea"
            :rows="12"
            spellcheck="false"
            class="dg-code"
            :placeholder="t('diagramDialog.chartPlaceholder')"
          />
          <p class="dg-tip">
            {{ t('diagramDialog.chartHint') }}
          </p>
        </template>

        <div class="dg-field dg-field--size">
          <span class="dg-field__label">{{ t('diagramDialog.widthLabel') }}</span>
          <el-input-number
            v-model="insertWidth"
            size="small"
            :min="200"
            :max="1000"
            :step="20"
            controls-position="right"
          />
          <template v-if="kind === 'chart'">
            <span class="dg-field__label">{{ t('diagramDialog.heightLabel') }}</span>
            <el-input-number
              v-model="insertHeight"
              size="small"
              :min="140"
              :max="900"
              :step="20"
              controls-position="right"
            />
          </template>
        </div>
      </div>

      <!-- ── 右：预览 ── -->
      <div class="dg-preview">
        <div class="dg-preview__head">
          <span>{{ t('diagramDialog.preview') }}</span>
          <span class="dg-preview__meta">
            {{
              t('diagramDialog.insertInfo', {
                w: insertWidth,
                w2: insertWidth * 2,
                h2: outputHeight * 2
              })
            }}
          </span>
        </div>
        <div v-loading="mmdLoading" class="dg-preview__body">
          <div class="dg-paper" :style="paperStyle">
            <div v-if="kind === 'mermaid'" ref="mmdHost" class="dg-mmd" v-html="mmdSvg"></div>
            <div v-else ref="chartHost" class="dg-chart" :style="chartStyle"></div>
          </div>
          <el-alert
            v-if="errorText"
            :title="errorText"
            type="error"
            :closable="false"
            show-icon
            class="dg-error"
          />
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="onModelValue(false)">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="busy" :disabled="!canInsert" @click="confirm">
        {{ t('diagramDialog.insert') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox, vLoading } from 'element-plus'
import { toPng } from 'html-to-image'
import echarts from '../utils/echarts'
import { uploadImage } from '../api/upload'
import { CHART_OPTION_SAMPLE, CHART_TEMPLATES, MERMAID_TEMPLATES } from '../utils/diagramTemplates'
import { DIAGRAM_FONT, dataUrlToBlob, parseChartOption } from '../utils/diagramRender'

const { t } = useI18n()

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'insert', payload: { url: string; width: number }): void
}>()

type Kind = 'mermaid' | 'chart'
type MermaidKey = keyof typeof MERMAID_TEMPLATES
type ChartKey = keyof typeof CHART_TEMPLATES

const kind = ref<Kind>('mermaid')
const errorText = ref('')
const busy = ref(false)
const insertWidth = ref(640)
const insertHeight = ref(400)

/* ══════════════ Mermaid（流程图 / 关系图 / 思维导图） ══════════════ */
const mmdHost = ref<HTMLDivElement>()
const mmdTemplate = ref<MermaidKey>('flowchart')
const mmdCode = ref(MERMAID_TEMPLATES.flowchart.code)
const mmdSvg = ref('')
const mmdLoading = ref(false)
const mmdBox = ref({ w: 0, h: 0 })
let mmdTimer: number | undefined

// mermaid 体积较大（含各图类型分包），只在真正打开对话框时动态 import，
// 不进首屏包；initialize 只做一次。
let mermaidPromise: Promise<any> | null = null
const loadMermaid = () => {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid')
      .then((mod: any) => {
        const mermaid = mod?.default || mod
        mermaid.initialize({
          startOnLoad: false,
          // 默认的 strict 会 sanitize 标签里的 HTML（保留 <br> 等基础标签），
          // 本地应用也按默认走，避免粘贴来的图形带事件处理器。
          securityLevel: 'strict',
          theme: 'base',
          themeVariables: { fontFamily: DIAGRAM_FONT, fontSize: '14px' },
          // useMaxWidth:false 让 SVG 带明确宽高，便于按固定宽度导出位图
          flowchart: { htmlLabels: true, curve: 'basis', useMaxWidth: false },
          mindmap: { useMaxWidth: false }
        })
        return mermaid
      })
      .catch((e) => {
        mermaidPromise = null
        throw e
      })
  }
  return mermaidPromise
}

// 代码变化后防抖渲染，避免每敲一个字都重排一次
const scheduleMermaid = () => {
  window.clearTimeout(mmdTimer)
  mmdTimer = window.setTimeout(() => void renderMermaid(), 400)
}

const measureMermaid = () => {
  const el = mmdHost.value
  if (el) mmdBox.value = { w: el.offsetWidth, h: el.offsetHeight }
}

const renderMermaid = async () => {
  const code = mmdCode.value.trim()
  if (!code) {
    mmdSvg.value = ''
    errorText.value = ''
    return
  }
  const id = 'dg-mmd-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
  mmdLoading.value = true
  try {
    const mermaid = await loadMermaid()
    const { svg } = await mermaid.render(id, code)
    mmdSvg.value = svg
    errorText.value = ''
    await nextTick()
    measureMermaid()
  } catch (e: any) {
    // 语法/渲染错误：保留上一次可用的图，只在下方提示，不打断编辑
    errorText.value = t('diagramDialog.mermaidFailed', {
      msg: String(e?.message || e).split('\n')[0]
    })
  } finally {
    // 渲染失败时 mermaid 可能在 body 里留下临时容器（#d<id>），统一清掉
    document.querySelectorAll(`body > [id="d${id}"]`).forEach((el) => el.remove())
    mmdLoading.value = false
  }
}

const onMermaidTemplateChange = (key: MermaidKey) => {
  mmdCode.value = MERMAID_TEMPLATES[key].code
}

/* ══════════════ ECharts（柱 / 折线 / 饼） ══════════════ */
const chartHost = ref<HTMLDivElement>()
const chartKind = ref<ChartKey>('bar')
const chartRaw = ref(CHART_TEMPLATES.bar.sample)
const chartAdvanced = ref(false)
const chartJson = ref(CHART_OPTION_SAMPLE)
let chart: ReturnType<typeof echarts.init> | null = null

const chartOption = computed<any | null>(() => {
  if (chartAdvanced.value) return parseChartOption(chartJson.value).option
  return CHART_TEMPLATES[chartKind.value].buildOption(chartRaw.value)
})

const renderChart = () => {
  if (kind.value !== 'chart') return
  const host = chartHost.value
  if (!host) return
  if (chartAdvanced.value) {
    errorText.value = parseChartOption(chartJson.value).error
  } else {
    errorText.value = ''
  }
  const option = chartOption.value
  if (!option) {
    chart?.clear()
    return
  }
  // destroy-on-close 会重建 DOM，这里按宿主节点判断是否需要重新 init
  if (!chart || chart.getDom() !== host) {
    chart?.dispose()
    chart = echarts.init(host)
  }
  chart.setOption(option, true)
  chart.resize()
}

/* ══════════════ 通用：尺寸 / 刷新 / 导出 / 上传 ══════════════ */
const paperStyle = computed(() =>
  kind.value === 'chart'
    ? { width: insertWidth.value + 'px', height: insertHeight.value + 'px' }
    : { width: insertWidth.value + 'px' }
)

const chartStyle = computed(() => ({
  width: insertWidth.value + 'px',
  height: insertHeight.value + 'px'
}))

const outputHeight = computed(() =>
  kind.value === 'chart' ? insertHeight.value : Math.max(1, Math.round(mmdBox.value.h || 300))
)

const canInsert = computed(() =>
  kind.value === 'mermaid' ? Boolean(mmdSvg.value) : Boolean(chartOption.value)
)

// 视图变化后统一刷新：统计图重绘（尺寸跟着纸面变化）、结构图按需补渲染 / 重新量尺寸
const refresh = async () => {
  if (!props.modelValue) return
  errorText.value = ''
  await nextTick()
  if (kind.value === 'mermaid') {
    // 首次打开或从统计图切回来时 mmdSvg 为空，补一次渲染；已有结果只需重新量尺寸
    if (!mmdSvg.value && !mmdLoading.value) await renderMermaid()
    else measureMermaid()
  } else {
    renderChart()
  }
}

const onOpened = () => void refresh()

const onModelValue = (v: boolean) => {
  emit('update:modelValue', v)
  if (!v) cleanup()
}

const cleanup = () => {
  window.clearTimeout(mmdTimer)
  chart?.dispose()
  chart = null
}

watch([kind, chartKind, chartRaw, chartJson, chartAdvanced, insertWidth, insertHeight], () => {
  void refresh()
})
watch(mmdCode, () => scheduleMermaid())
watch(
  () => props.modelValue,
  (v) => {
    if (v) void refresh()
    else cleanup()
  }
)
onBeforeUnmount(cleanup)

// 兜底方案：直接把 SVG 序列化后画进 canvas（html-to-image 抛错时使用）
const svgToPng = async (host: HTMLElement, width: number, height: number): Promise<string> => {
  const svg = host.querySelector('svg')
  if (!svg) throw new Error(t('diagramDialog.noGraphic'))
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  const url =
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(new XMLSerializer().serializeToString(clone))
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error(t('diagramDialog.toImageFailed')))
    img.src = url
  })
  const canvas = document.createElement('canvas')
  canvas.width = width * 2
  canvas.height = height * 2
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error(t('diagramDialog.noCanvas'))
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

// 导出 PNG dataURL：统计图直接取 canvas；结构图交给 html-to-image 把 DOM 转位图
// （mermaid 的 HTML 标签 + 内嵌 <style> 走同一条路，与 LessonSummaryDialog 的导出方式一致）
const exportDataUrl = async (): Promise<string> => {
  if (kind.value === 'mermaid') {
    const host = mmdHost.value
    if (!host || !mmdSvg.value) throw new Error(t('diagramDialog.chartNotReady'))
    const width = insertWidth.value
    const height = Math.max(40, Math.round(mmdBox.value.h || 300))
    try {
      return await toPng(host, {
        width,
        height,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        // 图形用的是系统字体，跳过「把所有 @font-face 字体下载并内联」这一步，
        // 导出更快，也避免被 KaTeX 等外部字体拖慢 / 失败
        skipFonts: true
      })
    } catch {
      return await svgToPng(host, width, height)
    }
  }
  if (!chart) throw new Error(t('diagramDialog.chartNotReady'))
  return chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' })
}

const confirm = async () => {
  if (!canInsert.value || busy.value) return
  busy.value = true
  try {
    const dataUrl = await exportDataUrl()
    const width = insertWidth.value
    let url = ''
    try {
      const file = new File([dataUrlToBlob(dataUrl)], `diagram-${Date.now()}.png`, {
        type: 'image/png'
      })
      url = (await uploadImage(file)).url
    } catch {
      // 上传失败（OSS 未配置 / 网络异常）时，允许退化为内嵌 dataURL：
      // 优点是离线也能存下来，代价是内容体积明显变大，所以交给老师确认。
      try {
        await ElMessageBox.confirm(
          t('diagramDialog.uploadFailedConfirm'),
          t('diagramDialog.uploadFailedTitle'),
          {
            confirmButtonText: t('diagramDialog.inlineInsert'),
            cancelButtonText: t('common.cancel'),
            type: 'warning'
          }
        )
        url = dataUrl
      } catch {
        return
      }
    }
    emit('insert', { url, width })
    emit('update:modelValue', false)
  } catch (e: any) {
    ElMessage.error(t('diagramDialog.chartFailed', { msg: String(e?.message || e) }))
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.dg-body {
  display: flex;
  gap: 16px;
}
.dg-side {
  width: 348px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.dg-kind {
  width: 100%;
}
.dg-field {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dg-field--between {
  justify-content: space-between;
}
.dg-field__label {
  font-size: 13px;
  color: var(--ink-soft);
  flex-shrink: 0;
}
.dg-code :deep(textarea) {
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12.5px;
  line-height: 1.6;
}
.dg-tip {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--ink-soft);
}
.dg-tip code {
  padding: 1px 4px;
  border-radius: var(--radius-xs);
  background: rgba(0, 0, 0, 0.05);
}
.dg-preview {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.dg-preview__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
  background: var(--surface-muted);
  border-bottom: 1px solid var(--hair);
}
.dg-preview__meta {
  font-size: 12px;
  font-weight: 400;
  color: var(--ink-soft);
  font-variant-numeric: tabular-nums;
}
.dg-preview__body {
  flex: 1;
  min-height: 340px;
  max-height: 54vh;
  overflow: auto;
  padding: 14px;
  background: var(--surface);
}
.dg-paper {
  box-sizing: content-box;
  padding: 10px;
  /* audit-allow —— 纯白是画布本身：这张图会被 toPng 导出成位图，底色必须是
     确定的纯白，不能跟随屏幕主题的 --card-bg（两者当前同值，但语义不同，勿合并）。 */
  background: #fff;
  border: 1px solid var(--hair);
  border-radius: var(--radius-xs);
}
/* mermaid 注入的 SVG 是 v-html 内容，scoped 样式必须用 :deep 才能命中 */
.dg-mmd :deep(svg) {
  display: block;
  width: 100% !important;
  height: auto !important;
}
.dg-error {
  margin-top: 10px;
}
</style>
