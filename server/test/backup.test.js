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

const mkCategory = async (name) => {
  const res = await ctx.request('POST', '/api/homework-categories', { token, body: { name } })
  assert.equal(res.body.code, 0, res.body.message)
  return res.body.data
}

const mkHomework = async (title, categoryId) => {
  const res = await ctx.request('POST', '/api/homeworks', { token, body: { title, categoryId } })
  assert.equal(res.body.code, 0, res.body.message)
  return res.body.data
}

// 作业表的 category_id 是指向作业分类表的外键。这一条曾经在 MODEL_LIST 里整张表缺失，
// 结果是：导出不含分类 → 恢复时作业带着指向不存在分类的 id 入库 → 外键约束直接让整包 500。
withDb('导出：作业分类在主键被引用时也进备份包', async () => {
  const cat = await mkCategory('备份分类A')
  const hw = await mkHomework('分类往返作业', cat.id)

  const got = await ctx.requestBinary('/api/backup', { token })
  const zip = await JSZip.loadAsync(got.buffer)
  assert.ok(zip.file('homework_categories.json'), '分类表必须进包，否则恢复时作业的外键无处可指')

  const cats = JSON.parse(await zip.file('homework_categories.json').async('string'))
  assert.ok(
    cats.some((c) => c.id === cat.id && c.name === '备份分类A'),
    '分类记录应按原主键导出'
  )
  const hws = JSON.parse(await zip.file('homeworks.json').async('string'))
  assert.ok(hws.some((h) => h.id === hw.id && h.categoryId === cat.id))
})

withDb('恢复：分类在包内时，作业按原分类恢复', async () => {
  const cat = await mkCategory('往返分类B')
  const hw = await mkHomework('恢复后仍有分类的作业', cat.id)
  const backup = await ctx.requestBinary('/api/backup', { token })

  // 删掉分类（作业会被数据库置空 category_id），再用备份恢复
  await ctx.request('DELETE', `/api/homework-categories/${cat.id}`, { token })
  const restored = await ctx.upload('/api/backup/restore', {
    token,
    buffer: backup.buffer
  })
  assert.equal(restored.body.code, 0, restored.body.message)

  const row = await ctx.models.Homework.findByPk(hw.id, { raw: true })
  assert.equal(Number(row.categoryId), cat.id, '分类与作业的归属关系应一并恢复')
})

// 老备份（分类表还没进 MODEL_LIST 时导出的）里没有 homework_categories.json，
// 而作业行仍带着 category_id。这一类包必须能导入——只是分类名已经无从得知，
// 只能把作业归到「未分类」，绝不能因此整包失败或丢掉作业本身。
withDb('恢复：老备份没有分类文件时，作业保留并归为未分类', async () => {
  const cat = await mkCategory('不会进老备份的分类')
  const hw = await mkHomework('老备份里的作业', cat.id)
  const backup = await ctx.requestBinary('/api/backup', { token })

  const zip = await JSZip.loadAsync(backup.buffer)
  zip.remove('homework_categories.json')
  const hws = JSON.parse(await zip.file('homeworks.json').async('string'))
  // 让这条作业指向一个确定不存在的分类，模拟老备份里的悬空引用
  zip.file(
    'homeworks.json',
    JSON.stringify(hws.map((h) => (h.id === hw.id ? { ...h, categoryId: 987654 } : h)))
  )
  const buf = await zip.generateAsync({ type: 'nodebuffer' })

  // 先清掉作业，确认恢复真的把它写回来了
  await ctx.request('DELETE', `/api/homeworks/${hw.id}`, { token })

  const res = await ctx.upload('/api/backup/restore', { token, buffer: buf })
  assert.equal(res.body.code, 0, `外键指向不存在的分类不该让整包失败：${res.body.message}`)

  const row = await ctx.models.Homework.findByPk(hw.id, { raw: true })
  assert.ok(row, '作业本身必须保留，不能因为分类丢了就连作业一起丢')
  assert.equal(row.categoryId, null, '找不到的分类应置空，而不是保留悬空 id')
  assert.ok(res.body.data.relaxedTotal >= 1, '应如实报告「归为未分类」的条数')
  assert.match(res.body.message, /未分类/)
})
