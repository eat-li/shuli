// 题目难度：默认值由 3 改为「未标注（NULL）」。
//
// 背景：原先 difficulty 列 DEFAULT 3，而录入表单又把 3 写死成初始值，
// 于是每道题都被"默认中等难度"——老师从没判断过，数据里却记着一个判断结果。
// 统计与筛选用到这个字段时，会把这些并非人为给定的 3 当成真实难度。
//
// 新语义（见 GLOSSARY.md）：NULL = 尚未标注，1–5 = 人为给定。
// 已有题目的 3 保持不动：那是历史数据，无法区分"确实评了 3"与"没评过"，
// 擅自清零等于抹掉可能真实存在的判断。新题不再继承默认值。
//
// 注意 db.js 配置了 underscored: true，模型字段 difficulty 对应列名同名。
// ⚠️ 表名必须是单数 `question`（freezeTableName）。本文件早期写成 `questions`，
// 导致迁移静默 no-op；009 对已执行过的库做了补救，这里修正以保证全新库一次到位。
module.exports = {
  async up(queryInterface, sequelize) {
    const [cols] = await sequelize.query(
      `SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'question'
         AND COLUMN_NAME = 'difficulty'`
    )
    const col = (cols || [])[0]
    if (!col) return // 表或列还不存在：交给 sequelize.sync() 建表时按模型定义生成

    // 只做两件事：允许 NULL（表单要能提交"未标注"）+ 去掉 DB 默认 3。
    // 保持列类型不变，不写 MODIFY 的完整类型定义，避免与建表时的类型漂移。
    await sequelize.query(
      `ALTER TABLE \`question\`
       MODIFY COLUMN \`difficulty\` INT NULL DEFAULT NULL COMMENT '难度 1-5；NULL=未标注'`
    )
  },

  async down() {
    // 回滚到旧的默认值；已写成 NULL 的行无法还原成 3（也无从判断该不该还原），保持原样。
    //   ALTER TABLE `questions` MODIFY COLUMN `difficulty` INT NULL DEFAULT 3;
  }
}
