// 考试类型字典（期末 / 期中 / 月考 / 模拟考 / 小测 …）
//
// key 是稳定标识，成绩记录引用 key；name 只用于显示，可以随时改。
// 这样「把『月考』改成『阶段考』」不会动到任何一条成绩，
// 也不会让历史筛选条件失效（这正是不直接把名称写进成绩表的原因）。
module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'examType',
    {
      key: { type: DataTypes.STRING(32), primaryKey: true, comment: '稳定类型标识' },
      name: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: '显示名称（可改）'
      },
      sort: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '排序，小的在前'
      }
    },
    { tableName: 'exam_types' }
  )
