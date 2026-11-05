// 领域字段 schema：题目与试卷。
//
// 放在 utils 而不是控制器里，是为了能被单测直接引用（纯函数，不碰数据库）。
// 控制器只负责「解析 → 查库 → 写库 → 组响应」。
const { parse } = require('./validate')

const QUESTION_TYPES = ['choice', 'fill', 'solve']
const CHOICE_MODES = ['single', 'multiple']

const PAPER_SECTIONS = ['single', 'multiple', 'fill', 'solve']
const PAPER_STAGES = ['primary', 'junior1', 'junior2', 'junior3', 'senior1', 'senior2', 'senior3']
const PAPER_TYPES = ['monthly', 'midterm', 'final', 'mock', 'gaokao']

/**
 * 题目字段。
 * 与原实现的行为对齐点：标签静默截断到 100 字、空串归一为 null、难度只收 1-5 整数。
 * 收紧点：`choiceMode` 传非法值现在会报错（原先被静默置 null），
 * 因为「传了但传错」比「没传」更可能是调用方 bug，不该悄悄修正。
 */
const QUESTION_SCHEMA = {
  title: { kind: 'text', required: true, message: '题干不能为空' },
  type: { kind: 'enum', values: QUESTION_TYPES, message: '题型不合法' },
  choiceMode: { kind: 'enum', values: CHOICE_MODES, nullable: true, message: '选择题子类型不合法' },
  difficulty: { kind: 'int', min: 1, max: 5, nullable: true, message: '难度需为 1-5 的整数' },
  knowledgeTag: { kind: 'text', max: 100, truncate: true },
  knowledgeSubTag: { kind: 'text', max: 100, truncate: true },
  body: { kind: 'text' },
  options: { kind: 'array', nullable: true, message: '选项必须是数组' },
  answer: { kind: 'text' }
}

/** 题目解析：子类型只对选择题有意义，填空题/解答题带了也清掉 */
const parseQuestion = (body, opts = {}) =>
  parse(QUESTION_SCHEMA, body, {
    ...opts,
    after: (values) => {
      if (values.type && values.type !== 'choice') values.choiceMode = null
      // 二级知识点必须挂在一级之下：一级被显式清空时，二级一并置空，
      // 否则会留下一批「无归属的二级知识点」，在知识点页表现为凭空出现的标签。
      // 只在请求体里带了 knowledgeTag 时才判断——PATCH 只改 knowledgeSubTag 时
      // values 里没有 knowledgeTag，不能误清。
      if (values.knowledgeTag !== undefined && !values.knowledgeTag && values.knowledgeSubTag) {
        values.knowledgeSubTag = null
      }
      return null
    }
  })

const PAPER_SCHEMA = {
  title: { kind: 'text', required: true, max: 200, truncate: true, message: '试卷标题不能为空' },
  subtitle: { kind: 'text', max: 200, truncate: true },
  stage: { kind: 'enum', values: PAPER_STAGES, message: '学段不合法' },
  paperType: { kind: 'enum', values: PAPER_TYPES, message: '考试类型不合法' },
  duration: { kind: 'int', min: 1, max: 600, message: '考试时长需为 1-600 的整数' },
  layout: { kind: 'json' },
  notices: { kind: 'text' },
  aiMeta: { kind: 'json' },
  source: { kind: 'enum', values: ['manual', 'ai'], message: '来源不合法' }
}

// 解析试卷请求体（见 PAPER_SCHEMA）。传 { partial: true } 即为 PATCH 语义。
const parsePaper = (body, opts = {}) => parse(PAPER_SCHEMA, body, opts)

module.exports = {
  QUESTION_TYPES,
  CHOICE_MODES,
  PAPER_SECTIONS,
  PAPER_STAGES,
  PAPER_TYPES,
  QUESTION_SCHEMA,
  PAPER_SCHEMA,
  parseQuestion,
  parsePaper
}
