"use client";
/**
 * Furniture and decor from the design document, rendered live on top of the
 * baked shell. Lit by the sun (with shadow) and the room's reflection probe,
 * grounded by a soft contact-shadow decal. Plan (x, y, z) maps to world
 * (x, z, -y); the item's front is plan +y, i.e. world -z.
 */
import { useGLTF } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo } from "react";
import * as THREE from "three";
import { EXPOSURE } from "@/components/walk/ApartmentWalk";
import { modelAssetUrl } from "@/lib/studio/catalog/assets";
import { generate, type GeneratorId } from "@/lib/studio/catalog/generators";
import { resolveSize } from "@/lib/studio/catalog/sizing";
import { roomAt, type WalkConfig, type WalkData } from "@/lib/experience/types";
import { applyCube, itemEnvIntensity, parseItemLight, roomCube, srgbToLinear, type Cube, type ItemLight } from "@/lib/studio/lighting";
import type { ModelManifest } from "@/lib/studio/schema/catalog";
import type { ItemNode } from "@/lib/studio/schema/nodes";
import { useStudio } from "../store";
import { useDesign } from "./DesignInteraction";
import { buildGenerated } from "./generated";
import { applyMaterial } from "./materials";


/**
 * The probe image as a linear float equirect with the room's directional gain cube multiplied in.
 * Float, so a gain above 1 does not clip; rows are flipped because a DataTexture's first row is the
 * BOTTOM of the image (v = 0), while `applyCube` walks rows from the top like the image itself.
 */
function correctedProbe(img: HTMLImageElement, cube: Cube) {
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, W, H).data;
  const rgba = new Float32Array(W * H * 4);
  for (let i = 0, n = W * H; i < n; i++) {
    rgba[i * 4] = srgbToLinear(px[i * 4]);
    rgba[i * 4 + 1] = srgbToLinear(px[i * 4 + 1]);
    rgba[i * 4 + 2] = srgbToLinear(px[i * 4 + 2]);
    rgba[i * 4 + 3] = 1;
  }
  applyCube(rgba, W, H, cube, 4);
  const flipped = new Float32Array(rgba.length);
  for (let row = 0; row < H; row++) flipped.set(rgba.subarray(row * W * 4, (row + 1) * W * 4), (H - 1 - row) * W * 4);
  const t = new THREE.DataTexture(flipped, W, H, THREE.RGBAFormat, THREE.FloatType);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.LinearSRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/**
 * Per-room reflection probes as PMREM environments for live items: the same probe images the shell
 * uses, corrected per room and direction by the item-light calibration (lib/studio/lighting) so items
 * receive what the bake says that room delivers. The shell's own materials are not affected.
 */
function useRoomEnvs(base: string, data: WalkData, cal: ItemLight | null) {
  const gl = useThree((s) => s.gl);
  const envs = useMemo(() => ({} as Record<string, THREE.Texture>), []);
  const listeners = useMemo(() => new Set<() => void>(), []);
  const cubeKey = JSON.stringify(Object.keys(data.probes).map((r) => roomCube(cal, r)));
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const targets: THREE.WebGLRenderTarget[] = [];
    const cubes = JSON.parse(cubeKey) as Cube[];
    let alive = true;
    Object.keys(data.probes).forEach((r, i) => {
      new THREE.ImageLoader().load(`${base}/probe-${r}.webp`, (img) => {
        if (!alive) return;
        const src = correctedProbe(img, cubes[i]);
        const rt = pm.fromEquirectangular(src);
        src.dispose();
        targets.push(rt);
        envs[r] = rt.texture;
        listeners.forEach((f) => f());
      });
    });
    return () => { alive = false; targets.forEach((t) => t.dispose()); pm.dispose(); };
  }, [gl, base, data.probes, envs, listeners, cubeKey]);
  return { envs, listeners };
}

/** Loads the shell's item-light calibration once (public/studio/lighting/<slug>.json); neutral when absent. */
function useItemLight(base: string) {
  const cal = useStudio((s) => s.itemLight);
  const setItemLight = useStudio((s) => s.setItemLight);
  useEffect(() => {
    const slug = base.split("/").filter(Boolean).pop();
    if (!slug) return;
    let alive = true;
    fetch(`/studio/lighting/${slug}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((raw) => {
        const parsed = raw ? parseItemLight(raw) : null;
        // a calibration set explicitly (calibration script, tests) wins over the file
        if (alive && parsed && !useStudio.getState().itemLight) setItemLight(parsed);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [base, setItemLight]);
  return cal;
}

let aoTexture: THREE.CanvasTexture | null = null;
/** Soft rounded-rectangle falloff, black with alpha: the contact shadow under furniture. */
function aoTex() {
  if (aoTexture) return aoTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 18, 64, 64, 64);
  grad.addColorStop(0, "rgba(0,0,0,0.95)");
  grad.addColorStop(0.45, "rgba(0,0,0,0.6)");
  grad.addColorStop(0.75, "rgba(0,0,0,0.2)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  aoTexture = new THREE.CanvasTexture(c);
  aoTexture.colorSpace = THREE.SRGBColorSpace;
  return aoTexture;
}

/** Clones a subtree with its own materials (shared via `cache`, so one slot edit reaches every clone). */
function cloneItem(scene: THREE.Object3D, cache = new Map<THREE.Material, THREE.Material>()) {
  const root = scene.clone(true);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const src = m.material as THREE.Material;
    if (!cache.has(src)) cache.set(src, src.clone());
    m.material = cache.get(src)!;
    m.castShadow = true;
    m.receiveShadow = true;
  });
  return root;
}

type Modular = Extract<ModelManifest["sizing"], { mode: "modular" }>;

/** Lays the configured modules out left to right, centred; every module's back stays on the same line. */
function assembleModules(scene: THREE.Object3D, sizing: Modular, ids: string[]) {
  const byId = new Map(sizing.modules.map((m) => [m.id, m]));
  const total = ids.reduce((s, id) => s + (byId.get(id)?.width ?? 0), 0);
  const cache = new Map<THREE.Material, THREE.Material>();
  const root = new THREE.Group();
  let x = -total / 2;
  for (const id of ids) {
    const mod = byId.get(id);
    const src = mod && scene.getObjectByName(mod.node);
    if (!mod || !src) continue;
    const part = cloneItem(src, cache);
    part.position.set(x + mod.width / 2, 0, 0);
    root.add(part);
    x += mod.width;
  }
  return root;
}

type ItemProps = {
  node: ItemNode; walk: WalkConfig; data: WalkData;
  envs: Record<string, THREE.Texture>; listeners: Set<() => void>; cal: ItemLight | null;
  /** Part of an AI proposal under review: drawn translucent and tinted, not selectable. */
  ghost?: boolean;
};

/** Translucent blue-tinted look for proposal ghosts; returns a function that restores the materials. */
function ghostify(obj: THREE.Object3D): () => void {
  const saved: [THREE.MeshStandardMaterial, { t: boolean; o: number; dw: boolean; e: THREE.Color; ei: number }][] = [];
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    if (saved.some(([s]) => s === mat)) return;
    saved.push([mat, { t: mat.transparent, o: mat.opacity, dw: mat.depthWrite, e: mat.emissive.clone(), ei: mat.emissiveIntensity }]);
    mat.transparent = true; mat.opacity = 0.62; mat.depthWrite = false;
    mat.emissive.set("#3d6bd6"); mat.emissiveIntensity = 0.35;
    mat.needsUpdate = true;
  });
  return () => {
    for (const [mat, s] of saved) {
      mat.transparent = s.t; mat.opacity = s.o; mat.depthWrite = s.dw; mat.emissive.copy(s.e); mat.emissiveIntensity = s.ei;
      mat.needsUpdate = true;
    }
  };
}

/** Item backed by a GLB (fixed, variant or modular). */
function GlbItem(props: ItemProps) {
  const catalog = useStudio((s) => s.catalog)!;
  const manifest = catalog.model(props.node.catalog)!;
  const { scene } = useGLTF(modelAssetUrl(manifest.assets.glb!), false, true);
  const modKey = manifest.sizing.mode === "modular" ? (props.node.modules ?? manifest.sizing.defaultConfig ?? []).join(",") : "";
  const obj = useMemo(
    () => (manifest.sizing.mode === "modular" ? assembleModules(scene, manifest.sizing, modKey.split(",").filter(Boolean)) : cloneItem(scene)),
    [scene, manifest, modKey],
  );
  return <ItemBody {...props} obj={obj} />;
}

/** Item whose geometry is generated from its parameters (kitchen runs, wardrobes, shelving, beds): real dimensions, no scaling. */
function GeneratedItem(props: ItemProps) {
  const catalog = useStudio((s) => s.catalog)!;
  const manifest = catalog.model(props.node.catalog)!;
  const gen = manifest.sizing.mode === "parametric" ? (manifest.sizing.generator as GeneratorId) : undefined;
  const dims = resolveSize(manifest, props.node);
  const key = `${gen}|${dims.w.toFixed(3)}|${dims.d.toFixed(3)}|${dims.h.toFixed(3)}|${JSON.stringify(props.node.params ?? {})}`;
  const obj = useMemo(() => buildGenerated(generate(gen!, dims, props.node.params ?? {})), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => obj.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } }), [obj]);
  return <ItemBody {...props} obj={obj} />;
}

function Item(props: ItemProps) {
  const manifest = useStudio((s) => s.catalog)!.model(props.node.catalog)!;
  return manifest.assets.glb ? <GlbItem {...props} /> : <GeneratedItem {...props} />;
}

function ItemBody({ node, walk, data, envs, listeners, cal, ghost, obj }: ItemProps & { obj: THREE.Object3D }) {
  const catalog = useStudio((s) => s.catalog)!;
  const showDecal = useStudio((s) => s.lighting.ao);
  const manifest = catalog.model(node.catalog)!;
  const dims = resolveSize(manifest, node);
  const design = useDesign();
  const drag = useStudio((s) => (s.drag && s.drag.id === node.id ? s.drag : null));
  const t = drag ? { ...node.transform, x: drag.x, y: drag.y, rot: drag.rot } : node.transform;
  const room = roomAt(walk, data.rooms, t.x, t.y);

  // slot materials: textured when the asset's UVs are in metres, otherwise colour/roughness/metalness only
  useEffect(() => {
    for (const slot of manifest.slots) {
      const target = slot.target ?? slot.id;
      const ref = node.slots[slot.id] ?? slot.default;
      const mat = ref ? catalog.material(ref) ?? null : null;
      obj.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && (m.material as THREE.Material).name === target) {
          applyMaterial(m.material as THREE.MeshStandardMaterial, mat, { uvScale: manifest.uvUnits === "metres" ? 1 : null });
        }
      });
    }
  }, [obj, manifest, node.slots, catalog]);

  // room reflection probe (arrives asynchronously), scaled by the room's item-light calibration
  useEffect(() => {
    const apply = () => {
      const probeRoom = envs[room] ? room : "living";
      const env = envs[probeRoom];
      const k = itemEnvIntensity(data.probes[probeRoom] ?? 1, EXPOSURE, cal, probeRoom);
      obj.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const mat = m.material as THREE.MeshStandardMaterial;
        if (env && mat.envMap !== env) { mat.envMap = env; mat.needsUpdate = true; }
        mat.envMapIntensity = k;
      });
    };
    apply();
    listeners.add(apply);
    return () => { listeners.delete(apply); };
  }, [obj, room, envs, listeners, data.probes, cal]);

  // AI proposal ghost (after the slot materials, so a slot change re-applies it)
  useEffect(() => (ghost ? ghostify(obj) : undefined), [obj, ghost, node.slots]);

  const decal = showDecal && !ghost && manifest.placement.layer === "furniture";
  return (
    <group position={[t.x, t.z + manifest.placement.elevation, -t.y]} rotation={[0, t.rot, 0]} name={`item:${node.id}`} userData={{ itemId: node.id, ghost: !!ghost }}
      onPointerDown={(e) => { if (!ghost) design?.onItemDown(node.id, e); }}
      onClick={(e) => { if (design) e.stopPropagation(); }}>
      <primitive object={obj} />
      {decal && (
        <mesh name="ao-decal" rotation={[-Math.PI / 2, 0, 0]} position={[0, -manifest.placement.elevation + 0.004, -dims.d / 2]} renderOrder={1}>
          <planeGeometry args={[dims.w + 0.6, dims.d + 0.6]} />
          <meshBasicMaterial map={aoTex()} transparent depthWrite={false} opacity={0.8} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
        </mesh>
      )}
    </group>
  );
}

export function ItemLayer({ walk, data }: { walk: WalkConfig; data: WalkData }) {
  // while an AI proposal is under review the scene shows its preview document; new or changed pieces are ghosts
  const ai = useStudio((s) => s.ai);
  const docNodes = useStudio((s) => s.doc?.nodes);
  const nodes = ai?.preview?.nodes ?? docNodes;
  const ghosts = useMemo(() => new Set(ai?.preview ? [...(ai.response?.added ?? []), ...(ai.response?.changed ?? [])] : []), [ai]);
  const catalog = useStudio((s) => s.catalog);
  const cal = useItemLight(walk.base);
  const { envs, listeners } = useRoomEnvs(walk.base, data, cal);
  const items = useMemo(
    () => Object.values(nodes ?? {}).filter((n): n is ItemNode => n.kind === "item" && !!catalog?.model(n.catalog)),
    [nodes, catalog],
  );
  return (
    <>
      {items.map((n) => (
        <Suspense key={n.id} fallback={null}>
          <Item node={n} walk={walk} data={data} envs={envs} listeners={listeners} cal={cal} ghost={ghosts.has(n.id)} />
        </Suspense>
      ))}
    </>
  );
}
