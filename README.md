# Shuli · 数理

面向一线教师的试题与试卷工作台：把题库、组卷、作业、成绩和讲义放在同一套数据模型里——
同一道题可以在试卷里排成卷子、在作业里派给学生、在讲义里连成知识点，改一次题干三处同步。

自托管、单用户、没有登录。数据在你自己的机器上。

> **项目状态**：v0.1，开发中。
> 本版已完成「剔除家长端 / 移除登录鉴权」两件事；
> **SQLite 默认库与本地文件存储仍在开发中**，当前运行需要 MySQL，图片需要阿里云 OSS。
> 零外部依赖的版本会作为 v1.0 发布。

## 功能

- **题库**：题目录入 / 编辑 / 检索，两级知识点目录，掌握等级标记，难度与题型交叉分析
- **组卷**：从题库按分区（单选 / 多选 / 填空 / 解答）编排，A4 规格排版与打印，含答题卡
- **作业**：发布作业、选题、按学生名单导出、录入成绩
- **成绩**：录入 / 批量导入，趋势、对比、分数段分析
- **结论**：二级结论的编写、发布、分类归档
- **讲义**：把题目、结论、知识点拼成讲义，文档式编辑
- **资料库 / 图形库**：资料分类归档、图形素材检索
- **数据备份**：全量 ZIP 导出与恢复
- **AI 辅助（可选）**：智能排版、答案解析、难度判定、按学段组卷——不配 Key 也能用其它功能

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | Vue 3 + TypeScript + Vite + Element Plus + ECharts + Tiptap + KaTeX |
| 后端 | Node.js + Express 5 + Sequelize |
| 数据库 | MySQL 8（SQLite 支持开发中） |
| 文件存储 | 阿里云 OSS（本地磁盘存储开发中） |
| 包管理 | pnpm workspace |

## 快速开始

### 环境要求

- Node.js 18+
- pnpm（`corepack enable` 即可）
- MySQL 8

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置

```bash
cp server/.env.example server/.env
```

至少填数据库连接：

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=shuli
DB_USER=root
DB_PASS=你的密码
```

图片上传需要配 OSS（`OSS_*` 四项）；AI 功能需要配 `AI_API_KEY`，都可以留空。

> **没有登录**：所以默认只监听 `127.0.0.1`。
> 改 `HOST=0.0.0.0` 之前请确认你能控制谁能连到这台机器——本版本任何人都能读写题库。

### 3. 启动

```bash
pnpm dev
```

- 前端：http://localhost:5173
- 后端：http://localhost:7788

生产/日常使用（后端托管前端构建产物）：

```bash
pnpm build && pnpm --filter ./server start
```

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 同时启动前后端 |
| `pnpm build` | 构建前端 |
| `pnpm lint` | ESLint 检查 |
| `pnpm test` | 服务端测试（需 MySQL，不可用时自动跳过） |
| `pnpm --filter ./client i18n:check` | 校验中英文案键树一致 |

## 目录结构

```text
.
├── client/                 # Web 前端
│   └── src/
│       ├── api/            # 接口封装
│       ├── components/     # 公共组件
│       ├── composables/    # 组合式函数
│       ├── layouts/        # 布局
│       ├── router/         # 路由
│       ├── styles/         # 主题与令牌
│       ├── types/          # 类型
│       ├── utils/          # 工具函数
│       └── views/          # 页面
├── server/                 # 后端
│   ├── migrations/         # 数据库迁移（按文件名顺序执行）
│   ├── scripts/            # 运维脚本
│   ├── src/
│   │   ├── config/         # 数据库 / 存储配置
│   │   ├── controllers/    # HTTP 层
│   │   ├── middlewares/    # 中间件
│   │   ├── models/         # Sequelize 模型
│   │   ├── routes/         # 路由
│   │   ├── services/       # 业务规则与事务
│   │   └── utils/          # 校验、缓存、迁移等
│   └── test/
└── docs/                   # 设计与决策记录
```

## 数据库迁移

- 启动时自动执行 `server/migrations` 下尚未执行的迁移
- 执行记录存在 `migrations` 表；**执行成功才写记录**，中途失败下次会重跑
- 改表结构请新增迁移文件，不要依赖启动时的自动 `alter`

## 数据备份

- 「数据备份」页可下载全量 ZIP，也可上传 ZIP 恢复
- 恢复按主键插入或更新，不会删除备份里没有的数据
- 备份是逻辑格式（一堆 JSON），与数据库方言无关

## 安全说明

- **本版本没有鉴权**：所有接口对能访问端口的人开放。仅建议在本机使用。
- 如需局域网/公网访问，请在前面加反向代理并自行配置访问控制。
- AI 接口地址默认走白名单（`AI_ALLOWED_BASE_URLS`），避免后端被当作任意请求代理（SSRF）。
- 上传按扩展名白名单校验，文件名会剥掉控制字符后再写响应头。

## 许可证

MIT，见 [LICENSE](LICENSE)。
