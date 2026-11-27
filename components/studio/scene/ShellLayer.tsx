"use client";
/**
 * The baked apartment shell plus everything the studio adds on top of it:
 *  - realtime direct light is removed from the baked materials (the lightmap
 *    already holds all of it; the sun light exists for the furniture),
 *  - walls and ceilings shade furniture through two merged shadow proxies, and the
 *    fixed shell parts are merged per material (M13 draw-call budget, shellBatch.ts),
 *  - the user's surface material overrides (S|<surfaceId> materials),
 *  - a floor overlay that darkens the lightmapped floor where FURNITURE blocks
 *    the sun. It is masked by the lightmap's own brightness, so shadows that
 *    walls already baked in are never applied twice.
 */
import { useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import * as THREE from "three";
import { Apartment } from "@/components/walk/ApartmentWalk";
import type { WalkConfig, WalkData } from "@/lib/experience/types";
import { useStudio, type Tier } from "../store";
import { useDesign } from "./DesignInteraction";
import { applyMaterial } from "./materials";
import { mergeStaticShell, shellShadowProxies } from "./shellBatch";

const STRIP_DIRECT = /RE_Direct\([^;]*\);/g;
const CATALOG_BASE = "/studio/catalog";

/** Wraps the baked-light patch so realtime lights no longer add on top of the lightmap. */
function stripDirectLights(mat: THREE.MeshStandardMaterial) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    prev?.call(mat, shader, r);
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_fragment_begin>",
      THREE.ShaderChunk.lights_fragment_begin.replace(STRIP_DIRECT, ""),
    );
  };
  mat.customProgramCacheKey = () => "baked-lm-studio";
  mat.needsUpdate = true;
}

function floorOverlayMaterial(lm: THREE.Texture, opacity: number, lo: number, hi: number) {
  const m = new THREE.ShadowMaterial({ opacity, transparent: true, depthWrite: false });
  m.polygonOffset = true;
  m.polygonOffsetFactor = -2;
  m.polygonOffsetUnits = -2;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uLm = { value: lm };
    sh.uniforms.uLo = { value: lo };
    sh.uniforms.uHi = { value: hi };
    sh.vertexShader = sh.vertexShader
      .replace("void main() {", "varying vec2 vLmUv;\nvoid main() {\n  vLmUv = uv; // the overlay geometry carries the lightmap UVs as its uv attribute")
      ;
    sh.fragmentShader = sh.fragmentShader
      .replace("void main() {", "uniform sampler2D uLm; uniform float uLo; uniform float uHi; varying vec2 vLmUv;\nvoid main() {")
      .replace(
        "gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );",
        // only where the bake says the sun lands: smoothstep on the lightmap's luminance
        "float lmL = dot(texture2D(uLm, vLmUv).rgb, vec3(0.2126, 0.7152, 0.0722));\n  float sunMask = smoothstep(uLo, uHi, lmL);\n  gl_FragColor = vec4( color, opacity * sunMask * ( 1.0 - getShadowMask() ) );",
      );
  };
  m.customProgramCacheKey = () => "studio-floor-shadow";
  return m;
}

/** Float32 attributes so quantized glTF data survives applyMatrix4 and merging. */
function toFloat(g: THREE.BufferGeometry) {
  for (const [name, attr] of Object.entries(g.attributes)) {
    const a = attr as THREE.BufferAttribute;
    if (a.array instanceof Float32Array && !a.normalized) continue;
    const arr = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) arr[i * a.itemSize + k] = a.getComponent(i, k);
    g.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  return g;
}

const CUT_PLANE = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1.25); // keeps everything below y = 1.25 m

export function ShellLayer({ walk, data, mobile, tier, uvScales, hidden = false }: {
  walk: WalkConfig; data: WalkData; mobile: boolean; tier: Tier; uvScales: Record<string, number>; hidden?: boolean;
}) {
  const { scene } = useGLTF(`${walk.base}/apartment.glb`, false, true);
  const overrides = useStudio((s) => s.doc?.overrides);
  const catalog = useStudio((s) => s.catalog);
  const lighting = useStudio((s) => s.lighting);
  const shadows = tier !== "low";
  const design = useDesign();
  const mode = useStudio((s) => s.mode);
  const gl = useThree((s) => s.gl);

  // 0. batching (once per GLB): fixed parts merged per material, shadow proxies built
  const proxies = useMemo(() => {
    mergeStaticShell(scene);
    const built = (scene.userData.shadowProxies ??= shellShadowProxies(scene)) as ReturnType<typeof shellShadowProxies>;
    for (const p of [built.rest, built.ceilings]) if (p && !p.parent) scene.add(p);
    return built;
  }, [scene]);

  // 1. baked materials: no realtime direct light; only the proxies cast into the sun shadow map
  useEffect(() => {
    const seen = new Set<THREE.Material>();
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || mesh.userData.shadowProxy) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat.lightMap && !seen.has(mat)) { seen.add(mat); stripDirectLights(mat); }
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    });
    for (const p of [proxies.rest, proxies.ceilings]) if (p) p.castShadow = shadows;
  }, [scene, shadows, proxies]);

  // 1b. plan mode: a cutaway. Ceilings are hidden and walls are clipped at 1.25 m so the rooms can be seen from above
  useEffect(() => {
    const cut = mode === "plan";
    // eslint-disable-next-line react-hooks/immutability -- renderer flag, set imperatively (r3f pattern)
    gl.localClippingEnabled = cut;
    if (proxies.ceilings) proxies.ceilings.visible = !cut;
    const seen = new Set<THREE.Material>();
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || mesh.userData.shadowProxy) return;
      const mat = mesh.material as THREE.Material;
      mesh.userData.planHidden = cut && mat.name.startsWith("S|surface:ceiling:");
      mesh.visible = !mesh.userData.planHidden;
      if (seen.has(mat)) return;
      seen.add(mat);
      mat.clippingPlanes = cut && !mat.name.startsWith("S|surface:floor:") ? [CUT_PLANE] : null;
      mat.needsUpdate = true;
    });
  }, [scene, mode, gl, proxies]);

  // 2. surface material overrides (S|<surfaceId>)
  useEffect(() => {
    if (!catalog) return;
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const mat = mesh.isMesh ? (mesh.material as THREE.MeshStandardMaterial) : null;
      if (!mat || !mat.name.startsWith("S|")) return;
      const id = mat.name.slice(2);
      const ov = overrides?.[id];
      const manifest = ov ? catalog.material(ov.material) ?? null : null;
      applyMaterial(mat, manifest, { uvScale: uvScales[mat.name] ?? 1, base: CATALOG_BASE });
    });
  }, [scene, overrides, catalog, uvScales]);

  // 3. furniture sun shadows on the lightmapped floor
  useEffect(() => {
    const added: THREE.Mesh[] = [];
    let overlayMat: THREE.ShadowMaterial | null = null;
    if (shadows) {
      // reuse the lightmap the baked materials already hold (no second 4096 px texture)
      let lm: THREE.Texture | null = null;
      scene.traverse((o) => { const m = (o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).material as THREE.MeshStandardMaterial) : null; if (!lm && m?.lightMap) lm = m.lightMap; });
      if (!lm) return;
      const mat = floorOverlayMaterial(lm, lighting.shadowOpacity, lighting.maskLo, lighting.maskHi);
      overlayMat = mat;
      // every room's floor in ONE overlay mesh (lightmap UVs exposed as the standard uv attribute)
      scene.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(scene.matrixWorld).invert();
      const parts: THREE.BufferGeometry[] = [];
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        const name = mesh.isMesh ? (mesh.material as THREE.Material).name : "";
        if (!name.startsWith("S|surface:floor:") || !mesh.geometry.getAttribute("uv1")) return;
        const src = mesh.geometry;
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", src.getAttribute("position").clone());
        g.setAttribute("normal", src.getAttribute("normal").clone());
        g.setAttribute("uv", src.getAttribute("uv1").clone());
        const idx = src.getIndex();
        if (idx) g.setIndex(idx.clone());
        parts.push(toFloat(g).applyMatrix4(inv.clone().multiply(mesh.matrixWorld)));
      });
      const merged = parts.length ? mergeGeometries(parts, false) : null;
      for (const g of parts) g.dispose();
      if (merged) {
        const ov = new THREE.Mesh(merged, mat);
        ov.receiveShadow = true;
        ov.castShadow = false;
        ov.renderOrder = 2;
        ov.name = "studio-floor-shadow";
        scene.add(ov);
        added.push(ov);
      }
    }
    return () => { for (const m of added) { m.removeFromParent(); m.geometry.dispose(); } overlayMat?.dispose(); };
  }, [scene, shadows, lighting.shadowOpacity, lighting.maskLo, lighting.maskHi]);

  return (
    <group visible={!hidden} onClick={(e) => design?.onShellClick(e)}>
      <Apartment walk={walk} data={data} mobile={mobile} />
    </group>
  );
}
