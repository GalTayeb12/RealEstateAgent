/**
 * The admin catalog: lifecycle of catalog entries and VERSIONED releases.
 *
 *   import (draft) -> check (gates) -> publish -> [retire]
 *
 * - An entry is one manifest, keyed `<type>:<id>@<version>`. A published (id, version) is immutable:
 *   changing it needs a new, higher version. Drafts can be replaced until they are published.
 * - Publishing needs a passing check of exactly the manifest being published (a content hash is kept,
 *   so editing a draft after its check makes it unpublishable until checked again).
 * - Every publish or retire writes a new numbered release (the snapshot the studio loads) and keeps
 *   the older ones, with the list of what was added or retired. Releases are never rewritten.
 * - Retiring removes an entry from browsing (catalog drawer, AI designer) but keeps it in the release,
 *   so designs that pin {id, version} keep rendering.
 *
 * Storage is the KV layer (Storage driver: local `.storage/` now, R2 later). Pure apart from the
 * injected gate runner and clock, so it is unit-tested with an in-memory KV.
 */
import { createHash } from "node:crypto";
import type { Kv } from "../persist/kv";
import type { MaterialManifest, ModelManifest } from "../schema/catalog";
import { parseManifest, type Manifest } from "./gates";
import { browsable, keyOf } from "./keys";

export { browsable, keyOf };

export type Status = "draft" | "published" | "retired";
export type Entry = {
  key: string;
  type: "model" | "material";
  id: string;
  version: number;
  status: Status;
  manifest: Manifest;
  /** Gate results of the last check; null = never checked. */
  issues: string[] | null;
  /** Hash of the manifest the last check ran on. */
  checkedHash: string | null;
  checkedAt: string | null;
  createdAt: string;
  updatedAt: string;
  by: string;
  publishedIn: number | null;
  retiredIn: number | null;
};

export type Release = {
  schema: 2;
  release: number;
  publishedAt: string;
  by: string;
  models: ModelManifest[];
  materials: MaterialManifest[];
  /** Keys (`<type>:<id>@<version>`) still resolvable but hidden from browsing. */
  retired: string[];
  changes: { added: string[]; retired: string[] };
  previous: number | null;
  note?: string;
};

export class CatalogError extends Error {
  constructor(public code: "invalid" | "immutable" | "version" | "not-found" | "not-checked" | "failed-gates" | "stale-check" | "state" | "empty", message: string, public issues: string[] = []) {
    super(message);
  }
}

const hashOf = (m: Manifest) => createHash("sha256").update(JSON.stringify(m)).digest("hex");
const pad = (n: number) => String(n).padStart(6, "0");

/** Runs the gates for one manifest (static gates + asset gates); returns the problems. */
export type GateRunner = (m: Manifest) => Promise<string[]>;

export class CatalogRegistry {
  private chain: Promise<unknown> = Promise.resolve();
  constructor(private kv: Kv, private gates: GateRunner, private now: () => Date = () => new Date()) {}

  /** Serialises mutations (one writer at a time per process; the KV keeps its own index safe). */
  private lock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => undefined);
    return run;
  }

  async entries(): Promise<Entry[]> {
    const keys = await this.kv.list("catalog/entry/");
    const out = (await Promise.all(keys.map((k) => this.kv.get<Entry>(k)))).filter((e): e is Entry => !!e);
    return out.sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id) || b.version - a.version);
  }
  entry(key: string) { return this.kv.get<Entry>(`catalog/entry/${key}`); }
  private put(e: Entry) { return this.kv.set(`catalog/entry/${e.key}`, e); }

  async head(): Promise<number> { return (await this.kv.get<{ release: number }>("catalog/head"))?.release ?? 0; }
  async release(n?: number): Promise<Release | null> {
    const r = n ?? (await this.head());
    return r ? this.kv.get<Release>(`catalog/release/${pad(r)}`) : null;
  }
  async releases(): Promise<Pick<Release, "release" | "publishedAt" | "by" | "changes" | "note">[]> {
    const keys = (await this.kv.list("catalog/release/")).sort().reverse();
    const all = await Promise.all(keys.map((k) => this.kv.get<Release>(k)));
    return all.filter((r): r is Release => !!r).map(({ release, publishedAt, by, changes, note }) => ({ release, publishedAt, by, changes, note }));
  }

  private async writeRelease(by: string, models: ModelManifest[], materials: MaterialManifest[], retired: string[], changes: Release["changes"], note?: string): Promise<Release> {
    const prev = await this.head();
    const r: Release = {
      schema: 2, release: prev + 1, publishedAt: this.now().toISOString(), by,
      models: [...models].sort((a, b) => a.id.localeCompare(b.id) || a.version - b.version),
      materials: [...materials].sort((a, b) => a.id.localeCompare(b.id) || a.version - b.version),
      retired: [...new Set(retired)].sort(), changes, previous: prev || null, ...(note ? { note } : {}),
    };
    await this.kv.set(`catalog/release/${pad(r.release)}`, r);
    await this.kv.set("catalog/head", { release: r.release });
    return r;
  }

  /**
   * Adds already-published manifests (the repository snapshot, which passed the CLI gates) that the
   * registry does not know yet, as one release. The first call seeds release 1.
   */
  sync(snapshot: { models: ModelManifest[]; materials: MaterialManifest[] }, by: string, note = "repository catalog"): Promise<Release | null> {
    return this.lock(async () => {
      const known = new Set((await this.entries()).map((e) => e.key));
      const fresh = [...snapshot.models, ...snapshot.materials].filter((m) => !known.has(keyOf(m)));
      if (!fresh.length) return null;
      const t = this.now().toISOString();
      const cur = await this.release();
      const r = await this.writeRelease(by,
        [...(cur?.models ?? []), ...fresh.filter((m): m is ModelManifest => m.type === "model")],
        [...(cur?.materials ?? []), ...fresh.filter((m): m is MaterialManifest => m.type === "material")],
        cur?.retired ?? [], { added: fresh.map(keyOf), retired: [] }, note);
      for (const m of fresh) {
        await this.put({ key: keyOf(m), type: m.type, id: m.id, version: m.version, status: "published", manifest: m, issues: [], checkedHash: hashOf(m), checkedAt: t, createdAt: t, updatedAt: t, by, publishedIn: r.release, retiredIn: null });
      }
      return r;
    });
  }

  /** Imports (or replaces) a draft. A published or retired (id, version) is immutable. */
  importDraft(raw: unknown, by: string): Promise<Entry> {
    return this.lock(async () => {
      const p = parseManifest(raw);
      if ("issues" in p) throw new CatalogError("invalid", "The manifest is not valid.", p.issues);
      const m = p.manifest;
      const key = keyOf(m);
      const existing = await this.entry(key);
      if (existing && existing.status !== "draft") throw new CatalogError("immutable", `${key} is already ${existing.status}; publish changes as a new version.`);
      const higher = (await this.entries()).filter((e) => e.type === m.type && e.id === m.id && e.status !== "draft" && e.version >= m.version);
      if (higher.length) throw new CatalogError("version", `Version must be higher than ${Math.max(...higher.map((e) => e.version))} for ${m.id}.`);
      const t = this.now().toISOString();
      const e: Entry = {
        key, type: m.type, id: m.id, version: m.version, status: "draft", manifest: m,
        issues: null, checkedHash: null, checkedAt: null,
        createdAt: existing?.createdAt ?? t, updatedAt: t, by, publishedIn: null, retiredIn: null,
      };
      await this.put(e);
      return e;
    });
  }

  /** Runs the gates on a draft and records the result. */
  check(key: string): Promise<Entry> {
    return this.lock(async () => {
      const e = await this.entry(key);
      if (!e) throw new CatalogError("not-found", `${key} not found.`);
      if (e.status !== "draft") throw new CatalogError("state", `${key} is ${e.status}; only drafts are checked.`);
      const issues = await this.gates(e.manifest);
      const next: Entry = { ...e, issues, checkedHash: hashOf(e.manifest), checkedAt: this.now().toISOString() };
      await this.put(next);
      return next;
    });
  }

  /** Publishes checked drafts as one new release. All or nothing. */
  publish(keys: string[], by: string, note?: string): Promise<Release> {
    return this.lock(async () => {
      if (!keys.length) throw new CatalogError("empty", "Nothing to publish.");
      const list: Entry[] = [];
      for (const k of [...new Set(keys)]) {
        const e = await this.entry(k);
        if (!e) throw new CatalogError("not-found", `${k} not found.`);
        if (e.status !== "draft") throw new CatalogError("state", `${k} is already ${e.status}.`);
        if (e.issues === null) throw new CatalogError("not-checked", `${k} has not been checked.`);
        if (e.checkedHash !== hashOf(e.manifest)) throw new CatalogError("stale-check", `${k} changed after its check.`);
        if (e.issues.length) throw new CatalogError("failed-gates", `${k} fails ${e.issues.length} gate(s).`, e.issues);
        list.push(e);
      }
      const cur = await this.release();
      const models = [...(cur?.models ?? [])], materials = [...(cur?.materials ?? [])];
      for (const e of list) (e.type === "model" ? models : materials).push(e.manifest as never);
      const r = await this.writeRelease(by, models, materials, cur?.retired ?? [], { added: list.map((e) => e.key), retired: [] }, note);
      const t = this.now().toISOString();
      for (const e of list) await this.put({ ...e, status: "published", publishedIn: r.release, updatedAt: t });
      return r;
    });
  }

  /** Retires published entries in a new release (they stay resolvable for existing designs). */
  retire(keys: string[], by: string, note?: string): Promise<Release> {
    return this.lock(async () => {
      if (!keys.length) throw new CatalogError("empty", "Nothing to retire.");
      const list: Entry[] = [];
      for (const k of [...new Set(keys)]) {
        const e = await this.entry(k);
        if (!e) throw new CatalogError("not-found", `${k} not found.`);
        if (e.status !== "published") throw new CatalogError("state", `${k} is ${e.status}; only published entries are retired.`);
        list.push(e);
      }
      const cur = (await this.release())!;
      const r = await this.writeRelease(by, cur.models, cur.materials, [...cur.retired, ...list.map((e) => e.key)], { added: [], retired: list.map((e) => e.key) }, note);
      const t = this.now().toISOString();
      for (const e of list) await this.put({ ...e, status: "retired", retiredIn: r.release, updatedAt: t });
      return r;
    });
  }

  /** Deletes a draft (published history is never deleted). */
  discard(key: string): Promise<void> {
    return this.lock(async () => {
      const e = await this.entry(key);
      if (!e) throw new CatalogError("not-found", `${key} not found.`);
      if (e.status !== "draft") throw new CatalogError("state", `${key} is ${e.status}; published history is kept.`);
      await this.kv.delete(`catalog/entry/${key}`);
    });
  }
}

