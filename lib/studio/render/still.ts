/**
 * Path-traced still (M12): the pure side. Presets, output size, progress/ETA and the file name.
 * No three.js and no React here; the renderer lives in components/studio/scene/StillRender.tsx.
 */

export type StillPreset = "draft" | "standard" | "fine";

export interface StillSettings {
  /** Target samples per pixel. */
  samples: number;
  /** Output width in px (height follows the view's aspect ratio). */
  width: number;
  /** Light bounces. */
  bounces: number;
  /** Wall-clock budget. When it runs out the still is finished with the samples reached so far (and says so). */
  maxSeconds: number;
}

export const STILL_PRESETS: Record<StillPreset, StillSettings> = {
  draft: { samples: 48, width: 1024, bounces: 4, maxSeconds: 20 },
  standard: { samples: 128, width: 1600, bounces: 5, maxSeconds: 50 }, // the M12 gate: under 60 s
  fine: { samples: 700, width: 2560, bounces: 6, maxSeconds: 240 },
};

/** Exposure and a warm balance for the sky light, tuned by eye on the fixed living-room view; fewer samples than this are smoothed. */
export const STILL_EXPOSURE = 1.3;
export const STILL_SKY_TINT: readonly [number, number, number] = [1, 0.95, 0.88];
export const STILL_DENOISE_BELOW = 96;

export const STILL_PRESET_IDS = Object.keys(STILL_PRESETS) as StillPreset[];

/** Even pixel size for a preset and a view aspect (w / h); never taller than 2x the width and never smaller than 2 px. */
export function stillSize(preset: StillPreset, aspect: number): { w: number; h: number } {
  const a = Number.isFinite(aspect) && aspect > 0 ? Math.min(Math.max(aspect, 0.5), 4) : 16 / 9;
  const w = STILL_PRESETS[preset].width;
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  return { w: even(w), h: even(w / a) };
}

export type StillStatus = "idle" | "preparing" | "rendering" | "done" | "cancelled" | "error";

export interface StillState {
  status: StillStatus;
  preset: StillPreset;
  samples: number;
  target: number;
  startedAt: number;
  elapsedMs: number;
  /** Set when the time budget ended the render before the target was reached. */
  truncated: boolean;
  /** The browser draws through ANGLE's Direct3D11 backend, which is much slower for the tracer than Vulkan or OpenGL. */
  slowBackend: boolean;
  width: number;
  height: number;
  /** Object URL of the finished PNG. */
  url?: string;
  error?: string;
}

export const idleStill = (preset: StillPreset = "standard"): StillState => ({
  status: "idle", preset, samples: 0, target: STILL_PRESETS[preset].samples, startedAt: 0, elapsedMs: 0, truncated: false, slowBackend: false, width: 0, height: 0,
});

export function stillProgress(samples: number, target: number): number {
  if (!(target > 0)) return 0;
  return Math.min(1, Math.max(0, samples / target));
}

/** Seconds left at the current pace, capped by the time budget; null while there is nothing to extrapolate from. */
export function stillEta(samples: number, target: number, elapsedMs: number, maxSeconds: number): number | null {
  if (samples < 4 || elapsedMs <= 0) return null;
  const perSample = elapsedMs / samples;
  const byPace = ((target - samples) * perSample) / 1000;
  const byBudget = Math.max(0, maxSeconds - elapsedMs / 1000);
  return Math.max(0, Math.min(byPace, byBudget));
}

/** True when the render has to stop now: target reached, or the time budget is spent after a minimum number of samples. */
export function stillShouldStop(samples: number, target: number, elapsedMs: number, maxSeconds: number, minSamples = 8): { stop: boolean; truncated: boolean } {
  if (samples >= target) return { stop: true, truncated: false };
  if (elapsedMs >= maxSeconds * 1000 && samples >= minSamples) return { stop: true, truncated: true };
  return { stop: false, truncated: false };
}

/** A safe download name: ascii slug of the design name, preset and date. */
export function stillFilename(designName: string | null | undefined, preset: StillPreset, when: Date): string {
  const slug = (designName ?? "").normalize("NFKD").replace(/[^\x20-\x7e]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "design";
  const d = `${when.getFullYear()}${String(when.getMonth() + 1).padStart(2, "0")}${String(when.getDate()).padStart(2, "0")}`;
  return `haveniq-${slug}-${preset}-${d}.png`;
}
