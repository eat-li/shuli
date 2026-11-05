// 课时总结路由
const router = require('express').Router()
const c = require('../controllers/summary.controller')

router.get('/', c.list)
router.post('/', c.create)
router.get('/:id', c.get)
router.patch('/:id', c.update)
router.delete('/:id', c.remove)

module.exports = router
