// 全局错误处理中间件
const isProd = process.env.NODE_ENV === 'production'

module.exports = (err, req, res, _next) => {
  console.error('[Error]', err)

  const status = err.status || 500
  // 生产环境不向客户端暴露内部错误详情
  const message = isProd && status >= 500 ? '服务器内部错误' : err.message || '服务器内部错误'

  res.status(status).json({
    code: status === 500 ? 50000 : status * 100,
    message,
    data: null
  })
}
