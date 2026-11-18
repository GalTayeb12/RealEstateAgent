"use client";

import { useRef, useEffect, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, useProgress } from "@react-three/drei";
import * as THREE from "three";
import ApartmentBuilder from "./ApartmentBuilder";
import TourControls from "./TourControls";
import RoomLabels from "./RoomLabels";
import type { ApartmentModelData, Room } from "@/lib/tour/types";

// ─── Walk look (drag + touch to look) ────────────────────────────────────────
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
  // multi-touch guard: ignore additional touch points
  const activePtrId = useRef<number | null>(null);

  useEffect(() => {
    if (mode !== "walk") return;
    const canvas = gl.domElement;

    const down = (e: PointerEvent) => {
      if (activePtrId.current !== null) return; // ignore second finger
      dragging.current = true;
      activePtrId.current = e.pointerId;
      lastX.current = e.clientX;
      lastY.current = e.clientY;
    };
    const move = (e: PointerEvent) => {
      if (!dragging.current || e.pointerId !== activePtrId.current) return;
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
    const up = (e: PointerEvent) => {
      if (e.pointerId === activePtrId.current) {
        dragging.current = false;
        activePtrId.current = null;
      }
    };

    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointerleave", up);
    canvas.addEventListener("pointercancel", up);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointerleave", up);
      canvas.removeEventListener("pointercancel", up);
    };
  }, [mode, camera, gl, yawRef, pitchRef]);

  return null;
}

// ─── Dwell tracker — accumulates in a ref, NOT calling setState per frame ────
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
  // Buffer dwell increments; flush via callback every 2 s to avoid 60 setState/s
  const bufRef = useRef<Record<string, number>>({});
  const flushTimerRef = useRef(0);

  useFrame((_, dt) => {
    let roomId: string | null = null;

    if (mode === "orbit") {
      roomId = focusRoomId;
    } else {
      const x = camera.position.x;
      const z = camera.position.z;
      for (const r of rooms) {
        if (x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2) {
          roomId = r.id;
          break;
        }
      }
    }

    if (roomId) {
      bufRef.current[roomId] = (bufRef.current[roomId] ?? 0) + dt;
    }

    flushTimerRef.current += dt;
    if (flushTimerRef.current >= 2) {
      flushTimerRef.current = 0;
      const snap = bufRef.current;
      bufRef.current = {};
      for (const [id, secs] of Object.entries(snap)) {
        onDwellUpdate(id, secs);
      }
    }
  });

  return null;
}

// ─── Loading overlay (inside Canvas via Html) ─────────────────────────────────
function SceneLoadingProgress() {
  const { progress, active } = useProgress();
  if (!active) return null;
  return (
    <Html center>
      <div
        style={{
          fontFamily: "var(--font-heebo), sans-serif",
          direction: "rtl",
          textAlign: "center",
          color: "#555",
          background: "rgba(255,255,255,0.92)",
          padding: "16px 24px",
          borderRadius: 10,
          boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
          minWidth: 180,
        }}
      >
        <div style={{ fontSize: 13, marginBottom: 8 }}>טוען סצנה… {Math.round(progress)}%</div>
        <div
          style={{
            height: 4,
            borderRadius: 2,
            background: "#e8e8e8",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              background: "var(--qp-accent, #c47a1a)",
              transition: "width 0.3s ease",
            }}
          />
        </div>
      </div>
    </Html>
  );
}

// ─── Scene content ────────────────────────────────────────────────────────────
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
  const yawRef = useRef(0);
  const pitchRef = useRef(0);

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
      {/* ApartmentBuilder is procedurally generated — no async loaders, no Suspense needed */}
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
      <WalkLookHandler mode={mode} yawRef={yawRef} pitchRef={pitchRef} />
    </>
  );
}

// ─── WebGL fallback ───────────────────────────────────────────────────────────
function WebGLFallback({ noWebGLLabel }: { noWebGLLabel: string }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(160deg, #e8eaec 0%, #d4d8dc 100%)",
        fontFamily: "var(--font-heebo), sans-serif",
        direction: "rtl",
        textAlign: "center",
        padding: "2rem",
        gap: 16,
      }}
    >
      {/* Simple apartment outline icon */}
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <rect x="8" y="20" width="48" height="36" rx="2" stroke="#999" strokeWidth="2" fill="#f0f0f0" />
        <rect x="24" y="38" width="16" height="18" fill="#ccc" />
        <rect x="10" y="26" width="10" height="10" rx="1" fill="#bbb" />
        <rect x="44" y="26" width="10" height="10" rx="1" fill="#bbb" />
        <path d="M4 22L32 6L60 22" stroke="#999" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <p style={{ fontSize: 14, color: "#666", margin: 0, maxWidth: 240, lineHeight: 1.5 }}>
        {noWebGLLabel}
      </p>
    </div>
  );
}

// ─── Exported Canvas wrapper ──────────────────────────────────────────────────
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

  // Detect touch / small viewport for performance tuning
  const isMobile = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 860px)").matches || "ontouchstart" in window;
  }, []);

  // Walk mode needs continuous rendering; orbit on mobile can render on demand
  const frameloop: "always" | "demand" =
    mode === "walk" ? "always" : isMobile ? "demand" : "always";

  // DPR: cap lower on mobile to protect GPU bandwidth
  const dpr: [number, number] = isMobile ? [1, 1.5] : [1, 2];

  if (!hasWebGL) {
    return <WebGLFallback noWebGLLabel={noWebGLLabel} />;
  }

  return (
    <Canvas
      frameloop={frameloop}
      dpr={dpr}
      camera={{
        position: [13, 8, 12],
        fov: 48,
        near: 0.1,
        far: 200,
      }}
      gl={{
        antialias: !isMobile,
        alpha: false,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.1,
      }}
      shadows
      style={{ width: "100%", height: "100%", touchAction: "none" }}
      onCreated={({ gl }) => {
        // R3F v9 internally sets PCFSoftShadowMap which Three.js r186 deprecated.
        // Override to PCFShadowMap explicitly to suppress the deprecation warning.
        gl.shadowMap.type = THREE.PCFShadowMap;
        // Match the tour-stage background (--qp-soft #EDEAE3) so the Canvas
        // top doesn't appear black before 3-D geometry fills it.
        gl.setClearColor(new THREE.Color('#EDEAE3'), 1);
      }}
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
