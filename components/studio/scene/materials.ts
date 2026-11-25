/**
 * Applies a catalog material to a three.js material, and restores the original.
 * Surfaces and item slots both go through here. Textures are tiled to real-world
 * size: shell UVs are metres * the source material's scale, so repeat =
 * 1 / (uvScale * tileSize). Item UVs are model-space, so items only take colour,
 * roughness and metalness until their manifests carry per-slot UV scales (M4).
 */
import * as THREE from "three";
import type { MaterialManifest } from "@/lib/studio/schema/catalog";

type Std = THREE.MeshStandardMaterial;
type Orig = {
  color: THREE.Color; map: THREE.Texture | null; normalMap: THREE.Texture | null;
  roughnessMap: THREE.Texture | null; metalnessMap: THREE.Texture | null; roughness: number; metalness: number;
};

const loader = new THREE.TextureLoader();
const cache = new Map<string, THREE.Texture>();

function tex(url: string, srgb: boolean, repeat: [number, number]): THREE.Texture {
  const key = `${url}|${repeat.join(",")}`;
  let t = cache.get(key);
  if (!t) {
    t = loader.load(url);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = 8;
    cache.set(key, t);
  }
  return t;
}

export function applyMaterial(mat: Std, m: MaterialManifest | null, opts: { uvScale: number | null; base: string }) {
  const orig = (mat.userData.studioOrig ??= {
    color: mat.color.clone(), map: mat.map, normalMap: mat.normalMap, roughnessMap: mat.roughnessMap,
    metalnessMap: mat.metalnessMap, roughness: mat.roughness, metalness: mat.metalness,
  } satisfies Orig) as Orig;

  if (!m) {
    mat.color.copy(orig.color);
    mat.map = orig.map; mat.normalMap = orig.normalMap; mat.roughnessMap = orig.roughnessMap; mat.metalnessMap = orig.metalnessMap;
    mat.roughness = orig.roughness; mat.metalness = orig.metalness;
  } else {
    const maps = m.pbr.maps;
    const rep: [number, number] | null = opts.uvScale ? [1 / (opts.uvScale * m.tileSize[0]), 1 / (opts.uvScale * m.tileSize[1])] : null;
    const url = (f?: string) => (f ? `${opts.base}/${m.id}/${m.version}/${f}` : null);
    mat.color.set(maps.albedo && rep ? "#ffffff" : m.pbr.baseColor);
    mat.map = rep && maps.albedo ? tex(url(maps.albedo)!, true, rep) : null;
    mat.normalMap = rep && maps.normal ? tex(url(maps.normal)!, false, rep) : null;
    const orm = rep && maps.orm ? tex(url(maps.orm)!, false, rep) : null;
    mat.roughnessMap = orm; mat.metalnessMap = orm;
    mat.roughness = m.pbr.roughness; mat.metalness = m.pbr.metalness;
  }
  mat.needsUpdate = true;
}
