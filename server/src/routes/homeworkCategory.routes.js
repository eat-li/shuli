// 作业分类路由（一级分类的增删改查 + 每类作业数）
const router = require('express').Router()
const c = require('../controllers/homeworkCategory.controller')

router.get('/', c.list)
router.post('/', c.create)
// 具体路径要写在 /:id 之前，避免被通配路由先吃掉（与作业路由同样的约定）
router.put('/:id/default', c.setDefault)
router.put('/:id', c.update)
router.delete('/:id', c.remove)

module.exports = router
