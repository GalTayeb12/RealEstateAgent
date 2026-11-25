"use client";
/**
 * Keyboard, mouse-look (pointer lock with drag fallback) and touch input for the
 * studio's walk camera. Same behaviour as the /walk viewer, written as a hook
 * so the studio can mount its own HUD; /walk itself is untouched.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Input } from "@/components/walk/ApartmentWalk";
import { gesture } from "./gesture";
import { useStudio } from "./store";

const LOOK_SPIKE = 250; // px per mouse event above this is a pointer-lock glitch, not input

export function useWalkInput(wrap: React.RefObject<HTMLElement | null>, mobile: boolean) {
  const input = useRef<Input>({ keys: new Set(), lookDX: 0, lookDY: 0, stick: { x: 0, y: 0 }, teleport: null });
  const [locked, setLocked] = useState(false);
  const [stickUi, setStickUi] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const keys = input.current.keys;
    const GAME = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"]);
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, textarea, select, button")) return;
      keys.add(e.code);
      if (GAME.has(e.code)) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => keys.delete(e.code);
    const blur = () => keys.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, []);

  useEffect(() => {
    const el = wrap.current;
    if (!el || mobile) return;
    let dragging = false;
    const onLock = () => setLocked(document.pointerLockElement === el.querySelector("canvas"));
    const move = (e: MouseEvent) => {
      if (gesture.itemActive || !(document.pointerLockElement || dragging)) return;
      if (Math.abs(e.movementX) > LOOK_SPIKE || Math.abs(e.movementY) > LOOK_SPIKE) return;
      input.current.lookDX += e.movementX;
      input.current.lookDY += e.movementY;
    };
    const downM = (e: MouseEvent) => {
      if ((e.target as HTMLElement).tagName !== "CANVAS" || gesture.itemActive) return;
      if (useStudio.getState().mode === "design") {
        // design mode: the left button selects and drags pieces, the right button looks around (no pointer lock)
        if (e.button === 2) dragging = true;
        return;
      }
      dragging = true;
      try { (el.querySelector("canvas")?.requestPointerLock?.() as unknown as Promise<void> | undefined)?.catch?.(() => {}); } catch { /* drag fallback */ }
    };
    const upM = () => { dragging = false; };
    document.addEventListener("pointerlockchange", onLock);
    window.addEventListener("mousemove", move);
    el.addEventListener("mousedown", downM);
    const noMenu = (e: Event) => { if (useStudio.getState().mode === "design") e.preventDefault(); };
    el.addEventListener("contextmenu", noMenu);
    window.addEventListener("mouseup", upM);
    return () => {
      document.removeEventListener("pointerlockchange", onLock);
      window.removeEventListener("mousemove", move);
      el.removeEventListener("mousedown", downM);
      el.removeEventListener("contextmenu", noMenu);
      window.removeEventListener("mouseup", upM);
    };
  }, [mobile, wrap]);

  const touches = useRef(new Map<number, { kind: "stick" | "look"; x: number; y: number; ox: number; oy: number }>());
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if ((t.target as HTMLElement).closest(".st-ui") || gesture.itemActive) continue;
      const kind = t.clientX < window.innerWidth * 0.45 ? "stick" : "look";
      touches.current.set(t.identifier, { kind, x: t.clientX, y: t.clientY, ox: t.clientX, oy: t.clientY });
      if (kind === "stick") setStickUi({ ox: t.clientX, oy: t.clientY, x: 0, y: 0 });
    }
  }, []);
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      const s = touches.current.get(t.identifier);
      if (!s) continue;
      if (s.kind === "look") {
        input.current.lookDX += (t.clientX - s.x) * 1.4;
        input.current.lookDY += (t.clientY - s.y) * 1.4;
      } else {
        const R = 56;
        let dx = (t.clientX - s.ox) / R, dy = (t.clientY - s.oy) / R;
        const l = Math.hypot(dx, dy);
        if (l > 1) { dx /= l; dy /= l; }
        input.current.stick = { x: dx, y: -dy };
        setStickUi({ ox: s.ox, oy: s.oy, x: dx, y: dy });
      }
      s.x = t.clientX; s.y = t.clientY;
    }
  }, []);
  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      const s = touches.current.get(t.identifier);
      if (s?.kind === "stick") { input.current.stick = { x: 0, y: 0 }; setStickUi(null); }
      touches.current.delete(t.identifier);
    }
  }, []);

  return { input, locked, stickUi, touch: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd } };
}
