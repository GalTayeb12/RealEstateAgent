"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { planSvg } from "@/lib/twin/svg";
import { type PlanTwin, type Pt, type Wall, type Opening, alongWall, wallLength } from "@/lib/twin/schema";
import { addOpening, addWall, moveOpening, moveWall, moveWallEnd } from "./edits";
import { type Frame, PPM, type SnapInfo, endHandleAt, fromPx, hitTest, nearestOnSegment, snapInfo, snapLineValue, toPx } from "./canvasGeom";
import type { Lang } from "./planText";

export type Tool = { mode: "select" } | { mode: "wall"; kind: Wall["kind"] } | { mode: "opening"; kind: Opening["kind"] };

const OPENING_WIDTH: Record<Opening["kind"], number> = { door: 0.9, entry: 0.9, window: 1.2, slider: 2.0, opening: 0.9 };
const WALL_COLOR: Record<Wall["kind"], string> = { exterior: "#2b2a28", interior: "#2b2a28", glazing: "#6f8fa6", railing: "#9a9184" };
const ACCENT = "#1f7a6d";

type Drag =
  | { type: "end"; wallId: string; end: "a" | "b"; base: PlanTwin }
  | { type: "move"; wallId: string; base: PlanTwin; p0: Pt; c0: number; horizontal: boolean }
  | { type: "opening"; id: string; base: PlanTwin }
  | { type: "wall"; start: Pt; base: PlanTwin };

/**
 * The plan drawing (lib/twin/svg) with an interactive SVG layer on top: select walls and openings,
 * drag wall ends and openings, draw walls, drop openings. The twin is edited through the pure
 * functions in ./edits. `onPreview` is called while dragging, `onCommit` once when it ends (with the
 * twin from before the drag, so the parent can undo the whole gesture in one step).
 */
export function PlanCanvas({
  twin, frame, lang, highlight, tool, selected, onSelect, onPreview, onCommit,
}: {
  twin: PlanTwin;
  frame: Frame;
  lang: Lang;
  highlight: string[];
  tool: Tool;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onPreview: (t: PlanTwin) => void;
  onCommit: (next: PlanTwin, base: PlanTwin) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pending, setPending] = useState<Pt | null>(null);     // first click of a two-click wall
  const [cursor, setCursor] = useState<Pt | null>(null);       // plan metres under the pointer
  const [mpp, setMpp] = useState(0.03); // metres per screen pixel: snapping and hit areas are sized in pixels, not metres
  const [guide, setGuide] = useState<{ gx: number | null; gy: number | null; corner: Pt | null } | null>(null); // what the point stuck to

  const html = useMemo(
    () => planSvg(twin, { lang, highlight, frame }).replace("<svg ", '<svg style="width:100%;height:auto;display:block" role="img" '),
    [twin, lang, highlight, frame],
  );
  const W = frame.w * PPM, H = frame.h * PPM;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setPending(null); setDrag(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const snapOpts = (exclude?: string) => ({ tol: Math.min(0.3, Math.max(0.1, 10 * mpp)), lineTol: Math.min(0.2, Math.max(0.06, 7 * mpp)), exclude });
  const hitTol = Math.min(0.35, Math.max(0.12, 8 * mpp));

  function planPoint(e: React.PointerEvent): Pt {
    const svg = svgRef.current!;
    const width = svg.getBoundingClientRect().width;
    if (width > 0) { const m = frame.w / width; if (Math.abs(m - mpp) > 1e-4) setMpp(m); }
    const m = svg.getScreenCTM();
    if (!m) return [0, 0];
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const q = pt.matrixTransform(m.inverse());
    return fromPx(frame, [q.x, q.y]);
  }

  function down(e: React.PointerEvent<SVGSVGElement>) {
    const p = planPoint(e);
    (e.target as Element).setPointerCapture?.(e.pointerId);

    if (tool.mode === "wall") {
      if (pending) { finishWall(pending, p); return; }
      setDrag({ type: "wall", start: snapInfo(twin, p, snapOpts()).pt, base: twin });
      return;
    }
    if (tool.mode === "opening") {
      const h = hitTest(twin, p, hitTol);
      if (h && h.kind === "wall") {
        const { twin: next, id } = addOpening(twin, h.id, tool.kind, h.at, OPENING_WIDTH[tool.kind]);
        if (id) { onCommit(next, twin); onSelect(id); }
      }
      return;
    }
    // select: a handle of the selected wall, an opening of it, then anything else
    const sel = selected ? twin.walls.find((w) => w.id === selected) : undefined;
    if (sel) {
      const end = endHandleAt(twin, sel.id, p, Math.max(0.25, 11 * mpp));
      if (end) { setDrag({ type: "end", wallId: sel.id, end, base: twin }); return; }
    }
    const h = hitTest(twin, p, hitTol);
    if (!h) { onSelect(null); return; }
    onSelect(h.id);
    if (h.kind === "opening") { setDrag({ type: "opening", id: h.id, base: twin }); return; }
    const w = twin.walls.find((x) => x.id === h.id)!;
    const horizontal = Math.abs(w.b[0] - w.a[0]) >= Math.abs(w.b[1] - w.a[1]);
    setDrag({ type: "move", wallId: w.id, base: twin, p0: p, c0: horizontal ? w.a[1] : w.a[0], horizontal });
  }

  /** The twin a drag produces at pointer p, and what the pointer stuck to (for the guides). */
  function dragResult(d: Exclude<Drag, { type: "wall" }>, p: Pt): { next: PlanTwin; snap: SnapInfo | null } {
    if (d.type === "end") {
      const snap = snapInfo(d.base, p, snapOpts(d.wallId));
      return { next: moveWallEnd(d.base, d.wallId, d.end, snap.pt), snap };
    }
    if (d.type === "move") {
      const w = d.base.walls.find((x) => x.id === d.wallId)!;
      const raw = d.horizontal ? d.c0 + (p[1] - d.p0[1]) : d.c0 + (p[0] - d.p0[0]);
      if (Math.abs(raw - d.c0) < 0.08) return { next: d.base, snap: null }; // a click, not a drag
      const { v, snapped } = snapLineValue(d.base, d.horizontal ? "y" : "x", raw, w.thickness / 2, d.wallId, snapOpts().lineTol);
      const snap: SnapInfo = { pt: [0, 0], corner: null, gx: snapped && !d.horizontal ? v : null, gy: snapped && d.horizontal ? v : null };
      return { next: moveWall(d.base, d.wallId, v), snap };
    }
    const o = d.base.openings.find((x) => x.id === d.id), w = o && d.base.walls.find((x) => x.id === o.wallId);
    return { next: o && w ? moveOpening(d.base, o.id, nearestOnSegment(w.a, w.b, p).t) : d.base, snap: null };
  }

  function move(e: React.PointerEvent<SVGSVGElement>) {
    const p = planPoint(e);
    if (tool.mode === "select" && !drag) { setCursor(p); return; }
    const info = snapInfo(twin, p, snapOpts(drag?.type === "end" || drag?.type === "move" ? drag.wallId : undefined));
    setCursor(info.pt);
    if (!drag) { setGuide(info); return; }
    if (drag.type === "wall") { setGuide(info); return; }
    const { next, snap } = dragResult(drag, p);
    setGuide(snap && (snap.gx !== null || snap.gy !== null || snap.corner) ? snap : null);
    onPreview(next);
  }

  function up(e: React.PointerEvent<SVGSVGElement>) {
    if (!drag) return;
    const p = planPoint(e);
    const d = drag;
    setDrag(null);
    setGuide(null);
    if (d.type === "wall") {
      const q = snapInfo(d.base, p, snapOpts()).pt;
      if (Math.hypot(q[0] - d.start[0], q[1] - d.start[1]) < 0.15) setPending(d.start); // a click: wait for the second point
      else finishWall(d.start, p);
      return;
    }
    // end of a drag: the parent already holds the previewed twin; give it the base for undo
    const { next } = dragResult(d, p);
    if (next === d.base) onPreview(d.base); else onCommit(next, d.base);
  }

  function finishWall(start: Pt, p: Pt) {
    const { twin: next, id } = addWall(twin, start, snapInfo(twin, p, snapOpts()).pt, (tool as { kind: Wall["kind"] }).kind);
    setPending(null);
    if (id) { onCommit(next, twin); onSelect(id); }
  }

  // ── overlay drawing ──
  const px = (p: Pt) => toPx(frame, p);
  const quadPoints = (w: Wall, pad = 0.04) => {
    const L = wallLength(w) || 1;
    const t2 = Math.max(w.thickness / 2, 0.06) + pad;
    const nx = (-(w.b[1] - w.a[1]) / L) * t2, ny = ((w.b[0] - w.a[0]) / L) * t2;
    return [[w.a[0] + nx, w.a[1] + ny], [w.b[0] + nx, w.b[1] + ny], [w.b[0] - nx, w.b[1] - ny], [w.a[0] - nx, w.a[1] - ny]]
      .map((q) => px(q as Pt).join(",")).join(" ");
  };
  const selWall = selected ? twin.walls.find((w) => w.id === selected) : undefined;
  const selOpening = selected ? twin.openings.find((o) => o.id === selected) : undefined;
  const hover = !drag && cursor && tool.mode !== "wall" ? hitTest(twin, cursor, hitTol) : null;
  const hoverWall = hover ? twin.walls.find((w) => w.id === (hover.kind === "wall" ? hover.id : hover.wallId)) : undefined;
  const wallStart = drag?.type === "wall" ? drag.start : pending;
  const ghostEnd = wallStart && cursor ? cursor : null;
  const ghost = wallStart && ghostEnd
    ? (Math.abs(ghostEnd[0] - wallStart[0]) >= Math.abs(ghostEnd[1] - wallStart[1]) ? [ghostEnd[0], wallStart[1]] : [wallStart[0], ghostEnd[1]]) as Pt
    : null;
  const openingSpan = (w: Wall, o: Opening) => {
    const a = alongWall(w, o.at - o.width / 2), b = alongWall(w, o.at + o.width / 2);
    return [px(a), px(b)];
  };

  return (
    <div data-testid="plan-canvas" style={{ position: "relative", border: "1px solid var(--qp-border)", borderRadius: "0.625rem", overflow: "hidden", background: "#fbfaf7" }}>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <svg
        ref={svgRef} viewBox={`0 0 ${W.toFixed(0)} ${H.toFixed(0)}`}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", touchAction: tool.mode === "select" ? "pan-y" : "none", cursor: tool.mode === "select" ? (hover ? "pointer" : "default") : "crosshair" }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={() => setCursor(null)}
      >
        {hoverWall && hoverWall.id !== selected && (
          <polygon points={quadPoints(hoverWall)} fill="none" stroke={ACCENT} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.8} />
        )}
        {selWall && (
          <>
            <polygon points={quadPoints(selWall)} fill={ACCENT} fillOpacity={0.12} stroke={ACCENT} strokeWidth={2} />
            {([selWall.a, selWall.b] as Pt[]).map((p, i) => {
              const [cx, cy] = px(p);
              return <circle key={i} data-testid={`wall-handle-${i ? "b" : "a"}`} cx={cx} cy={cy} r={9} fill="#fff" stroke={ACCENT} strokeWidth={2.5} style={{ cursor: "grab" }} />;
            })}
          </>
        )}
        {selOpening && (() => {
          const w = twin.walls.find((x) => x.id === selOpening.wallId);
          if (!w) return null;
          const [[x1, y1], [x2, y2]] = openingSpan(w, selOpening);
          return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={ACCENT} strokeWidth={9} strokeLinecap="round" opacity={0.45} style={{ cursor: "grab" }} />;
        })()}
        {wallStart && (
          <circle cx={px(wallStart)[0]} cy={px(wallStart)[1]} r={6} fill={ACCENT} />
        )}
        {wallStart && ghost && tool.mode === "wall" && (
          <line x1={px(wallStart)[0]} y1={px(wallStart)[1]} x2={px(ghost)[0]} y2={px(ghost)[1]}
            stroke={WALL_COLOR[tool.kind]} strokeWidth={Math.max(3, WALL_THICK_PX[tool.kind])} opacity={0.55} strokeLinecap="square" />
        )}
        {guide && guide.gx !== null && <line x1={px([guide.gx, 0])[0]} y1={0} x2={px([guide.gx, 0])[0]} y2={H} stroke={ACCENT} strokeWidth={1} strokeDasharray="5 4" opacity={0.7} />}
        {guide && guide.gy !== null && <line x1={0} y1={px([0, guide.gy])[1]} x2={W} y2={px([0, guide.gy])[1]} stroke={ACCENT} strokeWidth={1} strokeDasharray="5 4" opacity={0.7} />}
        {guide?.corner && <circle cx={px(guide.corner)[0]} cy={px(guide.corner)[1]} r={8} fill="none" stroke={ACCENT} strokeWidth={2.5} />}
        {tool.mode !== "select" && cursor && !wallStart && (
          <circle cx={px(cursor)[0]} cy={px(cursor)[1]} r={5} fill="none" stroke={ACCENT} strokeWidth={2} />
        )}
      </svg>
    </div>
  );
}

const WALL_THICK_PX: Record<Wall["kind"], number> = { exterior: 14, interior: 8, glazing: 3, railing: 2 };
