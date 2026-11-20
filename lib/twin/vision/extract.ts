/**
 * One Claude vision call: plan views in, raw plan geometry out (overview
 * pixels, y down). Structured outputs constrain the reply to `Extraction`;
 * everything metric (scale, snapping, the twin itself) happens in build.ts.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { OPENING_KINDS, ROOM_TYPES, WALL_KINDS } from "../schema";
import type { PageViews } from "./raster";

export const VISION_MODEL = "claude-opus-5-5";
/** Used by the API only if the main model declines the request. */
export const FALLBACK_MODEL = "claude-opus-4-8";
/** USD per million tokens (input, output), for the cost report. */
export const PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-opus-4-8": [5, 25],
};

const P = z.object({ x: z.number(), y: z.number() });
const conf = z.number().describe("0 = guess, 1 = clearly drawn");

export const Extraction = z.object({
  drawingKind: z.enum(["architectural_plan", "rendered_top_view", "sketch", "other"]),
  scale: z.object({
    dimensions: z.array(z.object({
      text: z.string().describe("the dimension string exactly as written"),
      meters: z.number().describe("its value in metres (Israeli plans write centimetres: 320 → 3.2)"),
      from: P, to: P,
      confidence: conf,
    })).describe("dimension lines whose two end ticks you can locate; overview pixels"),
    scaleBar: z.object({ from: P, to: P, meters: z.number() }).nullable(),
    writtenScale: z.string().nullable().describe("e.g. 1:50, if printed"),
  }),
  walls: z.array(z.object({
    from: P, to: P,
    thicknessPx: z.number(),
    kind: z.enum(WALL_KINDS),
    confidence: conf,
  })),
  openings: z.array(z.object({
    kind: z.enum(OPENING_KINDS),
    jambA: P, jambB: P,
    confidence: conf,
  })),
  rooms: z.array(z.object({
    label: z.string().describe("room name as written on the plan (Hebrew if Hebrew), or empty"),
    labelEn: z.string().describe("English name"),
    type: z.enum(ROOM_TYPES),
    polygon: z.array(P),
    writtenAreaM2: z.number().nullable(),
    confidence: conf,
  })),
  declared: z.object({
    apartmentAreaM2: z.number().nullable(),
    balconyAreaM2: z.number().nullable(),
    rooms: z.number().nullable().describe("room count as written, e.g. 4 for '4 חדרים'"),
  }),
  notes: z.array(z.string()).describe("anything ambiguous: unreadable text, several apartments on the sheet, curved walls…"),
});
export type Extraction = z.infer<typeof Extraction>;

export const SYSTEM_PROMPT = `You read apartment floor plans (mostly Israeli residential plans with Hebrew labels) and transcribe their geometry for a 3D model of the apartment. Precision matters more than completeness: a developer reviews your output, and every element you report is drawn in 3D.

Coordinates: report every point in pixels of the OVERVIEW image (image 1), origin at its top-left, x right, y down. Zoom tiles, when present, are magnified crops of the overview: use them to read small text and fine detail, then convert back to overview pixels with the mapping given for each tile.

Transcribe ONE apartment: the main unit on the sheet, with its balconies. Skip the building core, neighbouring units, furniture, fixtures, hatching, grid lines and dimension lines.

Walls
- A wall is a straight run of solid wall between two junctions or ends, given as its CENTRE line and its thickness in pixels. Walk the wall straight through door and window gaps: openings are reported separately and sit on top of walls.
- kind: "exterior" for the thick envelope walls (usually 20–30 cm, often hatched or filled), "interior" for partitions, "glazing" for a facade drawn as a glass line or curtain wall rather than masonry, "railing" for a balcony's outer edge or parapet.
- End each wall exactly where it meets the centre line of the wall it runs into, so junctions close.

Openings
- jambA and jambB are the two ends of the opening, on the wall's centre line.
- kind: "door" (swing arc or leaf), "entry" (the apartment's front door, from the stair or corridor), "window" (thin parallel lines in an exterior gap, no leaf), "slider" (sliding glass door, usually onto a balcony, drawn as offset panes), "opening" (a passage with no door).

Rooms
- Every enclosed space, including corridors, entry halls, storage, bathrooms, the safe room (ממ"ד) and balconies (מרפסת). An open-plan living/dining/kitchen space with no wall between them is one room unless the plan separates it.
- polygon: the room's floor outline, along the inner face of exterior walls and the centre line of interior walls; for a balcony, out to the railing. Corners in order, no repeated last point. Neighbouring rooms must share edges, not overlap.
- label: the name as written. writtenAreaM2: the area printed inside the room (e.g. 12.5 מ"ר), else null.

Scale
- dimensions: every dimension string you can read together with the two ends it measures (extension-line ticks), in overview pixels. Israeli plans write centimetres without a unit (320 = 3.20 m); some sheets use millimetres.
- scaleBar: a graphic scale bar's ends and the length it represents.

Declared values: the apartment area, balcony area and room count printed in a title block or legend ("שטח דירה", "מרפסת שמש", "4 חדרים").

Confidence per element: 1 when clearly drawn, about 0.5 when inferred (e.g. a wall hidden under furniture in a rendering), below 0.3 for a guess. Put anything ambiguous in notes. A rendered top view has no text: infer rooms from floors, fixtures and furniture, and leave scale lists empty.`;

export interface VisionUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  stopReason: string | null;
}

export interface VisionCall {
  extraction: Extraction;
  usage: VisionUsage;
}

/** What the extractor needs from the API; tests pass a fake. */
export type VisionCaller = (req: { system: string; content: Anthropic.Beta.BetaContentBlockParam[] }) => Promise<VisionCall>;

export function costOf(model: string, input: number, output: number, cacheRead = 0): number {
  const [pi, po] = PRICES[model] ?? PRICES[VISION_MODEL];
  return (input * pi + cacheRead * pi * 0.05 + output * po) / 1e6;
}

/** Default caller: streaming Messages request with structured output and a refusal fallback. */
export function claudeCaller(client: Anthropic = new Anthropic(), opts: { effort?: "medium" | "high" | "xhigh" } = {}): VisionCaller {
  return async ({ system, content }) => {
    const stream = client.beta.messages.stream({
      model: VISION_MODEL,
      max_tokens: 64000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: [{ model: FALLBACK_MODEL }],
      thinking: { type: "adaptive" },
      output_config: { effort: opts.effort ?? "high", format: betaZodOutputFormat(Extraction) },
      system,
      messages: [{ role: "user", content }],
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === "refusal") throw new Error(`Claude declined to read this plan (${msg.stop_details?.category ?? "no category"})`);
    if (msg.stop_reason === "max_tokens") throw new Error("Plan extraction was cut off at max_tokens");
    const extraction = msg.parsed_output;
    if (!extraction) throw new Error("Plan extraction returned no parseable output");
    const u = msg.usage;
    const cacheRead = u.cache_read_input_tokens ?? 0;
    return {
      extraction,
      usage: {
        model: msg.model, inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheReadTokens: cacheRead,
        costUsd: costOf(msg.model, u.input_tokens + (u.cache_creation_input_tokens ?? 0), u.output_tokens, cacheRead),
        stopReason: msg.stop_reason,
      },
    };
  };
}

const b64 = (png: Buffer) => png.toString("base64");

/** Build the user message: overview, tiles with their mapping, PDF text layer, user hints. */
export function buildContent(v: PageViews, hints: { areaM2?: number; note?: string } = {}): Anthropic.Beta.BetaContentBlockParam[] {
  const c: Anthropic.Beta.BetaContentBlockParam[] = [];
  c.push({ type: "text", text: `Image 1 — OVERVIEW, ${v.overview.width}×${v.overview.height} px. All coordinates refer to this image.` });
  c.push({ type: "image", source: { type: "base64", media_type: "image/png", data: b64(v.overview.png) } });
  v.tiles.forEach((t, i) => {
    const r = t.region;
    c.push({
      type: "text",
      text: `Image ${i + 2} — zoom tile, ${t.width}×${t.height} px, showing overview region x ${r.x}–${r.x + r.w}, y ${r.y}–${r.y + r.h} magnified ${t.zoom.toFixed(2)}×. Overview point = (${r.x} + tileX / ${t.zoom.toFixed(3)}, ${r.y} + tileY / ${t.zoom.toFixed(3)}).`,
    });
    c.push({ type: "image", source: { type: "base64", media_type: "image/png", data: b64(t.png) } });
  });
  if (v.text) c.push({ type: "text", text: `Text layer of this PDF page (positions unknown; use it to check what you read):\n${v.text.slice(0, 4000)}` });
  if (hints.areaM2) c.push({ type: "text", text: `The developer states the apartment's net area is ${hints.areaM2} m².` });
  if (hints.note) c.push({ type: "text", text: hints.note });
  c.push({ type: "text", text: "Transcribe this apartment plan." });
  return c;
}
