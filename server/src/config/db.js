// Sequelize 连接配置：SQLite，单文件、零外部服务。
//
// 为什么是 SQLite 而不是 MySQL：这个项目的使用者是数学老师，不是运维。
// 要求他安装 MySQL 服务端、建库、填五个连接参数，是一道没人愿意走完的门槛；
// 而一个班到一所学校的题量（万级行）SQLite 完全够用，且天然免备份——
// 整个数据库就是一个文件，复制走即可。
//
// 库文件默认落在 server/data/shuli.sqlite（已在 .gitignore 中忽略）。
// 需要换位置时设置 DB_FILE：可以是绝对路径，也可以是相对 server/ 的路径；
// 传 `:memory:` 走内存库（测试用）。
require('./env')

const fs = require('fs')
const path = require('path')
const { Sequelize } = require('sequelize')

// 与 storage/local.js 保持同一基准：相对路径一律相对 server/ 解析，
// 而不是进程 CWD——否则从不同目录启动会连到两个不同的库，数据「时有时无」。
const SERVER_ROOT = path.resolve(__dirname, '../..')
const DEFAULT_DB_FILE = path.join(SERVER_ROOT, 'data', 'shuli.sqlite')

const configured = String(process.env.DB_FILE || '').trim()
const storage =
  configured === ':memory:' ? ':memory:' : path.resolve(SERVER_ROOT, configured || DEFAULT_DB_FILE)

// 首次运行时 data/ 还不存在，先建目录，否则 sqlite 打开会报 SQLITE_CANTOPEN。
if (storage !== ':memory:') {
  fs.mkdirSync(path.dirname(storage), { recursive: true })
}

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage,
  logging: false,
  define: {
    underscored: true, // 字段 camelCase -> 列 snake_case
    freezeTableName: true
  },
  // SQLite 的写锁是库级独占：并发写会短暂返回 SQLITE_BUSY。
  // 默认驱动直接抛错，重试几次即可让请求排队通过，用户无感。
  retry: {
    max: 5,
    match: [/SQLITE_BUSY/, /SQLITE_LOCKED/]
  }
})

// WAL：读写不互相阻塞。默认的 rollback journal 下，一次写事务会挡住所有读，
// 表现为「一边保存题目，另一边列表就转圈」。WAL 下读不等待写，适合这种单进程多请求的场景。
// busy_timeout 让写锁冲突时等待而不是立刻报错（与上面的 retry 是两层保险）。
//
// 注意这里**故意不开启** PRAGMA foreign_keys：
// 控制器里已经按「外键可能不生效」写了显式的关联清理（删学生时先删关联行等），
// 开启后约束会从「事后清理」变成「当场抛错」，等于换了一套失败模式却没人验证过。
// 要开的话，先把所有删除路径的测试跑通再改。
async function applySqlitePragmas() {
  if (storage === ':memory:') return
  try {
    await sequelize.query('PRAGMA journal_mode = WAL')
    await sequelize.query('PRAGMA synchronous = NORMAL')
    await sequelize.query('PRAGMA busy_timeout = 5000')
  } catch (e) {
    // 只是性能与并发体验的优化，失败不应挡住启动
    console.warn('⚠️  SQLite PRAGMA 设置失败（不影响功能）:', e.message)
  }
}

module.exports = sequelize
module.exports.storagePath = storage
module.exports.applySqlitePragmas = applySqlitePragmas
