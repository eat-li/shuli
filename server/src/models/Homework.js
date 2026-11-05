// 作业模型
module.exports = (sequelize, DataTypes) =>
  sequelize.define('homework', {
    title: { type: DataTypes.STRING(200), allowNull: false, comment: '作业标题' },
    startAt: { type: DataTypes.DATE, comment: '开始时间' },
    endAt: { type: DataTypes.DATE, comment: '截止时间' },
    status: {
      type: DataTypes.ENUM('draft', 'published', 'closed'),
      defaultValue: 'draft',
      comment: '状态'
    },
    categoryId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      // 显式 defaultValue: null —— 否则新建作业不传分类时，Sequelize 返回的实例上
      // 该字段是 undefined（字段直接从 JSON 里消失），而更新接口返回的是 null，
      // 同一语义出现两种表示，前端得多写一层兼容。
      defaultValue: null,
      comment: '所属作业分类 id（homework_categories），NULL 表示未分类'
    },
    remark: { type: DataTypes.TEXT, comment: '备注' }
  })
