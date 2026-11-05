// 考试类型字典测试。
//
// 重点不是 CRUD 本身，而是三条约束：
//   1. 预置类型必须存在（老成绩用的是 final/mid/quiz/popquiz）；
//   2. 成绩只能引用字典里真实存在的 key（否则页面上会出现一个裸 key）；
//   3. 有成绩在用的类型不能被删（否则那些成绩失去名字）。
const test = require('node:test')
const assert = require('node:assert/strict')

const { createApiContext } = require('./helpers/apiContext')

let ctx = null
let bootError = null
let admin = null
let student = null

test.before(async () => {
  try {
    ctx = await createApiContext()
    admin = await ctx.login()
    const res = await ctx.request('POST', '/api/students', {
      token: admin,
      body: { name: '测试学生', grade: '高二' }
    })
    assert.equal(res.body.code, 0, res.body.message)
    student = res.body.data
  } catch (e) {
    bootError = e.message
  }
})

test.after(async () => {
  if (ctx) await ctx.teardown()
})

const reset = async () => {
  await ctx.models.ExamScore.destroy({ where: {} })
  // 删掉非预置的自定义类型，预置类型保留（其他用例/其他测试文件依赖）
  await ctx.models.ExamType.destroy({ where: { key: { [require('sequelize').Op.like]: 't_%' } } })
}

const withDb = (name, fn) =>
  test(name, async (t) => {
    if (bootError) return t.skip(bootError)
    await reset()
    try {
      await fn(t)
    } finally {
      await reset()
    }
  })

const listTypes = () => ctx.request('GET', '/api/exam-types', { token: admin })
const createType = (name) =>
  ctx.request('POST', '/api/exam-types', { token: admin, body: { name } })
const addGrade = (examType, extra = {}) =>
  ctx.request('POST', '/api/grades', {
    token: admin,
    body: {
      studentId: student.id,
      examType,
      subject: '数学',
      score: 90,
      fullScore: 100,
      examDate: '2026-10-01',
      ...extra
    }
  })

withDb('预置：期末/期中/月考/模拟考/小测/随堂测验', async () => {
  const res = await listTypes()
  assert.equal(res.body.code, 0, res.body.message)
  const names = res.body.data.map((x) => x.name)
  for (const name of ['期末', '期中', '月考', '模拟考', '小测', '随堂测验']) {
    assert.ok(names.includes(name), `缺少预置类型：${name}`)
  }
  const keys = res.body.data.map((x) => x.key)
  for (const key of ['final', 'mid', 'quiz', 'popquiz']) {
    assert.ok(keys.includes(key), '老成绩依赖的 key 不能丢')
  }
})

withDb('新建类型后可用于成绩；改名不影响成绩引用', async () => {
  const created = await createType('阶段考')
  assert.equal(created.body.code, 0, created.body.message)
  const key = created.body.data.key
  assert.match(key, /^t_[0-9a-f]{8}$/)

  const grade = await addGrade(key)
  assert.equal(grade.body.code, 0, grade.body.message)

  const renamed = await ctx.request('PATCH', `/api/exam-types/${key}`, {
    token: admin,
    body: { name: '阶段检测' }
  })
  assert.equal(renamed.body.code, 0, renamed.body.message)

  const types = await listTypes()
  const row = types.body.data.find((x) => x.key === key)
  assert.equal(row.name, '阶段检测', '显示名应更新')
  assert.equal(row.count, 1, '计数应跟着成绩走')

  // 成绩仍引用同一个 key
  const scores = await ctx.request('GET', `/api/grades?studentId=${student.id}`, { token: admin })
  assert.equal(scores.body.data[0].examType, key)
})

withDb('重名被拒；未知类型不能写成绩', async () => {
  const dup = await createType('月考')
  assert.equal(dup.body.code, 40000)

  const bad = await addGrade('nope')
  assert.equal(bad.body.code, 40000)
  assert.match(bad.body.message, /类型/)

  const imported = await ctx.request('POST', '/api/grades/import', {
    token: admin,
    body: [
      {
        studentId: student.id,
        examType: 'nope',
        subject: '数学',
        score: 80,
        fullScore: 100,
        examDate: '2026-10-02'
      }
    ]
  })
  assert.equal(imported.body.code, 0, imported.body.message)
  assert.equal(imported.body.data.failed, 1)
  assert.equal(imported.body.data.created, 0)
})

withDb('有成绩在用的类型不能删；未使用的可以删', async () => {
  const type = await createType('周测')
  assert.equal(type.body.code, 0, type.body.message)
  const key = type.body.data.key

  await addGrade(key)
  const blocked = await ctx.request('DELETE', `/api/exam-types/${key}`, { token: admin })
  assert.equal(blocked.body.code, 40000)
  assert.match(blocked.body.message, /成绩/)

  const unused = await createType('临时类型')
  const removed = await ctx.request('DELETE', `/api/exam-types/${unused.body.data.key}`, {
    token: admin
  })
  assert.equal(removed.body.code, 0, removed.body.message)
})
