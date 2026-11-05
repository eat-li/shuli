// HTML → PDF
//
// 用本机已安装的 Chrome/Edge 走无头打印，不引入 puppeteer/playwright
// （那两者要么下载一份 Chromium，要么额外装依赖）。排版与老师自己在浏览器里
// 「另存为 PDF」完全一致，因为走的就是同一个渲染引擎。
const { execFile } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { pathToFileURL } = require('url')

const DEFAULT_BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
]

// 定位本机 Chrome/Edge：优先 PDF_BROWSER_PATH，其次常见安装路径。
// 找不到就报可操作的错——静默失败会让老师以为「点了没反应」。
function findBrowser() {
  const candidates = [process.env.PDF_BROWSER_PATH].concat(DEFAULT_BROWSERS).filter(Boolean)
  const found = candidates.find((p) => {
    try {
      return fs.existsSync(p)
    } catch {
      return false
    }
  })
  if (!found) {
    throw new Error('未找到 Chrome/Edge，无法生成 PDF；可用 PDF_BROWSER_PATH 指定浏览器路径')
  }
  return found
}

// 跑一次浏览器进程。execFile 而非 exec：参数里有路径，走 shell 会有引号与转义问题。
function runBrowser(browser, args) {
  return new Promise((resolve, reject) => {
    execFile(
      browser,
      args,
      { timeout: 60000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (err) => (err ? reject(err) : resolve())
    )
  })
}

// 以指定 headless 参数打印一次。-user-data-dir 必须是独立目录，
// 否则浏览器已在运行时 headless 参数会被忽略、什么也不产出。
async function printOnce(browser, dir, headlessFlag) {
  const htmlPath = path.join(dir, 'doc.html')
  const pdfPath = path.join(dir, 'doc.pdf')
  if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath)

  await runBrowser(browser, [
    headlessFlag,
    '--disable-gpu',
    '--disable-extensions',
    '--no-first-run',
    '--no-default-browser-check',
    // 独立 profile：否则浏览器已在运行时 headless 参数会被忽略，什么也不产出
    `--user-data-dir=${path.join(dir, 'profile')}`,
    '--no-pdf-header-footer',
    '--print-to-pdf-no-header',
    // 给远程图片 / 内联样式留出加载时间
    '--virtual-time-budget=8000',
    `--print-to-pdf=${pdfPath}`,
    pathToFileURL(htmlPath).href
  ])

  if (!fs.existsSync(pdfPath) || fs.statSync(pdfPath).size < 1024) {
    throw new Error('浏览器没有产出 PDF')
  }
  return fs.readFileSync(pdfPath)
}

// HTML → PDF 的入口：写临时文件、打印、读回字节、清理目录。
// 先试 --headless=new，失败再退 --headless（老版本 Edge/Chrome 不认新参数）。
async function htmlToPdf(html) {
  const browser = findBrowser()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hw-pdf-'))
  fs.writeFileSync(path.join(dir, 'doc.html'), String(html), 'utf8')
  try {
    try {
      return await printOnce(browser, dir, '--headless=new')
    } catch {
      // 老版本 Edge/Chrome 不认 --headless=new
      return await printOnce(browser, dir, '--headless')
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

module.exports = { htmlToPdf, findBrowser }
