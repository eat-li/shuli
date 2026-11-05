// 通用键值设置表（值按 JSON 文本存）
// 目前用于「备份提醒」：上次备份时间、提醒间隔、是否启用提醒
module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'setting',
    {
      key: { type: DataTypes.STRING(64), primaryKey: true, comment: '设置项' },
      value: { type: DataTypes.TEXT, comment: 'JSON 文本' }
    },
    { tableName: 'settings' }
  )
