"use client";

import { useRef, useMemo, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment, ContactShadows } from "@react-three/drei";
import { EffectComposer, N8AO } from "@react-three/postprocessing";
import * as THREE from "three";
import type { ApartmentModelData, Room, TourLayoutItem } from "@/lib/tour/types";
import { FurnitureItem } from "./FurnitureKit";

// ─── Constants ────────────────────────────────────────────────────────────────
const H      = 2.7;    // wall height
const EXT    = 0.25;   // exterior wall thickness
const INT    = 0.15;   // interior wall thickness
const MAM    = 0.30;   // mamad wall thickness
const WALL_C  = 0xf0ead8;   // interior wall color — warm linen
const WALL_CAP_C = 0x2a2826; // charcoal cap on top of walls — plan readability
const MAMAD_C = 0xdad9d3;  // mamad wall color

const GLASS_COLOR   = "#b6cde2";
const GLASS_OPACITY = 0.28;

// ─── Shared materials (created once, never recreated) ─────────────────────────
let _glassMat: THREE.MeshPhysicalMaterial | null = null;
function getGlassMat() {
  if (!_glassMat) {
    _glassMat = new THREE.MeshPhysicalMaterial({
      color: GLASS_COLOR,
      transparent: true,
      opacity: GLASS_OPACITY,
      roughness: 0.05,
      metalness: 0.0,
      transmission: 0.6,
      thickness: 0.01,
      envMapIntensity: 0.8,
      side: THREE.DoubleSide,
    });
  }
  return _glassMat;
}

let _railingGlassMat: THREE.MeshPhysicalMaterial | null = null;
function getRailingGlassMat() {
  if (!_railingGlassMat) {
    _railingGlassMat = new THREE.MeshPhysicalMaterial({
      color: GLASS_COLOR,
      transparent: true,
      opacity: 0.38,
      roughness: 0.08,
      metalness: 0.0,
      transmission: 0.4,
      envMapIntensity: 0.9,
      side: THREE.DoubleSide,
    });
  }
  return _railingGlassMat;
}

// ─── Texture generators ───────────────────────────────────────────────────────
function makeWoodTexture(): THREE.CanvasTexture {
  const cvs = document.createElement("canvas");
  cvs.width = 256; cvs.height = 256;
  const ctx = cvs.getContext("2d")!;
  // Base warm oak color
  ctx.fillStyle = "#c09060";
  ctx.fillRect(0, 0, 256, 256);
  // Grain lines
  for (let i = 0; i < 20; i++) {
    const y = Math.random() * 256;
    ctx.strokeStyle = `rgba(120,70,35,${0.08 + Math.random() * 0.12})`;
    ctx.lineWidth = 1 + Math.random() * 1.5;
    ctx.beginPath();
    ctx.moveTo(0, y); ctx.lineTo(256, y + (Math.random() - 0.5) * 10);
    ctx.stroke();
  }
  // Slight knot variations
  for (let i = 0; i < 4; i++) {
    const grd = ctx.createRadialGradient(
      Math.random() * 256, Math.random() * 256, 2,
      Math.random() * 256, Math.random() * 256, 20,
    );
    grd.addColorStop(0, "rgba(100,55,25,0.18)");
    grd.addColorStop(1, "rgba(100,55,25,0)");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 256, 256);
  }
  const t = new THREE.CanvasTexture(cvs);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function makeTileTexture(): THREE.CanvasTexture {
  const cvs = document.createElement("canvas");
  cvs.width = 256; cvs.height = 256;
  const ctx = cvs.getContext("2d")!;
  // Warm off-white tile body
  ctx.fillStyle = "#ebe8e0";
  ctx.fillRect(0, 0, 256, 256);
  // Subtle grout lines
  ctx.strokeStyle = "#d0ccc4";
  ctx.lineWidth = 1.5;
  for (let x = 0; x <= 256; x += 64) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke();
  }
  for (let y = 0; y <= 256; y += 64) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke();
  }
  // Slight tile face variation
  for (let tx = 0; tx < 4; tx++) {
    for (let ty = 0; ty < 4; ty++) {
      const lum = 0.97 + Math.random() * 0.06;
      ctx.fillStyle = `rgba(255,255,255,${lum - 1 > 0 ? 0 : Math.abs(lum - 1) + 0.02})`;
      ctx.fillRect(tx * 64 + 2, ty * 64 + 2, 60, 60);
    }
  }
  const t = new THREE.CanvasTexture(cvs);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function makeDeckTexture(): THREE.CanvasTexture {
  const cvs = document.createElement("canvas");
  cvs.width = 256; cvs.height = 256;
  const ctx = cvs.getContext("2d")!;
  ctx.fillStyle = "#9a7050";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8; i++) {
    ctx.strokeStyle = `rgba(60,35,15,${0.15 + Math.random() * 0.18})`;
    ctx.lineWidth = 2.5;
    const y = i * 32 + 6;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke();
  }
  const t = new THREE.CanvasTexture(cvs);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function makeConcreteTexture(): THREE.CanvasTexture {
  const cvs = document.createElement("canvas");
  cvs.width = 128; cvs.height = 128;
  const ctx = cvs.getContext("2d")!;
  ctx.fillStyle = "#b2b2b0";
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 300; i++) {
    const g = 138 + Math.random() * 36;
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  const t = new THREE.CanvasTexture(cvs);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ─── Opening types ────────────────────────────────────────────────────────────
interface DoorOpening  { kind: "door";   from: number; to: number; top: number }
interface WindowOpening{ kind: "window"; from: number; to: number; bottom: number; top: number }
type Opening = DoorOpening | WindowOpening;

function door(from: number, to: number, top = 2.1): DoorOpening {
  return { kind: "door", from, to, top };
}
function win(from: number, to: number, bottom = 0.9, top = 2.2): WindowOpening {
  return { kind: "window", from, to, bottom, top };
}

interface WallSeg  { pos: [number, number, number]; size: [number, number, number]; color: number }
interface WallCap  { pos: [number, number, number]; size: [number, number, number] }
interface GlassPane{ pos: [number, number, number]; size: [number, number, number]; railing?: boolean }
interface RailingSeg{ pos: [number, number, number]; size: [number, number, number] }

function buildWallSegments(
  axis: "x" | "z",
  at: number,
  from: number,
  to: number,
  thickness: number,
  openings: Opening[] | null,
  color: number = WALL_C,
): { walls: WallSeg[]; glass: GlassPane[] } {
  const walls: WallSeg[] = [];
  const glass: GlassPane[] = [];
  const ops = (openings ?? []).sort((a, b) => a.from - b.from);

  let cursor = from;

  for (const op of ops) {
    if (op.from > cursor) {
      const mid = (cursor + op.from) / 2;
      const len = op.from - cursor;
      walls.push(
        axis === "x"
          ? { pos: [mid, H / 2, at], size: [len, H, thickness], color }
          : { pos: [at, H / 2, mid], size: [thickness, H, len], color },
      );
    }

    if (op.kind === "door") {
      if (op.top < H) {
        const mid = (op.from + op.to) / 2;
        const len = op.to - op.from;
        const segH = H - op.top;
        walls.push(
          axis === "x"
            ? { pos: [mid, op.top + segH / 2, at], size: [len, segH, thickness], color }
            : { pos: [at, op.top + segH / 2, mid], size: [thickness, segH, len], color },
        );
      }
    } else {
      const mid = (op.from + op.to) / 2;
      const len = op.to - op.from;
      if (op.bottom > 0) {
        walls.push(
          axis === "x"
            ? { pos: [mid, op.bottom / 2, at], size: [len, op.bottom, thickness], color }
            : { pos: [at, op.bottom / 2, mid], size: [thickness, op.bottom, len], color },
        );
      }
      if (op.top < H) {
        const segH = H - op.top;
        walls.push(
          axis === "x"
            ? { pos: [mid, op.top + segH / 2, at], size: [len, segH, thickness], color }
            : { pos: [at, op.top + segH / 2, mid], size: [thickness, segH, len], color },
        );
      }
      const gh = op.top - op.bottom;
      glass.push(
        axis === "x"
          ? { pos: [mid, op.bottom + gh / 2, at], size: [len, gh, 0.02] }
          : { pos: [at, op.bottom + gh / 2, mid], size: [0.02, gh, len] },
      );
    }

    cursor = op.to;
  }

  if (cursor < to) {
    const mid = (cursor + to) / 2;
    const len = to - cursor;
    walls.push(
      axis === "x"
        ? { pos: [mid, H / 2, at], size: [len, H, thickness], color }
        : { pos: [at, H / 2, mid], size: [thickness, H, len], color },
    );
  }

  return { walls, glass };
}

// ─── Railing builder ──────────────────────────────────────────────────────────
function buildRailing(axis: "x" | "z", at: number, from: number, to: number): {
  glass: GlassPane; bar: RailingSeg;
} {
  const mid = (from + to) / 2;
  const len = to - from;
  const glassH = 1.05;
  return axis === "x"
    ? {
        glass: { pos: [mid, glassH / 2, at], size: [len, glassH, 0.02], railing: true },
        bar:   { pos: [mid, glassH + 0.02, at], size: [len, 0.04, 0.04] },
      }
    : {
        glass: { pos: [at, glassH / 2, mid], size: [0.02, glassH, len], railing: true },
        bar:   { pos: [at, glassH + 0.02, mid], size: [0.04, 0.04, len] },
      };
}

// ─── Floor component ──────────────────────────────────────────────────────────
function Floors({ rooms }: { rooms: Room[] }) {
  const textures = useMemo(() => {
    if (typeof document === "undefined") return null;
    return {
      wood:     makeWoodTexture(),
      tile:     makeTileTexture(),
      deck:     makeDeckTexture(),
      concrete: makeConcreteTexture(),
    };
  }, []);

  if (!textures) return null;

  return (
    <group>
      {rooms.map((room) => {
        const tex = textures[room.floor]?.clone();
        if (!tex) return null;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(room.w / 1.8, room.d / 1.8);
        tex.needsUpdate = true;
        return (
          <mesh key={room.id} position={[room.cx, 0.002, room.cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[room.w, room.d]} />
            <meshStandardMaterial map={tex} roughness={0.72} metalness={0.02} envMapIntensity={0.4} />
          </mesh>
        );
      })}
    </group>
  );
}

// ─── Wall definitions ─────────────────────────────────────────────────────────
const CAP_H = 0.07; // dark charcoal cap height on top of walls

function useWallData() {
  return useMemo(() => {
    const allWalls: WallSeg[] = [];
    const allGlass: GlassPane[] = [];

    function addWall(
      axis: "x" | "z", at: number, from: number, to: number,
      thickness: number, openings: Opening[] | null, color?: number,
    ) {
      const { walls, glass } = buildWallSegments(axis, at, from, to, thickness, openings, color);
      allWalls.push(...walls);
      allGlass.push(...glass);
    }

    // Exterior
    addWall("x",  0, 0, 12, EXT, [door(1.2, 5.8, 2.3), win(8.5, 10.5)]);
    addWall("x",  9, 0, 12, EXT, [win(1, 3), win(5, 6.4), win(8, 8.8, 1.1, 2.0), win(10.5, 11.2, 1.5, 2.1)]);
    addWall("z",  0, 0,  9, EXT, [win(1.5, 3.5), win(6, 7.5)]);
    addWall("z", 12, 0,  9, EXT, [win(1.5, 3), door(4.65, 5.55, 2.15)]);

    // Interior
    addWall("x", 4.5,  0,  4, INT, [door(0.6, 3.4, 2.4)]);
    addWall("x", 4.5,  7, 12, INT, [door(8, 8.9)]);
    addWall("z",    7,  0, 4.5, INT, null);
    addWall("z",    4, 4.5,  9, INT, null);
    addWall("x", 5.7,  4, 7.2, INT, [door(5, 5.9)]);
    addWall("x", 5.7, 7.2, 9.6, MAM, [door(7.95, 8.75, 2.0)], MAMAD_C);
    addWall("x", 5.7, 9.6, 12,  INT, [door(10, 10.8)]);
    addWall("z", 7.2, 5.7,  9,  MAM, null, MAMAD_C);
    addWall("z", 9.6, 5.7,  9,  MAM, null, MAMAD_C);

    // Wall caps — thin dark strip at top of every wall for plan readability
    const allCaps: WallCap[] = allWalls.map((seg) => {
      const topY = seg.pos[1] + seg.size[1] / 2;
      return {
        pos: [seg.pos[0], topY + CAP_H / 2, seg.pos[2]],
        size: [seg.size[0], CAP_H, seg.size[2]],
      };
    });

    // Railings
    const railings: { glass: GlassPane[]; bars: RailingSeg[] } = { glass: [], bars: [] };
    const railingDefs: Array<["x" | "z", number, number, number]> = [
      ["x", -2.2, 0, 7],
      ["z",  0, -2.2, 0],
      ["z",  7, -2.2, 0],
    ];
    for (const [axis, at, from, to] of railingDefs) {
      const r = buildRailing(axis, at, from, to);
      railings.glass.push(r.glass);
      railings.bars.push(r.bar);
    }

    return { allWalls, allCaps, allGlass, railings };
  }, []);
}

// ─── Fixed kitchen / bath ─────────────────────────────────────────────────────
function FixedFurniture() {
  return (
    <group>
      {/* Kitchen island */}
      <mesh position={[2.0, 0.45, 6.75]} castShadow receiveShadow>
        <boxGeometry args={[1.6, 0.9, 0.7]} />
        <meshStandardMaterial color={0xe8e6e1} roughness={0.55} metalness={0.02} />
      </mesh>
      {/* Kitchen counter sides */}
      <mesh position={[0.3, 0.45, 5.5]} castShadow receiveShadow>
        <boxGeometry args={[0.6, 0.9, 2.0]} />
        <meshStandardMaterial color={0xe8e6e1} roughness={0.55} metalness={0.02} />
      </mesh>
      <mesh position={[0.3, 0.45, 8.2]} castShadow receiveShadow>
        <boxGeometry args={[0.6, 0.9, 1.5]} />
        <meshStandardMaterial color={0xe8e6e1} roughness={0.55} metalness={0.02} />
      </mesh>
      {/* Counter top — slightly reflective stone */}
      <mesh position={[0.3, 0.91, 6.75]} castShadow receiveShadow>
        <boxGeometry args={[0.65, 0.04, 4.3]} />
        <meshStandardMaterial color="#d6d3cb" roughness={0.3} metalness={0.05} />
      </mesh>
      {/* Bathroom - bathtub */}
      <mesh position={[11.3, 0.25, 7.35]} castShadow receiveShadow>
        <boxGeometry args={[1.2, 0.5, 1.6]} />
        <meshStandardMaterial color={0xf5f4f0} roughness={0.25} metalness={0.02} />
      </mesh>
      {/* Toilet */}
      <mesh position={[10.2, 0.2, 8.4]} castShadow receiveShadow>
        <boxGeometry args={[0.4, 0.4, 0.55]} />
        <meshStandardMaterial color={0xf5f4f0} roughness={0.25} />
      </mesh>
      {/* Sink cabinet */}
      <mesh position={[10.2, 0.36, 6.3]} castShadow receiveShadow>
        <boxGeometry args={[0.8, 0.72, 0.45]} />
        <meshStandardMaterial color={0xe8e6e1} roughness={0.5} metalness={0.02} />
      </mesh>
    </group>
  );
}

// ─── Profile furniture layer ──────────────────────────────────────────────────
function ProfileFurniture({ items, profileId }: { items: TourLayoutItem[]; profileId: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const animatingRef = useRef(false);
  const tRef = useRef(0);
  const { invalidate } = useThree();
  const reducedMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    animatingRef.current = true;
    tRef.current = 0;
    if (groupRef.current) groupRef.current.scale.y = 0.001;
    invalidate(); // kick off first frame in demand mode
  }, [profileId, reducedMotion, invalidate]);

  useFrame((_, dt) => {
    if (!animatingRef.current || !groupRef.current) return;
    tRef.current += dt * 4;
    const t = Math.min(1, tRef.current);
    const eased = 1 - (1 - t) * (1 - t);
    groupRef.current.scale.y = eased;
    if (t >= 1) {
      animatingRef.current = false;
    } else {
      invalidate(); // keep frames coming until animation completes (demand mode)
    }
  });

  return (
    <group ref={groupRef} key={profileId}>
      {items.map((item, i) => (
        <group key={`${profileId}-${i}`} position={[item.x, 0, item.z]} rotation={[0, item.rotY, 0]}>
          <FurnitureItem type={item.type} params={item.params} />
        </group>
      ))}
    </group>
  );
}

// ─── Lighting ─────────────────────────────────────────────────────────────────
function SceneLighting({ isMobile }: { isMobile: boolean }) {
  return (
    <>
      {/* IBL environment — local HDR (no CDN dependency) */}
      <Environment files="/hdr/potsdamer_platz_1k.hdr" background={false} environmentIntensity={0.45} />

      {/* Warm sky hemisphere */}
      <hemisphereLight args={[0xfff8f0, 0x9aadb8, 0.55]} />

      {/* Primary sun — golden afternoon from upper-left */}
      <directionalLight
        position={[-8, 20, -6]}
        intensity={isMobile ? 0.9 : 1.1}
        color={0xfffbf0}
        castShadow
        shadow-mapSize={isMobile ? [1024, 1024] : [2048, 2048]}
        shadow-camera-left={-13}
        shadow-camera-right={13}
        shadow-camera-top={13}
        shadow-camera-bottom={-13}
        shadow-camera-near={1}
        shadow-camera-far={55}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
      />

      {/* Soft fill from opposite side — reduces harsh contrast */}
      <directionalLight position={[14, 8, 12]} intensity={0.28} color={0xf0f4ff} />

      {/* Subtle warm bounce from floor */}
      <pointLight position={[6, 0.5, 4]} intensity={0.12} color={0xffeecc} distance={18} decay={2} />
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export interface ApartmentBuilderProps {
  model: ApartmentModelData;
  profileId: string;
  focusRoomId: string | null;
  mode: "orbit" | "walk";
  wallGroupRef: React.RefObject<THREE.Group | null>;
}

// Detect mobile once per module (safe to do at module level since only called client-side)
function getIsMobile() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width:860px)").matches || "ontouchstart" in window;
}

export default function ApartmentBuilder({ model, profileId, wallGroupRef, mode }: ApartmentBuilderProps) {
  const { allWalls, allCaps, allGlass, railings } = useWallData();
  const isMobile = useMemo(getIsMobile, []);

  const layoutItems = useMemo(() => {
    return model.layouts[profileId] ?? [];
  }, [model.layouts, profileId]);

  // Reuse a single glass material instance
  const glassMat = useMemo(() => getGlassMat(), []);
  const railingGlassMat = useMemo(() => getRailingGlassMat(), []);

  return (
    <group>
      {/* Floors */}
      <Floors rooms={model.rooms} />

      {/* Ceiling — walk mode only, prevents sky showing through */}
      {mode === "walk" && (
        <mesh position={[5, H, 3.4]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[12.5, 11.5]} />
          <meshStandardMaterial color={0xf4f3ef} roughness={0.9} side={THREE.BackSide} />
        </mesh>
      )}

      {/* Floating shadow — soft blob below the whole apartment on the warm background */}
      <ContactShadows
        position={[5.5, -0.55, 3.4]}
        scale={[22, 17]}
        far={4}
        blur={5.5}
        opacity={0.22}
        resolution={256}
        frames={1}
        color="#1a1a18"
      />

      {/* In-room AO shadow (desktop only) — furniture and wall contact shadows */}
      {!isMobile && (
        <ContactShadows
          position={[5.5, 0.003, 3.4]}
          scale={[18, 14]}
          far={4}
          blur={2.0}
          opacity={0.28}
          resolution={512}
          frames={1}
        />
      )}

      {/* Walls group (animated scale.y) */}
      <group ref={wallGroupRef}>
        {allWalls.map((seg, i) => (
          <mesh key={`w${i}`} position={seg.pos} castShadow receiveShadow>
            <boxGeometry args={seg.size} />
            <meshStandardMaterial
              color={seg.color}
              roughness={0.82}
              metalness={0.0}
              envMapIntensity={0.3}
            />
          </mesh>
        ))}

        {/* Wall caps — dark charcoal strip at top for plan readability */}
        {allCaps.map((cap, i) => (
          <mesh key={`wc${i}`} position={cap.pos} castShadow>
            <boxGeometry args={cap.size} />
            <meshStandardMaterial color={WALL_CAP_C} roughness={0.65} metalness={0.05} />
          </mesh>
        ))}

        {/* Window glass — physical material for subtle transmission */}
        {allGlass.map((g, i) => (
          <mesh key={`g${i}`} position={g.pos}>
            <boxGeometry args={g.size} />
            <primitive object={glassMat} attach="material" />
          </mesh>
        ))}

        {/* Railing glass */}
        {railings.glass.map((g, i) => (
          <mesh key={`rg${i}`} position={g.pos}>
            <boxGeometry args={g.size} />
            <primitive object={railingGlassMat} attach="material" />
          </mesh>
        ))}

        {/* Railing bars */}
        {railings.bars.map((b, i) => (
          <mesh key={`rb${i}`} position={b.pos} castShadow>
            <boxGeometry args={b.size} />
            <meshStandardMaterial color={0x6a6a68} roughness={0.3} metalness={0.6} />
          </mesh>
        ))}
      </group>

      {/* Fixed kitchen/bath */}
      <FixedFurniture />

      {/* Profile furniture */}
      <ProfileFurniture items={layoutItems} profileId={profileId} />

      {/* Lighting */}
      <SceneLighting isMobile={isMobile} />

      {/* Real AO: N8AO post-processing (desktop only — GPU-intensive) */}
      {!isMobile && (
        <EffectComposer multisampling={0}>
          <N8AO aoRadius={1.4} intensity={1.6} quality="medium" />
        </EffectComposer>
      )}

    </group>
  );
}
