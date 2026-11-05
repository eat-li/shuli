// 014：补齐按关联列/二级筛选列查询的索引。
//
// 重新执行幂等的 ensureIndexes：已存在的索引会命中 ER_DUP_KEYNAME 被忽略，
// 只新增 001 之后补进列表的项。严格模式保证建索引失败时迁移不会被记为已执行。
const { ensureIndexes } = require('../src/utils/ensureIndexes')

module.exports = {
  async up(_queryInterface, sequelize) {
    await ensureIndexes(sequelize, { throwOnError: true })
  },

  async down() {
    // 索引回滚没有业务收益；如需撤销请手工 DROP INDEX。
  }
}
