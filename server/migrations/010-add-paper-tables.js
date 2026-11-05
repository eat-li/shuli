// 试卷与试卷-题目关联表。
//
// 为什么分值存在关联表而不是题库：同一道题在「单元测」与「模拟考」里分值不同，
// 分值属于「这份卷子怎么用这道题」，不是题目的固有属性（题库里也从来没有这个字段）。
//
// 为什么 section 也存快照：组卷时按「单选/多选/填空/解答」分区，之后老师若改了
// 题目类型，卷面结构不该跟着变——已经打印发下去的卷子不能因为改了一条题目记录
// 就变成另一种分区。section 因此是冻结值，读取时不做二次推断。
//
// 幂等：启动时 ensureSchema() 会先 sync() 建缺失表，本迁移必须 IF NOT EXISTS，
// 否则会像 008 那样在真实库上变成 no-op（008 把表名写成复数 questions 就是这么失效的）。
const PAPER_TABLE = 'paper'
const LINK_TABLE = 'paper_questions'

async function tableExists(sequelize, table) {
  const [rows] = await sequelize.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    { replacements: [table] }
  )
  return rows.length > 0
}

async function indexExists(sequelize, table, index) {
  const [rows] = await sequelize.query(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    { replacements: [table, index] }
  )
  return rows.length > 0
}

module.exports = {
  async up(queryInterface, sequelize) {
    if (!(await tableExists(sequelize, PAPER_TABLE))) {
      await sequelize.query(
        `CREATE TABLE IF NOT EXISTS \`${PAPER_TABLE}\` (
          \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
          \`title\` VARCHAR(200) NOT NULL COMMENT '试卷主标题',
          \`subtitle\` VARCHAR(200) NULL DEFAULT NULL COMMENT '副标题（考试范围）',
          \`stage\` VARCHAR(20) NOT NULL DEFAULT 'senior3' COMMENT '学段 senior1/2/3 junior1/2/3',
          \`paper_type\` VARCHAR(20) NOT NULL DEFAULT 'mock' COMMENT '考试类型 monthly/midterm/final/mock/gaokao',
          \`duration\` INT NOT NULL DEFAULT 120 COMMENT '考试时长（分钟）',
          \`total_score\` INT NOT NULL DEFAULT 150 COMMENT '满分（与各题分值求和对账）',
          \`source\` VARCHAR(16) NOT NULL DEFAULT 'manual' COMMENT '来源 manual/ai',
          \`layout\` JSON NULL COMMENT '排版快照 {fontSize,gapRatio,optionColumns,showScoreTag}',
          \`notices\` TEXT NULL COMMENT '考生须知，NULL 用内置四条',
          \`ai_meta\` JSON NULL COMMENT 'AI 组卷元信息 {model,candidateCount,warnings,elapsedMs}',
          \`created_at\` DATETIME NOT NULL,
          \`updated_at\` DATETIME NOT NULL,
          PRIMARY KEY (\`id\`),
          KEY \`idx_paper_stage\` (\`stage\`, \`created_at\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='试卷'`
      )
    } else if (!(await indexExists(sequelize, PAPER_TABLE, 'idx_paper_stage'))) {
      await sequelize.query('CREATE INDEX `idx_paper_stage` ON `paper` (`stage`, `created_at`)')
    }

    if (!(await tableExists(sequelize, LINK_TABLE))) {
      await sequelize.query(
        `CREATE TABLE IF NOT EXISTS \`${LINK_TABLE}\` (
          \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
          \`paper_id\` INT UNSIGNED NOT NULL COMMENT '试卷 id',
          \`question_id\` INT UNSIGNED NOT NULL COMMENT '题目 id',
          \`section\` VARCHAR(16) NOT NULL COMMENT '大题分区 single/multiple/fill/solve（组卷时冻结）',
          \`sort\` INT NOT NULL DEFAULT 0 COMMENT '卷内全局顺序（跨大题连续）',
          \`score\` DECIMAL(5,1) NOT NULL DEFAULT 0.0 COMMENT '本题分值，不回写题库',
          \`created_at\` DATETIME NOT NULL,
          \`updated_at\` DATETIME NOT NULL,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`uk_paper_question\` (\`paper_id\`, \`question_id\`),
          KEY \`idx_paper_sort\` (\`paper_id\`, \`sort\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='试卷-题目关联'`
      )
    } else {
      if (!(await indexExists(sequelize, LINK_TABLE, 'uk_paper_question'))) {
        await sequelize.query(
          'CREATE UNIQUE INDEX `uk_paper_question` ON `paper_questions` (`paper_id`, `question_id`)'
        )
      }
      if (!(await indexExists(sequelize, LINK_TABLE, 'idx_paper_sort'))) {
        await sequelize.query(
          'CREATE INDEX `idx_paper_sort` ON `paper_questions` (`paper_id`, `sort`)'
        )
      }
    }
  },

  async down() {
    // 试卷是老师手工编排的成果，不自动删表；如需回滚请手工执行：
    //   DROP TABLE IF EXISTS `paper_questions`;
    //   DROP TABLE IF EXISTS `paper`;
  }
}
