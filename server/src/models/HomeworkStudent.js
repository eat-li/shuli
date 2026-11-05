// 作业-学生关联表：替代 Homework.studentIds JSON 字段
module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'homeworkStudent',
    {
      homeworkId: { type: DataTypes.INTEGER, allowNull: false, comment: '作业 id' },
      studentId: { type: DataTypes.INTEGER, allowNull: false, comment: '学生 id' }
    },
    { tableName: 'homework_students' }
  )
