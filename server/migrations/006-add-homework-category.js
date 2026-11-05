// 作业分类：新建 homework_categories 表，并给 homework 增加 category_id。
//
// 几点必须注意（都是本项目已经踩过的坑）：
// 1. db.js 全局配置了 freezeTableName，Homework 模型未声明 tableName，
//    因此物理表名是模型名单数形式 `homework`（不是 homeworks）。
// 2. db.js 配置了 underscored: true，所以模型的 categoryId 对应列 category_id，
//    时间戳对应 created_at / updated_at。
// 3. 新表通常会被启动时的 ensureSchema() 自动建出来（它检测缺表后调用 sync）。
//    这里仍然写一份 CREATE TABLE IF NOT EXISTS 作为兜底：
//    当 DB_SYNC=false 时 sync 不会执行，迁移必须能独立建表。
//    正常路径下它是一次 no-op，不会与 sync 的结果冲突。
// 4. sequelize.sync() 不会给「已存在的表」补列，所以 category_id 必须由本迁移添加。
//
// 迁移运行器（src/utils/migrate.js）会在每次启动时按文件名顺序执行未执行过的迁移。
module.exports = {
  async up(queryInterface, sequelize) {
    // ── 1. 分类表（兜底创建，字段与模型保持一致） ─────────────────────────
    await sequelize.query(
      `CREATE TABLE IF NOT EXISTS \`homework_categories\` (
         \`id\` INTEGER NOT NULL AUTO_INCREMENT,
         \`name\` VARCHAR(50) NOT NULL COMMENT '分类名（周测/月考/课后作业…）',
         \`sort\` INTEGER DEFAULT 0 COMMENT '展示排序',
         \`remark\` VARCHAR(255) COMMENT '备注',
         \`created_at\` DATETIME NOT NULL,
         \`updated_at\` DATETIME NOT NULL,
         PRIMARY KEY (\`id\`)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='作业分类'`
    )

    // ── 2. homework.category_id ───────────────────────────────────────────
    const [cols] = await sequelize.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'homework'
         AND COLUMN_NAME = 'category_id'`
    )
    const hasColumn = (cols || []).length > 0
    if (!hasColumn) {
      await sequelize.query(
        `ALTER TABLE \`homework\`
         ADD COLUMN \`category_id\` INTEGER NULL COMMENT '所属作业分类 id，NULL 表示未分类'`
      )
    }

    // ── 3. 索引 ───────────────────────────────────────────────────────────
    const [idx] = await sequelize.query(
      `SELECT INDEX_NAME FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'homework'
         AND COLUMN_NAME = 'category_id'`
    )
    if (!(idx || []).length) {
      await sequelize.query(
        'ALTER TABLE `homework` ADD INDEX `idx_homework_category` (`category_id`)'
      )
    }

    // ── 4. 外键：删分类时把作业置为未分类，绝不连带删除作业 ────────────────
    const [fks] = await sequelize.query(
      `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'homework'
         AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME = 'fk_homework_category'`
    )
    if (!(fks || []).length) {
      await sequelize.query(
        `ALTER TABLE \`homework\`
         ADD CONSTRAINT \`fk_homework_category\`
         FOREIGN KEY (\`category_id\`) REFERENCES \`homework_categories\` (\`id\`)
         ON DELETE SET NULL ON UPDATE CASCADE`
      )
    }
  },

  async down() {
    // 不自动回滚：删列会丢掉全部分类归属，删表会丢掉分类名。
    // 如需回滚请手工执行：
    //   ALTER TABLE `homework` DROP FOREIGN KEY `fk_homework_category`;
    //   ALTER TABLE `homework` DROP INDEX `idx_homework_category`;
    //   ALTER TABLE `homework` DROP COLUMN `category_id`;
    //   DROP TABLE `homework_categories`;
  }
}
