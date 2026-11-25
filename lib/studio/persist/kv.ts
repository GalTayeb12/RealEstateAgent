/**
 * Tiny key-value layer under the design repository: in memory for tests,
 * on top of the project's Storage driver (local disk now, R2 later) for dev.
 * Values are JSON. Keys follow the Storage key rules.
 */
import type { Storage } from "../../storage";

export interface Kv {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  /** All keys that start with `prefix`. */
  list(prefix: string): Promise<string[]>;
}

export class MemoryKv implements Kv {
  private m = new Map<string, string>();
  async get<T>(key: string) { const v = this.m.get(key); return v === undefined ? null : (JSON.parse(v) as T); }
  async set(key: string, value: unknown) { this.m.set(key, JSON.stringify(value)); }
  async delete(key: string) { this.m.delete(key); }
  async list(prefix: string) { return [...this.m.keys()].filter((k) => k.startsWith(prefix)); }
}

const INDEX = "studio/_index.json";

/** JSON values stored as objects in a Storage driver; an index object makes prefix listing possible. */
export class StorageKv implements Kv {
  private chain: Promise<unknown> = Promise.resolve();
  constructor(private storage: Storage, private root = "studio/kv") {}
  private path(key: string) { return `${this.root}/${key.replace(/[^A-Za-z0-9._/-]/g, "_")}.json`; }
  // serialise writes so the index and the value never interleave with another request in this process
  private lock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => undefined);
    return run;
  }
  private async index(): Promise<string[]> {
    const b = await this.storage.get(INDEX);
    return b ? (JSON.parse(b.toString("utf8")) as string[]) : [];
  }
  async get<T>(key: string) {
    const b = await this.storage.get(this.path(key));
    return b ? (JSON.parse(b.toString("utf8")) as T) : null;
  }
  set(key: string, value: unknown) {
    return this.lock(async () => {
      await this.storage.put(this.path(key), Buffer.from(JSON.stringify(value)), { contentType: "application/json" });
      const idx = await this.index();
      if (!idx.includes(key)) await this.storage.put(INDEX, Buffer.from(JSON.stringify([...idx, key])), { contentType: "application/json" });
    });
  }
  delete(key: string) {
    return this.lock(async () => {
      // the Storage interface has no delete: tombstone the value and drop it from the index
      await this.storage.put(this.path(key), Buffer.from("null"), { contentType: "application/json" });
      const idx = await this.index();
      await this.storage.put(INDEX, Buffer.from(JSON.stringify(idx.filter((k) => k !== key))), { contentType: "application/json" });
    });
  }
  async list(prefix: string) { return (await this.index()).filter((k) => k.startsWith(prefix)); }
}
