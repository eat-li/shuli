// 全局错误处理中间件
const isProd = process.env.NODE_ENV === 'production'

module.exports = (err, req, res, _next) => {
  console.error('[Error]', err)

  const status = err.status || 500
  // 生产环境不向客户端暴露内部错误详情。
  // 但 err.expose=true 的属于「给运维看的可操作提示」（例如对象存储未配置），
  // 这类信息藏着只会让人对着「服务器内部错误」猜，必须放行。
  const message =
    isProd && status >= 500 && !err.expose ? '服务器内部错误' : err.message || '服务器内部错误'

  res.status(status).json({
    code: status === 500 ? 50000 : status * 100,
    message,
    data: null
  })
}
