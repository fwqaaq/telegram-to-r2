# telegram-to-r2

简体中文 — 使用 Cloudflare Workers + R2 的 Telegram Bot

这个项目实现了一个基于 `grammy` 的 Telegram
机器人。机器人接收用户发送的媒体（音频、图片/视频、文档），并将文件上传到你在
Cloudflare R2 中配置的不同
Bucket。它还提供列举和删除文件的命令，并且支持基于用户名的访问控制。

**主要功能**

- 接收并上传：自动上传音频、图片/视频、文档到 R2
- 列表：通过 `/list` 命令列出指定类型的文件
- 删除：通过 `/delete <key>` 删除指定文件
- 权限控制：仅允许 `USERNAMES` 列表中的用户使用机器人

**仓库结构（重要文件）**

- `src/`: 源代码
- `src/bot.ts`: bot 逻辑与处理器
- `src/storage.ts`: R2 存储封装
- `src/type.ts`: 类型定义
- `src/utils.ts`: 消息格式化等工具
- `wrangler.jsonc`: Cloudflare Worker 绑定与环境配置

**运行与部署**

开发（本地）

1. 安装依赖：

```bash
pnpm install
```

2. 启动本地开发服务器（使用 wrangler）：

```bash
pnpm run dev
```

部署到 Cloudflare Workers：

```bash
pnpm run deploy
```

（注：具体脚本请查看 `package.json`）

配置（`wrangler.jsonc` / Worker 环境变量）

- `BOT_TOKEN` — 你的 Telegram Bot Token
- `WEBHOOK_SECRET` — 用于 Telegram webhook 的 secret token（与 `setWebhook` 的
  `secret_token` 保持一致）
- `USERNAMES` — 允许使用 bot 的用户名列表（逗号分隔），或者使用 `*` 允许所有用户
- `R2_BUCKET_AUDIO`、`R2_BUCKET_IMAGE`、`R2_BUCKET_DOC` — 在 Worker 中绑定的 R2
  bucket
- `LINK` — 一个对象，包含每类文件对应的基础 URL，例如 `LINK.AUDIO`,
  `LINK.IMAGE`, `LINK.DOC` 等

示例（概念）:

```jsonc
{
  "env": {
    "BOT_TOKEN": "your_bot_token",
    "WEBHOOK_SECRET": "your_webhook_secret",
    "USERNAMES": "alice,bob",
    "LINK": {
      "AUDIO": "https://<your-r2-endpoint>/audio",
      "IMAGE": "https://<your-r2-endpoint>/images",
      "DOC": "https://<your-r2-endpoint>/docs"
    }
  },
  "bindings": [
    {
      "name": "R2_BUCKET_AUDIO",
      "bucket_name": "audio-bucket"
    },
    {
      "name": "R2_BUCKET_IMAGE",
      "bucket_name": "image-bucket"
    },
    {
      "name": "R2_BUCKET_DOC",
      "bucket_name": "doc-bucket"
    }
  ]
}
```

设置 Telegram webhook（示例）

```text
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=<YOUR_WORKER_URL>&secret_token=<YOUR_SECRET_TOKEN>
```

替换 `<YOUR_WORKER_URL>` 与 `BOT_TOKEN`、`YOUR_SECRET_TOKEN` 为实际值。

使用说明（Telegram 命令）

- `/start` — 欢迎信息
- `/help` — 帮助信息
- `/list audio|images|documents` — 列出对应类型的文件（如 `/list images`）
- 直接向 bot 发送音频/图片/文档 — 自动上传到 R2
- `/delete <key>` — 删除存储中指定 key 的文件

注意事项

- 确保 `USERNAMES` 配置正确，机器人在 `with_authorization()`
  中会拒绝未授权用户。
- `LINK` 中的 URL 用于生成可访问链接；请确保这些 URL 指向你可公开访问的对象 URL
  或 CDN。
- 文件名会被用作 R2 中的对象 key，请避免重复 key 或手动检查覆盖策略。

调试与日志

- Worker 中的异常会打印到 Cloudflare Worker
  日志中。上传或删除失败时，机器人会将失败提示回复给用户。

贡献 & 问题反馈

- 欢迎提交 Issue 或 PR： <https://github.com/fwqaaq/telegram-to-r2>
