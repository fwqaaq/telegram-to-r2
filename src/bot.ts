import { Bot, type Context } from "grammy";
import StorageManager from "./storage";
import { type Env, FileType, type UploadedFileInfo } from "./type";
import { MessageFormatter } from "./utils";

/**
 * Command handler for bot basic commands.
 * @returns
 */
class BotCommandHandler {
  constructor(private storage: StorageManager) {}
  setup_commands(bot: Bot) {
    bot.command("start", (c) => c.reply("Welcome! I am a cloudflare R2 bot!"));
    bot.command("help", (c) => c.reply(MessageFormatter.get_help_message()));
    bot.command("list", async (c) => {
      // default to audio
      const param = c.match || "audio";

      let file_type: FileType;
      switch (param) {
        case "audio":
          file_type = FileType.MUSIC;
          break;
        case "images":
          file_type = FileType.IMAGES;
          break;
        case "documents":
          file_type = FileType.DOCUMENTS;
          break;
        default:
          return await c.reply(
            "无效的参数。请使用 /list audio 或 /list images 或 /list documents 来列出相应类型的文件。",
          );
      }
      const files = await this.storage.list_files(file_type);
      const message = MessageFormatter.format_file_list(files, file_type);
      await c.reply(message);
    });
    bot.command("delete", async (c) => {
      if (!c.message?.text) {
        return await c.reply(
          "请使用 /delete 命令来删除文件（参数是你的 key），例如：/delete filename.txt",
        );
      }
      const key = c.match;

      if (!key) {
        return await c.reply(
          "请提供要删除的文件名，例如：/delete filename.txt",
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
  }
}

/**
 * File upload handler for the bot.
 */
class FileUploadHandler {
  constructor(private storage: StorageManager) {}
  setup_upload_handler(bot: Bot) {
    // media includes photo and video: https://grammy.dev/guide/filter-queries#media
    bot.on("message:media", async (c) => {
      await this.#handle_media_upload(c);
    });

    // audio files
    bot.on("message:audio", async (c) => {
      await this.#handle_audio_upload(c);
    });

    // document files
    bot.on("message:document", async (c) => {
      await this.#handle_document_upload(c);
    });
  }

  async #handle_media_upload(c: Context) {
    if (!c.message) return;

    const media = c.message.photo || c.message.video;
    if (!media) {
      return await c.reply(
        "您发送的视频或者图片无效，请将问题报告到 https://github.com/fwqaaq/telegram-to-r2。",
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
        content_type: "image/jpeg",
      });
    } else {
      // Video
      const video = media;
      const key = video.file_name || `${video.file_unique_id}.mp4`;
      await this.#uploadFromTelegram(c, {
        file_id: video.file_id,
        file_type: FileType.IMAGES,
        key,
        content_type: video.mime_type || "video/mp4",
      });
    }
  }

  async #handle_audio_upload(c: Context) {
    if (!c.message) return;
    const audio = c.message.audio;
    if (!audio) {
      return await c.reply("您未发送有效的音频文件");
    }

    const key = audio.file_name || `${audio.file_unique_id}.mp3`;
    await this.#uploadFromTelegram(c, {
      file_id: audio.file_id,
      file_type: FileType.MUSIC,
      key,
      content_type: audio.mime_type || "audio/mpeg",
    });
  }

  async #handle_document_upload(c: Context) {
    if (!c.message) return;
    const document = c.message.document;
    if (!document) {
      return await c.reply("您未发送有效的文件。");
    }

    const key = document.file_name || `${document.file_unique_id}`;
    await this.#uploadFromTelegram(c, {
      file_id: document.file_id,
      file_type: FileType.DOCUMENTS,
      key,
      content_type: document.mime_type || "application/octet-stream",
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
    const uploader = c.from?.username || "unknown";

    const uploaded_information: UploadedFileInfo = {
      key,
      file_type,
      file_buffer: null,
      content_type,
      author: uploader,
    };

    try {
      const file = await this.#fetch_telegram_file(c, file_id);
      uploaded_information.file_buffer = file;
      const result = await this.storage.upload_file(uploaded_information);
      await c.reply(MessageFormatter.format_upload_success(result));
    } catch (err) {
      console.error(err);
      await c.reply(
        "上传文件时出错，请稍后再试。如果问题持续存在，请将问题报告到 https://github.com/fwqaaq/telegram-to-r2。",
      );
    }
  }

  async #fetch_telegram_file(c: Context, file_id: string) {
    const file = await c.api.getFile(file_id);
    const file_url =
      `https://api.telegram.org/file/bot${c.env.BOT_TOKEN}/${file.file_path}`;
    const r = await fetch(file_url);
    if (!r.ok) {
      throw new Error(`Failed to fetch file from Telegram: ${r.statusText}`);
    }
    return r.arrayBuffer();
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
      if (
        !c.from?.username ||
        !c.env.USERNAMES.includes(c.from.username) ||
        c.env.USERNAMES[0] !== "*"
      ) {
        return await c.reply("Unauthorized user.");
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
