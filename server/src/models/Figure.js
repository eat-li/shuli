// 图形库：老师自己绘制的几何图形等图片（文件本体存阿里云 OSS，这里只存元数据）
// width/height 必须存：瀑布流要在图片加载前就按原始比例预留高度，否则滚动时布局会跳。
module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'figure',
    {
      title: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: '图片名称（列表展示 + 关键字搜索）'
      },
      url: { type: DataTypes.STRING(500), allowNull: false, comment: 'OSS 访问地址' },
      key: { type: DataTypes.STRING(255), comment: 'OSS 对象 key（便于日后清理）' },
      width: { type: DataTypes.INTEGER, defaultValue: 0, comment: '原始宽度（px）' },
      height: { type: DataTypes.INTEGER, defaultValue: 0, comment: '原始高度（px）' },
      size: { type: DataTypes.INTEGER, defaultValue: 0, comment: '文件大小（字节）' },
      tags: { type: DataTypes.STRING(255), comment: '关键词，逗号分隔，参与搜索' }
    },
    { tableName: 'figures' }
  )
