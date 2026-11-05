// 初始索引迁移：把原先启动时 ensureIndexes 创建的索引纳入迁移管理。
// 该迁移是幂等的：索引已存在时会自动忽略。
const { ensureIndexes } = require('../src/utils/ensureIndexes')

module.exports = {
  async up(queryInterface, sequelize) {
    // 严格模式：索引建失败就让迁移失败（不写 migrations 记录），下次启动会重试。
    // 早先吞掉错误，导致「迁移记为已执行、唯一索引却不存在」。
    await ensureIndexes(sequelize, { throwOnError: true })
  },

  async down() {
    // 为安全起见，不自动删除索引；如需回滚请手工 DROP INDEX
  }
}
