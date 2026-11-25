"use client";
/**
 * Pan and zoom for the floor planner: wheel zooms at the cursor, a drag on empty
 * space pans, two fingers pan and pinch. A drag that starts on a piece belongs to
 * the design interaction (gesture.itemActive) and is left alone.
 */
import { useEffect } from "react";
import { panBy, zoomAt } from "@/lib/studio/plan/view";
import { gesture } from "../gesture";
import { useStudio } from "../store";

export function usePlanGestures(wrap: React.RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const el = wrap.current;
    if (!el || !active) return;
    const pts = new Map<number, { x: number; y: number }>();
    let panning = false, moved = 0, last = { dist: 0, mx: 0, my: 0 };

    const rect = () => (el.querySelector("canvas") ?? el).getBoundingClientRect();
    const local = (cx: number, cy: number) => { const r = rect(); return { x: cx - r.left, y: cy - r.top }; };
    const apply = (f: (p: NonNullable<ReturnType<typeof useStudio.getState>["plan"]>, vp: ReturnType<typeof useStudio.getState>["viewport"]) => ReturnType<typeof useStudio.getState>["plan"]) => {
      const { plan, viewport, setPlan } = useStudio.getState();
      if (plan) setPlan(f(plan, viewport));
    };

    const wheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).tagName !== "CANVAS") return;
      e.preventDefault();
      const l = local(e.clientX, e.clientY);
      const k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016));
      apply((p, vp) => zoomAt(p, vp, k, l.x, l.y));
    };
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).tagName !== "CANVAS") return;
      if (e.pointerType === "mouse" && e.button === 2) { /* right button also pans */ } else if (e.pointerType === "mouse" && e.button !== 0) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      panning = !gesture.itemActive || pts.size > 1;
      moved = 0;
      if (pts.size === 2) { const [a, b] = [...pts.values()]; last = { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; }
    };
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      if (!p || !panning) return;
      if (pts.size === 1) {
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        moved += Math.abs(dx) + Math.abs(dy);
        if (gesture.itemActive) return;
        if (moved > 4) apply((pl, vp) => panBy(pl, vp, dx, dy));
        p.x = e.clientX; p.y = e.clientY;
      } else {
        p.x = e.clientX; p.y = e.clientY;
        const [a, b] = [...pts.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const l = local(mx, my);
        moved += 10;
        apply((pl, vp) => zoomAt(panBy(pl, vp, mx - last.mx, my - last.my), vp, last.dist > 0 ? dist / last.dist : 1, l.x, l.y));
        last = { dist, mx, my };
      }
    };
    const up = (e: PointerEvent) => {
      if (!pts.delete(e.pointerId)) return;
      if (moved > 4) gesture.suppressClickUntil = performance.now() + 300; // the click that ends a pan must not select
      if (pts.size === 1) { const r = [...pts.values()][0]; void r; }
      if (pts.size === 0) panning = false;
    };

    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [wrap, active]);
}
