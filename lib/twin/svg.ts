/**
 * Plan twin → a clean architectural floor plan (SVG): poché walls, glazing,
 * door swings, sliders, room names with areas, scale bar. This is the
 * "תוכנית הדירה" image, drawn from verified data instead of a render.
 */
import { type PlanTwin, type Pt, type Wall, alongWall, bbox, polygonArea, wallLength } from "./schema";
import { labelPoint } from "./dxf/write";

export interface SvgOptions {
  lang?: "he" | "en";
  /** Pixels per metre in the viewBox (the SVG itself scales). */
  ppm?: number;
  /** Highlight issue refs (room / wall / opening ids) in red, for the review screen. */
  highlight?: string[];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

const PAD = 1.0;          // margin around the plan, metres
const SCALE_BAR = 0.6;    // extra strip under the plan for the scale bar, metres

/**
 * The plan-metre rectangle the SVG shows: left edge x0, top edge yTop (north
 * is up), width w, height h. The walk's minimap uses it to place the "you are
 * here" dot on this image.
 */
export function planSvgFrame(t: PlanTwin): { x0: number; yTop: number; w: number; h: number } {
  const pts = [...t.walls.flatMap((w) => [w.a, w.b]), ...t.rooms.flatMap((r) => r.polygon)];
  const [x1, y1, x2, y2] = bbox(pts.length ? pts : [[0, 0], [1, 1], [0, 1]]);
  return { x0: x1 - PAD, yTop: y2 + PAD, w: x2 - x1 + PAD * 2, h: y2 - y1 + PAD * 2 + SCALE_BAR };
}

export function planSvg(t: PlanTwin, opts: SvgOptions = {}): string {
  const lang = opts.lang ?? "he";
  const k = opts.ppm ?? 60;
  const hl = new Set(opts.highlight ?? []);
  const frame = planSvgFrame(t);
  const x1 = frame.x0 + PAD, y2 = frame.yTop - PAD;
  const pad = PAD;
  const W = frame.w * k, H = frame.h * k;
  // plan y points north (up); SVG y points down
  const X = (x: number) => +((x - x1 + pad) * k).toFixed(1);
  const Y = (y: number) => +((y2 - y + pad) * k).toFixed(1);
  const P = (p: Pt) => `${X(p[0])},${Y(p[1])}`;
  const out: string[] = [];

  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" font-family="Heebo, Arial, sans-serif">`);
  out.push(`<rect width="100%" height="100%" fill="#fbfaf7"/>`);
  out.push(`<defs><pattern id="deck" width="${k * 0.15}" height="${k * 0.15}" patternUnits="userSpaceOnUse"><rect width="100%" height="100%" fill="#efe8dc"/><path d="M0 ${k * 0.15}H${k * 0.15}" stroke="#ddd2c0" stroke-width="1"/></pattern></defs>`);

  // rooms
  for (const r of t.rooms) {
    const fill = r.type === "balcony" ? "url(#deck)" : r.type === "bath" || r.type === "wc" ? "#eef0ef" : "#f6f1e8";
    out.push(`<polygon points="${r.polygon.map(P).join(" ")}" fill="${fill}" stroke="${hl.has(r.id) ? "#d33" : "none"}" stroke-width="${hl.has(r.id) ? 3 : 0}"/>`);
  }

  // walls: solid stretches between openings, as filled quads
  const quad = (w: Wall, s1: number, s2: number, t2: number) => {
    const L = wallLength(w) || 1;
    const nx = (-(w.b[1] - w.a[1]) / L) * t2, ny = ((w.b[0] - w.a[0]) / L) * t2;
    const a = alongWall(w, s1), b = alongWall(w, s2);
    return [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]] as Pt[];
  };
  for (const w of t.walls) {
    const L = wallLength(w);
    const ops = t.openings.filter((o) => o.wallId === w.id).sort((a, b) => a.at - b.at);
    const color = hl.has(w.id) ? "#d33" : "#2b2a28";
    let s = 0;
    for (const [g1, g2] of [...ops.map((o) => [o.at - o.width / 2, o.at + o.width / 2]), [L, L]]) {
      if (g1 > s + 1e-6) {
        if (w.kind === "glazing" || w.kind === "railing") {
          const a = alongWall(w, s), b = alongWall(w, g1);
          out.push(`<line x1="${X(a[0])}" y1="${Y(a[1])}" x2="${X(b[0])}" y2="${Y(b[1])}" stroke="${w.kind === "glazing" ? "#6f8fa6" : "#9a9184"}" stroke-width="${w.kind === "glazing" ? 3 : 2}"/>`);
        } else {
          out.push(`<polygon points="${quad(w, s, g1, w.thickness / 2).map(P).join(" ")}" fill="${color}"/>`);
        }
      }
      s = Math.max(s, g2);
    }
    // openings
    const L1 = L || 1;
    const ux = (w.b[0] - w.a[0]) / L1, uy = (w.b[1] - w.a[1]) / L1;
    for (const o of ops) {
      const a = alongWall(w, o.at - o.width / 2), b = alongWall(w, o.at + o.width / 2);
      const stroke = hl.has(o.id) ? "#d33" : "#2b2a28";
      if (o.kind === "window") {
        for (const f of [-0.35, 0, 0.35]) {
          const n = (w.thickness / 2) * f;
          out.push(`<line x1="${X(a[0] - uy * n)}" y1="${Y(a[1] + ux * n)}" x2="${X(b[0] - uy * n)}" y2="${Y(b[1] + ux * n)}" stroke="${hl.has(o.id) ? "#d33" : "#6f8fa6"}" stroke-width="1.5"/>`);
        }
      } else if (o.kind === "door" || o.kind === "entry") {
        // leaf swings to the left of a→b, hinge at the opening start
        const r = o.width;
        const tip: Pt = [a[0] - uy * r, a[1] + ux * r];
        out.push(`<line x1="${X(a[0])}" y1="${Y(a[1])}" x2="${X(tip[0])}" y2="${Y(tip[1])}" stroke="${stroke}" stroke-width="2"/>`);
        out.push(`<path d="M${P(tip)} A${(r * k).toFixed(1)} ${(r * k).toFixed(1)} 0 0 1 ${P(b)}" fill="none" stroke="${stroke}" stroke-width="1" stroke-dasharray="4 3"/>`);
      } else if (o.kind === "slider") {
        const n = 0.05;
        out.push(`<line x1="${X(a[0] - uy * n)}" y1="${Y(a[1] + ux * n)}" x2="${X(b[0] - uy * n)}" y2="${Y(b[1] + ux * n)}" stroke="#6f8fa6" stroke-width="3"/>`);
        out.push(`<line x1="${X(a[0] + uy * n)}" y1="${Y(a[1] - ux * n)}" x2="${X(b[0] + uy * n)}" y2="${Y(b[1] - ux * n)}" stroke="#6f8fa6" stroke-width="3" stroke-dasharray="6 4"/>`);
      }
    }
  }

  // labels
  for (const r of t.rooms) {
    const [lx, ly] = labelPoint(r.polygon);
    const area = polygonArea(r.polygon);
    const unit = lang === "he" ? "מ״ר" : "m²";
    out.push(`<text x="${X(lx)}" y="${Y(ly)}" text-anchor="middle" font-size="${(0.26 * k).toFixed(0)}" font-weight="600" fill="#2b2a28" direction="${lang === "he" ? "rtl" : "ltr"}">${esc(r.name[lang])}</text>`);
    out.push(`<text x="${X(lx)}" y="${(Y(ly) + 0.32 * k).toFixed(1)}" text-anchor="middle" font-size="${(0.2 * k).toFixed(0)}" fill="#756b5e">${area.toFixed(1)} ${unit}</text>`);
  }

  // 1 m / 5 m scale bar
  const sy = H - 0.45 * k, sx = 0.6 * k;
  out.push(`<g stroke="#2b2a28" stroke-width="2"><line x1="${sx}" y1="${sy}" x2="${sx + 5 * k}" y2="${sy}"/>${[0, 1, 2, 3, 4, 5].map((i) => `<line x1="${sx + i * k}" y1="${sy - 6}" x2="${sx + i * k}" y2="${sy + (i % 5 ? 0 : 6)}"/>`).join("")}</g>`);
  out.push(`<text x="${sx + 5 * k + 8}" y="${sy + 5}" font-size="${(0.2 * k).toFixed(0)}" fill="#2b2a28">5 m</text>`);

  out.push(`</svg>`);
  return out.join("\n");
}
