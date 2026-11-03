"use client";

import { useEffect } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Room, Profile } from "@/lib/tour/types";

export interface RoomLabelsProps {
  rooms: Room[];
  profileId: string;
  profiles: Profile[];
  focusRoomId: string | null;
  mode: "orbit" | "walk";
  onFocusRoom: (id: string) => void;
  sqmLabel: string;
  monthlyRentLabel: string;
  /** Ref map from room id → the overlay DOM element (set by the overlay component) */
  labelElemsRef: React.RefObject<Record<string, HTMLElement | null>>;
}

const _v = new THREE.Vector3();

export default function RoomLabels({
  rooms,
  mode,
  labelElemsRef,
}: RoomLabelsProps) {
  const { camera, size } = useThree();

  useFrame(() => {
    if (mode === "walk") return;
    const elems = labelElemsRef.current;
    if (!elems) return;

    rooms.forEach((r) => {
      const el = elems[r.id];
      if (!el) return;

      _v.set(r.cx, 1.3, r.cz).project(camera);

      // z > 1 means behind camera
      if (_v.z > 1) {
        el.style.opacity = "0";
        el.style.pointerEvents = "none";
        return;
      }

      const x = ((_v.x + 1) / 2) * size.width;
      const y = ((1 - _v.y) / 2) * size.height;

      el.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
      el.style.opacity = "1";
      el.style.pointerEvents = "auto";
    });
  });

  // Hide all when switching to walk
  useEffect(() => {
    if (mode !== "walk") return;
    const elems = labelElemsRef.current;
    if (!elems) return;
    Object.values(elems).forEach((el) => {
      if (el) { el.style.opacity = "0"; el.style.pointerEvents = "none"; }
    });
  }, [mode, labelElemsRef]);

  return null;
}
