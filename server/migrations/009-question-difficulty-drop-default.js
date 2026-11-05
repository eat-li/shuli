// 去掉 question.difficulty 的 DB 默认值 3。
//
// 背景：008 迁移的意图就是这件事（NULL = 未标注，不再继承「默认中等」），
// 但它把表名写成了复数 `questions`，而物理表是单数 `question`（freezeTableName），
// 于是那次迁移在真实库上静默成了 no-op —— migrations 表记着已执行，列却还是 DEFAULT 3。
// 实测：COLUMN_DEFAULT 仍是 3，导致任何「省略该列」的写入都会变成 3 星。
//
// 本迁移是幂等的：已经是 NULL 就直接返回。
module.exports = {
  async up(queryInterface, sequelize) {
    const [cols] = await sequelize.query(
      `SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'question'
         AND COLUMN_NAME = 'difficulty'`
    )
    const col = (cols || [])[0]
    if (!col) return // 表或列还不存在：交给 sync() 按模型定义建

    // 已经是「无默认值」就跳过（COLUMN_DEFAULT 为 null 表示没有默认值）
    if (col.COLUMN_DEFAULT === null) return

    await sequelize.query(
      `ALTER TABLE \`question\`
       MODIFY COLUMN \`difficulty\` INT NULL DEFAULT NULL COMMENT '难度 1-5；NULL=未标注'`
    )
  },

  async down() {
    // 不自动恢复默认值 3：那会把「未标注」重新变成「中等」，属于语义倒退。
    //   ALTER TABLE `question` MODIFY COLUMN `difficulty` INT NOT NULL DEFAULT 3;
  }
}
