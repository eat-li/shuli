// 讲义模型：正文以富文本 HTML 存储（content，文档式编辑的权威内容）；
// items 保留旧的「有序引用数组」，仅用于兼容改造前保存的讲义与列表页统计。
module.exports = (sequelize, DataTypes) =>
  sequelize.define('handout', {
    title: { type: DataTypes.STRING(200), allowNull: false, comment: '讲义标题' },
    status: {
      type: DataTypes.ENUM('draft', 'published'),
      defaultValue: 'published',
      comment: '状态'
    },
    remark: { type: DataTypes.TEXT, comment: '备注' },
    items: {
      type: DataTypes.JSON,
      comment: '旧结构：[{ type, id }]，type: question题目 / conclusion结论 / knowledge知识点'
    },
    content: {
      type: DataTypes.TEXT('long'),
      comment: '讲义正文（富文本 HTML，可含题目、图片、表格、公式）'
    }
  })
