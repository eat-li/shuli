import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'

// 后端端口只认 server/.env——启动/停止脚本、vite 代理也都从那里读。
// 这里再写一份常量的话，改端口时漏改这一处，表现就是「后端在跑，但开发模式
// 下所有 /api 请求 502」，且报错完全不提端口。
function serverPort(): string {
  try {
    const envPath = fileURLToPath(new URL('../server/.env', import.meta.url))
    const m = readFileSync(envPath, 'utf8').match(/^\s*PORT\s*=\s*(\d+)/m)
    return m ? m[1] : '7788'
  } catch {
    return '7788'
  }
}

// mermaid 只在「插入图表」对话框里通过 import('mermaid') 动态加载。
// 如果被下面的兜底规则并进 vendor（静态 chunk，首屏就会预加载），会白白多下载好几 MB，
// 所以对 mermaid 及其「只被 mermaid 用到」的依赖返回 undefined，交给 Rollup 自动分包：
// 既保持懒加载，也保留 mermaid 内部按图类型的二次分包（按需只下流程图那一份）。
// 注：mermaid 升级若新增依赖而这里没列上，最坏情况是该依赖并进 vendor，只影响体积、不影响功能。
const MERMAID_ONLY_RE =
  /\/node_modules\/(?:mermaid|@mermaid-js|@braintree|@iconify|@upsetjs|cytoscape[a-z0-9-]*|d3[a-z0-9-]*|dagre[a-z0-9-]*|khroma|marked[a-z0-9-]*|roughjs|stylis|ts-dedent|uuid|fastdom|es-toolkit|langium|chevrotain|cose-base|layout-base|hachure-fill|path-data-parser|points-on-curve|points-on-path|delaunator|internmap|robust-predicates)\//

// 构建产物分包策略：把体积大、变动少的第三方库拆成独立 chunk，
// 既减小首屏 JS，又利用浏览器缓存（业务代码更新不会使 vendor 缓存失效）。
function manualChunks(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined
  const clean = id.replace(/\\/g, '/')
  if (MERMAID_ONLY_RE.test(clean)) return undefined
  // KaTeX 的 CSS 由 main.ts 全局引入。若把它归进 katex chunk，index 会因为
  // 这一条 CSS 依赖而 modulepreload 整个 KaTeX JS（约 540KB），登录页、首页
  // 都要白付这份体积。CSS 留在入口 chunk，KaTeX JS 只由真正用到公式的页面加载。
  if (clean.includes('katex') && clean.endsWith('.css')) return undefined
  // html-to-image 只在导出 / 图表对话框里用；归进 vendor 会被首屏预加载，
  // 交给 Rollup 按需分包。
  if (clean.includes('html-to-image')) return undefined
  // Element Plus 不再统一塞进一个 chunk：管理端壳层会一次性注册全部组件，
  // 登录页只用 4 个、只读站完全不用。固定成单个 chunk 时，任何一处 import 都会
  // 把整包拉回来；交给 Rollup 按引用图拆分，才能让只读站真正零 EP。
  if (clean.includes('element-plus')) return undefined
  if (id.includes('echarts') || id.includes('zrender')) return 'echarts'
  if (id.includes('@tiptap') || id.includes('prosemirror') || id.includes('@tiptap/pm'))
    return 'tiptap'
  if (id.includes('katex')) return 'katex'
  if (id.includes('vue') || id.includes('@vue/') || id.includes('vue-router')) return 'vue'
  if (id.includes('axios')) return 'axios'
  return 'vendor'
}

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    proxy: {
      // 前端 /api 请求代理到后端
      '/api': {
        target: process.env.VITE_API_TARGET || `http://localhost:${serverPort()}`,
        changeOrigin: true
      }
    }
  },
  // 依赖预构建：显式列出大型依赖，缩短冷启动与 HMR 时的请求数量
  optimizeDeps: {
    include: [
      'vue',
      'vue-router',
      'axios',
      'element-plus',
      '@element-plus/icons-vue',
      'echarts/core',
      'echarts/charts',
      'echarts/components',
      'echarts/renderers',
      '@tiptap/vue-3',
      '@tiptap/starter-kit',
      '@tiptap/extension-image',
      '@tiptap/extension-mathematics',
      'katex',
      'katex/contrib/auto-render'
    ]
  },
  build: {
    target: 'es2019',
    minify: 'esbuild',
    sourcemap: false,
    cssCodeSplit: true, // 各路由/组件 CSS 按需分包，避免单文件过大
    reportCompressedSize: false, // 构建时不计算 gzip 大小，加快构建
    chunkSizeWarningLimit: 1500, // 调高体积告警阈值，避免大 vendor 误报
    rollupOptions: {
      output: {
        manualChunks,
        // 资源文件名带 hash，便于长期缓存
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  }
})
