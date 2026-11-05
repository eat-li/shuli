// 接口级测试底座：临时库 + 真实 app 监听随机端口。
//
// 为什么要独立库而不是连开发库：
//   接口级测试会写数据（建题、建卷、删题），跑在老师的真实库上等于拿生产当试验场。
//   这里用 `<DB_NAME>_test` 建一个临时库，测完直接 DROP。
//   库名必须以 `_test` 结尾，且不得等于开发库——这是硬闸门，防止配置写错就清库。
//
// 为什么不用 supertest：
//   多一个依赖只为了省 20 行 fetch。项目其他测试都是零依赖风格，保持一致。
//
// 整套测试用 `--test-concurrency=1` 串行跑（见根 package.json）：
//   并行时多个进程会同时对 MySQL 做 CREATE DATABASE / sync({force}) / DROP DATABASE，
//   并发 DDL 下偶发 "Duplicate key name" / 外键删除失败，表现成随机跳过的用例。
//   串行约 30 秒，换来的是确定性。
const path = require('path')

// 注意：dotenv 必须在 require 任何业务模块之前执行，
// 因为 src/config/db.js 在 require 时就把 DB_NAME 读进了一个单例。
require('dotenv').config({ path: path.join(__dirname, '../../.env') })

const mysql = require('mysql2/promise')

const baseConn = () => ({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASS
})

// 守卫前缀必须在**覆写 process.env.DB_NAME 之前**取好。
// 否则销毁阶段读到的是测试库名，守卫会把合法删除误判成危险操作（踩过）。
const REAL_DB = String(process.env.DB_NAME || '').trim()
const GUARD_PREFIX = `${REAL_DB}_test`

// 每个测试进程用独立库名，且必须以 `<开发库>_test` 开头（teardown 的清库守卫靠它）。
//
// 只用 pid 作后缀不够：进程退出后 pid 会被系统复用，上一轮残留的同名库（teardown 没跑完）
// 会让 sync({force:true}) 去 DROP 还带着外键的表，报 ER_ROW_IS_REFERENCED。
// 加时间戳 + 随机后缀，保证每次 createApiContext 都是全新的库。
function testDbName() {
  if (!REAL_DB) throw new Error('缺少 DB_NAME，无法推导测试库名')
  const unique = `${process.pid}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  return `${GUARD_PREFIX}_${unique}`
}

// 关键：`src/config/db.js` 在 require 时就把 process.env.DB_NAME 读进单例。
// 如果测试文件在 createApiContext() 之前 require 了任何业务模块（中间件、service…），
// 单例就会绑定**开发库**；随后 sync({force:true}) 会直接把老师的真实数据清空
// —— 2026-10-27 真实发生过：新增的 guest 测试在文件顶部 import 了 service，
//    models 先被加载到 math_system，全套测试把生产库反复 DROP/重建。
// 所以在模块加载时就把 DB_NAME 指向测试库，让后续任何 import 都落在测试库上。
// 没有 .env 时（CI、临时 clone）DB_NAME 为空，这里**不能抛错**：
// 抛在模块加载期，node --test 会直接把整个文件判为失败，连「没有数据库 → 整篇跳过」
// 的机会都没有——跳过判据在测试文件里，靠 createApiContext() 抛错来触发。
// 所以容错到空值，真正的判断留给 createApiContext()。
let DB_NAME = ''
try {
  DB_NAME = testDbName()
} catch {
  DB_NAME = ''
}
// 只有拿到测试库名才覆写 env：配置缺失时保持原样，
// 免得把「未配置」伪装成一个看起来能用的库名。
if (DB_NAME) process.env.DB_NAME = DB_NAME

async function createApiContext() {
  // 缺数据库配置是正常情形（CI 没有 MySQL），用一句说明原因的错误让调用方跳过
  if (!DB_NAME) throw new Error('未配置数据库（缺少 DB_NAME），跳过接口测试')
  const dbName = DB_NAME

  let conn
  try {
    conn = await mysql.createConnection(baseConn())
  } catch (e) {
    throw new Error(`MySQL 不可用，跳过接口测试：${e.message}`)
  }
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  )
  await conn.end()

  // 名字必须是测试库；真实库在这里出现一次都不能放行（下面的 sync force 会清库）
  if (!dbName.startsWith(GUARD_PREFIX) || dbName === REAL_DB) {
    throw new Error(`拒绝运行：${dbName} 不是测试库（开发库为 ${REAL_DB}）`)
  }
  process.env.NODE_ENV = 'test'

  const { sequelize } = require('../../src/models')
  // 最后一道闸：确认模型单例真的连在测试库上。
  // 一旦这里是开发库，说明业务模块在 createApiContext() 之前被 require 过——
  // 必须直接失败，绝不能继续执行 sync({force:true})。
  const connectedDb = String(sequelize.config?.database || '')
  if (connectedDb !== dbName) {
    throw new Error(
      `拒绝运行：模型连接指向 ${connectedDb || '(空)'}，不是测试库 ${dbName}。` +
        '这通常是因为在 createApiContext() 之前 require 了业务模块（sequelize 单例已绑定开发库）。'
    )
  }
  // force:true 每次从模型重建表，测试之间不残留上次的数据
  await sequelize.sync({ force: true })
  // 索引与额外列不来自模型，必须补跑迁移：
  // 001 建唯一索引（成绩 upsert 依赖）、010 建试卷表索引、011 补 choice_mode、
  // 013 建一级知识点标记表。
  // 这里同时顺带验证「迁移在全新库上能跑通」——生产环境正是这个顺序（先 sync 再 migrations）。
  const { ensureIndexes } = require('../../src/utils/ensureIndexes')
  await ensureIndexes(sequelize)
  await require('../../migrations/010-add-paper-tables').up(null, sequelize)
  await require('../../migrations/011-add-question-choice-mode').up(null, sequelize)
  await require('../../migrations/013-add-knowledge-tag-marks').up(null, sequelize)
  await require('../../migrations/016-add-exam-types').up(null, sequelize)
  await require('../../migrations/017-resource-category-tree').up(null, sequelize)

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

  /** 关连接 → 删库。删库放在 finally：即使关连接报错，也尽量不留垃圾库 */
  const teardown = async () => {
    try {
      await new Promise((resolve) => server.close(resolve))
      await sequelize.close()
    } finally {
      // 二次确认：只删以 `<开发库>_test` 开头的库
      if (!dbName.startsWith(GUARD_PREFIX)) throw new Error('拒绝删除非测试库')
      const c = await mysql.createConnection(baseConn())
      try {
        await c.query(`DROP DATABASE IF EXISTS \`${dbName}\``)
      } finally {
        await c.end()
      }
    }
  }

  // 直接查库用于断言（例如等级记录是否成了孤儿），测试里不必绕 HTTP
  const models = require('../../src/models')

  return { request, requestBinary, upload, login, teardown, dbName, port, models }
}

module.exports = { createApiContext }
