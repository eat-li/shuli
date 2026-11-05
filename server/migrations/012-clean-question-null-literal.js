// 清理历史脏数据：显式 null 被写成字符串 "null"。
//
// 根因在 src/utils/validate.js 的 parseField('text')：const s = String(v) 把 null
// 变成 "null"，trim 后非空，于是当作有效值落库。前端清空二级知识点时传
// knowledgeSubTag: null（QuestionFormDialog），body / answer 也可能传 null。
//
// 已知存量：19 行 knowledge_sub_tag='null'，其中 3 行 body / answer 也是 'null'。
// 本迁移只做精确等值清理，幂等；不碰其他列（全库扫描确认其余表没有该形态脏数据）。
module.exports = {
  async up(queryInterface, sequelize) {
    await sequelize.query("UPDATE `question` SET knowledge_sub_tag = NULL WHERE knowledge_sub_tag = 'null'")
    await sequelize.query("UPDATE `question` SET body = NULL WHERE body = 'null'")
    await sequelize.query("UPDATE `question` SET answer = NULL WHERE answer = 'null'")
  },

  async down() {
    // 不可逆：清理后无法区分「回填的 null 字面量」与「迁移清掉的真脏数据」，
    // 也不该把脏数据写回去。
  }
}
