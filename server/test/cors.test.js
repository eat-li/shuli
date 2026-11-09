// CORS 来源判定回归测试。
//
// 单独开一个文件的原因：selfOrigins / corsOrigins 在 app.js 模块加载时就算好了，
// 而通用测试底座把 NODE_ENV 设成 test（此时默认放行 *）。只有先设好环境变量再 require，
// 才能跑到「生产模式下只认配置出来的来源」这条分支。
//
// 盯的是 DNS rebinding：外部域名把 TTL 改短后解析到 127.0.0.1，
// 恶意页面的 Origin 就变成 http://evil.com:7788，Host 头同理。
// 以前 selfOrigin 用 req.get('host') 拼，两边相等 → CORS 白名单当场失效，
// 同一个浏览器里就能读走整个题库（含答案）。现在只认 .env 里的 HOST/PORT。
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

// 以下四项必须在 require('../src/app') 之前设置
const DB_FILE = path.join(os.tmpdir(), `shuli-test-cors-${process.pid}.sqlite`)
process.env.DB_FILE = DB_FILE
process.env.NODE_ENV = 'production'
process.env.HOST = '127.0.0.1'
process.env.PORT = '7788'

const app = require('../src/app')

let server = null
let port = 0

test.before(async () => {
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  port = server.address().port
})

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve))
  // 只删本文件自己建的临时库，路径不合约定就宁可不删
  if (fs.existsSync(DB_FILE) && path.basename(DB_FILE).startsWith('shuli-test-cors-')) {
    fs.rmSync(DB_FILE, { force: true })
  }
})

/** /api/health 不碰数据库，只用来观察 CORS 放行还是拦截 */
const hit = async ({ origin, host }) => {
  const headers = {}
  if (origin) headers.Origin = origin
  if (host) headers.Host = host
  const res = await fetch(`http://127.0.0.1:${port}/api/health`, { headers })
  return { status: res.status, allowOrigin: res.headers.get('access-control-allow-origin') }
}

test('Host 头伪造的「同源」不再被放行（DNS rebinding）', async () => {
  const r = await hit({ origin: 'http://evil.com:7788', host: 'evil.com:7788' })
  assert.equal(r.status, 403, `外部来源必须拦下，实际 ${r.status}`)
  assert.equal(r.allowOrigin, null, '被拒时不应回写 Access-Control-Allow-Origin')
})

test('按配置算出的本机来源照常放行', async () => {
  // 打包模式下后端托管 client/dist，<script type=module> 带同源 Origin；
  // localhost / 127.0.0.1 / [::1] 三种写法都得放行，否则白屏。
  for (const origin of ['http://localhost:7788', 'http://127.0.0.1:7788', 'http://[::1]:7788']) {
    const r = await hit({ origin, host: `127.0.0.1:${port}` })
    assert.equal(r.status, 200, `${origin} 应放行，实际 ${r.status}`)
    assert.equal(r.allowOrigin, origin)
  }
})

test('按本机网卡地址访问的来源照常放行（局域网用法）', async (t) => {
  // HOST=0.0.0.0 + 同事用 http://192.168.x.x:7788 访问是文档里写明的用法，
  // 收紧 CORS 时不能把它一起拦掉。
  const lanIp = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address)[0]
  if (!lanIp) return t.skip('本机没有非回环 IPv4，跳过')
  const r = await hit({ origin: `http://${lanIp}:7788`, host: `127.0.0.1:${port}` })
  assert.equal(r.status, 200, `本机网卡地址 ${lanIp} 应放行，实际 ${r.status}`)
  assert.equal(r.allowOrigin, `http://${lanIp}:7788`)
})

test('非浏览器请求（无 Origin）不受 CORS 约束', async () => {
  const r = await hit({})
  assert.equal(r.status, 200)
})

test('CORS_ORIGINS 里显式声明的来源照常放行', async () => {
  // 生产默认白名单是开发服务器 5173
  const r = await hit({ origin: 'http://localhost:5173', host: `127.0.0.1:${port}` })
  assert.equal(r.status, 200)
  assert.equal(r.allowOrigin, 'http://localhost:5173')
})
