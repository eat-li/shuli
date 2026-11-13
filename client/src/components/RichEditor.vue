<template>
  <div class="rich-editor" :class="{ 're-fullscreen': isFullscreen, 'is-auto-grow': autoGrow }">
    <RichEditorToolbar
      v-if="editor"
      :editor="editor"
      :is-fullscreen="isFullscreen"
      :ai-loading="aiLoading"
      :diagram-visible="diagramVisible"
      :allow-source="allowSource"
      :source-visible="sourceVisible"
      @pick-image="pickImage"
      @open-diagram="diagramVisible = true"
      @ai-command="onAiCommand"
      @toggle-fullscreen="toggleFullscreen"
      @toggle-source="toggleSource"
    />

    <div class="re-body" :class="{ 'is-split': sourceVisible }">
      <RichSourcePanel v-if="sourceVisible" :html="sourceHtml" />
      <editor-content :editor="editor" class="re-content" />
    </div>
    <input ref="fileInput" type="file" accept="image/*" class="re-hidden" @change="onFileChange" />

    <RichImagePreview :visible="preview.visible" :src="preview.src" @close="closePreview" />

    <RichAiPreviewDialog
      v-model="aiDialog.visible"
      :title="aiDialog.title"
      :issue-text="aiDialog.issueText"
      :original-html="aiDialog.originalHtml"
      :result-html="aiDialog.resultHtml"
      :can-retry="aiDialog.canRetry"
      :retrying="aiLoading"
      :applying="aiApplying"
      @retry="retryAiFormat"
      @apply="applyAiResult"
    />

    <!-- 插入图表：Mermaid / ECharts 渲染成 PNG → 上传 OSS → 以 <img> 插入。
         消毒器会剥掉 <svg>/<canvas>，位图是唯一能穿过保存与导出链路的形态。 -->
    <DiagramDialog v-if="diagramLoaded" v-model="diagramVisible" @insert="onDiagramInsert" />
  </div>
</template>

<script setup lang="ts">
import {
  ref,
  reactive,
  computed,
  watch,
  onMounted,
  onBeforeUnmount,
  nextTick,
  defineAsyncComponent
} from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useEditor, EditorContent, VueNodeViewRenderer } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
// 别名导入：tiptap 的 Image 扩展不能遮蔽全局 Image 构造器，
// 否则 readImageSize() 里的 new Image() 会去构造扩展对象（TypeError: not a constructor），
// 粘贴/选择图片都会在上传成功后卡在「量像素」这一步，图片永远插不进编辑器。
import TiptapImage from '@tiptap/extension-image'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import { FontSize } from './font-size-extension'
import { Mathematics } from './math-extension'
import { ElMessage, ElMessageBox, ElLoading } from 'element-plus'
import { uploadImage } from '../api/upload'
import { getAiConfig, formatQuestion } from '../api/ai'
import { loadAiConfig } from '../utils/aiConfig'
import { escapeStrayLt, sanitizeRichHtml } from '../utils/sanitizeHtml'
import { markdownTableToHtml } from '../utils/markdownTable'
import {
  normalizeMathDelimiters,
  textToParagraphsHtml,
  renderMathInHtml
} from '../utils/mathRender'
import { normalizeAiMathHtml, validateAiMath } from '../utils/aiMath'
import { matchImageUrl } from '../utils/imageUrl'
import { latexToHtml, looksLikeLatex } from '../utils/latexPaste'
import { normalizeStemHtml } from '../utils/stemFormat'
import RichEditorToolbar from './rich-editor/RichEditorToolbar.vue'
import RichImagePreview from './rich-editor/RichImagePreview.vue'
import RichAiPreviewDialog from './rich-editor/RichAiPreviewDialog.vue'
import RichSourcePanel from './rich-editor/RichSourcePanel.vue'
import ImageNodeView from './rich-editor/ImageNodeView.vue'
import { ImageRow } from './rich-editor/imageRow'

// 图表对话框内含 echarts 与 html-to-image（合计约 600KB），只有点「插入图表」才用得到。
// 静态 import 会让所有使用编辑器的页面（题目、结论、讲义）首屏就下载它们。
const DiagramDialog = defineAsyncComponent(() => import('./DiagramDialog.vue'))

const props = defineProps<{
  modelValue: string
  /**
   * 告诉 AI 排版「这个编辑器装的是哪个字段」。
   * 题干/补充说明里出现的答案是模型凭空补的，后端会删掉；
   * 答案与解析字段本身就是答案，必须传 answer，否则排版结果会被误删。
   */
  aiField?: 'stem' | 'body' | 'answer' | 'auto'
  /** 是否在工具栏提供「源码」开关：题目表单里开启，其它宿主保持原样 */
  allowSource?: boolean
  /**
   * 高度交给宿主：编辑器不再自带 320px 的滚动区。
   * 用在「弹窗整体滚动」的表单里，避免弹窗和每个编辑器各有一条滚动条。
   */
  autoGrow?: boolean
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const fileInput = ref<HTMLInputElement>()
const { t } = useI18n()

// 源码面板：只读显示当前 HTML，与编辑器内容实时同步
const allowSource = computed(() => props.allowSource === true)
const sourceVisible = ref(false)
const sourceHtml = ref('')

const toggleSource = () => {
  if (!allowSource.value) return
  sourceVisible.value = !sourceVisible.value
  if (sourceVisible.value) sourceHtml.value = editor.value?.getHTML() || props.modelValue || ''
}

// 上传图片的默认显示宽度：原图更宽时压到这个值，更窄时保持原宽
const DEFAULT_IMAGE_MAX_WIDTH = 520

/* ===================== AI 排版 / 本地公式修复 ===================== */
const router = useRouter()
const aiLoading = ref(false)
const aiApplying = ref(false)

// 排版结果预览对话框
const aiDialog = reactive({
  visible: false,
  title: '',
  originalHtml: '',
  resultHtml: '',
  rawHtml: '', // 原始（未渲染）结果 HTML，用于「替换内容」
  issueText: '',
  canRetry: false,
  resultSource: '' // 本次结果来源，用于重试时区分 'ai' / 'local'
})

const onAiCommand = (cmd: string) => {
  if (cmd === 'local') runLocalMathFix()
  else if (cmd === 'ai') runAiFormat()
}

// 预览渲染：消毒 + 公式渲染
const renderPreviewHtml = (html: string) => renderMathInHtml(sanitizeRichHtml(html || ''))

// 打开预览对话框（original 为当前编辑器内容，result 为处理结果）
const openAiPreview = (title: string, resultHtml: string, canRetry: boolean) => {
  aiDialog.title = title
  aiDialog.originalHtml = renderPreviewHtml(editor.value?.getHTML() || '')
  aiDialog.rawHtml = resultHtml
  aiDialog.resultHtml = renderPreviewHtml(resultHtml)
  aiDialog.canRetry = canRetry
  aiDialog.issueText = ''
  const v = validateAiMath(resultHtml)
  if (v.total && v.failed.length) {
    aiDialog.issueText =
      t('ai.format.issueFailed', { total: v.total, failed: v.failed.length }) +
      v.failed
        .slice(0, 3)
        .map((f) => f.content)
        .join(' ｜ ')
  } else if (v.total === 0) {
    aiDialog.issueText = t('ai.format.issueNone')
  }
  aiDialog.visible = true
}

// 本地公式修复：不联网，立即对当前内容做 Unicode→LaTeX / 定界符归一化
const runLocalMathFix = () => {
  const current = editor.value?.getHTML() || ''
  const { html, changed } = normalizeAiMathHtml(current)
  if (!changed) {
    ElMessage.info(t('ai.format.localNoChange'))
    return
  }
  aiDialog.resultSource = 'local'
  openAiPreview(t('ai.format.localPreviewTitle'), html, false)
}

// AI 智能排版：调用后端大模型，返回结果先规范化再预览
const runAiFormat = async () => {
  const text = editor.value?.getText().trim()
  if (!text) {
    ElMessage.warning(t('ai.format.needContent'))
    return
  }

  const cfg = loadAiConfig()
  let payload: any = { text, field: props.aiField || 'auto' }

  if (cfg.apiKey) {
    // 前端本地配置优先
    payload = { ...payload, apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, model: cfg.model }
  } else {
    // 本地没配 Key 时，看后端 .env 是否已配置
    try {
      const backend = await getAiConfig()
      if (!backend.hasBackendKey) {
        await ElMessageBox.confirm(t('ai.config.missing'), t('common.tips'), {
          confirmButtonText: t('ai.config.goSettings'),
          cancelButtonText: t('common.cancel'),
          type: 'warning'
        })
        router.push('/settings')
        return
      }
      payload = { ...payload, apiKey: '', baseUrl: backend.baseUrl, model: backend.model }
    } catch {
      // 获取后端配置失败时已由 request.ts 统一提示
      return
    }
  }

  await requestAiFormat(payload)
}

// 发起 AI 请求（含超时提示与进度反馈）；失败返回 false
const requestAiFormat = async (payload: any): Promise<boolean> => {
  aiLoading.value = true
  const loading = ElLoading.service({
    text: t('ai.format.loading'),
    background: 'rgba(0,0,0,0.3)'
  })
  const t0 = Date.now()
  const timer = setInterval(() => {
    loading.setText(t('ai.format.loadingProgress', { sec: Math.round((Date.now() - t0) / 1000) }))
  }, 1000)
  try {
    const { html } = await formatQuestion(payload)
    // 先做本地规范化（Unicode 符号 / 定界符），再预览
    const { html: normalized } = normalizeAiMathHtml(html || '')
    const safe = sanitizeRichHtml(normalized)
    if (!safe.trim()) {
      ElMessage.warning(t('ai.format.emptyResult'))
      return false
    }
    aiDialog.resultSource = 'ai'
    openAiPreview(t('ai.format.previewTitle'), safe, true)
    return true
  } catch (e: any) {
    // 超时/网络/接口错误已由 request.ts 统一提示；这里补充引导
    const isTimeout = e?.code === 'ECONNABORTED' || /超时/.test(e?.message || '')
    ElMessageBox.alert(
      isTimeout ? t('ai.format.timeoutText') : t('ai.format.failText'),
      isTimeout ? t('ai.format.timeoutTitle') : t('ai.format.failTitle'),
      { confirmButtonText: t('ai.config.gotIt'), type: isTimeout ? 'warning' : 'error' }
    ).catch(() => {})
    return false
  } finally {
    clearInterval(timer)
    loading.close()
    aiLoading.value = false
  }
}

// 重试：按来源再次执行
const retryAiFormat = () => {
  aiDialog.visible = false
  if (aiDialog.resultSource === 'ai') runAiFormat()
  else runLocalMathFix()
}

// 应用结果：用原始 HTML 替换编辑器内容（编辑器内部再按数学扩展渲染）
const applyAiResult = () => {
  aiApplying.value = true
  try {
    editor.value?.commands.setContent(
      sanitizeRichHtml(props.aiField === 'stem' ? normalizeStemHtml(aiDialog.rawHtml) : aiDialog.rawHtml),
      false
    )
    // ⚠️ setContent 默认 emitUpdate=false，不会触发 onUpdate → v-model 不更新，
    // 保存时会提交排版前的内容。必须手动把新内容同步给父组件（form.title）。
    emit('update:modelValue', editor.value?.getHTML() || '')
    ElMessage.success(t('ai.format.applied'))
    aiDialog.visible = false
  } finally {
    aiApplying.value = false
  }
}

// 全屏编辑模式
const isFullscreen = ref(false)
const toggleFullscreen = () => {
  isFullscreen.value = !isFullscreen.value
  document.body.style.overflow = isFullscreen.value ? 'hidden' : ''
  nextTick(() => editor.value?.commands.focus())
}

// 图片节点增加 width / height / align 属性：
//   width  —— 手动缩放时写入，落库后仍是「显示宽度」
//   height —— 只在上传瞬间写一次原始像素高，用于让浏览器按属性推导长宽比，
//             图片未下载完就能占住正确高度（消除布局抖动）。
//             一旦老师手动改宽度，写入会把它清空，避免长宽比被写死成错的。
//   align  —— 左/中/右。必须落成 class 而不是内联 style：
//             sanitizeRichHtml 会剥掉 style，class 能穿过保存、浏览、打印链路。
const ResizableImage = TiptapImage.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: { default: null },
      height: { default: null },
      align: {
        default: 'center',
        parseHTML: (el: HTMLElement) => {
          if (el.classList.contains('re-img--left')) return 'left'
          if (el.classList.contains('re-img--right')) return 'right'
          return 'center'
        },
        renderHTML: (attrs: Record<string, any>) => {
          if (attrs.align === 'left') return { class: 're-img--left' }
          if (attrs.align === 'right') return { class: 're-img--right' }
          return {}
        }
      }
    }
  },
  // 选中图片后由节点视图接管：工具条（对齐/尺寸/删除）与左右拖拽把手都在图上，
  // 不再为了改个宽度弹全屏遮罩。
  addNodeView() {
    return VueNodeViewRenderer(ImageNodeView)
  }
})

const editor = useEditor({
  // 进编辑器前先转义裸 <：库里改造前的老数据带的是没转义的小于号，ProseMirror 按 HTML
  // 解析时会把它当成标签开头一路吞到下一个 >。浏览态走 sanitizeRichHtml 没事，
  // 一打开编辑就少半句，再保存等于把丢字写回库——这是不可逆的。
  content: escapeStrayLt(props.modelValue || ''),
  extensions: [
    StarterKit,
    ResizableImage,
    ImageRow,
    Mathematics,
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    FontSize
  ],
  editorProps: {
    // 处理粘贴：图片文件上传 OSS；整段图片地址直接成图；Markdown 表格自动转换
    handlePaste: (_view, event) => {
      const items = event.clipboardData?.items
      if (items) {
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile()
            if (file) {
              uploadAndInsert(file)
              return true
            }
          }
        }
      }
      const hasHtml = Boolean(event.clipboardData?.getData('text/html'))
      const text = event.clipboardData?.getData('text/plain')
      // 整段 LaTeX 源码（\documentclass / \begin{enumerate} / \item / \(...\) …）：
      // 编辑器只认 $...$ 与 HTML，直接粘会变成一堆源码，这里先翻译成 HTML + $ 公式
      // 只在没有 HTML 分片时才走这条：从网页复制的图文里，plain text 常常也带着
      // \( \) 这类片段，被误判成 LaTeX 源码就把图片和表格全丢了。
      if (!hasHtml && looksLikeLatex(text || '')) {
        editor.value
          ?.chain()
          .focus()
          .insertContent(latexToHtml(text || ''))
          .run()
        return true
      }
      // 整段就是一个图片地址（例如从「图形库」复制的 OSS 链接）→ 直接插入图片节点，
      // 而不是留成一串纯文本。带 HTML 的复制（从网页复制图文）交给 tiptap 默认处理，
      // 免得把图文混排的内容压成一张图。
      const pastedImageUrl = !hasHtml ? matchImageUrl(text || '') : null
      if (pastedImageUrl) {
        editor.value?.chain().focus().setImage({ src: pastedImageUrl }).run()
        return true
      }
      if (text) {
        const tableHtml = markdownTableToHtml(text)
        if (tableHtml) {
          insertMarkdownTable?.(tableHtml)
          return true
        }
        // 归一化数学定界符（$$ 包裹 $ 的错误嵌套 / 多行公式压成单行）
        const normalized = normalizeMathDelimiters(text)
        if (normalized !== text) {
          insertNormalizedPaste?.(normalized)
          return true
        }
      }
      return false
    }
  },
  onUpdate: ({ editor: ed }) => {
    const html = ed.getHTML()
    emit('update:modelValue', html)
    if (sourceVisible.value) sourceHtml.value = html
  }
})

// 外部回填（加载已有题目 / AI 排版应用）时，源码面板跟着更新
watch(
  () => props.modelValue,
  (v) => {
    if (sourceVisible.value) sourceHtml.value = v || ''
  }
)

// 供 handlePaste 在编辑器创建后调用（插入 Markdown 表格）
let insertMarkdownTable: ((html: string) => void) | null = null
insertMarkdownTable = (html) => {
  editor.value?.chain().focus().insertContent(html).run()
}

// 供 handlePaste 插入归一化后的粘贴文本（按 HTML 解析，保留段落/换行）
let insertNormalizedPaste: ((text: string) => void) | null = null
insertNormalizedPaste = (text) => {
  editor.value?.chain().focus().insertContent(textToParagraphsHtml(text)).run()
}

// 外部回显（编辑已有题目时把 HTML 塞回编辑器）
watch(
  () => props.modelValue,
  (val) => {
    if (!editor.value) return
    // 与初始 content 同一套转义，且拿转义后的结果和 getHTML() 比：
    // 直接比原始值会永远不相等，每次回显都多刷一次 setContent。
    const next = escapeStrayLt(val || '')
    if (next !== editor.value.getHTML()) editor.value.commands.setContent(next, false)
  }
)

// 读取图片原始像素尺寸。失败（损坏文件 / 环境无 Image）时返回 0，
// 调用方据此决定是否写 width/height —— 不写就是老行为，不会更差。
function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file)
    const probe = new Image()
    const finish = (size: { width: number; height: number }) => {
      URL.revokeObjectURL(objectUrl)
      resolve(size)
    }
    probe.onload = () => finish({ width: probe.naturalWidth, height: probe.naturalHeight })
    probe.onerror = () => finish({ width: 0, height: 0 })
    probe.src = objectUrl
  })
}

// 上传图片文件到 OSS，成功后插入编辑器
async function uploadAndInsert(file: File) {
  if (!file.type.startsWith('image/')) {
    ElMessage.warning(t('editor.image.selectOnly'))
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    ElMessage.warning(t('editor.image.tooLarge'))
    return
  }
  const loading = ElLoading.service({
    text: t('editor.image.uploading'),
    background: 'rgba(0,0,0,0.3)'
  })
  try {
    // 尺寸探测与上传并行：探测只读本地文件，不产生额外网络开销
    const [{ url }, size] = await Promise.all([uploadImage(file), readImageSize(file)])
    const attrs: Record<string, string> = { src: url }
    if (size.width > 0 && size.height > 0) {
      // 默认不通栏：大截图按原图像素宽插入会占满整行，先把宽度压到 520，
      // 高度按同一比例缩放，避免浏览器先按原始长宽比渲染出细长条。
      const width = Math.min(size.width, DEFAULT_IMAGE_MAX_WIDTH)
      attrs.width = String(width)
      attrs.height = String(Math.round(size.height * (width / size.width)))
    }
    // 用 insertContent 而非 setImage：setImage 的命令签名不认 width/height
    editor.value?.chain().focus().insertContent({ type: 'image', attrs }).run()
  } catch (e: any) {
    // 错误提示已由 request.ts 全局拦截器统一弹出
    console.error('图片上传失败', e)
  } finally {
    loading.close()
  }
}

const pickImage = () => fileInput.value?.click()

const onFileChange = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) await uploadAndInsert(file)
  input.value = ''
}

/* ===================== 插入图表（Mermaid / ECharts） ===================== */
const diagramVisible = ref(false)
// 第一次打开才挂载异步对话框；关闭后保持挂载，避免每次重开都重新加载并重置内部状态
const diagramLoaded = ref(false)
watch(diagramVisible, (open) => {
  if (open) diagramLoaded.value = true
})

// 图表已由对话框渲染成 PNG 并上传 OSS，这里只负责按指定宽度插入图片节点。
// 用 insertContent 而不是 setImage：ResizableImage 在 schema 上多声明了 width，
// 但 setImage 的命令类型签名只认 src/alt/title，走 JSON 内容才能把宽度一起写进节点
// （宽度落库后仍可点击图片继续缩放）。
const onDiagramInsert = (payload: { url: string; width: number }) => {
  editor.value
    ?.chain()
    .focus()
    .insertContent({
      type: 'image',
      attrs: { src: payload.url, width: String(Math.round(payload.width)) }
    })
    .run()
  ElMessage.success(t('editor.diagramInserted'))
}

/* ===================== 图片大图预览 ===================== */
// 宽度与对齐已经搬到图片节点自带的工具条上，这里只剩「看大图」：
// 双击图片，或点图上工具条里的放大镜。图片节点通过 re:image-preview 事件上报地址。
const preview = reactive({ visible: false, src: '' })

let previewTarget: HTMLElement | null = null
const onImagePreviewEvent = (e: Event) => {
  const src = (e as CustomEvent<{ src?: string }>).detail?.src || ''
  if (!src) return
  preview.src = src
  preview.visible = true
}
watch(editor, (ed) => {
  previewTarget?.removeEventListener('re:image-preview', onImagePreviewEvent)
  previewTarget = ed?.view.dom || null
  previewTarget?.addEventListener('re:image-preview', onImagePreviewEvent)
})

const closePreview = () => {
  preview.visible = false
}

const onKeydown = (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return
  if (preview.visible) closePreview()
  else if (isFullscreen.value) toggleFullscreen()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  previewTarget?.removeEventListener('re:image-preview', onImagePreviewEvent)
  document.body.style.overflow = ''
})

// 命令式接口：讲义页需要「把题库里的题目插到光标处」，而不是整体替换 v-model。
// 插入走 Tiptap 的 insertContent，会并入当前撤销栈，老师可以 Ctrl+Z 撤回。
defineExpose({
  insertContent: (html: string) => {
    if (!editor.value || !html) return false
    editor.value.chain().focus().insertContent(html).run()
    return true
  },
  focus: () => editor.value?.chain().focus().run(),
  /** 取纯文本：讲义页用它数已有题号，决定新插入的题目编到第几号 */
  getText: () => editor.value?.getText() || ''
})
</script>

<style scoped>
.rich-editor {
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  overflow: hidden;
  /* 撑满宿主宽度。宿主是 .el-form-item__content（display:flex），不写 width 时
     它按**内容宽度**收缩：实测发表结论页里富文本只有 501px，而同一表单的标题/摘要
     都是 770px，编辑器明显比其它字段窄一截（题目编辑弹窗里三处同样如此）。
     Element Plus 自己的 .el-input 就是 width:100%，这里对齐它；讲义页宿主是普通块级
     .paper-doc，本来就是通宽，加这句不改变现状。 */
  width: 100%;
}
/* —— 全屏编辑模式 —— */
/* ⚠️ 祖先卡片的 hover 位移必须让位（本项目踩过的大坑，改这段前先读完）：
   v4 起 `.el-card:hover` 已不再位移，但这条防御保留 —— 任何祖先一旦重新引入
   transform（hover 态也算），全屏就会退回下面的老问题。
   按 CSS 规范，祖先只要带 transform（哪怕是 hover 态下才有）就会成为 position:fixed
   的包含块 —— 于是下面那句 inset:0 不是相对视口、而是相对**卡片**解析，全屏后编辑器
   只有卡片那么大。更糟的是它和 :hover 互相触发，构成每帧一次的死循环：
     鼠标在卡外 → 卡片无 transform → 编辑器真的铺满视口 → 视口被自己的 fixed 子树盖住
     → 卡片 :hover 成立 → transform 回来 → 编辑器缩回卡片大小 → 指针又落在卡外 → …
   CDP 逐帧实测：55 帧里 :hover 翻了 33:22，transform 过渡被反复打断、读到 11 个不同
   的中间值 —— 这就是「页面一直抖动、编辑器有时全屏有时又不」的成因。
   解法用 :has() 纯声明式完成，不引入 body 标记：状态本来就写在 DOM 上，
   再往 body 上复制一份反而多一份要同步/清理的全局状态（本项目已经有一处
   document.body.style.overflow 在跨组件争用）。特异性 (0,3,1) 已经压过
   .el-card 的 hover / active / is-never-shadow 三组变体，不需要 !important。 */
:global(body:has(.rich-editor.re-fullscreen) .el-card) {
  transform: none;
}
.rich-editor.re-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 3000;
  /* width:100% 会盖过 inset 的 right:0（两者都非 auto 时 right 被忽略），
     显式收回，让覆盖层的尺寸只由 inset 决定 */
  width: auto;
  border: none;
  border-radius: 0;
  background: var(--paper);
  display: flex;
  flex-direction: column;
}
.rich-editor.re-fullscreen .re-toolbar {
  flex-wrap: nowrap;
  overflow-x: auto;
}
.rich-editor.re-fullscreen .re-body {
  flex: 1;
  min-height: 0;
}
.rich-editor.re-fullscreen .re-content {
  flex: 1;
  max-height: none;
  overflow-y: auto;
  padding: 16px 20px;
  background: var(--surface);
}
.rich-editor.re-fullscreen .re-body.is-split > .re-source {
  max-height: none;
}
.rich-editor.re-fullscreen .re-content :deep(.ProseMirror) {
  min-height: calc(100vh - 140px);
}
.re-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-height: 0;
}
/* 源码 42% / 渲染 58%：左侧只读，右侧仍是原来的可视化编辑器 */
.re-body.is-split {
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
}
.re-body > .re-content {
  min-width: 0;
}
.re-body.is-split > .re-source {
  max-height: 320px;
  border-right: 1px solid var(--line);
}
.re-content {
  padding: 8px 12px;
  max-height: 320px;
  overflow-y: auto;
}
/* 高度交给宿主（题目弹窗整体滚动），避免弹窗与每个编辑器各一条滚动条。
   全屏时例外：那层自己就是一屏，仍要能滚。 */
.rich-editor.is-auto-grow:not(.re-fullscreen) .re-content {
  max-height: none;
  overflow-y: visible;
}
.re-content :deep(.ProseMirror) {
  min-height: 100px;
}
/* 鼠标点进来不留焦点环（视觉噪音），键盘 Tab 进来必须看得见焦点 */
.re-content :deep(.ProseMirror:focus:not(:focus-visible)) {
  outline: none;
}
/* 图片默认样式：居中、圆角、防撑破。
   水平位置由 ImageNodeView 的 .re-fig[data-align] 决定，这里不再写 margin auto —— 
   否则会盖掉左/右对齐。 */
.re-content :deep(.ProseMirror img) {
  max-width: 100%;
  /* 编辑态同样限高：整页扫描件塞进编辑器会顶掉工具栏和正文 */
  max-height: var(--content-figure-max-h);
  object-fit: contain;
  border-radius: var(--radius-xs);
  display: block;
  margin: 0;
  cursor: default;
  transition: box-shadow var(--dur) var(--ease);
}
.re-content :deep(.ProseMirror img:hover) {
  box-shadow: 0 0 0 2px var(--moss-soft);
}
.re-content :deep(.ProseMirror img.ProseMirror-selectednode) {
  box-shadow: 0 0 0 2px var(--moss);
}
.re-content :deep(.ProseMirror p) {
  margin: 0 0 4px;
}
/* 块级公式（$$...$$）单独成行 */
.re-content :deep(.Tiptap-mathematics-render--display) {
  display: block;
  margin: 6px 0;
  overflow-x: auto;
}
/* —— 表格 —— */
.re-content :deep(.tableWrapper) {
  overflow-x: auto;
  margin: 8px 0;
}
.re-content :deep(table) {
  border-collapse: collapse;
  width: 100%;
  min-width: 320px;
}
.re-content :deep(th),
.re-content :deep(td) {
  border: 1px solid var(--line);
  padding: 6px 10px;
  vertical-align: top;
  text-align: left;
}
.re-content :deep(th) {
  background: var(--surface-muted);
  font-weight: 600;
}
.re-content :deep(.selectedCell) {
  background: var(--moss-soft);
}
.re-content :deep(.column-resize-handle) {
  background: var(--moss);
  width: 2px;
}
.re-hidden {
  display: none;
}
/* 窄屏放不下左右分栏：源码在上、渲染在下，各自限高 */
@media (max-width: 820px) {
  .re-body.is-split {
    grid-template-columns: minmax(0, 1fr);
  }
  .re-body.is-split > .re-source {
    max-height: 40vh;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
}
</style>
