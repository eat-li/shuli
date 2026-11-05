// 016：考试类型字典化。
//
// 原先 exam_scores.exam_type 是 ENUM('final','mid','quiz','popquiz')，
// 想加「月考 / 模拟考」只能改代码 + 改表。现在改成 VARCHAR key + exam_types 字典：
// key 不变（历史成绩不用迁移），名称可以随时改。
const PRESETS = [
  ['final', '期末', 10],
  ['mid', '期中', 20],
  ['monthly', '月考', 30],
  ['mock', '模拟考', 40],
  ['quiz', '小测', 50],
  ['popquiz', '随堂测验', 60]
]

module.exports = {
  async up(_queryInterface, sequelize) {
    // 1) 成绩类型列 ENUM -> VARCHAR。已有值原样保留。
    await sequelize.query(
      "ALTER TABLE `exam_scores` MODIFY COLUMN `exam_type` VARCHAR(32) NOT NULL COMMENT '考试类型 key（exam_types.key）'"
    )

    // 2) 字典表。启动时 sync 已按模型建过；这里兜底，保证迁移单独执行也能跑通。
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`exam_types\` (
        \`key\` VARCHAR(32) NOT NULL COMMENT '稳定类型标识',
        \`name\` VARCHAR(50) NOT NULL COMMENT '显示名称（可改）',
        \`sort\` INT NOT NULL DEFAULT 0 COMMENT '排序，小的在前',
        \`created_at\` DATETIME NOT NULL,
        \`updated_at\` DATETIME NOT NULL,
        PRIMARY KEY (\`key\`),
        UNIQUE KEY \`exam_types_name_unique\` (\`name\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)

    // 3) 预置类型。INSERT IGNORE：重复执行/老师已改名都不会覆盖。
    for (const [key, name, sort] of PRESETS) {
      await sequelize.query(
        'INSERT IGNORE INTO `exam_types` (`key`, `name`, `sort`, `created_at`, `updated_at`) VALUES (?, ?, ?, NOW(), NOW())',
        { replacements: [key, name, sort] }
      )
    }
  },

  async down() {
    // 类型字典与成绩数据强相关，不做自动回滚。
  }
}
