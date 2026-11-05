// 服务入口
require('dotenv').config()
const app = require('./app')
const { sequelize } = require('./models')
const { runMigrations } = require('./utils/migrate')
const { ensureIndexes } = require('./utils/ensureIndexes')

const PORT = process.env.PORT || 7788

// 监听地址：默认只绑回环地址。
// 本版本没有任何鉴权，绑 0.0.0.0 等于把题库（含答案）连同写权限交给整个局域网。
// 需要局域网访问的人必须显式设置 HOST，并自行在反向代理上加一层认证。
const HOST = process.env.HOST || '127.0.0.1'
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1'])

// 数据库在远程主机时每条 SQL 都要一次网络往返（实测 ~43ms），
// 启动阶段必须尽量少发查询，否则启动要好几秒：
//   DB_SYNC            auto(默认)=缺表才建 | true=总是 sync | false=跳过
//   DB_ENSURE_INDEXES  true 才在启动时补建索引（默认关闭；索引统一由迁移 001 管理）
const SYNC_MODE = String(process.env.DB_SYNC || 'auto').toLowerCase()
const ENSURE_INDEXES = String(process.env.DB_ENSURE_INDEXES || '').toLowerCase() === 'true'

// sequelize.sync() 会逐张表发查询检查（10 张表 ≈ 1.2s）。
// 这里先用一次 SHOW TABLES 与模型比对：表齐全就直接跳过，缺表才真正建表。
async function ensureSchema() {
  if (SYNC_MODE === 'false') return
  if (SYNC_MODE === 'true') return sequelize.sync()

  const [rows] = await sequelize.query('SHOW TABLES')
  const existing = new Set(rows.map((r) => String(Object.values(r)[0])))
  const missing = Object.values(sequelize.models).filter(
    (m) => !existing.has(String(m.getTableName()))
  )
  if (!missing.length) return

  console.log(`ℹ️  检测到缺失的表，正在创建: ${missing.map((m) => m.getTableName()).join(', ')}`)
  await sequelize.sync()
}

const startedAt = Date.now()

sequelize
  .authenticate()
  .then(() => ensureSchema())
  .then(() => runMigrations(sequelize))
  // 索引由迁移 001 负责创建；启动时默认不再重复尝试，
  // 否则每次启动都要发 20+ 条必然失败的 CREATE INDEX（含重试，可占 5s 以上）
  .then(() => (ENSURE_INDEXES ? ensureIndexes(sequelize) : undefined))
  .then(() => {
    const server = app.listen(PORT, HOST, () => {
      console.log(`✅ 服务已启动: http://${HOST}:${PORT}（耗时 ${Date.now() - startedAt} ms）`)
      if (!LOOPBACK.has(HOST)) {
        console.warn('')
        console.warn(`⚠️  已监听 ${HOST}，本机之外也能访问。`)
        console.warn('   本版本没有任何登录鉴权，任何能连到该端口的人都能读写你的题库。')
        console.warn('   如果只是自己用，把 HOST 改回 127.0.0.1；')
        console.warn('   确需局域网/公网访问，请在前面加一层反向代理并自行配置访问控制。')
        console.warn('')
      }
    })

    // 端口绑定失败要给可读的说明。这个项目已经因为「端口落进 Windows 保留段」
    // 换过一次端口（3000 → 4300，见 700afa9）；裸抛 Node 的 EACCES 堆栈时，
    // 用户只看得到「项目启动失败」，完全不知道该改哪里。
    server.on('error', (err) => {
      if (err.code === 'EACCES') {
        console.error(`❌ 端口 ${PORT} 被 Windows 保留，无法绑定（EACCES）`)
        console.error('   这不是被别的程序占用：Hyper-V / WSL / Docker 的 NAT 驱动')
        console.error('   会成段动态保留端口，落在保留段里的端口谁都无法监听。')
        console.error('')
        console.error('   查看当前保留段：')
        console.error('     netsh interface ipv4 show excludedportrange protocol=tcp')
        console.error('   再换一个不在保留段里的端口，只改 server/.env 的 PORT。')
        console.error('   启动脚本、vite 代理都从那里读，不必改别处。')
      } else if (err.code === 'EADDRINUSE') {
        console.error(`❌ 端口 ${PORT} 已被占用（EADDRINUSE）`)
        console.error('   可能已经有一个实例在跑。先用「stop.bat」停掉，或换个端口。')
      } else {
        console.error(`❌ 服务启动失败（${err.code || err.message}）`)
      }
      process.exit(1)
    })
  })
  .catch((err) => {
    console.error('❌ 数据库连接失败:', err.message)
    process.exit(1)
  })
