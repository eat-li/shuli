// 试卷-题目关联：题号顺序（sort）、分区（section）、本题分值（score）。
//
// section 与 score 是**组卷时的快照**，不回写题库：
//   - 题库没有分值字段，也不该有（同一题在不同卷子里分值不同）；
//   - 老师事后改题目类型，不能让已打印的卷面分区跟着变。
module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'paperQuestion',
    {
      paperId: { type: DataTypes.INTEGER, allowNull: false, comment: '试卷 id' },
      questionId: { type: DataTypes.INTEGER, allowNull: false, comment: '题目 id' },
      section: {
        type: DataTypes.STRING(16),
        allowNull: false,
        comment: '大题分区：single/multiple/fill/solve（组卷时冻结）'
      },
      sort: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '卷内全局顺序' },
      score: {
        type: DataTypes.DECIMAL(5, 1),
        allowNull: false,
        defaultValue: 0,
        comment: '本题分值（只存试卷，不回写题库）'
      }
    },
    {
      tableName: 'paper_questions'
      // 索引只在迁移 010 里声明（理由同 Paper.js：模型 indexes 与 underscored 列名容易打架）
    }
  )
