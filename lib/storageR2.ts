/**
 * Cloudflare R2 driver (S3-compatible, SigV4 signed by aws4fetch). Built and
 * tested but INACTIVE until STORAGE_DRIVER=r2 and these variables are set:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 *   R2_PUBLIC_BASE_URL   (optional) public bucket / custom domain used by url()
 * No Cloudflare account is needed for local development (the local driver is the default).
 */
import { AwsClient } from "aws4fetch";
import { assertKey, type PutOptions, type Storage } from "./storage";

export type R2Config = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string; publicBaseUrl?: string };

export class R2Storage implements Storage {
  private client: AwsClient;
  private endpoint: string;
  constructor(private cfg: R2Config, private doFetch: typeof fetch = (input, init) => fetch(input, init)) {
    this.client = new AwsClient({ accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, service: "s3", region: "auto" });
    this.endpoint = `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}`;
  }

  private objectUrl(key: string) {
    assertKey(key);
    return `${this.endpoint}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }

  async put(key: string, data: Uint8Array, opts?: PutOptions): Promise<void> {
    const signed = await this.client.sign(this.objectUrl(key), {
      method: "PUT", body: data as BodyInit, headers: { "Content-Type": opts?.contentType ?? "application/octet-stream" },
    });
    const res = await this.doFetch(signed);
    if (!res.ok) throw new Error(`R2 put failed (${res.status}) for ${key}`);
  }

  async get(key: string): Promise<Buffer | null> {
    const res = await this.doFetch(await this.client.sign(this.objectUrl(key), { method: "GET" }));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`R2 get failed (${res.status}) for ${key}`);
    return Buffer.from(await res.arrayBuffer());
  }

  url(key: string): string {
    assertKey(key);
    return this.cfg.publicBaseUrl ? `${this.cfg.publicBaseUrl.replace(/\/$/, "")}/${key}` : this.objectUrl(key);
  }
}

export function r2FromEnv(env: Record<string, string | undefined> = process.env): R2Storage {
  const need = (k: string) => {
    const v = env[k];
    if (!v) throw new Error(`STORAGE_DRIVER=r2 needs ${k}`);
    return v;
  };
  return new R2Storage({
    accountId: need("R2_ACCOUNT_ID"), accessKeyId: need("R2_ACCESS_KEY_ID"), secretAccessKey: need("R2_SECRET_ACCESS_KEY"),
    bucket: need("R2_BUCKET"), publicBaseUrl: env.R2_PUBLIC_BASE_URL,
  });
}
