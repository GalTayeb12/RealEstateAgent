/**
 * Resolves the real footprint of an item node from its catalog manifest.
 * There is no scale factor anywhere: each strategy maps to genuine dimensions.
 */
import type { Dims, ModelManifest } from "../schema/catalog";
import type { ItemNode } from "../schema/nodes";
import { configDepth, configWidth, validateConfig } from "./modular";

export class SizingError extends Error {
  constructor(public code: "unknown-variant" | "bad-config" | "bad-param" | "missing-config", message: string) {
    super(message);
  }
}

export function resolveSize(m: ModelManifest, node: Pick<ItemNode, "variantId" | "modules" | "params">): Dims {
  const s = m.sizing;
  switch (s.mode) {
    case "fixed":
      return m.dims;
    case "variants": {
      const id = node.variantId ?? s.defaultVariant ?? s.variants[0].id;
      const v = s.variants.find((x) => x.id === id);
      if (!v) throw new SizingError("unknown-variant", `"${m.id}" has no size variant "${id}".`);
      return v.dims;
    }
    case "modular": {
      const mods = node.modules ?? s.defaultConfig;
      if (!mods) throw new SizingError("missing-config", `"${m.id}" needs a module configuration.`);
      const issues = validateConfig(s, mods);
      if (issues.length) throw new SizingError("bad-config", issues[0].message);
      return { w: configWidth(s, mods), d: configDepth(s, mods), h: m.dims.h };
    }
    case "parametric": {
      const out = { ...m.dims };
      for (const p of s.params) {
        const v = node.params?.[p.id] ?? p.default;
        if (!Number.isFinite(v) || v < p.min - 1e-9 || v > p.max + 1e-9) {
          throw new SizingError("bad-param", `Parameter "${p.id}" must be between ${p.min} and ${p.max}.`);
        }
        const steps = (v - p.min) / p.step;
        if (Math.abs(steps - Math.round(steps)) > 1e-6) throw new SizingError("bad-param", `Parameter "${p.id}" must move in steps of ${p.step}.`);
        if (p.drives !== "none") out[p.drives] = v;
      }
      return out;
    }
  }
}
