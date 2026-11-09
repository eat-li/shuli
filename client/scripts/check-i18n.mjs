// i18n 一致性校验（纯进程内，不依赖打包器）。
//
// 三件事必须为 0，否则界面会出现「半个英文」或直接露出 `questionBank.searchPlaceholder`：
//   1) 代码里 t('x.y') 用到的键，在 zh / en 里都要存在；
//   2) zh 与 en 的键树必须完全一致（少一个键 = 英文界面回落到中文）；
//   3) 命名空间不得重复定义（由 mergeMessages 抛错兜住，这里再静态查一遍顶层键）。
//
// 第四项「残留中文字面量」是进度报告，不是错误：值从高到低就是下一步该迁的页面。
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

// 路径从脚本位置推导：本脚本在 client/scripts/ 下，仓库可能被克隆到任何目录。
const CLIENT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = `${CLIENT}/src`
const req = createRequire(`${CLIENT}/package.json`)
const ts = req('typescript')

function loadTs(file) {
  const src = readFileSync(file, 'utf8')
  const out = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText
  const mod = { exports: {} }
  new Function('exports', 'module', out)(mod.exports, mod)
  return mod.exports
}

const { mergeMessages } = loadTs(`${SRC}/i18n/mergeMessages.ts`)
const zh = mergeMessages(
  loadTs(`${SRC}/i18n/zh-CN.ts`).default,
  loadTs(`${SRC}/i18n/modules/editor.zh.ts`).default,
  loadTs(`${SRC}/i18n/modules/homeworkDialogs.zh.ts`).default,
  loadTs(`${SRC}/i18n/modules/question.zh.ts`).default,
  loadTs(`${SRC}/i18n/modules/questionComponents.zh.ts`).default
)
const en = mergeMessages(
  loadTs(`${SRC}/i18n/en-US.ts`).default,
  loadTs(`${SRC}/i18n/modules/editor.en.ts`).default,
  loadTs(`${SRC}/i18n/modules/homeworkDialogs.en.ts`).default,
  loadTs(`${SRC}/i18n/modules/question.en.ts`).default,
  loadTs(`${SRC}/i18n/modules/questionComponents.en.ts`).default
)

const flatten = (obj, prefix = '') => {
  const out = new Map()
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [kk, vv] of flatten(v, path)) out.set(kk, vv)
    } else {
      out.set(path, v)
    }
  }
  return out
}

const zhFlat = flatten(zh)
const enFlat = flatten(en)

/* ── 扫描源码 ─────────────────────────────────────────────── */
const walk = (dir) => {
  const files = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === 'i18n' || name === 'node_modules') continue
      files.push(...walk(full))
    } else if (/\.(ts|vue)$/.test(name)) {
      files.push(full)
    }
  }
  return files
}

const used = new Map() // key → Set(file)
const cjk = [] // { file, count, sample }
const CJK = /[\u4e00-\u9fff]/
const KEY_RE = /\b(?:t|\$t|te)\(\s*(['"`])([^'"`\n$]*?)\1/g
// 也要摘掉 HTML 注释：.vue 模板里大量设计说明是中文，它们不是界面文案
const COMMENT_RE = /<!--[\s\S]*?-->|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g
const T_CALL_RE = /\b(?:t|\$t|te)\(\s*(['"`])[^'"`\n$]*?\1(\s*,\s*\{[^}]*\})?/g

for (const file of walk(SRC)) {
  const raw = readFileSync(file, 'utf8')
  for (const m of raw.matchAll(KEY_RE)) {
    const key = m[2].trim()
    if (!key || !/^[a-zA-Z][\w.]*$/.test(key)) continue
    if (!used.has(key)) used.set(key, new Set())
    used.get(key).add(file.replace(`${SRC}/`, ''))
  }
  // 进度统计：去掉注释与 t(...) 调用后再数中文
  const code = raw.replace(COMMENT_RE, '').replace(T_CALL_RE, '')
  const hits = code.split('\n').filter((l) => CJK.test(l))
  if (hits.length) {
    cjk.push({
      file: file.replace(`${SRC}/`, ''),
      count: hits.length,
      sample: (hits[0] || '').trim().slice(0, 60)
    })
  }
}

/* ── 输出 ─────────────────────────────────────────────────── */
const missingZh = []
const missingEn = []
for (const [key, files] of [...used].sort()) {
  if (!zhFlat.has(key)) missingZh.push(`${key}  ← ${[...files].join(', ')}`)
  if (!enFlat.has(key)) missingEn.push(`${key}  ← ${[...files].join(', ')}`)
}
// 路由标题：name 走 page.<camelCase(name)> 查表，查不到就**静默回退**到
// meta.title 里的中文。路由名有 kebab-case 的（question-analysis / paper-editor），
// 键是 camelCase —— 这种不一致不会报错，只在界面上表现为「页头还是中文」。
const camel = (v) => v.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())
const routeSrc = readFileSync(`${SRC}/router/index.ts`, 'utf8')
const routeTitles = []
for (const m of routeSrc.matchAll(
  /name:\s*'([^']+)'[\s\S]{0,120}?meta:\s*\{[^}]*title:\s*'([^']+)'/g
)) {
  const [, name, title] = m
  // 登录页与只读端是独立壳层，本来就不参与后台的语言包
  if (name === 'login' || name.startsWith('readonly')) continue
  if (!/^(layout|redirect)/.test(name))
    routeTitles.push({ name, title, key: `page.${camel(name)}` })
}
const routeMissing = routeTitles
  .filter((r) => !zhFlat.has(r.key))
  .map((r) => `${r.name} → 缺 ${r.key}（会回退到中文「${r.title}」）`)

// en 值里仍留中文：多半是复制中文当英文占位。品牌名（数理）是例外。
const enCjk = [...enFlat.entries()]
  .filter(([, v]) => typeof v === 'string' && /[\u4e00-\u9fff]/.test(v) && !v.includes('数理'))
  .map(([k, v]) => `${k} = ${String(v).slice(0, 48)}`)

// 模板调用了脚本里不存在的函数 → 编译成 `_ctx.xxx(...)`，运行时调用 undefined。
// 两种表现，都极难发现：
//   · `_ctx.t(...)` 直接抛错 → 整个组件白屏；
//   · `_ctx.groupLabel(...)` 之类 → 该处静默空白，连报错都没有。
// 构建、vue-tsc、SFC 语法检查全都放过（模板表达式按 any 处理）。
//
// 判据看**编译产物**而不是正则：有绑定时内联成本地变量，没绑定才留下 `_ctx.xxx(`。
// 注意先剔除注释——编译产物会保留源码注释，注释里提到 `_ctx.xxx(` 会误报。
const { parse: parseSfc, compileScript } = req('@vue/compiler-sfc')
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

const missingBindings = []
for (const file of walk(SRC).filter((f) => f.endsWith('.vue'))) {
  const src = readFileSync(file, 'utf8')
  if (!/<template>/.test(src)) continue
  let content
  try {
    const { descriptor } = parseSfc(src, { filename: file.split(/[\\/]/).pop() })
    content = stripComments(
      compileScript(descriptor, { id: 'i18n-check', inlineTemplate: true }).content
    )
  } catch (e) {
    missingBindings.push(`${file.replace(`${SRC}/`, '')}（编译失败：${e.message.slice(0, 60)}）`)
    continue
  }
  const names = new Set()
  for (const m of content.matchAll(/_ctx\.([A-Za-z_][\w]*)\s*\(/g)) {
    // `$t` / `$emit` 之类是全局属性，合法
    if (!m[1].startsWith('$')) names.add(m[1])
  }
  if (names.size) {
    missingBindings.push(`${file.replace(`${SRC}/`, '')} → ${[...names].join(', ')}`)
  }
}

const onlyZh = [...zhFlat.keys()].filter((k) => !enFlat.has(k)).sort()
const onlyEn = [...enFlat.keys()].filter((k) => !zhFlat.has(k)).sort()

const section = (title, arr, okText, limit = 60) => {
  console.log(`\n── ${title} ──`)
  if (!arr.length) console.log(`  ✓ ${okText}`)
  else arr.slice(0, limit).forEach((x) => console.log(`  · ${x}`))
  if (arr.length > limit) console.log(`  … 另有 ${arr.length - limit} 项`)
}

console.log(
  `语言包 zh ${zhFlat.size} 键 / en ${enFlat.size} 键 · 源码引用 ${used.size} 个键 · 含中文的文件 ${cjk.length} 个`
)
section('代码用到但 zh 缺失【需修】', missingZh, '无')
section('代码用到但 en 缺失【需修】', missingEn, '无')
section('zh 有、en 没有【需补译】', onlyZh, '无')
section('en 有、zh 没有【多余键】', onlyEn, '无')
section('路由标题查不到 page.* 键（会回退中文）【需修】', routeMissing, '无')
section('模板调用了脚本里不存在的函数（白屏/空白）【需修】', missingBindings, '无')
section('英文值里仍含中文【需补译】', enCjk, '无', 200)

const unused = [...zhFlat.keys()].filter((k) => !used.has(k)).sort()
section('已定义但源码未引用【待应用或可删】', unused, '无', 400)

console.log('\n── 剩余中文字面量（进度，行数降序）──')
cjk
  .sort((a, b) => b.count - a.count)
  .slice(0, 40)
  .forEach((x) => console.log(`  ${String(x.count).padStart(4)} 行  ${x.file}`))
console.log(`  合计 ${cjk.reduce((s, x) => s + x.count, 0)} 行 / ${cjk.length} 个文件`)

process.exit(
  missingZh.length ||
    missingEn.length ||
    onlyZh.length ||
    onlyEn.length ||
    routeMissing.length ||
    missingBindings.length
    ? 1
    : 0
)
