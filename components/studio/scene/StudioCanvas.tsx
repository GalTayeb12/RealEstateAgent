"use client";
/* eslint-disable react-hooks/refs --
   three.js lights and cameras are configured imperatively (r3f pattern). */

/**
 * The studio's 3D view: baked shell + live furniture layer + a sun that matches
 * the bake. Quality is adaptive: it starts at the best tier the device class
 * allows and only steps down when measured frame rate drops (and back up when
 * it recovers), unless the user pins a tier.
 */
import { Canvas } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import { Suspense, useEffect, useRef } from "react";
import { EYE, Walker, type Input } from "@/components/walk/ApartmentWalk";
import type { WalkConfig, WalkData } from "@/lib/experience/types";
import { useStudio, type Tier } from "../store";
import { ItemLayer } from "./ItemLayer";
import { ShellLayer } from "./ShellLayer";

/**
 * The bake's sun (twin_build.py: Euler XYZ 55°, 0, -35°) travels along
 * (0.470, 0.671, -0.574) in plan axes; in world axes (x, z, -y) that is:
 */
export const SUN_DIR = new THREE.Vector3(0.47, -0.574, -0.671).normalize();
const CENTER = new THREE.Vector3(7.5, 0, -3.15);
const TIERS: Tier[] = ["low", "medium", "high"];

const SHADOW_SIZE: Record<Tier, number> = { low: 0, medium: 1024, high: 2048 };

function Sun({ tier }: { tier: Tier }) {
  const sun = useStudio((s) => s.lighting.sun);
  const light = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    const l = light.current;
    if (!l) return;
    l.target.position.copy(CENTER);
    l.target.updateMatrixWorld();
    const s = l.shadow;
    s.camera.left = -13; s.camera.right = 13; s.camera.top = 13; s.camera.bottom = -13;
    s.camera.near = 1; s.camera.far = 70;
    s.camera.updateProjectionMatrix();
    s.bias = -0.0004; s.normalBias = 0.02; s.radius = 3;
  }, [tier]);
  const size = SHADOW_SIZE[tier];
  const pos = CENTER.clone().addScaledVector(SUN_DIR, -30);
  return (
    <>
      <directionalLight
        ref={light} position={pos.toArray()} intensity={sun} color="#fff1dc"
        castShadow={size > 0} shadow-mapSize={[size || 1, size || 1]}
      />
      {light.current && <primitive object={light.current.target} />}
    </>
  );
}

function Tiering() {
  const quality = useStudio((s) => s.quality);
  const tier = useStudio((s) => s.tier);
  const setTier = useStudio((s) => s.setTier);
  return (
    <PerformanceMonitor
      flipflops={3}
      onDecline={() => { if (quality === "auto") setTier(TIERS[Math.max(0, TIERS.indexOf(tier) - 1)]); }}
      onIncline={() => { if (quality === "auto") setTier(TIERS[Math.min(2, TIERS.indexOf(tier) + 1)]); }}
    />
  );
}

export function StudioCanvas({ walk, data, uvScales, input, reduce, mobile, label, onRoom, onPose }: {
  walk: WalkConfig; data: WalkData; uvScales: Record<string, number>; input: React.RefObject<Input>;
  reduce: boolean; mobile: boolean; label: string; onRoom: (r: string) => void; onPose: (x: number, y: number, yaw: number) => void;
}) {
  const tier = useStudio((s) => s.tier);
  const ao = useStudio((s) => s.lighting.ao);
  const composer = !mobile && tier === "high";
  const dpr: [number, number] = tier === "low" ? [1, 1] : tier === "medium" ? [1, 1.5] : [1, 2];
  return (
    <Canvas
      shadows
      dpr={dpr}
      gl={{ antialias: !composer, powerPreference: "high-performance", toneMapping: composer ? THREE.NoToneMapping : THREE.AgXToneMapping }}
      camera={{ fov: 70, near: 0.05, far: 200, position: [data.spawn[0], EYE, -data.spawn[1]] }}
      role="img"
      aria-label={label}
    >
      <Tiering />
      <Suspense fallback={null}>
        <ShellLayer walk={walk} data={data} mobile={mobile} tier={tier} uvScales={uvScales} />
        <ItemLayer walk={walk} data={data} />
      </Suspense>
      <Sun tier={tier} />
      <Walker walk={walk} data={data} input={input} reduce={reduce} onRoom={onRoom} onPose={onPose} />
      {/* two separately keyed composers: N8AO cannot share a multisampled composer, and
          removing an effect from a live composer leaves its depth buffers in a broken state */}
      {composer && ao && (
        <EffectComposer key="ao" multisampling={0}>
          <N8AO aoRadius={0.7} distanceFalloff={1} intensity={1.8} quality="medium" />
          <Bloom mipmapBlur intensity={0.28} luminanceThreshold={1.6} luminanceSmoothing={0.4} radius={0.7} />
          <ToneMapping mode={ToneMappingMode.AGX} />
          <Vignette offset={0.32} darkness={0.42} />
          <SMAA />
        </EffectComposer>
      )}
      {composer && !ao && (
        <EffectComposer key="plain" multisampling={4}>
          <Bloom mipmapBlur intensity={0.28} luminanceThreshold={1.6} luminanceSmoothing={0.4} radius={0.7} />
          <ToneMapping mode={ToneMappingMode.AGX} />
          <Vignette offset={0.32} darkness={0.42} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
