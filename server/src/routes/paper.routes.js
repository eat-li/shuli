// 试卷路由：挂在 requireAuth 之后（见 routes/index.js），全部需要管理员令牌
const router = require('express').Router()
const c = require('../controllers/paper.controller')

router.get('/', c.list)
router.post('/', c.create)
router.get('/:id', c.get)
router.put('/:id', c.update)
router.delete('/:id', c.remove)
router.post('/:id/duplicate', c.duplicate)

module.exports = router
