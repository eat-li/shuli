// 试卷：一份可保存、可重复打印的卷子。
//
// 与「作业」的区别：作业是发布给学生做的（关联学生、录成绩），试卷只是排版产物，
// 不承担发布语义，因此不建学生关联；分值、分区都存在 paper_questions 里。
//
// stage 用字符串白名单而不是 ENUM：学段命名还会演进（如「新高考Ⅰ卷」），
// ENUM 改值要 ALTER 表，字符串 + 应用层校验改起来只需改常量。
module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'paper',
    {
      title: { type: DataTypes.STRING(200), allowNull: false, comment: '试卷主标题' },
      subtitle: { type: DataTypes.STRING(200), comment: '副标题（考试范围）' },
      stage: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'senior3',
        comment: '学段：senior1/2/3、junior1/2/3'
      },
      paperType: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'mock',
        comment: '考试类型：monthly/midterm/final/mock/gaokao'
      },
      duration: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 120,
        comment: '考试时长（分钟）'
      },
      totalScore: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 150,
        comment: '满分（与各题分值求和对账）'
      },
      source: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'manual',
        comment: '来源：manual / ai'
      },
      layout: { type: DataTypes.JSON, comment: '排版快照 {fontSize,gapRatio,optionColumns}' },
      notices: { type: DataTypes.TEXT, comment: '考生须知；NULL 用内置四条' },
      aiMeta: { type: DataTypes.JSON, comment: 'AI 组卷元信息' }
    },
    {
      tableName: 'paper'
      // 索引只在迁移 010 里声明，模型不再重复一份：
      // 模型 indexes 用的是属性名（createdAt），而 underscored 生成的是列名（created_at），
      // 两处写法一旦不一致，sync 会报 "Key column 'createdAt' doesn't exist"。
      // 单一事实来源 = migrations/010。
    }
  )
