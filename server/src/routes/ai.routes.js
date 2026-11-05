// AI 功能路由
const router = require('express').Router()
const c = require('../controllers/ai.controller')

router.get('/config', c.config)
router.post('/format', c.format)
router.post('/answer', c.generateAnswer)
router.post('/lesson-summary', c.lessonSummary)
// 结论生成只保留流式版本：非流式的 POST /conclusion 已下线（前端零调用，见 ai.controller.js 注释）
router.post('/conclusion/stream', c.generateConclusionStream)
// 从题库选题组卷：只挑选已有题目，不生成新题
router.post('/compose-paper', c.composePaper)
// AI 判难度：返回建议值与理由，不写库（由前端确认后走 PATCH /questions/:id）
router.post('/judge-difficulty', c.judgeDifficulty)

module.exports = router
