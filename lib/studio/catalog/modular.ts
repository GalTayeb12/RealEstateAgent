/**
 * Modular assemblies. A configuration is an ordered list of module ids; the
 * only way to get a different size is a different valid combination of real
 * modules, so proportions of arms, cushions and legs never change.
 */
import type { Module, ModelManifest } from "../schema/catalog";

type ModularSizing = Extract<ModelManifest["sizing"], { mode: "modular" }>;

export type ConfigIssue = { code: "empty" | "no-seat" | "unknown-module" | "bad-end" | "bad-join" | "too-many"; index?: number; message: string };

const round = (n: number) => Math.round(n * 1e4) / 1e4;

export function configWidth(sizing: ModularSizing, ids: string[]): number {
  const byId = new Map(sizing.modules.map((m) => [m.id, m]));
  return round(ids.reduce((s, id) => s + (byId.get(id)?.width ?? 0), 0));
}

export function configDepth(sizing: ModularSizing, ids: string[]): number {
  const byId = new Map(sizing.modules.map((m) => [m.id, m]));
  return round(Math.max(0, ...ids.map((id) => byId.get(id)?.depth ?? 0)));
}

export function validateConfig(sizing: ModularSizing, ids: string[]): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  if (ids.length === 0) return [{ code: "empty", message: "A modular assembly needs at least one module." }];
  if (ids.length > sizing.maxModules) issues.push({ code: "too-many", message: `At most ${sizing.maxModules} modules.` });
  const byId = new Map(sizing.modules.map((m) => [m.id, m]));
  const mods: Module[] = [];
  ids.forEach((id, i) => {
    const m = byId.get(id);
    if (!m) issues.push({ code: "unknown-module", index: i, message: `Unknown module "${id}".` });
    else mods.push(m);
  });
  if (mods.length !== ids.length) return issues;
  if (mods.every((m) => m.kind === "arm")) issues.push({ code: "no-seat", message: "A modular assembly needs at least one seating module." });
  if (mods[0].left !== null) issues.push({ code: "bad-end", index: 0, message: "The left end must be a finished edge." });
  if (mods[mods.length - 1].right !== null) issues.push({ code: "bad-end", index: ids.length - 1, message: "The right end must be a finished edge." });
  for (let i = 0; i < mods.length - 1; i++) {
    const r = mods[i].right;
    const l = mods[i + 1].left;
    if (r === null || l === null || r !== l) issues.push({ code: "bad-join", index: i, message: `"${mods[i].id}" cannot connect to "${mods[i + 1].id}".` });
  }
  return issues;
}

export type Solution = { modules: string[]; width: number; depth: number };

/**
 * All valid configurations whose total width is within `tol` of `target`,
 * best first: closest width, then fewest modules, then fewest distinct module types.
 */
export function solveForWidth(sizing: ModularSizing, target: number, opts: { tol?: number; limit?: number } = {}): Solution[] {
  const tol = opts.tol ?? 0.05;
  const limit = opts.limit ?? 20;
  const mods = sizing.modules;
  const out: Solution[] = [];
  const seq: Module[] = [];

  const dfs = (width: number) => {
    const last = seq[seq.length - 1];
    if (last && last.right === null && seq.some((m) => m.kind !== "arm") && Math.abs(width - target) <= tol + 1e-9) {
      out.push({ modules: seq.map((m) => m.id), width: round(width), depth: round(Math.max(...seq.map((m) => m.depth))) });
    }
    if (seq.length >= sizing.maxModules) return;
    for (const m of mods) {
      if (seq.length === 0 ? m.left !== null : last.right === null || last.right !== m.left) continue;
      if (width + m.width > target + tol + 1e-9) continue;
      seq.push(m);
      dfs(width + m.width);
      seq.pop();
      if (out.length > limit * 50) return; // hard stop for pathological catalogs
    }
  };
  dfs(0);

  const distinct = (s: Solution) => new Set(s.modules).size;
  out.sort(
    (a, b) =>
      Math.abs(a.width - target) - Math.abs(b.width - target) ||
      a.modules.length - b.modules.length ||
      distinct(a) - distinct(b) ||
      a.modules.join(",").localeCompare(b.modules.join(",")),
  );
  return out.slice(0, limit);
}

/** Every width reachable by some valid configuration (for a size picker). */
export function reachableWidths(sizing: ModularSizing, opts: { min?: number; max?: number } = {}): number[] {
  const min = opts.min ?? 0;
  const max = opts.max ?? 6;
  const found = new Set<number>();
  const mods = sizing.modules;
  const seq: Module[] = [];
  const dfs = (width: number) => {
    const last = seq[seq.length - 1];
    if (last && last.right === null && seq.some((m) => m.kind !== "arm") && width >= min) found.add(round(width));
    if (seq.length >= sizing.maxModules) return;
    for (const m of mods) {
      if (seq.length === 0 ? m.left !== null : last.right === null || last.right !== m.left) continue;
      if (width + m.width > max + 1e-9) continue;
      seq.push(m);
      dfs(width + m.width);
      seq.pop();
    }
  };
  dfs(0);
  return [...found].sort((a, b) => a - b);
}
