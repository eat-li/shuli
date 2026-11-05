// 首页统计控制器
const { Op } = require('sequelize')
const { Question, Student, Homework, Submission } = require('../models')
const { ok } = require('../utils/response')
const { cacheGet, cacheSet } = require('../utils/cache')

// 统计接口聚合多张表，结果变化不频繁，加短 TTL 缓存降低数据库压力
const STATS_TTL = 10000

// 首页概览：题量 / 学生数 / 作业数 / 提交数与近期待办。
// 聚合多表且结果变化不频繁，用 10 秒缓存压低数据库压力；待办计数与「取前 3 条展示」分开查，保证角标数字是全量。
exports.overview = async (req, res, next) => {
  try {
    const cacheKey = 'stats:overview'
    const cached = cacheGet(cacheKey)
    if (cached) return ok(res, cached)

    const [questionCount, studentCount, homeworkCount, submissionCount] = await Promise.all([
      Question.count(),
      Student.count(),
      Homework.count(),
      Submission.count()
    ])

    // 首页待办：近 7 天截止的已发布作业 + 未设截止时间的作业。
    // 计数与「取前几条展示」分开查：列表只取 3 条做摘要，计数仍是全量。
    const now = new Date()
    const weekLater = new Date(now.getTime() + 7 * 86400000)
    const upcomingWhere = {
      status: 'published',
      endAt: { [Op.gte]: now, [Op.lte]: weekLater }
    }
    const [upcomingCount, upcoming, noDeadlineCount] = await Promise.all([
      Homework.count({ where: upcomingWhere }),
      Homework.findAll({
        where: upcomingWhere,
        attributes: ['id', 'title', 'endAt'],
        order: [['endAt', 'ASC']],
        limit: 3,
        raw: true
      }),
      Homework.count({ where: { endAt: null } })
    ])

    // 题型分布
    const byType = await Question.findAll({
      attributes: ['type', [Question.sequelize.fn('COUNT', Question.sequelize.col('id')), 'count']],
      group: ['type'],
      raw: true
    })

    // 难度分布
    const byDifficulty = await Question.findAll({
      attributes: [
        'difficulty',
        [Question.sequelize.fn('COUNT', Question.sequelize.col('id')), 'count']
      ],
      group: ['difficulty'],
      raw: true
    })

    // 知识点分布（按数量取前 10）
    const byKnowledge = await Question.findAll({
      attributes: [
        'knowledgeTag',
        [Question.sequelize.fn('COUNT', Question.sequelize.col('id')), 'count']
      ],
      where: { knowledgeTag: { [Op.ne]: null, [Op.ne]: '' } },
      group: ['knowledgeTag'],
      order: [[Question.sequelize.fn('COUNT', Question.sequelize.col('id')), 'DESC']],
      limit: 10,
      raw: true
    })

    const payload = {
      counts: { questionCount, studentCount, homeworkCount, submissionCount },
      todo: { upcomingCount, upcoming, noDeadlineCount },
      byType,
      byDifficulty,
      byKnowledge
    }
    cacheSet(cacheKey, payload, STATS_TTL)
    ok(res, payload)
  } catch (e) {
    next(e)
  }
}
