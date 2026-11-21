/**
 * The building photo stage of a project the developer set up themselves: the
 * hero image of the building(s) plus where each building, floor and apartment
 * sits on it (the same on.json shape the Yarkon stage uses, see
 * lib/experience/types.ts PhotoMeta).
 *
 * Files live in storage under stages/<projectId>/ and are served publicly (a
 * buyer sees them) at /api/stage/<projectId>/on.<ext> and on.json. Setting
 * Building.modelUrl to the image URL is what switches the buyer page from the
 * procedural building to this photo, and the viewer finds on.json next to it.
 */
import type { PhotoBox, PhotoMeta } from "@/lib/experience/types";

export const STAGE_EXTS = ["webp", "jpg", "png"] as const;
export type StageExt = (typeof STAGE_EXTS)[number];
export const MAX_STAGE_IMAGE_BYTES = 12 * 1024 * 1024;

export const stageKey = (projectId: string, file: string) => `stages/${projectId}/${file}`;
export const stageImageUrl = (projectId: string, ext: StageExt) => `/api/stage/${projectId}/on.${ext}`;

/** File type from the first bytes (never trust the name or the declared type). */
export function sniffImage(b: Uint8Array): { ext: StageExt; contentType: string } | null {
  if (b.length > 12 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: "png", contentType: "image/png" };
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", contentType: "image/jpeg" };
  const s = (o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));
  if (b.length > 12 && s(0, 4) === "RIFF" && s(8, 4) === "WEBP") return { ext: "webp", contentType: "image/webp" };
  return null;
}

export interface StageBuilding { id: string; name: string; floorCount: number; unitsPerFloor: number }

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Floor boundaries from the roof down to the ground, evenly spaced inside the box. */
export function evenBands(box: Pick<PhotoBox, "y" | "h">, floors: number): number[] {
  return Array.from({ length: floors + 1 }, (_, i) => r3(box.y + (box.h * i) / floors));
}

/** Horizontal centre of each apartment slot as fractions of the box width. */
export function evenSlots(n: number): number[] {
  return Array.from({ length: n }, (_, i) => r3((i + 0.5) / n));
}

/** A first guess for N buildings side by side, to be dragged into place. */
export function defaultMeta(aspect: number, buildings: StageBuilding[]): PhotoMeta {
  const n = Math.max(buildings.length, 1);
  const w = Math.min(0.3, 0.8 / n), gap = (1 - w * n) / (n + 1);
  return {
    aspect,
    buildings: buildings.map((b, i) => {
      const box = { x: r3(gap + i * (w + gap)), y: 0.15, w: r3(w), h: 0.7 };
      return { ...box, bands: evenBands(box, b.floorCount), slots: evenSlots(b.unitsPerFloor) };
    }),
  };
}

export interface StageIssue { en: string; he: string }

/** What the buyer viewer needs to be true; the editor shows these before saving. */
export function validateStage(meta: PhotoMeta, buildings: StageBuilding[]): StageIssue[] {
  const out: StageIssue[] = [];
  if (!(meta.aspect > 0.3 && meta.aspect < 5)) out.push({ en: "The image proportions are out of range", he: "יחס התמונה לא סביר" });
  if (meta.buildings.length !== buildings.length) {
    out.push({ en: `Mark ${buildings.length} building(s), found ${meta.buildings.length}`, he: `יש לסמן ${buildings.length} בניינים, סומנו ${meta.buildings.length}` });
    return out;
  }
  meta.buildings.forEach((box, i) => {
    const name = buildings[i].name;
    const inside = box.x >= 0 && box.y >= 0 && box.w > 0.02 && box.h > 0.05 && box.x + box.w <= 1.0001 && box.y + box.h <= 1.0001;
    if (!inside) out.push({ en: `${name}: the marked area is outside the image or too small`, he: `${name}: האזור המסומן מחוץ לתמונה או קטן מדי` });
    const f = buildings[i].floorCount;
    if (box.bands) {
      const ok = box.bands.length === f + 1 && box.bands.every((v, k) => k === 0 || v > box.bands![k - 1]) && box.bands[0] >= box.y - 0.001 && box.bands[f] <= box.y + box.h + 0.001;
      if (!ok) out.push({ en: `${name}: floor lines do not match ${f} floors`, he: `${name}: קווי הקומות לא מתאימים ל-${f} קומות` });
    }
    if (box.slots && !(box.slots.length > 0 && box.slots.every((v) => v >= 0 && v <= 1))) out.push({ en: `${name}: apartment positions are invalid`, he: `${name}: מיקומי הדירות לא תקינים` });
  });
  return out;
}

/** Only the fields the editor owns; keeps the stored on.json small and typed. */
export function cleanMeta(m: PhotoMeta): PhotoMeta {
  return {
    aspect: r3(m.aspect),
    buildings: m.buildings.map((b) => ({
      x: r3(b.x), y: r3(b.y), w: r3(b.w), h: r3(b.h),
      ...(b.bands ? { bands: b.bands.map(r3) } : {}),
      ...(b.slots ? { slots: b.slots.map(r3) } : {}),
    })),
  };
}
