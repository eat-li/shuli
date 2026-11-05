// 学生模型
module.exports = (sequelize, DataTypes) =>
  sequelize.define('student', {
    name: { type: DataTypes.STRING(50), allowNull: false, comment: '姓名' },
    grade: { type: DataTypes.STRING(50), comment: '年级' },
    contact: { type: DataTypes.STRING(100), comment: '联系方式' },
    remark: { type: DataTypes.TEXT, comment: '备注' }
  })
