/**
 * Where to put a catalog piece in a room when the AI (or the dry-run planner) only says "in the
 * bedroom, against a wall" or "in front of the sofa". Pure geometry over the baseline; every
 * candidate is checked with the same validation the editor uses (`previewNode`), so a returned
 * position never has a hard error. Candidates without advisories win over ones with advisories.
 *
 * Conventions (lib/studio/validation/geom2d `footprint`): an item's (x, y) is its BACK-centre, it
 * extends `d` metres towards its front, and the front points along (-sin(rot), cos(rot)).
 */
import type { Baseline, BaselineRoom } from "../baseline/fromTwin";
import { resolveSize } from "../catalog/sizing";
import { makeItem } from "../design/spot";
import { previewNode, type Preview } from "../design/preview";
import { snapAngle } from "../design/snap";
import type { CatalogLookup, ModelManifest } from "../schema/catalog";
import type { DesignDocument } from "../schema/document";
import type { ItemNode } from "../schema/nodes";
import { nearestWall, snapToWallFace } from "../validation/architecture";
import { pointInPolygon, type Vec } from "../validation/geom2d";

export type Spot = { x: number; y: number; rot: number; preview: Preview };
type Ctx = { doc: DesignDocument; baseline: Baseline; catalog: CatalogLookup };

/** Rotation whose front points along the unit vector (nx, ny). */
export const rotFacing = (nx: number, ny: number) => Math.atan2(-nx, ny);
export const frontOf = (rot: number): Vec => [-Math.sin(rot), Math.cos(rot)];

const round = (v: number) => Math.round(v * 1000) / 1000;

function trial(ctx: Ctx, manifest: ModelManifest, base: Partial<ItemNode>, x: number, y: number, rot: number): Spot | null {
  const node: ItemNode = { ...makeItem(manifest, round(x), round(y), rot, "__ai_trial__"), ...base, id: "__ai_trial__" } as ItemNode;
  node.transform = { ...node.transform, x: round(x), y: round(y), rot };
  const preview = previewNode(ctx.doc, node, ctx.baseline, ctx.catalog);
  return preview.ok ? { x: round(x), y: round(y), rot, preview } : null;
}

/** Better = no advisories, then fewer advisories, then the given order. */
function best(spots: Spot[]): Spot | null {
  return spots.reduce<Spot | null>((b, s) => (!b || s.preview.advisories.length < b.preview.advisories.length ? s : b), null);
}

/** Inward unit normal of polygon edge i (works for either winding, tested against the polygon). */
function inwardNormal(poly: Vec[], i: number): Vec {
  const a = poly[i], b = poly[(i + 1) % poly.length];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const n: Vec = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
  const mid: Vec = [(a[0] + b[0]) / 2 + n[0] * 0.05, (a[1] + b[1]) / 2 + n[1] * 0.05];
  return pointInPolygon(mid, poly) ? n : [-n[0], -n[1]];
}

/**
 * Back of the piece on a wall face of the room, facing into the room. Walks every edge of the room
 * polygon on a 10 cm grid (longest edges first, centre of each edge first), snaps to the actual wall
 * face, and returns the best legal spot.
 */
export function againstWall(ctx: Ctx, manifest: ModelManifest, room: BaselineRoom, base: Partial<ItemNode> = {}, limit = 6): Spot | null {
  const { w, h } = resolveSize(manifest, base as ItemNode);
  /**
   * A wall a piece can stand against at this spot: solid (not glazing or a railing), and the piece's
   * span along it clear of openings (a door or slider never; a window only if the piece stays below its sill).
   */
  const solidAt = (p: Vec): boolean => {
    const hit = nearestWall(ctx.baseline, p, 0.3);
    if (!hit) return false; // an open edge of the room (open-plan boundary): nothing to stand against
    const wall = ctx.baseline.walls[hit.wallId];
    if (wall.kind === "glazing" || wall.kind === "railing") return false;
    const L = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]) || 1;
    if (hit.at - w / 2 < -0.01 || hit.at + w / 2 > L + 0.01) return false; // the wall must run under the whole back
    for (const o of Object.values(ctx.baseline.openings)) {
      if (o.wallId !== wall.id) continue;
      const oc = ((o.center[0] - wall.a[0]) * (wall.b[0] - wall.a[0]) + (o.center[1] - wall.a[1]) * (wall.b[1] - wall.a[1])) / L;
      const overlaps = Math.abs(oc - hit.at) < w / 2 + o.width / 2 + 0.05;
      if (overlaps && !(o.kind === "window" && o.sill >= manifest.placement.elevation + h + 0.02)) return false;
    }
    return true;
  };
  const poly = room.polygon as Vec[];
  const edges = poly.map((a, i) => ({ i, a, b: poly[(i + 1) % poly.length] }))
    .map((e) => ({ ...e, L: Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) }))
    .filter((e) => e.L >= w + 0.05)
    .sort((p, q) => q.L - p.L);
  const found: Spot[] = [];
  for (const e of edges) {
    const n = inwardNormal(poly, e.i);
    const ux = (e.b[0] - e.a[0]) / e.L, uy = (e.b[1] - e.a[1]) / e.L;
    const half = (e.L - w) / 2;
    const offsets: number[] = [0];
    for (let o = 0.1; o <= half + 1e-9; o += 0.1) offsets.push(o, -o);
    for (const o of offsets) {
      const t = e.L / 2 + o;
      const onEdge: Vec = [e.a[0] + ux * t, e.a[1] + uy * t];
      const face = snapToWallFace(ctx.baseline, [onEdge[0] + n[0] * 0.08, onEdge[1] + n[1] * 0.08], 0.25);
      if (!face.snapped) continue;
      const p: Vec = face.point;
      if (!solidAt(p)) continue;
      const s = trial(ctx, manifest, base, p[0] + n[0] * 0.01, p[1] + n[1] * 0.01, rotFacing(n[0], n[1]));
      if (s) { found.push(s); if (!s.preview.advisories.length) break; }
    }
    if (found.length >= limit || found.some((s) => !s.preview.advisories.length)) break;
  }
  return best(found);
}

/** Free spot on a 25 cm spiral around `near` (default: the room's centroid), facing `rot`. */
export function freeSpot(ctx: Ctx, manifest: ModelManifest, room: BaselineRoom, base: Partial<ItemNode> = {}, near?: Vec, rot = 0, radius = 3): Spot | null {
  const poly = room.polygon as Vec[];
  const c: Vec = near ?? [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
  const found: Spot[] = [];
  const step = 0.25, n = Math.ceil(radius / step);
  const cand: Vec[] = [];
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) cand.push([i * step, j * step]);
  cand.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
  for (const [dx, dy] of cand) {
    if (Math.hypot(dx, dy) > radius) break;
    const x = c[0] + dx, y = c[1] + dy;
    if (!pointInPolygon([x, y], poly)) continue;
    const s = trial(ctx, manifest, base, x, y, rot);
    if (s) { found.push(s); if (!s.preview.advisories.length || found.length >= 8) break; }
  }
  return best(found);
}

/**
 * Next to an existing piece: in front of it (facing it), or beside it (same orientation).
 * `gap` is the free space between the two footprints.
 */
export function nearItem(ctx: Ctx, manifest: ModelManifest, room: BaselineRoom, target: ItemNode, side: "front" | "left" | "right" | "back", gap = 0.4, base: Partial<ItemNode> = {}): Spot | null {
  const tm = ctx.catalog.model(target.catalog);
  if (!tm) return null;
  const td = resolveSize(tm, target), me = resolveSize(manifest, base as ItemNode);
  const { x, y, rot } = target.transform;
  const f = frontOf(rot), r: Vec = [Math.cos(rot), Math.sin(rot)]; // right of the piece, seen from its front
  let p: Vec, myRot: number;
  if (side === "front") {
    // in front, same orientation (rug, coffee table before a sofa): our back starts `gap` past its front
    const dist = td.d + gap;
    p = [x + f[0] * dist, y + f[1] * dist]; myRot = rot;
  } else if (side === "back") {
    p = [x - f[0] * (gap + me.d), y - f[1] * (gap + me.d)]; myRot = rot;
  } else {
    const s = side === "right" ? 1 : -1;
    const lateral = td.w / 2 + gap + me.w / 2;
    p = [x + r[0] * lateral * s, y + r[1] * lateral * s]; myRot = rot;
  }
  const exact = trial(ctx, manifest, base, p[0], p[1], snapAngle(myRot));
  if (exact) return exact;
  return freeSpot(ctx, manifest, room, base, p, snapAngle(myRot), 1.2);
}
