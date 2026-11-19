"use client";

/**
 * Immersive real-time 3D explorer ("drone" view).
 *
 * - Night scene, every window dark. Pointing at a floor (or using the slider /
 *   arrow keys) switches that floor's lights on with a smooth glow + bloom.
 * - The camera floats around the towers like a drone and follows the lit floor.
 * - Clicking a floor flies the camera into the facade, then swaps the tower for
 *   an isometric 3D floor plan of that floor (units coloured by status).
 *
 * Same callback contract as BuildingPhotoStage, so FloorPanel / UnitCard / URL
 * state in BuildingExplorer keep working unchanged.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Environment, OrbitControls, Stars } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import * as THREE from "three";
import { Money } from "@/components/Money";
import { useI18n } from "@/components/LocaleProvider";
import type { ExplorerBuilding, ExplorerUnit, FloorSelection, HoverInfo } from "./types";

// ── Geometry constants (metres-ish) ───────────────────────────────────────────
const W = 14;          // tower width (x)
const D = 10;          // tower depth (z)
const FH = 3.4;        // typical floor height
const LOBBY_H = 5.2;   // ground floor height
const GAP = 12;        // gap between towers
const WARM = new THREE.Color("#ffd48a");

const floorBase = (f: number) => (f <= 1 ? 0 : LOBBY_H + (f - 2) * FH);
const floorHeight = (f: number) => (f <= 1 ? LOBBY_H : FH);
const towerX = (i: number, n: number) => (i - (n - 1) / 2) * (W + GAP);

const STR = {
  he: {
    choose: "בחרו קומה", hint: "העבירו עכבר על קומה והיא תידלק. לחצו כדי לצלול פנימה.",
    level: "קומה", penthouse: "פנטהאוז", available: "פנויות", none: "אין דירות פנויות",
    from: "החל מ־", cta: "היכנסו לקומה", back: "חזרה לבניין", drag: "גררו כדי לסובב",
    plan: "תוכנית הקומה", pick: "בחרו דירה בתוכנית",
  },
  en: {
    choose: "Choose your floor", hint: "Point at a floor and it lights up. Click to dive in.",
    level: "Level", penthouse: "Penthouse", available: "available", none: "No units available",
    from: "From ", cta: "Enter the floor", back: "Back to the tower", drag: "Drag to orbit",
    plan: "Floor plan", pick: "Pick an apartment on the plan",
  },
} as const;

type Phase = "idle" | "fly" | "plan";
interface Lit { buildingId: string; floor: number }

// ── Window texture: dark mullions + bright panes (used as emissive map) ──────
function makeWindowTexture(cols: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000"; g.fillRect(0, 0, c.width, c.height);
  const cw = c.width / cols;
  for (let i = 0; i < cols; i++) {
    const v = 0.78 + ((i * 37) % 7) / 40;          // each pane a touch different
    g.fillStyle = `rgb(${255 * v | 0},${240 * v | 0},${210 * v | 0})`;
    g.fillRect(i * cw + 5, 22, cw - 10, c.height - 44);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ── One floor of one tower ───────────────────────────────────────────────────
function Floor({
  x, floor, lobby, penthouse, matRef, onOver, onOut, onPick,
}: {
  x: number; floor: number; lobby: boolean; penthouse: boolean;
  matRef: (m: THREE.MeshStandardMaterial | null) => void;
  onOver: () => void; onOut: () => void; onPick: (touch: boolean) => void;
}) {
  const h = floorHeight(floor);
  const y = floorBase(floor);
  const tex = useMemo(() => makeWindowTexture(lobby ? 3 : 7), [lobby]);
  return (
    <group position={[x, y, 0]}>
      {/* slab */}
      <mesh position={[0, h - 0.17, 0]}>
        <boxGeometry args={[W + 0.7, 0.34, D + 0.7]} />
        <meshStandardMaterial color="#2a2f3a" roughness={0.85} metalness={0.1} />
      </mesh>
      {/* glazing */}
      <mesh
        position={[0, h / 2 - 0.17, 0]}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); if (!lobby) onOver(); }}
        onPointerOut={() => onOut()}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          if (!lobby) onPick((e.nativeEvent as PointerEvent).pointerType === "touch");
        }}
      >
        <boxGeometry args={[W, h - 0.34, D]} />
        <meshStandardMaterial
          ref={matRef}
          color="#0d1320" roughness={0.18} metalness={0.85}
          emissive={WARM} emissiveMap={tex} emissiveIntensity={0}
        />
      </mesh>
      {/* balcony */}
      {!lobby && (
        <>
          <mesh position={[0, h - 0.17, D / 2 + 1.05]}>
            <boxGeometry args={[W + 0.3, 0.2, 2.1]} />
            <meshStandardMaterial color="#343a47" roughness={0.8} />
          </mesh>
          <mesh position={[0, h + 0.4, D / 2 + 2.05]}>
            <boxGeometry args={[W + 0.3, 1.05, 0.05]} />
            <meshPhysicalMaterial color="#8fb2c9" transparent opacity={0.22} roughness={0.05} />
          </mesh>
        </>
      )}
      {penthouse && (
        <mesh position={[0, h + 0.15, 0]}>
          <boxGeometry args={[W + 1.4, 0.3, D + 1.4]} />
          <meshStandardMaterial color="#1b1f28" roughness={0.7} />
        </mesh>
      )}
      {lobby && (
        <mesh position={[0, 0.02, 0]}>
          <boxGeometry args={[W + 2.4, 0.05, D + 2.4]} />
          <meshStandardMaterial color="#c9b48a" emissive="#ffcf8a" emissiveIntensity={0.15} roughness={0.5} />
        </mesh>
      )}
    </group>
  );
}

// ── A whole tower ────────────────────────────────────────────────────────────
function Tower({
  building, x, mats, lit, setLit, onPick,
}: {
  building: ExplorerBuilding; x: number;
  mats: React.MutableRefObject<Map<string, THREE.MeshStandardMaterial>>;
  lit: Lit | null; setLit: (l: Lit | null, hover: boolean) => void;
  onPick: (b: string, f: number, touch: boolean) => void;
}) {
  const n = Math.max(building.floorCount, 2);
  const topY = floorBase(n) + floorHeight(n);
  const unitFloors = useMemo(() => new Set(building.units.map((u) => u.floor)), [building.units]);
  return (
    <group>
      {Array.from({ length: n }, (_, i) => {
        const f = i + 1;
        const key = `${building.id}:${f}`;
        return (
          <Floor
            key={key}
            x={x} floor={f}
            lobby={!unitFloors.has(f)}
            penthouse={f === n && unitFloors.has(f)}
            matRef={(m) => { if (m) mats.current.set(key, m); else mats.current.delete(key); }}
            onOver={() => setLit({ buildingId: building.id, floor: f }, true)}
            onOut={() => { if (lit?.buildingId === building.id && lit.floor === f) setLit(null, true); }}
            onPick={(touch) => onPick(building.id, f, touch)}
          />
        );
      })}
      {/* crown */}
      <mesh position={[x, topY + 0.6, 0]}>
        <boxGeometry args={[W - 3, 1.2, D - 3]} />
        <meshStandardMaterial color="#14171f" roughness={0.9} />
      </mesh>
      <mesh position={[x, topY + 4, 0]}>
        <cylinderGeometry args={[0.07, 0.14, 7, 8]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      <mesh position={[x, topY + 7.5, 0]}>
        <sphereGeometry args={[0.22, 12, 12]} />
        <meshBasicMaterial color="#ff4d4d" toneMapped={false} />
      </mesh>
    </group>
  );
}

// ── Glow follower: lights the facade, ground and neighbours ──────────────────
function GlowLight({ pos, on }: { pos: THREE.Vector3 | null; on: boolean }) {
  const ref = useRef<THREE.PointLight>(null);
  const goal = useRef(new THREE.Vector3(0, 10, 12));
  useFrame((_, dt) => {
    const l = ref.current; if (!l) return;
    if (pos) goal.current.copy(pos);
    l.position.x = THREE.MathUtils.damp(l.position.x, goal.current.x, 8, dt);
    l.position.y = THREE.MathUtils.damp(l.position.y, goal.current.y, 8, dt);
    l.position.z = THREE.MathUtils.damp(l.position.z, goal.current.z, 8, dt);
    l.intensity = THREE.MathUtils.damp(l.intensity, on ? 900 : 0, 6, dt);
  });
  return <pointLight ref={ref} color="#ffcf8a" distance={46} decay={2} intensity={0} />;
}

// ── Environment: sky dome, river/plaza, distant skyline ──────────────────────
function Sky() {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color("#04060f") }, mid: { value: new THREE.Color("#1a1740") }, low: { value: new THREE.Color("#c2557a") } },
    vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }",
    fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 low;
      void main(){ float h = normalize(vP).y; vec3 c = mix(low, mid, smoothstep(-0.02, .22, h)); c = mix(c, top, smoothstep(.2, .75, h)); gl_FragColor = vec4(c,1.); }`,
  }), []);
  return <mesh scale={400} material={mat}><sphereGeometry args={[1, 32, 16]} /></mesh>;
}

function Skyline() {
  const items = useMemo(() => {
    // deterministic pseudo-random in [0,1) per (index, channel)
    const rnd = (i: number, k: number) => {
      const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };
    return Array.from({ length: 46 }, (_, i) => {
      const a = (i / 46) * Math.PI * 2;
      const r = 230 + rnd(i, 1) * 70;
      const h = 8 + rnd(i, 2) * 26;
      return { x: Math.cos(a) * r, z: Math.sin(a) * r - 20, h, w: 5 + rnd(i, 3) * 9, lit: rnd(i, 4) < 0.55 };
    });
  }, []);
  return (
    <group>
      {items.map((b, i) => (
        <mesh key={i} position={[b.x, b.h / 2 - 1, b.z]}>
          <boxGeometry args={[b.w, b.h, b.w]} />
          <meshStandardMaterial color="#0b0e18" emissive={b.lit ? "#ffb66a" : "#000"} emissiveIntensity={b.lit ? 0.18 : 0} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

function Ground({ n }: { n: number }) {
  const span = n * (W + GAP) + 80;
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]}>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color="#0a0d16" roughness={0.35} metalness={0.6} />
      </mesh>
      {/* plaza */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.0, 6]}>
        <planeGeometry args={[span, 46]} />
        <meshStandardMaterial color="#1a1d27" roughness={0.45} metalness={0.3} />
      </mesh>
      {/* warm path lamps */}
      {Array.from({ length: 14 }, (_, i) => (
        <mesh key={i} position={[(i - 6.5) * ((span - 10) / 14), 0.6, 24]}>
          <sphereGeometry args={[0.18, 10, 10]} />
          <meshBasicMaterial color="#ffd9a0" toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

// ── Camera rig: drone drift, follow the lit floor, dive, plan orbit ──────────
function Rig({
  phase, focus, onArrive, planKey, reduce,
}: {
  phase: Phase; focus: THREE.Vector3 | null; onArrive: () => void; planKey: number; reduce: boolean;
}) {
  const { camera, pointer } = useThree();
  const look = useRef(new THREE.Vector3(-8, 13, 0));
  const arrived = useRef(false);
  const t0 = useRef(0);
  const planStart = useRef(0);

  useEffect(() => { arrived.current = false; }, [phase]);

  // entering plan: start high above and swing down to the isometric angle
  useEffect(() => {
    if (phase !== "plan") return;
    planStart.current = performance.now();
    camera.position.set(6, 70, 8);
    camera.lookAt(6, 0, 0);
  }, [phase, planKey, camera]);

  useFrame((state, dt) => {
    const cam = state.camera as THREE.PerspectiveCamera;
    const t = state.clock.elapsedTime;
    if (phase === "plan") {
      const k = Math.min((performance.now() - planStart.current) / 1600, 1);
      const e = 1 - Math.pow(1 - k, 3);
      if (k < 1) {
        const to = new THREE.Vector3(44, 46, 52);
        const from = new THREE.Vector3(6, 70, 8);
        cam.position.lerpVectors(from, to, e);
        cam.lookAt(6, 0, 0);
      }
      return;
    }
    const sway = reduce ? 0 : 1;
    let pos: THREE.Vector3;
    let tgt: THREE.Vector3;
    let rate = 1.6;
    if (phase === "fly" && focus) {
      pos = new THREE.Vector3(focus.x, focus.y + 0.4, D / 2 + 4.2);
      tgt = new THREE.Vector3(focus.x, focus.y, 0);
      rate = 2.4;
    } else if (focus) {
      pos = new THREE.Vector3(
        focus.x * 0.5 - 6 + Math.sin(t * 0.15) * 7 * sway + pointer.x * 4,
        focus.y * 0.6 + 8 + Math.sin(t * 0.21) * 1.2 * sway,
        66 - Math.min(focus.y, 40) * 0.3,
      );
      tgt = new THREE.Vector3(focus.x * 0.6 - 6, focus.y, 0);
    } else {
      pos = new THREE.Vector3(
        -8 + Math.sin(t * 0.12) * 20 * sway + pointer.x * 5,
        17 + Math.sin(t * 0.2) * 2 * sway + pointer.y * 2,
        92 + Math.cos(t * 0.12) * 4 * sway,
      );
      tgt = new THREE.Vector3(-8, 13, 0);
    }
    cam.position.x = THREE.MathUtils.damp(cam.position.x, pos.x, rate, dt);
    cam.position.y = THREE.MathUtils.damp(cam.position.y, pos.y, rate, dt);
    cam.position.z = THREE.MathUtils.damp(cam.position.z, pos.z, rate, dt);
    look.current.x = THREE.MathUtils.damp(look.current.x, tgt.x, rate * 1.3, dt);
    look.current.y = THREE.MathUtils.damp(look.current.y, tgt.y, rate * 1.3, dt);
    look.current.z = THREE.MathUtils.damp(look.current.z, tgt.z, rate * 1.3, dt);
    cam.lookAt(look.current);
    if (phase === "fly" && focus && !arrived.current && cam.position.distanceTo(pos) < 0.9) {
      arrived.current = true;
      onArrive();
    }
    void t0;
  });
  return null;
}

// ── Isometric 3D floor plan ──────────────────────────────────────────────────
const STATUS_COL: Record<string, string> = { available: "#5fd1ae", reserved: "#f0b35a", sold: "#6f7788" };

function unitTexture(label: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 128;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 256, 128);
  g.fillStyle = "rgba(10,14,24,.78)";
  g.beginPath(); g.roundRect(8, 24, 240, 80, 18); g.fill();
  g.fillStyle = "#ffe6b0"; g.font = "600 46px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(label, 128, 66);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function Wall({ p, s, c = "#f1ece2" }: { p: [number, number, number]; s: [number, number, number]; c?: string }) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} roughness={0.85} />
    </mesh>
  );
}

function UnitPlan({
  unit, cx, cw, selected, hovered, onClick, onOver, onOut,
}: {
  unit: ExplorerUnit; cx: number; cw: number; selected: boolean; hovered: boolean;
  onClick: () => void; onOver: () => void; onOut: () => void;
}) {
  const col = STATUS_COL[unit.status] ?? STATUS_COL.available;
  const hot = selected || hovered;
  const tex = useMemo(() => unitTexture(unit.unitNumber), [unit.unitNumber]);
  const depth = 15;      // unit depth (z), from front (balcony) to corridor
  const t = 0.22;        // wall thickness
  const wh = 2.5;
  const z0 = -depth / 2;
  const bedD = 5.2;      // bedrooms strip at the back
  const nb = Math.max(2, Math.min(4, Math.round(cw / 4.6)));
  return (
    <group position={[cx, 0, 0]}
      onPointerOver={(e) => { e.stopPropagation(); onOver(); }}
      onPointerOut={onOut}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {/* floor tile */}
      <mesh position={[0, 0.06, 0]} receiveShadow>
        <boxGeometry args={[cw - 0.1, 0.12, depth]} />
        <meshStandardMaterial color={hot ? "#f6efe0" : "#d9d2c3"} emissive={col} emissiveIntensity={hot ? 0.38 : 0.12} roughness={0.7} />
      </mesh>
      {/* outer walls: back (corridor side), sides */}
      <Wall p={[0, wh / 2, z0]} s={[cw, wh, t]} />
      <Wall p={[-cw / 2, wh / 2, 0]} s={[t, wh, depth]} />
      <Wall p={[cw / 2, wh / 2, 0]} s={[t, wh, depth]} />
      {/* glass front wall */}
      <mesh position={[0, wh / 2, depth / 2]}>
        <boxGeometry args={[cw - 0.3, wh, 0.06]} />
        <meshPhysicalMaterial color="#9ec6dd" transparent opacity={0.28} roughness={0.05} />
      </mesh>
      {/* bedroom partition + bedroom dividers */}
      <Wall p={[0, wh / 2, z0 + bedD]} s={[cw * 0.82, wh, t]} />
      {Array.from({ length: nb - 1 }, (_, i) => (
        <Wall key={i} p={[-cw / 2 + ((i + 1) * cw) / nb, wh / 2, z0 + bedD / 2]} s={[t, wh, bedD]} />
      ))}
      {/* beds */}
      {Array.from({ length: nb }, (_, i) => (
        <mesh key={i} position={[-cw / 2 + ((i + 0.5) * cw) / nb, 0.35, z0 + 2.1]}>
          <boxGeometry args={[Math.min(2.1, cw / nb - 0.9), 0.5, 2.3]} />
          <meshStandardMaterial color="#8c93a6" roughness={0.9} />
        </mesh>
      ))}
      {/* living area: sofa, table, kitchen island */}
      <mesh position={[-cw * 0.18, 0.4, 2.2]}><boxGeometry args={[3.2, 0.6, 1.2]} /><meshStandardMaterial color="#b8a58a" roughness={0.9} /></mesh>
      <mesh position={[-cw * 0.18, 0.2, 4.2]}><boxGeometry args={[1.6, 0.25, 1]} /><meshStandardMaterial color="#5a4a3a" roughness={0.6} /></mesh>
      <mesh position={[cw * 0.22, 0.5, 0.4]}><boxGeometry args={[2.8, 0.9, 1.0]} /><meshStandardMaterial color="#e7e2d6" roughness={0.5} /></mesh>
      <mesh position={[cw * 0.22, 0.4, 3.6]}><boxGeometry args={[1.9, 0.12, 1.0]} /><meshStandardMaterial color="#6b5238" roughness={0.6} /></mesh>
      {/* balcony */}
      <mesh position={[0, 0.06, depth / 2 + 1.1]}>
        <boxGeometry args={[cw - 0.1, 0.12, 2.2]} />
        <meshStandardMaterial color="#b9b2a2" roughness={0.8} />
      </mesh>
      {/* warm light inside */}
      <pointLight position={[0, 2.2, 1]} color="#ffd9a0" intensity={hot ? 34 : 14} distance={14} decay={2} />
      {/* number plate lying on the floor */}
      <mesh position={[0, 0.16, depth / 2 - 1.6]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[3.6, 1.8]} />
        <meshBasicMaterial map={tex} transparent toneMapped={false} />
      </mesh>
      {/* status marker */}
      <mesh position={[0, wh + 0.4, z0 + 0.1]}>
        <boxGeometry args={[cw * 0.6, 0.14, 0.14]} />
        <meshBasicMaterial color={col} toneMapped={false} />
      </mesh>
    </group>
  );
}

function FloorPlan({
  units, selectedUnitId, hoveredUnitId, onUnitClick, onUnitHover,
}: {
  units: ExplorerUnit[]; selectedUnitId: string | null; hoveredUnitId: string | null;
  onUnitClick: (id: string) => void; onUnitHover: (id: string | null) => void;
}) {
  const n = Math.max(units.length, 1);
  const total = Math.min(40, 9 + n * 6.5);
  const cw = total / n;
  return (
    <group>
      {/* base slab + corridor */}
      <mesh position={[0, -0.25, 0]} receiveShadow>
        <boxGeometry args={[total + 4, 0.5, 22]} />
        <meshStandardMaterial color="#12161f" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.02, -9.6]}>
        <boxGeometry args={[total + 2, 0.06, 2.6]} />
        <meshStandardMaterial color="#232938" roughness={0.9} />
      </mesh>
      {units.map((u, i) => (
        <UnitPlan
          key={u.id} unit={u}
          cx={-total / 2 + cw * (i + 0.5)} cw={cw}
          selected={u.id === selectedUnitId} hovered={u.id === hoveredUnitId}
          onClick={() => onUnitClick(u.id)}
          onOver={() => onUnitHover(u.id)}
          onOut={() => onUnitHover(null)}
        />
      ))}
    </group>
  );
}

// ── Scene root ───────────────────────────────────────────────────────────────
function Scene({
  sorted, lit, setLit, phase, focus, onPick, onArrive, planKey, reduce, planBuilding, selectedFloor,
  selectedUnitId, hoveredUnitId, onUnitClick, onUnitHover, bloom,
}: {
  sorted: ExplorerBuilding[]; lit: Lit | null; setLit: (l: Lit | null, hover: boolean) => void;
  phase: Phase; focus: THREE.Vector3 | null; onPick: (b: string, f: number, touch: boolean) => void;
  onArrive: () => void; planKey: number; reduce: boolean;
  planBuilding: ExplorerBuilding | null; selectedFloor: FloorSelection | null;
  selectedUnitId: string | null; hoveredUnitId: string | null;
  onUnitClick: (id: string) => void; onUnitHover: (id: string | null) => void; bloom: boolean;
}) {
  const mats = useRef(new Map<string, THREE.MeshStandardMaterial>());
  const litKey = lit ? `${lit.buildingId}:${lit.floor}` : null;
  const showTower = phase !== "plan";

  useFrame((_, dt) => {
    mats.current.forEach((m, key) => {
      const goal = key === litKey ? 2.4 : 0;
      m.emissiveIntensity = THREE.MathUtils.damp(m.emissiveIntensity, goal, goal > 0 ? 7 : 4, dt);
    });
  });

  const planUnits = useMemo(() => {
    if (!planBuilding || !selectedFloor) return [];
    return planBuilding.units
      .filter((u) => u.floor === selectedFloor.floor)
      .sort((a, b) => a.positionIndex - b.positionIndex);
  }, [planBuilding, selectedFloor]);

  return (
    <>
      <color attach="background" args={["#05070d"]} />
      <fogExp2 attach="fog" args={["#141530", 0.0026]} />
      <ambientLight intensity={showTower ? 0.28 : 0.5} color="#8a93c9" />
      <directionalLight position={[-40, 40, 30]} intensity={showTower ? 1.1 : 1.1} color="#9fb0ff" />
      <directionalLight position={[50, 20, -30]} intensity={showTower ? 1.4 : 0.2} color="#ff9ab8" />
      <Environment files="/hdr/potsdamer_platz_1k.hdr" environmentIntensity={showTower ? 0.35 : 0.2} />
      <Rig phase={phase} focus={focus} onArrive={onArrive} planKey={planKey} reduce={reduce} />

      <group visible={showTower}>
        <Sky />
        <Stars radius={260} depth={40} count={1800} factor={4} fade speed={0.4} />
        <Skyline />
        <Ground n={sorted.length} />
        {sorted.map((b, i) => (
          <Tower key={b.id} building={b} x={towerX(i, sorted.length)} mats={mats} lit={lit} setLit={setLit} onPick={onPick} />
        ))}
        <GlowLight pos={focus ? new THREE.Vector3(focus.x, focus.y, D / 2 + 7) : null} on={Boolean(lit)} />
      </group>

      <group visible={phase === "plan"}>
        <FloorPlan units={planUnits} selectedUnitId={selectedUnitId} hoveredUnitId={hoveredUnitId}
          onUnitClick={onUnitClick} onUnitHover={onUnitHover} />
        <OrbitControls
          makeDefault enabled={phase === "plan"} enableDamping dampingFactor={0.08}
          target={[6, 0, 0]} minDistance={24} maxDistance={110}
          minPolarAngle={Math.PI / 6} maxPolarAngle={Math.PI / 2.4}
          enablePan={false}
        />
      </group>

      {bloom && (
        <EffectComposer multisampling={0}>
          <Bloom intensity={0.9} luminanceThreshold={0.55} luminanceSmoothing={0.25} mipmapBlur />
        </EffectComposer>
      )}
    </>
  );
}

// ── Public component ─────────────────────────────────────────────────────────
export default function BuildingImmersiveStage({
  buildings, selectedFloor, selectedUnitId, hoveredUnitId,
  onHover, onFloorClick, onUnitClick, onUnitHover, onBack,
}: {
  buildings: ExplorerBuilding[];
  selectedFloor: FloorSelection | null;
  selectedUnitId: string | null;
  hoveredUnitId: string | null;
  onHover: (info: HoverInfo | null, id?: string | null) => void;
  onFloorClick: (buildingId: string, floor: number) => void;
  onUnitClick: (unitId: string) => void;
  onUnitHover: (unitId: string | null) => void;
  onBack?: () => void;
}) {
  const { locale } = useI18n();
  const isRtl = locale === "he";
  const t = STR[isRtl ? "he" : "en"];

  const sorted = useMemo(() => [...buildings].sort((a, b) => a.sortIndex - b.sortIndex), [buildings]);
  const [hoverLit, setHoverLit] = useState<Lit | null>(null);
  const [sliderLit, setSliderLit] = useState<Lit | null>(null);
  const [flying, setFlying] = useState<Lit | null>(null);
  const [veil, setVeil] = useState(0);
  const [planKey, setPlanKey] = useState(0);
  // Client-only component (dynamic, ssr: false), so window is available here.
  const [reduce] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [bloom] = useState(() => window.innerWidth > 760);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const ts = timers.current;
    return () => ts.forEach((id) => window.clearTimeout(id));
  }, []);

  const lit: Lit | null = selectedFloor ?? flying ?? hoverLit ?? sliderLit;
  const phase: Phase = selectedFloor ? "plan" : flying ? "fly" : "idle";

  const planBuilding = selectedFloor ? sorted.find((b) => b.id === selectedFloor.buildingId) ?? null : null;
  const litBuilding = lit ? sorted.find((b) => b.id === lit.buildingId) ?? null : null;
  const panelBuilding = litBuilding ?? sorted[0] ?? null;

  const floorsWithUnits = useCallback(
    (b: ExplorerBuilding) => [...new Set(b.units.map((u) => u.floor))].sort((a, c) => a - c), [],
  );
  const panelFloors = panelBuilding ? floorsWithUnits(panelBuilding) : [];

  const info = useMemo(() => {
    if (!lit || !litBuilding) return null;
    const units = litBuilding.units.filter((u) => u.floor === lit.floor);
    const avail = units.filter((u) => u.status === "available");
    const prices = avail.map((u) => u.price ?? u.listPrice).filter((p) => p > 0);
    const max = Math.max(...litBuilding.units.map((u) => u.floor), 1);
    return {
      total: units.length, available: avail.length, lobby: units.length === 0,
      penthouse: lit.floor === max && units.length > 0,
      minPrice: prices.length ? Math.min(...prices) : null,
    };
  }, [lit, litBuilding]);

  const focus = useMemo(() => {
    if (!lit || !litBuilding) return null;
    const i = sorted.indexOf(litBuilding);
    return new THREE.Vector3(
      towerX(i, sorted.length),
      floorBase(lit.floor) + floorHeight(lit.floor) / 2,
      0,
    );
  }, [lit, litBuilding, sorted]);

  const setLit = useCallback((l: Lit | null, hover: boolean) => {
    if (!hover) { setSliderLit(l); return; }
    setHoverLit(l);
    if (l) {
      const b = sorted.find((x) => x.id === l.buildingId);
      const us = b?.units.filter((u) => u.floor === l.floor) ?? [];
      const max = Math.max(...(b?.units.map((u) => u.floor) ?? [1]), 1);
      onHover({
        buildingName: b?.name ?? "", floor: l.floor, lobby: false,
        availableCount: us.filter((u) => u.status === "available").length,
        totalCount: us.length, isPenthouse: l.floor === max,
      }, l.buildingId);
    } else onHover(null, null);
  }, [sorted, onHover]);

  const startFly = useCallback((buildingId: string, floor: number) => {
    if (reduce) { onFloorClick(buildingId, floor); return; }
    setFlying({ buildingId, floor });
  }, [reduce, onFloorClick]);

  const onPick = useCallback((b: string, f: number, touch: boolean) => {
    // touch: first tap lights the floor, second tap dives in
    if (touch && !(lit && lit.buildingId === b && lit.floor === f)) { setHoverLit({ buildingId: b, floor: f }); return; }
    startFly(b, f);
  }, [lit, startFly]);

  const onArrive = useCallback(() => {
    if (!flying) return;
    const target = flying;
    setVeil((v) => v + 1);
    timers.current.push(window.setTimeout(() => {
      setPlanKey((k) => k + 1);
      onFloorClick(target.buildingId, target.floor);
      setFlying(null);
    }, 380));
  }, [flying, onFloorClick]);

  // back from plan: leave a cinematic cut and reposition the camera at the facade
  const prevSel = useRef<FloorSelection | null>(selectedFloor);
  useEffect(() => {
    if (prevSel.current && !selectedFloor) setVeil((v) => v + 1);
    prevSel.current = selectedFloor;
  }, [selectedFloor]);

  // keyboard: ↑/↓ moves the lit floor, Enter dives in
  useEffect(() => {
    if (selectedFloor || flying || !panelBuilding || panelFloors.length === 0) return;
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const idx = lit && panelFloors.includes(lit.floor) ? panelFloors.indexOf(lit.floor) : Math.floor(panelFloors.length / 2);
        const next = Math.min(Math.max(idx + (e.key === "ArrowUp" ? 1 : -1), 0), panelFloors.length - 1);
        setHoverLit(null);
        setSliderLit({ buildingId: panelBuilding.id, floor: panelFloors[next] });
      } else if (e.key === "Enter" && lit && info && !info.lobby && !(e.target as HTMLElement | null)?.closest("button")) {
        startFly(lit.buildingId, lit.floor);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [selectedFloor, flying, panelBuilding, panelFloors, lit, info, startFly]);

  const cursor = Boolean(hoverLit);

  const showPanel = !selectedFloor && !flying && panelBuilding;
  const sliderIndex = lit && panelFloors.includes(lit.floor) ? panelFloors.indexOf(lit.floor) : -1;

  return (
    <div className="hn-im" style={{ position: "absolute", inset: 0, background: "#05070d", cursor: cursor ? "pointer" : phase === "plan" ? "grab" : "default" }}>
      <style>{`
        .hn-im-veil { position: absolute; inset: 0; z-index: 4; pointer-events: none; background: #05070d; animation: hn-im-veil 1s ease both; }
        @keyframes hn-im-veil { 0% { opacity: 0; } 38% { opacity: 1; } 100% { opacity: 0; } }
        .hn-im-head { position: absolute; z-index: 3; top: 0; left: 0; right: 0; text-align: center; color: #fff; pointer-events: none;
          padding: calc(var(--qp-nav-h, 64px) + clamp(1rem, 3vh, 2rem)) 1.25rem 0; text-shadow: 0 2px 24px rgba(0,0,0,.6); }
        .hn-im-head h2 { margin: 0; font-family: var(--font-fraunces, serif); font-weight: 500; font-size: clamp(1.5rem, 3.4vw, 2.6rem); }
        .hn-im-head p { margin: .3rem 0 0; font-size: .82rem; opacity: .8; }
        .hn-im-panel { position: absolute; z-index: 5; top: 50%; transform: translateY(-50%); left: clamp(1rem, 4vw, 3.5rem);
          width: min(300px, 28vw); min-width: 262px; padding: 1.3rem; color: #fff;
          background: linear-gradient(160deg, rgba(255,255,255,.15), rgba(255,255,255,.06)); border: 1px solid rgba(255,255,255,.24); border-radius: 18px;
          backdrop-filter: blur(22px) saturate(1.4); -webkit-backdrop-filter: blur(22px) saturate(1.4);
          box-shadow: 0 24px 60px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.28); }
        .hn-im-eyebrow { font-size: .7rem; letter-spacing: .14em; text-transform: uppercase; opacity: .72; }
        .hn-im-level { display: flex; align-items: baseline; gap: .6rem; margin: .3rem 0; }
        .hn-im-level small { font-size: .8rem; opacity: .8; }
        .hn-im-level b { font-family: var(--font-fraunces, serif); font-weight: 400; font-size: 4rem; line-height: .95; color: #ffe6b0; text-shadow: 0 0 28px rgba(255,200,110,.55); }
        .hn-im-meta { font-size: .85rem; line-height: 1.55; } .hn-im-meta .ok { color: #ffe096; font-weight: 600; }
        .hn-im-slider { width: 100%; margin: 1rem 0 .3rem; accent-color: #ffd98a; cursor: pointer; }
        .hn-im-range { display: flex; justify-content: space-between; font-size: .68rem; opacity: .65; }
        .hn-im-tabs { display: flex; gap: .4rem; margin: .6rem 0; }
        .hn-im-tab { flex: 1; padding: .4rem .5rem; font: inherit; font-size: .78rem; color: #fff; cursor: pointer; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.2); border-radius: 10px; }
        .hn-im-tab[aria-pressed="true"] { background: rgba(255,230,176,.28); border-color: rgba(255,230,176,.7); }
        .hn-im-cta { width: 100%; margin-top: 1rem; padding: .75rem 1rem; font: inherit; font-weight: 600; font-size: .92rem; color: #2a1a05; cursor: pointer; border: 0; border-radius: 12px;
          background: linear-gradient(135deg, #ffe6b0, #ffc979); box-shadow: 0 8px 26px rgba(255,190,100,.38); }
        .hn-im-cta:disabled { opacity: .4; cursor: default; }
        .hn-im-back { position: absolute; z-index: 6; top: calc(var(--qp-nav-h, 64px) + 1rem); inset-inline-start: clamp(1rem, 4vw, 3.5rem);
          padding: .5rem 1rem; font: inherit; font-size: .82rem; color: #fff; cursor: pointer; background: rgba(10,14,24,.5);
          border: 1px solid rgba(255,255,255,.28); border-radius: 999px; backdrop-filter: blur(12px); }
        .hn-im-hint { position: absolute; z-index: 3; bottom: 1.1rem; left: 50%; transform: translateX(-50%); color: #fff; font-size: .78rem; opacity: .7;
          background: rgba(10,14,24,.45); padding: .3rem .9rem; border-radius: 999px; pointer-events: none; }
        @media (max-width: 760px) {
          .hn-im-panel { top: auto; bottom: 0; inset-inline: 0; width: auto; min-width: 0; transform: none; border-radius: 18px 18px 0 0; padding: 1rem 1.1rem; }
          .hn-im-level b { font-size: 3rem; }
        }
        @media (prefers-reduced-motion: reduce) { .hn-im-veil { animation-duration: .01s; } }
      `}</style>

      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [-8, 17, 92], fov: 38, near: 0.5, far: 900 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onPointerMissed={() => { /* keep current floor lit */ }}
      >
        <Suspense fallback={null}>
          <Scene
            sorted={sorted} lit={lit} setLit={setLit} phase={phase} focus={focus}
            onPick={onPick} onArrive={onArrive} planKey={planKey} reduce={reduce}
            planBuilding={planBuilding} selectedFloor={selectedFloor}
            selectedUnitId={selectedUnitId} hoveredUnitId={hoveredUnitId}
            onUnitClick={onUnitClick} onUnitHover={onUnitHover} bloom={bloom}
          />
        </Suspense>
      </Canvas>

      {veil > 0 && <div key={veil} className="hn-im-veil" aria-hidden />}

      {phase !== "plan" && (
        <div className="hn-im-head" style={{ opacity: flying ? 0 : 1, transition: "opacity .4s" }}>
          <h2>{t.choose}</h2>
          <p>{t.hint}</p>
        </div>
      )}

      {phase === "plan" && (
        <>
          {onBack && <button type="button" className="hn-im-back" onClick={onBack}>{isRtl ? "→ " : "← "}{t.back}</button>}
          <div className="hn-im-hint">{selectedUnitId ? t.plan : t.pick} · {t.drag}</div>
        </>
      )}

      {showPanel && panelBuilding && (
        <aside className="hn-im-panel" style={{ direction: isRtl ? "rtl" : "ltr" }} aria-live="polite">
          <div className="hn-im-eyebrow">{t.choose}</div>
          {sorted.length > 1 && (
            <div className="hn-im-tabs">
              {sorted.map((b) => (
                <button key={b.id} type="button" className="hn-im-tab" aria-pressed={b.id === panelBuilding.id}
                  onClick={() => {
                    const fl = floorsWithUnits(b);
                    const keep = lit && fl.includes(lit.floor) ? lit.floor : fl[Math.floor(fl.length / 2)];
                    if (keep !== undefined) { setHoverLit(null); setSliderLit({ buildingId: b.id, floor: keep }); }
                  }}>
                  {b.name}
                </button>
              ))}
            </div>
          )}
          {info && lit && !info.lobby ? (
            <>
              <div className="hn-im-level">
                {info.penthouse ? <b style={{ fontSize: "2.2rem" }}>{t.penthouse}</b> : (<><small>{t.level}</small><b>{lit.floor}</b></>)}
              </div>
              <div className="hn-im-meta">
                {info.available > 0 ? <span className="ok">{info.available} {t.available}</span> : <span>{t.none}</span>}
                {info.minPrice !== null && <div>{t.from}<Money amount={info.minPrice} /></div>}
              </div>
            </>
          ) : (
            <p style={{ fontSize: ".88rem", lineHeight: 1.55, opacity: .88 }}>{t.hint}</p>
          )}
          {panelFloors.length > 1 && (
            <>
              <input type="range" className="hn-im-slider" min={0} max={panelFloors.length - 1} step={1}
                value={Math.max(sliderIndex, 0)} aria-label={t.level}
                onChange={(e) => { setHoverLit(null); setSliderLit({ buildingId: panelBuilding.id, floor: panelFloors[Number(e.target.value)] }); }} />
              <div className="hn-im-range"><span>{panelFloors[0]}</span><span>{panelFloors[panelFloors.length - 1]}</span></div>
            </>
          )}
          <button type="button" className="hn-im-cta" disabled={!lit || !info || info.lobby}
            onClick={() => lit && startFly(lit.buildingId, lit.floor)}>
            {t.cta}
          </button>
        </aside>
      )}
    </div>
  );
}
