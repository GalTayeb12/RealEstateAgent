/**
 * Local draft of unsaved edits (IndexedDB, no dependency). If the network drops
 * or the tab closes before the server accepted the latest change, the draft is
 * re-applied on the next visit and saved then.
 */
import type { DesignDocument } from "@/lib/studio/schema/document";

export type Draft = { key: string; doc: DesignDocument; baseRevision: number; savedAt: number };
const DB = "haveniq-studio";
const STORE = "drafts";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "key" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await open();
    return await new Promise<T>((resolve, reject) => {
      const r = fn(db.transaction(STORE, mode).objectStore(STORE));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } catch { return null; } // private mode / blocked storage: autosave still works, only the offline draft is skipped
}

export const draftKey = (designId: string, token?: string) => (token ? `shared:${token}` : `design:${designId}`);
export const readDraft = (key: string) => tx<Draft | undefined>("readonly", (s) => s.get(key)).then((d) => d ?? null);
export const writeDraft = (d: Draft) => tx("readwrite", (s) => s.put(d)).then(() => undefined);
export const clearDraft = (key: string) => tx("readwrite", (s) => s.delete(key)).then(() => undefined);
