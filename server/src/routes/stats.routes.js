// 首页统计路由
const router = require('express').Router()
const c = require('../controllers/stats.controller')

router.get('/', c.overview)

module.exports = router
