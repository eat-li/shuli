// 知识点分类路由
const router = require('express').Router()
const c = require('../controllers/category.controller')

router.get('/', c.list)
router.post('/', c.create)
router.put('/:id', c.update)
router.delete('/:id', c.remove)

module.exports = router
