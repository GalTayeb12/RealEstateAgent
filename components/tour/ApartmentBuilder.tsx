"use client";

import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ApartmentModelData, Room, TourLayoutItem } from "@/lib/tour/types";
import { FurnitureItem } from "./FurnitureKit";

// ─── Constants ───────────────────────────────────────────────────────────────
const H      = 2.7;   // wall height
const EXT    = 0.25;  // exterior wall thickness
const INT    = 0.15;  // interior wall thickness
const MAM    = 0.30;  // mamad wall thickness
const WALL_C = 0xf3f2ee;   // interior wall color
const MAMAD_C = 0xdad9d3;  // mamad wall color

const GLASS_COLOR = "#b6cde2";
const GLASS_OPACITY = 0.3;

// ─── Texture generators ─────────────────────────────────────────────────────
function makeWoodTexture(): THREE.CanvasTexture {
  const cvs = document.createElement("canvas");
  cvs.width = 128; cvs.height = 128;
  const ctx = cvs.getContext("2d")!;
  ctx.fillStyle = "#c9a06c";
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 12; i++) {
    ctx.strokeStyle = `rgba(139,85,60,${0.15 + Math.random() * 0.15})`;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(0, Math.random() * 128);
    ctx.lineTo(128, Math.random() * 128);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(cvs);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function makeTileTexture(): THREE.CanvasTexture {
  const cvs = document.createElement("canvas");
  cvs.width = 128; cvs.height = 128;
  const ctx = cvs.getContext("2d")!;
  ctx.fillStyle = "#e8e4dc";
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = "#d0ccc4";
  ctx.lineWidth = 1;
  for (let x = 0; x <= 128; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 128); ctx.stroke(); }
  for (let y = 0; y <= 128; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(128, y); ctx.stroke(); }
  const t = new THREE.CanvasTexture(cvs);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function makeDeckTexture(): THREE.CanvasTexture {
  const cvs = document.createElement("canvas");
  cvs.width = 128; cvs.height = 128;
  const ctx = cvs.getContext("2d")!;
  ctx.fillStyle = "#a08060";
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 6; i++) {
    ctx.strokeStyle = `rgba(80,50,30,${0.2 + Math.random() * 0.2})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, i * 22 + 4);
    ctx.lineTo(128, i * 22 + 4);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(cvs);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function makeConcreteTexture(): THREE.CanvasTexture {
  const cvs = document.createElement("canvas");
  cvs.width = 64; cvs.height = 64;
  const ctx = cvs.getContext("2d")!;
  ctx.fillStyle = "#b0b0ae";
  ctx.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 200; i++) {
    const g = 140 + Math.random() * 40;
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.fillRect(Math.random() * 64, Math.random() * 64, 2, 2);
  }
  const t = new THREE.CanvasTexture(cvs);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ─── Opening types ───────────────────────────────────────────────────────────
interface DoorOpening {
  kind: "door";
  from: number;
  to: number;
  top: number;
}
interface WindowOpening {
  kind: "window";
  from: number;
  to: number;
  bottom: number;
  top: number;
}
type Opening = DoorOpening | WindowOpening;

function door(from: number, to: number, top = 2.1): DoorOpening {
  return { kind: "door", from, to, top };
}
function win(from: number, to: number, bottom = 0.9, top = 2.2): WindowOpening {
  return { kind: "window", from, to, bottom, top };
}

interface WallSeg { pos: [number, number, number]; size: [number, number, number]; color: number }
interface GlassPane { pos: [number, number, number]; size: [number, number, number] }

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

  // Track ranges along the wall that have no openings (full height)
  // For each opening, we produce wall segments above/below/around it
  let cursor = from;

  for (const op of ops) {
    // Wall segment before this opening
    if (op.from > cursor) {
      const mid = (cursor + op.from) / 2;
      const len = op.from - cursor;
      if (axis === "x") {
        walls.push({ pos: [mid, H / 2, at], size: [len, H, thickness], color });
      } else {
        walls.push({ pos: [at, H / 2, mid], size: [thickness, H, len], color });
      }
    }

    if (op.kind === "door") {
      // Wall above door
      if (op.top < H) {
        const mid = (op.from + op.to) / 2;
        const len = op.to - op.from;
        const segH = H - op.top;
        if (axis === "x") {
          walls.push({ pos: [mid, op.top + segH / 2, at], size: [len, segH, thickness], color });
        } else {
          walls.push({ pos: [at, op.top + segH / 2, mid], size: [thickness, segH, len], color });
        }
      }
    } else {
      // Window: wall below, above, and glass in between
      const mid = (op.from + op.to) / 2;
      const len = op.to - op.from;
      // Below sill
      if (op.bottom > 0) {
        if (axis === "x") {
          walls.push({ pos: [mid, op.bottom / 2, at], size: [len, op.bottom, thickness], color });
        } else {
          walls.push({ pos: [at, op.bottom / 2, mid], size: [thickness, op.bottom, len], color });
        }
      }
      // Above lintel
      if (op.top < H) {
        const segH = H - op.top;
        if (axis === "x") {
          walls.push({ pos: [mid, op.top + segH / 2, at], size: [len, segH, thickness], color });
        } else {
          walls.push({ pos: [at, op.top + segH / 2, mid], size: [thickness, segH, len], color });
        }
      }
      // Glass
      const gh = op.top - op.bottom;
      if (axis === "x") {
        glass.push({ pos: [mid, op.bottom + gh / 2, at], size: [len, gh, 0.02] });
      } else {
        glass.push({ pos: [at, op.bottom + gh / 2, mid], size: [0.02, gh, len] });
      }
    }

    cursor = op.to;
  }

  // Remaining wall after last opening
  if (cursor < to) {
    const mid = (cursor + to) / 2;
    const len = to - cursor;
    if (axis === "x") {
      walls.push({ pos: [mid, H / 2, at], size: [len, H, thickness], color });
    } else {
      walls.push({ pos: [at, H / 2, mid], size: [thickness, H, len], color });
    }
  }

  return { walls, glass };
}

// ─── Railing builder ─────────────────────────────────────────────────────────
interface RailingSeg { pos: [number, number, number]; size: [number, number, number] }

function buildRailing(
  axis: "x" | "z",
  at: number,
  from: number,
  to: number,
): { glass: GlassPane[]; bar: RailingSeg } {
  const mid = (from + to) / 2;
  const len = to - from;
  const glassH = 1.05;
  let glass: GlassPane;
  let bar: RailingSeg;
  if (axis === "x") {
    glass = { pos: [mid, glassH / 2, at], size: [len, glassH, 0.02] };
    bar = { pos: [mid, glassH + 0.02, at], size: [len, 0.04, 0.04] };
  } else {
    glass = { pos: [at, glassH / 2, mid], size: [0.02, glassH, len] };
    bar = { pos: [at, glassH + 0.02, mid], size: [0.04, 0.04, len] };
  }
  return { glass: [glass], bar };
}

// ─── Floors component ────────────────────────────────────────────────────────
function Floors({ rooms }: { rooms: Room[] }) {
  const textures = useMemo(() => {
    if (typeof document === "undefined") return null;
    return {
      wood: makeWoodTexture(),
      tile: makeTileTexture(),
      deck: makeDeckTexture(),
      concrete: makeConcreteTexture(),
    };
  }, []);

  if (!textures) return null;

  return (
    <group>
      {rooms.map((room) => {
        const tex = textures[room.floor];
        const t = tex.clone();
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(room.w / 2, room.d / 2);
        return (
          <mesh
            key={room.id}
            position={[room.cx, 0.002, room.cz]}
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
          >
            <planeGeometry args={[room.w, room.d]} />
            <meshStandardMaterial map={t} roughness={0.85} />
          </mesh>
        );
      })}
    </group>
  );
}

// ─── Wall definitions ────────────────────────────────────────────────────────
function useWallData() {
  return useMemo(() => {
    const allWalls: WallSeg[] = [];
    const allGlass: GlassPane[] = [];

    // Helper to accumulate
    function addWall(axis: "x" | "z", at: number, from: number, to: number, thickness: number, openings: Opening[] | null, color?: number) {
      const { walls, glass } = buildWallSegments(axis, at, from, to, thickness, openings, color);
      allWalls.push(...walls);
      allGlass.push(...glass);
    }

    // Exterior
    addWall("x", 0, 0, 12, EXT, [door(1.2, 5.8, 2.3), win(8.5, 10.5)]);
    addWall("x", 9, 0, 12, EXT, [win(1, 3), win(5, 6.4), win(8, 8.8, 1.1, 2.0), win(10.5, 11.2, 1.5, 2.1)]);
    addWall("z", 0, 0, 9, EXT, [win(1.5, 3.5), win(6, 7.5)]);
    addWall("z", 12, 0, 9, EXT, [win(1.5, 3), door(4.65, 5.55, 2.15)]);

    // Interior
    addWall("x", 4.5, 0, 4, INT, [door(0.6, 3.4, 2.4)]);
    addWall("x", 4.5, 7, 12, INT, [door(8, 8.9)]);
    addWall("z", 7, 0, 4.5, INT, null);
    addWall("z", 4, 4.5, 9, INT, null);
    addWall("x", 5.7, 4, 7.2, INT, [door(5, 5.9)]);
    addWall("x", 5.7, 7.2, 9.6, MAM, [door(7.95, 8.75, 2.0)], MAMAD_C);
    addWall("x", 5.7, 9.6, 12, INT, [door(10, 10.8)]);
    addWall("z", 7.2, 5.7, 9, MAM, null, MAMAD_C);
    addWall("z", 9.6, 5.7, 9, MAM, null, MAMAD_C);

    // Railings
    const railings: { glass: GlassPane[]; bars: RailingSeg[] } = { glass: [], bars: [] };
    {
      const r1 = buildRailing("x", -2.2, 0, 7);
      railings.glass.push(...r1.glass);
      railings.bars.push(r1.bar);
    }
    {
      const r2 = buildRailing("z", 0, -2.2, 0);
      railings.glass.push(...r2.glass);
      railings.bars.push(r2.bar);
    }
    {
      const r3 = buildRailing("z", 7, -2.2, 0);
      railings.glass.push(...r3.glass);
      railings.bars.push(r3.bar);
    }

    return { allWalls, allGlass, railings };
  }, []);
}

// ─── Fixed kitchen / bath elements ───────────────────────────────────────────
function FixedFurniture() {
  return (
    <group>
      {/* Kitchen island */}
      <mesh position={[2.0, 0.45, 6.75]} castShadow receiveShadow>
        <boxGeometry args={[1.6, 0.9, 0.7]} />
        <meshStandardMaterial color={0xe8e6e1} roughness={0.6} />
      </mesh>
      {/* Kitchen counter (along walls) */}
      <mesh position={[0.3, 0.45, 5.5]} castShadow receiveShadow>
        <boxGeometry args={[0.6, 0.9, 2.0]} />
        <meshStandardMaterial color={0xe8e6e1} roughness={0.6} />
      </mesh>
      <mesh position={[0.3, 0.45, 8.2]} castShadow receiveShadow>
        <boxGeometry args={[0.6, 0.9, 1.5]} />
        <meshStandardMaterial color={0xe8e6e1} roughness={0.6} />
      </mesh>
      {/* counter top */}
      <mesh position={[0.3, 0.91, 6.75]} castShadow receiveShadow>
        <boxGeometry args={[0.65, 0.04, 4.3]} />
        <meshStandardMaterial color="#d8d5ce" roughness={0.4} />
      </mesh>

      {/* Bathroom - bathtub */}
      <mesh position={[11.3, 0.25, 7.35]} castShadow receiveShadow>
        <boxGeometry args={[1.2, 0.5, 1.6]} />
        <meshStandardMaterial color={0xf5f4f0} roughness={0.3} />
      </mesh>
      {/* Toilet */}
      <mesh position={[10.2, 0.2, 8.4]} castShadow receiveShadow>
        <boxGeometry args={[0.4, 0.4, 0.55]} />
        <meshStandardMaterial color={0xf5f4f0} roughness={0.3} />
      </mesh>
      {/* Sink cabinet */}
      <mesh position={[10.2, 0.36, 6.3]} castShadow receiveShadow>
        <boxGeometry args={[0.8, 0.72, 0.45]} />
        <meshStandardMaterial color={0xe8e6e1} roughness={0.6} />
      </mesh>
    </group>
  );
}

// ─── Profile furniture layer ─────────────────────────────────────────────────
function ProfileFurniture({ items, profileId }: { items: TourLayoutItem[]; profileId: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const animatingRef = useRef(false);
  const tRef = useRef(0);
  const reducedMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    animatingRef.current = true;
    tRef.current = 0;
    if (groupRef.current) {
      groupRef.current.scale.y = 0.001;
    }
  }, [profileId, reducedMotion]);

  useFrame((_, dt) => {
    if (!animatingRef.current || !groupRef.current) return;
    tRef.current += dt * 4;
    const t = Math.min(1, tRef.current);
    groupRef.current.scale.y = t;
    if (t >= 1) animatingRef.current = false;
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

// ─── Main component ──────────────────────────────────────────────────────────
export interface ApartmentBuilderProps {
  model: ApartmentModelData;
  profileId: string;
  focusRoomId: string | null;
  mode: "orbit" | "walk";
  wallGroupRef: React.RefObject<THREE.Group | null>;
}

export default function ApartmentBuilder({ model, profileId, wallGroupRef }: ApartmentBuilderProps) {
  const { allWalls, allGlass, railings } = useWallData();

  const layoutItems = useMemo(() => {
    return model.layouts[profileId] ?? [];
  }, [model.layouts, profileId]);

  return (
    <group>
      {/* Floors */}
      <Floors rooms={model.rooms} />

      {/* Ground slab */}
      <mesh position={[6, -0.125, 3.35]} receiveShadow>
        <boxGeometry args={[12.6, 0.25, 11.7]} />
        <meshStandardMaterial color={0xc6ccd3} roughness={0.75} />
      </mesh>

      {/* Ground plane */}
      <mesh position={[0, -0.26, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color={0xdde2e6} roughness={0.9} />
      </mesh>

      {/* Walls group (animated scale.y) */}
      <group ref={wallGroupRef}>
        {allWalls.map((seg, i) => (
          <mesh key={`w${i}`} position={seg.pos} castShadow receiveShadow>
            <boxGeometry args={seg.size} />
            <meshStandardMaterial color={seg.color} roughness={0.75} />
          </mesh>
        ))}

        {/* Window glass */}
        {allGlass.map((g, i) => (
          <mesh key={`g${i}`} position={g.pos}>
            <boxGeometry args={g.size} />
            <meshStandardMaterial color={GLASS_COLOR} transparent opacity={GLASS_OPACITY} roughness={0.1} />
          </mesh>
        ))}

        {/* Railing glass */}
        {railings.glass.map((g, i) => (
          <mesh key={`rg${i}`} position={g.pos}>
            <boxGeometry args={g.size} />
            <meshStandardMaterial color={GLASS_COLOR} transparent opacity={0.4} roughness={0.1} />
          </mesh>
        ))}

        {/* Railing bars */}
        {railings.bars.map((b, i) => (
          <mesh key={`rb${i}`} position={b.pos} castShadow>
            <boxGeometry args={b.size} />
            <meshStandardMaterial color={0x666666} roughness={0.4} metalness={0.5} />
          </mesh>
        ))}
      </group>

      {/* Fixed kitchen/bath */}
      <FixedFurniture />

      {/* Profile furniture */}
      <ProfileFurniture items={layoutItems} profileId={profileId} />

      {/* Lighting */}
      <hemisphereLight args={[0xffffff, 0x98a2ad, 0.78]} />
      <directionalLight
        position={[-7, 18, -9]}
        intensity={0.72}
        color={0xffffff}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-11}
        shadow-camera-right={11}
        shadow-camera-top={11}
        shadow-camera-bottom={-11}
        shadow-camera-near={1}
        shadow-camera-far={50}
      />
      <directionalLight position={[16, 10, 14]} intensity={0.22} color={0xfff4e6} />
    </group>
  );
}
