// 试卷服务：题目清单校验、题序归一化、整卷装配与持久化。
//
// 分层意图：控制器只管「解析请求 → 调服务 → 组响应」，这里管业务规则与写库事务。
// 这样做的直接好处是**可以不经 HTTP 测业务**（见 test/api.test.js 与 validate.test.js），
// 也避免控制器里再堆一层 try/catch 与事务样板。
const { Op } = require('sequelize')
const { sequelize, Paper, PaperQuestion, Question } = require('../models')

// 大题分区：单选 / 多选 / 填空 / 解答。顺序即卷面顺序，前端也按这个顺序渲染。
const SECTIONS = ['single', 'multiple', 'fill', 'solve']
const SECTION_LABEL = {
  single: '单项选择题',
  multiple: '多项选择题',
  fill: '填空题',
  solve: '解答题'
}

// 卷面装配时给前端的题目字段：不含 answer（答案页本期不做，也避免整卷响应变大）
const QUESTION_FIELDS = [
  'id',
  'title',
  'type',
  'choiceMode',
  'difficulty',
  'knowledgeTag',
  'knowledgeSubTag',
  'body',
  'options'
]

// 空值转 0 的数字转换。分值/题号字段可能是 null（历史数据），直接 Number() 会得到 NaN 并污染合计。
const toNumber = (v) => (v === null || v === undefined ? 0 : Number(v))

/**
 * 规范化题目清单：校验 section、分值、去重，并把题序归一化。
 * 返回 { items } 或 { error }（错误文案直接给老师看，带「第几题」）。
 *
 * 不接受「题目类型与分区不匹配」的组合：单选分区里放填空题，
 * 模板取不到 options，会渲染成一道没有选项的选择题——错得很隐蔽，必须在保存时拦住。
 */
function normalizeItems(raw) {
  if (!Array.isArray(raw)) return { error: '题目清单必须是数组' }
  const items = []
  const seen = new Set()
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i] || {}
    const questionId = Number(row.questionId)
    if (!Number.isInteger(questionId) || questionId <= 0)
      return { error: `第 ${i + 1} 题的题目 id 不合法` }
    if (seen.has(questionId)) return { error: `第 ${i + 1} 题重复：同一道题只能出现一次` }
    seen.add(questionId)
    if (!SECTIONS.includes(row.section)) return { error: `第 ${i + 1} 题的大题分区不合法` }
    const score = Number(row.score)
    if (!Number.isFinite(score) || score < 0 || score > 100)
      return { error: `第 ${i + 1} 题的分值需在 0-100 之间` }
    items.push({ questionId, section: row.section, score: Math.round(score * 10) / 10 })
  }

  // 题序归一化：跨大题按「单选 → 多选 → 填空 → 解答」，大题内部保持客户端给的相对顺序。
  // 不归一化的话，存下来的 sort 与打印出来的题号会不一致（模板永远按分区顺序渲染），
  // 之后按 sort 判断题号就会读出错的编号。
  const ordered = items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => {
      const d = SECTIONS.indexOf(a.it.section) - SECTIONS.indexOf(b.it.section)
      return d !== 0 ? d : a.i - b.i
    })
    .map(({ it }, i) => ({ ...it, sort: i }))

  return { items: ordered }
}

/** 题目实际归属的大题：choice 看 choiceMode（NULL 视为单选） */
function sectionOf(q) {
  if (q.type === 'choice') return q.choiceMode === 'multiple' ? 'multiple' : 'single'
  return q.type
}

// 逐题核对「题目实际题型」与「所在分区」是否一致。
// 必须拦在保存前：单选分区里塞进填空题，模板取不到 options，会渲染成一道没有选项的选择题，错得很隐蔽。
function checkSectionsMatch(items, questions) {
  const map = new Map(questions.map((q) => [Number(q.id), q]))
  for (let i = 0; i < items.length; i++) {
    const q = map.get(items[i].questionId)
    if (!q) return `第 ${i + 1} 题的题目不存在或已被删除`
    const expected = sectionOf(q)
    if (expected !== items[i].section) {
      return `第 ${i + 1} 题是${SECTION_LABEL[expected] || '该题型'}，不能放进「${SECTION_LABEL[items[i].section]}」分区`
    }
  }
  return null
}

/** 规范化 + 回库核对题型，一次拿到可直接落库的 items */
async function prepareItems(raw) {
  const normalized = normalizeItems(raw)
  if (normalized.error) return normalized
  const items = normalized.items
  if (!items.length) return { error: '试卷至少要有一道题' }

  const questions = await Question.findAll({
    where: { id: { [Op.in]: items.map((i) => i.questionId) } }
  })
  const mismatch = checkSectionsMatch(items, questions)
  if (mismatch) return { error: mismatch }
  return { items }
}

/** 装配一份试卷：题目按 sort 升序，已删除的题目自动剔除（不报错，避免整卷打不开） */
async function assemblePaper(paper) {
  const links = await PaperQuestion.findAll({
    where: { paperId: paper.id },
    order: [['sort', 'ASC']]
  })
  const ids = [...new Set(links.map((l) => Number(l.questionId)))]
  const questions = ids.length
    ? await Question.findAll({ where: { id: { [Op.in]: ids } }, attributes: QUESTION_FIELDS })
    : []
  const qMap = new Map(questions.map((q) => [Number(q.id), q]))

  const items = []
  let missing = 0
  for (const link of links) {
    const q = qMap.get(Number(link.questionId))
    if (!q) {
      missing++
      continue
    }
    items.push({
      questionId: Number(link.questionId),
      section: link.section,
      score: toNumber(link.score),
      question: q
    })
  }

  // 分值以关联表为准：它是老师编辑时看到的那个数，不受题库改动影响
  const scoreSum = items.reduce((sum, it) => sum + it.score, 0)
  return { paper, items, scoreSum, missing }
}

// 卷面总分 = 各题分值之和（四舍五入）。分值只存在关联表，题库改动不影响已出的卷子。
const sumScore = (items) => Math.round(items.reduce((s, it) => s + (Number(it.score) || 0), 0))

/** 建卷：卷头 + 题目清单在同一事务里落地 */
function createPaper({ payload, items }) {
  return sequelize.transaction(async (t) => {
    const created = await Paper.create({ ...payload, totalScore: sumScore(items) }, { transaction: t })
    await PaperQuestion.bulkCreate(
      items.map((it) => ({ ...it, paperId: created.id })),
      { transaction: t }
    )
    return created
  })
}

/** 更新卷：items 为 null 时只改卷头（与「不传 items」语义一致），否则整表替换 */
async function updatePaper(paper, { payload, items }) {
  const patch = { ...payload }
  if (items) patch.totalScore = sumScore(items)

  await sequelize.transaction(async (t) => {
    await paper.update(patch, { transaction: t })
    if (!items) return
    await PaperQuestion.destroy({ where: { paperId: paper.id }, transaction: t })
    await PaperQuestion.bulkCreate(
      items.map((it) => ({ ...it, paperId: paper.id })),
      { transaction: t }
    )
  })
  return paper
}

// 删卷：先清关联再删主记录，同一事务内完成，避免出现没有题的「空卷」残留。
function removePaper(paper) {
  return sequelize.transaction(async (t) => {
    await PaperQuestion.destroy({ where: { paperId: paper.id }, transaction: t })
    await paper.destroy({ transaction: t })
  })
}

/** 复制一份试卷：老师常在同一套结构上换几道题，空白重排成本很高 */
async function duplicatePaper(paper) {
  const links = await PaperQuestion.findAll({
    where: { paperId: paper.id },
    order: [['sort', 'ASC']]
  })

  return sequelize.transaction(async (t) => {
    const created = await Paper.create(
      {
        title: `${paper.title}（副本）`,
        subtitle: paper.subtitle,
        stage: paper.stage,
        paperType: paper.paperType,
        duration: paper.duration,
        totalScore: paper.totalScore,
        source: paper.source,
        layout: paper.layout,
        notices: paper.notices,
        aiMeta: paper.aiMeta
      },
      { transaction: t }
    )
    if (links.length) {
      await PaperQuestion.bulkCreate(
        links.map((l) => ({
          paperId: created.id,
          questionId: l.questionId,
          section: l.section,
          sort: l.sort,
          score: l.score
        })),
        { transaction: t }
      )
    }
    return created
  })
}

/** 列表页需要的题数与总分：一次分组查询，避免 N+1 */
async function countByPaperIds(ids) {
  if (!ids.length) return new Map()
  const rows = await PaperQuestion.findAll({
    attributes: [
      'paperId',
      [PaperQuestion.sequelize.fn('COUNT', PaperQuestion.sequelize.col('id')), 'c'],
      [PaperQuestion.sequelize.fn('SUM', PaperQuestion.sequelize.col('score')), 's']
    ],
    where: { paperId: { [Op.in]: ids } },
    group: ['paperId'],
    raw: true
  })
  return new Map(rows.map((r) => [Number(r.paperId), { count: Number(r.c) || 0, sum: toNumber(r.s) }]))
}

module.exports = {
  SECTIONS,
  SECTION_LABEL,
  QUESTION_FIELDS,
  normalizeItems,
  sectionOf,
  checkSectionsMatch,
  prepareItems,
  assemblePaper,
  createPaper,
  updatePaper,
  removePaper,
  duplicatePaper,
  countByPaperIds
}
