// 题库控制器
const { Op } = require('sequelize')
const { sequelize, Question, HomeworkQuestion, KnowledgeSubLevel, PaperQuestion } = require('../models')
const { ok, fail } = require('../utils/response')
const { cacheGet, cacheSet, cacheDel, cacheDelByPrefix } = require('../utils/cache')
// 字段规则集中在 utils/schemas.js：本文件不再自己维护 pick/validate，
// 改规则只改一处，避免「A 接口接受、B 接口拒绝」这类漂移。
const { parseQuestion } = require('../utils/schemas')

// 知识点的改名/合并/移动与等级迁移都在 service 里（多表写需要同一事务）
const knowledgeTagService = require('../services/knowledgeTag.service')
const { SUB_LEVELS, tagKeyOf } = knowledgeTagService

// 知识点标签变化不频繁，加短 TTL 缓存
const TAGS_TTL = 10000

// 读侧护栏：字面量 null/undefined 脏名不进聚合结果（写入侧与迁移已修，这里是兜底，
// 防旧备份恢复或将来漏掉的写路径把「null 二级知识点」重新摆到页面上）
const { isNullLiteralTag } = require('../utils/tagName')

// 任何改动题目/标签的写操作都要失效这三类缓存。
// 收成一个函数：原先 6 处各写三行，漏掉一处就会读到旧标签或旧统计。
const invalidateQuestionCaches = () => {
  cacheDel('questions:tags')
  cacheDel('stats:overview')
  cacheDelByPrefix('questions:analysis')
  // 分类页/卡片页的聚合结果（stats / subTags）
  cacheDelByPrefix('questions:facets:')
}

// 只读站首屏的聚合结果：stats 与 subTags 原本零缓存，每次访问都全表 GROUP BY
// （subtags 还要再查一次掌握等级）。题库 300 多题时单次很快，但家长端每个页面
// 都会重复触发，缓存 60s 收益明确。写入时由 invalidateQuestionCaches 统一失效。
const FACETS_TTL = 60000
// 只读站列表/单题：家长端会反复翻页、回看同一题；缓存窗口短，写入即失效。
const DEFAULT_LIST_LIMIT = Number(process.env.DEFAULT_LIST_LIMIT) || 1000

// 列表排序白名单：只允许这几个 key，避免 order 子句被外部拼进来。
// 每种排序都追加 id 作次级键——同难度/同时间/同题型的题很多，
// 没有次级键时数据库的返回顺序不保证稳定，翻页会出现重复或漏题。
const SORT_ORDERS = {
  // 难度可能为 NULL（未标注）。升序时 NULL 会排在最前，
  // 直接排会出现「未标注的题＝最简单的题」这种错位，
  // 所以先用 `difficulty IS NULL` 把有值的挑到前面，再按真实难度排。
  // （0 = 有值、1 = NULL，升序自然让有值的在前；SQLite 与 MySQL 行为一致。）
  difficulty_asc: [
    [sequelize.literal('difficulty IS NULL'), 'ASC'],
    ['difficulty', 'ASC'],
    ['id', 'DESC']
  ],
  difficulty_desc: [
    [sequelize.literal('difficulty IS NULL'), 'ASC'],
    ['difficulty', 'DESC'],
    ['id', 'DESC']
  ],
  created_asc: [
    ['createdAt', 'ASC'],
    ['id', 'ASC']
  ],
  created_desc: [
    ['createdAt', 'DESC'],
    ['id', 'DESC']
  ],
  // 题型顺序写死成 CASE，而不是依赖列本身的排序：
  // 这个列在 MySQL 上是 ENUM（按定义顺序排），在 SQLite 上是 TEXT（按字典序排）。
  // 两者碰巧结果一致，但那是巧合而不是保证——把「选择→填空→解答」显式写出来，
  // 换库、加题型都不用回来重新验证一遍。
  type_asc: [
    [
      sequelize.literal(
        "CASE type WHEN 'choice' THEN 1 WHEN 'fill' THEN 2 WHEN 'solve' THEN 3 ELSE 9 END"
      ),
      'ASC'
    ],
    ['id', 'DESC']
  ],
  type_desc: [
    [
      sequelize.literal(
        "CASE type WHEN 'choice' THEN 1 WHEN 'fill' THEN 2 WHEN 'solve' THEN 3 ELSE 9 END"
      ),
      'DESC'
    ],
    ['id', 'DESC']
  ]
}
const DEFAULT_ORDER = [['id', 'DESC']]

// 列表（关键词/题型/难度/知识点/二级知识点/按 id 批量检索，支持排序 + 分页）
exports.list = async (req, res, next) => {
  try {
    const {
      keyword,
      type,
      choiceMode,
      difficulty,
      knowledgeTag,
      knowledgeSubTag,
      ids,
      sort,
      page,
      pageSize
    } = req.query

    const where = {}
    if (keyword) where.title = { [Op.like]: `%${keyword}%` }
    if (type) where.type = type
    // 单选/多选子类型筛选：存量题 choice_mode 为 NULL，语义上等同单选，
    // 因此 single 要同时命中 NULL，否则老师筛「单选」会凭空少掉 319 道老题。
    if (choiceMode) {
      where.type = 'choice'
      where.choiceMode =
        choiceMode === 'multiple' ? 'multiple' : { [Op.or]: [null, 'single'] }
    }
    if (difficulty) where.difficulty = Number(difficulty)
    // 按 id 批量取（如 ids=3,7,9）：用于查看已选题目并调整顺序
    if (ids !== undefined) {
      const idList = String(ids)
        .split(',')
        .map((x) => Number(x))
        .filter((n) => Number.isInteger(n) && n > 0)
      where.id = { [Op.in]: idList.length ? idList : [-1] }
    }
    if (knowledgeTag === '__empty__') {
      // 约定值：筛选「未分类」题目（知识点为空）
      where.knowledgeTag = { [Op.or]: [null, ''] }
    } else if (knowledgeTag) {
      where.knowledgeTag = knowledgeTag
    }
    if (knowledgeSubTag === '__empty__') {
      where.knowledgeSubTag = { [Op.or]: [null, ''] }
    } else if (knowledgeSubTag) {
      where.knowledgeSubTag = knowledgeSubTag
    }

    // 未知 sort 值静默回落到默认排序，前端传错不至于报错
    const order = SORT_ORDERS[sort] || DEFAULT_ORDER

    // 传了 page 才分页；兼容旧调用方（不传 page 时仍返回数组）
    if (page !== undefined || pageSize !== undefined) {
      const pageNum = Math.max(1, Number(page) || 1)
      const size = Math.min(100, Math.max(1, Number(pageSize) || 20))
      const { rows, count } = await Question.findAndCountAll({
        where,
        order,
        limit: size,
        offset: (pageNum - 1) * size
      })
      return ok(res, { list: rows, total: count, page: pageNum, pageSize: size })
    }

    const list = await Question.findAll({ where, order, limit: DEFAULT_LIST_LIMIT })
    ok(res, list)
  } catch (e) {
    next(e)
  }
}

// 知识点卡片聚合：按一级知识点统计题目总数与各题型数量，并附带二级知识点分布
exports.stats = async (req, res, next) => {
  try {
    const { keyword } = req.query
    const cacheKey = `questions:facets:stats:${keyword || ''}`
    const cached = cacheGet(cacheKey)
    if (cached) return ok(res, cached)

    const where = {}
    if (keyword) where.title = { [Op.like]: `%${keyword}%` }

    const rows = await Question.findAll({
      attributes: [
        'knowledgeTag',
        'knowledgeSubTag',
        'type',
        'choiceMode',
        [Question.sequelize.fn('COUNT', Question.sequelize.col('id')), 'count']
      ],
      where,
      group: ['knowledgeTag', 'knowledgeSubTag', 'type', 'choiceMode'],
      raw: true
    })

    const map = new Map()
    for (const r of rows) {
      const rawTag = r.knowledgeTag || '__empty__'
      if (!map.has(rawTag)) {
        map.set(rawTag, {
          tag: rawTag,
          label: r.knowledgeTag || '未分类',
          total: 0,
          choice: 0,
          choiceSingle: 0,
          choiceMultiple: 0,
          fill: 0,
          solve: 0,
          subTags: []
        })
      }
      const item = map.get(rawTag)
      const count = Number(r.count) || 0
      item.total += count
      if (r.type === 'choice') {
        item.choice += count
        // NULL = 未区分，按单选计（与筛选、排版的分组口径保持一致）
        if (r.choiceMode === 'multiple') item.choiceMultiple += count
        else item.choiceSingle += count
      }
      else if (r.type === 'fill') item.fill += count
      else if (r.type === 'solve') item.solve += count

      // 二级知识点分布（仅统计有值的；字面量 null 脏名不计入，见 tagName.js）
      if (r.knowledgeSubTag && !isNullLiteralTag(r.knowledgeSubTag)) {
        const sub = item.subTags.find((s) => s.name === r.knowledgeSubTag)
        if (sub) sub.total += count
        else item.subTags.push({ name: r.knowledgeSubTag, total: count })
      }
    }

    for (const item of map.values()) {
      item.subTags.sort((a, b) => b.total - a.total)
    }

    const stats = [...map.values()].sort((a, b) => b.total - a.total)
    cacheSet(cacheKey, stats, FACETS_TTL)
    ok(res, stats)
  } catch (e) {
    next(e)
  }
}

// 某一级知识点下的二级知识点列表（带题量，供筛选与级联下拉使用）
exports.subTags = async (req, res, next) => {
  try {
    const { knowledgeTag } = req.query
    const cacheKey = `questions:facets:subtags:${knowledgeTag || 'all'}`
    const cached = cacheGet(cacheKey)
    if (cached) return ok(res, cached)

    const where = { knowledgeSubTag: { [Op.ne]: null, [Op.ne]: '' } }
    if (knowledgeTag === '__empty__') {
      where.knowledgeTag = { [Op.or]: [null, ''] }
    } else if (knowledgeTag) {
      where.knowledgeTag = knowledgeTag
    } else {
      // 未指定一级知识点：统计全部二级知识点（一般不会用到）
    }

    const rows = await Question.findAll({
      attributes: [
        'knowledgeSubTag',
        [Question.sequelize.fn('COUNT', Question.sequelize.col('id')), 'count']
      ],
      where,
      group: ['knowledgeSubTag'],
      order: [[Question.sequelize.fn('COUNT', Question.sequelize.col('id')), 'DESC']],
      raw: true
    })
    const subs = rows
      .filter((r) => r.knowledgeSubTag && !isNullLiteralTag(r.knowledgeSubTag))
      .map((r) => ({ name: r.knowledgeSubTag, total: Number(r.count) || 0 }))
    // 附上掌握等级（基础/中等/进阶），前端据此给二级知识点上色区分；没设过等级的为 null
    if (subs.length) {
      const levelRows = await KnowledgeSubLevel.findAll({
        where: { tag: tagKeyOf(knowledgeTag) },
        raw: true
      })
      const levelMap = new Map(levelRows.map((r) => [r.name, r.level]))
      for (const s of subs) s.level = levelMap.get(s.name) || null
    }
    cacheSet(cacheKey, subs, FACETS_TTL)
    ok(res, subs)
  } catch (e) {
    next(e)
  }
}

// 设置二级知识点的掌握等级：body { knowledgeTag, name, level }
// level 传空（null / ''）表示取消等级；前端侧栏的小圆点下拉就是调这个接口
exports.setSubLevel = async (req, res, next) => {
  try {
    const { knowledgeTag, name, level } = req.body || {}
    const subName = name == null ? '' : String(name).trim()
    if (!subName) return fail(res, 40000, '二级知识点名称不能为空')
    if (subName.length > 100) return fail(res, 40000, '二级知识点名称不能超过 100 字')

    const nextLevel = level == null || level === '' ? null : String(level)
    if (nextLevel && !SUB_LEVELS.includes(nextLevel)) {
      return fail(res, 40000, '等级只能是 basic（基础）/ medium（中等）/ advanced（进阶）')
    }

    const result = await knowledgeTagService.setSubLevel({
      tag: tagKeyOf(knowledgeTag),
      name: subName,
      level: nextLevel
    })
    ok(res, result, nextLevel ? '等级已更新' : '已取消等级')
  } catch (e) {
    next(e)
  }
}

// 一级知识点列表（带短 TTL 缓存）。写入题目时会主动失效，因此读到的不会太旧。
exports.tags = async (req, res, next) => {
  try {
    const cacheKey = 'questions:tags'
    const cached = cacheGet(cacheKey)
    if (cached) return ok(res, cached)

    const rows = await Question.findAll({
      attributes: ['knowledgeTag'],
      where: { knowledgeTag: { [Op.ne]: null, [Op.ne]: '' } },
      group: ['knowledgeTag'],
      order: [['knowledgeTag', 'ASC']]
    })
    const tags = rows
      .map((r) => r.knowledgeTag)
      .filter((t) => Boolean(t) && !isNullLiteralTag(t))
    cacheSet(cacheKey, tags, TAGS_TTL)
    ok(res, tags)
  } catch (e) {
    next(e)
  }
}

// 「已做过」数据源：所有作业选过的题目 id。
// 只统计作业口径——讲义插入的是可编辑副本、不留题目 id，无法追溯。
exports.usedIds = async (req, res, next) => {
  try {
    // 「已做过」数据源：所有作业选过的题目（HomeworkQuestion 关联表）。
    // 讲义插入的是可编辑副本、不保留题目 id，无法追溯，只统计作业口径。
    const rows = await HomeworkQuestion.findAll({
      attributes: [[sequelize.fn('DISTINCT', sequelize.col('question_id')), 'questionId']],
      raw: true
    })
    ok(
      res,
      rows.map((r) => r.questionId)
    )
  } catch (e) {
    next(e)
  }
}

// 新建题目。写完立刻失效题库相关缓存。
exports.create = async (req, res, next) => {
  try {
    const { values: payload, error } = parseQuestion(req.body)
    if (error) return fail(res, 40000, error)
    const question = await Question.create(payload)
    invalidateQuestionCaches()
    ok(res, question, '创建成功')
  } catch (e) {
    next(e)
  }
}

// 取单题。
exports.get = async (req, res, next) => {
  try {
    const question = await Question.findByPk(req.params.id)
    if (!question) return fail(res, 40400, '题目不存在')
    ok(res, question)
  } catch (e) {
    next(e)
  }
}

// 改题。同样要失效缓存。
exports.update = async (req, res, next) => {
  try {
    const question = await Question.findByPk(req.params.id)
    if (!question) return fail(res, 40400, '题目不存在')
    const { values: payload, error } = parseQuestion(req.body, { partial: true })
    if (error) return fail(res, 40000, error)
    await question.update(payload)
    invalidateQuestionCaches()
    ok(res, question, '更新成功')
  } catch (e) {
    next(e)
  }
}

// 删题前必须清掉作业-题目关联：homework_questions.questionId 是非空外键，裸删会留孤儿行。
exports.remove = async (req, res, next) => {
  try {
    const question = await Question.findByPk(req.params.id)
    if (!question) return fail(res, 40400, '题目不存在')

    // 删题目要一并清掉作业-题目关联：homework_questions.questionId 是非空外键，
    // 库里没开外键校验（外包 MySQL 常见）时裸删会留下孤儿行，之后导出的备份
    // 换到有外键的库恢复就会整包失败。顺手把影响面告诉老师，避免静默改动作业。
    let removedLinks = 0
    let removedPaperLinks = 0
    await sequelize.transaction(async (t) => {
      removedLinks = await HomeworkQuestion.destroy({
        where: { questionId: question.id },
        transaction: t
      })
      // 试卷关联同理：留着会变成点开试卷才发现少一道题的空洞
      removedPaperLinks = await PaperQuestion.destroy({
        where: { questionId: question.id },
        transaction: t
      })
      await question.destroy({ transaction: t })
    })

    invalidateQuestionCaches()
    const notes = []
    if (removedLinks) notes.push(`从 ${removedLinks} 份作业中移除`)
    if (removedPaperLinks) notes.push(`从 ${removedPaperLinks} 份试卷中移除`)
    ok(res, null, notes.length ? `删除成功，同时${notes.join('，')}该题` : '删除成功')
  } catch (e) {
    next(e)
  }
}

// 重命名一级知识点（题库名）：把该知识点下所有题目的 knowledgeTag 更新为新名称。
// 二级知识点（knowledgeSubTag）随题目一起保留，不做改动。
exports.renameTag = async (req, res, next) => {
  try {
    const { from, to } = req.body || {}
    const fromName = from == null ? '' : String(from).trim()
    const toName = to == null ? '' : String(to).trim()
    if (!fromName) return fail(res, 40000, '原知识点名称不能为空')
    if (!toName) return fail(res, 40000, '新知识点名称不能为空')
    if (toName.length > 100) return fail(res, 40000, '知识点名称不能超过 100 字')
    if (fromName === toName) return ok(res, { updated: 0 }, '名称未变化')

    // 题目上的 knowledgeTag 与等级表的 tag 必须在同一事务里一起改：
    // 只改前者会让该题库下所有二级知识点的掌握等级变成孤儿（颜色全丢）。
    const { updated } = await knowledgeTagService.renamePrimaryTag({ from: fromName, to: toName })
    invalidateQuestionCaches()
    ok(res, { updated }, `已更新 ${updated} 道题目`)
  } catch (e) {
    next(e)
  }
}

// —— 一级知识点标记（题库页置顶 + 高亮）——
// 标记是按知识点名存的浏览偏好，和题目的统计缓存无关：
// stats 里不带标记，前端单独取一次，因此取消/设置标记都不需要失效 facets 缓存。

exports.tagMarks = async (req, res, next) => {
  try {
    ok(res, await knowledgeTagService.listTagMarks())
  } catch (e) {
    next(e)
  }
}

// 置顶标记一级知识点（题库页高亮）。名称长度设上限，避免用超长串把侧栏撑坏。
exports.setTagMark = async (req, res, next) => {
  try {
    const { tag, marked } = req.body || {}
    const name = tag == null ? '' : String(tag).trim()
    if (!name) return fail(res, 40000, '知识点名称不能为空')
    if (name.length > 100) return fail(res, 40000, '知识点名称不能超过 100 字')

    const result = await knowledgeTagService.setTagMark({ tag: name, marked: marked === true })
    ok(res, result, result.marked ? '已标记' : '已取消标记')
  } catch (e) {
    next(e)
  }
}

// 编辑二级知识点：重命名 / 合并到已有二级知识点 / 移回未分类（删除），
// 并可选择同时更换它所属的一级知识点（即整组题目换题库）。
//
// 二级知识点是以题目上的字符串 knowledgeSubTag 聚合出来的，没有独立表，
// 因此「编辑二级知识点」= 批量更新其下所有题目的 knowledgeSubTag。
//
// 参数：
//   from           原二级知识点名称（必填）
//   to             新名称；不传 = 不改名称；传空串 / null = 移回未分类（等效删除该二级知识点）
//   knowledgeTag   限定作用的一级知识点；'__empty__' 表示未分类题库；不传 = 全部题库
//   toKnowledgeTag 同时更换所属一级知识点；传 null/'' 表示改为未分类；不传 = 不更换
exports.updateSubTag = async (req, res, next) => {
  try {
    const { from, to, knowledgeTag, toKnowledgeTag } = req.body || {}

    const fromName = from == null ? '' : String(from).trim()
    if (!fromName) return fail(res, 40000, '原二级知识点名称不能为空')

    // 改名与换归属各自独立：只有显式传了该字段才动它，
    // 否则「只想换题库」的调用会把二级知识点顺手清空。
    const renameSub = to !== undefined
    const toName = to == null ? '' : String(to).trim()
    if (toName.length > 100) return fail(res, 40000, '二级知识点名称不能超过 100 字')

    const moveParent = toKnowledgeTag !== undefined
    const parentName = toKnowledgeTag == null ? '' : String(toKnowledgeTag).trim()
    if (parentName.length > 100) return fail(res, 40000, '一级知识点名称不能超过 100 字')

    if (!renameSub && !moveParent) {
      return ok(res, { updated: 0, cleared: false }, '没有需要修改的内容')
    }
    if (renameSub && toName === fromName && !moveParent) {
      return ok(res, { updated: 0, cleared: false }, '名称未变化')
    }

    const result = await knowledgeTagService.updateSubTag({
      from: fromName,
      to: renameSub ? toName : undefined,
      knowledgeTag,
      toKnowledgeTag: moveParent ? parentName : undefined
    })

    if (!result.matched) {
      return ok(res, { updated: 0, cleared: false }, `未找到二级知识点「${fromName}」`)
    }
    invalidateQuestionCaches()

    const target = moveParent ? `题库「${parentName || '未分类'}」` : ''
    let message
    if (renameSub && !toName) {
      message = `已删除二级知识点「${fromName}」，${result.matched} 道题移回未分类`
    } else if (renameSub && moveParent) {
      message = `已将「${fromName}」更新为「${toName}」并移入${target}，共 ${result.matched} 道题`
    } else if (renameSub) {
      message = `已将「${fromName}」更新为「${toName}」，共 ${result.matched} 道题`
    } else {
      message = `已将二级知识点「${fromName}」移入${target}，共 ${result.matched} 道题`
    }

    ok(res, { updated: result.matched, cleared: result.cleared }, message)
  } catch (e) {
    next(e)
  }
}

// 批量判难度的候选清单：只回必要字段。
// 不直接复用列表接口——那会带整篇题干 HTML，判定一批 300 道题时白传好几 MB。
// scope：unrated（未标注）| suspicious（3 星，历史默认值污染）| all
exports.difficultyCandidates = async (req, res, next) => {
  try {
    const scope = String(req.query.scope || 'unrated')
    const where = {}
    if (scope === 'unrated') where.difficulty = { [Op.is]: null }
    else if (scope === 'suspicious') where.difficulty = 3

    // 可选筛选：题型（choice 需再分单选/多选）。与分析页的 kind 下拉同口径，
    // 让「AI 批量判难度」能只跑某一类题（例如只判解答题）。
    const type = String(req.query.type || '').trim()
    const choiceMode = String(req.query.choiceMode || '').trim()
    if (type) {
      where.type = type
      if (type === 'choice' && choiceMode) where.choiceMode = choiceMode === 'multiple' ? 'multiple' : 'single'
    }

    const [total, rows] = await Promise.all([
      Question.count({ where }),
      Question.findAll({
        where,
        attributes: ['id', 'title', 'type', 'choiceMode', 'difficulty', 'knowledgeTag'],
        order: [['id', 'ASC']],
        limit: 500
      })
    ])

    // 富文本转纯文本摘要（80 字），供难度候选清单展示。
    const strip = (html) =>
      String(html || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&[a-z]+;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80)

    ok(res, {
      total,
      list: rows.map((r) => ({
        id: Number(r.id),
        title: strip(r.title),
        type: r.type,
        choiceMode: r.choiceMode,
        difficulty: r.difficulty == null ? null : Number(r.difficulty),
        knowledgeTag: r.knowledgeTag
      }))
    })
  } catch (e) {
    next(e)
  }
}

// 难度分析：一次聚合查询 + 内存归并，供 /questions/analysis 使用。
//
// 为什么不在 SQL 里算平均/覆盖率：MySQL 的 AVG 会忽略 NULL，
// 而这里的 NULL 是「未标注」，必须与「1 星」严格区分开——所以要在 JS 里按桶累加，
// 顺带把「未标注」单独成桶，前端才能画灰柱而不是把它当成 0 星。
exports.analysis = async (req, res, next) => {
  try {
    const { knowledgeTag, type, choiceMode, keyword } = req.query
    const cacheKey = `questions:analysis:${knowledgeTag || ''}:${type || ''}:${choiceMode || ''}:${keyword || ''}`
    const cached = cacheGet(cacheKey)
    if (cached) return ok(res, cached)

    const where = {}
    if (keyword) where.title = { [Op.like]: `%${keyword}%` }
    if (type) where.type = type
    if (choiceMode) {
      where.type = 'choice'
      where.choiceMode =
        choiceMode === 'multiple' ? 'multiple' : { [Op.or]: [null, 'single'] }
    }
    if (knowledgeTag === '__empty__') where.knowledgeTag = { [Op.or]: [null, ''] }
    else if (knowledgeTag) where.knowledgeTag = knowledgeTag

    const rows = await Question.findAll({
      attributes: [
        'knowledgeTag',
        'type',
        'difficulty',
        [Question.sequelize.fn('COUNT', Question.sequelize.col('id')), 'count']
      ],
      where,
      group: ['knowledgeTag', 'type', 'difficulty'],
      raw: true
    })

    const diffBuckets = new Map() // key: 'null' | '1'..'5'
    const typeDiff = new Map() // `${type}|${d}` → count
    const typeTotals = new Map()
    const knowledgeDiff = new Map() // tag → Map(level → count)
    const knowledgeTotals = new Map()

    let total = 0
    let rated = 0
    let diffSum = 0

    for (const r of rows) {
      const count = Number(r.count) || 0
      if (!count) continue
      const level = r.difficulty == null ? null : Number(r.difficulty)
      const key = level == null ? 'null' : String(level)

      total += count
      if (level != null) {
        rated += count
        diffSum += level * count
      }

      diffBuckets.set(key, (diffBuckets.get(key) || 0) + count)
      typeDiff.set(`${r.type}|${key}`, (typeDiff.get(`${r.type}|${key}`) || 0) + count)
      typeTotals.set(r.type, (typeTotals.get(r.type) || 0) + count)

      const tag = r.knowledgeTag || ''
      knowledgeTotals.set(tag, (knowledgeTotals.get(tag) || 0) + count)
      if (!knowledgeDiff.has(tag)) knowledgeDiff.set(tag, new Map())
      const m = knowledgeDiff.get(tag)
      m.set(key, (m.get(key) || 0) + count)
    }

    const levelKeys = ['1', '2', '3', '4', '5', 'null']
    const byDifficulty = levelKeys.map((k) => ({
      difficulty: k === 'null' ? null : Number(k),
      count: diffBuckets.get(k) || 0
    }))

    const types = ['choice', 'fill', 'solve']
    const byTypeDifficulty = []
    for (const t of types) {
      for (const k of levelKeys) {
        const count = typeDiff.get(`${t}|${k}`) || 0
        if (count) byTypeDifficulty.push({ type: t, difficulty: k === 'null' ? null : Number(k), count })
      }
    }

    // 知识点 Top 12：分析页只画得下这么多，超出会挤成标签重叠
    const topTags = [...knowledgeTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([tag, count]) => ({ tag, label: tag || '未分类', total: count }))

    const byKnowledgeDifficulty = []
    for (const { tag, label } of topTags) {
      const m = knowledgeDiff.get(tag) || new Map()
      const item = { tag, label, total: 0, levels: {} }
      for (const k of levelKeys) {
        const count = m.get(k) || 0
        item.levels[k === 'null' ? 'null' : k] = count
        item.total += count
      }
      byKnowledgeDifficulty.push(item)
    }

    const payload = {
      total,
      rated,
      unrated: total - rated,
      avgDifficulty: rated ? Math.round((diffSum / rated) * 100) / 100 : null,
      byDifficulty,
      byTypeDifficulty,
      byType: types.map((t) => ({ type: t, count: typeTotals.get(t) || 0 })),
      byKnowledgeDifficulty
    }

    cacheSet(cacheKey, payload, TAGS_TTL)
    ok(res, payload)
  } catch (e) {
    next(e)
  }
}
