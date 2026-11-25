/** What the property panel and catalog drawer may offer: pure filters over catalog manifests. */
import { reachableWidths, solveForWidth, validateConfig } from "../catalog/modular";
import { SURFACE_CATEGORIES } from "../commands/apply";
import type { MaterialManifest, MaterialSlot, ModelManifest, Style } from "../schema/catalog";

export type Locale = "he" | "en";

export function materialsForSlot(materials: MaterialManifest[], slot: MaterialSlot): MaterialManifest[] {
  return materials.filter((m) => slot.allowed.includes(m.category));
}

export function materialsForSurface(materials: MaterialManifest[], type: "wall" | "floor" | "ceiling"): MaterialManifest[] {
  return materials.filter((m) => SURFACE_CATEGORIES[type].includes(m.category));
}

export type CatalogFilter = { query?: string; style?: Style | null; category?: string | null; room?: string | null };

export function filterModels(models: ModelManifest[], f: CatalogFilter, locale: Locale): ModelManifest[] {
  const q = (f.query ?? "").trim().toLowerCase();
  return models.filter((m) => {
    if (f.style && !m.styles.includes(f.style)) return false;
    if (f.category && m.category !== f.category) return false;
    if (f.room && !(m.rooms.includes("any") || m.rooms.includes(f.room as ModelManifest["rooms"][number]))) return false;
    if (!q) return true;
    const hay = `${m.name.he} ${m.name.en} ${m.category} ${m.styles.join(" ")}`.toLowerCase();
    return hay.includes(q) || m.name[locale].toLowerCase().includes(q);
  });
}

export function categoriesOf(models: ModelManifest[]): string[] {
  return [...new Set(models.map((m) => m.category))].sort();
}

type Modular = Extract<ModelManifest["sizing"], { mode: "modular" }>;

/** One entry per total width a legal configuration can reach, with the simplest module list for it. */
export function modularPresets(sizing: Modular, limit = 12): { width: number; modules: string[] }[] {
  const out: { width: number; modules: string[] }[] = [];
  for (const w of reachableWidths(sizing, { min: 1.0, max: 5.0 })) {
    const [best] = solveForWidth(sizing, w, { tol: 0.005, limit: 1 });
    if (best) out.push({ width: w, modules: best.modules });
  }
  if (out.length <= limit) return out;
  const step = (out.length - 1) / (limit - 1);
  return Array.from({ length: limit }, (_, i) => out[Math.round(i * step)]);
}

/** Modules that may legally be added at the end of the current run (for the "add module" menu). */
export function nextModules(sizing: Modular, current: string[]): string[] {
  const byId = new Map(sizing.modules.map((m) => [m.id, m]));
  const last = current.length ? byId.get(current[current.length - 1]) : undefined;
  if (last && last.right === null) return []; // the run is already closed on the right
  return sizing.modules.filter((m) => (last ? m.left === last.right : m.left === null)).map((m) => m.id);
}

const isInterior = (sizing: Modular, id: string) => {
  const m = sizing.modules.find((x) => x.id === id);
  return !!m && m.left !== null && m.right !== null;
};

/** Seat-like modules (connect on both sides) that can be inserted inside a run. */
export function insertableModules(sizing: Modular): string[] {
  return sizing.modules.filter((m) => m.left !== null && m.right !== null).map((m) => m.id);
}

/** Inserts an interior module just before the closing end module, keeping the run legal. */
export function withInserted(sizing: Modular, current: string[], moduleId: string): string[] | null {
  if (!isInterior(sizing, moduleId) || current.length === 0) return null;
  const next = [...current.slice(0, -1), moduleId, current[current.length - 1]];
  return validateConfig(sizing, next).length === 0 ? next : null;
}

/** Removes the interior module at `index`; null when that would leave an illegal run (e.g. no seat left). */
export function withoutModule(sizing: Modular, current: string[], index: number): string[] | null {
  if (index <= 0 || index >= current.length - 1) return null; // end modules stay
  const next = current.filter((_, i) => i !== index);
  return validateConfig(sizing, next).length === 0 ? next : null;
}
