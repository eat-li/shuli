// 资料库：上传到 OSS 的文件元数据（文件本体在 OSS，不进数据库）。
//
// originalName 必须单独存：OSS 的 key 是 uuid，标题又允许老师改，
// 两者都不是「原始文件名」——下载时想还原文件名、按扩展名判断类型都要靠它。
module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'resource',
    {
      title: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: '资料标题（默认为原文件名，可改）'
      },
      originalName: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: '上传时的原始文件名（含扩展名）'
      },
      ext: { type: DataTypes.STRING(16), allowNull: false, comment: '扩展名，小写，含点' },
      mime: { type: DataTypes.STRING(100), comment: 'MIME 类型' },
      size: { type: DataTypes.INTEGER, defaultValue: 0, comment: '文件大小（字节）' },
      url: { type: DataTypes.STRING(500), allowNull: false, comment: 'OSS 访问地址' },
      key: { type: DataTypes.STRING(255), comment: 'OSS 对象 key（删除时用）' },
      categoryId: { type: DataTypes.INTEGER, comment: '所属分类；null 表示未分类' },
      remark: { type: DataTypes.STRING(500), comment: '备注' }
    },
    { tableName: 'resources' }
  )
