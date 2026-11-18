"use client";

import { useRef, useEffect, useMemo, useCallback } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { Room } from "@/lib/tour/types";

// ─── Outer apartment bounds ────────────────────────────────────────────────────
const WALK_MIN_X = -0.2;
const WALK_MAX_X = 12.2;
const WALK_MIN_Z = -2.4;
const WALK_MAX_Z = 9.2;

// ─── Interior wall collision boxes [x_min, x_max, z_min, z_max] ──────────────
const WALL_BOXES: [number, number, number, number][] = [
  [0,    0.6,  4.425, 4.575],
  [3.4,  4.0,  4.425, 4.575],
  [7.0,  8.0,  4.425, 4.575],
  [8.9, 12.0,  4.425, 4.575],
  [6.925, 7.075, 0,   4.5],
  [3.925, 4.075, 4.5, 9.0],
  [4.0,  5.0,  5.625, 5.775],
  [5.9,  7.2,  5.625, 5.775],
  [7.2,  7.95, 5.55,  5.85],
  [8.75, 9.6,  5.55,  5.85],
  [9.6,  10.0, 5.625, 5.775],
  [10.8, 12.0, 5.625, 5.775],
  [7.05, 7.35, 5.7,  9.0],
  [9.45, 9.75, 5.7,  9.0],
];

const PLAYER_RADIUS = 0.3;

function hitsWall(x: number, z: number): boolean {
  const r = PLAYER_RADIUS;
  for (const [x1, x2, z1, z2] of WALL_BOXES) {
    if (x + r > x1 && x - r < x2 && z + r > z1 && z - r < z2) return true;
  }
  return false;
}

function findRoom(x: number, z: number, rooms: Room[]): Room | null {
  for (const r of rooms) {
    if (x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2) return r;
  }
  return null;
}

function nearestRoom(x: number, z: number, rooms: Room[]): Room {
  let best = rooms[0];
  let bestDist = Infinity;
  for (const r of rooms) {
    const d = (x - r.cx) ** 2 + (z - r.cz) ** 2;
    if (d < bestDist) { bestDist = d; best = r; }
  }
  return best;
}

/** easeInOutQuad — feels natural for camera travel */
function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

// ─── Camera transition state ──────────────────────────────────────────────────
interface CamTransition {
  from: THREE.Vector3;
  to: THREE.Vector3;
  elapsed: number;
  duration: number; // seconds; 0 = instant (prefers-reduced-motion)
}

interface TourControlsProps {
  mode: "orbit" | "walk";
  focusRoom: Room | null;
  rooms: Room[];
  onRoomChange: (id: string) => void;
  wallGroupRef: React.RefObject<THREE.Group | null>;
  keysRef: React.RefObject<Set<string>>;
  yawRef: React.MutableRefObject<number>;
  pitchRef: React.MutableRefObject<number>;
}

// Typed ref for the underlying Three.js OrbitControls instance
type OrbitControlsInstance = {
  target: THREE.Vector3;
  enabled: boolean;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
};

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
  const { camera, invalidate } = useThree();
  const orbitRef = useRef<OrbitControlsInstance | null>(null);
  const currentRoomRef = useRef<string | null>(null);
  const fittedRef = useRef(false);

  // Camera fly-to transition
  const transitionRef = useRef<CamTransition | null>(null);

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

  // Cancel transition when user starts orbiting manually
  const cancelTransition = useCallback(() => {
    transitionRef.current = null;
  }, []);

  // Wire up OrbitControls "start" event to cancel in-flight transition
  useEffect(() => {
    const controls = orbitRef.current;
    if (!controls) return;
    controls.addEventListener("start", cancelTransition);
    return () => controls.removeEventListener("start", cancelTransition);
  });

  // Fit camera to full apartment on orbit entry
  useEffect(() => {
    if (mode === "orbit") {
      if (!fittedRef.current) fittedRef.current = true;
      // Three-quarter view: front-right diagonal, apartment fills the frame
      camera.position.set(13, 8, 12);
      camera.lookAt(5.5, 0.5, 4);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Eye-level position when entering walk mode
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

  // Start a timed camera fly-to whenever the target changes (orbit mode only)
  useEffect(() => {
    if (mode !== "orbit" || !orbitRef.current) return;
    const from = orbitRef.current.target.clone();
    const dist = from.distanceTo(targetPos);
    if (dist < 0.05) return; // already at target

    const duration = reducedMotion ? 0 : Math.min(0.3 + dist * 0.11, 1.4);
    transitionRef.current = { from, to: targetPos.clone(), elapsed: 0, duration };
    // In frameloop="demand" mode (mobile orbit), kick off the animation loop
    invalidate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetPos]);

  useFrame((_, dt) => {
    // ── Wall scale animation ───────────────────────────────────────────────────
    if (wallGroupRef.current) {
      if (reducedMotion) {
        wallGroupRef.current.scale.y = wallScaleTarget;
      } else {
        const cur = wallGroupRef.current.scale.y;
        const delta = wallScaleTarget - cur;
        if (Math.abs(delta) > 0.001) {
          wallGroupRef.current.scale.y = cur + delta * (1 - Math.exp(-dt * 6));
          invalidate(); // keep animating until converged (demand mode)
        }
      }
    }

    if (mode === "orbit") {
      // ── Timed camera transition ──────────────────────────────────────────────
      if (transitionRef.current && orbitRef.current) {
        const tr = transitionRef.current;
        tr.elapsed += dt;
        const rawT = tr.duration === 0 ? 1 : Math.min(tr.elapsed / tr.duration, 1);
        const t = easeInOut(rawT);
        orbitRef.current.target.lerpVectors(tr.from, tr.to, t);
        if (rawT >= 1) {
          transitionRef.current = null;
        } else {
          invalidate(); // request next frame until transition done (demand mode)
        }
      }
      return;
    }

    // ── Walk mode ──────────────────────────────────────────────────────────────
    camera.position.y = 1.6;
    camera.rotation.order = "YXZ";

    const keys = keysRef.current;
    const speed = 1.7 * dt;
    const turnSpeed = 1.5 * dt;

    if (keys.has("a") || keys.has("arrowleft"))  yawRef.current += turnSpeed;
    if (keys.has("d") || keys.has("arrowright")) yawRef.current -= turnSpeed;

    camera.rotation.set(pitchRef.current, yawRef.current, 0);

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;
    forward.normalize();

    let dx = 0, dz = 0;
    if (keys.has("w") || keys.has("arrowup"))  { dx += forward.x * speed; dz += forward.z * speed; }
    if (keys.has("s") || keys.has("arrowdown")) { dx -= forward.x * speed; dz -= forward.z * speed; }

    if (dx !== 0 || dz !== 0) {
      const nx = Math.max(WALK_MIN_X, Math.min(WALK_MAX_X, camera.position.x + dx));
      const nz = Math.max(WALK_MIN_Z, Math.min(WALK_MAX_Z, camera.position.z + dz));

      if (!hitsWall(nx, nz)) {
        camera.position.x = nx;
        camera.position.z = nz;
      } else if (!hitsWall(nx, camera.position.z)) {
        camera.position.x = nx;
      } else if (!hitsWall(camera.position.x, nz)) {
        camera.position.z = nz;
      }
    }

    // Out-of-bounds recovery
    if (
      camera.position.x < WALK_MIN_X || camera.position.x > WALK_MAX_X ||
      camera.position.z < WALK_MIN_Z || camera.position.z > WALK_MAX_Z
    ) {
      const r = nearestRoom(camera.position.x, camera.position.z, rooms);
      camera.position.x = r.cx;
      camera.position.z = r.cz;
    }

    // Room change detection
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
