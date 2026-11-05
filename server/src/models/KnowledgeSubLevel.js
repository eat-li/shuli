// 二级知识点的掌握等级（基础 / 中等 / 进阶）
// 注意：二级知识点本身只是挂在题目上的字符串（Question.knowledgeSubTag），没有独立表，
// 所以这里用 (一级知识点, 二级知识点名) 作为键单独存等级，供题库知识点页给二级知识点上色区分。
module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'knowledgeSubLevel',
    {
      tag: {
        type: DataTypes.STRING(100),
        allowNull: false,
        defaultValue: '',
        comment: '所属一级知识点（Question.knowledgeTag）；空串表示未分类题库'
      },
      name: { type: DataTypes.STRING(100), allowNull: false, comment: '二级知识点名称' },
      level: {
        type: DataTypes.ENUM('basic', 'medium', 'advanced'),
        allowNull: false,
        comment: '掌握等级：basic 基础 / medium 中等 / advanced 进阶'
      }
    },
    {
      tableName: 'knowledge_sub_levels',
      indexes: [{ unique: true, fields: ['tag', 'name'] }]
    }
  )
