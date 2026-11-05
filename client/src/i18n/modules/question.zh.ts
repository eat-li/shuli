// 题库、题目浏览、知识点题目与难度分析页的中文文案。
// 与 question.en.ts 保持完全相同的键树；通用文案复用 common / questionType / homework 命名空间。
export default {
  questionBank: {
    searchPlaceholder: '按题干搜索',
    add: '新增题目',
    exportAll: '导出全部 PDF',
    mark: '标记题库（置顶并高亮）',
    unmark: '取消标记',
    markAria: '标记题库',
    unmarkAria: '取消标记题库',
    rename: '重命名题库',
    countAria: '题目数量',
    countUnit: '题',
    type: {
      choice: '选择',
      fill: '填空',
      solve: '解答'
    },
    subTitle: '查看「{name}」下的 {total} 道题',
    editSubTitle: '编辑该二级知识点（重命名 / 合并 / 删除）',
    collapse: '收起',
    more: '还有 {n} 项',
    empty: '暂无知识点',
    exportScope: '题库全部题目',
    renameDialog: {
      prompt: '重命名题库「{name}」（当前 {total} 道题）：',
      title: '重命名题库',
      placeholder: '新题库名称',
      required: '名称不能为空',
      confirm: '确定',
      success: '已重命名为「{name}」'
    }
  },
  questionBrowse: {
    searchPlaceholder: '搜索题干 / 补充说明',
    totalPrefix: '共 ',
    totalSuffix: ' 题',
    export: '导出 PDF',
    filter: '筛选',
    allTypes: '全部题型',
    typeSingle: '单项选择题',
    typeMultiple: '多项选择题',
    allDifficulty: '全部难度',
    allKnowledge: '全部知识点',
    allSubKnowledge: '全部二级知识点',
    empty: '没有符合条件的题目',
    difficultySaveFailed: '难度保存失败，请重试',
    difficulty: '难度 {n} 星',
    keyword: '含「{keyword}」',
    all: '全部题目',
    sortSubtitle: '排序：{label}',
    sort: {
      default: '默认排序（最新录入在前）',
      difficulty_asc: '难度：易 → 难',
      difficulty_desc: '难度：难 → 易',
      created_desc: '录入时间：新 → 旧',
      created_asc: '录入时间：旧 → 新',
      type_asc: '题型：选择 → 填空 → 解答',
      type_desc: '题型：解答 → 填空 → 选择'
    }
  },
  knowledgeQuestions: {
    back: '返回题库',
    rename: '重命名题库',
    total: '共 {n} 题',
    all: '全部',
    difficultyPlaceholder: '难度筛选',
    stars: '{n} 星',
    export: '导出 PDF',
    subKnowledge: '二级知识点',
    dropHint: '松手即归入',
    clearFilter: '清除筛选',
    filterTitle: '筛选「{name}」',
    levelTitle: '掌握等级：{label}（点击选择 基础 / 中等 / 进阶）',
    clearLevel: '取消等级',
    editSubTitle: '编辑该二级知识点（重命名 / 合并 / 删除）',
    filterEmptyTitle: '筛选未归类的题目',
    noQuestions: '这里还没有题目',
    dragHintWithSubs: '按住拖拽到左侧二级知识点上归类',
    dragHintNoSubs: '用右侧下拉框归类',
    addToHomework: '加入作业',
    tagsHint: '还没有二级知识点——在题目卡片右上角的下拉框里直接输入名称即可新建。',
    level: {
      basic: '基础',
      medium: '中等',
      advanced: '进阶',
      unset: '未定级'
    },
    levelMarked: '已将「{name}」标记为{level}',
    levelCleared: '已取消「{name}」的等级',
    assigned: '已归入「{name}」',
    movedToUncategorized: '已移回未分类',
    deleteConfirm: '确定删除该题目？',
    difficultySaveFailed: '难度保存失败，请重试',
    renameDialog: {
      prompt: '重命名题库「{name}」（共 {total} 道题）：',
      title: '重命名题库',
      placeholder: '新题库名称',
      required: '名称不能为空',
      confirm: '确定',
      success: '已重命名为「{name}」'
    },
    sortSubtitle: '排序：{label}',
    sort: {
      default: '默认排序（最新录入在前）',
      difficulty_asc: '难度：易 → 难',
      difficulty_desc: '难度：难 → 易',
      created_desc: '录入时间：新 → 旧',
      created_asc: '录入时间：旧 → 新',
      type_asc: '题型：选择 → 填空 → 解答',
      type_desc: '题型：解答 → 填空 → 选择'
    }
  },
  questionAnalysis: {
    title: '题库难度分析',
    intro:
      '难度是老师对「解题思路复杂度」的人工标注（1–5 星），不是分值。「未标注」单独成组——它表示没判断过，不等于简单。',
    aiRate: 'AI 批量判难度',
    allTypes: '全部题型',
    typeSingle: '单选',
    typeMultiple: '多选',
    typeFill: '填空',
    typeSolve: '解答',
    allKnowledge: '全部知识点',
    loadError: '难度数据加载失败',
    stats: {
      total: '题目总数',
      rated: '已标注难度',
      coverage: '覆盖率 {percent}',
      unrated: '未标注',
      unratedHint: '这些题在难度筛选里「查不到」',
      average: '平均难度',
      averageHint: '仅统计已标注题'
    },
    charts: {
      distributionTitle: '难度分布',
      distributionHint: '看整库是否头重脚轻：中档题扎堆、压轴题断层都会在这里显形。',
      typeTitle: '题型 × 难度',
      typeHint: '选择题是否偏易、解答题是否只在 4–5 星，一眼能看出来。',
      knowledgeTitle: '知识点 × 难度（题量前 12）',
      knowledgeHint:
        '某一知识点在某一档特别厚，说明该模块的训练梯度不足；空白档位是该模块没有对应难度的题。',
      star: '{n} 星',
      unrated: '未标注'
    },
    footer: '想按难度逐题核对或补标，去',
    footerBrowse: '题目浏览',
    footerEnd: '用「难度」筛选，点圆点即可就地改分。'
  }
}
