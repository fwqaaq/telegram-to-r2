import { type FileInfo, FileType, type UploadResult } from "./type";

export function file_type_to_string(file_type: FileType): string {
  switch (file_type) {
    case FileType.MUSIC:
      return "音频";
    case FileType.DOCUMENTS:
      return "文档";
    case FileType.IMAGES:
      return "图片/视频";
    default:
      return "其他类型";
  }
}

export class MessageFormatter {
  static format_file_list(files: FileInfo[], file_type: FileType): string {
    const file_type_str = file_type_to_string(file_type);
    let message = `R2 存储中的${file_type_str}文件：\n\n`;
    for (const file of files) {
      message += `${file.key}\n`;
      message += `   大小: ${(file.size / 1024).toFixed(2)} KB\n`;
      message += `   修改时间: ${file.uploaded}\n\n`;
      message += `   地址: ${file.url}\n\n`;
    }
    return message;
  }

  static format_upload_success(file: UploadResult): string {
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
      "可用命令:\n" +
      "/start - 欢迎信息\n" +
      "/help - 帮助信息\n" +
      "/list - 列出存储中的文件\n" +
      "发送音频文件将自动上传到 R2 存储（示例：/list images）\n" +
      "/delete - 删除存储中的文件\n"
    );
  }
}
