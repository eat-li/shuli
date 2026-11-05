import request from './request'
import { i18n } from '../i18n'
import type {
  AiConfig,
  AiFormatPayload,
  AiFormatResult,
  AiAnswerPayload,
  AiAnswerResult,
  AiLessonSummaryPayload,
  AiLessonSummaryResult,
  AiConclusionPayload,
  AiDifficultyPayload,
  AiDifficultyResult
} from '../types'

// 获取后端 AI 配置状态（不会返回 Key 本身）
export const getAiConfig = (): Promise<AiConfig> => request.get('/ai/config')

// AI 智能排版：把题目文本交给后端调用大模型，返回排版后的 HTML
// 大模型生成较慢，单独放宽超时（默认全局 10s 必然超时）
export const formatQuestion = (data: AiFormatPayload): Promise<AiFormatResult> =>
  request.post('/ai/format', data, { timeout: 120000 })

// AI 生成「答案与解析」：只传题目 id，由后端读题并拼提示词
export const generateQuestionAnswer = (data: AiAnswerPayload): Promise<AiAnswerResult> =>
  request.post('/ai/answer', data, { timeout: 120000 })

// AI 课时总结：后端读取该作业的题目，生成「上课内容 / 上课状态 / 课后任务」
export const generateLessonSummary = (
  data: AiLessonSummaryPayload
): Promise<AiLessonSummaryResult> => request.post('/ai/lesson-summary', data, { timeout: 120000 })

// AI 结论生成：从「标题 + 简介 + 分类」产出该结论的具体内容（正文 + 要点 + 摘要/标签注释）
// 只用流式版本：非流式接口的整段超时在慢模型上必然失败，已下线（见 server/src/routes/ai.routes.js）。
// 为什么不用 axios：axios 拿不到分片，只能等整个响应结束，一旦超过 2 分钟就整体失败。
// 这里用 fetch + ReadableStream 边收边渲染，并把「总时长超时」换成后端的「空闲超时」，
// 慢模型、长内容也不会再因为总耗时被判失败。
export interface ConclusionStreamHandlers {
  // piece：本次增量文本；full：到目前为止的完整文本
  onDelta?: (piece: string, full: string) => void
  // 上游已连接（可以提示「已连接模型，等待输出…」）
  onConnected?: () => void
  // 推理型模型的思考进度（累计字数）；这类模型会先思考很久，必须给用户可见的进度
  onThinking?: (chars: number) => void
}

export const generateConclusionStream = async (
  data: AiConclusionPayload,
  handlers: ConclusionStreamHandlers = {},
  signal?: AbortSignal
): Promise<{ text: string; truncated: boolean; interrupted: boolean }> => {
  // 单用户版本没有鉴权：SSE 走 fetch 也不会带令牌，只带内容类型。
  const res = await fetch('/api/ai/conclusion/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal
  })

  // 参数/鉴权类问题发生在进入流式之前，仍是普通 JSON 包络：把 message 原样带出来
  const isStream = String(res.headers.get('content-type') || '').includes('text/event-stream')
  if (!res.ok || !res.body || !isStream) {
    const raw = await res.text().catch(() => '')
    let message = i18n.global.t('api.streamUnavailable', { status: res.status })
    try {
      const parsed = JSON.parse(raw)
      if (parsed?.message) message = parsed.message
    } catch {
      /* 保留默认文案 */
    }
    throw new Error(message)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''
  let truncated = false
  let finished = false

  while (!finished) {
    const chunk = await reader.read()
    if (chunk.done) break
    buffer += decoder.decode(chunk.value, { stream: true })

    let sep
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      for (const rawLine of block.split('\n')) {
        const line = rawLine.trim()
        if (!line.startsWith('data:')) continue // 跳过 : ping 心跳行
        const payload = line.slice(5).trim()
        if (!payload) continue
        let evt: any
        try {
          evt = JSON.parse(payload)
        } catch {
          continue
        }
        if (evt.type === 'delta') {
          const piece = String(evt.text || '')
          if (piece) {
            full += piece
            handlers.onDelta?.(piece, full)
          }
        } else if (evt.type === 'status') {
          if (evt.phase === 'connected') handlers.onConnected?.()
        } else if (evt.type === 'thinking') {
          handlers.onThinking?.(Number(evt.chars) || 0)
        } else if (evt.type === 'error') {
          // 后端已把上游原文/超时原因翻译成人话，直接抛出去给对话框展示
          throw new Error(evt.message || i18n.global.t('api.generateFailed'))
        } else if (evt.type === 'done') {
          truncated = Boolean(evt.truncated)
          finished = true
        }
      }
    }
  }

  // 流被提前关闭（后端异常结束 / 代理掐断）：一个字都没收到就直接报错，
  // 有部分内容则交回调用方处理，避免用户对着转圈干等
  if (!finished && !full.trim()) {
    throw new Error(i18n.global.t('api.streamInterrupted'))
  }
  return { text: full, truncated, interrupted: !finished }
}

/** AI 判难度：返回建议值与理由，不写库（由调用方确认后 PATCH 题目） */
export const judgeDifficulty = (data: AiDifficultyPayload): Promise<AiDifficultyResult> =>
  request.post('/ai/judge-difficulty', data, { timeout: 90000 })
