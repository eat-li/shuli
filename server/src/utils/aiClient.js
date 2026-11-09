// AI 上游调用层：OpenAI 兼容 /chat/completions 的统一出口。
//
// 为什么独立成文件：接口地址白名单（SSRF 防护）、Key 路由、超时、SSE 解析
// 是所有 AI 功能共用的基础设施，之前和各业务 handler 混在一个 900 行的控制器里，
// 改判难度的 maxTokens 都要穿过组卷的代码。这里只放「怎么调上游」，
// 「调来做什么」（提示词、结果校验、DB）留在控制器与 utils/aiDifficulty、
// utils/paperCompose、utils/aiHtml。
//
// 本文件不 require models、不接触 req/res —— 保持可单测、可整体替换
// （以后若真要拆 Python AI 服务，把这层换成 HTTP 调用即可）。

// 默认面向 DeepSeek OpenAI 兼容接口；也可通过 .env 覆盖
const DEFAULT_BASE_URL = process.env.AI_BASE_URL || 'https://api.deepseek.com/v1'
const DEFAULT_MODEL = process.env.AI_MODEL || 'deepseek-chat'
const BUILTIN_ALLOWED_BASE_URLS = ['https://api.deepseek.com/v1', 'https://api.openai.com/v1']

// AI 接口调用超时（毫秒）：大模型生成较慢，给足时间
const AI_TIMEOUT_MS = 120000

// 流式（SSE）超时：不再限制「总时长」，只限制「多久没收到任何数据」——
// 模型一边生成一边回传，只要不断流就不会被判超时，慢模型也不会整段失败。
const AI_STREAM_IDLE_MS = Number(process.env.AI_STREAM_IDLE_MS) || 60000
// 单次流式生成的硬上限，防止异常连接永不结束
const AI_STREAM_MAX_MS = Number(process.env.AI_STREAM_MAX_MS) || 10 * 60 * 1000

// 规范化接口地址：去尾斜杠、只允许 https、解析失败返回空串。
// 只认 https 是白名单模式下的默认约束——它同时承担 SSRF 防护。
function normalizeBaseUrl(raw) {
  const input = String(raw || '')
    .trim()
    .replace(/\/+$/, '')
  if (!input) return ''
  let url
  try {
    url = new URL(input)
  } catch {
    return ''
  }
  if (url.protocol !== 'https:') return ''
  return url.toString().replace(/\/+$/, '')
}

// 白名单 = 内置地址 + 默认地址 + AI_ALLOWED_BASE_URLS，去重后返回。
function getAllowedBaseUrls() {
  const configured = String(process.env.AI_ALLOWED_BASE_URLS || '')
    .split(',')
    .map(normalizeBaseUrl)
    .filter(Boolean)
  return [
    ...new Set(
      [...BUILTIN_ALLOWED_BASE_URLS, DEFAULT_BASE_URL, ...configured]
        .map(normalizeBaseUrl)
        .filter(Boolean)
    )
  ]
}

// 显式放行任意接口地址（自建 / 中转 / 本地模型场景）；
// 默认关闭，保持白名单带来的 SSRF 防护
function isAnyBaseUrlAllowed() {
  return (
    String(process.env.AI_ALLOW_ANY_BASE_URL || '')
      .trim()
      .toLowerCase() === 'true'
  )
}

// 放行模式下允许 http（本地 Ollama / LM Studio 等），但仍拒绝非 http(s) 协议
function normalizeAnyBaseUrl(raw) {
  const input = String(raw || '')
    .trim()
    .replace(/\/+$/, '')
  if (!input) return ''
  try {
    const url = new URL(input)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return ''
    return url.toString().replace(/\/+$/, '')
  } catch {
    return ''
  }
}

// 解析最终调用的接口地址。放行模式（AI_ALLOW_ANY_BASE_URL）下允许 http；
// 默认模式下必须命中白名单，未命中返回 null 并由上层给出可操作的报错。
function resolveBaseUrl(baseUrl) {
  if (isAnyBaseUrlAllowed()) return normalizeAnyBaseUrl(baseUrl || DEFAULT_BASE_URL) || null
  const normalized = normalizeBaseUrl(baseUrl || DEFAULT_BASE_URL)
  if (!normalized) return null
  const allowed = getAllowedBaseUrls()
  return allowed.includes(normalized) ? normalized : null
}

// 解析调用目标（Key / 地址 / 模型）；失败返回 { error }
function resolveAiTarget({ apiKey, baseUrl, model }) {
  const key = String(apiKey || process.env.AI_API_KEY || '').trim()
  if (!key) return { error: '请先填写 API Key 或在后端 .env 配置 AI_API_KEY' }
  const base = resolveBaseUrl(baseUrl)
  if (!base) {
    const allowed = getAllowedBaseUrls()
    return {
      error:
        `AI 接口地址不在允许列表中：${normalizeAnyBaseUrl(baseUrl) || baseUrl || '（空）'}。` +
        `当前允许：${allowed.join('、')}。` +
        `请把该地址追加到 server/.env 的 AI_ALLOWED_BASE_URLS（逗号分隔）后重启后端；` +
        `或设置 AI_ALLOW_ANY_BASE_URL=true 放行任意地址。`
    }
  }
  return { key, base, model: String(model || DEFAULT_MODEL).trim() }
}

// 调用 chat/completions，返回助手文本；失败抛出带 httpStatus 的错误
async function callChat({
  key,
  base,
  model,
  messages,
  temperature = 0.2,
  maxTokens = 4096,
  timeoutMs = AI_TIMEOUT_MS
}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens
      }),
      signal: controller.signal
    })

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      let msg = `AI 接口返回错误（HTTP ${resp.status}）`
      try {
        const j = JSON.parse(errText)
        if (j?.error?.message) msg = j.error.message
      } catch {
        /* 保留默认信息 */
      }
      const err = new Error(msg)
      err.httpStatus = 50200
      throw err
    }

    // 读响应体也在超时范围内。以前 timer 在 fetch 一返回（只到响应头）就 clear，
    // 上游「发完头就停摆」时 resp.json() 永远不 settle，请求整条挂死且不报错。
    const data = await resp.json()
    return String(data?.choices?.[0]?.message?.content || '')
  } finally {
    clearTimeout(timer)
  }
}

// 与 callChat 同一请求体，但返回完整的 assistant message（含 tool_calls / reasoning_content），
// 供需要 function calling 的智能体循环使用；callChat 保持「只要文本」的简单语义。
// tools / tool_choice 透传为 OpenAI 兼容格式，由调用方定义。
async function callChatMessage({
  key,
  base,
  model,
  messages,
  temperature = 0.2,
  maxTokens = 4096,
  timeoutMs = AI_TIMEOUT_MS,
  tools,
  toolChoice
}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const body = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens
    }
    if (Array.isArray(tools) && tools.length) {
      body.tools = tools
      if (toolChoice) body.tool_choice = toolChoice
    }
    const resp = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      let msg = `AI 接口返回错误（HTTP ${resp.status}）`
      try {
        const j = JSON.parse(errText)
        if (j?.error?.message) msg = j.error.message
      } catch {
        /* 保留默认信息 */
      }
      const err = new Error(msg)
      err.httpStatus = 50200
      throw err
    }

    // 与 callChat 同理：读 body 也要在超时保护之内
    const data = await resp.json()
    const message = data?.choices?.[0]?.message
    if (!message) throw Object.assign(new Error('AI 没有返回消息'), { httpStatus: 50200 })
    return message
  } finally {
    clearTimeout(timer)
  }
}

// 调用上游 /chat/completions 并开启 stream:true，逐段回调 onDelta。
// 返回 { text, truncated }：text 是拼接后的完整文本，truncated 表示被 max_tokens 截断。
// onStatus('connected')：上游已返回响应头（区分「还在连」与「连上了但还没吐字」）
// onThink(chars)：推理型模型（deepseek-reasoner 等）先流式吐思考过程，
//   这类分片没有 content，必须当进度上报，否则前端看着像卡死
async function streamChat({
  key,
  base,
  model,
  messages,
  temperature = 0.2,
  maxTokens = 4096,
  onDelta,
  onStatus,
  onThink,
  signal
}) {
  const controller = new AbortController()
  let idleTimer = null
  let abortReason = '' // '' | IDLE | MAX_DURATION | CLIENT_CLOSED
  // 记录首个中止原因后再 abort。保留首个原因很重要：
  // 空闲超时与客户端断开可能几乎同时发生，只报最后一个会把「模型卡住」误报成「用户关闭页面」。
  const abortWith = (reason) => {
    if (!abortReason) abortReason = reason
    controller.abort()
  }
  // 重置空闲计时器：每收到一片数据就续期，实现「只要还在吐字就不算超时」。
  const resetIdle = () => {
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => abortWith('IDLE'), AI_STREAM_IDLE_MS)
  }
  const hardTimer = setTimeout(() => abortWith('MAX_DURATION'), AI_STREAM_MAX_MS)
  // 响应客户端主动断开（关页面 / 取消生成），把它与超时区分开。
  const onOuterAbort = () => abortWith('CLIENT_CLOSED')
  if (signal) {
    if (signal.aborted) onOuterAbort()
    else signal.addEventListener('abort', onOuterAbort)
  }

  let text = ''
  let truncated = false
  let reader = null
  try {
    resetIdle()
    const resp = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: true
      }),
      signal: controller.signal
    })

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      let msg = `AI 接口返回错误（HTTP ${resp.status}）`
      try {
        const j = JSON.parse(errText)
        if (j?.error?.message) msg = j.error.message
      } catch {
        if (errText) msg = errText.slice(0, 200)
      }
      const err = new Error(msg)
      err.httpStatus = 50200
      err.upstreamStatus = resp.status
      throw err
    }
    if (!resp.body) {
      const err = new Error('AI 接口没有返回流式内容（该服务可能不支持 stream）')
      err.httpStatus = 50200
      throw err
    }

    onStatus?.('connected')
    reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let thinkChars = 0
    let thinkReported = false
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      // 只要有分片到达就续期：模型「思考」阶段或吐字很慢也不会被误判为超时
      resetIdle()
      buf += decoder.decode(value, { stream: true })

      let nl
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line || line.startsWith(':')) continue // 心跳 / 注释行
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        let json
        try {
          json = JSON.parse(payload)
        } catch {
          continue // 上游偶发非 JSON 分片：跳过，不让整段失败
        }
        if (json?.error) {
          const err = new Error(json.error.message || 'AI 接口返回错误')
          err.httpStatus = 50200
          throw err
        }
        const choice = json?.choices?.[0]
        const delta = choice?.delta || {}
        // 兼容两种形态：字符串，或 [{ type:'text', text:'…' }] 数组
        const pick = (v) =>
          typeof v === 'string' ? v : Array.isArray(v) ? v.map((p) => p?.text || '').join('') : ''
        const piece = pick(delta.content)
        if (piece) {
          // 正文开始时把思考阶段的最终字数补报一次（平时按 1s 节流，别让计数停在半路）
          if (!thinkReported && thinkChars) {
            thinkReported = true
            onThink?.(thinkChars, true)
          }
          text += piece
          onDelta?.(piece)
        }
        // 推理过程（deepseek-reasoner / 部分中转）：只用来显示「思考中」，不进正文
        const think = pick(delta.reasoning_content) || pick(delta.reasoning)
        if (think) {
          thinkChars += think.length
          if (!thinkReported) onThink?.(thinkChars)
        }
        if (choice?.finish_reason === 'length') truncated = true
      }
    }
    return { text, truncated, thinkChars }
  } catch (e) {
    // 上游真实报错原样抛出；中止类错误统一成带 streamAbort 标记的错误，供文案映射
    if (e?.httpStatus) throw e
    if (abortReason || e?.name === 'AbortError') {
      const reason = abortReason || 'CLIENT_CLOSED'
      const err = new Error(reason)
      err.streamAbort = reason
      throw err
    }
    throw e
  } finally {
    clearTimeout(idleTimer)
    clearTimeout(hardTimer)
    if (signal) signal.removeEventListener('abort', onOuterAbort)
    // 异常退出（上游返回 error 分片、中途抛错、被中止）时把流关掉。
    // 只 abort 不 cancel reader，上游连接还会继续生成直到自己结束，白扣配额。
    if (reader) await reader.cancel().catch(() => {})
  }
}

// 流式路径的报错文案（此时响应头已发出，不能再走统一 JSON 包络）
function describeStreamError(e, targetBase) {
  if (e?.streamAbort === 'IDLE') {
    return (
      `AI 超过 ${Math.round(AI_STREAM_IDLE_MS / 1000)} 秒没有返回任何内容，已中断。` +
      `可以重试、换个模型，或在 server/.env 调大 AI_STREAM_IDLE_MS`
    )
  }
  if (e?.streamAbort === 'MAX_DURATION') return '本次生成时间过长，已中断；可重试或换用更快的模型'
  if (e?.streamAbort === 'CLIENT_CLOSED') return '已停止生成'
  if (e?.httpStatus) return e.message
  if (e?.cause || e?.code) {
    const detail = e?.cause?.code || e?.cause?.message || e?.code || '网络错误'
    return (
      `无法连接 AI 接口（${detail}）：${targetBase || '（地址为空）'}。` +
      `请检查接口地址是否正确、能否从本机访问，以及该服务是否可用`
    )
  }
  return e?.message || '生成失败，请稍后重试'
}

module.exports = {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  AI_TIMEOUT_MS,
  AI_STREAM_IDLE_MS,
  AI_STREAM_MAX_MS,
  normalizeBaseUrl,
  getAllowedBaseUrls,
  resolveAiTarget,
  callChat,
  callChatMessage,
  streamChat,
  describeStreamError
}
