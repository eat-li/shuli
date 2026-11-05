// 结论路由
const router = require('express').Router()
const c = require('../controllers/conclusion.controller')

router.get('/', c.list)
// 必须排在 '/:id' 之前，否则 "category-counts" 会被当成 id 匹配掉
router.get('/category-counts', c.categoryCounts)
router.post('/', c.create)
router.get('/:id', c.get)
router.put('/:id', c.update)
router.delete('/:id', c.remove)
router.patch('/:id/status', c.updateStatus)

module.exports = router
