// 声明式校验的单元测试（纯函数，CI 无 MySQL 也能跑）
const test = require('node:test')
const assert = require('node:assert/strict')

const { parse } = require('../src/utils/validate')
const { parseQuestion, parsePaper } = require('../src/utils/schemas')

test('必填字段缺失时报错，partial 模式下跳过', () => {
  const create = parseQuestion({ type: 'choice' })
  assert.equal(create.error, '题干不能为空')

  const patch = parseQuestion({ difficulty: 3 }, { partial: true })
  assert.equal(patch.error, null)
  assert.deepEqual(patch.values, { difficulty: 3 })
})

test('partial 模式只跳过「缺失」，显式传空仍然报错', () => {
  // 这一条是踩过的坑：PATCH 传 title:'' 若被当成 null 写进 NOT NULL 列，就是 500
  const res = parseQuestion({ title: '   ' }, { partial: true })
  assert.equal(res.error, '题干不能为空')
})

test('文本字段显式传 null 落 null，不会变成字符串 "null"', () => {
  // 这一条是线上事故：清空二级知识点 / 空正文 / 空答案时前端传 null，
  // String(null) === 'null' 被当成有效值，题库里长出一行叫 "null" 的二级知识点。
  const res = parseQuestion({ title: 'a', knowledgeSubTag: null, body: null, answer: null })
  assert.equal(res.error, null)
  assert.deepEqual(res.values, {
    title: 'a',
    knowledgeSubTag: null,
    body: null,
    answer: null
  })
})

test('必填文本字段显式传 null 报错，不会被当成 "null" 题干', () => {
  assert.equal(parseQuestion({ title: null }).error, '题干不能为空')
})

test('空串也归一为 null（空值的唯一表示是 NULL）', () => {
  const res = parseQuestion({ title: 'a', knowledgeTag: '', knowledgeSubTag: '   ', body: '', answer: '' })
  assert.equal(res.error, null)
  assert.deepEqual(res.values, {
    title: 'a',
    knowledgeTag: null,
    knowledgeSubTag: null,
    body: null,
    answer: null
  })
})

test('一级知识点被清空时，二级一并清空（不留无归属的二级）', () => {
  const cleared = parseQuestion({ title: 'a', knowledgeTag: null, knowledgeSubTag: '导数' })
  assert.equal(cleared.error, null)
  assert.equal(cleared.values.knowledgeTag, null)
  assert.equal(cleared.values.knowledgeSubTag, null, '一级为空时不该留下二级')

  // 一级与二级都给了：保留
  const kept = parseQuestion({ title: 'a', knowledgeTag: '函数', knowledgeSubTag: '导数' })
  assert.equal(kept.values.knowledgeSubTag, '导数')

  // PATCH 只改二级（请求体里没有 knowledgeTag）：不能被误清
  const patch = parseQuestion({ knowledgeSubTag: '导数' }, { partial: true })
  assert.equal(patch.error, null)
  assert.deepEqual(patch.values, { knowledgeSubTag: '导数' })
})

test('难度：空值归一为 null，字符串转数字，越界与小数报错', () => {
  assert.deepEqual(parseQuestion({ title: 'a', difficulty: '' }).values, {
    title: 'a',
    difficulty: null
  })
  assert.deepEqual(parseQuestion({ title: 'a', difficulty: '4' }).values, {
    title: 'a',
    difficulty: 4
  })
  assert.equal(parseQuestion({ title: 'a', difficulty: 3.5 }).error, '难度需为 1-5 的整数')
  assert.equal(parseQuestion({ title: 'a', difficulty: 6 }).error, '难度需为 1-5 的整数')
})

test('题型与子类型枚举', () => {
  assert.equal(parseQuestion({ title: 'a', type: 'judge' }).error, '题型不合法')
  assert.equal(parseQuestion({ title: 'a', choiceMode: 'MULTI' }).error, '选择题子类型不合法')
  // 子类型显式传 null 合法（存量题就是这个状态）
  assert.equal(parseQuestion({ title: 'a', choiceMode: null }).error, null)
})

test('非选择题带子类型时被清空（跨字段规则）', () => {
  const res = parseQuestion({ title: 'a', type: 'fill', choiceMode: 'multiple' })
  assert.equal(res.error, null)
  assert.equal(res.values.choiceMode, null, '填空题不该带着 multiple 落库')

  const keep = parseQuestion({ title: 'a', type: 'choice', choiceMode: 'multiple' })
  assert.equal(keep.values.choiceMode, 'multiple')
})

test('标签超长静默截断（保持历史行为），题干不截断', () => {
  const long = 'x'.repeat(130)
  const res = parseQuestion({ title: 'a', knowledgeTag: long })
  assert.equal(res.values.knowledgeTag.length, 100)
  assert.equal(res.values.title, 'a')
})

test('选项必须是数组，但允许 null', () => {
  assert.equal(parseQuestion({ title: 'a', options: 'A,B' }).error, '选项必须是数组')
  assert.equal(parseQuestion({ title: 'a', options: null }).error, null)
  assert.deepEqual(parseQuestion({ title: 'a', options: ['A', 'B'] }).values.options, ['A', 'B'])
})

test('未知字段被丢弃（白名单），不会被写进模型', () => {
  const res = parseQuestion({ title: 'a', id: 999, isAdmin: true, createdAt: 'x' })
  assert.deepEqual(Object.keys(res.values), ['title'])
})

test('试卷：标题截断、时长范围、学段与来源枚举', () => {
  const longTitle = 'y'.repeat(260)
  const ok = parsePaper({ title: longTitle, stage: 'senior3', duration: 120 })
  assert.equal(ok.error, null)
  assert.equal(ok.values.title.length, 200)

  assert.equal(parsePaper({ title: 'a', stage: 'college' }).error, '学段不合法')
  assert.equal(parsePaper({ title: 'a', duration: 0 }).error, '考试时长需为 1-600 的整数')
  assert.equal(parsePaper({ title: 'a', source: 'gpt' }).error, '来源不合法')
  assert.equal(parsePaper({}, { partial: true }).error, null)
})

test('通用引擎：数字与布尔字段', () => {
  const schema = {
    score: { kind: 'number', min: 0, max: 10 },
    flag: { kind: 'bool' }
  }
  assert.equal(parse(schema, { score: 9.5 }).error, null, 'number 应接受小数')
  assert.equal(parse(schema, { score: 9.5 }).values.score, 9.5)
  assert.notEqual(parse(schema, { score: 11 }).error, null)
  assert.equal(parse(schema, { flag: 0 }).values.flag, false)
  assert.equal(parse(schema, { flag: 1 }).values.flag, true)
})
