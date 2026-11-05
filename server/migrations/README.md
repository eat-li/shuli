# 数据库迁移

## 现在还需要这个目录吗

需要，但平时是空的。

v1.0 起默认库换成 SQLite，**建表由 `sequelize.sync()` 按模型完成**，因此
「从零装一个库」不需要任何迁移文件。迁移机制保留下来，专门解决另一件事：
**已经用了一段时间的库，怎么加上新字段/新索引** —— `sync()` 只在缺表时补建，
对已存在的表不会加列。

## 写新迁移的规矩

1. 文件名 `NNN-短横线描述.js`，按文件名排序执行，序号不要复用。
2. 导出 `up(queryInterface, sequelize)`，同步导出 `down()` 可留空（不自动回滚）。
3. **必须幂等**：执行成功后才会往 `migrations` 表写记录，中途失败下次启动重跑。
   所以 `ADD COLUMN` 前先用 `queryInterface.describeTable()` 判断列是否已存在。
4. 不要写 MySQL 专有语法（`information_schema`、`MODIFY COLUMN`、`ON DUPLICATE KEY`）。
   需要判断结构时用 queryInterface 的方言无关方法：`describeTable` / `showIndex` / `showAllTables`。
5. 模板：

```js
module.exports = {
  async up(queryInterface, sequelize) {
    const columns = await queryInterface.describeTable('question')
    if (columns.newField) return
    await queryInterface.addColumn('question', 'new_field', {
      type: sequelize.Sequelize.TEXT,
      allowNull: true
    })
  },
  async down() {}
}
```

## 历史迁移去哪了

001–017 全部是 MySQL 专有写法（`information_schema` 探查、`MODIFY COLUMN`、
`ON DUPLICATE KEY UPDATE`、反引号 DDL）。换库时没有逐个移植：新装的库由模型
一次性建全，历史文件对 SQLite 用户没有任何意义；老 MySQL 用户走的是
「旧版导出 ZIP → 新版导入」的路径，也不经过这些迁移。完整内容见 git 历史。
