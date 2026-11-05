// 题目模型
module.exports = (sequelize, DataTypes) =>
  sequelize.define('question', {
    title: { type: DataTypes.TEXT, allowNull: false, comment: '题干(富文本HTML)' },
    type: {
      type: DataTypes.ENUM('choice', 'fill', 'solve'),
      defaultValue: 'choice',
      comment: '题型'
    },
    // 选择题子类型：高考试卷里单选与多选是不同大题/不同分值，排版必须能区分。
    // NULL = 未区分（存量题），读侧一律按 single 处理，不做数据回填。
    choiceMode: {
      type: DataTypes.ENUM('single', 'multiple'),
      allowNull: true,
      defaultValue: null,
      comment: '选择题子类型：single 单选 / multiple 多选；NULL=未区分'
    },
    // 难度 1-5；null = 尚未标注（不是"默认中等"）。
    // 早期这里 defaultValue 是 3，配合表单里写死的初始值，等于把「没判断过」
    // 记成了「判断为中等」，污染了难度筛选与统计。现在缺省留空，由人给值。
    difficulty: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
      comment: '难度 1-5；null = 未标注'
    },
    knowledgeTag: { type: DataTypes.STRING(100), comment: '知识点标签（一级）' },
    knowledgeSubTag: { type: DataTypes.STRING(100), comment: '二级知识点标签' },
    body: { type: DataTypes.TEXT, comment: '补充说明(富文本/LaTeX)' },
    options: { type: DataTypes.JSON, comment: '选项(客观题)' },
    answer: { type: DataTypes.TEXT, comment: '答案与解析(富文本HTML，可含图片)' }
  })
