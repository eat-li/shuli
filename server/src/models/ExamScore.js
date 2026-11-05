// 测评成绩模型（期末考试/期中/小测/随堂测验等正式成绩，区别于作业练习分 Submission）
module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'examScore',
    {
      studentId: { type: DataTypes.INTEGER, allowNull: false, comment: '学生 id' },
      examType: {
        type: DataTypes.STRING(32),
        allowNull: false,
        comment: '考试类型 key（引用 exam_types.key，名称可改）'
      },
      subject: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: '数学',
        comment: '科目'
      },
      score: { type: DataTypes.FLOAT, allowNull: false, comment: '得分' },
      fullScore: { type: DataTypes.FLOAT, defaultValue: 100, comment: '满分' },
      examDate: { type: DataTypes.DATEONLY, allowNull: false, comment: '考试日期' },
      comment: { type: DataTypes.STRING(255), comment: '教师备注' }
    },
    { tableName: 'exam_scores' }
  )
