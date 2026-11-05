// 选择题细分「单选 / 多选」。
//
// 背景：题库原先只有 choice/fill/solve 三种题型，GLOSSARY 里写明「刻意不区分单选/多选，
// 因为不自动判卷」。但高考试卷里单选与多选是不同分区、不同分值、不同评分规则，
// 试卷排版必须能区分，因此增加 choice_mode 作为 choice 的子类型。
//
// 存量数据一律留空（NULL）而不是回填 single：
//   - 批量写 single 会把「下列说法正确的有」这类多选题误标成单选，污染数据；
//   - 读侧统一兜底 `choiceMode ?? 'single'`，旧题在试卷里自动落入「单项选择题」大题。
//
// 表名注意：物理表是单数 `question`（freezeTableName），不是 questions。
// 008 迁移就是写成复数而静默失效的，这里必须用单数。
module.exports = {
  async up(queryInterface, sequelize) {
    const [cols] = await sequelize.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'question'
         AND COLUMN_NAME = 'choice_mode'`
    )
    if (cols && cols.length) return // 已存在，幂等返回

    const [tables] = await sequelize.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'question'`
    )
    if (!tables || !tables.length) return // 表还不存在：交给 sequelize.sync() 按模型建表

    await sequelize.query(
      `ALTER TABLE \`question\`
       ADD COLUMN \`choice_mode\` ENUM('single','multiple') NULL DEFAULT NULL
       COMMENT '选择题子类型：single 单选 / multiple 多选；NULL=未区分（按单选处理）'
       AFTER \`type\``
    )
  },

  async down() {
    // 不自动删列（会丢标注数据）；如需回滚请手工执行：
    //   ALTER TABLE `question` DROP COLUMN `choice_mode`;
  }
}
