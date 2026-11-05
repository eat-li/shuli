// 题库路由
const router = require('express').Router()
const c = require('../controllers/question.controller')

router.get('/', c.list)
router.get('/tags', c.tags)
router.get('/subtags', c.subTags)
router.get('/stats', c.stats)
// 难度分析聚合：必须放在 /:id 之前，否则会被当成题目 id 匹配
router.get('/analysis', c.analysis)
// 批量判难度的候选清单（同样要在 /:id 之前）
router.get('/difficulty-candidates', c.difficultyCandidates)
// 已被作业选过的题目 id 集合（「已做过」标记数据源）——放在 /:id 之前
router.get('/used-ids', c.usedIds)
router.patch('/rename-tag', c.renameTag)
router.patch('/update-subtag', c.updateSubTag)
// 一级知识点标记（题库页置顶高亮）——同样放在 /:id 之前
router.get('/tag-marks', c.tagMarks)
router.patch('/tag-mark', c.setTagMark)
// 设置二级知识点的掌握等级（基础/中等/进阶）——放在 /:id 之前，避免被当成 id 匹配
router.patch('/subtag-level', c.setSubLevel)
router.post('/', c.create)
router.get('/:id', c.get)
router.patch('/:id', c.update)
router.delete('/:id', c.remove)

module.exports = router
