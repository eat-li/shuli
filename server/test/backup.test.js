// 备份与恢复的接口级测试。
//
// 为什么必须有：备份是老师数据的最后一道闸，而恢复逻辑里最容易出错的两处
// ——「孤儿引用跳过」与「老备份缺新表」——以前完全没有测试。
// 这类错误一旦发生，代价是「备份看着正常，恢复时整包失败」。
const test = require('node:test')
const assert = require('node:assert/strict')
const JSZip = require('jszip')

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

const mkQuestion = async (title, extra = {}) => {
  const res = await ctx.request('POST', '/api/questions', {
    token,
    body: { title: `<p>${title}</p>`, type: 'fill', ...extra }
  })
  assert.equal(res.body.code, 0)
  return res.body.data
}

withDb('导出：返回 zip，且必需文件齐全', async () => {
  await mkQuestion('备份用题 A')

  const got = await ctx.requestBinary('/api/backup', { token })
  assert.equal(got.status, 200)
  assert.match(got.contentType, /zip/)
  assert.ok(got.buffer.length > 200, 'zip 不该是空壳')

  const zip = await JSZip.loadAsync(got.buffer)
  for (const key of ['questions', 'students', 'homeworks', 'papers', 'paper_questions']) {
    assert.ok(zip.file(`${key}.json`), `备份包应包含 ${key}.json`)
  }
  assert.ok(zip.file('README.txt'), '备份包应包含说明文件')
})

// 分块导出靠字符串拼接（`[` / `,` / `]`），块边界写错就会产出非法 JSON ——
// 而且只有大表才会跨块，小数据测试永远发现不了。这里刻意造出远超单块行数的表。
withDb('导出：跨块的大表仍是合法 JSON，顺序与行数完整', async () => {
  const total = 1201
  await ctx.models.Student.bulkCreate(
    Array.from({ length: total }, (_, i) => ({ name: `跨块学生${i}`, grade: '高一' }))
  )

  const got = await ctx.requestBinary('/api/backup', { token })
  assert.equal(got.status, 200)
  const zip = await JSZip.loadAsync(got.buffer)
  const list = JSON.parse(await zip.file('students.json').async('string'))
  assert.equal(list.length, total)
  assert.equal(list[0].name, '跨块学生0')
  assert.equal(list[list.length - 1].name, `跨块学生${total - 1}`)
  assert.ok(
    list.every((row, i) => i === 0 || row.id > list[i - 1].id),
    '应按 id 升序拼接，块之间不能重复或跳行'
  )
})

withDb('往返：删掉的题目与试卷，恢复后按原主键回来', async () => {
  const q = await mkQuestion('往返测试题', { knowledgeTag: '往返' })
  const paper = await ctx.request('POST', '/api/papers', {
    token,
    body: {
      title: '往返测试卷',
      stage: 'senior3',
      items: [{ questionId: q.id, section: 'fill', score: 5 }]
    }
  })
  assert.equal(paper.body.code, 0)
  const paperId = paper.body.data.paper.id

  // 先备份（此刻库里有两样东西）
  const backup = await ctx.requestBinary('/api/backup', { token })

  // 再删掉（删题会级联清掉试卷关联，所以连卷一起删，模拟误删后恢复）
  await ctx.request('DELETE', `/api/papers/${paperId}`, { token })
  await ctx.request('DELETE', `/api/questions/${q.id}`, { token })
  const gone = await ctx.request('GET', `/api/questions/${q.id}`, { token })
  assert.equal(gone.body.code, 40400)

  const restored = await ctx.upload('/api/backup/restore', { token, buffer: backup.buffer })
  assert.equal(restored.body.code, 0, restored.body.message)
  assert.equal(restored.body.data.skippedTotal, 0)

  const back = await ctx.request('GET', `/api/questions/${q.id}`, { token })
  assert.equal(back.body.code, 0)
  assert.equal(back.body.data.title, `<p>往返测试题</p>`)

  const paperBack = await ctx.request('GET', `/api/papers/${paperId}`, { token })
  assert.equal(paperBack.body.code, 0)
  assert.equal(paperBack.body.data.items.length, 1, '试卷-题目关联也应恢复')
  assert.equal(paperBack.body.data.paper.title, '往返测试卷')
})

withDb('恢复：选错文件（缺必需表）时明确拒绝并列出缺什么', async () => {
  const zip = new JSZip()
  zip.file('questions.json', '[]')
  const buf = await zip.generateAsync({ type: 'nodebuffer' })

  const res = await ctx.upload('/api/backup/restore', { token, buffer: buf })
  assert.equal(res.body.code, 40000)
  assert.match(res.body.message, /缺少/)
  assert.match(res.body.message, /students/, '提示里应点名缺哪张表')
})

withDb('恢复：孤儿关联被跳过并如实报告，不牵连整包', async () => {
  const backup = await ctx.requestBinary('/api/backup', { token })

  // 往备份包里塞一行「指向不存在作业」的作业-学生关联
  const zip = await JSZip.loadAsync(backup.buffer)
  const orphan = [{ id: 987654, homeworkId: 987654, studentId: 987654 }]
  zip.file('homework_students.json', JSON.stringify(orphan))
  const buf = await zip.generateAsync({ type: 'nodebuffer' })

  const res = await ctx.upload('/api/backup/restore', { token, buffer: buf })
  assert.equal(res.body.code, 0, '孤儿记录不该让整包失败')
  assert.equal(res.body.data.skippedTotal, 1)
  assert.equal(res.body.data.skipped.homework_students.length, 1)
  assert.equal(res.body.data.skipped.homework_students[0].parent, 'homeworks')
  assert.match(res.body.message, /跳过/)

  // 该条孤儿确实没落库
  const rows = await ctx.models.HomeworkStudent.findAll({ where: { id: 987654 }, raw: true })
  assert.equal(rows.length, 0)
})

withDb('恢复：老备份缺少新增表（可选）仍可导入', async () => {
  const backup = await ctx.requestBinary('/api/backup', { token })
  const zip = await JSZip.loadAsync(backup.buffer)
  // 模拟「加试卷表之前导出的包」：删掉 optional 的新表
  zip.remove('papers.json')
  zip.remove('paper_questions.json')
  zip.remove('figures.json')
  const buf = await zip.generateAsync({ type: 'nodebuffer' })

  const res = await ctx.upload('/api/backup/restore', { token, buffer: buf })
  assert.equal(res.body.code, 0, 'optional 表缺失不该被当成损坏包')
  assert.match(res.body.message, /恢复完成/)
})
