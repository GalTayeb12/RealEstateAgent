/**
 * Quality gates for generator-built catalog items. Used by the publish script and
 * by tests, so a generated asset is held to the same bar as a modelled one:
 * real size within 1 cm, bevelled edges, 3 mm gaps between fronts, hardware on
 * every front, every material slot backed by geometry.
 */
import type { ModelManifest } from "../../schema/catalog";
import { resolveSize } from "../sizing";
import { GAP, generate, partsBounds, type GeneratorId, type Part } from "./index";

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);

/** Parameter combinations to check: every parameter at min, default and max (capped). */
export function paramCombos(m: ModelManifest): Record<string, number>[] {
  if (m.sizing.mode !== "parametric") return [{}];
  let combos: Record<string, number>[] = [{}];
  for (const p of m.sizing.params) {
    const vals = [...new Set([p.min, p.default, p.max])];
    combos = combos.flatMap((c) => vals.map((v) => ({ ...c, [p.id]: v })));
  }
  return combos.slice(0, 64);
}

export function verifyParts(parts: Part[], slotIds: string[], dims: { w: number; d: number; h: number }, label: string): string[] {
  const out: string[] = [];
  const b = partsBounds(parts);
  const tol = 0.01;
  if (Math.abs(b.x0 + dims.w / 2) > tol || Math.abs(b.x1 - dims.w / 2) > tol) out.push(`${label}: width is ${(b.x1 - b.x0).toFixed(3)} m but the size is ${dims.w} m`);
  if (Math.abs(b.y0) > tol || Math.abs(b.y1 - dims.h) > tol) out.push(`${label}: height spans ${b.y0.toFixed(3)}..${b.y1.toFixed(3)} m but the size is ${dims.h} m`);
  if (Math.abs(b.z0 + dims.d) > tol || Math.abs(b.z1) > tol) out.push(`${label}: depth spans ${b.z0.toFixed(3)}..${b.z1.toFixed(3)} m but must be -${dims.d}..0`);
  for (const p of parts) {
    if (p.r < 0.0005) out.push(`${label}: part ${p.id} has no edge bevel`);
    if (p.r > Math.min(p.w, p.h, p.d) / 2 + 1e-9) out.push(`${label}: part ${p.id} bevel is larger than half its thickness`);
    if (!slotIds.includes(p.slot)) out.push(`${label}: part ${p.id} uses undeclared slot "${p.slot}"`);
  }
  for (const s of slotIds) if (!parts.some((p) => p.slot === s)) out.push(`${label}: slot "${s}" has no geometry`);
  // fronts: neighbours must keep a gap of about 3 mm and never overlap
  const fronts = parts.filter((p) => p.kind === "front");
  for (let i = 0; i < fronts.length; i++) {
    for (let j = i + 1; j < fronts.length; j++) {
      const a = fronts[i], c = fronts[j];
      const ox = overlap(a.cx - a.w / 2, a.cx + a.w / 2, c.cx - c.w / 2, c.cx + c.w / 2);
      const oy = overlap(a.cy - a.h / 2, a.cy + a.h / 2, c.cy - c.h / 2, c.cy + c.h / 2);
      if (ox > 0 && oy > 0) out.push(`${label}: fronts ${a.id} and ${c.id} overlap`);
      else if ((ox > 0 && -oy < GAP * 0.8 && -oy < 0.02) || (oy > 0 && -ox < GAP * 0.8 && -ox < 0.02)) out.push(`${label}: fronts ${a.id} and ${c.id} are closer than ${GAP * 800} mm`);
    }
  }
  // hardware: every front has a handle
  const handles = parts.filter((p) => p.kind === "hardware").length;
  if (fronts.length && handles < fronts.length) out.push(`${label}: ${fronts.length} fronts but only ${handles} handles`);
  return out;
}

export function verifyGenerated(m: ModelManifest): string[] {
  if (m.sizing.mode !== "parametric" || !m.sizing.generator) return [];
  const gen = m.sizing.generator as GeneratorId;
  const out: string[] = [];
  const slotIds = m.slots.map((s) => s.id);
  for (const params of paramCombos(m)) {
    const dims = resolveSize(m, { params });
    out.push(...verifyParts(generate(gen, dims, params), slotIds, dims, `${m.id} ${JSON.stringify(params)}`));
  }
  return out;
}
