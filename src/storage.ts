import type { Env, FileInfo, UploadedFileInfo, UploadResult } from './type';
import { FileType } from './type';

export default class StorageManager {
  #bucket: R2Bucket;
  #base_url: string;

  constructor(env: Env) {
    this.#bucket = env.R2_BUCKET;
    this.#base_url = env.BASE_URL.replace(/\/+$/, '') + '/';
  }

  /**
   * build Key: username/file_type/filename
   */
  #build_key(author: string, file_type: FileType, filename: string): string {
    return `${author}/${file_type}/${filename}`;
  }

  async list_files(
    file_type: FileType,
    target_user: string,
  ): Promise<FileInfo[]> {
    // If target_user is 'all', list all files; otherwise, list files for the specific user, optionally filtered by file_type
    const prefix =
      target_user === 'all'
        ? ''
        : [target_user, file_type]
            .filter((p) => p && p !== FileType.NULL)
            .join('/') + '/';

    const options = {
      limit: 50,
      prefix,
      include: ['customMetadata'],
    };

    const files: FileInfo[] = [];
    let truncated = true;
    let cursor: string | undefined = undefined;

    while (truncated) {
      const objects: R2Objects = await this.#bucket.list({
        ...options,
        cursor,
      });
      for (const { key, size, uploaded, customMetadata } of objects.objects) {
        // if admin wants to list all files but file_type is specified, filter files by file_type
        if (target_user === 'all' && file_type !== FileType.NULL) {
          const parts = key.split('/');
          if (parts[1] !== file_type) continue;
        }

        files.push({
          key, // the full key with path, e.g. "fwqaaq/audio/song.mp3"
          size,
          uploaded: uploaded.toLocaleString(),
          author: customMetadata?.uploadedBy || key.split('/')[0], // extract author from metadata or fallback to the first part of the key
          url: this.#base_url.concat(encodeURIComponent(key)),
        });
      }
      truncated = objects.truncated;
      cursor = objects.truncated ? objects.cursor : undefined;
    }
    return files;
  }

  async upload_file(info: UploadedFileInfo): Promise<UploadResult> {
    const {
      key: filename,
      file_type,
      file_buffer,
      content_type,
      author,
    } = info;

    // 生成带层级的完整 Key
    const fullKey = this.#build_key(author, file_type, filename);

    const o = await this.#bucket.put(fullKey, file_buffer, {
      httpMetadata: { contentType: content_type },
      customMetadata: {
        originalName: filename,
        uploadedBy: author,
        uploadedAt: new Date().toISOString(),
      },
    });

    return {
      key: o.key,
      size: o.size,
      uploaded: o.uploaded.toLocaleString(),
      author,
      url: this.#base_url.concat(encodeURIComponent(o.key)),
    };
  }
}
