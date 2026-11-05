// 给 handout 补 content 列：讲义从「引用数组」改为「富文本文档」后，
// 正文存在 content 里（长文本，可含题目、图片、表格、公式）。
//
// 幂等：列已存在时直接跳过。旧数据不动——items 保留，
// 前端打开旧讲义时再把 items 惰性展开成 content。
module.exports = {
  async up(queryInterface, sequelize) {
    const [cols] = await sequelize.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'handout' AND COLUMN_NAME = 'content'`
    )
    if ((cols || []).length) return

    await sequelize.query(
      `ALTER TABLE handout ADD COLUMN content LONGTEXT NULL COMMENT '讲义正文（富文本 HTML）'`
    )
  },

  async down() {
    // 不自动删列：里面是老师写好的讲义正文，回滚请手工执行
    // ALTER TABLE handout DROP COLUMN content;
  }
}
