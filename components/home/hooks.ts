"use client";
import { useEffect, useRef, useState } from "react";

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Scroll-reveal that degrades to "visible": content is only hidden once JS has
 * run, the element is below the fold and motion is allowed. Without JS, or
 * with reduced motion, nothing is ever hidden.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced()) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;
    el.dataset.rv = "hide";
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { delete el.dataset.rv; io.disconnect(); }
    }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

/**
 * Count-up whose value is the final number until the element nears the
 * viewport (SSR, no-JS and reduced motion all show the real value).
 */
export function useCountUp<T extends HTMLElement>(target: number, ms = 1600) {
  const ref = useRef<T | null>(null);
  const [v, setV] = useState(target);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced()) return;
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (t: number) => {
        const k = Math.min(1, (t - t0) / ms);
        setV(Math.round(target * (1 - Math.pow(1 - k, 4))));
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.3 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [target, ms]);
  return [ref, v] as const;
}

/** Writes --sy (px scrolled, capped) on the hero for gentle parallax. */
export function useParallax<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || reduced()) return;
    let raf = 0;
    const tick = () => { raf = 0; node.style.setProperty("--sy", String(Math.min(window.scrollY, window.innerHeight * 1.2))); };
    const on = () => { if (!raf) raf = requestAnimationFrame(tick); };
    window.addEventListener("scroll", on, { passive: true }); tick();
    return () => { window.removeEventListener("scroll", on); cancelAnimationFrame(raf); };
  }, []);
  return ref;
}

/** True once the page has scrolled past `px`. */
export function useScrolled(px = 60) {
  const [s, setS] = useState(false);
  useEffect(() => {
    const on = () => setS(window.scrollY > px);
    on(); window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, [px]);
  return s;
}
