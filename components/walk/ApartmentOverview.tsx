"use client";

/**
 * Dollhouse view of the baked walk apartment: same GLB and Cycles lightmaps as
 * the first-person walk (ApartmentWalk's <Apartment overview />), ceiling
 * removed, orbit/zoom/pan with the mouse or fingers, and a label over each room.
 */
import { Canvas } from "@react-three/fiber";
import { Html, OrbitControls, useProgress } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Suspense, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/LocaleProvider";
import type { ProjectExperience, WalkData } from "@/lib/experience/types";
import { Apartment } from "./ApartmentWalk";

/** Starting camera, relative to the orbit target (world metres): a little left, high, and back past the facade. */
const CAM_OFFSET = [-1, 17, 14.15] as const;

function Progress({ he }: { he: boolean }) {
  const { progress, active } = useProgress();
  if (!active && progress >= 100) return null;
  return (
    <div className="ao-loading" role="status" aria-live="polite">
      {he ? "טוענים את הדירה…" : "Loading the apartment…"} {progress.toFixed(0)}%
    </div>
  );
}

export default function ApartmentOverview({ experience }: { experience: ProjectExperience }) {
  const { walk } = experience;
  // Plan (x, y) ↔ world (x, -z)
  const [cx, cy] = experience.dollhouse.center;
  // camera and zoom limits were tuned on Yarkon (15 m wide): scale them to this apartment
  const [bx1, by1, bx2, by2] = experience.dollhouse.bounds;
  const k = Math.min(1.8, Math.max(0.6, Math.max(bx2 - bx1, by2 - by1) / 15));
  const [CENTER] = useState(() => new THREE.Vector3(cx, 0, -cy));
  const { locale } = useI18n();
  const he = locale === "he";
  const [data, setData] = useState<WalkData | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const controls = useRef<OrbitControlsImpl>(null);
  const idle = useRef<number | undefined>(undefined);
  const [spin] = useState(() => typeof window !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [mobile] = useState(() => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);

  useEffect(() => () => window.clearTimeout(idle.current), []);

  useEffect(() => {
    let cancelled = false;
    fetch(`${walk.base}/walk.json`).then((r) => r.json())
      .then((d: WalkData) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, [walk.base]);

  return (
    <div className="ao-root">
      <style>{CSS}</style>
      {data && (
        <Canvas
          dpr={[1, 1.75]}
          gl={{ antialias: true, toneMapping: THREE.AgXToneMapping }}
          camera={{ fov: 38, near: 0.1, far: 200, position: [CENTER.x + CAM_OFFSET[0] * k, CAM_OFFSET[1] * k, CENTER.z + CAM_OFFSET[2] * k] }}
          onPointerMissed={() => setFocus(null)}
        >
          <Suspense fallback={null}>
            <Apartment walk={walk} data={data} mobile={mobile} overview />
            {Object.entries(data.rooms).map(([id, [x1, y1, x2, y2]]) => {
              const name = walk.rooms[id]?.name[he ? "he" : "en"] ?? id;
              const area = (x2 - x1) * (y2 - y1);
              const on = focus === id;
              return (
                <Html key={id} position={[(x1 + x2) / 2, 1.2, -(y1 + y2) / 2]} center zIndexRange={[20, 0]}>
                  <button
                    type="button"
                    className="ao-label"
                    data-on={on || undefined}
                    dir={he ? "rtl" : "ltr"}
                    onClick={() => setFocus(on ? null : id)}
                  >
                    <span>{name}</span>
                    {on && <small>{area.toFixed(1)} {he ? "מ״ר" : "m²"}</small>}
                  </button>
                </Html>
              );
            })}
          </Suspense>
          <OrbitControls
            ref={controls}
            target={CENTER}
            autoRotate={spin}
            autoRotateSpeed={0.5}
            onStart={() => { window.clearTimeout(idle.current); if (controls.current) controls.current.autoRotate = false; }}
            onEnd={() => {
              window.clearTimeout(idle.current);
              idle.current = window.setTimeout(() => { if (controls.current && spin) controls.current.autoRotate = true; }, 2500);
            }}
            enableDamping
            dampingFactor={0.08}
            minDistance={7 * k}
            maxDistance={32 * k}
            maxPolarAngle={Math.PI * 0.47}
            rotateSpeed={0.55}
            screenSpacePanning={false}
          />
        </Canvas>
      )}
      <Progress he={he} />
      <p className="ao-hint">{he ? "גררו כדי לסובב · גלגלת לזום · קליק ימני להזזה" : "Drag to rotate · scroll to zoom · right-drag to pan"}</p>
    </div>
  );
}

const CSS = `
.ao-root { position: absolute; inset: 0; border-radius: 14px; overflow: hidden; }
.ao-root canvas { cursor: grab; touch-action: none; }
.ao-root canvas:active { cursor: grabbing; }
.ao-label {
  display: flex; flex-direction: column; align-items: center; gap: 1px;
  background: rgba(255,255,255,.86); color: var(--qp-ink, #1d1a14); border: 0; border-radius: 6px;
  padding: 3px 9px; font: 500 11px/1.35 var(--font-heebo, system-ui, sans-serif); white-space: nowrap;
  box-shadow: 0 1px 4px rgba(0,0,0,.18); cursor: pointer; user-select: none;
  transition: background .15s, color .15s, padding .15s;
}
.ao-label[data-on] { background: rgba(179,139,77,.94); color: #fff; padding: 5px 12px; font-size: 12px; font-weight: 700; box-shadow: 0 2px 10px rgba(0,0,0,.25); }
.ao-label small { font-size: 10px; font-weight: 400; opacity: .9; }
.ao-loading { position: absolute; inset: 0; display: grid; place-content: center; color: #f4efe6; font-size: 14px; opacity: .85; pointer-events: none; }
.ao-hint {
  position: absolute; top: 10px; left: 50%; transform: translateX(-50%); margin: 0;
  padding: 5px 14px; border-radius: 999px; background: rgba(10,14,24,.5); color: #fff; font-size: 12px;
  white-space: nowrap; pointer-events: none; backdrop-filter: blur(8px);
}
`;
