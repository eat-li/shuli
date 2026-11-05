// 题目增加二级知识点字段 knowledge_sub_tag：
// 在一级知识点（knowledge_tag）之下再细分二级知识点，两个字段都是自由字符串，
// 由前端「选择或输入」方式维护（与一级知识点一致），保持轻量、无需新建分类表。
//
// 注意：Question 模型未声明 tableName，且 db.js 全局配置了 freezeTableName，
// 因此物理表名是模型名单数形式 `question`（不是 questions）。
module.exports = {
  async up(queryInterface, sequelize) {
    const [columns] = await sequelize.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'question'
         AND COLUMN_NAME = 'knowledge_sub_tag'`
    )
    if (!(columns || []).length) {
      await sequelize.query(
        `ALTER TABLE \`question\`
         ADD COLUMN knowledge_sub_tag VARCHAR(100) NULL COMMENT '二级知识点标签'`
      )
    }
  },

  async down() {
    // 不自动删除列，避免误删数据；如需回滚请手工 DROP COLUMN
  }
}
