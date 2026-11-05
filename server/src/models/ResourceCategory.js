// 资料目录（可多级）：parentId = null 表示顶层目录。
// 名称按「同一上级目录内不重名」由控制器校验 —— MySQL 的唯一索引对 NULL 不去重，
// 顶层目录会漏判，所以不依赖数据库唯一约束。
module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'resourceCategory',
    {
      name: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '目录名称'
      },
      parentId: {
        type: DataTypes.INTEGER,
        comment: '上级目录 id；null 表示顶层目录'
      }
    },
    { tableName: 'resource_categories' }
  )
