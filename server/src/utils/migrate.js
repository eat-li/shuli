// 轻量数据库迁移运行器：无需额外依赖，用 migrations 表记录已执行过的迁移文件。
// 迁移文件位于 server/migrations，按文件名排序执行。
const fs = require('fs')
const path = require('path')

const MIGRATIONS_DIR = path.join(__dirname, '../../migrations')

// 建迁移记录表（不存在才建），记录每个已执行的文件名。
async function ensureMigrationsTable(sequelize) {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      name VARCHAR(255) PRIMARY KEY,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
}

// 取已执行的迁移文件名集合，用于跳过。
async function getExecutedMigrations(sequelize) {
  const [rows] = await sequelize.query('SELECT name FROM migrations', { raw: true })
  return new Set((rows || []).map((r) => r.name))
}

// 按文件名顺序执行未跑过的迁移。
// 执行成功后才写记录：中途失败的文件下次启动会重跑，不会留下「半执行却记为完成」的状态。
async function runMigrations(sequelize) {
  await ensureMigrationsTable(sequelize)

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.js'))
    .sort()

  const executed = await getExecutedMigrations(sequelize)

  for (const file of files) {
    if (executed.has(file)) continue

    const migration = require(path.join(MIGRATIONS_DIR, file))
    await migration.up(null, sequelize)
    await sequelize.query('INSERT INTO migrations (name) VALUES (?)', {
      replacements: [file]
    })
    console.log(`✔ 已执行迁移 ${file}`)
  }
}

module.exports = { runMigrations, MIGRATIONS_DIR }
