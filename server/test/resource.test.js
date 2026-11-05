// 资料库接口测试：分类整理、上传校验、列表筛选、删除。
//
// OSS 用内存桩替换：测试绝不能往真实桶里写文件。桩必须在 createApiContext()
// 加载 app 之前塞进 require 缓存（控制器在模块加载时就解构了 client）。
const test = require('node:test')
const assert = require('node:assert/strict')
const { Readable } = require('node:stream')

const ossPath = require.resolve('../src/config/oss')
const puts = []
const deleted = []
require.cache[ossPath] = {
  id: ossPath,
  filename: ossPath,
  loaded: true,
  exports: {
    BASE_URL: 'https://oss.test',
    client: {
      put: async (key, buffer, opts) => {
        puts.push({ key, size: buffer.length, opts })
        return { name: key }
      },
      delete: async (key) => {
        deleted.push(key)
        return {}
      },
      // 批量下载从 OSS 读流；内容带 key 前缀，便于断言 zip 里装的是哪个对象
      getStream: async (key) => ({ stream: Readable.from([Buffer.from('BODY:' + key)]) })
    }
  }
}

const { createApiContext } = require('./helpers/apiContext')

let ctx = null
let bootError = null
let admin = null

test.before(async () => {
  try {
    ctx = await createApiContext()
    admin = await ctx.login()
  } catch (e) {
    bootError = e.message
  }
})

test.after(async () => {
  if (ctx) await ctx.teardown()
})

const reset = async () => {
  await ctx.models.Resource.destroy({ where: {} })
  await ctx.models.ResourceCategory.destroy({ where: {} })
  puts.length = 0
  deleted.length = 0
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

const mkCategory = async (name, parentId) => {
  const body = parentId === undefined ? { name } : { name, parentId }
  const res = await ctx.request('POST', '/api/resource-categories', {
    token: admin,
    body
  })
  assert.equal(res.body.code, 0, res.body.message)
  return res.body.data
}

const upload = (filename, { buffer = Buffer.from('hello'), fields, token = admin } = {}) =>
  ctx.upload('/api/resources/upload', { token, buffer, filename, fields })

const list = (query = '') => ctx.request('GET', `/api/resources${query}`, { token: admin })

withDb('上传：中文文件名不乱码，PDF 内联预览', async () => {
  const cat = await mkCategory('教案')

  const res = await upload('教案-函数.pdf', {
    buffer: Buffer.from('%PDF-1.4 test'),
    fields: { categoryId: cat.id }
  })
  assert.equal(res.body.code, 0, res.body.message)
  const item = res.body.data
  assert.equal(item.originalName, '教案-函数.pdf')
  assert.equal(item.title, '教案-函数.pdf')
  assert.equal(item.ext, '.pdf')
  assert.equal(item.categoryId, cat.id)
  assert.match(item.url, /^https:\/\/oss\.test\/resources\/\d{4}-\d{2}\//)

  assert.equal(puts.length, 1)
  assert.equal(puts[0].opts.mime, 'application/pdf')
  assert.equal(puts[0].opts.headers?.['Content-Disposition'], undefined, 'PDF 应内联预览')
})

withDb('上传：Office 文件按附件下载，文件名走 RFC 5987 编码', async () => {
  const res = await upload('期中 review.pptx')
  assert.equal(res.body.code, 0, res.body.message)
  const disposition = puts[0].opts.headers['Content-Disposition']
  assert.match(disposition, /^attachment; filename\*=UTF-8''/)
  assert.ok(disposition.includes(encodeURIComponent('期中 review.pptx')))
})

withDb('上传校验：类型白名单、缺文件、分类不存在都不落 OSS', async () => {
  const badType = await upload('virus.exe')
  assert.equal(badType.body.code, 40000)
  assert.equal(puts.length, 0)

  // 不传文件（JSON 请求没有 multipart 文件段）
  const noFile = await ctx.request('POST', '/api/resources/upload', { token: admin, body: {} })
  assert.equal(noFile.body.code, 40000)

  const badCat = await upload('ok.pdf', { fields: { categoryId: 999999 } })
  assert.equal(badCat.body.code, 40000)
  assert.match(badCat.body.message, /分类/)
  assert.equal(puts.length, 0)
})

withDb('列表：标题/备注关键字与「未分类」筛选', async () => {
  const cat = await mkCategory('参考书')
  const inCat = (await upload('a.pdf', { fields: { categoryId: cat.id } })).body.data
  const noCat = (await upload('b.pdf')).body.data
  assert.equal(noCat.categoryId, null)

  await ctx.request('PATCH', `/api/resources/${inCat.id}`, {
    token: admin,
    body: { title: '导数专题', remark: '一轮复习' }
  })

  const byKeyword = await list('?keyword=导数')
  assert.deepEqual(
    byKeyword.body.data.list.map((r) => r.id),
    [inCat.id]
  )

  const byRemark = await list('?keyword=一轮')
  assert.deepEqual(
    byRemark.body.data.list.map((r) => r.id),
    [inCat.id]
  )

  const uncategorized = await list('?categoryId=none')
  assert.deepEqual(
    uncategorized.body.data.list.map((r) => r.id),
    [noCat.id]
  )

  const byCat = await list(`?categoryId=${cat.id}`)
  assert.deepEqual(
    byCat.body.data.list.map((r) => r.id),
    [inCat.id]
  )
})

withDb('更新：移动分类、改标题；空标题与不存在的分类被拒', async () => {
  const cat = await mkCategory('试卷')
  const item = (await upload('c.pdf')).body.data

  const moved = await ctx.request('PATCH', `/api/resources/${item.id}`, {
    token: admin,
    body: { categoryId: cat.id, title: '第三次月考' }
  })
  assert.equal(moved.body.code, 0, moved.body.message)
  assert.equal(moved.body.data.categoryId, cat.id)
  assert.equal(moved.body.data.title, '第三次月考')

  const emptyTitle = await ctx.request('PATCH', `/api/resources/${item.id}`, {
    token: admin,
    body: { title: '   ' }
  })
  assert.equal(emptyTitle.body.code, 40000)

  const badCat = await ctx.request('PATCH', `/api/resources/${item.id}`, {
    token: admin,
    body: { categoryId: 999999 }
  })
  assert.equal(badCat.body.code, 40000)
})

withDb('分类：重名拒绝；删分类把资料移回未分类，文件不删', async () => {
  const cat = await mkCategory('模板')
  const item = (await upload('d.pdf', { fields: { categoryId: cat.id } })).body.data

  const dup = await ctx.request('POST', '/api/resource-categories', {
    token: admin,
    body: { name: '模板' }
  })
  assert.equal(dup.body.code, 40000)

  const listed = await ctx.request('GET', '/api/resource-categories', { token: admin })
  assert.equal(listed.body.data.list[0].count, 1)
  assert.equal(listed.body.data.uncategorized, 0)
  assert.equal(listed.body.data.total, 1)

  const removed = await ctx.request('DELETE', `/api/resource-categories/${cat.id}`, {
    token: admin
  })
  assert.equal(removed.body.code, 0, removed.body.message)
  assert.equal(removed.body.data.moved, 1)

  const row = await ctx.models.Resource.findByPk(item.id, { raw: true })
  assert.ok(row, '资料不应被删除')
  assert.equal(row.categoryId, null)
  assert.equal(deleted.length, 0, '删分类不应删 OSS 文件')
})

withDb('批量下载：多个文件打包成 zip，重名自动加序号', async () => {
  const a = (await upload('a.pdf')).body.data
  const b = (await upload('a.pdf')).body.data
  const c = (await upload('周测:答案.docx')).body.data

  const res = await ctx.requestBinary(`/api/resources/batch-download?ids=${a.id},${b.id},${c.id}`, {
    token: admin
  })
  assert.equal(res.status, 200)
  assert.match(res.contentType, /application\/zip/)

  const JSZip = require('jszip')
  const zip = await JSZip.loadAsync(res.buffer)
  const names = Object.keys(zip.files).sort()
  // 同名文件加序号；路径分隔符不能进 zip（会被当成子目录）
  assert.deepEqual(names, ['a (1).pdf', 'a.pdf', '周测_答案.docx'])
  for (const name of names) {
    assert.match(await zip.file(name).async('string'), /^BODY:/)
  }

  const empty = await ctx.request('GET', '/api/resources/batch-download', { token: admin })
  assert.equal(empty.body.code, 40000)

  const missing = await ctx.request('GET', '/api/resources/batch-download?ids=999999', {
    token: admin
  })
  assert.equal(missing.body.code, 40400)
})

withDb('删除资料：记录消失，OSS 对象同步删除', async () => {
  const item = (await upload('e.pdf')).body.data
  const key = item.key

  const res = await ctx.request('DELETE', `/api/resources/${item.id}`, { token: admin })
  assert.equal(res.body.code, 0, res.body.message)

  const row = await ctx.models.Resource.findByPk(item.id)
  assert.equal(row, null)
  assert.deepEqual(deleted, [key])
})

withDb('多级目录：同级重名拒绝，不同上级可同名，父目录必须存在', async () => {
  const grade1 = await mkCategory('高一')
  const grade2 = await mkCategory('高二')
  assert.equal(grade1.parentId, null)

  const lesson = await mkCategory('必修一', grade1.id)
  assert.equal(lesson.parentId, grade1.id)

  const dupSibling = await ctx.request('POST', '/api/resource-categories', {
    token: admin,
    body: { name: '必修一', parentId: grade1.id }
  })
  assert.equal(dupSibling.body.code, 40000)

  const dupRoot = await ctx.request('POST', '/api/resource-categories', {
    token: admin,
    body: { name: '高一' }
  })
  assert.equal(dupRoot.body.code, 40000)

  // 同名但不同上级是允许的
  const lesson2 = await mkCategory('必修一', grade2.id)

  const badParent = await ctx.request('POST', '/api/resource-categories', {
    token: admin,
    body: { name: '孤儿', parentId: 999999 }
  })
  assert.equal(badParent.body.code, 40000)
  assert.match(badParent.body.message, /上级目录/)

  const listed = (await ctx.request('GET', '/api/resource-categories', { token: admin })).body.data
  const ids = listed.list.map((c) => c.id)
  assert.ok(ids.includes(lesson2.id))
})

withDb('多级目录：选中上级目录包含子孙资料，计数按子树累计', async () => {
  const root = await mkCategory('高一')
  const child = await mkCategory('必修一', root.id)
  const grand = await mkCategory('课件', child.id)

  const inChild = (await upload('a.pdf', { fields: { categoryId: child.id } })).body.data
  const inGrand = (await upload('b.pdf', { fields: { categoryId: grand.id } })).body.data
  await upload('c.pdf')

  const cats = (await ctx.request('GET', '/api/resource-categories', { token: admin })).body.data
  const find = (id) => cats.list.find((c) => c.id === id)
  assert.equal(find(root.id).count, 0)
  assert.equal(find(root.id).totalCount, 2)
  assert.equal(find(child.id).totalCount, 2)
  assert.equal(find(grand.id).totalCount, 1)
  assert.equal(cats.total, 3, '全部资料包含未分类')
  assert.equal(cats.uncategorized, 1)

  const rootList = await list(`?categoryId=${root.id}`)
  assert.deepEqual(
    rootList.body.data.list.map((r) => r.id).sort((a, b) => a - b),
    [inChild.id, inGrand.id].sort((a, b) => a - b)
  )

  const childList = await list(`?categoryId=${child.id}`)
  assert.equal(childList.body.data.total, 2)

  const grandList = await list(`?categoryId=${grand.id}`)
  assert.deepEqual(
    grandList.body.data.list.map((r) => r.id),
    [inGrand.id]
  )
})

withDb('多级目录：有子目录时拒绝删除；删除子目录把资料上移到上级', async () => {
  const root = await mkCategory('高三')
  const child = await mkCategory('一轮复习', root.id)
  const item = (await upload('d.pdf', { fields: { categoryId: child.id } })).body.data

  const blocked = await ctx.request('DELETE', `/api/resource-categories/${root.id}`, {
    token: admin
  })
  assert.equal(blocked.body.code, 40000)
  assert.match(blocked.body.message, /子目录/)

  const removedChild = await ctx.request('DELETE', `/api/resource-categories/${child.id}`, {
    token: admin
  })
  assert.equal(removedChild.body.code, 0, removedChild.body.message)
  assert.equal(removedChild.body.data.moved, 1)
  assert.equal(removedChild.body.data.movedTo, root.id)

  let row = await ctx.models.Resource.findByPk(item.id, { raw: true })
  assert.equal(row.categoryId, root.id)

  const removedRoot = await ctx.request('DELETE', `/api/resource-categories/${root.id}`, {
    token: admin
  })
  assert.equal(removedRoot.body.code, 0, removedRoot.body.message)
  assert.equal(removedRoot.body.data.movedTo, null)

  row = await ctx.models.Resource.findByPk(item.id, { raw: true })
  assert.equal(row.categoryId, null)
  assert.equal(deleted.length, 0, '删目录不应删 OSS 文件')
})
