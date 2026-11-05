// 017：资料目录支持多级。
//
// 原表是平铺分类，name 上有全局唯一索引；加 parent_id 后改为「同一上级目录内
// 不重名」。唯一性改由控制器判断 —— MySQL 唯一索引把 NULL 视为互不相同，
// 顶层目录（parent_id IS NULL）的重名拦不住。
//
// 幂等：迁移可能在「模型 sync 已建表」之后执行，列/索引是否存在都要先查。
const TABLE = 'resource_categories'

async function columnExists(sequelize, table, column) {
  const [rows] = await sequelize.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    { replacements: [table, column] }
  )
  return rows.length > 0
}

async function indexNames(sequelize, table) {
  const [rows] = await sequelize.query(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    { replacements: [table] }
  )
  return new Set(rows.map((r) => String(Object.values(r)[0])))
}

// 找出「只含 name 一列的唯一索引」并删掉（索引名随环境不同：name / uk_xxx）
async function dropNameUniqueIndex(sequelize) {
  const [rows] = await sequelize.query(
    `SELECT INDEX_NAME, COUNT(*) AS cols FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND NON_UNIQUE = 0
     GROUP BY INDEX_NAME HAVING cols = 1`,
    { replacements: [TABLE] }
  )
  for (const row of rows) {
    const name = Object.values(row)[0]
    const [colRows] = await sequelize.query(
      `SELECT COLUMN_NAME FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
      { replacements: [TABLE, name] }
    )
    const cols = colRows.map((r) => String(Object.values(r)[0]))
    if (cols.length === 1 && cols[0] === 'name') {
      await sequelize.query(`ALTER TABLE \`${TABLE}\` DROP INDEX \`${name}\``)
    }
  }
}

module.exports = {
  async up(_queryInterface, sequelize) {
    if (!(await columnExists(sequelize, TABLE, 'parent_id'))) {
      await sequelize.query(
        `ALTER TABLE \`${TABLE}\` ADD COLUMN \`parent_id\` INT NULL COMMENT '上级目录 id；null 表示顶层' AFTER \`name\``
      )
    }
    await dropNameUniqueIndex(sequelize)
    if (!(await indexNames(sequelize, TABLE)).has('idx_resource_category_parent')) {
      await sequelize.query(
        `CREATE INDEX \`idx_resource_category_parent\` ON \`${TABLE}\` (\`parent_id\`)`
      )
    }
  },

  async down() {
    // 目录层级属于业务数据，不做自动回滚。
  }
}
