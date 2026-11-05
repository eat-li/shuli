// 考试类型字典路由
const router = require('express').Router()
const c = require('../controllers/examType.controller')

router.get('/', c.list)
router.post('/', c.create)
router.patch('/:key', c.update)
router.delete('/:key', c.remove)

module.exports = router
