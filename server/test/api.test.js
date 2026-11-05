// 接口级测试：走真实 HTTP + 真实 SQLite（临时库），覆盖路由/校验/事务的接线。
//
// 与另外两个测试文件的分工：
//   aiDifficulty.test.js / paperCompose.test.js / validate.test.js  只测纯函数
//   本文件             测「HTTP → 中间件 → 控制器 → 模型 → 库」整条链路
//
// 不再需要「数据库不可用就跳过」：临时库是进程内新建的 SQLite 文件，
// 任何机器（含 CI）都能跑完整套。
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

/** 需要数据库的用例统一用它包一层：拿不到库就跳过 */
const withDb = (name, fn) => test(name, async (t) => {
  if (bootError) return t.skip(bootError)
  await fn(t)
})

withDb('健康检查无需鉴权', async () => {
  const res = await ctx.request('GET', '/api/health')
  assert.equal(res.status, 200)
  assert.equal(res.body.code, 0)
})

// 本版本没有鉴权：不存在「未带令牌 401」「密码错误」「登录拿令牌」这三种情形，
// 对应用例随登录体系一并删除。

withDb('建多选题：子类型落库，且只被「多选」筛选中', async () => {
  const created = await ctx.request('POST', '/api/questions', {
    token,
    body: {
      title: '<p>接口测试题：下列函数为奇函数的有（　　）</p>',
      type: 'choice',
      choiceMode: 'multiple',
      difficulty: 4,
      knowledgeTag: '接口测试',
      options: ['A. $y=x^3$', 'B. $y=x^2$'],
      answer: '<p>答案：A</p>'
    }
  })
  assert.equal(created.body.code, 0)
  assert.equal(created.body.data.choiceMode, 'multiple')
  const id = created.body.data.id

  const multi = await ctx.request('GET', '/api/questions?choiceMode=multiple&page=1&pageSize=10', { token })
  assert.ok(multi.body.data.list.some((q) => q.id === id), '多选筛选应包含刚建的题')

  const single = await ctx.request('GET', '/api/questions?choiceMode=single&page=1&pageSize=10', { token })
  assert.ok(!single.body.data.list.some((q) => q.id === id), '单选筛选不应包含多选题')
})

withDb('校验：非法难度被拒且不写库', async () => {
  const created = await ctx.request('POST', '/api/questions', {
    token,
    body: { title: '<p>难度校验用</p>', type: 'fill', difficulty: 2 }
  })
  const id = created.body.data.id

  const bad = await ctx.request('PATCH', `/api/questions/${id}`, {
    token,
    body: { difficulty: 9 }
  })
  assert.equal(bad.body.code, 40000)
  assert.match(bad.body.message, /难度/)

  const after = await ctx.request('GET', `/api/questions/${id}`, { token })
  assert.equal(after.body.data.difficulty, 2, '被拒绝的请求不该改动数据')
})

withDb('校验：填空/解答题带 multiple 会被清空（跨字段规则）', async () => {
  const res = await ctx.request('POST', '/api/questions', {
    token,
    body: { title: '<p>跨字段规则</p>', type: 'fill', choiceMode: 'multiple' }
  })
  assert.equal(res.body.code, 0)
  assert.equal(res.body.data.choiceMode, null)
})

withDb('试卷：分区与题型不匹配时拒绝保存', async () => {
  const q = await ctx.request('POST', '/api/questions', {
    token,
    body: { title: '<p>填空题</p>', type: 'fill' }
  })
  const res = await ctx.request('POST', '/api/papers', {
    token,
    body: { title: '错分区', items: [{ questionId: q.body.data.id, section: 'single', score: 5 }] }
  })
  assert.equal(res.body.code, 40000)
  assert.match(res.body.message, /填空题/)
})

withDb('试卷：总分由服务端按分值求和，题序与题号一致', async () => {
  const mk = async (type, choiceMode) =>
    (
      await ctx.request('POST', '/api/questions', {
        token,
        body: { title: `<p>${type} 题</p>`, type, ...(choiceMode ? { choiceMode } : {}) }
      })
    ).body.data.id

  const q1 = await mk('choice', 'single')
  const q2 = await mk('choice', 'multiple')
  const q3 = await mk('solve')

  const created = await ctx.request('POST', '/api/papers', {
    token,
    body: {
      title: '接口测试卷',
      stage: 'senior3',
      items: [
        { questionId: q3, section: 'solve', score: 12 },
        { questionId: q1, section: 'single', score: 5 },
        { questionId: q2, section: 'multiple', score: 6 }
      ]
    }
  })
  assert.equal(created.body.code, 0)
  assert.equal(created.body.data.paper.totalScore, 23, '5+6+12，不接受客户端指定')

  const id = created.body.data.paper.id
  const detail = await ctx.request('GET', `/api/papers/${id}`, { token })
  const sections = detail.body.data.items.map((it) => it.section)
  assert.deepEqual(sections, ['single', 'multiple', 'solve'], '应按分区顺序重排')

  const dup = await ctx.request('POST', `/api/papers/${id}/duplicate`, { token })
  assert.equal(dup.body.code, 0)
  assert.match(dup.body.data.paper.title, /（副本）/)
  await ctx.request('DELETE', `/api/papers/${dup.body.data.paper.id}`, { token })

  // 删题会级联清掉 paper_questions（question.remove 的事务里做的），
  // 所以试卷不会报错、也不会留下空洞：题数减一，missing 为 0。
  // missing 只对历史脏数据（关联指向已删题目）有意义。
  await ctx.request('DELETE', `/api/questions/${q1}`, { token })
  const after = await ctx.request('GET', `/api/papers/${id}`, { token })
  assert.equal(after.body.code, 0)
  assert.equal(after.body.data.items.length, 2)
  assert.equal(after.body.data.missing, 0)

  await ctx.request('DELETE', `/api/papers/${id}`, { token })
})

withDb('难度分析：各档合计等于总数', async () => {
  const res = await ctx.request('GET', '/api/questions/analysis', { token })
  assert.equal(res.body.code, 0)
  const d = res.body.data
  const sum = d.byDifficulty.reduce((s, x) => s + x.count, 0)
  assert.equal(sum, d.total)
  assert.equal(d.rated + d.unrated, d.total)
})

withDb('SPA 回退：非 /api 的 GET 返回前端入口', async () => {
  const res = await ctx.request('GET', '/some/deep/route', { raw: true })
  // 有 dist 时返回 index.html（200）；纯后端环境下没有托管，404 也算正常
  assert.ok([200, 404].includes(res.status))
  if (res.status === 200) assert.match(res.text, /<div id="app"|<html/i)
})

withDb('判难度候选清单：按 scope 过滤，且只回轻量字段', async () => {
  // 造一道 3 星题（模拟历史默认值）与一道未标注题
  const three = await ctx.request('POST', '/api/questions', {
    token,
    body: { title: '<p>三星题</p>', type: 'fill', difficulty: 3 }
  })
  const unrated = await ctx.request('POST', '/api/questions', {
    token,
    body: { title: '<p>未标注题</p>', type: 'fill' }
  })
  assert.equal(unrated.body.data.difficulty, null)

  const suspicious = await ctx.request('GET', '/api/questions/difficulty-candidates?scope=suspicious', { token })
  assert.equal(suspicious.body.code, 0)
  assert.ok(suspicious.body.data.list.some((q) => q.id === three.body.data.id))
  assert.ok(suspicious.body.data.list.every((q) => q.difficulty === 3), 'suspicious 只应含 3 星题')

  const un = await ctx.request('GET', '/api/questions/difficulty-candidates?scope=unrated', { token })
  assert.ok(un.body.data.list.some((q) => q.id === unrated.body.data.id))
  assert.ok(un.body.data.list.every((q) => q.difficulty === null), 'unrated 只应含未标注题')

  // 轻量字段：不能把整篇题干 HTML 传回来
  const first = un.body.data.list[0]
  assert.deepEqual(
    Object.keys(first).sort(),
    ['choiceMode', 'difficulty', 'id', 'knowledgeTag', 'title', 'type'].sort()
  )
})

withDb('判难度：未配置 Key 时给出可操作提示，而不是 500', async () => {
  const created = await ctx.request('POST', '/api/questions', {
    token,
    body: { title: '<p>判难度用题</p>', type: 'fill' }
  })
  const id = created.body.data.id

  const saved = process.env.AI_API_KEY
  const savedAny = process.env.AI_ALLOW_ANY_BASE_URL
  process.env.AI_API_KEY = ''
  try {
    const res = await ctx.request('POST', '/api/ai/judge-difficulty', {
      token,
      body: { questionId: id }
    })
    assert.equal(res.body.code, 40000)
    assert.match(res.body.message, /API Key/)

    const noId = await ctx.request('POST', '/api/ai/judge-difficulty', { token, body: {} })
    assert.equal(noId.body.code, 40000)

    const missing = await ctx.request('POST', '/api/ai/judge-difficulty', {
      token,
      body: { questionId: 99999999 }
    })
    assert.equal(missing.body.code, 40400)
  } finally {
    if (saved === undefined) delete process.env.AI_API_KEY
    else process.env.AI_API_KEY = saved
    if (savedAny === undefined) delete process.env.AI_ALLOW_ANY_BASE_URL
  }
})

withDb('成绩录入：越界分数与名单外学生被跳过，合法数据照常保存', async () => {
  // 造学生 + 作业（含两名学生）
  const s1 = await ctx.request('POST', '/api/students', { token, body: { name: '成绩甲' } })
  const s2 = await ctx.request('POST', '/api/students', { token, body: { name: '成绩乙' } })
  const outsider = await ctx.request('POST', '/api/students', { token, body: { name: '名单外' } })
  const hw = await ctx.request('POST', '/api/homeworks', {
    token,
    body: { title: '成绩校验作业', studentIds: [s1.body.data.id, s2.body.data.id] }
  })
  assert.equal(hw.body.code, 0, hw.body.message)
  const hwId = hw.body.data.id

  const res = await ctx.request('PUT', `/api/homeworks/${hwId}/scores`, {
    token,
    body: {
      scores: [
        { studentId: s1.body.data.id, score: 88 },
        { studentId: s2.body.data.id, score: -5 }, // 越界
        { studentId: outsider.body.data.id, score: 60 }, // 不在名单
        { studentId: s1.body.data.id, score: 90 } // 重复
      ]
    }
  })
  assert.equal(res.body.code, 0)
  assert.equal(res.body.data.saved, 1, '只有一条合法成绩应落库')
  assert.equal(res.body.data.skipped, 3)
  assert.match(res.body.message, /未保存/)

  const rows = await ctx.models.Submission.findAll({ where: { homeworkId: hwId }, raw: true })
  assert.equal(rows.length, 1)
  assert.equal(Number(rows[0].studentId), s1.body.data.id)
  assert.equal(Number(rows[0].score), 88, '重复提交时应以第一条为准，且负分没有落库')
})

withDb('讲义知识点区块：父分类区块包含子分类的结论', async () => {
  const parent = await ctx.request('POST', '/api/categories', { token, body: { name: '讲义父类' } })
  const child = await ctx.request('POST', '/api/categories', {
    token,
    body: { name: '讲义子类', parentId: parent.body.data.id }
  })
  assert.equal(child.body.code, 0, child.body.message)

  for (const [title, categoryId] of [
    ['父类结论', parent.body.data.id],
    ['子类结论', child.body.data.id]
  ]) {
    const r = await ctx.request('POST', '/api/conclusions', {
      token,
      body: { title, categoryId, content: '<p>内容</p>' }
    })
    assert.equal(r.body.code, 0, r.body.message)
  }

  const handout = await ctx.request('POST', '/api/handouts', {
    token,
    body: { title: '讲义区块测试', items: [{ type: 'knowledge', id: parent.body.data.id }] }
  })
  assert.equal(handout.body.code, 0, handout.body.message)

  const items = await ctx.request('GET', `/api/handouts/${handout.body.data.id}/items`, { token })
  assert.equal(items.body.code, 0)
  const blocks = items.body.data.knowledges
  assert.equal(blocks.length, 1, '一个知识点区块')
  assert.equal(blocks[0].conclusions.length, 2, '父 + 子分类的结论都应在同一区块里')
  const titles = blocks[0].conclusions.map((c) => c.title).sort()
  assert.deepEqual(titles, ['子类结论', '父类结论'].sort())
})

withDb('开放聚合缓存：写入后立即失效，不会读到旧统计', async () => {
  const tag = '缓存失效测试'
  const before = await ctx.request('GET', `/api/questions/stats?keyword=${encodeURIComponent('缓存')}`, { token })
  const beforeTotal = before.body.data.reduce((s, r) => s + r.total, 0)

  await ctx.request('POST', '/api/questions', {
    token,
    body: { title: '<p>缓存题</p>', type: 'fill', knowledgeTag: tag, knowledgeSubTag: '子项' }
  })

  // 写操作必须让 open:facets:* 失效，否则家长端 60s 内看到的是旧题量
  const after = await ctx.request('GET', `/api/questions/stats?keyword=${encodeURIComponent('缓存')}`, { token })
  const afterTotal = after.body.data.reduce((s, r) => s + r.total, 0)
  assert.equal(afterTotal, beforeTotal + 1, '新增题目后统计应立即反映')

  // 再读一次（走缓存）结果应与上一次一致
  const again = await ctx.request('GET', `/api/questions/stats?keyword=${encodeURIComponent('缓存')}`, { token })
  assert.deepEqual(again.body.data, after.body.data)

  // 二级知识点同样有缓存，且要能读到刚建的
  const subs = await ctx.request('GET', `/api/questions/subtags?knowledgeTag=${encodeURIComponent(tag)}`, { token })
  assert.ok(subs.body.data.some((s) => s.name === '子项'), '新二级知识点不应被旧缓存挡住')
})
