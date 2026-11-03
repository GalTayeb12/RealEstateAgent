"use client";

import { useRef, useEffect, useMemo } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { Room } from "@/lib/tour/types";

// ─── Outer apartment bounds (includes balcony) ────────────────────────────────
const WALK_MIN_X = -0.2;
const WALK_MAX_X = 12.2;
const WALK_MIN_Z = -2.4;
const WALK_MAX_Z = 9.2;

// ─── Interior wall collision boxes [x_min, x_max, z_min, z_max] ─────────────
// Derived from ApartmentBuilder wall definitions (axis, at, from, to, thickness)
// Each box covers the solid segments of a wall (door openings are gaps).
const WALL_BOXES: [number, number, number, number][] = [
  // z=4.5 wall (INT 0.15), x=0→4  —  solid: x=0→0.6, x=3.4→4.0
  [0,    0.6,  4.425, 4.575],
  [3.4,  4.0,  4.425, 4.575],
  // z=4.5 wall (INT 0.15), x=7→12  —  solid: x=7→8, x=8.9→12
  [7.0,  8.0,  4.425, 4.575],
  [8.9, 12.0,  4.425, 4.575],
  // x=7 wall (INT 0.15), z=0→4.5  (no openings)
  [6.925, 7.075, 0,   4.5],
  // x=4 wall (INT 0.15), z=4.5→9  (no openings)
  [3.925, 4.075, 4.5, 9.0],
  // z=5.7 wall (INT 0.15), x=4→7.2  —  solid: x=4→5, x=5.9→7.2
  [4.0,  5.0,  5.625, 5.775],
  [5.9,  7.2,  5.625, 5.775],
  // z=5.7 wall (MAM 0.30), x=7.2→9.6  —  solid: x=7.2→7.95, x=8.75→9.6
  [7.2,  7.95, 5.55,  5.85],
  [8.75, 9.6,  5.55,  5.85],
  // z=5.7 wall (INT 0.15), x=9.6→12  —  solid: x=9.6→10, x=10.8→12
  [9.6,  10.0, 5.625, 5.775],
  [10.8, 12.0, 5.625, 5.775],
  // x=7.2 wall (MAM 0.30), z=5.7→9  (no openings)
  [7.05, 7.35, 5.7,  9.0],
  // x=9.6 wall (MAM 0.30), z=5.7→9  (no openings)
  [9.45, 9.75, 5.7,  9.0],
];

const PLAYER_RADIUS = 0.3;

/** Returns true if a player cylinder (xz centre, radius PLAYER_RADIUS) overlaps a wall box. */
function hitsWall(x: number, z: number): boolean {
  const r = PLAYER_RADIUS;
  for (const [x1, x2, z1, z2] of WALL_BOXES) {
    if (x + r > x1 && x - r < x2 && z + r > z1 && z - r < z2) return true;
  }
  return false;
}

/** Find which room the position is in (AABB check). */
function findRoom(x: number, z: number, rooms: Room[]): Room | null {
  for (const r of rooms) {
    if (x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2) return r;
  }
  return null;
}

/** Nearest room centre — used for out-of-bounds recovery. */
function nearestRoom(x: number, z: number, rooms: Room[]): Room {
  let best = rooms[0];
  let bestDist = Infinity;
  for (const r of rooms) {
    const d = (x - r.cx) ** 2 + (z - r.cz) ** 2;
    if (d < bestDist) { bestDist = d; best = r; }
  }
  return best;
}

interface TourControlsProps {
  mode: "orbit" | "walk";
  focusRoom: Room | null;
  rooms: Room[];
  onRoomChange: (id: string) => void;
  wallGroupRef: React.RefObject<THREE.Group | null>;
  keysRef: React.RefObject<Set<string>>;
  /** Shared with WalkLookHandler so mouse-drag look and key look use the same angles */
  yawRef: React.MutableRefObject<number>;
  pitchRef: React.MutableRefObject<number>;
}

export default function TourControls({
  mode,
  focusRoom,
  rooms,
  onRoomChange,
  wallGroupRef,
  keysRef,
  yawRef,
  pitchRef,
}: TourControlsProps) {
  const { camera } = useThree();
  const orbitRef = useRef<{ target: THREE.Vector3 } | null>(null);
  const currentRoomRef = useRef<string | null>(null);
  const fittedRef = useRef(false);

  const reducedMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const wallScaleTarget = mode === "orbit" ? 0.42 : 1.0;

  const targetPos = useMemo(() => {
    if (!focusRoom) return new THREE.Vector3(6, 0, 3.5);
    return new THREE.Vector3(focusRoom.cx, 0, focusRoom.cz);
  }, [focusRoom]);

  const orbitDistance = useMemo(() => {
    if (!focusRoom) return 14;
    return Math.max(6.5, Math.max(focusRoom.w, focusRoom.d) * 1.7);
  }, [focusRoom]);

  // Fit camera to full apartment on orbit entry
  useEffect(() => {
    if (mode === "orbit") {
      if (!fittedRef.current) fittedRef.current = true;
      camera.position.set(6, 18, 22);
      camera.lookAt(6, 0.5, 3.4);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Position camera at eye level when entering walk mode
  useEffect(() => {
    if (mode === "walk") {
      const startRoom = focusRoom ?? rooms.find((r) => r.id === "living") ?? rooms[0];
      if (startRoom) {
        camera.position.set(startRoom.cx, 1.6, startRoom.cz);
        camera.rotation.order = "YXZ";
        yawRef.current = 0;
        pitchRef.current = 0;
        camera.rotation.set(0, 0, 0);
        currentRoomRef.current = startRoom.id;
        onRoomChange(startRoom.id);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useFrame((_, dt) => {
    // Animate wall scale
    if (wallGroupRef.current) {
      if (reducedMotion) {
        wallGroupRef.current.scale.y = wallScaleTarget;
      } else {
        const cur = wallGroupRef.current.scale.y;
        wallGroupRef.current.scale.y = cur + (wallScaleTarget - cur) * (1 - Math.exp(-dt * 6));
      }
    }

    if (mode === "orbit") {
      if (orbitRef.current) {
        const factor = reducedMotion ? 1.0 : 1 - Math.exp(-dt * 4);
        orbitRef.current.target.lerp(targetPos, factor);
      }
      return;
    }

    // ── Walk mode ─────────────────────────────────────────────────────────────
    camera.position.y = 1.6;
    camera.rotation.order = "YXZ";

    const keys = keysRef.current;
    const speed = 1.7 * dt;
    const turnSpeed = 1.5 * dt;

    // ← / A = turn left (yaw +),  → / D = turn right (yaw -)
    if (keys.has("a") || keys.has("arrowleft"))  yawRef.current += turnSpeed;
    if (keys.has("d") || keys.has("arrowright")) yawRef.current -= turnSpeed;

    camera.rotation.set(pitchRef.current, yawRef.current, 0);

    // Forward vector (project onto XZ plane)
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;
    forward.normalize();

    let dx = 0, dz = 0;
    if (keys.has("w") || keys.has("arrowup"))   { dx += forward.x * speed; dz += forward.z * speed; }
    if (keys.has("s") || keys.has("arrowdown"))  { dx -= forward.x * speed; dz -= forward.z * speed; }

    // ── Collision resolution with wall sliding ────────────────────────────────
    if (dx !== 0 || dz !== 0) {
      const nx = Math.max(WALK_MIN_X, Math.min(WALK_MAX_X, camera.position.x + dx));
      const nz = Math.max(WALK_MIN_Z, Math.min(WALK_MAX_Z, camera.position.z + dz));

      if (!hitsWall(nx, nz)) {
        // Full move — no collision
        camera.position.x = nx;
        camera.position.z = nz;
      } else if (!hitsWall(nx, camera.position.z)) {
        // Slide along X only
        camera.position.x = nx;
      } else if (!hitsWall(camera.position.x, nz)) {
        // Slide along Z only
        camera.position.z = nz;
      }
      // else: completely blocked — don't move
    }

    // ── Out-of-bounds recovery ────────────────────────────────────────────────
    if (
      camera.position.x < WALK_MIN_X || camera.position.x > WALK_MAX_X ||
      camera.position.z < WALK_MIN_Z || camera.position.z > WALK_MAX_Z
    ) {
      const r = nearestRoom(camera.position.x, camera.position.z, rooms);
      camera.position.x = r.cx;
      camera.position.z = r.cz;
    }

    // ── Room change detection ─────────────────────────────────────────────────
    const room = findRoom(camera.position.x, camera.position.z, rooms);
    if (room && room.id !== currentRoomRef.current) {
      currentRoomRef.current = room.id;
      onRoomChange(room.id);
    }
  });

  if (mode === "orbit") {
    return (
      <OrbitControls
        ref={orbitRef as React.Ref<never>}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={Math.PI / 2.1}
        minPolarAngle={0.2}
        minDistance={3}
        maxDistance={orbitDistance * 2.5}
        target={targetPos}
      />
    );
  }

  return null;
}
