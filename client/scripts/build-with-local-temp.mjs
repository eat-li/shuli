// 用项目内 TEMP 跑 vite build，绕开杀软锁定用户 Temp 下 esbuild 临时目录的问题
// （症状：构建末尾 esbuild 删除 %TEMP%\esbuild-* 时报 Access is denied）
import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const clientDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tmp = join(clientDir, '.esbuild-tmp')

mkdirSync(tmp, { recursive: true })

const isWindows = process.platform === 'win32'
const env = { ...process.env, TMP: tmp, TEMP: tmp }
if (isWindows) env.TMPDIR = tmp // 少数工具链读这个

// 先跑一次；若仍因 Access is denied 失败则重试一次（锁可能是瞬时的）
for (let attempt = 1; attempt <= 2; attempt++) {
  const r = spawnSync('npx', ['vite', 'build'], {
    cwd: clientDir,
    env,
    stdio: 'inherit',
    shell: isWindows
  })
  if (r.status === 0) {
    rmSync(tmp, { recursive: true, force: true })
    process.exit(0)
  }
  const lastErr = r.stderr?.toString() || ''
  if (attempt === 1 && /Access is denied|EBUSY|EPERM/i.test(lastErr)) {
    console.log('[build-with-local-temp] transient temp lock, retrying...')
    continue
  }
  process.exit(r.status ?? 1)
}
