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
import { generate, type GeneratorId } from "@/lib/studio/catalog/generators";
import { resolveSize } from "@/lib/studio/catalog/sizing";
import { roomAt, type WalkConfig, type WalkData } from "@/lib/experience/types";
import type { ModelManifest } from "@/lib/studio/schema/catalog";
import type { ItemNode } from "@/lib/studio/schema/nodes";
import { useStudio } from "../store";
import { useDesign } from "./DesignInteraction";
import { buildGenerated } from "./generated";
import { applyMaterial } from "./materials";

const CATALOG_BASE = "/studio/catalog";
const ITEM_MIN_PROBE = 1.2;

/** Per-room reflection probes as PMREM environments (same probes the shell uses). */
function useRoomEnvs(base: string, data: WalkData) {
  const gl = useThree((s) => s.gl);
  const envs = useMemo(() => ({} as Record<string, THREE.Texture>), []);
  const listeners = useMemo(() => new Set<() => void>(), []);
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const loaded: THREE.Texture[] = [];
    for (const r of Object.keys(data.probes)) {
      const t = new THREE.TextureLoader().load(`${base}/probe-${r}.webp`, (tt) => {
        envs[r] = pm.fromEquirectangular(tt).texture;
        listeners.forEach((f) => f());
      });
      t.mapping = THREE.EquirectangularReflectionMapping;
      t.colorSpace = THREE.SRGBColorSpace;
      loaded.push(t);
    }
    return () => { loaded.forEach((t) => t.dispose()); pm.dispose(); };
  }, [gl, base, data.probes, envs, listeners]);
  return { envs, listeners };
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
  envs: Record<string, THREE.Texture>; listeners: Set<() => void>;
};

/** Item backed by a GLB (fixed, variant or modular). */
function GlbItem(props: ItemProps) {
  const catalog = useStudio((s) => s.catalog)!;
  const manifest = catalog.model(props.node.catalog)!;
  const { scene } = useGLTF(`${CATALOG_BASE}/${manifest.assets.glb}`, false, true);
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

function ItemBody({ node, walk, data, envs, listeners, obj }: ItemProps & { obj: THREE.Object3D }) {
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
          applyMaterial(m.material as THREE.MeshStandardMaterial, mat, { uvScale: manifest.uvUnits === "metres" ? 1 : null, base: CATALOG_BASE });
        }
      });
    }
  }, [obj, manifest, node.slots, catalog]);

  // room reflection probe (arrives asynchronously)
  useEffect(() => {
    const apply = () => {
      const env = envs[room] ?? envs.living;
      const k = Math.max(data.probes[room] ?? data.probes.living ?? 1, ITEM_MIN_PROBE) * EXPOSURE; // dim rooms keep a floor so pieces do not go muddy against the bright baked walls
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
  }, [obj, room, envs, listeners, data.probes]);

  const decal = showDecal && manifest.placement.layer === "furniture";
  return (
    <group position={[t.x, t.z + manifest.placement.elevation, -t.y]} rotation={[0, t.rot, 0]} name={`item:${node.id}`} userData={{ itemId: node.id }}
      onPointerDown={(e) => design?.onItemDown(node.id, e)}
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
  const nodes = useStudio((s) => s.doc?.nodes);
  const catalog = useStudio((s) => s.catalog);
  const { envs, listeners } = useRoomEnvs(walk.base, data);
  const items = useMemo(
    () => Object.values(nodes ?? {}).filter((n): n is ItemNode => n.kind === "item" && !!catalog?.model(n.catalog)),
    [nodes, catalog],
  );
  return (
    <>
      {items.map((n) => (
        <Suspense key={n.id} fallback={null}>
          <Item node={n} walk={walk} data={data} envs={envs} listeners={listeners} />
        </Suspense>
      ))}
    </>
  );
}
