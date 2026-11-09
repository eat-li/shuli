// 知识点改名 / 合并 / 移动 / 等级的接口级测试。
//
// 这块逻辑跨两张表（question 上的标签字符串 + knowledge_sub_levels 的键），
// 而且唯一索引 (tag, name) 会在合并时冲突——纯函数测不出来，只能打真实接口 + 查库。
const test = require('node:test')
const assert = require('node:assert/strict')

const { createApiContext } = require('./helpers/apiContext')

let ctx = null
let bootError = null
let token = null

test.before(async () => {
  try {
    ctx = await createApiContext()
    token = await ctx.login()
  } catch (e) {
    bootError = e.message
  }
})

test.after(async () => {
  if (ctx) await ctx.teardown()
})

const withDb = (name, fn) =>
  test(name, async (t) => {
    if (bootError) return t.skip(bootError)
    await fn(t)
  })

/** 建一道带知识点归属的题 */
const mkQuestion = async ({ tag = null, sub = null } = {}) => {
  const res = await ctx.request('POST', '/api/questions', {
    token,
    body: {
      title: `<p>${tag || '未分类'} / ${sub || '-'}</p>`,
      type: 'fill',
      knowledgeTag: tag,
      knowledgeSubTag: sub
    }
  })
  assert.equal(res.body.code, 0, '建题应成功')
  return res.body.data.id
}

const setLevel = (tag, name, level) =>
  ctx.request('PATCH', '/api/questions/subtag-level', {
    token,
    body: { knowledgeTag: tag, name, level }
  })

/** 读等级记录（直接查库：接口没有「列出全部等级」的端点） */
const levelsOf = async (tag) => {
  const rows = await ctx.models.KnowledgeSubLevel.findAll({ where: { tag }, raw: true })
  return rows.map((r) => `${r.name}:${r.level}`).sort()
}

const tagsOfQuestions = async (ids) => {
  const rows = await ctx.models.Question.findAll({ where: { id: ids }, raw: true })
  return rows.map((r) => `${r.knowledgeTag}/${r.knowledgeSubTag}`).sort()
}

withDb('一级知识点改名：题目与等级记录一起搬（不留孤儿）', async () => {
  const q = await mkQuestion({ tag: '改名前', sub: '单调性' })
  await setLevel('改名前', '单调性', 'basic')

  const res = await ctx.request('PATCH', '/api/questions/rename-tag', {
    token,
    body: { from: '改名前', to: '改名后' }
  })
  assert.equal(res.body.code, 0)
  assert.equal(res.body.data.updated, 1)

  assert.deepEqual(await tagsOfQuestions([q]), ['改名后/单调性'])
  assert.deepEqual(await levelsOf('改名后'), ['单调性:basic'], '等级记录必须跟着换 tag')
  assert.deepEqual(await levelsOf('改名前'), [], '旧 tag 下不该留下孤儿等级')
})

withDb('一级知识点改名到已存在的题库：等级以目标为准（合并）', async () => {
  const q = await mkQuestion({ tag: '来源库', sub: '数列' })
  await setLevel('来源库', '数列', 'basic')
  await setLevel('目标库', '数列', 'advanced')

  await ctx.request('PATCH', '/api/questions/rename-tag', {
    token,
    body: { from: '来源库', to: '目标库' }
  })

  assert.deepEqual(await tagsOfQuestions([q]), ['目标库/数列'])
  assert.deepEqual(await levelsOf('目标库'), ['数列:advanced'], '同名冲突时目标库的等级优先')
  assert.deepEqual(await levelsOf('来源库'), [])
})

withDb('二级知识点改名：题目字符串与等级键同步', async () => {
  const q = await mkQuestion({ tag: '函数', sub: '定义域' })
  await setLevel('函数', '定义域', 'medium')

  const res = await ctx.request('PATCH', '/api/questions/update-subtag', {
    token,
    body: { from: '定义域', to: '定义域与值域', knowledgeTag: '函数' }
  })
  assert.equal(res.body.code, 0)
  assert.equal(res.body.data.updated, 1)

  assert.deepEqual(await tagsOfQuestions([q]), ['函数/定义域与值域'])
  assert.deepEqual(await levelsOf('函数'), ['定义域与值域:medium'])
})

withDb('二级知识点删除（移回未分类）：等级记录一并删除', async () => {
  const q = await mkQuestion({ tag: '三角', sub: '诱导公式' })
  await setLevel('三角', '诱导公式', 'basic')

  const res = await ctx.request('PATCH', '/api/questions/update-subtag', {
    token,
    body: { from: '诱导公式', to: '', knowledgeTag: '三角' }
  })
  assert.equal(res.body.code, 0)
  assert.equal(res.body.data.cleared, true)

  assert.deepEqual(await tagsOfQuestions([q]), ['三角/null'])
  assert.deepEqual(await levelsOf('三角'), [], '二级知识点没了，等级不该留着')
})

withDb('二级知识点换所属题库：题目与等级同时换 tag', async () => {
  const q = await mkQuestion({ tag: '旧题库', sub: '极值' })
  await setLevel('旧题库', '极值', 'advanced')

  const res = await ctx.request('PATCH', '/api/questions/update-subtag', {
    token,
    body: { from: '极值', knowledgeTag: '旧题库', toKnowledgeTag: '新题库' }
  })
  assert.equal(res.body.code, 0)

  assert.deepEqual(await tagsOfQuestions([q]), ['新题库/极值'])
  assert.deepEqual(await levelsOf('新题库'), ['极值:advanced'])
  assert.deepEqual(await levelsOf('旧题库'), [])
})

withDb('二级知识点合并到已存在的同名项：等级以目标为准', async () => {
  const q1 = await mkQuestion({ tag: '解析几何', sub: '椭圆' })
  const q2 = await mkQuestion({ tag: '解析几何', sub: '双曲线' })
  await setLevel('解析几何', '椭圆', 'basic')
  await setLevel('解析几何', '双曲线', 'advanced')

  // 把「双曲线」并入「椭圆」：目标已有等级 basic，来源 advanced 应丢弃
  const res = await ctx.request('PATCH', '/api/questions/update-subtag', {
    token,
    body: { from: '双曲线', to: '椭圆', knowledgeTag: '解析几何' }
  })
  assert.equal(res.body.code, 0)

  const tags = await tagsOfQuestions([q1, q2])
  assert.deepEqual(tags, ['解析几何/椭圆', '解析几何/椭圆'])
  assert.deepEqual(await levelsOf('解析几何'), ['椭圆:basic'])
})

withDb('等级设置与取消：只影响 (题库, 二级) 这一条', async () => {
  await mkQuestion({ tag: '立体几何', sub: '线面角' })

  const set = await setLevel('立体几何', '线面角', 'advanced')
  assert.equal(set.body.code, 0)
  assert.deepEqual(await levelsOf('立体几何'), ['线面角:advanced'])

  const bad = await setLevel('立体几何', '线面角', 'expert')
  assert.equal(bad.body.code, 40000)

  const clear = await setLevel('立体几何', '线面角', '')
  assert.equal(clear.body.code, 0)
  assert.deepEqual(await levelsOf('立体几何'), [])
})
