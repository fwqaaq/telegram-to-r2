export interface LINK {
  AUDIO: string;
  IMAGE: string;
  DOC: string;
  OTHERS: string;
}

export interface Env {
  R2_BUCKET_AUDIO: R2Bucket;
  R2_BUCKET_IMAGE: R2Bucket;
  R2_BUCKET_DOC: R2Bucket;

  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  USERNAMES: string[];
  LINK: LINK;
}

export enum FileType {
  MUSIC = "music",
  IMAGES = "images",
  DOCUMENTS = "documents",
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
