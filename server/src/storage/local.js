// 本地磁盘存储驱动（默认）
//
// 文件落在 STORAGE_LOCAL_DIR（默认 server/data/uploads）下，key 即是相对路径，
// 与 OSS 的对象 key 完全同构——所以「本地 ↔ 远端」迁移只是搬运同名文件。
//
// URL 默认是**相对路径** `/uploads/<key>`，而不是拼上域名的绝对地址：
// 绝对地址一旦写错（比如写成本机局域网 IP），换个网络环境图片就全裂，
// 而这种错误在开发机上永远复现不出来。
const fs = require('fs')
const path = require('path')

// 相对路径以 server/ 为基准解析，而不是进程 CWD——
// 否则从仓库根目录启动和从 server/ 启动会落到两个不同的目录，图片"时有时无"。
const SERVER_ROOT = path.resolve(__dirname, '../..')
const CONFIGURED_DIR = String(process.env.STORAGE_LOCAL_DIR || '').trim()
const ROOT = CONFIGURED_DIR
  ? path.resolve(SERVER_ROOT, CONFIGURED_DIR)
  : path.join(SERVER_ROOT, 'data/uploads')
// 对外 URL 前缀，与 app.js 里挂载的静态目录保持一致
const URL_PREFIX = '/uploads'
const PUBLIC_BASE = String(process.env.STORAGE_PUBLIC_BASE_URL || '').replace(/\/+$/, '')
const PREFIX = String(process.env.STORAGE_PATH_PREFIX || '')
  .trim()
  .replace(/^\/+|\/+$/g, '')

const withPrefix = (key) => (PREFIX ? `${PREFIX}/${key}` : key)

/**
 * key → 绝对路径，并挡住路径穿越。
 * key 来自请求（上传接口按日期+UUID 生成，但删除/读取接口的 key 来自数据库），
 * 不校验就能用 `../../.env` 读到任意文件。
 */
function resolveSafe(key) {
  const full = path.resolve(ROOT, withPrefix(key))
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) {
    const err = new Error('非法的存储路径')
    err.status = 400
    err.expose = true
    throw err
  }
  return full
}

function urlFor(key) {
  return `${PUBLIC_BASE}${URL_PREFIX}/${withPrefix(key)}`
}

/** 判断某个 URL 是否由本驱动产生，用于删除时决定「该不该动这个文件」 */
function ownsUrl(url) {
  if (!url) return false
  if (PUBLIC_BASE) return url.startsWith(`${PUBLIC_BASE}${URL_PREFIX}/`)
  return url.startsWith(`${URL_PREFIX}/`)
}

async function put(key, buffer) {
  const full = resolveSafe(key)
  await fs.promises.mkdir(path.dirname(full), { recursive: true })
  await fs.promises.writeFile(full, buffer)
  return { key, url: urlFor(key) }
}

async function remove(key) {
  try {
    await fs.promises.unlink(resolveSafe(key))
    return { deleted: true }
  } catch (e) {
    // 文件本就不存在不算失败：记录已经删了，这里只影响存储占用
    if (e.code === 'ENOENT') return { deleted: false }
    throw e
  }
}

async function getStream(key) {
  const full = resolveSafe(key)
  await fs.promises.access(full, fs.constants.R_OK)
  return { stream: fs.createReadStream(full) }
}

/** 本地没有图片处理能力，缩略图就是原图（前端仍按同一套字段消费） */
const thumbUrl = (key) => urlFor(key)

module.exports = {
  driver: 'local',
  staticDir: ROOT,
  staticPrefix: URL_PREFIX,
  put,
  delete: remove,
  getStream,
  urlFor,
  ownsUrl,
  thumbUrl
}
