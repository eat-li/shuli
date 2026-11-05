// 图片上传路由（multipart/form-data，内存中转，不上传 base64）
const router = require('express').Router()
const multer = require('multer')
const c = require('../controllers/upload.controller')

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
})

router.post('/', upload.single('file'), c.upload)

module.exports = router
