/**
 * Write a plan twin as an architect-style DXF (R12, ASCII): walls as pairs of
 * face lines broken at openings, door / slider blocks, glazing lines, room
 * boundaries with name + area labels, and a small title block.
 *
 * Used to build golden test inputs from known apartments, and later as a
 * "download the verified plan" export for the developer.
 */
import { type PlanTwin, type Pt, type Wall, alongWall, bbox, pointInPolygon, polygonArea, wallLength } from "../schema";

const SCALE: Record<"mm" | "cm" | "m", number> = { mm: 1000, cm: 100, m: 1 };
const INSUNITS: Record<"mm" | "cm" | "m", number> = { mm: 4, cm: 5, m: 6 };

export interface WriteOptions {
  units?: "mm" | "cm" | "m";
  /** Shift applied after scaling, in output units (real drawings are rarely at 0,0). */
  offset?: [number, number];
}

const LAYERS = ["A-WALL", "A-GLAZ", "A-RAIL", "A-DOOR", "A-AREA", "A-AREA-IDEN", "A-ANNO"];

function enc(s: string): string {
  return [...s].map((c) => (c.charCodeAt(0) > 126 ? `\\U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}` : c)).join("");
}

export function writeDxf(t: PlanTwin, opts: WriteOptions = {}): string {
  const units = opts.units ?? "cm";
  const k = SCALE[units];
  const [ox, oy] = opts.offset ?? [0, 0];
  const P = ([x, y]: Pt): Pt => [x * k + ox, y * k + oy];
  const f = (n: number) => (Math.round(n * 1e4) / 1e4).toString();
  const out: string[] = [];
  const g = (code: number, v: string | number) => out.push(String(code), typeof v === "number" ? f(v) : v);

  const line = (layer: string, a: Pt, b: Pt) => {
    const [ax, ay] = P(a), [bx, by] = P(b);
    g(0, "LINE"); g(8, layer); g(10, ax); g(20, ay); g(30, 0); g(11, bx); g(21, by); g(31, 0);
  };
  const text = (layer: string, at: Pt, s: string, h = 0.18) => {
    const [x, y] = P(at);
    g(0, "TEXT"); g(8, layer); g(10, x); g(20, y); g(30, 0); g(40, h * k); g(1, enc(s));
  };
  const insert = (block: string, at: Pt, rotDeg: number, scale: number) => {
    const [x, y] = P(at);
    g(0, "INSERT"); g(8, "A-DOOR"); g(2, block); g(10, x); g(20, y); g(30, 0); g(41, scale * k); g(42, scale * k); g(50, rotDeg);
  };

  // header
  g(0, "SECTION"); g(2, "HEADER");
  g(9, "$ACADVER"); g(1, "AC1009");
  g(9, "$INSUNITS"); g(70, String(INSUNITS[units]));
  g(0, "ENDSEC");

  // layer table
  g(0, "SECTION"); g(2, "TABLES"); g(0, "TABLE"); g(2, "LAYER"); g(70, String(LAYERS.length));
  LAYERS.forEach((name, i) => { g(0, "LAYER"); g(2, name); g(70, "0"); g(62, String(i + 1)); g(6, "CONTINUOUS"); });
  g(0, "ENDTAB"); g(0, "ENDSEC");

  // blocks: unit-size symbols, scaled by the opening width on insert
  g(0, "SECTION"); g(2, "BLOCKS");
  for (const name of ["DOOR", "DOOR_ENTRY", "SLIDER"]) {
    g(0, "BLOCK"); g(8, "0"); g(2, name); g(70, "0"); g(10, 0); g(20, 0); g(30, 0); g(3, name);
    if (name === "SLIDER") {
      g(0, "LINE"); g(8, "0"); g(10, 0); g(20, 0.02); g(30, 0); g(11, 1); g(21, 0.02); g(31, 0);
    } else {
      g(0, "LINE"); g(8, "0"); g(10, 0); g(20, 0); g(30, 0); g(11, 0); g(21, 1); g(31, 0);
      g(0, "ARC"); g(8, "0"); g(10, 0); g(20, 0); g(30, 0); g(40, 1); g(50, 0); g(51, 90);
    }
    g(0, "ENDBLK"); g(8, "0");
  }
  g(0, "ENDSEC");

  g(0, "SECTION"); g(2, "ENTITIES");

  for (const w of t.walls) {
    const L = wallLength(w);
    const ux = (w.b[0] - w.a[0]) / L, uy = (w.b[1] - w.a[1]) / L;
    const nx = -uy * (w.thickness / 2), ny = ux * (w.thickness / 2);
    const layer = w.kind === "glazing" ? "A-GLAZ" : w.kind === "railing" ? "A-RAIL" : "A-WALL";
    const ops = t.openings.filter((o) => o.wallId === w.id).sort((a, b) => a.at - b.at);
    // solid runs between openings
    let s = 0;
    const runs: [number, number][] = [];
    for (const o of ops) { if (o.at - o.width / 2 > s) runs.push([s, o.at - o.width / 2]); s = o.at + o.width / 2; }
    if (s < L) runs.push([s, L]);
    for (const [r1, r2] of runs) {
      const p1 = alongWall(w, r1), p2 = alongWall(w, r2);
      line(layer, [p1[0] + nx, p1[1] + ny], [p2[0] + nx, p2[1] + ny]);
      line(layer, [p1[0] - nx, p1[1] - ny], [p2[0] - nx, p2[1] - ny]);
      if (layer === "A-WALL") { // end caps, as drawn by hand
        line(layer, [p1[0] + nx, p1[1] + ny], [p1[0] - nx, p1[1] - ny]);
        line(layer, [p2[0] + nx, p2[1] + ny], [p2[0] - nx, p2[1] - ny]);
      }
    }
    const rot = (Math.atan2(uy, ux) * 180) / Math.PI;
    for (const o of ops) {
      const start = alongWall(w, o.at - o.width / 2), end = alongWall(w, o.at + o.width / 2);
      if (o.kind === "door") insert("DOOR", start, rot, o.width);
      else if (o.kind === "entry") insert("DOOR_ENTRY", start, rot, o.width);
      else if (o.kind === "slider") insert("SLIDER", start, rot, o.width);
      else if (o.kind === "window") {
        const gx = -uy * 0.01, gy = ux * 0.01;
        line("A-GLAZ", [start[0] + gx, start[1] + gy], [end[0] + gx, end[1] + gy]);
        line("A-GLAZ", [start[0] - gx, start[1] - gy], [end[0] - gx, end[1] - gy]);
      }
    }
  }

  for (const r of t.rooms) {
    g(0, "POLYLINE"); g(8, "A-AREA"); g(66, "1"); g(10, 0); g(20, 0); g(30, 0); g(70, "1");
    for (const p of r.polygon) { const [x, y] = P(p); g(0, "VERTEX"); g(8, "A-AREA"); g(10, x); g(20, y); g(30, 0); }
    g(0, "SEQEND"); g(8, "A-AREA");
    const at = labelPoint(r.polygon);
    text("A-AREA-IDEN", at, r.name.he);
    const area = r.areaDeclared ?? Math.round(polygonArea(r.polygon) * 10) / 10;
    text("A-AREA-IDEN", [at[0], at[1] - 0.3], `${area} מ"ר`, 0.14);
  }

  // title block below the drawing
  const all = t.walls.flatMap((w: Wall) => [w.a, w.b]);
  const [x1, y1] = bbox(all.length ? all : [[0, 0], [1, 1], [0, 1]]);
  const lines: string[] = [];
  if (t.declared.area) lines.push(`שטח דירה ${t.declared.area} מ"ר`);
  if (t.declared.balconyArea) lines.push(`מרפסת שמש ${t.declared.balconyArea} מ"ר`);
  if (t.declared.rooms) lines.push(`${t.declared.rooms} חדרים`);
  lines.forEach((s, i) => text("A-ANNO", [x1, y1 - 1.2 - i * 0.4], s, 0.25));

  g(0, "ENDSEC"); g(0, "EOF");
  return out.join("\n") + "\n";
}

/** A point inside the polygon for its label (bbox centre, else a scan). */
export function labelPoint(poly: Pt[]): Pt {
  const [x1, y1, x2, y2] = bbox(poly);
  const c: Pt = [(x1 + x2) / 2, (y1 + y2) / 2];
  if (pointInPolygon(c, poly)) return c;
  for (let fy = 0.5; fy > 0; fy -= 0.1)
    for (let fx = 0.1; fx < 1; fx += 0.1) {
      for (const yy of [y1 + (y2 - y1) * fy, y1 + (y2 - y1) * (1 - fy)]) {
        const p: Pt = [x1 + (x2 - x1) * fx, yy];
        if (pointInPolygon(p, poly)) return p;
      }
    }
  return c;
}
