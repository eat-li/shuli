// 讲义列表的接口级测试。
//
// 列表接口不再回正文，只回篇幅统计（字数/图片数/表格数）——
// 一旦统计口径和列表页对不上，页面上每个讲义都会显示错误的篇幅，
// 而正文又在别处，排查起来很容易误判成「数据丢了」。这里钉住：
// 统计口径、正文不出现在列表、正文仍能从详情接口拿到。
const test = require('node:test')
const assert = require('node:assert/strict')

const { createApiContext } = require('./helpers/apiContext')

let ctx = null
let bootError = null
let token = null
let docId = null
let legacyId = null

const CONTENT = '<p>第一段 &nbsp;文本</p><img src="x.png"><table><tr><td>单元</td></tr></table>'

test.before(async () => {
  try {
    ctx = await createApiContext()
    token = await ctx.login()

    const doc = await ctx.request('POST', '/api/handouts', {
      token,
      body: { title: '统计用讲义', content: CONTENT }
    })
    assert.equal(doc.body.code, 0, doc.body.message)
    docId = doc.body.data.id

    // 改造前的旧讲义：只有 items、没有正文
    const legacy = await ctx.request('POST', '/api/handouts', {
      token,
      body: { title: '旧格式讲义', items: [{ type: 'question', id: 1 }] }
    })
    assert.equal(legacy.body.code, 0, legacy.body.message)
    legacyId = legacy.body.data.id
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

withDb('列表：只回篇幅统计，不回正文', async () => {
  const res = await ctx.request('GET', '/api/handouts?page=1&pageSize=20', { token })
  assert.equal(res.body.code, 0, res.body.message)

  const doc = res.body.data.list.find((h) => h.id === docId)
  assert.ok(doc, '列表应包含新建的讲义')
  assert.equal('content' in doc, false, '列表不应回正文')
  // 去标签后：「第一段 文本」+「单元」= 8 个字符（&nbsp; 不计）
  assert.equal(doc.contentChars, 8)
  assert.equal(doc.contentImages, 1)
  assert.equal(doc.contentTables, 1)

  const legacy = res.body.data.list.find((h) => h.id === legacyId)
  assert.equal(legacy.contentChars, 0)
  assert.equal(legacy.items.length, 1)
})

withDb('详情：正文照常返回，编辑页不受影响', async () => {
  const res = await ctx.request('GET', `/api/handouts/${docId}`, { token })
  assert.equal(res.body.code, 0, res.body.message)
  assert.equal(res.body.data.content, CONTENT)
})
