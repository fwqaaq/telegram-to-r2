# 🤖 Telegram to R2 Bot

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle-ORM-C5F74F?style=for-the-badge&logo=drizzle&logoColor=black)](https://orm.drizzle.team/)
[![grammY](https://img.shields.io/badge/grammY-Framework-32ADFF?style=for-the-badge&logo=telegram&logoColor=white)](https://grammy.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

> **极简、高效、安全的 Telegram 媒体存储方案。**
>
> 基于 Cloudflare Workers + R2 的免费额度，搭建属于你个人的“私人云盘” Telegram 机器人。

---

## ✨ 主要功能

- 🚀 **媒体自动同步**：直接向 Bot 发送音频、图片、视频、文档，自动流式上传至 R2。
- 📂 **智能路径分类**：根据文件类型自动归档到不同的 R2 Bucket 路径。
- 🛡️ **双重权限控制**：
  - **白名单制**：通过环境变量 `USERNAMES` 限制初始访问。
  - **黑名单制**：集成 D1 数据库，支持管理员通过 `/block` 实时封禁恶意用户。
- 🔍 **管理便捷**：
  - `/list`：支持 MarkdownV2 渲染，分类列出文件（管理员可跨用户查看）。
  - `/delete`：一键清理 R2 存储中的对象。
- ⚡ **极致性能**：依托 Cloudflare 全球边缘网络，低延迟，冷启动极速。

---

## 🏗️ 目录结构

```text
src/
├── db/              # 🗄️ 数据库相关
│   ├── schema.ts    # 表结构定义 (Drizzle)
│   └── index.ts   # 封装的增删改查逻辑 (如 is_user_banned)
├── bot.ts           # 🤖 Bot 核心逻辑与中间件 (Authorization/Commands)
├── index.ts         # 🚀 Worker 入口，处理请求与响应
├── storage.ts       # 📦 R2 桶操作封装
├── type.ts          # 📝 全局类型声明
└── utils.ts         # 🛠️ MarkdownV2 格式化与辅助函数
```

## 🛠️ 环境配置

### 1. 环境准备

```bash
# 1. 克隆仓库后安装依赖
pnpm install

# 2. 登录 Cloudflare 账号
pnpm wrangler login
```

### 2. 数据库初始化

```bash
# 1. 配置 .env 文件，设置 CLOUDFLARE_ACCOUNT_ID、CLOUDFLARE_DATABASE_ID 和 CLOUDFLARE_D1_TOKEN 环境变量

# 2. 将表结构应用到远端 D1 数据库
pnpm run db:push
```

### 3. 配置 wrangler.jsonc

### 3. 配置环境变量

修改 `wrangler.jsonc` 或在 Cloudflare 控制台配置以下变量：

| 变量名 | 必填 | 示例/说明 |
| :--- | :--- | :--- |
| `BOT_TOKEN` | ✅ | 从 [@BotFather](https://t.me/botfather) 获取的 Bot API Token |
| `ADMIN_USERNAMES` | ✅ | 设置管理员用户 |
| `WEBHOOK_SECRET` | ✅ | 自定义的 Webhook 安全校验密钥，建议使用长随机字符串 |
| `LINK` | ✅ | 映射到 R2 的访问域名对象，例如：`{"AUDIO": "https://pub-xxx.r2.dev/audio", "IMAGE": "...", "DOC": "..."}` |
| `DB` | ✅ | Cloudflare D1 数据库绑定名称 (需在 wrangler.jsonc 中配置 binding) |

## 🎮 指令指南

| 命令 | 权限 | 功能描述 |
| :--- | :--- | :--- |
| `/start` | 已授权用户 | 机器人初始化欢迎信息 |
| `/list <type>` | 已授权用户 | 列出自己的 `audio` \| `images` \| `documents` |
| `/list <type> all` | 管理员 | 列出所有用户在该分类下的上传文件 |
| `/delete <key>` | 已授权用户 | 从 R2 中彻底删除指定文件 |
| `/block` | 管理员 | **回复消息**或**跟随用户名**，将该用户永久封禁 |
| `(直接发送媒体)` | 已授权用户 | 自动触发上传，成功后返回 MarkdownV2 详情卡片 |

## 🛠️ 部署流程

### 1. 执行部署

使用 wrangler 将项目发布到 Cloudflare 全球边缘网络：

```bash
pnpm run deploy
```

### 2. 配置 Telegram Webhook

```text
https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=<YOUR_WORKER_URL>&secret_token=<WEBHOOK_SECRET>
```

- `<BOT_TOKEN>`: 你的机器人 Token。
- `<YOUR_WORKER_URL>`: 部署成功后 Cloudflare 提供的 .workers.dev 域名地址。
- `<WEBHOOK_SECRET>`: 必须与你环境变量中的 WEBHOOK_SECRET 保持一致，用于校验请求来源。

## 🤝 贡献与反馈

欢迎通过 Issue 反馈 Bug 或提交 PR 完善功能。

- GitHub: <https://github.com/fwqaaq/telegram-to-r2>
- 测试账号: [@test_telegram_r2_bot](https://t.me/test_telegram_r2_bot)
