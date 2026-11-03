"use client";

import { useRef, useEffect, useCallback, useMemo } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { Room } from "@/lib/tour/types";

// ─── Collision boxes for walls (simplified AABB set) ─────────────────────────
// Rooms define walkable areas; we just clamp to the full apartment + balcony
const WALK_MIN_X = -0.2;
const WALK_MAX_X = 12.2;
const WALK_MIN_Z = -2.4;
const WALK_MAX_Z = 9.2;

interface TourControlsProps {
  mode: "orbit" | "walk";
  focusRoom: Room | null;
  rooms: Room[];
  onRoomChange: (id: string) => void;
  wallGroupRef: React.RefObject<THREE.Group | null>;
  keysRef: React.RefObject<Set<string>>;
  walkTargetRef: React.RefObject<THREE.Vector3 | null>;
}

/** Find which room the position is in (AABB check). */
function findRoom(x: number, z: number, rooms: Room[]): Room | null {
  for (const r of rooms) {
    if (x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2) return r;
  }
  return null;
}

export default function TourControls({
  mode,
  focusRoom,
  rooms,
  onRoomChange,
  wallGroupRef,
  keysRef,
  walkTargetRef,
}: TourControlsProps) {
  const { camera } = useThree();
  const orbitRef = useRef<{ target: THREE.Vector3 } | null>(null);
  const currentRoomRef = useRef<string | null>(null);
  const yawRef = useRef(0);
  const pitchRef = useRef(0);

  // Wall scale target
  const wallScaleTarget = mode === "orbit" ? 0.42 : 1.0;

  // Orbit mode: lerp target to focused room
  const targetPos = useMemo(() => {
    if (!focusRoom) return new THREE.Vector3(6, 0, 3.5);
    return new THREE.Vector3(focusRoom.cx, 0, focusRoom.cz);
  }, [focusRoom]);

  const orbitDistance = useMemo(() => {
    if (!focusRoom) return 14;
    return Math.max(6.5, Math.max(focusRoom.w, focusRoom.d) * 1.7);
  }, [focusRoom]);

  // When switching to walk mode, position camera inside apartment
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
      const cur = wallGroupRef.current.scale.y;
      const factor = 1 - Math.exp(-dt * 6);
      wallGroupRef.current.scale.y = cur + (wallScaleTarget - cur) * factor;
    }

    if (mode === "orbit") {
      // Lerp orbit target
      if (orbitRef.current) {
        orbitRef.current.target.lerp(targetPos, 1 - Math.exp(-dt * 4));
      }
      return;
    }

    // Walk mode
    camera.position.y = 1.6;
    camera.rotation.order = "YXZ";

    const keys = keysRef.current;
    const speed = 1.7 * dt;
    const turnSpeed = 1.5 * dt;

    // Rotation
    if (keys.has("q") || keys.has("arrowleft")) yawRef.current += turnSpeed;
    if (keys.has("e") || keys.has("arrowright")) yawRef.current -= turnSpeed;

    camera.rotation.set(pitchRef.current, yawRef.current, 0);

    // Movement
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    right.y = 0;
    right.normalize();

    let dx = 0, dz = 0;

    if (keys.has("w") || keys.has("arrowup")) { dx += forward.x * speed; dz += forward.z * speed; }
    if (keys.has("s") || keys.has("arrowdown")) { dx -= forward.x * speed; dz -= forward.z * speed; }
    if (keys.has("a")) { dx -= right.x * speed; dz -= right.z * speed; }
    if (keys.has("d")) { dx += right.x * speed; dz += right.z * speed; }

    // Walk-to-target (click on floor)
    const target = walkTargetRef.current;
    if (target && dx === 0 && dz === 0) {
      const dir = new THREE.Vector3(target.x - camera.position.x, 0, target.z - camera.position.z);
      const dist = dir.length();
      if (dist > 0.3) {
        dir.normalize();
        dx = dir.x * speed;
        dz = dir.z * speed;
      } else {
        // Arrived, clear target
        (walkTargetRef as React.MutableRefObject<THREE.Vector3 | null>).current = null;
      }
    }

    // Clamp to bounds
    const nx = Math.max(WALK_MIN_X, Math.min(WALK_MAX_X, camera.position.x + dx));
    const nz = Math.max(WALK_MIN_Z, Math.min(WALK_MAX_Z, camera.position.z + dz));
    camera.position.x = nx;
    camera.position.z = nz;

    // Check room
    const room = findRoom(nx, nz, rooms);
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
