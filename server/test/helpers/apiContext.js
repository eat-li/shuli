// 接口级测试底座：临时库 + 真实 app 监听随机端口。
//
// 为什么用独立库而不是开发库：接口级测试会写数据（建题、建卷、删题），
// 跑在老师的真实库上等于拿生产当试验场。SQLite 下这件事变得很轻——
// 每个测试进程开一个自己的临时文件库，测完直接删文件，不碰用户的 data/shuli.sqlite。
//
// 为什么不用 supertest：多一个依赖只为了省 20 行 fetch。项目其他测试都是零依赖风格。
//
// 注意执行顺序：`src/config/db.js` 在 require 时就按 DB_FILE 建好单例，
// 所以这里必须在**任何业务模块被 require 之前**把 DB_FILE 指向临时文件。
// 历史上踩过一次：测试文件顶部先 import 了 service，单例绑到开发库，
// 随后 sync({force:true}) 把真实数据清空。守卫留在下面，别删。
const fs = require('fs')
const os = require('os')
const path = require('path')

// 先加载 server/.env（若存在），再覆盖 DB_FILE——避免仓库里的 .env 把测试指到真实库。
require('../../src/config/env')

const TMP_PREFIX = 'shuli-test-'
const unique = `${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const DB_FILE = path.join(os.tmpdir(), `${TMP_PREFIX}${unique}.sqlite`)
process.env.DB_FILE = DB_FILE
process.env.NODE_ENV = 'test'

// 守卫：库文件必须落在系统临时目录且带测试前缀。
// 这是最后一道闸——teardown 会删文件，这里认错就等于删了用户的库。
function assertTestDb(file) {
  const resolved = path.resolve(file)
  const inTmp = resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)
  if (!inTmp || !path.basename(resolved).startsWith(TMP_PREFIX)) {
    throw new Error(`拒绝运行：${resolved} 不是测试库（应以 ${TMP_PREFIX} 开头且位于临时目录）`)
  }
}
assertTestDb(DB_FILE)

async function createApiContext() {
  const { sequelize } = require('../../src/models')

  // 确认单例真的连在临时库上：业务模块被提前 require 过时，这里会暴露出来。
  if (String(sequelize.storagePath) !== DB_FILE) {
    throw new Error(
      `拒绝运行：模型连接指向 ${sequelize.storagePath}，不是测试库 ${DB_FILE}。` +
        '这通常是因为在 createApiContext() 之前 require 了业务模块（sequelize 单例已绑定真实库）。'
    )
  }

  // force:true 每次从模型重建表，测试之间不残留上次的数据
  await sequelize.sync({ force: true })
  const { ensureIndexes } = require('../../src/utils/ensureIndexes')
  await ensureIndexes(sequelize, { throwOnError: true })
  // 预置数据（考试类型字典等）与生产启动同一条路径，测试才能反映真实首启行为
  await require('../../src/utils/seed').seedDefaults()

  const app = require('../../src/app')
  const server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  const port = server.address().port

  const request = async (method, urlPath, { token, body, raw = false } = {}) => {
    const res = await fetch(`http://127.0.0.1:${port}${urlPath}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    const text = await res.text()
    if (raw) return { status: res.status, text }
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      /* 非 JSON（如 SPA 回退返回 HTML） */
    }
    return { status: res.status, body: json, text }
  }

  /** 取二进制响应（备份导出是 zip，不能走 JSON 解析） */
  const requestBinary = async (urlPath, { token } = {}) => {
    const res = await fetch(`http://127.0.0.1:${port}${urlPath}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    return {
      status: res.status,
      contentType: res.headers.get('content-type') || '',
      buffer: Buffer.from(await res.arrayBuffer())
    }
  }

  /** multipart 上传（备份恢复走这条），不手动设 Content-Type，交给 fetch 生成 boundary */
  const upload = async (
    urlPath,
    { token, buffer, filename = 'backup.zip', field = 'file', fields } = {}
  ) => {
    const form = new FormData()
    form.append(field, new Blob([buffer]), filename)
    // 额外表单字段（如资料库的 categoryId）
    for (const [key, value] of Object.entries(fields || {})) form.append(key, String(value))
    const res = await fetch(`http://127.0.0.1:${port}${urlPath}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form
    })
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      /* 非 JSON */
    }
    return { status: res.status, body: json, text }
  }

  // 单用户版本没有鉴权：不需要登录，也不产生令牌。
  // 保留这个入口是为了让调用方（withDb 里的 token 变量）不改结构——
  // 传 undefined 时 request 不会带 Authorization 头。
  const login = async () => null

  /** 关连接 → 删库文件。删除放 finally：即使关连接报错，也尽量不留垃圾文件 */
  const teardown = async () => {
    try {
      await new Promise((resolve) => server.close(resolve))
      await sequelize.close()
    } finally {
      assertTestDb(DB_FILE)
      // WAL 模式会额外产生 -wal / -shm，一起清掉
      for (const suffix of ['', '-wal', '-shm']) {
        try {
          fs.unlinkSync(DB_FILE + suffix)
        } catch {
          /* 不存在就跳过 */
        }
      }
    }
  }

  // 直接查库用于断言（例如等级记录是否成了孤儿），测试里不必绕 HTTP
  const models = require('../../src/models')

  return { request, requestBinary, upload, login, teardown, dbFile: DB_FILE, port, models }
}

module.exports = { createApiContext }
