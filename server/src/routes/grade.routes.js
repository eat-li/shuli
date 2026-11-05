// 测评成绩路由
const router = require('express').Router()
const c = require('../controllers/grade.controller')

router.get('/summary', c.summary) // 注意：需在 /:id 之前注册
router.get('/cards', c.cards) // 注意：需在 /:id 之前注册
router.get('/', c.list)
router.post('/', c.create)
router.post('/import', c.import)
router.get('/:id', c.get)
router.patch('/:id', c.update)
router.delete('/:id', c.remove)

module.exports = router
