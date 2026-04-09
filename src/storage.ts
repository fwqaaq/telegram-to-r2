import type {
  Env,
  FileInfo,
  StorageConfig,
  UploadedFileInfo,
  UploadResult,
} from './type';
import { FileType } from './type';

export default class StorageManager {
  #music_config: StorageConfig;
  #images_config: StorageConfig;
  #documents_config: StorageConfig;

  constructor(env: Env) {
    this.#music_config = {
      bucket: env.R2_BUCKET_AUDIO,
      base_url: env.LINK.AUDIO.replace(/\/+$/, '') + '/',
    };
    this.#images_config = {
      bucket: env.R2_BUCKET_IMAGE,
      base_url: env.LINK.IMAGE.replace(/\/+$/, '') + '/',
    };
    this.#documents_config = {
      bucket: env.R2_BUCKET_DOC,
      base_url: env.LINK.DOC.replace(/\/+$/, '') + '/',
    };
  }

  #get_config(file_type: FileType): StorageConfig {
    switch (file_type) {
      case FileType.MUSIC:
        return this.#music_config;
      case FileType.IMAGES:
        return this.#images_config;
      case FileType.DOCUMENTS:
        return this.#documents_config;
      default:
        return this.#documents_config;
    }
  }

  async list_files(
    file_type: FileType,
    uploaded_by: string,
  ): Promise<FileInfo[]> {
    const config = this.#get_config(file_type);
    const options = {
      limit: 50,
      include: ['customMetadata'],
    };

    const files: FileInfo[] = [];
    let turncated = true;
    let cursor: string | undefined = undefined;
    while (turncated) {
      const objects = await config.bucket.list({ ...options, cursor });
      for (const { key, size, uploaded, customMetadata } of objects.objects) {
        if (
          uploaded_by !== 'all' &&
          customMetadata?.uploadedBy !== uploaded_by
        ) {
          continue;
        }

        files.push({
          key,
          size,
          uploaded: uploaded.toLocaleString(),
          author: customMetadata?.uploadedBy || '未知',
          url: config.base_url.concat(encodeURIComponent(key)),
        });
      }

      turncated = objects.truncated;
      cursor = objects.truncated ? objects.cursor : undefined;
    }
    return files;
  }

  async upload_file(info: UploadedFileInfo): Promise<UploadResult> {
    const { key, file_type, file_buffer, content_type, author } = info;
    const config = this.#get_config(file_type);

    const o = await config.bucket.put(key, file_buffer, {
      httpMetadata: { contentType: content_type },
      customMetadata: {
        originalName: key,
        uploadedBy: author,
        uploadedAt: new Date().toISOString(),
      },
    });

    return {
      key: o.key,
      size: o.size,
      uploaded: o.uploaded.toLocaleString(),
      author,
      url: config.base_url.concat(encodeURIComponent(o.key)),
    };
  }
}
