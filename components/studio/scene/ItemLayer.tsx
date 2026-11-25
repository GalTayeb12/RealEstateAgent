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
import { resolveSize } from "@/lib/studio/catalog/sizing";
import { roomAt, type WalkConfig, type WalkData } from "@/lib/experience/types";
import type { ItemNode } from "@/lib/studio/schema/nodes";
import { useStudio } from "../store";
import { applyMaterial } from "./materials";

const CATALOG_BASE = "/studio/catalog";

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
  grad.addColorStop(0, "rgba(0,0,0,0.85)");
  grad.addColorStop(0.55, "rgba(0,0,0,0.45)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  aoTexture = new THREE.CanvasTexture(c);
  aoTexture.colorSpace = THREE.SRGBColorSpace;
  return aoTexture;
}

function cloneItem(scene: THREE.Object3D) {
  const root = scene.clone(true);
  const cache = new Map<THREE.Material, THREE.Material>();
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

function Item({ node, walk, data, envs, listeners }: {
  node: ItemNode; walk: WalkConfig; data: WalkData;
  envs: Record<string, THREE.Texture>; listeners: Set<() => void>;
}) {
  const catalog = useStudio((s) => s.catalog)!;
  const showDecal = useStudio((s) => s.lighting.ao);
  const manifest = catalog.model(node.catalog)!;
  const { scene } = useGLTF(`${CATALOG_BASE}/${manifest.assets.glb}`, false, true);
  const obj = useMemo(() => cloneItem(scene), [scene]);
  const dims = resolveSize(manifest, node);
  const t = node.transform;
  const room = roomAt(walk, data.rooms, t.x, t.y);

  // slot materials (flat colour only for items until per-slot UV scales exist)
  useEffect(() => {
    for (const slot of manifest.slots) {
      const target = slot.target ?? slot.id;
      const ref = node.slots[slot.id];
      const mat = ref ? catalog.material(ref) ?? null : null;
      obj.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && (m.material as THREE.Material).name === target) {
          applyMaterial(m.material as THREE.MeshStandardMaterial, mat, { uvScale: null, base: CATALOG_BASE });
        }
      });
    }
  }, [obj, manifest, node.slots, catalog]);

  // room reflection probe (arrives asynchronously)
  useEffect(() => {
    const apply = () => {
      const env = envs[room] ?? envs.living;
      const k = (data.probes[room] ?? data.probes.living ?? 1) * EXPOSURE;
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
    <group position={[t.x, t.z + manifest.placement.elevation, -t.y]} rotation={[0, t.rot, 0]} name={`item:${node.id}`} userData={{ itemId: node.id }}>
      <primitive object={obj} />
      {decal && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -manifest.placement.elevation + 0.004, -dims.d / 2]} renderOrder={1}>
          <planeGeometry args={[dims.w + 0.35, dims.d + 0.35]} />
          <meshBasicMaterial map={aoTex()} transparent depthWrite={false} opacity={0.55} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
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
