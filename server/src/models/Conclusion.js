// 结论模型
module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'conclusion',
    {
      title: { type: DataTypes.STRING(200), allowNull: false, comment: '结论标题' },
      categoryId: { type: DataTypes.INTEGER, allowNull: false, comment: '所属知识点分类 id' },
      content: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: '详细内容(富文本HTML，含公式与说明)'
      },
      summary: { type: DataTypes.STRING(500), comment: '一句话结论/摘要，便于列表与 PDF 速览' },
      status: {
        type: DataTypes.ENUM('draft', 'published'),
        defaultValue: 'draft',
        comment: '发布状态'
      },
      tags: { type: DataTypes.STRING(255), comment: '关键词，逗号分隔，便于检索' }
    },
    { tableName: 'conclusions' }
  )
