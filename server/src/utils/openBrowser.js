// 启动后自动打开浏览器（仅当显式要求时）。
//
// 为什么不让启动脚本「sleep 3 秒再打开」：机器忙的时候 3 秒不够，
// 页面会比服务先到，用户看到的是空白页 + 连接被拒，只能再手动刷新一次。
// 交给服务自己在 listen 成功后再开，时序天然正确。
//
// 由启动脚本设置 OPEN_BROWSER=1 触发；开机自启、开发模式下不设，不会弹窗。
const { spawn } = require('child_process')

function openBrowser(url) {
  if (String(process.env.OPEN_BROWSER || '') !== '1') return
  try {
    if (process.platform === 'win32') {
      // 必须走 cmd 的 start：直接 spawn url 会被当成可执行文件。
      // 参数用空标题 "" 占位，否则带引号的 URL 会被 start 当成窗口标题。
      spawn('cmd', ['/c', 'start', '""', url], {
        detached: true,
        stdio: 'ignore',
        windowsVerbatimArguments: true
      }).unref()
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref()
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
    }
  } catch {
    // 打不开浏览器不影响服务本身，提示一下手工访问即可
    console.warn(`⚠️  无法自动打开浏览器，请手动访问 ${url}`)
  }
}

module.exports = { openBrowser }
