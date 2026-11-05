// 服务入口
require('./config/env')

const path = require('path')
const app = require('./app')
const { sequelize } = require('./models')
const { applySqlitePragmas } = require('./config/db')
const { runMigrations } = require('./utils/migrate')
const { ensureIndexes } = require('./utils/ensureIndexes')
const { seedDefaults } = require('./utils/seed')
const { openBrowser } = require('./utils/openBrowser')

const PORT = Number(process.env.PORT) || 7788

// 监听地址：默认只绑回环地址。
// 本版本没有任何鉴权，绑 0.0.0.0 等于把题库（含答案）连同写权限交给整个局域网。
// 需要局域网访问的人必须显式设置 HOST，并自行在反向代理上加一层认证。
const HOST = process.env.HOST || '127.0.0.1'
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1'])

// 建表策略：只在**缺表**时按模型补建。
// sequelize.sync() 每次都会逐表发查询确认结构（20 张表约 1s+），启动没必要付这个成本；
// 先用 showAllTables() 一次性拿到现有表名再比对，齐全就直接跳过。
// 注意这里是方言无关的写法——以前用 `SHOW TABLES`，换成 SQLite 后该语句不存在。
async function ensureSchema() {
  const queryInterface = sequelize.getQueryInterface()
  const existing = new Set(
    (await queryInterface.showAllTables()).map((name) =>
      String(typeof name === 'object' && name !== null ? name.tableName : name)
    )
  )
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
  .then(() => applySqlitePragmas())
  .then(() => ensureSchema())
  .then(() => runMigrations(sequelize))
  .then(() => seedDefaults())
  // 索引不再是独立的迁移文件：清单集中在 utils/ensureIndexes，
  // 建之前先查 showIndex，已存在就跳过，因此每次启动跑一遍是幂等的。
  .then(() => ensureIndexes(sequelize))
  .then(() => {
    const server = app.listen(PORT, HOST, () => {
      const address = `http://${LOOPBACK.has(HOST) ? 'localhost' : HOST}:${PORT}`
      // 界面文案在这里输出而不是写在 start.bat 里：Node 走 WriteConsoleW，
      // 无论控制台代码页是 936 还是 65001 都能正确显示中文；
      // 而 .bat 一旦含非 ASCII 就会被按错误代码页解析，连换行都会被吞掉。
      console.log('')
      console.log('  数理 · 试题与试卷工作台')
      console.log(`  访问地址: ${address}`)
      console.log(`  数据目录: ${path.dirname(require('./config/db').storagePath)}`)
      console.log('  停止服务: 关闭本窗口，或双击 stop.bat')
      console.log(`  （启动耗时 ${Date.now() - startedAt} ms）`)
      console.log('')
      // listen 成功后再开浏览器，避免页面先于服务到达导致白屏。
      openBrowser(address)
      if (!LOOPBACK.has(HOST)) {
        console.warn('')
        console.warn(`⚠️  已监听 ${HOST}，本机之外也能访问。`)
        console.warn('   本版本没有任何登录鉴权，任何能连到该端口的人都能读写你的题库。')
        console.warn('   如果只是自己用，把 HOST 改回 127.0.0.1；')
        console.warn('   确需局域网/公网访问，请在前面加一层反向代理并自行配置访问控制。')
        console.warn('')
      }
    })

    // 端口绑定失败要给可读的说明。
    // 裸抛 Node 的 EACCES 堆栈时，用户只看得到「项目启动失败」，完全不知道该改哪里。
    server.on('error', (err) => {
      if (err.code === 'EACCES') {
        console.error(`❌ 端口 ${PORT} 被 Windows 保留，无法绑定（EACCES）`)
        console.error('   这不是被别的程序占用：Hyper-V / WSL / Docker 的 NAT 驱动')
        console.error('   会成段动态保留端口，落在保留段里的端口谁都无法监听。')
        console.error('')
        console.error('   查看当前保留段：')
        console.error('     netsh interface ipv4 show excludedportrange protocol=tcp')
        console.error('   再换一个不在保留段里的端口。改端口只需在 server/.env 写一行 PORT=xxxx，')
        console.error('   启动脚本会读取同一个文件，不必改别处。')
      } else if (err.code === 'EADDRINUSE') {
        console.error(`❌ 端口 ${PORT} 已被占用（EADDRINUSE）`)
        console.error('   可能已经有一个实例在跑。先双击「停止服务.bat」停掉，或换个端口。')
      } else {
        console.error(`❌ 服务启动失败（${err.code || err.message}）`)
      }
      process.exit(1)
    })
  })
  .catch((err) => {
    console.error('❌ 数据库初始化失败:', err.message)
    console.error('   库文件位置：', require('./config/db').storagePath)
    console.error('   常见原因：文件被占用（同时开了两个实例）、磁盘已满、目录无写权限。')
    process.exit(1)
  })
