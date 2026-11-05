// 图形库路由（图片本体内体仍走 POST /upload 存 OSS）
const router = require('express').Router()
const c = require('../controllers/figure.controller')

router.get('/', c.list)
router.post('/', c.create)
router.patch('/:id', c.update)
router.delete('/:id', c.remove)

module.exports = router
