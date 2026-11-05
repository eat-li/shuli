// 015：资料库（resources）的分类筛选索引。
//
// 表由启动时的 sync 创建，索引不在模型里声明；重新执行幂等的 ensureIndexes，
// 已存在的索引命中 ER_DUP_KEYNAME 会被忽略。严格模式保证建索引失败时迁移不被记为已执行。
const { ensureIndexes } = require('../src/utils/ensureIndexes')

module.exports = {
  async up(_queryInterface, sequelize) {
    await ensureIndexes(sequelize, { throwOnError: true })
  },

  async down() {
    // 索引回滚没有业务收益；如需撤销请手工 DROP INDEX。
  }
}
