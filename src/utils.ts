import { type FileInfo, FileType, type UploadResult } from './type';

export function file_type_to_string(file_type: FileType): string {
  switch (file_type) {
    case FileType.MUSIC:
      return '音频';
    case FileType.DOCUMENTS:
      return '文档';
    case FileType.IMAGES:
      return '图片/视频';
    default:
      return '其他类型';
  }
}

export class MessageFormatter {
  /**
   * 转义 MarkdownV2 特殊字符
   */
  static escapeMd(text: string): string {
    // 仅转义 MarkdownV2 规定的特殊字符
    return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
  }

  static format_file_list(files: FileInfo[], file_type: FileType): string {
    const file_type_str = file_type_to_string(file_type);

    // 这里的文字是固定的，不需要转义（除非包含特殊符号）
    let message = `📂 *R2 存储中的 ${this.escapeMd(file_type_str)} 列表*\n`;
    message += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    for (const file of files) {
      const dateStr = new Date(file.uploaded).toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
      });
      const sizeStr = (file.size / 1024).toFixed(2);

      // 注意：`文件名` 放在代码块内通常不需要转义，但为了稳妥，外部的 . 和 - 必须转义
      message += `📄 \`${file.key}\`\n`;
      message += `├ 👤 *上传者:* ${this.escapeMd(file.author)}\n`;
      message += `├ 📏 *大小:* ${this.escapeMd(sizeStr)} KB\n`;
      message += `├ 🕒 *时间:* ${this.escapeMd(dateStr)}\n`;
      const escaped_url = file.url.replace(/[)\\]/g, '\\$&');
      message += `└ 🔗 [查看文件](${escaped_url})\n\n`;
    }

    return message;
  }

  static format_upload_success(file: UploadResult): string {
    const size_kb = (file.size / 1024).toFixed(2);
    const dateStr = new Date(file.uploaded).toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
    });

    // 这里的样式模仿了“卡片”效果
    return [
      `✅ *文件上传成功*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `📄 *文件名:* \`${file.key}\``, // 这里的 key 不需要 escape，因为在反引号里
      `👤 *上传者:* ${this.escapeMd(file.author)}`,
      `📏 *文件大小:* ${this.escapeMd(size_kb)} KB`,
      `🕒 *上传时间:* ${this.escapeMd(dateStr)}`,
      ``,
      `🔗 [点击此处访问文件](${file.url})`, // URL 不需要 escape
    ].join('\n');
  }

  static get_help_message(): string {
    return (
      '可用命令:\n' +
      '/start - 欢迎信息\n' +
      '/help - 帮助信息\n' +
      '/list - 列出存储中的文件（示例：/list -t music）\n' +
      '/delete - 删除存储中的文件（示例：/delete key）\n' +
      '管理员命令:\n' +
      '/block - 封禁用户（示例：/block @username 或 回复用户消息并发送 /block）\n' +
      '/unblock - 解封用户（示例：/unblock @username 或 回复用户消息并发送 /unblock）\n' +
      '/list_blocked - 列出被封禁的用户\n'
    );
  }
}

/**
 * Parse command arguments in the format: -t(ype) value -u(username) value
 * Example: -t music -u fwqaaq
 * Returns: { t: 'music', u: 'fwqaaq' }
 * @param text string
 */
export function arguments_parser(text: string) {
  const args: Record<string, string> = {};
  const regex = /-([a-zA-Z])\s+([^\s-]+)/g;

  let m;
  while ((m = regex.exec(text)) !== null) {
    args[m[1]] = m[2];
  }
  return args;
}
