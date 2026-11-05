// 给 lesson_summaries.homework_id 补上外键（ON DELETE CASCADE）。
// 背景：该表由 sequelize.sync() 在关联定义之前创建，因此没有外键约束，
// 删除作业会留下 homework_id 指向已删作业的孤儿记录（编辑器里打不开）。
// 迁移是幂等的：已存在外键时直接跳过。
module.exports = {
  async up(queryInterface, sequelize) {
    const [rows] = await sequelize.query(
      `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'lesson_summaries'
         AND COLUMN_NAME = 'homework_id'
         AND REFERENCED_TABLE_NAME = 'homework'`
    )
    if ((rows || []).length) return

    // 清理历史孤儿行（其 homework_id 已无对应作业，属无效数据）
    await sequelize.query(
      `DELETE FROM lesson_summaries WHERE homework_id NOT IN (SELECT id FROM homework)`
    )

    await sequelize.query(
      `ALTER TABLE lesson_summaries
       ADD CONSTRAINT fk_lesson_summary_homework
       FOREIGN KEY (homework_id) REFERENCES homework(id) ON DELETE CASCADE`
    )
  },

  async down() {
    // 不自动删除外键，避免影响数据完整性；如需回滚请手工 DROP FOREIGN KEY
  }
}
