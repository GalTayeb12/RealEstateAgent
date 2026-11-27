"use client";
/* eslint-disable react-hooks/immutability -- scene flags and renderer state are set imperatively (r3f pattern) */
/**
 * M12 path-traced still. While mounted it takes over rendering (useFrame priority 1)
 * and path-traces the live scene from the current camera with three-gpu-pathtracer:
 * the real materials, the sky, the sun and every emissive surface (lamp shades,
 * downlights) light the room with true bounce light and soft contact shadows, so
 * moved furniture finally gets correct GI. The baked lightmaps are not used; the
 * realtime helpers that fake what the path tracer computes (the furniture shadow
 * overlay on the floor, AO decals) are hidden for the duration. When the target
 * sample count is reached the canvas is captured as a PNG into the store.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { WebGLPathTracer } from "three-gpu-pathtracer";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { useStudio } from "../store";

type Snapshot = { scene: THREE.Scene; camera: THREE.Camera; dispose(): void };

/** Float32, non-interleaved copy of a geometry: the path tracer reads raw arrays and does not undo KHR_mesh_quantization. */
function floatGeometry(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(g.attributes)) {
    const src = a as THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
    const n = src.itemSize, arr = new Float32Array(src.count * n);
    for (let i = 0; i < src.count; i++) for (let k = 0; k < n; k++) arr[i * n + k] = src.getComponent(i, k);
    out.setAttribute(name, new THREE.BufferAttribute(arr, n));
  }
  if (g.index) out.setIndex(g.index.clone());
  for (const grp of g.groups) out.addGroup(grp.start, grp.count, grp.materialIndex);
  return out;
}

/**
 * A frozen copy of what is on screen, built for the path tracer: every visible mesh
 * (minus the realtime light fakes) as a world-space mesh with float geometry and its own
 * live material, the visible lights, a frozen camera, and the sky as background and
 * environment light.
 */
type SnapOpts = { normalScale?: number; minRoughness?: number; sheenScale?: number };
function snapshot(scene: THREE.Scene, camera: THREE.Camera, opts: SnapOpts = {}): Snapshot {
  const mats = new Map<THREE.Material, THREE.Material>();
  const adapt = (m: THREE.Material): THREE.Material => {
    const std = m as THREE.MeshStandardMaterial;
    if (!std.isMeshStandardMaterial || (opts.normalScale === undefined && opts.minRoughness === undefined && opts.sheenScale === undefined)) return m;
    let c = mats.get(m);
    if (!c) {
      const k = std.clone();
      if (opts.normalScale !== undefined) k.normalScale.multiplyScalar(opts.normalScale);
      if (opts.minRoughness !== undefined) k.roughness = Math.max(k.roughness, opts.minRoughness);
      const ph = k as THREE.MeshPhysicalMaterial;
      if (opts.sheenScale !== undefined && ph.isMeshPhysicalMaterial) ph.sheen *= opts.sheenScale;
      mats.set(m, (c = k));
    }
    return c;
  };
  scene.updateMatrixWorld(true);
  const out = new THREE.Scene();
  const geoms: THREE.BufferGeometry[] = [];
  const skip = (o: THREE.Object3D) => FAKES.has(o.name) || !!o.userData.stillHide;
  const walk = (o: THREE.Object3D) => {
    if (!o.visible || skip(o)) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m as unknown as THREE.InstancedMesh).isInstancedMesh) {
      const g = floatGeometry(m.geometry);
      geoms.push(g);
      const c = new THREE.Mesh(g, Array.isArray(m.material) ? m.material.map(adapt) : adapt(m.material));
      c.matrixAutoUpdate = false;
      c.matrix.copy(m.matrixWorld);
      c.matrixWorld.copy(m.matrixWorld);
      out.add(c);
    }
    const l = o as THREE.DirectionalLight;
    if (l.isLight && (l.isDirectionalLight || (l as unknown as THREE.PointLight).isPointLight || (l as unknown as THREE.SpotLight).isSpotLight)) {
      const c = l.clone();
      c.matrixAutoUpdate = false;
      c.matrix.copy(l.matrixWorld);
      c.matrixWorld.copy(l.matrixWorld);
      if (l.isDirectionalLight) { c.target = new THREE.Object3D(); c.target.position.setFromMatrixPosition(l.target.matrixWorld); c.target.updateMatrixWorld(); out.add(c.target); }
      out.add(c);
    }
    for (const ch of o.children) walk(ch);
  };
  for (const ch of scene.children) walk(ch);
  let sky: THREE.DataTexture | null = null;
  if (scene.background instanceof THREE.Texture) {
    sky = equirectData(scene.background);
    out.background = sky;
    out.backgroundIntensity = scene.backgroundIntensity;
    out.backgroundRotation.copy(scene.backgroundRotation);
    out.environment = sky;
    out.environmentIntensity = scene.backgroundIntensity;
    out.environmentRotation.copy(scene.backgroundRotation);
  } else if (scene.background instanceof THREE.Color) {
    out.background = scene.background.clone();
  }
  const cam = camera.clone();
  cam.updateMatrixWorld(true);
  return { scene: out, camera: cam, dispose: () => { for (const g of geoms) g.dispose(); for (const m of mats.values()) m.dispose(); sky?.dispose(); } };
}

/**
 * Final pass: an edge-preserving (bilateral) denoise on the accumulated HDR image, then the
 * renderer's tone mapping. Range weights are computed in a compressed space (c / (1 + c))
 * so bright and dark areas are filtered alike; NaN / inf samples are dropped and single
 * hot samples clamped, which removes the remaining fireflies without blurring edges,
 * wood grain or fabric weave.
 */
let denoiseQuad: FullScreenQuad | null = null;
const DENOISE_FRAG = /* glsl */ `
  uniform sampler2D map; uniform vec2 texel; uniform float sigmaS; uniform float sigmaR; uniform float clampMax; uniform float fireflyK;
  varying vec2 vUv;
  vec3 raw(vec2 uv) {
    vec3 c = texture2D(map, uv).rgb;
    if (any(isnan(c)) || any(isinf(c))) return vec3(0.0);
    return min(max(c, vec3(0.0)), vec3(clampMax));
  }
  float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
  // firefly suppression: a pixel far brighter than all of its 8 neighbours is a lone hot
  // sample (glossy path to the window, emissive hit), not detail: use the neighbours' mean
  vec3 fetch(vec2 uv) {
    vec3 c = raw(uv);
    vec3 m = vec3(0.0); float mx = 0.0;
    for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) {
      if (x == 0 && y == 0) continue;
      vec3 n = raw(uv + vec2(float(x), float(y)) * texel);
      m += n; mx = max(mx, lum(n));
    }
    m /= 8.0;
    return lum(c) > fireflyK * mx + 0.02 ? m : c;
  }
  void main() {
    vec3 c0 = fetch(vUv);
    vec3 k0 = c0 / (1.0 + c0);
    vec3 sum = vec3(0.0); float wsum = 0.0;
    for (int x = -RADIUS; x <= RADIUS; x++) {
      for (int y = -RADIUS; y <= RADIUS; y++) {
        vec2 d = vec2(float(x), float(y));
        vec3 c = fetch(vUv + d * texel);
        vec3 k = c / (1.0 + c) - k0;
        float w = exp(-dot(d, d) / (2.0 * sigmaS * sigmaS) - dot(k, k) / (2.0 * sigmaR * sigmaR));
        sum += c * w; wsum += w;
      }
    }
    gl_FragColor = vec4(sum / max(wsum, 1e-6), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
function drawDenoised(gl: THREE.WebGLRenderer, map: THREE.Texture) {
  if (!denoiseQuad) {
    denoiseQuad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { map: { value: null }, texel: { value: new THREE.Vector2() }, sigmaS: { value: DENOISE.sigmaS }, sigmaR: { value: DENOISE.sigmaR }, clampMax: { value: DENOISE.clampMax }, fireflyK: { value: DENOISE.fireflyK } },
      defines: { RADIUS: DENOISE.radius },
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: DENOISE_FRAG,
      depthTest: false, depthWrite: false, toneMapped: true,
    }));
  }
  const m = denoiseQuad.material as THREE.ShaderMaterial;
  const img = map.image as { width: number; height: number };
  m.uniforms.map.value = map;
  m.uniforms.texel.value.set(1 / img.width, 1 / img.height);
  const prev = gl.getRenderTarget();
  gl.setRenderTarget(null);
  denoiseQuad.render(gl);
  gl.setRenderTarget(prev);
}
/** Share of pixels in the accumulated image that are NaN / inf (diagnostic, sampled on a grid). */
function invalidFraction(gl: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget): number {
  const w = target.width, h = target.height, step = 8;
  const buf = new Float32Array(w * 4);
  let bad = 0, n = 0;
  for (let y = 0; y < h; y += step) {
    gl.readRenderTargetPixels(target, 0, y, w, 1, buf);
    for (let x = 0; x < w; x += step) { n++; const r = buf[x * 4], g = buf[x * 4 + 1], b = buf[x * 4 + 2]; if (!Number.isFinite(r + g + b)) bad++; }
  }
  return n ? bad / n : 0;
}
export const DENOISE = { radius: 3, sigmaS: 2.0, sigmaR: 0.07, clampMax: 24, fireflyK: 1.25 };

/** Objects that only exist to imitate light transport in the realtime view. */
const FAKES = new Set(["studio-floor-shadow", "ao-decal"]);

/**
 * One path tracer per renderer for the whole session: its shader is very large and ANGLE
 * (D3D11) takes tens of seconds to compile it, so it is compiled once (optionally warmed
 * up ahead of time with `warmStill`) and reused for every still.
 */
const tracers = new WeakMap<THREE.WebGLRenderer, WebGLPathTracer>();
function tracerFor(gl: THREE.WebGLRenderer): WebGLPathTracer {
  let t = tracers.get(gl);
  if (t) return t;
  t = new WebGLPathTracer(gl);
  t.renderDelay = 0;
  t.fadeDuration = 0;
  t.minSamples = 1;
  t.bounces = STILL_BOUNCES;
  t.transmissiveBounces = STILL_BOUNCES;
  t.filterGlossyFactor = 1; // tames fireflies from glossy paths
  t.rasterizeScene = false;
  t.tiles.set(2, 2);
  t.textureSize.set(STILL_TEXTURE, STILL_TEXTURE);
  // features the studio never uses: a smaller shader compiles faster
  const mat = (t as unknown as { _pathTracer: { material: { setDefine(k: string, v: number): void } } })._pathTracer.material;
  mat.setDefine("FEATURE_DOF", 0);
  mat.setDefine("FEATURE_FOG", 0);
  tracers.set(gl, t);
  return t;
}

/** Starts compiling the path-tracing shader in the background (KHR_parallel_shader_compile when available). */
export function warmStill(gl: THREE.WebGLRenderer): Promise<unknown> | undefined {
  // never touch a tracer that already exists: it is either warm or rendering a still right now
  if (tracers.has(gl)) return undefined;
  const t = tracerFor(gl);
  // a stand-in scene with the same shader features a real still uses (sky background map,
  // perspective camera), so the warmed program is exactly the one the still will need
  const warm = new THREE.Scene();
  const sky = new THREE.DataTexture(new Float32Array([0.5, 0.6, 0.8, 1, 0.5, 0.6, 0.8, 1]), 2, 1, THREE.RGBAFormat, THREE.FloatType);
  sky.mapping = THREE.EquirectangularReflectionMapping;
  sky.needsUpdate = true;
  warm.background = sky;
  warm.environment = sky;
  warm.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
  t.setScene(warm, new THREE.PerspectiveCamera());
  const pr = (t as unknown as { _pathTracer: { material: { onBeforeRender(): void }; _compilePromise: Promise<unknown> | null } })._pathTracer;
  pr.material.onBeforeRender(); // applies the scene-dependent defines and starts the (async) compile
  const compiling = pr._compilePromise ?? Promise.resolve();
  // then trace a few off-screen samples so every helper pass (blend, accumulation, texture
  // arrays) is compiled and uploaded too, not just the main path-tracing program
  return compiling.then(() => {
    // a still may have started while the shader compiled: it owns the tracer now
    if (tracers.get(gl) !== t || useStudio.getState().still) return;
    t.renderToCanvas = false;
    const target = gl.getRenderTarget();
    for (let i = 0; i < 8; i++) t.renderSample();
    gl.setRenderTarget(target);
    t.renderToCanvas = true;
    t.reset();
  });
}

/**
 * Compiles the path-tracing shader in the background a few seconds after the studio is
 * ready (desktop, high tier only), so the user's first still does not wait for it.
 * Uses KHR_parallel_shader_compile through renderer.compileAsync: the live view keeps running.
 */
export function StillWarmup({ delayMs = 6000 }: { delayMs?: number }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const id = setTimeout(() => {
      if (useStudio.getState().still) return; // the user already asked for a still: it compiles the shader itself
      const t0 = performance.now();
      const done = () => { (window as unknown as { __stillWarmMs?: number }).__stillWarmMs = Math.round(performance.now() - t0); };
      warmStill(gl)?.then(done, done);
    }, delayMs);
    return () => clearTimeout(id);
  }, [gl, delayMs]);
  return null;
}

export function StillRender() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const pt = useRef<WebGLPathTracer | null>(null);
  const ready = useRef(false);
  const done = useRef(false);
  const compiled = useRef(false);

  useEffect(() => {
    const prevExposure = gl.toneMappingExposure, prevTone = gl.toneMapping;
    gl.toneMapping = THREE.AgXToneMapping;
    gl.toneMappingExposure = STILL_EXPOSURE;
    const t = tracerFor(gl);
    // debug-only tuning hook (scripts/studio/still.mjs --tune=...), never set by the UI
    const tune = (window as unknown as { __stillTune?: { bounces?: number; glossy?: number; transmissive?: number } & SnapOpts }).__stillTune ?? {};
    t.bounces = tune.bounces ?? STILL_BOUNCES;
    t.filterGlossyFactor = tune.glossy ?? 1;
    t.transmissiveBounces = tune.transmissive ?? STILL_BOUNCES;
    pt.current = t;
    let snap: Snapshot | null = null;
    // snapshot + BVH build are synchronous: defer one tick so the "preparing" state paints first
    const timer = setTimeout(() => {
      try {
        snap = snapshot(scene, camera, { ...STILL_MATERIALS, ...tune });
        t.setScene(snap.scene, snap.camera);
        ready.current = true;
        useStudio.getState().setStill({ status: "rendering", prepMs: Math.round(performance.now() - (useStudio.getState().still?.startedAt ?? 0)) });
      } catch (e) {
        useStudio.getState().setStill({ status: "error", error: e instanceof Error ? e.message : String(e) });
      }
    }, 30);
    return () => {
      clearTimeout(timer);
      // the tracer (and its compiled shader) stays for the next still; drop the scene data
      t.setScene(new THREE.Scene(), new THREE.PerspectiveCamera());
      pt.current = null;
      snap?.dispose();
      gl.toneMapping = prevTone;
      gl.toneMappingExposure = prevExposure;
    };
  }, [gl, scene, camera]);

  useFrame(() => {
    const t = pt.current;
    if (!t || !ready.current) { gl.render(scene, camera); return; }
    if (done.current) { drawDenoised(gl, t.target.texture); return; } // keep showing the finished image until closed
    t.renderSample();
    const st = useStudio.getState();
    const target = st.still?.target ?? 0;
    const samples = Math.floor(t.samples);
    if (!compiled.current && t.samples > 0) {
      compiled.current = true;
      st.setStill({ compileMs: Math.round(performance.now() - (st.still?.startedAt ?? 0)) });
    }
    if (samples >= target) {
      done.current = true;
      const nanFrac = invalidFraction(gl, t.target);
      drawDenoised(gl, t.target.texture);
      // captured in the same task as the draw, so no preserveDrawingBuffer is needed
      const url = gl.domElement.toDataURL("image/png");
      st.setStill({ status: "done", samples, nanFrac, ms: Math.round(performance.now() - (st.still?.startedAt ?? 0)), url });
    } else if (samples !== st.still?.samples) {
      st.setStill({ samples });
    } else if (!compiled.current) {
      gl.render(scene, camera); // keep the live view on screen while the shader compiles
    }
  }, 1);

  return null;
}

/**
 * The path tracer importance-samples its environment from pixel data, so an image sky
 * (sky.webp) is copied into a linear float DataTexture (rows flipped: data row 0 is v = 0).
 */
function equirectData(tex: THREE.Texture, maxW = 1024): THREE.DataTexture {
  const img = tex.image as CanvasImageSource & { width: number; height: number };
  const w = Math.min(maxW, img.width), h = Math.max(1, Math.round((w * img.height) / img.width));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, w, h);
  const src = g.getImageData(0, 0, w, h).data;
  const out = new Float32Array(w * h * 4);
  const lin = (v: number) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  const srgb = tex.colorSpace === THREE.SRGBColorSpace;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, o = ((h - 1 - y) * w + x) * 4;
      out[o] = srgb ? lin(src[i]) : src[i] / 255;
      out[o + 1] = srgb ? lin(src[i + 1]) : src[i + 1] / 255;
      out[o + 2] = srgb ? lin(src[i + 2]) : src[i + 2] / 255;
      out[o + 3] = 1;
    }
  }
  const d = new THREE.DataTexture(out, w, h, THREE.RGBAFormat, THREE.FloatType);
  d.mapping = THREE.EquirectangularReflectionMapping;
  d.colorSpace = THREE.LinearSRGBColorSpace;
  d.minFilter = THREE.LinearFilter; d.magFilter = THREE.LinearFilter;
  d.generateMipmaps = false;
  d.needsUpdate = true;
  return d;
}

/** Exposure for the path-traced image (physical light, not the bake's scaled lightmaps). */
export const STILL_EXPOSURE = 1.25;
/**
 * Bounces. Interior light arrives from the sky THROUGH the window glass, so paths need room for
 * the glass (transmissive bounces) plus several diffuse bounces: 4 / 3 left the room dark and
 * speckled; 6 / 6 is bright and clean; 8 / 8 looked the same and cost 22% more (results/m12).
 */
export const STILL_BOUNCES = 6;
/** Every texture is resampled into one texture array of this size for the path tracer. */
export const STILL_TEXTURE = 2048;
/** Material adjustments for the still only (the live scene is never touched); undefined = as authored. */
export const STILL_MATERIALS: SnapOpts = {
  // the upholstery sheen (KHR_materials_sheen, white, full strength) is cheap in the raster view but
  // a high-variance lobe in the path tracer: it covered fabric in white speckles at 128 spp (0.3 still sparkled)
  sheenScale: 0,
  // near-mirror finishes (polished travertine at 0.04) turn into grain at 128 spp; 0.12 still reads as polished
  minRoughness: 0.12,
};
