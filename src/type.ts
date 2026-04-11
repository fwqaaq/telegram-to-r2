export interface LINK {
  AUDIO: string;
  IMAGE: string;
  DOC: string;
  OTHERS: string;
}

export interface Env {
  R2_BUCKET: R2Bucket;
  BASE_URL: string;

  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  USERNAMES: string[];
  ADMIN_USERNAMES: string[];
  DB: D1Database;
}

export enum FileType {
  MUSIC = 'music',
  IMAGES = 'images',
  DOCUMENTS = 'documents',
  NULL = 'null', // All files without specific type
}

export interface StorageConfig {
  bucket: R2Bucket;
  base_url: string;
}

export interface FileInfo {
  key: string;
  size: number;
  uploaded: string;
  url: string;
  author: string;
}

export type UploadedFileInfo = {
  key: string;
  file_type: FileType;
  file_buffer:
    | ReadableStream
    | ArrayBuffer
    | ArrayBufferView
    | string
    | null
    | Blob;
  content_type: string;
  author: string;
};

export type UploadResult = FileInfo;
