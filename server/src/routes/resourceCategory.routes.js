// 资料分类路由
const router = require('express').Router()
const c = require('../controllers/resourceCategory.controller')

router.get('/', c.list)
router.post('/', c.create)
router.patch('/:id', c.update)
router.delete('/:id', c.remove)

module.exports = router
