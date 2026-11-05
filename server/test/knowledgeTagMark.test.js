// 一级知识点标记（题库页置顶高亮）的接口级测试。
//
// 标记按知识点名存一条记录，而改名/合并只改题目上的字符串——
// 标记若不同步搬走，就会变成一条永远对不上任何卡片、也删不掉的孤儿记录。
// 这类跨表一致性纯函数测不出来，只能打真实接口 + 查库。
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

// 同一个文件里的用例共用一个测试库，先清空标记表，
// 否则前一个用例留下的标记会让后面的整表断言变得依赖执行顺序。
const withDb = (name, fn) =>
  test(name, async (t) => {
    if (bootError) return t.skip(bootError)
    await ctx.models.KnowledgeTagMark.destroy({ where: {} })
    await fn(t)
  })

const mark = (tag, marked = true) =>
  ctx.request('PATCH', '/api/questions/tag-mark', { token, body: { tag, marked } })

const listMarks = async () => {
  const res = await ctx.request('GET', '/api/questions/tag-marks', { token })
  assert.equal(res.body.code, 0)
  return res.body.data.slice().sort()
}

withDb('标记与取消：幂等，列表随之增减', async () => {
  const set = await mark('函数', true)
  assert.equal(set.body.code, 0)
  assert.deepEqual(set.body.data, { tag: '函数', marked: true })

  // 连点两次不该产生第二条记录
  await mark('函数', true)
  const rows = await ctx.models.KnowledgeTagMark.findAll({ where: { tag: '函数' }, raw: true })
  assert.equal(rows.length, 1)
  assert.deepEqual(await listMarks(), ['函数'])

  const clear = await mark('函数', false)
  assert.equal(clear.body.code, 0)
  assert.deepEqual(await listMarks(), [])
})

withDb('非法名称：空名与超长名被拒', async () => {
  assert.equal((await mark('', true)).body.code, 40000)
  assert.equal((await mark('  ', true)).body.code, 40000)
  assert.equal((await mark('长'.repeat(101), true)).body.code, 40000)
})

withDb('一级知识点改名：标记跟着走，旧名不留孤儿', async () => {
  await ctx.request('POST', '/api/questions', {
    token,
    body: { title: '<p>改名换标记</p>', type: 'fill', knowledgeTag: '标记改名前' }
  })
  await mark('标记改名前', true)

  const res = await ctx.request('PATCH', '/api/questions/rename-tag', {
    token,
    body: { from: '标记改名前', to: '标记改名后' }
  })
  assert.equal(res.body.code, 0)

  assert.deepEqual(await listMarks(), ['标记改名后'], '标记必须跟着新名字')
  const oldRows = await ctx.models.KnowledgeTagMark.findAll({
    where: { tag: '标记改名前' },
    raw: true
  })
  assert.equal(oldRows.length, 0, '旧名下不该留下孤儿标记')
})

withDb('改名合并到已标记的题库：以目标为准，不因唯一键冲突失败', async () => {
  await ctx.request('POST', '/api/questions', {
    token,
    body: { title: '<p>合并来源</p>', type: 'fill', knowledgeTag: '标记来源库' }
  })
  await mark('标记来源库', true)
  await mark('标记目标库', true)

  const res = await ctx.request('PATCH', '/api/questions/rename-tag', {
    token,
    body: { from: '标记来源库', to: '标记目标库' }
  })
  assert.equal(res.body.code, 0, '目标已存在标记时改名不应失败')

  assert.deepEqual(await listMarks(), ['标记目标库'])
})
