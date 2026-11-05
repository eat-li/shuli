// 成绩聚合（学生卡片 / 成绩汇总）的接口级测试。
//
// 这两个接口原本把筛选后的成绩明细全部拉进内存再逐行累加，现在改成数据库聚合。
// 重写的风险不在「能不能算出来」，而在口径悄悄变了：分数段边界、平均分取整、
// 同一天两场考试哪条算「最近一次」、姓名筛选是否还包含无成绩的学生。
// 下面的用例把这些口径逐条钉住。
const test = require('node:test')
const assert = require('node:assert/strict')

const { createApiContext } = require('./helpers/apiContext')

let ctx = null
let bootError = null
let token = null
let zhang = null
let li = null

test.before(async () => {
  try {
    ctx = await createApiContext()
    token = await ctx.login()

    const mkStudent = async (name) => {
      const res = await ctx.request('POST', '/api/students', {
        token,
        body: { name, grade: '高一' }
      })
      assert.equal(res.body.code, 0, res.body.message)
      return res.body.data
    }
    zhang = await mkStudent('张三')
    li = await mkStudent('李四')
    await mkStudent('王五')
    // 名字里带 %：用来验证姓名匹配走的是字面子串，而不是 SQL LIKE 的通配符
    await mkStudent('百分%同学')

    const imported = await ctx.request('POST', '/api/grades/import', {
      token,
      body: [
        // 张三三场：90%、80%、120%（满分不同，口径应折算百分比）
        {
          studentId: zhang.id,
          examType: 'final',
          subject: '数学',
          score: 90,
          examDate: '2024-05-01'
        },
        { studentId: li.id, examType: 'quiz', subject: '数学', score: 50, examDate: '2024-05-01' },
        {
          studentId: zhang.id,
          examType: 'quiz',
          subject: '数学',
          score: 80,
          examDate: '2024-06-01'
        },
        // 满分 80 得 80 → 100%，用来验证「按百分比折算」而不是直接比原始分
        {
          studentId: zhang.id,
          examType: 'final',
          subject: '物理',
          score: 80,
          fullScore: 80,
          examDate: '2024-06-01'
        }
      ]
    })
    assert.equal(imported.body.code, 0, imported.body.message)
    assert.equal(imported.body.data.created, 4)
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

withDb('学生卡片：考试次数与「最近一次」由聚合算出，同一天取后录入的那条', async () => {
  const res = await ctx.request('GET', '/api/grades/cards', { token })
  assert.equal(res.body.code, 0, res.body.message)
  const byName = new Map(res.body.data.map((card) => [card.name, card]))

  const card = byName.get('张三')
  assert.equal(card.examCount, 3)
  assert.equal(card.latest.subject, '物理', '同一天两场考试应取 id 更大的那条')
  assert.equal(card.latest.score, 80)
  assert.equal(card.latest.fullScore, 80)
  assert.equal(card.latest.examDate, '2024-06-01')

  // 没成绩的学生仍然出现在卡片里，只是计数为 0、没有最近一次
  const empty = byName.get('王五')
  assert.equal(empty.examCount, 0)
  assert.equal(empty.latest, null)
})

withDb('学生卡片：姓名筛选只保留匹配的学生，成绩仍按该学生统计', async () => {
  const res = await ctx.request('GET', '/api/grades/cards?studentName=张', { token })
  assert.equal(res.body.code, 0, res.body.message)
  assert.deepEqual(
    res.body.data.map((card) => card.name),
    ['张三']
  )
  assert.equal(res.body.data[0].examCount, 3)
})

withDb('汇总：分数段、班级对比与逐行折算的结果一致', async () => {
  const res = await ctx.request('GET', '/api/grades/summary', { token })
  assert.equal(res.body.code, 0, res.body.message)

  const dist = Object.fromEntries(res.body.data.distribution.map((d) => [d.key, d.count]))
  assert.deepEqual(dist, { excellent: 2, good: 1, pass: 0, fail: 1 })

  const compare = res.body.data.compare
  assert.deepEqual(
    compare.map((c) => c.name),
    ['张三', '李四'],
    '只列出有成绩的学生，且按平均百分比降序'
  )
  assert.equal(compare[0].avgPercent, 90, '平均分保留一位小数')
  assert.equal(compare[0].count, 3)
  assert.equal(compare[1].avgPercent, 50)
})

withDb('汇总：单学生趋势按科目分组、日期升序；雷达忽略科目筛选', async () => {
  const res = await ctx.request('GET', `/api/grades/summary?studentId=${zhang.id}&subject=数学`, {
    token
  })
  assert.equal(res.body.code, 0, res.body.message)

  // 趋势跟随科目筛选：只有数学两场，按日期升序
  assert.equal(res.body.data.trend.length, 1)
  assert.equal(res.body.data.trend[0].subject, '数学')
  assert.deepEqual(
    res.body.data.trend[0].points.map((p) => p.percent),
    [90, 80]
  )

  // 雷达忽略科目筛选：数学 85、物理 100
  const radar = new Map(res.body.data.radar.map((r) => [r.subject, r.avgPercent]))
  assert.equal(radar.get('数学'), 85)
  assert.equal(radar.get('物理'), 100)
})

withDb('汇总：姓名筛选为字面子串（% 不是通配符），且不串用上一条缓存', async () => {
  // 先请求一个有结果的姓名，把结果写进缓存；紧接着请求 % 必须拿到另一份结果
  const liRes = await ctx.request('GET', '/api/grades/summary?studentName=李四', { token })
  assert.equal(liRes.body.code, 0, liRes.body.message)
  assert.deepEqual(
    liRes.body.data.compare.map((c) => c.name),
    ['李四']
  )

  const pctRes = await ctx.request('GET', '/api/grades/summary?studentName=%25', { token })
  assert.equal(pctRes.body.code, 0, pctRes.body.message)
  assert.deepEqual(
    pctRes.body.data.compare,
    [],
    '% 只应匹配名字里真的带 % 的学生（该学生无成绩），不能当成「匹配所有人」'
  )
})
