// 环境变量的唯一入口。
//
// 为什么单独抽一个文件：`dotenv.config()` 默认按**进程工作目录**找 .env。
// 以前服务只能从 server/ 目录启动才读得到配置；改成 `node server/src/index.js`
// （便携包就是这么跑的）后，cwd 变成仓库根，.env 会被静默忽略——
// 表现是「配置改了但没生效」，这类问题排查成本极高。
// 这里固定按文件位置解析绝对路径，从哪个目录启动都一样。
const path = require('path')

// server/.env，可选：文件不存在时 dotenv 静默跳过，全部回落到代码内默认值。
require('dotenv').config({ path: path.join(__dirname, '../../.env') })
