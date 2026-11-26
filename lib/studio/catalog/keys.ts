/**
 * Catalog entry keys and browsing filters, safe for the browser bundle (no Node or gltf imports).
 * A key is `<type>:<id>@<version>`.
 */
export const keyOf = (m: { type: string; id: string; version: number }) => `${m.type}:${m.id}@${m.version}`;

/** Entries that may be browsed or proposed: retired ones stay resolvable for existing designs but are hidden. */
export function browsable<T extends { type: string; id: string; version: number }>(list: T[], retired: string[]): T[] {
  const r = new Set(retired);
  return list.filter((m) => !r.has(keyOf(m)));
}
