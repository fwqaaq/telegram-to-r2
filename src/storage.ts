import type {
  Env,
  FileInfo,
  StorageConfig,
  UploadedFileInfo,
  UploadResult,
} from "./type";
import { FileType } from "./type";

export default class StorageManager {
  #music_config: StorageConfig;
  #images_config: StorageConfig;
  #documents_config: StorageConfig;

  constructor(env: Env) {
    this.#music_config = {
      bucket: env.R2_BUCKET_AUDIO,
      base_url: env.LINK.AUDIO.replace(/\/+$/, "") + "/",
    };
    this.#images_config = {
      bucket: env.R2_BUCKET_IMAGE,
      base_url: env.LINK.IMAGE.replace(/\/+$/, "") + "/",
    };
    this.#documents_config = {
      bucket: env.R2_BUCKET_DOC,
      base_url: env.LINK.DOC.replace(/\/+$/, "") + "/",
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

  async list_files(file_type: FileType): Promise<FileInfo[]> {
    const config = this.#get_config(file_type);
    const options = { limit: 50 } satisfies R2ListOptions;

    const files: FileInfo[] = [];
    let turncated = true;
    let cursor: string | undefined = undefined;
    while (turncated) {
      const objects = await config.bucket.list({ ...options, cursor });
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
    info: UploadedFileInfo,
  ): Promise<UploadResult> {
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
      url: config.base_url.concat(encodeURIComponent(o.key)),
    };
  }
}
