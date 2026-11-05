// 一级知识点的「标记」表：题库页把标记过的题库排到最前并高亮。
//
// 为什么不给 question 加一列：标记是「题库级」的浏览偏好，同一题库下所有题
// 共用一条记录；加在 question 上会变成几千行重复数据，改名时还要逐行更新。
// 也不放 settings 的单个 JSON：那是一个整块覆盖的 blob，两个人同时点标记会互相覆盖。
//
// id 只服务备份（导出/恢复按 id 遍历），业务唯一键是 tag。
//
// 幂等：启动时 ensureSchema() 会先 sync() 建缺失表，本迁移必须 IF NOT EXISTS。
const TABLE = 'knowledge_tag_marks'

async function tableExists(sequelize, table) {
  const [rows] = await sequelize.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    { replacements: [table] }
  )
  return rows.length > 0
}

module.exports = {
  async up(queryInterface, sequelize) {
    if (await tableExists(sequelize, TABLE)) return
    await sequelize.query(
      `CREATE TABLE IF NOT EXISTS \`${TABLE}\` (
        \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tag\` VARCHAR(100) NOT NULL COMMENT '一级知识点名称；空串表示未分类题库',
        \`created_at\` DATETIME NOT NULL,
        \`updated_at\` DATETIME NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_knowledge_tag_mark\` (\`tag\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='一级知识点标记（题库页置顶高亮）'`
    )
  },

  async down(queryInterface) {
    await queryInterface.dropTable(TABLE)
  }
}
