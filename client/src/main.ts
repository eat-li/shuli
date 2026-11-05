import { createApp } from 'vue'
import 'katex/dist/katex.min.css'

// Element Plus 的 base 必须留在入口：它定义 :root 的默认变量，
// theme.css 需要在它之后覆盖。组件本体与组件样式按需加载：
// - 管理端由 MainLayout 引 plugins/elementAdmin.ts 一次性注册；
// - 登录页只注册自己的 4 个组件；
// - 只读站完全不使用 Element Plus。
import 'element-plus/theme-chalk/base.css'

// 自定义主题变量必须放在 Element Plus base 之后，否则会被默认蓝覆盖。
import './styles/theme.css'
// 正文排版基线：正文 / 编辑器 / 公式 / 题图的统一度量（详见文件头注释）
import './styles/content-typography.css'

import App from './App.vue'
import router from './router'
import { i18n } from './i18n'

const app = createApp(App)
app.use(router)
app.use(i18n)
app.mount('#app')
