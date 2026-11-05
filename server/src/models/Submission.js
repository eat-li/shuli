// 成绩记录模型（老师给学生作业打的分数，无学生在线提交）
module.exports = (sequelize, DataTypes) =>
  sequelize.define('submission', {
    homeworkId: { type: DataTypes.INTEGER, allowNull: false, comment: '作业 id' },
    studentId: { type: DataTypes.INTEGER, allowNull: false, comment: '学生 id' },
    score: { type: DataTypes.FLOAT, defaultValue: 0, comment: '得分' }
  })
