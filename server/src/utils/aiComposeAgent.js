// AI 组卷智能体循环：与业务解耦的可测核心。
//
// 与刚性管线的差别：模型可以多轮调用工具（搜题/统计/验卷）自行凑卷，
// 每轮工具结果回填后继续推理，直到给出最终 JSON 或到达轮次上限。
// 本文件不 require models、不接触 req/res：
// - chatMessage({ messages, tools }) 由调用方注入（生产=aiClient.callChatMessage，测试=stub）
// - runTool(name, argsJson, ctx) 由调用方注入（生产=controller 里的 DB 工具，测试=stub）
//
// 循环终止条件：
// 1. 助手返回了 content 且没有 tool_calls —— 视为最终答案
// 2. 步数达到 MAX_AGENT_STEPS —— 返回最后的 content（可能为空，调用方自行降级）
// 3. chatMessage 抛错 —— 原样抛出，调用方决定降级

const MAX_AGENT_STEPS = 8

// 组卷智能体的主循环：模型可以多轮调用工具（搜题 / 统计 / 验卷），每轮结果回填后继续推理。
// maxSteps 是硬止损——不设上限时，模型「再搜一次」的倾向会让一次组卷烧掉几十次请求。
// 本函数不接触 DB 与 req/res，chatMessage 与 runTool 由调用方注入，因此可以被单测完整覆盖。
async function runAgentLoop({
  system,
  user,
  tools,
  chatMessage,
  runTool,
  maxSteps = MAX_AGENT_STEPS
}) {
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ]
  let steps = 0
  let toolCallCount = 0
  let lastContent = ''

  while (steps < maxSteps) {
    steps++
    const assistant = await chatMessage({ messages, tools })
    // 记录完整 assistant 消息（含 tool_calls），OpenAI 协议要求成对回传
    messages.push(assistant)
    if (assistant.content) lastContent = String(assistant.content)

    const calls = Array.isArray(assistant.tool_calls) ? assistant.tool_calls : []
    if (!calls.length) break // 没有工具调用 = 最终答案

    for (const call of calls) {
      toolCallCount++
      let resultText
      try {
        const result = await runTool(call.function?.name || '', call.function?.arguments || '{}')
        resultText = JSON.stringify(result == null ? { error: '工具无返回' } : result)
      } catch (e) {
        // 工具报错也回给模型，让它自己调整参数重试
        resultText = JSON.stringify({ error: String(e?.message || e) })
      }
      messages.push({
        role: 'tool',
        tool_call_id: call.id || '',
        content: resultText.slice(0, 60000) // 防止单个工具结果把上下文撑爆
      })
    }
  }

  return { content: lastContent, messages, steps, toolCallCount }
}

module.exports = { runAgentLoop, MAX_AGENT_STEPS }
