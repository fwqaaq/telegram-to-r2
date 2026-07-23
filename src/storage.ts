import type { Env, FileInfo, UploadedFileInfo, UploadResult } from "./type";
import { FileType } from "./type";

/** Returns true when B2 env vars are present */
function isB2Enabled(env: Env): boolean {
  return !!(env.B2_KEY_ID && env.B2_APP_KEY);
}

// ─── B2 Native API helpers ──────────────────────────────────────────

async function b2Authorize(keyId: string, appKey: string) {
  const res = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
    headers: { Authorization: `Basic ${btoa(`${keyId}:${appKey}`)}` },
  });
  if (!res.ok) throw new Error(`B2 auth failed: ${res.status}`);
  const data = (await res.json()) as { authorizationToken: string; apiUrl: string; downloadUrl: string };
  return data;
}

async function b2GetBucketId(apiUrl: string, authToken: string, bucketName: string) {
  const res = await fetch(`${apiUrl}/b2api/v2/b2_list_buckets`, {
    method: "POST",
    headers: { Authorization: authToken, "Content-Type": "application/json" },
    body: JSON.stringify({ bucketName }),
  });
  if (!res.ok) throw new Error(`B2 list_buckets: ${res.status}`);
  const data = (await res.json()) as { buckets: { bucketId: string }[] };
  return data.buckets[0]?.bucketId;
}

async function b2Upload(env: Env, key: string, body: ArrayBuffer, contentType: string) {
  const auth = await b2Authorize(env.B2_KEY_ID!, env.B2_APP_KEY!);
  const bucketName = env.B2_BUCKET_NAME || "telegram-to-r2";
  const bucketId = await b2GetBucketId(auth.apiUrl, auth.authorizationToken, bucketName);
  if (!bucketId) throw new Error(`B2 bucket "${bucketName}" not found`);

  const urlRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_upload_url`, {
    method: "POST",
    headers: { Authorization: auth.authorizationToken, "Content-Type": "application/json" },
    body: JSON.stringify({ bucketId }),
  });
  if (!urlRes.ok) throw new Error(`B2 get_upload_url: ${urlRes.status}`);
  const { uploadUrl } = (await urlRes.json()) as { uploadUrl: string };

  const sha1 = await crypto.subtle.digest("SHA-1", body);
  const sha1Hex = [...new Uint8Array(sha1)].map(b => b.toString(16).padStart(2, "0")).join("");

  const upRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: auth.authorizationToken,
      "X-Bz-File-Name": encodeURIComponent(key),
      "Content-Type": "b2/x-auto",
      "X-Bz-Content-Sha1": sha1Hex,
    },
    body,
  });
  if (!upRes.ok) throw new Error(`B2 upload: ${upRes.status}`);
  return upRes.json() as Promise<{ fileName: string; contentLength: number; uploadTimestamp: number }>;
}

async function b2ListFiles(env: Env, prefix: string): Promise<{ key: string; size: number; uploadTimestamp: number }[]> {
  const auth = await b2Authorize(env.B2_KEY_ID!, env.B2_APP_KEY!);
  const bucketName = env.B2_BUCKET_NAME || "telegram-to-r2";
  const bucketId = await b2GetBucketId(auth.apiUrl, auth.authorizationToken, bucketName);
  if (!bucketId) throw new Error(`B2 bucket "${bucketName}" not found`);

  const res = await fetch(`${auth.apiUrl}/b2api/v2/b2_list_file_names`, {
    method: "POST",
    headers: { Authorization: auth.authorizationToken, "Content-Type": "application/json" },
    body: JSON.stringify({ bucketId, prefix, maxFileCount: 1000 }),
  });
  if (!res.ok) throw new Error(`B2 list: ${res.status}`);
  const data = (await res.json()) as { files: { fileName: string; size: number; uploadTimestamp: number }[] };
  return data.files;
}

// ─── Storage Manager (R2 default, B2 optional) ───────────────────────

export default class StorageManager {
  #env: Env;
  #bucket: R2Bucket;
  #base_url: string;

  constructor(env: Env) {
    this.#env = env;
    this.#bucket = env.R2_BUCKET;
    this.#base_url = env.BASE_URL.replace(/\/+$/, "") + "/";
  }

  #build_key(author: string, file_type: FileType, filename: string): string {
    return `${author}/${file_type}/${filename}`;
  }

  #encode_key(key: string): string {
    return key.split("/").map(encodeURIComponent).join("/");
  }

  async list_files(file_type: FileType, target_user: string): Promise<FileInfo[]> {
    const prefix = target_user === "all" ? "" : [target_user, file_type]
      .filter((p) => p && p !== FileType.NULL).join("/") + "/";

    if (isB2Enabled(this.#env)) {
      const files = await b2ListFiles(this.#env, prefix);
      return files.map(({ fileName, size, uploadTimestamp }) => ({
        key: fileName,
        size,
        uploaded: new Date(uploadTimestamp).toLocaleString(),
        author: fileName.split("/")[0],
        url: this.#base_url + this.#encode_key(fileName),
      }));
    }

    // Default: R2
    const r2Files: FileInfo[] = [];
    let truncated = true;
    let cursor: string | undefined = undefined;
    while (truncated) {
      const objects: R2Objects = await this.#bucket.list({ limit: 50, prefix, include: ["customMetadata"], cursor });
      for (const { key, size, uploaded, customMetadata } of objects.objects) {
        if (target_user === "all" && file_type !== FileType.NULL) {
          if (key.split("/")[1] !== file_type) continue;
        }
        r2Files.push({
          key, size,
          uploaded: uploaded.toLocaleString(),
          author: customMetadata?.uploadedBy || key.split("/")[0],
          url: this.#base_url.concat(this.#encode_key(key)),
        });
      }
      truncated = objects.truncated;
      cursor = objects.truncated ? objects.cursor : undefined;
    }
    return r2Files;
  }

  async upload_file(info: UploadedFileInfo): Promise<UploadResult> {
    const { key: filename, file_type, file_buffer, content_type, author } = info;
    const fullKey = this.#build_key(author, file_type, filename);

    if (isB2Enabled(this.#env)) {
      const buf = file_buffer instanceof ArrayBuffer ? file_buffer
        : file_buffer instanceof Blob ? await file_buffer.arrayBuffer()
        : file_buffer instanceof ReadableStream ? await new Response(file_buffer).arrayBuffer()
        : typeof file_buffer === "string" ? new TextEncoder().encode(file_buffer).buffer
        : new ArrayBuffer(0);

      const r = await b2Upload(this.#env, fullKey, buf, content_type);
      return {
        key: r.fileName, size: r.contentLength,
        uploaded: new Date(r.uploadTimestamp).toLocaleString(),
        author, url: this.#base_url + this.#encode_key(r.fileName), content_type,
      };
    }

    // Default: R2
    const o = await this.#bucket.put(fullKey, file_buffer, {
      httpMetadata: { contentType: content_type },
      customMetadata: { originalName: filename, uploadedBy: author, uploadedAt: new Date().toISOString() },
    });
    return {
      key: o.key, size: o.size,
      uploaded: o.uploaded.toLocaleString(),
      author, url: this.#base_url.concat(this.#encode_key(o.key)), content_type,
    };
  }
}
