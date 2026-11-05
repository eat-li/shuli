// 作业-题目关联表：替代 Homework.questionIds JSON 字段，支持排序与引用完整性
module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'homeworkQuestion',
    {
      homeworkId: { type: DataTypes.INTEGER, allowNull: false, comment: '作业 id' },
      questionId: { type: DataTypes.INTEGER, allowNull: false, comment: '题目 id' },
      sort: { type: DataTypes.INTEGER, defaultValue: 0, comment: '题目在作业中的顺序' }
    },
    { tableName: 'homework_questions' }
  )
