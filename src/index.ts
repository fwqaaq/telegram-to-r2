/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { Bot, webhookCallback, type Context } from 'grammy';

interface Env {
	R2_BUCKET: R2Bucket;
	R2_BUCKET_IMAGES: R2Bucket;
	BOT_TOKEN: string;
	WEBHOOK_SECRET: string;
	USERNAMES: string[];
	LINK: string;
}

// explore Env for grammy context
declare module 'grammy' {
	interface Context {
		env: Env;
	}
}

enum FileType {
	MUSIC = 'music',
	IMAGES = 'images',
}

interface StorageConfig {
	bucket: R2Bucket;
	base_url: string;
}

interface FileInfo {
	key: string;
	size: number;
	uploaded: string;
	url: string;
}

type UploadResult = FileInfo;

class StorageManager {
	#music_config: StorageConfig;
	#images_config: StorageConfig;

	constructor(env: Env) {
		this.#music_config = {
			bucket: env.R2_BUCKET,
			base_url: env.LINK,
		};
		this.#images_config = {
			bucket: env.R2_BUCKET_IMAGES,
			base_url: env.LINK.replace('music', 'img'),
		};
	}

	#get_config(file_type: FileType): StorageConfig {
		return file_type === FileType.MUSIC
			? this.#music_config
			: this.#images_config;
	}

	async list_files(file_type: FileType): Promise<FileInfo[]> {
		const config = this.#get_config(file_type);
		const options = {
			limit: 50,
			include: ['customMetadata'],
		} satisfies R2ListOptions;

		const files: FileInfo[] = [];
		let turncated = true;
		let cursor: string | undefined = undefined;
		while (turncated) {
			const objects = await config.bucket.list({ ...options, cursor });
			turncated = objects.truncated;
			cursor = objects.truncated ? objects.cursor : undefined;

			for (const obj of objects.objects) {
				files.push({
					key: obj.key,
					size: obj.size,
					uploaded: obj.uploaded.toLocaleString(),
					url: config.base_url.concat(encodeURIComponent(obj.key)),
				});
			}

			turncated = objects.truncated;
			cursor = objects.truncated ? objects.cursor : undefined;
		}
		return files;
	}

	async upload_file(
		key: string,
		file_type: FileType,
		file_buffer:
			| ReadableStream
			| ArrayBuffer
			| ArrayBufferView
			| string
			| null
			| Blob,
		content_type: string,
		author?: string
	): Promise<UploadResult> {
		const config = this.#get_config(file_type);

		const o = await config.bucket.put(key, file_buffer, {
			httpMetadata: { contentType: content_type },
			customMetadata: {
				originalName: key,
				uploadedBy: author || 'unknown',
				uploadedAt: new Date().toISOString(),
			},
		});

		return {
			key: o.key,
			size: o.size,
			uploaded: o.uploaded.toLocaleString(),
			url: config.base_url.concat(encodeURIComponent(o.key)),
		};
	}
}

class MessageFormatter {
	static format_file_list(files: FileInfo[], file_type: FileType): string {
		let message = `R2 存储中的 ${
			file_type === FileType.MUSIC ? '音乐' : '图片'
		}文件：\n\n`;
		for (const file of files) {
			message += `${file.key}\n`;
			message += `   大小: ${(file.size / 1024).toFixed(2)} KB\n`;
			message += `   修改时间: ${file.uploaded}\n\n`;
			message += `   地址: ${file.url}\n\n`;
		}
		return message;
	}

	static format_upload_success(
		file: UploadResult,
		file_type: FileType
	): string {
		const size_kb = (file.size / 1024).toFixed(2);
		return (
			`文件上传成功！\n\n` +
			`文件名: ${file.key}\n` +
			`大小: ${size_kb} KB\n` +
			`上传时间: ${file.uploaded.toLocaleString()}\n\n` +
			`访问链接: ${file.url}\n\n`
		);
	}

	static get_help_message(): string {
		return (
			'可用命令:\n' +
			'/start - 欢迎信息\n' +
			'/help - 帮助信息\n' +
			'/list - 列出存储中的文件\n' +
			'发送音频文件将自动上传到 R2 存储\n' +
			'/delete - 删除存储中的文件\n'
		);
	}
}

/**
 * Command handler for bot basic commands.
 * @returns
 */
class BotCommandHandler {
	constructor(private storage: StorageManager) {}
	setup_commands(bot: Bot) {
		bot.command('start', (c) => c.reply('Welcome! I am a cloudflare R2 bot!'));
		bot.command('help', (c) => c.reply(MessageFormatter.get_help_message()));
		bot.command('list', async (c) => {
			if (!c.message)
				return await c.reply('请使用 /list 命令来列出存储中的文件。');
			const param = c.message.text.split(' ')[1] || 'music'; // Default to 'music' if no parameter is provided
			if (param !== 'music' && param !== 'images') {
				return await c.reply(
					'请使用 /list music 或 /list images 来列出存储中的文件。'
				);
			}
			const fileType = param === 'music' ? FileType.MUSIC : FileType.IMAGES;
			const files = await this.storage.list_files(fileType);
			const message = MessageFormatter.format_file_list(files, fileType);
			await c.reply(message);
		});
		bot.command('delete', async (c) => {
			if (!c.message?.text) {
				return await c.reply(
					'请使用 /delete 命令来删除文件，例如：/delete filename.txt'
				);
			}
			const key = c.message.text.split(' ').slice(1).join(' ');
			const fileType = key.includes('mp3') ? FileType.MUSIC : FileType.IMAGES;
			const bucket =
				fileType === FileType.MUSIC ? c.env.R2_BUCKET : c.env.R2_BUCKET_IMAGES;

			if (!key) {
				return await c.reply(
					'请提供要删除的文件名，例如：/delete filename.txt'
				);
			}

			try {
				await bucket.delete(key);
				await c.reply(`文件 ${key} 已成功删除。`);
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
		bot.on('message:photo', async (c) => {
			await this.#handle_photo_upload(c);
		});
		// Handle audio and video uploads
		bot.filter(
			(ctx) => !!(ctx.message?.audio || ctx.message?.video),
			async (ctx) => {
				await this.#handle_media_upload(ctx);
			}
		);
	}
	async #handle_photo_upload(c: Context) {
		if (!c.message?.photo) return;
		// Get the highest resolution photo
		const photo = c.message.photo[c.message.photo.length - 1];
		const uploader = c.from?.username;

		try {
			await c.reply('正在上传图片，请稍候...');
			const file = await this.#fetch_telegram_file(c, photo.file_id);
			const file_name = await this.storage.upload_file(
				photo.file_unique_id + '.jpg',
				FileType.IMAGES,
				file,
				'image/jpeg',
				uploader || 'unknown'
			);
			await c.reply(
				MessageFormatter.format_upload_success(file_name, FileType.IMAGES)
			);
		} catch (error) {
			await c.reply('上传图片时出错，请稍后再试。');
			console.error('Error uploading photo:', error);
		}
	}

	async #handle_media_upload(c: Context) {
		if (!c.message?.audio && !c.message?.video) return;
		const file = c.message.audio || c.message.video;
		if (!file) return;
		const fileName = file.file_name || `file_${Date.now()}`;
		const uploader = c.from?.username;
		const file_type = c.message.audio ? FileType.MUSIC : FileType.IMAGES;
		try {
			await c.reply('正在上传文件，请稍候...');
			const file_buffer = await this.#fetch_telegram_file(c, file.file_id);
			const file_name = await this.storage.upload_file(
				fileName,
				file_type,
				file_buffer,
				file.mime_type || 'audio/mpeg',
				uploader || 'unknown'
			);
			await c.reply(
				MessageFormatter.format_upload_success(file_name, file_type)
			);
		} catch (error) {
			await c.reply('上传文件时出错，请稍后再试。');
			console.error('Error uploading media:', error);
		}
	}

	async #fetch_telegram_file(c: Context, file_id: string) {
		const file = await c.api.getFile(file_id);
		const file_url = `https://api.telegram.org/file/bot${c.env.BOT_TOKEN}/${file.file_path}`;
		const r = await fetch(file_url);
		if (!r.ok) {
			throw new Error(`Failed to fetch file from Telegram: ${r.statusText}`);
		}
		return r.arrayBuffer();
	}
}

class TelegramBotBuilder {
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
			if (!c.from?.username || !c.env.USERNAMES.includes(c.from.username)) {
				return await c.reply('Unauthorized user.');
			}
			await next();
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

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const bot = new TelegramBotBuilder(env.BOT_TOKEN, env)
			.with_authorization()
			.with_commands()
			.with_upload_handler()
			.with_builder();

		const handleUpdate = webhookCallback(bot, 'cloudflare-mod', {
			secretToken: env.WEBHOOK_SECRET,
		});

		// Handle the request with the bot's webhook callback
		if (request.method === 'POST') {
			// Handle the incoming update
			const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');

			if (secret !== env.WEBHOOK_SECRET) {
				return new Response('Unauthorized', { status: 401 });
			}

			return await handleUpdate(request);
		}

		if (request.method === 'GET') {
			return new Response('Telegram Webhook is set up!', { status: 200 });
		}

		return new Response('Method Not Allowed', { status: 405 });
	},
} satisfies ExportedHandler<Env>;
