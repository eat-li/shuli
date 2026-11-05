// Express 应用装配
// 配置必须在最前面加载：下面 isProd / CORS 白名单都在模块初始化时读取环境变量，
// 晚一步就会拿到 undefined，表现为「生产模式下仍然全放行」。
require('./config/env')

const express = require('express')
const cors = require('cors')
const compression = require('compression')
const fs = require('fs')
const path = require('path')
const routes = require('./routes')
const errorHandler = require('./middlewares/errorHandler')

const isProd = process.env.NODE_ENV === 'production'
const defaultCorsOrigins = isProd ? 'http://localhost:5173' : '*'
const corsOrigins = (process.env.CORS_ORIGINS || defaultCorsOrigins)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const app = express()

// CORS：生产环境默认只允许本机前端，可通过 CORS_ORIGINS 配置多个来源。
//
// 关键：必须放行「请求自身的来源」。打包模式（后端托管 client/dist）下浏览器加载
// <script type="module"> 会带上 Origin 头，属于同源请求却仍走 CORS 校验；
// 若白名单里只有 5173（开发服务器），后端就会把自己托管的 JS/CSS 全部 403 掉，
// 表现为页面白屏、控制台一堆 "Failed to load resource: 403"。
app.use((req, res, next) => {
  const selfOrigin = `${req.protocol}://${req.get('host')}`
  cors({
    // CORS 来源判定。必须放行「请求自身的来源」：打包模式下 <script type=module> 也带 Origin，
    // 属于同源请求却仍走 CORS 校验；白名单只有 5173 时，后端会把自己托管的 JS/CSS 全部 403 掉（白屏）。
    origin(origin, callback) {
      if (
        !origin ||
        origin === selfOrigin ||
        corsOrigins.includes('*') ||
        corsOrigins.includes(origin)
      ) {
        return callback(null, true)
      }
      const error = new Error('CORS origin not allowed')
      error.status = 403
      return callback(error)
    }
  })(req, res, next)
})

// 基础安全响应头
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-XSS-Protection', '0')
  next()
})

// 响应压缩：compression 1.8 原生支持 Brotli，客户端支持 br 时优先 br，否则 gzip。
// 只压 1KB 以上；SSE 必须排除——压缩会缓冲事件流，AI 的逐字输出会变成一次性出现。
app.use(
  compression({
    threshold: 1024,
    // 压缩过滤器。SSE 必须排除——压缩会缓冲事件流，AI 的逐字输出会变成最后一次性出现。
    filter(req, res) {
      const type = String(res.getHeader('Content-Type') || '')
      if (type.includes('text/event-stream')) return false
      if (req.headers['x-no-compression']) return false
      return compression.filter(req, res)
    }
  })
)

// 简单请求日志
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`)
  })
  next()
})

// 简单内存限流：生产环境默认开启，也可用 RATE_LIMIT_ENABLED=true 手动开启
const rateLimitEnabled = isProd || process.env.RATE_LIMIT_ENABLED === 'true'
const RATE_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000
const RATE_MAX = Number(process.env.RATE_LIMIT_MAX) || 300
if (rateLimitEnabled) {
  const rateMap = new Map()
  setInterval(() => {
    for (const [key, value] of rateMap) {
      if (Date.now() > value.resetAt) rateMap.delete(key)
    }
  }, RATE_WINDOW_MS).unref()

  app.use((req, res, next) => {
    // 只对 API 限流。静态资源（index.html / JS chunk / CSS / 字体）不计入：
    // 它们由本服务直接吐出、几乎不碰数据库，而一次页面加载就要拉十来个文件，
    // 若一起计数，正常刷新几个页面就可能把某个 JS chunk 也 429 掉——
    // 表现是页面白屏且控制台只有一条「Failed to load resource」。
    if (!req.path.startsWith('/api/')) return next()

    const ip = req.ip || req.socket.remoteAddress || 'unknown'
    const now = Date.now()
    const hit = rateMap.get(ip) || { count: 0, resetAt: now + RATE_WINDOW_MS }
    if (now > hit.resetAt) {
      hit.count = 0
      hit.resetAt = now + RATE_WINDOW_MS
    }
    hit.count++
    rateMap.set(ip, hit)
    if (hit.count > RATE_MAX) {
      return res.status(429).json({
        code: 42900,
        message: '请求过于频繁，请稍后再试',
        data: null
      })
    }
    next()
  })
}

// 题干为富文本 HTML，图片走 OSS 不再 base64，保持较小限制即可
app.use(express.json({ limit: '2mb' }))

// 健康检查
app.get('/api/health', (req, res) => res.json({ code: 0, message: 'ok', data: { status: 'up' } }))

// 本地存储驱动：把上传目录挂成静态资源。
// key 里带 UUID（永不覆盖），可以放心长缓存；index:false 防止目录被列出来。
const storage = require('./storage')
if (storage.driver === 'local' && storage.staticDir) {
  fs.mkdirSync(storage.staticDir, { recursive: true })
  app.use(
    storage.staticPrefix,
    express.static(storage.staticDir, {
      index: false,
      maxAge: '1y',
      immutable: true,
      dotfiles: 'deny'
    })
  )
  console.log('🖼️  图片存储：本地磁盘', storage.staticDir)
} else {
  console.log('🖼️  图片存储：', storage.driver)
}

// 业务路由
app.use('/api', routes)

// —— 打包后的前端托管（生产/日常使用模式）——
// client/dist 存在时，后端同源托管前端：无需 Vite、无需跨域代理，只跑一个进程。
// 访问 http://localhost:<PORT>/ 即为完整应用；不存在 dist 时（纯后端开发）自动跳过。
const clientDist = path.join(__dirname, '../../client/dist')
if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  // 构建产物带内容 hash，可以放心长缓存；index.html 每次回源校验。
  // 分开挂载是为了只给 /assets 发 immutable，避免把 index.html 也缓存一年。
  app.use(
    '/assets',
    express.static(path.join(clientDist, 'assets'), {
      index: false,
      maxAge: '1y',
      immutable: true
    })
  )
  // 缺失的构建产物直接 404：不要落进 SPA 回退（会返回 HTML 200），
  // 也不要走全局错误处理（会把服务器绝对路径写进响应）。
  app.use('/assets', (req, res) => res.status(404).type('text/plain').send('Not found'))
  app.use(express.static(clientDist, { index: false, maxAge: 0 }))
  // SPA 路由回退：非 /api 的 GET 请求统一返回 index.html，
  // 保证刷新 /homeworks、/summaries 等前端路由不会 404
  app.get(/^\/(?!api\/).*/, (req, res, next) => {
    if (req.method !== 'GET') return next()
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(path.join(clientDist, 'index.html'))
  })
  console.log('📦 已托管前端静态文件:', clientDist)
}

app.use(errorHandler)

module.exports = app
