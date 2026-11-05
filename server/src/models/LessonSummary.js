// 课时总结模型：一次课的记录（关联作业，可指定学生）
module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'lessonSummary',
    {
      homeworkId: { type: DataTypes.INTEGER, allowNull: false, comment: '关联作业 id' },
      studentId: { type: DataTypes.INTEGER, allowNull: true, comment: '上课学生 id（可空）' },
      lessonAt: { type: DataTypes.DATE, comment: '上课时间' },
      lessonNo: { type: DataTypes.INTEGER, comment: '上课次数（第几次课）' },
      content: { type: DataTypes.TEXT, comment: '上课内容' },
      classStatus: { type: DataTypes.TEXT, comment: '上课状态' },
      homeworkTask: { type: DataTypes.TEXT, comment: '课后任务' }
    },
    { tableName: 'lesson_summaries' }
  )
