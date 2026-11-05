// aiComposeAgent 循环测试：用 stub chat/runTool 验证多轮工具调用、终止条件与容错
const test = require('node:test')
const assert = require('node:assert')
const { runAgentLoop, MAX_AGENT_STEPS } = require('../src/utils/aiComposeAgent')

test('一轮直达：模型不调工具，直接返回最终答案', async () => {
  let chatCalls = 0
  const result = await runAgentLoop({
    system: 'S',
    user: 'U',
    tools: [],
    chatMessage: async () => {
      chatCalls++
      return { role: 'assistant', content: '{"sections":[]}' }
    },
    runTool: async () => { throw new Error('不应调用工具') }
  })
  assert.strictEqual(chatCalls, 1)
  assert.strictEqual(result.steps, 1)
  assert.strictEqual(result.toolCallCount, 0)
  assert.strictEqual(result.content, '{"sections":[]}')
})

test('多轮工具调用：搜题→验卷→最终答案，工具结果回填成对', async () => {
  const script = [
    { content: '', tool_calls: [{ id: 'c1', function: { name: 'search_questions', arguments: '{"section":"single"}' } }] },
    { content: '', tool_calls: [{ id: 'c2', function: { name: 'validate_paper', arguments: '{"sections":[]}' } }] },
    { content: 'FINAL', tool_calls: [] }
  ]
  let step = 0
  const toolNames = []
  const result = await runAgentLoop({
    system: 'S',
    user: 'U',
    tools: [],
    chatMessage: async ({ messages }) => {
      const r = script[step++]
      if (step === 3) {
        const toolMsgs = messages.filter((m) => m.role === 'tool')
        assert.strictEqual(toolMsgs.length, 2)
        assert.strictEqual(toolMsgs[0].tool_call_id, 'c1')
        assert.deepStrictEqual(JSON.parse(toolMsgs[0].content), { total: 8 })
      }
      return r
    },
    runTool: async (name) => {
      toolNames.push(name)
      if (name === 'search_questions') return { total: 8 }
      return { ok: true }
    }
  })
  assert.deepStrictEqual(toolNames, ['search_questions', 'validate_paper'])
  assert.strictEqual(result.content, 'FINAL')
  assert.strictEqual(result.steps, 3)
  assert.strictEqual(result.toolCallCount, 2)
})

test('工具抛错：错误以 JSON 回给模型而不是中断循环', async () => {
  const script = [
    { content: '', tool_calls: [{ id: 'c1', function: { name: 'boom', arguments: '{}' } }] },
    { content: 'done', tool_calls: [] }
  ]
  let step = 0
  const result = await runAgentLoop({
    system: 'S',
    user: 'U',
    tools: [],
    chatMessage: async () => script[step++],
    runTool: async () => { throw new Error('数据库炸了') }
  })
  assert.strictEqual(result.content, 'done')
  assert.strictEqual(result.toolCallCount, 1)
})

test('步数上限：模型一直要求工具也不超过 maxSteps', async () => {
  let chatCalls = 0
  const result = await runAgentLoop({
    system: 'S',
    user: 'U',
    tools: [],
    maxSteps: 3,
    chatMessage: async () => {
      chatCalls++
      return { content: '', tool_calls: [{ id: 'x' + chatCalls, function: { name: 't', arguments: '{}' } }] }
    },
    runTool: async () => ({ ok: true })
  })
  assert.strictEqual(chatCalls, 3)
  assert.strictEqual(result.content, '')
})

test('工具参数非法 JSON：runTool 收到原始串，解析抛错被循环捕获', async () => {
  const script = [
    { content: '', tool_calls: [{ id: 'c1', function: { name: 't', arguments: '{bad json' } }] },
    { content: 'ok', tool_calls: [] }
  ]
  let step = 0
  let gotRaw = ''
  const result = await runAgentLoop({
    system: 'S',
    user: 'U',
    tools: [],
    chatMessage: async () => script[step++],
    runTool: async (_name, raw) => {
      gotRaw = raw
      JSON.parse(raw)
      return {}
    }
  })
  assert.strictEqual(gotRaw, '{bad json')
  assert.strictEqual(result.content, 'ok')
})

test('MAX_AGENT_STEPS 常量导出且合理', () => {
  assert.ok(Number.isInteger(MAX_AGENT_STEPS) && MAX_AGENT_STEPS >= 4)
})
