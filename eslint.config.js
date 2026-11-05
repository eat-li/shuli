// 基础 ESLint 配置（Flat Config）
// 当前先覆盖后端 JS 文件；后续可按需扩展 Vue/TS 规则
module.exports = [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'client/dist/**',
      // 本地工作区（已被 .gitignore 忽略，不入库；flat config 不会自动读 .gitignore）
      '.workbuddy/**',
      '.scratch/**',
      '.agents/**',
      '.esbuild-tmp/**',
      '.dsh-progress/**',
      '.pnpm-store/**',
      'design-preview/**'
    ]
  },
  {
    files: ['server/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        __dirname: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        AbortController: 'readonly',
        // 流式（SSE）解析上游分片时用到：Node 11+ 提供的全局 TextDecoder
        TextDecoder: 'readonly',
        // 测试里构造 multipart 请求体：Node 18+ 提供的全局 FormData / Blob
        FormData: 'readonly',
        Blob: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'error'
    }
  }
]
