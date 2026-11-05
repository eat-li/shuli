// 模型注册与关联
const sequelize = require('../config/db')
const { DataTypes } = require('sequelize')

const Student = require('./Student')(sequelize, DataTypes)
const Question = require('./Question')(sequelize, DataTypes)
const Homework = require('./Homework')(sequelize, DataTypes)
const HomeworkQuestion = require('./HomeworkQuestion')(sequelize, DataTypes)
const HomeworkStudent = require('./HomeworkStudent')(sequelize, DataTypes)
const Submission = require('./Submission')(sequelize, DataTypes)
const ExamScore = require('./ExamScore')(sequelize, DataTypes)
const HomeworkCategory = require('./HomeworkCategory')(sequelize, DataTypes)
const KnowledgeCategory = require('./KnowledgeCategory')(sequelize, DataTypes)
const Conclusion = require('./Conclusion')(sequelize, DataTypes)
const LessonSummary = require('./LessonSummary')(sequelize, DataTypes)
const Handout = require('./Handout')(sequelize, DataTypes)
const KnowledgeSubLevel = require('./KnowledgeSubLevel')(sequelize, DataTypes)
const KnowledgeTagMark = require('./KnowledgeTagMark')(sequelize, DataTypes)
const Figure = require('./Figure')(sequelize, DataTypes)
const Setting = require('./Setting')(sequelize, DataTypes)
const Paper = require('./Paper')(sequelize, DataTypes)
const PaperQuestion = require('./PaperQuestion')(sequelize, DataTypes)
const ExamType = require('./ExamType')(sequelize, DataTypes)
const ResourceCategory = require('./ResourceCategory')(sequelize, DataTypes)
const Resource = require('./Resource')(sequelize, DataTypes)

// 学生 1—* 提交
Student.hasMany(Submission, { foreignKey: 'studentId' })
Submission.belongsTo(Student, { foreignKey: 'studentId' })

// 作业 1—* 提交
Homework.hasMany(Submission, { foreignKey: 'homeworkId' })
Submission.belongsTo(Homework, { foreignKey: 'homeworkId' })

// 作业 1—* 作业题目（多对多关联表）
Homework.hasMany(HomeworkQuestion, {
  foreignKey: 'homeworkId',
  as: 'homeworkQuestions',
  onDelete: 'CASCADE'
})
HomeworkQuestion.belongsTo(Homework, { foreignKey: 'homeworkId', as: 'homework' })
HomeworkQuestion.belongsTo(Question, { foreignKey: 'questionId', as: 'question' })

// 作业 1—* 作业学生（多对多关联表）
Homework.hasMany(HomeworkStudent, {
  foreignKey: 'homeworkId',
  as: 'homeworkStudents',
  onDelete: 'CASCADE'
})
HomeworkStudent.belongsTo(Homework, { foreignKey: 'homeworkId', as: 'homework' })
HomeworkStudent.belongsTo(Student, { foreignKey: 'studentId', as: 'student' })

// 学生 1—* 测评成绩
Student.hasMany(ExamScore, { foreignKey: 'studentId' })
ExamScore.belongsTo(Student, { foreignKey: 'studentId' })

// 作业分类 1—* 作业（作业只归属一个分类；未分类为 NULL）
// 外键在迁移 006 中以 ON DELETE SET NULL 建立，因而删分类不会连带删掉作业。
HomeworkCategory.hasMany(Homework, { foreignKey: 'categoryId', as: 'homeworks' })
Homework.belongsTo(HomeworkCategory, { foreignKey: 'categoryId', as: 'category' })

// 知识点分类 1—* 结论
KnowledgeCategory.hasMany(Conclusion, { foreignKey: 'categoryId', as: 'conclusions' })
Conclusion.belongsTo(KnowledgeCategory, { foreignKey: 'categoryId', as: 'category' })

// 作业 1—* 课时总结；学生 1—* 课时总结
Homework.hasMany(LessonSummary, { foreignKey: 'homeworkId', as: 'lessonSummaries' })
LessonSummary.belongsTo(Homework, { foreignKey: 'homeworkId', as: 'homework' })
Student.hasMany(LessonSummary, { foreignKey: 'studentId', as: 'lessonSummaries' })
LessonSummary.belongsTo(Student, { foreignKey: 'studentId', as: 'student' })

// 试卷 1—* 试卷题目（同一份卷子里一道题只能出现一次，靠唯一索引兜底）
Paper.hasMany(PaperQuestion, {
  foreignKey: 'paperId',
  as: 'paperQuestions',
  onDelete: 'CASCADE'
})
PaperQuestion.belongsTo(Paper, { foreignKey: 'paperId', as: 'paper' })
PaperQuestion.belongsTo(Question, { foreignKey: 'questionId', as: 'question' })

// 资料分类 1—* 资料文件（删分类时把资料移回「未分类」，不连带删文件）
ResourceCategory.hasMany(Resource, { foreignKey: 'categoryId', as: 'resources' })
Resource.belongsTo(ResourceCategory, { foreignKey: 'categoryId', as: 'category' })

module.exports = {
  sequelize,
  Student,
  Question,
  Homework,
  HomeworkQuestion,
  HomeworkStudent,
  Submission,
  ExamScore,
  HomeworkCategory,
  KnowledgeCategory,
  Conclusion,
  LessonSummary,
  Handout,
  KnowledgeSubLevel,
  KnowledgeTagMark,
  Figure,
  Setting,
  Paper,
  PaperQuestion,
  ResourceCategory,
  Resource,
  ExamType
}
