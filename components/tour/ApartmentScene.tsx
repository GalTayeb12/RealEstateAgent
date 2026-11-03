"use client";

import { useRef, useCallback, useEffect, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import ApartmentBuilder from "./ApartmentBuilder";
import TourControls from "./TourControls";
import RoomLabels from "./RoomLabels";
import type { ApartmentModelData, Room } from "@/lib/tour/types";

// ─── Floor click raycaster (inside Canvas) ──────────────────────────────────
function FloorClickHandler({
  walkTargetRef,
  mode,
}: {
  walkTargetRef: React.MutableRefObject<THREE.Vector3 | null>;
  mode: "orbit" | "walk";
}) {
  const { camera, gl } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const plane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));

  useEffect(() => {
    if (mode !== "walk") return;
    const canvas = gl.domElement;
    const handler = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.current.setFromCamera(mouse, camera);
      const intersection = new THREE.Vector3();
      raycaster.current.ray.intersectPlane(plane.current, intersection);
      if (intersection) {
        walkTargetRef.current = intersection.clone();
      }
    };
    canvas.addEventListener("pointerdown", handler);
    return () => canvas.removeEventListener("pointerdown", handler);
  }, [mode, camera, gl, walkTargetRef]);

  return null;
}

// ─── Walk look (drag to look) ───────────────────────────────────────────────
function WalkLookHandler({
  mode,
  yawRef,
  pitchRef,
}: {
  mode: "orbit" | "walk";
  yawRef: React.MutableRefObject<number>;
  pitchRef: React.MutableRefObject<number>;
}) {
  const { camera, gl } = useThree();
  const dragging = useRef(false);
  const lastX = useRef(0);
  const lastY = useRef(0);

  useEffect(() => {
    if (mode !== "walk") return;
    const canvas = gl.domElement;

    const down = (e: PointerEvent) => {
      dragging.current = true;
      lastX.current = e.clientX;
      lastY.current = e.clientY;
    };
    const move = (e: PointerEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - lastX.current;
      const dy = e.clientY - lastY.current;
      lastX.current = e.clientX;
      lastY.current = e.clientY;
      yawRef.current -= dx * 0.003;
      pitchRef.current -= dy * 0.003;
      pitchRef.current = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, pitchRef.current));
      camera.rotation.order = "YXZ";
      camera.rotation.set(pitchRef.current, yawRef.current, 0);
    };
    const up = () => { dragging.current = false; };

    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointerleave", up);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointerleave", up);
    };
  }, [mode, camera, gl, yawRef, pitchRef]);

  return null;
}

// ─── Dwell tracker (inside Canvas for useFrame) ─────────────────────────────
function DwellTracker({
  mode,
  focusRoomId,
  rooms,
  onDwellUpdate,
}: {
  mode: "orbit" | "walk";
  focusRoomId: string | null;
  rooms: Room[];
  onDwellUpdate: (roomId: string, dtSeconds: number) => void;
}) {
  const { camera } = useThree();

  useFrame((_, dt) => {
    if (mode === "orbit") {
      if (focusRoomId) {
        onDwellUpdate(focusRoomId, dt);
      }
    } else {
      // Walk mode: check which room the camera is in
      const x = camera.position.x;
      const z = camera.position.z;
      for (const r of rooms) {
        if (x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2) {
          onDwellUpdate(r.id, dt);
          break;
        }
      }
    }
  });

  return null;
}

// ─── Scene content ──────────────────────────────────────────────────────────
function SceneContent({
  model,
  profileId,
  mode,
  focusRoomId,
  onRoomChange,
  onDwellUpdate,
  sqmLabel,
  monthlyRentLabel,
  labelElemsRef,
}: {
  model: ApartmentModelData;
  profileId: string;
  mode: "orbit" | "walk";
  focusRoomId: string | null;
  onRoomChange: (id: string) => void;
  onDwellUpdate: (roomId: string, dtSeconds: number) => void;
  sqmLabel: string;
  monthlyRentLabel: string;
  labelElemsRef: React.RefObject<Record<string, HTMLElement | null>>;
}) {
  const wallGroupRef = useRef<THREE.Group>(null);
  const keysRef = useRef(new Set<string>());
  const walkTargetRef = useRef<THREE.Vector3 | null>(null);
  // Shared yaw/pitch refs — both WalkLookHandler and TourControls read/write
  // the same angles so mouse-drag look and keyboard turn stay in sync.
  const yawRef = useRef(0);
  const pitchRef = useRef(0);

  // Keyboard events
  useEffect(() => {
    const down = (e: KeyboardEvent) => keysRef.current.add(e.key.toLowerCase());
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const focusRoom = model.rooms.find((r) => r.id === focusRoomId) ?? null;

  return (
    <>
      <ApartmentBuilder
        model={model}
        profileId={profileId}
        focusRoomId={focusRoomId}
        mode={mode}
        wallGroupRef={wallGroupRef}
      />
      <TourControls
        mode={mode}
        focusRoom={focusRoom}
        rooms={model.rooms}
        onRoomChange={onRoomChange}
        wallGroupRef={wallGroupRef}
        keysRef={keysRef}
        walkTargetRef={walkTargetRef}
        yawRef={yawRef}
        pitchRef={pitchRef}
      />
      <RoomLabels
        rooms={model.rooms}
        profileId={profileId}
        profiles={model.profiles}
        focusRoomId={focusRoomId}
        mode={mode}
        onFocusRoom={onRoomChange}
        sqmLabel={sqmLabel}
        monthlyRentLabel={monthlyRentLabel}
        labelElemsRef={labelElemsRef}
      />
      <DwellTracker
        mode={mode}
        focusRoomId={focusRoomId}
        rooms={model.rooms}
        onDwellUpdate={onDwellUpdate}
      />
      <FloorClickHandler walkTargetRef={walkTargetRef} mode={mode} />
      <WalkLookHandler mode={mode} yawRef={yawRef} pitchRef={pitchRef} />
    </>
  );
}

// ─── Exported Canvas wrapper ────────────────────────────────────────────────
export interface ApartmentSceneProps {
  model: ApartmentModelData;
  profileId: string;
  mode: "orbit" | "walk";
  focusRoomId: string | null;
  onRoomChange: (id: string) => void;
  onDwellUpdate: (roomId: string, dtSeconds: number) => void;
  sqmLabel: string;
  monthlyRentLabel: string;
  noWebGLLabel: string;
  labelElemsRef: React.RefObject<Record<string, HTMLElement | null>>;
}

export default function ApartmentScene({
  model,
  profileId,
  mode,
  focusRoomId,
  onRoomChange,
  onDwellUpdate,
  sqmLabel,
  monthlyRentLabel,
  noWebGLLabel,
  labelElemsRef,
}: ApartmentSceneProps) {
  const hasWebGL = useMemo(() => {
    if (typeof window === "undefined") return true;
    try {
      const canvas = document.createElement("canvas");
      return !!(
        window.WebGLRenderingContext &&
        (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
      );
    } catch {
      return false;
    }
  }, []);

  if (!hasWebGL) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#e4e7ea",
          fontFamily: "var(--font-heebo), sans-serif",
          fontSize: 14,
          color: "#555",
          textAlign: "center",
          padding: "2rem",
          direction: "rtl",
        }}
      >
        {noWebGLLabel}
      </div>
    );
  }

  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{
        position: [6, 12, 16],
        fov: 50,
        near: 0.1,
        far: 200,
      }}
      gl={{
        antialias: true,
        alpha: false,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.0,
      }}
      shadows
      style={{ width: "100%", height: "100%", touchAction: "none" }}
    >
      <SceneContent
        model={model}
        profileId={profileId}
        mode={mode}
        focusRoomId={focusRoomId}
        onRoomChange={onRoomChange}
        onDwellUpdate={onDwellUpdate}
        sqmLabel={sqmLabel}
        monthlyRentLabel={monthlyRentLabel}
        labelElemsRef={labelElemsRef}
      />
    </Canvas>
  );
}
