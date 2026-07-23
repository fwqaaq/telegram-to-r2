export interface Env {
  R2_BUCKET: R2Bucket;
  BASE_URL: string;

  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  ADMIN_USERNAMES: string[];
  DB: D1Database;

  // Optional: Backblaze B2 credentials.
  // When B2_KEY_ID and B2_APP_KEY are set, B2 is used instead of R2.
  B2_KEY_ID?: string;
  B2_APP_KEY?: string;
  B2_BUCKET_NAME?: string;
}

export enum FileType {
  MUSIC = "music",
  IMAGES = "images",
  VIDEOS = "videos",
  DOCUMENTS = "documents",
  NULL = "null", // All files without specific type
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

export type UploadResult = FileInfo & { content_type: string };
