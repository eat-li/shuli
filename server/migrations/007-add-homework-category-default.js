// 作业分类：增加 is_default（默认分类）。
//
// 为什么把「默认」放在分类表而不是 settings 键值表：
// 删除分类时这一行整行消失，默认随之自动消失，不可能留下指向不存在分类的悬空配置；
// 若存成 settings 里的一个 id，就必须在删除分类的逻辑里额外记得清理它。
//
// 注意 db.js 配置了 underscored: true，因此模型的 isDefault 对应列 is_default。
module.exports = {
  async up(queryInterface, sequelize) {
    const [cols] = await sequelize.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'homework_categories'
         AND COLUMN_NAME = 'is_default'`
    )
    if (!(cols || []).length) {
      await sequelize.query(
        `ALTER TABLE \`homework_categories\`
         ADD COLUMN \`is_default\` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否为默认分类'`
      )
    }

    // 归一化历史数据：若因任何原因出现多个默认，只保留排序最靠前的那个，
    // 保证「至多一个默认」这个不变量从迁移之后一直成立。
    const [defaults] = await sequelize.query(
      `SELECT id FROM \`homework_categories\` WHERE is_default = 1
       ORDER BY sort ASC, id ASC`
    )
    if ((defaults || []).length > 1) {
      const keep = defaults[0].id
      await sequelize.query(
        `UPDATE \`homework_categories\` SET is_default = 0 WHERE is_default = 1 AND id <> ?`,
        { replacements: [keep] }
      )
    }
  },

  async down() {
    // 不自动删列；如需回滚请手工执行：
    //   ALTER TABLE `homework_categories` DROP COLUMN `is_default`;
  }
}
