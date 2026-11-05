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

环境：Node 18+、pnpm、MySQL 8。

```bash
pnpm install
cp server/.env.example server/.env    # 只需填 DB_*，其余可留空
pnpm dev
```

前端 <http://localhost:5173>，后端 <http://localhost:7788>。

生产 / 日常使用（后端直接托管构建产物，只跑一个进程）：

```bash
pnpm build && pnpm --filter ./server start
```

> **没有登录**，所以默认只监听 `127.0.0.1`。改成 `HOST=0.0.0.0` 前，请确认你能控制谁能连到这台机器。

## 配置

全部变量见 [`server/.env.example`](server/.env.example)。除数据库外都有默认值，不填也能启动。

| 分组 | 关键变量 | 说明 |
| --- | --- | --- |
| 服务 | `PORT`、`HOST` | 默认 `7788` / `127.0.0.1` |
| 数据库 | `DB_HOST`、`DB_PORT`、`DB_NAME`、`DB_USER`、`DB_PASS` | **当前必填**（MySQL 8） |
| 文件存储 | `STORAGE_DRIVER`、`STORAGE_LOCAL_DIR`、`STORAGE_PUBLIC_BASE_URL` | 默认本地磁盘，见下节 |
| AI（可选） | `AI_API_KEY`、`AI_MODEL`、`AI_ALLOWED_BASE_URLS` | 不配时 AI 功能不可用，其余功能不受影响 |

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

- **迁移**：启动时自动执行 `server/migrations` 中未执行的部分，记录在 `migrations` 表。执行成功才写记录，失败下次重跑。改表请新增迁移文件，不要依赖自动 `alter`。
- **备份**：设置页可导出全量 ZIP，也可导入恢复。备份是逻辑格式（一堆 JSON），与数据库方言无关；恢复按主键 upsert，不会删除备份里没有的数据。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 同时启动前后端（前端 5173，代理 `/api` 到 7788） |
| `pnpm build` | 构建前端到 `client/dist` |
| `pnpm lint` | ESLint 检查 |
| `pnpm test` | 服务端测试；MySQL 不可用时自动跳过 |
| `pnpm --filter ./client i18n:check` | 校验中英文案键树一致 |

## 目录结构

```text
.
├── client/src/            # 前端：api / components / composables / i18n / layouts
│                          #       plugins / router / styles / types / utils / views
├── server/
│   ├── migrations/        # 数据库迁移，按文件名顺序执行
│   ├── src/               # config / controllers / middlewares / models
│   │                      # routes / services / storage / utils
│   └── test/              # 纯函数测试 + 接口测试（临时库，跑完销毁）
```

## 安全须知

- **本版本没有鉴权**：能访问端口的人就能读写全部数据。仅建议在本机使用；需要局域网/公网访问时，请在前面加反向代理并自行配置访问控制。
- AI 接口地址默认走白名单（`AI_ALLOWED_BASE_URLS`），避免后端被当作任意请求代理（SSRF）。
- 上传按扩展名白名单校验；写入响应头的文件名会先剥掉控制字符。

## 状态与路线

v0.1 已完成：移除家长端、移除登录鉴权、图片存储默认本地。

下一步：把默认库换成 SQLite（当前仍需 MySQL），补齐文档与截图，之后发 v1.0。

界面支持中英双语，英文覆盖尚不完整。

## 许可证

[MIT](LICENSE)
