// 学生路由
const router = require('express').Router()
const c = require('../controllers/student.controller')

router.get('/', c.list)
router.get('/export', c.export)
router.post('/import', c.import)
router.post('/', c.create)
router.get('/:id', c.get)
router.patch('/:id', c.update)
router.delete('/:id', c.remove)

module.exports = router
