<template>
  <el-dialog
    :model-value="modelValue"
    :title="t('ai.conclusion.title')"
    width="860px"
    top="5vh"
    append-to-body
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <!-- 顶部：标题/分类只读展示 + 生成提示输入 -->
    <div class="ac-head">
      <div class="ac-meta">
        <span class="ac-meta__label">{{ t('ai.conclusion.titleLabel') }}</span>
        <span class="ac-meta__value">{{ title || t('ai.conclusion.emptyTitle') }}</span>
      </div>
      <div v-if="categoryName" class="ac-meta">
        <span class="ac-meta__label">{{ t('ai.conclusion.categoryLabel') }}</span>
        <span class="ac-meta__value">{{ categoryName }}</span>
      </div>
    </div>

    <el-input
      v-model="introText"
      type="textarea"
      :rows="3"
      maxlength="500"
      show-word-limit
      :placeholder="t('ai.conclusion.introPlaceholder')"
      style="margin-bottom: 12px"
    />

    <div class="ac-actions">
      <el-button type="primary" :icon="MagicStick" :loading="loading" @click="generate">{{
        hasResult ? t('ai.conclusion.regenerate') : t('ai.conclusion.generate')
      }}</el-button>
      <el-button v-if="hasResult" text :icon="Refresh" :loading="loading" @click="generate">
        {{ t('ai.conclusion.alternate') }}
      </el-button>
      <el-button v-if="loading" text type="danger" @click="stopStreaming">
        {{ t('ai.conclusion.stop') }}
      </el-button>
      <span v-if="loading" class="ac-stream-hint"> {{ streamHint }} · {{ waitingSec }}s </span>
    </div>

    <el-alert
      v-if="issueText"
      :title="issueText"
      :type="failedCount ? 'warning' : 'success'"
      :closable="false"
      show-icon
      style="margin: 10px 0 12px"
    />

    <div v-loading="loading" class="ac-preview">
      <div v-if="!hasResult && !loading && !streamChars" class="ac-empty">
        <el-empty :description="t('ai.conclusion.emptyHint')" />
      </div>
      <RichContent v-else :html="previewHtml" />
    </div>

    <template #footer>
      <el-button @click="close">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :icon="Check" :disabled="!hasResult || loading" @click="apply">
        {{ t('ai.conclusion.apply') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { MagicStick, Refresh, Check } from '@element-plus/icons-vue'
import { generateConclusionStream } from '../api/ai'
import { resolveAiCreds } from '../utils/aiConfig'
import { sanitizeRichHtml } from '../utils/sanitizeHtml'
import { normalizeAiMathHtml, validateAiMath } from '../utils/aiMath'
import RichContent from './RichContent.vue'

const props = defineProps<{
  modelValue: boolean
  title: string
  intro?: string
  categoryName?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'apply', payload: { content: string; summary: string; tags: string }): void
}>()

const { t } = useI18n()

const introText = ref(props.intro || '')
const loading = ref(false)
const rawHtml = ref('') // 已消毒、已提取注释后的干净 HTML（用于应用）
const previewHtml = ref('') // 渲染后 HTML（用于预览）
const summary = ref('')
const tags = ref('')
const issueText = ref('')
const failedCount = ref(0)

const hasResult = computed(() => Boolean(rawHtml.value))
// —— 流式状态 ——
// streamChars / waitingSec 仅用于「已接收 N 字 · 已等待 Ns」的进度提示；
// streamRaw 保存原始累积文本，中途停止或出错时还能把已收到的部分留下来用
const streamChars = ref(0)
const waitingSec = ref(0)
const streamRaw = ref('')
// 连接阶段：connecting（还没连上上游）→ connected（连上了但可能还没吐字）
const streamPhase = ref<'connecting' | 'connected'>('connecting')
// 推理型模型（deepseek-reasoner 等）的思考进度：这类模型会先思考很久，
// 不显示进度的话界面看着就像卡死
const thinkChars = ref(0)
const streamHint = computed(() => {
  if (thinkChars.value)
    return t('ai.stream.thinking', { chars: thinkChars.value })
  if (streamChars.value) return t('ai.stream.received', { chars: streamChars.value })
  if (streamPhase.value === 'connected') return t('ai.stream.connected')
  return t('ai.stream.connecting')
})

let streamAbort: AbortController | null = null
let waitTimer: number | undefined

// 预览用：还没闭合的 HTML 注释开头会把它后面的内容一起吞掉（连正文都不显示），
// 先剪掉尾巴上的半截注释。完整注释不用处理——RichContent 内部的消毒器会去掉注释节点。
// 这两个标记必须拼出来：Vite 依赖扫描会先把整个 SFC 里的 HTML 注释跨行替换掉，
// 字面量直接写在这里会把函数体当成注释一起吞掉（dev 启动时报 Unexpected "}"）。
const COMMENT_OPEN = '<' + '!--'
const COMMENT_CLOSE = '--' + '>'

const stripDanglingComment = (text: string) => {
  const i = text.lastIndexOf(COMMENT_OPEN)
  return i >= 0 && text.indexOf(COMMENT_CLOSE, i) < 0 ? text.slice(0, i) : text
}

const previewFromStream = (text: string) => sanitizeRichHtml(stripDanglingComment(text))

// 生成结束后统一处理：公式规范化 → 提取 SUMMARY/TAGS 注释 → 消毒 → 公式校验
const finishWithText = (raw: string, truncated: boolean) => {
  const { html: normalized } = normalizeAiMathHtml(raw || '')
  const sm = normalized.match(/<!--SUMMARY:(.*?)-->/i)
  const tg = normalized.match(/<!--TAGS:(.*?)-->/i)
  summary.value = sm ? sm[1].trim() : ''
  tags.value = tg ? tg[1].trim() : ''
  const cleaned = normalized
    .replace(/<!--SUMMARY:.*?-->/gi, '')
    .replace(/<!--TAGS:.*?-->/gi, '')
    .trim()
  const safe = sanitizeRichHtml(cleaned)
  rawHtml.value = safe
  previewHtml.value = safe // RichContent 内部还会再消毒并渲染公式
  const v = validateAiMath(safe)
  failedCount.value = v.failed.length
  if (truncated) {
    issueText.value = t('ai.conclusion.truncated', { len: safe.length })
  } else if (v.total && v.failed.length) {
    issueText.value =
      t('ai.conclusion.formulasFailed', { total: v.total, failed: v.failed.length }) +
      v.failed
        .slice(0, 3)
        .map((f) => f.content)
        .join(' ｜ ')
  } else if (v.total === 0) {
    issueText.value = t('ai.conclusion.noFormula')
  } else {
    issueText.value = t('ai.conclusion.formulasOk', { total: v.total })
  }
}

const stopStreaming = () => streamAbort?.abort()

const clearWaitTimer = () => {
  window.clearInterval(waitTimer)
  waitTimer = undefined
}

const generate = async () => {
  if (!props.title?.trim()) {
    ElMessage.warning(t('ai.conclusion.needTitle'))
    return
  }
  const creds = await resolveAiCreds()
  if (!creds) {
    try {
      await ElMessageBox.confirm(t('ai.config.missing'), t('common.tips'), {
        confirmButtonText: t('ai.config.goSettings'),
        cancelButtonText: t('common.cancel'),
        type: 'warning'
      })
      emit('update:modelValue', false)
    } catch {
      /* 取消 */
    }
    return
  }

  // 重新生成时先清空上一轮结果，避免「边生成边显示旧内容」造成误判
  loading.value = true
  issueText.value = ''
  failedCount.value = 0
  rawHtml.value = ''
  previewHtml.value = ''
  summary.value = ''
  tags.value = ''
  streamRaw.value = ''
  streamChars.value = 0
  waitingSec.value = 0
  streamPhase.value = 'connecting'
  thinkChars.value = 0

  const startedAt = Date.now()
  clearWaitTimer()
  waitTimer = window.setInterval(() => {
    waitingSec.value = Math.round((Date.now() - startedAt) / 1000)
  }, 500)

  streamAbort = new AbortController()
  let lastPaint = 0
  try {
    const { text, truncated, interrupted } = await generateConclusionStream(
      {
        title: props.title.trim(),
        intro: introText.value.trim() || undefined,
        categoryName: props.categoryName,
        ...creds
      },
      {
        // 上游已连接：把「正在连接模型…」换成「已连接模型，等待输出…」
        onConnected: () => {
          streamPhase.value = 'connected'
        },
        // 推理型模型的思考进度：这段可能持续几十秒到几分钟，
        // 必须显示出来，否则用户会以为卡死
        onThinking: (chars) => {
          thinkChars.value = chars
        },
        // 分片到达：累积原文，并按 200ms 节流刷新预览（避免每个字都重排一次公式）
        onDelta: (_piece, full) => {
          streamRaw.value = full
          streamChars.value = full.length
          const now = Date.now()
          if (now - lastPaint > 200) {
            lastPaint = now
            previewHtml.value = previewFromStream(full)
          }
        }
      },
      streamAbort.signal
    )
    // 流被提前关闭：保留已收到的内容并明确告知「不完整」，别让用户以为已经生成成功
    if (interrupted) {
      if (text.trim()) {
        finishWithText(text, truncated)
        issueText.value = t('ai.conclusion.interrupted')
      } else {
        throw new Error(t('ai.conclusion.interruptedBefore'))
      }
    } else {
      finishWithText(text, truncated)
    }
  } catch (e: any) {
    const aborted = e?.name === 'AbortError'
    const partial = streamRaw.value.trim()
    if (aborted) {
      // 主动停止：已收到的部分直接可用，不白等一场
      if (partial) {
        finishWithText(streamRaw.value, false)
        issueText.value = t('ai.conclusion.stoppedPartial')
      } else {
        issueText.value = t('ai.conclusion.stopped')
      }
    } else if (partial) {
      finishWithText(streamRaw.value, false)
      ElMessageBox.alert(
        t('ai.conclusion.partialAlert', {
          message: e?.message || t('ai.conclusion.interruptedFallback')
        }),
        t('ai.conclusion.interruptedTitle'),
        { confirmButtonText: t('ai.config.gotIt'), type: 'warning' }
      ).catch(() => {})
    } else {
      // 没有内容时把后端给出的真实原因显示出来（限流 / 地址不通 / 模型报错），
      // 不再统一含糊成「生成失败，请稍后重试」
      ElMessageBox.alert(
        e?.message || t('ai.conclusion.failAlert'),
        t('ai.conclusion.failTitle'),
        {
          confirmButtonText: t('ai.config.gotIt'),
          type: 'error'
        }
      ).catch(() => {})
    }
  } finally {
    clearWaitTimer()
    loading.value = false
    streamAbort = null
  }
}

const apply = () => {
  emit('apply', {
    content: rawHtml.value,
    summary: summary.value,
    tags: tags.value
  })
}

const close = () => emit('update:modelValue', false)

// 关闭对话框 / 组件卸载时中断流式请求，避免后端继续消耗 token
watch(
  () => props.modelValue,
  (v) => {
    if (!v) stopStreaming()
  }
)
onBeforeUnmount(() => {
  stopStreaming()
  clearWaitTimer()
})
</script>

<style scoped>
.ac-head {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 10px;
}
.ac-meta {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}
.ac-meta__label {
  font-size: 12px;
  color: var(--ink-soft);
  flex-shrink: 0;
}
.ac-meta__value {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ac-actions {
  align-items: center;
  display: flex;
  gap: 8px;
  margin-bottom: 4px;
}
.ac-preview {
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
  padding: 14px 18px;
  max-height: 46vh;
  overflow-y: auto;
  min-height: 180px;
}
.ac-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 180px;
}
.ac-stream-hint {
  margin-left: auto;
  font-size: 12px;
  color: var(--ink-soft);
  font-variant-numeric: tabular-nums;
}
</style>
