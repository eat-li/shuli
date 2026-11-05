// AI 组卷的纯函数测试（CI 无 MySQL，所以只测不碰库的部分）
const test = require('node:test')
const assert = require('node:assert/strict')

const {
  normalizeComposeRequest,
  checkStock,
  validateSelection,
  ruleCompose
} = require('../src/utils/paperCompose')
const { parseAiJson } = require('../src/utils/parseAiJson')

const cand = (id, section, difficulty, tag = '函数') => ({
  id,
  section,
  difficulty,
  tag,
  text: `题干 ${id}`
})

const structure = [
  { section: 'single', count: 2, score: 5 },
  { section: 'fill', count: 1, score: 5 }
]

test('normalizeComposeRequest 过滤非法分区并夹住题量', () => {
  const c = normalizeComposeRequest({
    stage: 'senior3',
    structure: [
      { section: 'single', count: 3, score: 5 },
      { section: 'bogus', count: 2, score: 5 },
      { section: 'fill', count: 0, score: 5 },
      { section: 'solve', count: 999, score: 12 }
    ]
  })
  assert.equal(c.structure.length, 2)
  assert.deepEqual(
    c.structure.map((s) => s.section),
    ['single', 'solve']
  )
  assert.equal(c.structure[1].count, 40, '超大题量应被夹到 40')
  assert.equal(c.totalCount, 43)
})

test('checkStock 在库存不足时给出可操作提示', () => {
  const pool = [cand(1, 'single', 3), cand(2, 'fill', 3)]
  const msg = checkStock(normalizeComposeRequest({ structure }), pool)
  assert.ok(msg && msg.includes('单项选择题'), '应指出是哪个大题不足')
  assert.ok(msg.includes('1 道'), '应说明候选实际数量')
})

test('validateSelection 剔除编造 id、去重、并按需补齐', () => {
  const constraints = normalizeComposeRequest({ structure })
  const pool = [
    cand(1, 'single', 2),
    cand(2, 'single', 3),
    cand(3, 'single', 4),
    cand(9, 'fill', 1)
  ]
  const parsed = {
    sections: [
      // 999 不存在；2 重复；3 正确
      { section: 'single', ids: [999, 2, 2, 3] },
      { section: 'fill', ids: [1] } // 1 是选择题，分区不符
    ]
  }
  const out = validateSelection(parsed, constraints, pool)
  const single = out.sections.find((s) => s.section === 'single')
  const fill = out.sections.find((s) => s.section === 'fill')
  assert.equal(single.ids.length, 2, '单选应凑满 2 道')
  assert.ok(single.ids.includes(2) && single.ids.includes(3))
  assert.deepEqual(fill.ids, [9], '分区不符的 id 被剔除后应补上填空池里的题')
  assert.ok(out.warnings.length > 0, '任何取舍都要留下 warning')
  assert.equal(new Set([...single.ids, ...fill.ids]).size, 3, '全卷不得重复')
})

test('validateSelection 在模型什么都没给时也能凑出结构', () => {
  const constraints = normalizeComposeRequest({ structure })
  const pool = [cand(1, 'single', 2), cand(2, 'single', 3), cand(3, 'fill', 2)]
  const out = validateSelection({ sections: [] }, constraints, pool)
  assert.equal(out.sections[0].ids.length, 2)
  assert.equal(out.sections[1].ids.length, 1)
  assert.ok(out.warnings.some((w) => w.includes('没有返回可用的题号')))
})

test('ruleCompose 严格按数量出题、难度递增、跨大题不重复', () => {
  const constraints = normalizeComposeRequest({
    structure: [
      { section: 'single', count: 3, score: 5 },
      { section: 'solve', count: 2, score: 12 }
    ]
  })
  const pool = [
    cand(11, 'single', 4),
    cand(12, 'single', 1),
    cand(13, 'single', 3),
    cand(14, 'single', 2),
    cand(21, 'solve', 5),
    cand(22, 'solve', 2)
  ]
  const out = ruleCompose(constraints, pool)
  const singles = out.sections[0].ids.map((id) => pool.find((c) => c.id === id).difficulty)
  const solves = out.sections[1].ids.map((id) => pool.find((c) => c.id === id).difficulty)
  assert.equal(singles.length, 3)
  assert.equal(solves.length, 2)
  assert.deepEqual(singles, [...singles].sort((a, b) => a - b), '单选应按难度升序')
  assert.deepEqual(solves, [...solves].sort((a, b) => a - b), '解答应按难度升序')
  assert.equal(new Set([...out.sections[0].ids, ...out.sections[1].ids]).size, 5)
})

test('parseAiJson 容忍围栏、前后说明与尾逗号', () => {
  assert.deepEqual(parseAiJson('{"a":1}'), { a: 1 })
  assert.deepEqual(parseAiJson('```json\n{"a":1}\n```'), { a: 1 })
  assert.deepEqual(parseAiJson('好的，结果如下：\n{"a":1}\n希望有帮助'), { a: 1 })
  assert.deepEqual(parseAiJson('{"a":1,}'), { a: 1 })
  assert.equal(parseAiJson('完全不是 JSON'), null)
})
