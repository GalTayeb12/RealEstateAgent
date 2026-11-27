/**
 * M13 draw-call batching (shell: once per loaded GLB, idempotent; items: per built item).
 *
 *  - `mergeStaticShell`: the fixed shell parts (door trims, skirting, sills, window frames,
 *    downlight rims...) are ~100 small meshes that share a handful of materials. They are
 *    merged per material into one mesh each. Surfaces the user can re-finish (`S|<id>`
 *    materials) and transparent glass are left alone, so selection and swaps still work.
 *  - `shellShadowProxies`: instead of every shell mesh casting into the sun's shadow map
 *    (~180 extra draws), one position-only merged mesh casts for all walls and fixed parts
 *    and one for the ceilings (hidden in the plan cutaway, like the ceilings themselves).
 *    three.js tests layers and culling against the VIEW camera in the shadow pass too, so the
 *    proxies cannot be shadow-only by layer. They are invisible instead (no colour, no depth
 *    write: 2 near-free draws in the view), never hit by pickers, and hidden from the path tracer.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Float32 copy (glTF meshes may be quantized; transforming Int16 data would overflow). */
function floatCopy(g: THREE.BufferGeometry, names?: string[]) {
  const out = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(g.attributes)) {
    if (names && !names.includes(name)) continue;
    const a = attr as THREE.BufferAttribute;
    const arr = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) arr[i * a.itemSize + k] = a.getComponent(i, k);
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  const idx = g.getIndex();
  if (idx) out.setIndex(Array.from(idx.array as ArrayLike<number>));
  else out.setIndex(Array.from({ length: (out.getAttribute("position") as THREE.BufferAttribute).count }, (_, i) => i));
  return out;
}

function relativeMatrix(root: THREE.Object3D, mesh: THREE.Object3D) {
  root.updateMatrixWorld(true);
  return new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(mesh.matrixWorld);
}

const isSurface = (m: THREE.Material) => m.name.startsWith("S|");
const isOpaque = (m: THREE.Material) => !m.transparent;

/**
 * Merges the meshes under `root` that share a material (and attribute layout) into one mesh per
 * material, in `root`'s space. `accept` filters which meshes may be merged. The merged geometry is
 * new (flagged `userData.ownsGeometry`), the originals are detached. Returns the net meshes removed.
 */
export function mergeByMaterial(root: THREE.Object3D, accept: (mesh: THREE.Mesh) => boolean, name = (first: THREE.Mesh, n: number) => `${first.name}|merged-${n}`): number {
  const groups = new Map<string, THREE.Mesh[]>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material) || !accept(mesh)) return;
    const mat = mesh.material as THREE.Material;
    const sig = Object.keys(mesh.geometry.attributes).sort().join(",");
    const key = `${mat.uuid}|${sig}|${mesh.castShadow}|${mesh.receiveShadow}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(mesh);
  });
  let removed = 0;
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue;
    const geos = meshes.map((m) => floatCopy(m.geometry).applyMatrix4(relativeMatrix(root, m)));
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    const first = meshes[0];
    const out = new THREE.Mesh(merged, first.material);
    out.name = name(first, meshes.length);
    out.castShadow = first.castShadow;
    out.receiveShadow = first.receiveShadow;
    out.userData.mergedFrom = meshes.length;
    out.userData.ownsGeometry = true;
    root.add(out);
    for (const m of meshes) m.removeFromParent();
    removed += meshes.length - 1;
  }
  return removed;
}

/** Merges the fixed (non-surface, opaque, unclipped) shell meshes per material. Idempotent per GLB scene. */
export function mergeStaticShell(root: THREE.Object3D): number {
  if (root.userData.studioMerged) return 0;
  root.userData.studioMerged = true;
  return mergeByMaterial(
    root,
    (mesh) => { const mat = mesh.material as THREE.Material; return !isSurface(mat) && isOpaque(mat) && !mat.clippingPlanes?.length; },
    // keep the "<group>|<room>|..." tag so code that reads it still finds a group and room
    (first, n) => `${first.name.split("|").slice(0, 2).join("|")}|merged-${n}`,
  );
}

/** One shadow-casting proxy for walls + fixed parts and one for ceilings (floors cast nothing useful). */
export function shellShadowProxies(root: THREE.Object3D): { rest: THREE.Mesh | null; ceilings: THREE.Mesh | null } {
  const rest: THREE.BufferGeometry[] = [];
  const ceilings: THREE.BufferGeometry[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || mesh.userData.shadowProxy || Array.isArray(mesh.material)) return;
    const mat = mesh.material as THREE.Material;
    if (!isOpaque(mat) || mat.name.startsWith("S|surface:floor:")) return;
    const g = floatCopy(mesh.geometry, ["position"]).applyMatrix4(relativeMatrix(root, mesh));
    (mat.name.startsWith("S|surface:ceiling:") ? ceilings : rest).push(g);
  });
  const material = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide /* like the shell materials */ });
  const build = (geos: THREE.BufferGeometry[], name: string) => {
    if (!geos.length) return null;
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) return null;
    merged.computeBoundingSphere();
    const m = new THREE.Mesh(merged, material);
    m.name = name;
    m.raycast = () => {};
    m.castShadow = true;
    m.receiveShadow = false;
    m.userData.shadowProxy = true;
    m.userData.stillHide = true; // the path tracer uses the real shell meshes
    return m;
  };
  return { rest: build(rest, "studio-shadow-proxy"), ceilings: build(ceilings, "studio-shadow-proxy-ceilings") };
}
