/**
 * Turns generator parts into three.js meshes: one bevelled box per part, merged per
 * material slot (so a whole kitchen run costs one draw call per slot). UVs are in
 * metres in the item frame, so a 60 cm tile texture really covers 60 cm and a wood
 * grain continues across neighbouring parts instead of restarting on each one.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Part } from "@/lib/studio/catalog/generators";

/** Fallback look of a slot until the user picks a catalog material (hardware reads as brushed brass). */
const LOOK: Record<string, { color: string; roughness: number; metalness: number }> = {
  handle: { color: "#b59a63", roughness: 0.38, metalness: 1 },
  carcass: { color: "#d9d4ca", roughness: 0.7, metalness: 0 },
  fronts: { color: "#d8d2c6", roughness: 0.6, metalness: 0 },
  countertop: { color: "#cfc6b6", roughness: 0.45, metalness: 0 },
  frame: { color: "#b89a74", roughness: 0.6, metalness: 0 },
  back: { color: "#d9d4ca", roughness: 0.8, metalness: 0 },
  upholstery: { color: "#c9c3b8", roughness: 0.95, metalness: 0 },
  linen: { color: "#e6e1d8", roughness: 0.95, metalness: 0 },
};

/** Bevelled box centred on the origin with UVs = world metres, projected along the dominant normal axis. */
export function partGeometry(p: Part): THREE.BufferGeometry {
  const g = new RoundedBoxGeometry(p.w, p.h, p.d, 2, p.r);
  g.translate(p.cx, p.cy, p.cz);
  const pos = g.getAttribute("position"), nor = g.getAttribute("normal");
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (nx >= ny && nx >= nz) { uv[2 * i] = z; uv[2 * i + 1] = y; } // side faces: along depth and height
    else if (ny >= nz) { uv[2 * i] = x; uv[2 * i + 1] = z; } // top and bottom
    else { uv[2 * i] = x; uv[2 * i + 1] = y; } // front and back
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

/** One mesh per slot; the material is named after the slot so catalog materials can be applied by name. */
export function buildGenerated(parts: Part[]): THREE.Group {
  const root = new THREE.Group();
  const bySlot = new Map<string, Part[]>();
  for (const p of parts) bySlot.set(p.slot, [...(bySlot.get(p.slot) ?? []), p]);
  for (const [slot, list] of bySlot) {
    const geos = list.map(partGeometry);
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const look = LOOK[slot] ?? LOOK.carcass;
    const mat = new THREE.MeshStandardMaterial({ color: look.color, roughness: look.roughness, metalness: look.metalness, name: slot });
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = slot;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  return root;
}
