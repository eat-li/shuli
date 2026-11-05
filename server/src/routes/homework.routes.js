// 作业路由（无学生在线提交，仅老师发布作业与录入成绩）
const router = require('express').Router()
const c = require('../controllers/homework.controller')

router.get('/', c.list)
router.post('/', c.create)
router.post('/bulk-delete', c.bulkRemove) // 批量删除（须在 /:id 之前声明）
router.get('/:id/questions', c.getQuestions) // 作业题目详情（导出用）
router.post('/:id/questions', c.appendQuestions) // 追加题目（题库页「加入作业」，只增不删）
router.get('/:id', c.get)
router.patch('/:id', c.update)
router.delete('/:id', c.remove)
router.put('/:id/scores', c.score) // 老师录入成绩

module.exports = router
