// 资料库路由：上传走 multipart（内存中转后直传 OSS），其余是元数据操作
const router = require('express').Router()
const multer = require('multer')
const c = require('../controllers/resource.controller')
const { fail } = require('../utils/response')

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  // multer 默认按 latin1 解析 multipart 头里的文件名，中文会变成乱码；
  // 浏览器实际发送的是 UTF-8，这里显式声明。
  defParamCharset: 'utf8'
})

// multer 的体积错误默认会变成 500；这里翻成可读的业务错误
const singleFile = (req, res, next) =>
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return fail(res, 40000, '文件不能超过 50MB')
      return fail(res, 40000, '上传失败：' + (err.message || '文件不合法'))
    }
    next()
  })

router.get('/', c.list)
router.get('/batch-download', c.batchDownload)
router.post('/upload', singleFile, c.upload)
router.patch('/:id', c.update)
router.delete('/:id', c.remove)

module.exports = router
