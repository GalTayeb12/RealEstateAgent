"use client";
/* eslint-disable react-hooks/refs, react-hooks/immutability --
   three.js lights and cameras are configured imperatively (r3f pattern). */

/**
 * The studio's 3D view: baked shell + live furniture layer + a sun that matches
 * the bake. Quality is adaptive: it starts at the best tier the device class
 * allows and only steps down when measured frame rate drops (and back up when
 * it recovers), unless the user pins a tier.
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrthographicCamera, PerformanceMonitor } from "@react-three/drei";
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import { Suspense, useEffect, useRef } from "react";
import { EYE, Walker, type Input } from "@/components/walk/ApartmentWalk";
import type { WalkConfig, WalkData } from "@/lib/experience/types";
import { resolveSize } from "@/lib/studio/catalog/sizing";
import { threeCamera } from "@/lib/studio/plan/view";
import { useStudio, type Tier } from "../store";
import { ItemLayer } from "./ItemLayer";
import { ShellLayer } from "./ShellLayer";
import { ArchTool } from "./ArchTool";
import { DesignProvider, SelectionBox } from "./DesignInteraction";
import { ProposalLayer } from "./ProposalLayer";
import { StillRender, StillWarmup } from "./StillRender";

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

/** Frames one catalog item on a plain backdrop for its thumbnail (front-right, slightly above). */
function ThumbCamera({ id }: { id: string }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const scene = useThree((s) => s.scene);
  const node = useStudio((s) => s.doc?.nodes[id]);
  const catalog = useStudio((s) => s.catalog);
  useFrame(() => {
    if (!node || node.kind !== "item" || !catalog) return;
    const m = catalog.model(node.catalog);
    if (!m) return;
    const { w, d, h } = resolveSize(m, node);
    const t = node.transform;
    const front = [-Math.sin(t.rot), Math.cos(t.rot)], right = [Math.cos(t.rot), Math.sin(t.rot)];
    const c = [t.x + (front[0] * d) / 2, t.y + (front[1] * d) / 2];
    const dist = Math.hypot(w, d, h) * 1.75 + 0.3;
    const p = [c[0] + front[0] * dist * 0.78 + right[0] * dist * 0.5, c[1] + front[1] * dist * 0.78 + right[1] * dist * 0.5];
    camera.fov = 32; camera.near = 0.05; camera.far = 80; camera.updateProjectionMatrix();
    const lift = t.z + m.placement.elevation;
    camera.position.set(p[0], lift + h * 0.55 + dist * 0.32, -p[1]);
    camera.lookAt(c[0], lift + h * 0.48, -c[1]);
    scene.background = new THREE.Color("#ece7df");
    scene.backgroundIntensity = 1;
  });
  return null;
}

/** Orthographic top / isometric camera driven by the store's plan view (the same numbers the SVG overlay uses). */
function PlanRig() {
  const ref = useRef<THREE.OrthographicCamera>(null);
  useFrame(() => {
    const cam = ref.current;
    const { plan, viewport } = useStudio.getState();
    if (!cam || !plan) return;
    const c = threeCamera(plan, viewport);
    cam.position.set(...c.position);
    cam.up.set(...c.upVector);
    cam.lookAt(c.target[0], c.target[1], c.target[2]);
    cam.left = c.left; cam.right = c.right; cam.top = c.top; cam.bottom = c.bottom; cam.near = c.near; cam.far = c.far;
    cam.updateProjectionMatrix();
  });
  return <OrthographicCamera ref={ref} makeDefault near={0.1} far={200} position={[7.5, 60, -3]} />;
}

/** The renderer's tone mapping is only read at creation, so keep it in step with whether the composer (which tone-maps itself) is active. */
function ToneMappingSync({ composer }: { composer: boolean }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => { gl.toneMapping = composer ? THREE.NoToneMapping : THREE.AgXToneMapping; }, [gl, composer]);
  return null;
}

/** `?debug` only: exposes the scene and renderer to the bench, census and regression scripts. */
function DebugHandle() {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const get = useThree((s) => s.get);
  useEffect(() => {
    if (!new URLSearchParams(location.search).has("debug")) return;
    (window as unknown as { __studioGL: unknown }).__studioGL = { scene, gl, camera: () => get().camera };
  }, [scene, gl, get]);
  return null;
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
  const thumb = useStudio((s) => s.thumb);
  const mode = useStudio((s) => s.mode);
  const planning = mode === "plan";
  const still = useStudio((s) => !!s.still && s.still.status !== "error");
  const composer = !mobile && tier === "high" && !planning && !still;
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
      <DebugHandle />
      <ToneMappingSync composer={composer} />
      <DesignProvider>
        <Suspense fallback={null}>
          <ShellLayer walk={walk} data={data} mobile={mobile} tier={tier} uvScales={uvScales} hidden={!!thumb} />
          <ItemLayer walk={walk} data={data} />
        </Suspense>
        <SelectionBox />
        <ProposalLayer />
        <ArchTool />
      </DesignProvider>
      <Sun tier={tier} />
      {still && <StillRender />}
      {!mobile && tier === "high" && !thumb && <StillWarmup />}
      {thumb ? <ThumbCamera id={thumb.id} /> : planning ? <PlanRig /> : <Walker walk={walk} data={data} input={input} reduce={reduce} onRoom={onRoom} onPose={onPose} />}
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
