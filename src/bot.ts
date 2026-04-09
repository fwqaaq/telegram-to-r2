import { Bot, GrammyError, type Context } from 'grammy';
import StorageManager from './storage';
import { type Env, FileType, type UploadedFileInfo } from './type';
import { MessageFormatter } from './utils';
import {
  block_user,
  is_user_banned,
  list_blocked_users,
  unblock_user,
} from './db';

/**
 * Command handler for bot basic commands.
 * @returns
 */
class BotCommandHandler {
  constructor(private storage: StorageManager) {}
  setup_commands(bot: Bot) {
    bot.command('start', (c) =>
      c.reply(
        'Welcome! I am a cloudflare R2 bot! https://github.com/fwqaaq/telegram-to-r2',
      ),
    );
    bot.command('help', (c) => c.reply(MessageFormatter.get_help_message()));
    bot.command('list', async (c) => {
      const current_username = c.from?.username?.toLowerCase();

      if (!current_username) {
        return await c.reply('无法获取您的用户名，无法执行列出文件操作。');
      }

      // If target_user is not provided, default to current user
      const [resource_name = 'audio', target_user = current_username] = c.match
        ?.trim()
        .split(/\s+/);

      let file_type: FileType;
      switch (resource_name) {
        case 'audio':
          file_type = FileType.MUSIC;
          break;
        case 'images':
          file_type = FileType.IMAGES;
          break;
        case 'documents':
          file_type = FileType.DOCUMENTS;
          break;
        default:
          return await c.reply(
            '无效的参数。请使用 /list audio <username> 或 /list images <username> 或 /list documents <username> 来列出相应类型的文件（仅管理员可以查看其他用户的文件列表）。',
          );
      }

      // Permission check: only allow users to list their own files.
      const is_admin =
        current_username && c.env.ADMIN_USERNAMES.includes(current_username);

      // If current user is not admin and checking other user's files, reject the request
      if (!is_admin && target_user !== current_username) {
        return await c.reply('⚠️ 您没有权限查看其他用户的文件列表。');
      }

      const files = await this.storage.list_files(file_type, target_user);
      const message = MessageFormatter.format_file_list(files, file_type);
      await c.reply(message, { parse_mode: 'MarkdownV2' });
    });

    bot.command('delete', async (c) => {
      if (!c.message?.text) {
        return await c.reply(
          '请使用 /delete 命令来删除文件（参数是你的 key），例如：/delete filename.txt',
        );
      }
      const key = c.match;

      if (!key) {
        return await c.reply(
          '请提供要删除的文件名，例如：/delete filename.txt',
        );
      }

      const buckets = [
        c.env.R2_BUCKET_AUDIO,
        c.env.R2_BUCKET_IMAGE,
        c.env.R2_BUCKET_DOC,
      ];

      try {
        let found = false;
        // Try to delete from all buckets
        for await (const bucket of buckets) {
          const obj = await bucket.get(key);
          found = !!obj || found;
          if (obj) {
            const uploadedBy = obj.customMetadata?.uploadedBy.toLowerCase();

            const current_username = c.from?.username?.toLowerCase();

            if (!current_username) {
              return await c.reply('无法获取您的用户名，无法执行删除操作。');
            }

            const is_admin =
              current_username &&
              c.env.ADMIN_USERNAMES.includes(current_username);

            // Permission check: only allow users to delete their own files.
            if (!is_admin && uploadedBy !== current_username) {
              return await c.reply('⚠️ 您没有权限删除其他用户的文件。');
            }

            await bucket.delete(key);
            await c.reply(`文件 ${key} 已成功删除。`);
          }
        }
        if (!found) {
          await c.reply(`未找到文件 ${key}，请输入正确的文件 key。`);
        }
      } catch (error) {
        console.error(error);
        await c.reply(`删除文件 ${key} 时出错，请检查文件名是否正确。`);
      }
    });
    bot.command('block', async (c) => {
      const current_username = c.from?.username?.toLowerCase();

      // Permission check: only allow admins to block users.
      if (
        !current_username ||
        !c.env.ADMIN_USERNAMES.includes(current_username)
      ) {
        return await c.reply('⚠️ 只有管理员可以使用 /block 命令。');
      }

      const target = {} as { chat_id?: number; username?: string };

      // Block by replying to a user's message
      if (c.message?.reply_to_message?.from) {
        const user = c.message.reply_to_message.from;
        target.chat_id = user.id;
        target.username = user.username?.toLowerCase();
      } else {
        // Block by /block username
        if (!c.match)
          return await c.reply('请提供要封禁的用户名，例如：/block username');
        const username = c.match.trim().toLowerCase();
        target.username = username.replace(/^@/, ''); // Remove @ if provided
        // Get chat_id from username if possible (optional, for better blocking)
        try {
          const chat = await c.api.getChat(`@${target.username}`);
          target.chat_id = chat.id;
        } catch (e) {
          console.warn(
            `无法获取用户 ${target.username} 的 chat_id，封禁将仅基于用户名进行。`,
          );
        }
      }

      try {
        await block_user(c.env.DB, target);
        const displayName = target.username
          ? `@${target.username}`
          : `ID: ${target.chat_id}`;
        await c.reply(`✅ 已成功封禁 ${displayName}`);
      } catch (e) {
        console.error('Error blocking user:', e);
        await c.reply('封禁用户时发生错误，请稍后再试。' + e);
      }
    });

    bot.command('unblock', async (c) => {
      const current_username = c.from?.username?.toLowerCase();

      // Permission check: only allow admins to unblock users.
      if (
        !current_username ||
        !c.env.ADMIN_USERNAMES.includes(current_username)
      ) {
        return await c.reply('⚠️ 只有管理员可以使用 /unblock 命令。');
      }

      const target = {} as { identifier: string | number };

      // Block by replying to a user's message
      if (c.message?.reply_to_message?.from) {
        const user = c.message.reply_to_message.from;

        target.identifier = user.id;
      } else {
        // Unblock by /unblock username
        if (!c.match)
          return await c.reply('请提供要解封的用户名，例如：/unblock username');
        const username = c.match.trim().replace(/^@/, '').toLowerCase();
        target.identifier = username;
      }

      try {
        await unblock_user(c.env.DB, target.identifier);
        await c.reply(`✅ 已成功解封 ${target.identifier}`);
      } catch (e) {
        console.error('Error unblocking user:', e);
        await c.reply('解封用户时发生错误，请稍后再试。');
      }
    });

    // list all blocked users (admin only)
    bot.command('list_blocked', async (c) => {
      const current_username = c.from?.username?.toLowerCase();

      // Permission check: only allow admins to list blocked users.
      if (
        !current_username ||
        !c.env.ADMIN_USERNAMES.includes(current_username)
      ) {
        return await c.reply('⚠️ 只有管理员可以使用 /list_blocked 命令。');
      }

      try {
        const blockedUsers = await list_blocked_users(c.env.DB);
        if (blockedUsers.length === 0) {
          return await c.reply('当前没有被封禁的用户。');
        }
        let message = '🚫 *被封禁的用户列表*: \n\n';
        for (const user of blockedUsers) {
          const identifier =
            `用户名：${user.username && '@' + user.username} 用户 chat_id: ${user.chat_id && `(ID: ${user.chat_id})`}`.trim();
          message += `- ${identifier}\n`;
        }
        await c.reply(MessageFormatter.escapeMd(message), {
          parse_mode: 'MarkdownV2',
        });
      } catch (e) {
        console.error('Error listing blocked users:', e);
        await c.reply('列出被封禁用户时发生错误，请稍后再试。');
      }
    });
  }
}

/**
 * File upload handler for the bot.
 */
class FileUploadHandler {
  constructor(private storage: StorageManager) {}
  setup_upload_handler(bot: Bot) {
    // media includes photo and video: https://grammy.dev/guide/filter-queries#media
    bot.on('message:media', async (c) => {
      await this.#handle_media_upload(c);
    });

    // audio files
    bot.on('message:audio', async (c) => {
      await this.#handle_audio_upload(c);
    });

    // document files
    bot.on('message:document', async (c) => {
      await this.#handle_document_upload(c);
    });
  }

  async #handle_media_upload(c: Context) {
    if (!c.message) return;

    const media = c.message.photo || c.message.video;
    if (!media) {
      return await c.reply(
        '您发送的视频或者图片无效，请将问题报告到 https://github.com/fwqaaq/telegram-to-r2。',
      );
    }

    if (Array.isArray(media)) {
      // Photo array — pick the largest size
      const photo = media[media.length - 1];
      const key = `${photo.file_unique_id}.jpg`;
      await this.#uploadFromTelegram(c, {
        file_id: photo.file_id,
        file_type: FileType.IMAGES,
        key,
        content_type: 'image/jpeg',
      });
    } else {
      // Video
      const video = media;
      const key = video.file_name || `${video.file_unique_id}.mp4`;
      await this.#uploadFromTelegram(c, {
        file_id: video.file_id,
        file_type: FileType.IMAGES,
        key,
        content_type: video.mime_type || 'video/mp4',
      });
    }
  }

  async #handle_audio_upload(c: Context) {
    if (!c.message) return;
    const audio = c.message.audio;
    if (!audio) {
      return await c.reply('您未发送有效的音频文件');
    }

    const key = audio.file_name || `${audio.file_unique_id}.mp3`;
    await this.#uploadFromTelegram(c, {
      file_id: audio.file_id,
      file_type: FileType.MUSIC,
      key,
      content_type: audio.mime_type || 'audio/mpeg',
    });
  }

  async #handle_document_upload(c: Context) {
    if (!c.message) return;
    const document = c.message.document;
    if (!document) {
      return await c.reply('您未发送有效的文件。');
    }

    const key = document.file_name || `${document.file_unique_id}`;
    await this.#uploadFromTelegram(c, {
      file_id: document.file_id,
      file_type: FileType.DOCUMENTS,
      key,
      content_type: document.mime_type || 'application/octet-stream',
    });
  }

  async #uploadFromTelegram(
    c: Context,
    params: {
      file_id: string;
      file_type: FileType;
      key: string;
      content_type: string;
    },
  ) {
    const { file_id, file_type, key, content_type } = params;

    // Get file information from #fetch_telegram_file
    const file = await this.#fetch_telegram_file(c, file_id);
    if (!file) return;

    // Get uploader information
    const uploader = c.from?.username?.toLowerCase() || 'unknown';
    const uploaded_information: UploadedFileInfo = {
      key,
      file_type,
      file_buffer: file,
      content_type,
      author: uploader,
    };

    try {
      const result = await this.storage.upload_file(uploaded_information);
      await c.reply(MessageFormatter.format_upload_success(result), {
        parse_mode: 'MarkdownV2',
      });
    } catch (err) {
      console.error('[Error uploading file to R2]:', err);
      await c.reply(
        `上传文件时出错（${(err as Error).message}）。如果问题持续存在，请将问题报告到 https://github.com/fwqaaq/telegram-to-r2。`,
      );
    }
  }

  async #fetch_telegram_file(c: Context, file_id: string) {
    try {
      // Get file information from Telegram API
      const file = await c.api.getFile(file_id);

      // Construct the file URL to download the file
      const fileUrl = `https://api.telegram.org/file/bot${c.env.BOT_TOKEN}/${file.file_path}`;
      const response = await fetch(fileUrl);

      if (!response.ok) {
        await c.reply(`❌ 下载失败 (HTTP ${response.status})`);
        return null;
      }

      return await response.arrayBuffer();
    } catch (e) {
      let errorMessage = '❌ 下载失败:';
      if (e instanceof GrammyError) {
        errorMessage += ` ${e.description}`;
      } else {
        errorMessage += ` ${e instanceof Error ? e.message : String(e)}`;
      }
      await c.reply(errorMessage).catch(() => {});
      console.error('Error fetching Telegram file:', e);
      return null;
    }
  }
}

export class TelegramBotBuilder {
  #bot: Bot;
  #storage: StorageManager;
  #commandHandler: BotCommandHandler;
  #uploadHandler: FileUploadHandler;

  constructor(token: string, env: Env) {
    this.#bot = new Bot(token);
    this.#storage = new StorageManager(env);
    this.#commandHandler = new BotCommandHandler(this.#storage);
    this.#uploadHandler = new FileUploadHandler(this.#storage);

    // set the env in the context
    this.#bot.use(async (c, next) => {
      c.env = env;
      await next();
    });
  }

  with_authorization() {
    this.#bot.use(async (c, next) => {
      const current_username = c.from?.username?.toLowerCase();

      const chat_id = c.from?.id;

      try {
        const is_banned = await is_user_banned(
          c.env.DB,
          chat_id,
          current_username,
        );
        if (is_banned) {
          return await c.reply('🚫 您的账号已被系统封禁，无法使用此机器人。');
        }
      } catch (e) {
        console.error('D1 Blacklist check failed:', e);
      }

      return await next();
    });

    return this;
  }

  with_commands() {
    this.#commandHandler.setup_commands(this.#bot);
    return this;
  }

  with_upload_handler() {
    this.#uploadHandler.setup_upload_handler(this.#bot);
    return this;
  }

  with_builder(): Bot {
    return this.#bot;
  }
}
