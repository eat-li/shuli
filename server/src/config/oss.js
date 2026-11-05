// 阿里云 OSS 客户端配置（凭证从环境变量读取，不写入代码）
//
// 延迟初始化：原先在模块加载时就 new Client，缺 Key 会直接抛异常，
// 后果是「没配 OSS 的人连服务都起不来」——题库、成绩这些根本不上传文件的页面也用不了。
// 现在改成首次使用时才建客户端，并把错误换成一句能照着做的提示。
//
// 注：本文件只被 storage/oss.js 使用。默认驱动是本地磁盘（storage/local.js），
// 只有 STORAGE_DRIVER=oss 时才会走到这里。
const OSS = require('ali-oss')
require('dotenv').config()

// 公开访问基地址（读图、下载直链都拼它）
const BASE_URL =
  process.env.OSS_BASE_URL ||
  `https://${process.env.OSS_BUCKET || 'unset'}.${process.env.OSS_REGION || 'unset'}.aliyuncs.com`

const MISSING_CONFIG_HINT =
  '未配置对象存储：请在 server/.env 填写 OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET / ' +
  'OSS_BUCKET / OSS_REGION；或者把 STORAGE_DRIVER 改回 local 用本地磁盘存储。'

let instance = null

/** 取（或创建）OSS 客户端；未配置时抛出可读错误，而不是让进程崩在 require 阶段 */
function requireClient() {
  if (instance) return instance
  const accessKeyId = String(process.env.OSS_ACCESS_KEY_ID || '').trim()
  const accessKeySecret = String(process.env.OSS_ACCESS_KEY_SECRET || '').trim()
  const bucket = String(process.env.OSS_BUCKET || '').trim()
  const region = String(process.env.OSS_REGION || '').trim()
  if (!accessKeyId || !accessKeySecret || !bucket || !region) {
    const err = new Error(MISSING_CONFIG_HINT)
    err.status = 503
    // expose：生产环境也要把这句话原样回给客户端——它说的是「该去改哪个文件」，
    // 不是内部实现细节。
    err.expose = true
    throw err
  }
  instance = new OSS({ region, accessKeyId, accessKeySecret, bucket })
  return instance
}

// 只暴露业务实际用到的三个方法。刻意不做成 Proxy：
// Proxy 会把属性访问的语义藏起来，调试时很难看出「这行到底有没有真的连上 OSS」。
const client = {
  put: (...args) => requireClient().put(...args),
  delete: (...args) => requireClient().delete(...args),
  getStream: (...args) => requireClient().getStream(...args)
}

module.exports = { client, BASE_URL }
