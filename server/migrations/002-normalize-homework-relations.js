// 作业多对多关系规范化：
// 1. 创建 homework_questions / homework_students 关联表
// 2. 把 Homework 旧 JSON 字段 question_ids / student_ids 迁移到关联表
// 3. 建立唯一索引，防止同一作业重复关联同一题目/学生
const { QueryTypes } = require('sequelize')

const IGNORE_CODES = new Set([
  'ER_DUP_KEYNAME',
  'ER_DUP_INDEX',
  'ER_DUP_FIELDNAME'
])

async function safeCreateIndex(sequelize, sql) {
  try {
    await sequelize.query(sql)
  } catch (e) {
    const code = e.code || e.parent?.code
    if (!IGNORE_CODES.has(code)) throw e
  }
}

function parseIdArray(value) {
  if (!value) return []
  let arr = value
  if (typeof arr === 'string') {
    try {
      arr = JSON.parse(arr)
    } catch {
      return []
    }
  }
  return Array.isArray(arr) ? arr.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0) : []
}

module.exports = {
  async up(queryInterface, sequelize) {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS homework_questions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        homework_id INT NOT NULL,
        question_id INT NOT NULL,
        sort INT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `)

    // sync() 可能已用 Sequelize 默认方式建表：created_at/updated_at 为 NOT NULL 且无默认值。
    // 这里统一补上默认值，保证迁移回填时可以直接省略时间字段。
    await sequelize.query(`
      ALTER TABLE homework_questions
        MODIFY created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        MODIFY updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    `)

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS homework_students (
        id INT AUTO_INCREMENT PRIMARY KEY,
        homework_id INT NOT NULL,
        student_id INT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `)

    await sequelize.query(`
      ALTER TABLE homework_students
        MODIFY created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        MODIFY updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    `)

    await safeCreateIndex(
      sequelize,
      'CREATE UNIQUE INDEX uk_homework_question ON homework_questions (homework_id, question_id)'
    )
    await safeCreateIndex(
      sequelize,
      'CREATE UNIQUE INDEX uk_homework_student ON homework_students (homework_id, student_id)'
    )

    // 检查旧表是否还有 JSON 字段（新库由 sync 创建时不会有这些字段）
    const [columns] = await sequelize.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'homework'
         AND COLUMN_NAME IN ('question_ids', 'student_ids')`
    )
    const columnNames = new Set((columns || []).map((c) => c.COLUMN_NAME))
    if (!columnNames.has('question_ids') && !columnNames.has('student_ids')) {
      return
    }

    const homeworks = await sequelize.query(
      'SELECT id, question_ids, student_ids FROM homework',
      { type: QueryTypes.SELECT }
    )

    for (const hw of homeworks) {
      const questionIds = parseIdArray(hw.question_ids)
      const studentIds = parseIdArray(hw.student_ids)

      for (let i = 0; i < questionIds.length; i++) {
        await sequelize.query(
          `INSERT INTO homework_questions (homework_id, question_id, sort)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE sort = VALUES(sort)`,
          { replacements: [hw.id, questionIds[i], i] }
        )
      }

      for (const studentId of studentIds) {
        await sequelize.query(
          `INSERT INTO homework_students (homework_id, student_id)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE student_id = student_id`,
          { replacements: [hw.id, studentId] }
        )
      }
    }
  },

  async down() {
    // 不自动删除关联表，避免误删数据；如需回滚请手工处理
  }
}
