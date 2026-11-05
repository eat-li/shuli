// 存储抽象层的选择入口
//
// 驱动在**进程启动时**按环境变量决定一次，不支持运行时热切换。
// 理由：热切换会让「新文件写远端、老文件在本地」成为常态，
// 结果每次读图都要试两边才知道文件在哪，复杂度远超收益。
// 真要换存储：先把手头文件搬到目标位置（同一批 key），再改 STORAGE_DRIVER 重启。
//
// 接口（本地 / OSS 两个驱动同签名）：
//   put(key, buffer, { mime, headers }) -> { key, url }
//   delete(key)                         -> { deleted: boolean }
//   getStream(key)                      -> { stream }
//   urlFor(key)                         -> string
//   ownsUrl(url)                        -> boolean   删除时判定文件归属
//   thumbUrl(key, mime, width)          -> string
const driverName = String(process.env.STORAGE_DRIVER || 'local')
  .trim()
  .toLowerCase()

const driver = driverName === 'oss' ? require('./oss') : require('./local')

if (driverName !== 'local' && driverName !== 'oss') {
  console.warn(`⚠️  未知的 STORAGE_DRIVER=${driverName}，已回退为本地存储`)
}

module.exports = driver
