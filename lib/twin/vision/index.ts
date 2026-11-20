/**
 * PDF / raster floor plan → plan twin, by Claude vision.
 *
 * Pipeline: rasterize (PDFium WASM for PDF, sharp for PNG/JPG/WebP) → trim
 * margins → one overview within the model's 2576 px / ~3.5 MP image limit,
 * plus up to four 2× zoom tiles when the sheet is much larger → one
 * structured-output call to claude-opus-5-5 (extract.ts) → metric scale,
 * deskew, wall snapping and joins, room snapping, opening placement
 * (build.ts) → validateTwin.
 *
 * Scale, in order of trust: a caller-supplied m/px, dimension strings (≥2
 * agreeing), a scale bar, areas written in rooms, the apartment area the
 * developer states, the declared area on the sheet, and last a 0.85 m door
 * width. Disagreements over 5% are reported and lower the scale confidence.
 *
 * Limits (measured 2026-11-20 on scripts/twin/eval-vision.ts, one run per
 * case, so treat the numbers as indicative, not statistics):
 * - Walls: 98–100% of Yarkon wall length recovered within 15 cm on every
 *   case, render included. Rooms with drawn walls: area within 1.5%.
 * - Boundaries that are NOT drawn (open-plan kitchen / living / corridor)
 *   are guesses: the corridor came out at −36%…+0% area across runs, and
 *   the same image gave different splits on two runs. The written-area check
 *   drops those rooms' confidence (0.36 in that run), so the review screen
 *   should lead with low-confidence rooms.
 * - Doors are sometimes missed on degraded scans (4/5 on the scan case).
 * - Snapping hides small coordinate errors but cannot invent a wall the model
 *   missed. Every result needs the review screen; nothing here is "verified"
 *   until the validator and a person agree.
 * - Zoom tiles cost ~3× the input tokens (+$0.09 per A3 sheet). On the one
 *   A3 case they improved the undrawn corridor split; walls were equal.
 * - One apartment per call, from one page (the first by default). Sheets with
 *   several units, or a unit split across pages, need the page and a crop.
 * - Only straight walls; curved walls come back as notes or diagonal pieces.
 *   Diagonal walls are kept but not snapped or joined.
 * - North is the top of the image; the "main facade on y = 0" convention is
 *   not applied. Mirrored or rotated sheets (beyond ±20° skew) are not fixed.
 * - Rendered top views have no text or dimensions: scale needs `areaM2`
 *   (or `mPerPx`). On apt-top.webp walls were right (98%), but the open
 *   living/kitchen/corridor became one room, the entry door was not found,
 *   and windows/sliders were over-counted (5/4, 2/1).
 * - Window sill/head heights are defaults (0.9 / 2.4 m), never read.
 * - Each call costs money (see `usage.costUsd`); unit tests use a fake caller.
 */
import { validateTwin, type Report } from "../validate";
import { buildTwin, type BuildResult } from "./build";
import { buildContent, claudeCaller, SYSTEM_PROMPT, type Extraction, type VisionCaller, type VisionUsage } from "./extract";
import { detectKind, makeViews, rasterize, type PageViews, type ViewOptions } from "./raster";

export { buildTwin, estimateScale } from "./build";
export type { BuildResult, ElementConfidence, ScaleEstimate } from "./build";
export { Extraction, VISION_MODEL } from "./extract";
export type { VisionCaller, VisionUsage } from "./extract";

export interface ParseImageOptions extends ViewOptions {
  /** File name, for the twin's source and type detection. */
  file?: string;
  /** PDF page to read (1-based). Default 1. */
  page?: number;
  /** Apartment net area the developer states (m²). */
  areaM2?: number;
  /** Known scale in metres per overview pixel (rarely known; mainly for tests). */
  mPerPx?: number;
  /** Extra instruction for the model, e.g. "the apartment is the left unit". */
  note?: string;
  /** API caller; defaults to a real Claude call. Tests pass a fake. */
  caller?: VisionCaller;
}

export interface ParseImageResult extends BuildResult {
  report: Report;
  extraction: Extraction;
  usage: VisionUsage;
  views: { page: number; overview: [number, number]; tiles: number; downscale: number };
}

export async function parsePlanImage(data: Buffer, opts: ParseImageOptions = {}): Promise<ParseImageResult> {
  const kind = detectKind(data, opts.file);
  const pages = await rasterize(data, opts.file, { pages: [opts.page ?? 1] });
  if (!pages.length) throw new Error(`Page ${opts.page ?? 1} not found in ${opts.file ?? "the PDF"}`);
  const views: PageViews = await makeViews(pages[0], opts);
  const caller = opts.caller ?? claudeCaller();
  const { extraction, usage } = await caller({ system: SYSTEM_PROMPT, content: buildContent(views, { areaM2: opts.areaM2, note: opts.note }) });
  const built = buildTwin(extraction, { file: opts.file, sourceKind: kind, areaM2: opts.areaM2, mPerPx: opts.mPerPx });
  const report = validateTwin(built.twin);
  return {
    ...built, report, extraction, usage,
    views: { page: views.page, overview: [views.overview.width, views.overview.height], tiles: views.tiles.length, downscale: views.downscale },
  };
}
