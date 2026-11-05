// 作业分类模型（一级分类：作业只归属一个分类，未分类为 NULL）
// 与知识点分类（knowledgeCategory，供结论使用）刻意分开：两者语义不同，
// 混用同一张表会让「删除保护」和目录维护互相牵连。
module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'homeworkCategory',
    {
      name: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '分类名（周测/月考/课后作业…）'
      },
      sort: { type: DataTypes.INTEGER, defaultValue: 0, comment: '展示排序' },
      isDefault: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否为默认分类（打开作业页时默认显示它）；全表至多一个为 true'
      },
      remark: { type: DataTypes.STRING(255), comment: '备注' }
    },
    { tableName: 'homework_categories' }
  )
