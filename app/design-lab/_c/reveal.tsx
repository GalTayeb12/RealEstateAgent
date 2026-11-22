"use client";
import { useEffect, useRef, useState } from "react";

/** Adds data-in="1" once visible; CSS in each concept decides what that animates. */
export function Reveal({ children, className = "", as: Tag = "div", delay = 0 }: { children: React.ReactNode; className?: string; as?: React.ElementType; delay?: number }) {
  const ref = useRef<HTMLElement | null>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0.12 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return <Tag ref={ref} className={className} data-in={on ? "1" : "0"} style={{ transitionDelay: `${delay}ms` }}>{children}</Tag>;
}

/** Scroll progress 0..1 of the nearest scrolling root (.dl-root), written to a CSS var. */
export function ScrollScene({ children, className = "", height = "400vh" }: { children: React.ReactNode; className?: string; height?: string }) {
  const outer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = outer.current?.closest(".dl-root") as HTMLElement | null; const el = outer.current;
    if (!root || !el) return;
    let raf = 0;
    const tick = () => {
      const r = el.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - window.innerHeight)));
      el.style.setProperty("--p", p.toFixed(4));
      raf = 0;
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(tick); };
    root.addEventListener("scroll", on, { passive: true }); window.addEventListener("resize", on); tick();
    return () => { root.removeEventListener("scroll", on); window.removeEventListener("resize", on); };
  }, []);
  return <div ref={outer} className={className} style={{ height, ["--p" as string]: 0 }}>{children}</div>;
}
