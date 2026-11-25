/**
 * File storage for uploaded sources (architect plans, later renders and media).
 *
 * A small driver interface so the local-disk driver used in development can be
 * swapped for S3 / R2 without touching callers. Files never go into Postgres:
 * callers keep only the storage key.
 *
 * Driver selection: STORAGE_DRIVER=local (default) or r2 (lib/storageR2.ts, needs R2_* variables). Local files live under
 * STORAGE_LOCAL_DIR, default "<cwd>/.storage" (gitignored).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { r2FromEnv } from "./storageR2";

export interface PutOptions {
  contentType?: string;
}

export interface Storage {
  /** Store bytes under a key ("plans/<unitTypeId>/<file>"). Overwrites. */
  put(key: string, data: Uint8Array, opts?: PutOptions): Promise<void>;
  /** The stored bytes, or null when the key does not exist. */
  get(key: string): Promise<Buffer | null>;
  /**
   * A URL for the object: file:// for the local driver (for server-side tools),
   * a public or signed https URL for cloud drivers. Not for direct browser use
   * with the local driver; serve through an authenticated route instead.
   */
  url(key: string): string;
}

const KEY_RE = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;

/** Throws on keys that could escape the storage root or are not portable to S3. */
export function assertKey(key: string): void {
  if (!KEY_RE.test(key) || key.split("/").some((p) => p === "." || p === "..")) {
    throw new Error(`Invalid storage key: ${JSON.stringify(key)}`);
  }
}

/** A file name reduced to characters that are safe inside a storage key. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+/, "").slice(-100);
  return cleaned || "file";
}

export class LocalDiskStorage implements Storage {
  constructor(private readonly root: string) {}

  private file(key: string): string {
    assertKey(key);
    return path.join(this.root, ...key.split("/"));
  }

  async put(key: string, data: Uint8Array): Promise<void> {
    const f = this.file(key);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, data);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.file(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  url(key: string): string {
    return pathToFileURL(this.file(key)).href;
  }
}

let instance: Storage | null = null;

export function getStorage(): Storage {
  if (instance) return instance;
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver === "r2") { instance = r2FromEnv(); return instance; }
  if (driver !== "local") throw new Error(`Unsupported STORAGE_DRIVER: ${driver}`);
  // turbopackIgnore: a runtime data folder, not code; without it the build traces the whole project
  instance = new LocalDiskStorage(path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_LOCAL_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), ".storage")));
  return instance;
}
