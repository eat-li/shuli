# Shuli · 数理

**面向一线教师的试题与试卷工作台。** 题库、组卷、作业、成绩、讲义共用一套数据模型——
同一道题在试卷里排成卷子、在作业里派给学生、在讲义里连成知识点，改一次题干，三处同步。

自托管、单用户、无登录，数据留在本机。

[![CI](https://github.com/eat-li/shuli/actions/workflows/ci.yml/badge.svg)](https://github.com/eat-li/shuli/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## 功能

| 模块 | 能做什么 |
| --- | --- |
| 题库 | 录入 / 编辑 / 检索；两级知识点目录；掌握等级；难度 × 题型交叉分析 |
| 组卷 | 按单选 / 多选 / 填空 / 解答编排，A4 排版打印并生成答题卡；AI 可按学段自动选题 |
| 作业 | 发布、选题、按学生名单导出、录入成绩 |
| 成绩 | 手工录入与批量导入；趋势、对比、分数段分析 |
| 结论 | 二级结论编写、发布、分类归档 |
| 讲义 | 题目 + 结论 + 知识点拼装，文档式编辑 |
| 资产 | 资料库（分类归档、打包下载）、图形库（素材检索） |
| 运维 | 全量 ZIP 备份与恢复；AI 参数配置（可选） |

## 快速开始

### 给使用者：解压就能用

下载 `shuli-<版本>-win64.zip`，解压到任意目录，双击 **`start.bat`**。
浏览器会自动打开，没有安装步骤，不需要 Node、pnpm，也不需要装数据库。

- 数据在 `server\data\`：`shuli.sqlite` 是全部业务数据，`uploads\` 是上传的图片。
  把整个 `data` 目录复制走就是一份完整备份（更推荐用界面里的「设置 → 备份」导 ZIP）。
- 想开机自启：双击 `autostart-install.bat`。
- 停止服务：双击 `stop.bat`，或直接关掉那个黑窗口。

> **没有登录**，所以默认只监听 `127.0.0.1`，只有这台电脑能访问。
> 改成 `HOST=0.0.0.0` 前，请确认你能控制谁能连到这台机器。

### 给开发者：源码运行

环境：Node 18+、pnpm。

```bash
pnpm install
pnpm dev          # 前端 5173，后端 7788
```

首次启动会自动在 `server/data/shuli.sqlite` 建库建表，不需要任何手工初始化。
日常使用（后端直接托管构建产物，只跑一个进程）：

```bash
pnpm build
pnpm start
```

出便携包（生成 `release/`，内置 node.exe 与生产依赖，可直接发给别人）：

```bash
pnpm pack
```

> `*.bat` 一律只写 ASCII。cmd 解析批处理用的是它启动那一刻的控制台代码页，
> 脚本里再 `chcp` 也救不回来——夹带中文会把换行吃掉，整份脚本从那里开始报错。
> 面向用户的提示语都放在 Node 里输出（详见 `.gitattributes` 的说明）。

## 配置

**默认不需要任何配置。** 数据库是本地 SQLite 文件，端口 7788，图片落本地磁盘——
`server/.env` 不存在也能正常跑。只有要改端口、开局域网访问、接 OSS 或统一托管 AI Key 时，
才把它从 [`server/.env.example`](server/.env.example) 复制出来，只写要改的那几行。

| 分组 | 关键变量 | 说明 |
| --- | --- | --- |
| 服务 | `PORT`、`HOST` | 默认 `7788` / `127.0.0.1` |
| 数据库 | `DB_FILE` | 默认 `server/data/shuli.sqlite`，一般不用改 |
| 文件存储 | `STORAGE_DRIVER`、`STORAGE_LOCAL_DIR` | 默认本地磁盘，见下节 |
| AI（可选） | 一般在界面「设置 → AI」里填 | 不配时 AI 功能不可用，其余功能不受影响 |

端口改动的连锁点只有一处：`server/.env`。启动脚本、停止脚本、Vite 代理都从那里读。

## 文件存储

默认落本地磁盘，可切阿里云 OSS。两种驱动接口一致，切换只改环境变量。

| 驱动 | 文件位置 | 对外 URL | 缩略图 |
| --- | --- | --- | --- |
| `local`（默认） | `server/data/uploads/` | `/uploads/<key>` 相对路径 | 原图 |
| `oss` | 你的 bucket | OSS 域名 | 缩放后的 WebP |

```env
STORAGE_DRIVER=local
STORAGE_LOCAL_DIR=data/uploads      # 相对路径以 server/ 为基准
STORAGE_PUBLIC_BASE_URL=            # 留空即用相对路径；挂 CDN 时才填
```

三点要注意：

- **URL 是相对路径，不写死域名**。写死域名后换个网络环境就整站裂图，而这种错误在开发机上永远复现不出来。
- **切换驱动不会让老图失效**。库里存的是完整 URL，浏览器直接去取；删除时按 URL 判定归属，不属于当前驱动就只删记录，响应里标 `ossSkipped`。
- **驱动在启动时决定**，不支持热切换——否则每次读图都要试两边才知道文件在哪。换存储 = 按同样的 key 搬完文件，再改 `STORAGE_DRIVER` 重启。

## 数据

- **数据库**：SQLite 单文件，WAL 模式（读写互不阻塞）。整个库就是一个文件，
  拷走即备份；单进程使用，无需考虑连接池与并发 DDL。
- **建表**：启动时按模型比对表名，缺表才建，表齐全直接跳过（正常启动约 150ms）。
- **迁移**：已存在的库要加字段时，在 `server/migrations` 新增迁移文件，启动时自动执行并记入
  `migrations` 表；执行成功才写记录，失败下次重跑。规矩见 [`server/migrations/README.md`](server/migrations/README.md)。
- **备份**：设置页可导出全量 ZIP，也可导入恢复。备份是逻辑格式（一堆 JSON），与数据库方言无关；
  恢复按主键 upsert，不会删除备份里没有的数据。

### 从 MySQL 版本升级

v0.1 及更早的版本用 MySQL。v1.0 换成 SQLite 后**不支持原地升级**，路径是：

1. 在旧版本里「设置 → 备份」导出 ZIP；
2. 装好新版本，进「设置 → 备份」导入同一个 ZIP。

备份是逻辑格式，跨方言可用，题目里的图片也包含在 ZIP 里。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 同时启动前后端（前端 5173，代理 `/api` 到 7788） |
| `pnpm build` | 构建前端到 `client/dist` |
| `pnpm start` | 只跑后端，同时托管 `client/dist`（日常使用） |
| `pnpm pack` | 生成便携包 `release/` |
| `pnpm lint` | ESLint 检查 |
| `pnpm test` | 服务端测试（每个用例开自己的临时 SQLite 库，不需要任何外部服务） |
| `pnpm --filter ./client i18n:check` | 校验中英文案键树一致 |

## 目录结构

```text
.
├── client/src/            # 前端：api / components / composables / i18n / layouts
│                          #       plugins / router / styles / types / utils / views
├── scripts/
│   └── pack-release.mjs   # 出便携包
├── server/
│   ├── migrations/        # 增量迁移（平时为空，改表时新增）
│   ├── src/               # config / controllers / middlewares / models
│   │                      # routes / services / storage / utils
│   └── test/              # 纯函数测试 + 接口测试（临时库，跑完删文件）
```

## 安全须知

- **本版本没有鉴权**：能访问端口的人就能读写全部数据。仅建议在本机使用；需要局域网/公网访问时，请在前面加反向代理并自行配置访问控制。
- AI 接口地址默认走白名单（`AI_ALLOWED_BASE_URLS`），避免后端被当作任意请求代理（SSRF）。
- 上传按扩展名白名单校验；写入响应头的文件名会先剥掉控制字符。

## 状态与路线

v1.0：默认库换成 SQLite，开箱即用——不装数据库、不写配置、不装 Node（便携包）。
测试不再依赖任何外部服务，`pnpm test` 在任何机器上都能跑完整套。

界面支持中英双语，英文覆盖尚不完整。
