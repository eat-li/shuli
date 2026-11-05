// 统一响应包络 { code, message, data }
const ok = (res, data = null, message = 'ok') => res.json({ code: 0, message, data })

// 业务失败响应。默认仍是 HTTP 200 + code!=0：只有鉴权、限流、未捕获异常才改状态码，
// 前端拦截器据此统一弹提示。
const fail = (res, code = 50000, message = 'error') => res.json({ code, message, data: null })

module.exports = { ok, fail }
