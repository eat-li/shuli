// 一级知识点的「标记」：题库页把常用题库拎到最前并高亮。
//
// 一级知识点同样没有独立表（只是 Question.knowledgeTag 字符串），
// 所以这里用 tag 作唯一键单独存标记，和 knowledge_sub_levels 是同一思路。
// 空串表示未分类题库（与 tagKeyOf 的口径一致）。
//
// 为什么还要 id：备份的导出/恢复按主键 id 遍历（backup.controller 的 MODEL_LIST），
// 纯字符串主键的表进不了那套流程。id 只服务备份，业务上 tag 才是唯一键。
module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'knowledgeTagMark',
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true
      },
      tag: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment: '一级知识点名称（Question.knowledgeTag）；空串表示未分类题库'
      }
    },
    { tableName: 'knowledge_tag_marks' }
  )
