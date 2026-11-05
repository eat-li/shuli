// 知识点分类模型（结论的分类目录，支持 parentId 二级嵌套）
module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'knowledgeCategory',
    {
      name: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '分类名（代数/几何/函数/概率…）'
      },
      parentId: { type: DataTypes.INTEGER, allowNull: true, comment: '父分类 id，支持二级嵌套' },
      sort: { type: DataTypes.INTEGER, defaultValue: 0, comment: '展示排序' },
      remark: { type: DataTypes.STRING(255), comment: '备注' }
    },
    { tableName: 'knowledge_categories' }
  )
