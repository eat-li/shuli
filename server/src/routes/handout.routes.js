// 讲义路由
const router = require('express').Router()
const c = require('../controllers/handout.controller')

router.get('/', c.list)
router.post('/', c.create)
router.get('/:id/items', c.getItems) // 讲义内容解析（题目/结论/知识点完整数据，供预览与导出）
router.get('/:id', c.get)
router.patch('/:id', c.update)
router.delete('/:id', c.remove)

module.exports = router
