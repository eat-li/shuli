// 出便携包：生成一个不依赖 Node/pnpm/MySQL 的目录，用户解压后双击 start.bat 即用。
//
// 产物结构（与源码目录同构，代码里的相对路径不用改）：
//   release/
//   ├── start.bat / stop.bat / autostart-*.bat
//   ├── runtime/node.exe          ← 内置运行时，用户不需要装 Node
//   ├── server/                   ← 后端源码 + 生产依赖（不含 nodemon/mockjs）
//   ├── client/dist/              ← 前端构建产物，由后端同源托管
//   └── 使用说明.txt
//
// 为什么不用 pkg / Node SEA 打成单个 exe：sqlite3 是原生模块（.node 二进制），
// 打包器需要在运行时把二进制解到临时目录再加载，路径与杀软拦截都会出问题。
// 「一个 node.exe + 一个目录」的用户体验差别很小，维护成本低一个量级。
//
// 用法：pnpm pack:release
//   （不要写 `pnpm pack`：那是 pnpm 内置命令，会把仓库打成 npm 安装包，与本脚本无关）
//   --skip-install   复用上次的 server/node_modules（离线重打时用）
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RELEASE = path.join(ROOT, 'release')
const skipInstall = process.argv.includes('--skip-install')

const log = (msg) => console.log(`[pack] ${msg}`)

function run(cmd, args, cwd) {
  log(`执行 ${cmd} ${args.join(' ')}`)
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: true })
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} 失败（退出码 ${res.status}）`)
  }
}

// 复制目录，跳过一些不该进包的东西
function copyDir(from, to, skip = []) {
  fs.cpSync(from, to, {
    recursive: true,
    dereference: true,
    filter: (src) => {
      const rel = path.relative(from, src)
      return !skip.some((s) => rel === s || rel.startsWith(s + path.sep) || rel.startsWith(s))
    }
  })
}

function dirSize(dir) {
  let total = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) total += dirSize(full)
    else if (entry.isFile()) total += fs.statSync(full).size
  }
  return total
}

// 1) 前置检查：没有前端产物就没有可托管界面
const distIndex = path.join(ROOT, 'client', 'dist', 'index.html')
if (!fs.existsSync(distIndex)) {
  log('未找到 client/dist，先执行构建')
  run('pnpm', ['build'], ROOT)
}
if (!fs.existsSync(distIndex)) {
  throw new Error('client/dist/index.html 仍不存在，构建失败')
}

// 2) 清空旧产物
//    --skip-install 时要保住 server/node_modules（那正是要复用的东西），
//    所以只清其余内容；否则整体删掉重来。
if (fs.existsSync(RELEASE)) {
  if (skipInstall && fs.existsSync(path.join(RELEASE, 'server', 'node_modules'))) {
    log('清理旧的 release/（保留依赖，--skip-install）')
    for (const entry of fs.readdirSync(RELEASE)) {
      if (entry === 'server') continue
      fs.rmSync(path.join(RELEASE, entry), { recursive: true, force: true })
    }
    for (const entry of fs.readdirSync(path.join(RELEASE, 'server'))) {
      if (entry === 'node_modules') continue
      fs.rmSync(path.join(RELEASE, 'server', entry), { recursive: true, force: true })
    }
  } else {
    log('清理旧的 release/')
    fs.rmSync(RELEASE, { recursive: true, force: true })
  }
}
fs.mkdirSync(path.join(RELEASE, 'server'), { recursive: true })

// 3) 前端产物
log('复制前端产物')
fs.mkdirSync(path.join(RELEASE, 'client'), { recursive: true })
copyDir(path.join(ROOT, 'client', 'dist'), path.join(RELEASE, 'client', 'dist'))

// 4) 后端源码（不含 node_modules / 运行时数据 / 测试）
//    测试、migrations 之外的东西都要进包；server/data 是用户数据，绝不能带出去。
log('复制后端源码')
const serverFiles = ['src', 'migrations', 'package.json']
for (const name of serverFiles) {
  const from = path.join(ROOT, 'server', name)
  if (!fs.existsSync(from)) continue
  copyDir(from, path.join(RELEASE, 'server', name))
}
const envExample = path.join(ROOT, 'server', '.env.example')
if (fs.existsSync(envExample)) {
  fs.copyFileSync(envExample, path.join(RELEASE, 'server', '.env.example'))
}
// 空的数据目录：让用户一眼看到「东西都存在这里」
fs.mkdirSync(path.join(RELEASE, 'server', 'data'), { recursive: true })

// 5) 生产依赖：在 release 里用 npm 装，避免把 pnpm 的软链接结构复制过去
if (skipInstall && fs.existsSync(path.join(RELEASE, 'server', 'node_modules'))) {
  log('跳过依赖安装（--skip-install）')
} else {
  log('安装生产依赖（约 1 分钟，需要联网）')
  run('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], path.join(RELEASE, 'server'))
}

// 6) 内置 Node 运行时：直接用当前进程的可执行文件，版本天然一致
log('复制 Node 运行时')
fs.mkdirSync(path.join(RELEASE, 'runtime'), { recursive: true })
fs.copyFileSync(process.execPath, path.join(RELEASE, 'runtime', 'node.exe'))

// 7) 启动脚本与许可
log('复制启动脚本')
for (const name of [
  'start.bat',
  'stop.bat',
  'start-dev.bat',
  'autostart-install.bat',
  'autostart-uninstall.bat',
  'LICENSE'
]) {
  const from = path.join(ROOT, name)
  if (fs.existsSync(from)) fs.copyFileSync(from, path.join(RELEASE, name))
}
// 便携包里没有 pnpm，开发模式脚本跑不起来，别让用户误点
fs.rmSync(path.join(RELEASE, 'start-dev.bat'), { force: true })

// 8) 使用说明
//    带 BOM 的 UTF-8：Windows 记事本在旧版本上会把无 BOM 的 UTF-8 当 ANSI 打开，
//    整篇中文变乱码。加 BOM 是唯一能让记事本、VSCode、浏览器都正确识别的最省事做法。
fs.writeFileSync(
  path.join(RELEASE, '使用说明.txt'),
  '\uFEFF' +
    [
      '数理 · 试题与试卷工作台',
      '',
      '【怎么用】',
      '1. 把整个文件夹解压到任意位置（不要在压缩包里直接双击，会读不到文件）。',
      '2. 双击 start.bat，稍等几秒浏览器会自动打开。',
      '3. 关掉黑色窗口即停止服务。',
      '',
      '【开机自动启动（可选）】',
      '双击 autostart-install.bat 安装，之后登录 Windows 就自动在后台运行，',
      '浏览器书签保存 http://localhost:7788 即可。想取消：autostart-uninstall.bat。',
      '',
      '【数据在哪】',
      'server\\data\\shuli.sqlite   —— 全部数据（题库、作业、成绩、讲义）',
      'server\\data\\uploads\\       —— 上传的图片',
      '把 server\\data 整个目录复制走，就是一份完整备份。',
      '也可以在「设置 → 备份」里导出 ZIP（推荐，恢复更简单）。',
      '',
      '【常见问题】',
      '· 浏览器提示无法访问：可能端口 7788 被别的程序占用。',
      '  在 server 目录下建一个 .env 文件，写一行 PORT=7890，重新双击 start.bat。',
      '· 双击后窗口一闪而过：右键 start.bat → 编辑，把最后几行报错看一遍，',
      '  通常是路径里有特殊字符，或文件夹没有写权限。',
      '· 杀毒软件提示拦截：这是本地未签名程序，允许即可；数据不联网、不外传。',
      '',
      '【说明】本程序没有登录密码，默认只监听本机（127.0.0.1），',
      '同一局域网内的其他电脑访问不到，只有这台电脑可以用。',
      ''
    ].join('\r\n'),
  'utf8'
)

// 9) 汇总
const total = dirSize(RELEASE)
log(`完成：${RELEASE}`)
log(`体积：${(total / 1024 / 1024).toFixed(1)} MB`)
log('自检：双击 release/start.bat 应能直接打开界面')
