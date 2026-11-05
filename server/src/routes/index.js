// 路由汇总挂载（新增模块在此追加一行）
//
// 本版本为单用户自托管：**没有鉴权层**，所有业务接口直接挂载。
// 因此部署时必须只监听本机回环地址（见 src/index.js 的 HOST 默认值），
// 否则同一局域网内任何人都能读写你的题库。
const router = require('express').Router()

router.use('/students', require('./student.routes'))
router.use('/questions', require('./question.routes'))
router.use('/homeworks', require('./homework.routes'))
router.use('/upload', require('./upload.routes'))
router.use('/backup', require('./backup.routes'))
router.use('/stats', require('./stats.routes'))
router.use('/ai', require('./ai.routes'))
router.use('/grades', require('./grade.routes'))
router.use('/categories', require('./category.routes'))
router.use('/homework-categories', require('./homeworkCategory.routes'))
router.use('/conclusions', require('./conclusion.routes'))
router.use('/handouts', require('./handout.routes'))
router.use('/figures', require('./figure.routes'))
router.use('/summaries', require('./summary.routes'))
router.use('/papers', require('./paper.routes'))
router.use('/resources', require('./resource.routes'))
router.use('/resource-categories', require('./resourceCategory.routes'))
router.use('/exam-types', require('./examType.routes'))

module.exports = router
