// 数据库索引（纯性能增强，不改变任何业务行为）。
//
// 为什么不写进模型的 `indexes: [...]`：模型里的 fields 用 camelCase 属性名，
// 在全局 `underscored: true` 下 Sequelize 生成 DDL 时不会把它们映射成 snake_case
// 物理列名（knowledgeTag -> knowledge_tag），会生成 `ADD INDEX (knowledgeTag)`，
// 而表里只有 `knowledge_tag`，建索引直接失败并让启动崩溃。
// 这里显式写物理列名，并用 queryInterface 的方言无关接口建索引——
// 以前是拼 MySQL 的反引号 DDL，换库就得重写一遍。
//
// 索引清单是幂等的：每次启动先 showIndex 查重，已存在就跳过，因此可以放心每次跑。

// 普通索引：[表名, 索引名, 物理列名(已为 snake_case)]
const INDEXES = [
  ['student', 'idx_student_name', ['name']],
  ['student', 'idx_student_grade', ['grade']],
  ['question', 'idx_question_type', ['type']],
  ['question', 'idx_question_difficulty', ['difficulty']],
  ['question', 'idx_question_knowledge_tag', ['knowledge_tag']],
  ['question', 'idx_question_knowledge_type_diff', ['knowledge_tag', 'type', 'difficulty']],
  // 二级知识点筛选、单选/多选筛选（题库列表与难度分析都会用到）
  ['question', 'idx_question_knowledge_sub_tag', ['knowledge_sub_tag']],
  ['question', 'idx_question_choice_mode', ['choice_mode']],
  ['homework', 'idx_homework_status', ['status']],
  // 关联表反向查询：删题/删学生、统计「哪些题被用过」都按 question_id/student_id 查；
  // 现有唯一索引把这两列放在第二位，单独查第二列用不上。
  ['homework_questions', 'idx_homework_question_ref', ['question_id']],
  ['homework_students', 'idx_homework_student_ref', ['student_id']],
  ['paper_questions', 'idx_paper_question_ref', ['question_id']],
  ['lesson_summaries', 'idx_summary_homework', ['homework_id']],
  ['lesson_summaries', 'idx_summary_student', ['student_id']],
  ['submission', 'idx_submission_homework', ['homework_id']],
  ['submission', 'idx_submission_student', ['student_id']],
  ['exam_scores', 'idx_exam_score_student', ['student_id']],
  ['exam_scores', 'idx_exam_score_date', ['exam_date']],
  ['exam_scores', 'idx_exam_score_type', ['exam_type']],
  ['exam_scores', 'idx_exam_score_subject', ['subject']],
  ['exam_scores', 'idx_exam_score_student_date', ['student_id', 'exam_date']],
  ['exam_scores', 'idx_exam_score_type_date', ['exam_type', 'exam_date']],
  ['knowledge_categories', 'idx_knowledge_category_name', ['name']],
  ['conclusions', 'idx_conclusion_category', ['category_id']],
  ['conclusions', 'idx_conclusion_status', ['status']],
  ['conclusions', 'idx_conclusion_title', ['title']],
  ['resources', 'idx_resource_category', ['category_id']]
]

// 唯一索引：用于从数据库层面保证业务唯一性，避免并发/手工插入产生重复数据
const UNIQUE_INDEXES = [
  ['submission', 'uk_submission_homework_student', ['homework_id', 'student_id']],
  [
    'exam_scores',
    'uk_exam_score_student_type_subject_date',
    ['student_id', 'exam_type', 'subject', 'exam_date']
  ]
]

// 建单个索引。已存在就当成功——这是幂等重跑的正常情况。
// 其余错误分两种处置：启动路径只告警（一个索引不该挡住整个服务），
// 迁移路径必须抛出，否则唯一索引可能永久缺失（成绩 upsert 正依赖它）。
async function createIndex(queryInterface, table, name, cols, unique, throwOnError = false) {
  try {
    const existing = await queryInterface.showIndex(table)
    if (existing.some((idx) => idx.name === name)) return
    await queryInterface.addIndex(table, cols, { name, unique })
    console.log(`${unique ? '✔ 已确保唯一索引' : '✔ 已确保索引'} ${name} (${table})`)
  } catch (e) {
    if (throwOnError) throw e
    console.warn(`⚠️ 创建索引 ${name} 失败（已忽略）: ${e.message}`)
  }
}

// 按清单补齐普通索引与唯一索引。
async function ensureIndexes(sequelize, { throwOnError = false } = {}) {
  const queryInterface = sequelize.getQueryInterface()
  for (const [table, name, cols] of INDEXES) {
    await createIndex(queryInterface, table, name, cols, false, throwOnError)
  }
  for (const [table, name, cols] of UNIQUE_INDEXES) {
    await createIndex(queryInterface, table, name, cols, true, throwOnError)
  }
}

module.exports = { ensureIndexes, INDEXES, UNIQUE_INDEXES }
