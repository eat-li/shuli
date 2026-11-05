// AI 判难度的纯函数测试：提示词拼装 + 结果解析。
//
// 解析必须严：难度越界或非整数时宁可返回 null（让接口报「模型没给出可用结果」），
// 也不能猜一个值——猜出来的 3 星会直接写进题库，且看不出是猜的。
const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildQuestionDigest,
  buildDifficultyMessages,
  parseDifficultyResult,
  SYSTEM
} = require('../src/utils/aiDifficulty')

const question = {
  title: '<p>已知 $f(x)=x^3-3x$，求 $f(x)$ 在 $[0,2]$ 上的最大值。</p>',
  options: ['A. 0', { text: 'B. 2' }, 'C. $4$', 'D. 6'],
  body: '<p>提示：先求导。</p>',
  answer: '<p>答案：$f\'(x)=3x^2-3$，令其为 0 得 $x=\\pm 1$ ……</p>',
  type: 'solve',
  knowledgeTag: '导数'
}

test('题目摘要包含题干、选项、答案与知识点', () => {
  const text = buildQuestionDigest(question)
  assert.match(text, /题干：已知/)
  assert.match(text, /选项：A\. 0 B\. 2 C\. \$4\$ D\. 6/)
  assert.match(text, /补充说明：提示：先求导。/)
  assert.match(text, /参考解答（节选）：答案：/)
  assert.match(text, /题型：解答题/)
  assert.match(text, /知识点：导数/)
})

test('题目摘要会截断超长题干（不让单题顶满上下文）', () => {
  const long = { title: `<p>${'长'.repeat(2000)}</p>`, type: 'fill' }
  const text = buildQuestionDigest(long)
  assert.ok(text.length < 900, `摘要应被截断，实际 ${text.length}`)
})

test('提示词包含五档锚点，且要求只输出 JSON', () => {
  assert.match(SYSTEM, /1 星/)
  assert.match(SYSTEM, /5 星/)
  assert.match(SYSTEM, /只输出 JSON/)
  const messages = buildDifficultyMessages(question)
  assert.equal(messages.length, 2)
  assert.equal(messages[0].role, 'system')
  assert.equal(messages[1].role, 'user')
})

test('解析：标准 JSON 与代码围栏都能认', () => {
  assert.deepEqual(parseDifficultyResult('{"difficulty":4,"reason":"需要构造辅助函数"}'), {
    difficulty: 4,
    reason: '需要构造辅助函数'
  })
  assert.deepEqual(parseDifficultyResult('```json\n{"difficulty":2,"reason":"一次求导"}\n```'), {
    difficulty: 2,
    reason: '一次求导'
  })
})

test('解析：模型只写「难度：4」也能认', () => {
  assert.equal(parseDifficultyResult('难度：4').difficulty, 4)
  assert.equal(parseDifficultyResult('这道题难度 5 星，考查构造').difficulty, 5)
  assert.equal(parseDifficultyResult('3').difficulty, 3)
})

test('解析：越界、非整数、缺字段一律判无效（不猜）', () => {
  assert.equal(parseDifficultyResult('{"difficulty":6,"reason":"x"}'), null)
  assert.equal(parseDifficultyResult('{"difficulty":0}'), null)
  assert.equal(parseDifficultyResult('{"difficulty":3.5}'), null)
  assert.equal(parseDifficultyResult('{"reason":"没有给值"}'), null)
  assert.equal(parseDifficultyResult('完全不是 JSON'), null)
  assert.equal(parseDifficultyResult(''), null)
})

test('解析：被截断的 JSON（缺右括号）按字段兜底救回', () => {
  // 模型输出被 max_tokens 掐断在字符串中间——difficulty 键已完整写出
  const res = parseDifficultyResult('{"difficulty":4,"reason":"需要构造辅助函')
  assert.deepEqual(res, { difficulty: 4, reason: '需要构造辅助函' })
  // 连 reason 都没来得及写
  assert.deepEqual(parseDifficultyResult('{"difficulty":2'), { difficulty: 2, reason: '' })
  // 截断救回的值同样受 1-5 校验：越界不认
  assert.equal(parseDifficultyResult('{"difficulty":6,"reason":"x"'), null)
  // 难度键本身没写出来，不能从其它数字里猜
  assert.equal(parseDifficultyResult('{"reason":"这题很难，我给 5 分"}'), null)
})

test('解析：reason 会截断，避免把整段解释塞进响应', () => {
  const res = parseDifficultyResult(`{"difficulty":3,"reason":"${'很'.repeat(200)}"}`)
  assert.equal(res.difficulty, 3)
  assert.ok(res.reason.length <= 60)
})

test('中文数字难度：「难度：三星」可解析', () => {
  const r = parseDifficultyResult('这道题难度：三星，需要换元')
  assert.deepStrictEqual(r, { difficulty: 3, reason: '这道题难度：三星，需要换元' })
})

test('备选字段名：level / 星级 / 难度 键都能取到', () => {
  assert.strictEqual(parseDifficultyResult('{"level":4,"reason":"构造函数"}')?.difficulty, 4)
  assert.strictEqual(parseDifficultyResult('{"星级":5,"reason":"压轴"}')?.difficulty, 5)
  assert.strictEqual(parseDifficultyResult('{"难度":2,"reason":"代入"}')?.difficulty, 2)
  // reason 字段缺失但有 理由 字段
  assert.strictEqual(parseDifficultyResult('{"difficulty":1,"理由":"直接代入"}')?.reason, '直接代入')
})

test('思考链包裹：think 标签里的数字不干扰「难度：N」识别', () => {
  const raw = '<think>先看选项，第3个有点像…1或2都可能…</think>该题难度：4，理由：需构造辅助函数'
  const r = parseDifficultyResult(raw)
  assert.strictEqual(r?.difficulty, 4)
})

test('difficulty 为字符串数字仍可解析（回归）', () => {
  assert.strictEqual(parseDifficultyResult('{"difficulty":"3","reason":"换元"}')?.difficulty, 3)
})
