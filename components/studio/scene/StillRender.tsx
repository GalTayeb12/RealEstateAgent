"use client";
/* eslint-disable react-hooks/immutability --
   renderer, scene and tracer are driven imperatively (r3f pattern). */

/**
 * M12: a progressive, physically based still of the current view.
 *
 * The live scene is traced as it is (same meshes, same materials, the sun and the
 * sky as light) with three-gpu-pathtracer. The baked lightmap is NOT used here:
 * the still computes its own global illumination, which is also why it shows the
 * true effect of the user's furniture and finishes on the light.
 *
 * While a still renders, this component owns the frame loop (a positive-priority
 * useFrame switches r3f's own render off), the canvas is resized to the output
 * size, and helpers that are not part of the design (selection box, proposal
 * volumes, the floor shadow overlay) are hidden. Everything is put back afterwards.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { DenoiseMaterial, WebGLPathTracer } from "three-gpu-pathtracer";
import { STILL_DENOISE_BELOW, STILL_EXPOSURE, STILL_PRESETS, STILL_SKY_TINT, stillShouldStop, stillSize } from "@/lib/studio/render/still";
import { useStudio } from "../store";

interface Job {
  tracer: WebGLPathTracer;
  camera: THREE.PerspectiveCamera;
  restore: () => void;
  settings: (typeof STILL_PRESETS)[keyof typeof STILL_PRESETS];
  w: number;
  h: number;
}

/** Hides what is not part of the design; returns the undo. */
function hideHelpers(scene: THREE.Scene): () => void {
  const hidden: THREE.Object3D[] = [];
  scene.traverse((o) => {
    if (o.visible && (o.userData.stillHidden || o.name === "studio-floor-shadow")) { o.visible = false; hidden.push(o); }
  });
  return () => { for (const o of hidden) o.visible = true; };
}

/** The tracer samples the environment from float data; the sky is an 8-bit image, so decode it to linear float once. */
function skyToFloatTexture(sky: THREE.Texture): THREE.DataTexture | null {
  const img = sky.image as CanvasImageSource & { width?: number; height?: number } | undefined;
  if (!img || !img.width || !img.height) return null;
  const w = 1024, h = 512;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  if (!g) return null;
  g.drawImage(img, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h).data;
  const lin = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const v = i / 255; lin[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  const out = new Float32Array(w * h * 4);
  const [tr, tg, tb] = STILL_SKY_TINT; // a mild warm balance on the LIGHT only (the sky seen through the glass keeps its colour)
  for (let i = 0; i < w * h; i++) { out[i * 4] = lin[px[i * 4]] * tr; out[i * 4 + 1] = lin[px[i * 4 + 1]] * tg; out[i * 4 + 2] = lin[px[i * 4 + 2]] * tb; out[i * 4 + 3] = 1; }
  const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat, THREE.FloatType);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.LinearSRGBColorSpace;
  t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
  t.flipY = false; // canvas rows run top-down, like the image, and the equirect mapping expects the top row first
  t.needsUpdate = true;
  return t;
}

/**
 * The tracer merges raw buffers, so quantized (normalized int) and interleaved attributes, which the
 * optimised GLBs use, must be expanded to plain float arrays first. Swaps geometry on the meshes for
 * the duration of the still; returns the undo (the copies are disposed, the originals untouched).
 */
function flattenGeometry(scene: THREE.Scene): () => void {
  const swapped: [THREE.Mesh, THREE.BufferGeometry, THREE.BufferGeometry][] = [];
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const g = mesh.geometry;
    const plain = Object.values(g.attributes).every((a) => !(a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute && !a.normalized);
    if (plain) return;
    const copy = new THREE.BufferGeometry();
    for (const [name, a] of Object.entries(g.attributes)) {
      const n = a.count, size = a.itemSize, arr = new Float32Array(n * size);
      for (let i = 0; i < n; i++) {
        arr[i * size] = a.getX(i);
        if (size > 1) arr[i * size + 1] = a.getY(i);
        if (size > 2) arr[i * size + 2] = a.getZ(i);
        if (size > 3) arr[i * size + 3] = a.getW(i);
      }
      copy.setAttribute(name, new THREE.BufferAttribute(arr, size));
    }
    if (g.index) copy.setIndex(g.index);
    copy.groups = g.groups.map((x) => ({ ...x }));
    mesh.geometry = copy;
    swapped.push([mesh, g, copy]);
  });
  return () => { for (const [m, orig, copy] of swapped) { m.geometry = orig; copy.dispose(); } };
}

/** True when WebGL runs on ANGLE's Direct3D11 backend (the Windows default), which compiles and runs the tracer's shader slowly. */
function isD3D11(gl: THREE.WebGLRenderer): boolean {
  try {
    const ctx = gl.getContext();
    const info = ctx.getExtension("WEBGL_debug_renderer_info");
    return !!info && /Direct3D11/i.test(String(ctx.getParameter(info.UNMASKED_RENDERER_WEBGL)));
  } catch { return false; }
}

function StillLoop({ job, onDone }: { job: Job; onDone: (r: { truncated: boolean }) => void }) {
  const gl = useThree((s) => s.gl);
  const n = useRef(0);
  const sz = useRef(new THREE.Vector2()).current;
  const finished = useRef(false);
  useFrame(() => {
    if (finished.current) return;
    const { tracer, settings } = job;
    // r3f re-applies its own size / pixel ratio on some events (DPR changes, viewport resizes): keep the output size fixed
    gl.getSize(sz);
    if (sz.x !== job.w || sz.y !== job.h || gl.getPixelRatio() !== 1) { gl.setPixelRatio(1); gl.setSize(job.w, job.h, false); }
    const st = useStudio.getState().still;
    tracer.renderSample();
    const samples = tracer.samples;
    const elapsed = Date.now() - st.startedAt;
    const stop = stillShouldStop(samples, settings.samples, elapsed, settings.maxSeconds);
    if (stop.stop) {
      finished.current = true;
      // the sample just rendered is on the canvas; read it in the same task
      const url = gl.domElement.toDataURL("image/png");
      useStudio.getState().patchStill({ samples, elapsedMs: elapsed });
      void fetch(url).then((r) => r.blob()).then((b) => {
        useStudio.getState().patchStill({ url: URL.createObjectURL(b) });
        onDone({ truncated: stop.truncated });
      });
      return;
    }
    if (++n.current % 6 === 0) useStudio.getState().patchStill({ samples, elapsedMs: elapsed });
  }, 1);
  return null;
}

export function StillRender() {
  const status = useStudio((s) => s.still.status);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const [job, setJob] = useState<Job | null>(null);
  const jobRef = useRef<Job | null>(null);
  const token = useRef(0);

  // start: prepare the scene, build the BVH, then hand the frame loop to <StillLoop>
  useEffect(() => {
    if (status !== "preparing") return;
    const my = ++token.current;
    const preset = useStudio.getState().still.preset;
    const settings = STILL_PRESETS[preset];
    const prevSize = gl.getSize(new THREE.Vector2());
    const prevRatio = gl.getPixelRatio();
    const aspect = prevSize.x / Math.max(1, prevSize.y);
    const { w, h } = stillSize(preset, aspect);
    const showHelpers = hideHelpers(scene);
    const unflatten = flattenGeometry(scene);

    const prevEnv = scene.environment, prevEnvI = scene.environmentIntensity, prevEnvR = scene.environmentRotation.clone();
    const sky = scene.background && (scene.background as THREE.Texture).isTexture ? (scene.background as THREE.Texture) : null;
    const skyData = sky ? skyToFloatTexture(sky) : null;
    if (skyData) {
      scene.environment = skyData;
      scene.environmentIntensity = scene.backgroundIntensity;
      scene.environmentRotation.copy(scene.backgroundRotation);
    }

    gl.setPixelRatio(1);
    gl.setSize(w, h, false);
    const cam = (camera as THREE.PerspectiveCamera).clone();
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);

    const tracer = new WebGLPathTracer(gl);
    tracer.bounces = settings.bounces;
    tracer.renderScale = 1;
    tracer.tiles.set(2, 2);
    tracer.renderDelay = 0;
    tracer.minSamples = 1;
    tracer.fadeDuration = 0;
    tracer.rasterizeScene = false;
    tracer.dynamicLowRes = false;
    tracer.filterGlossyFactor = 0.5;
    // few samples (a slow GPU backend or the time limit) leave grain: smooth it, with strength falling as samples grow
    const dq = new FullScreenQuad(new DenoiseMaterial());
    tracer.renderToCanvasCallback = (target, renderer, quad) => {
      const auto = renderer.autoClear;
      renderer.autoClear = false;
      if (tracer.samples < STILL_DENOISE_BELOW) {
        const m = dq.material as unknown as { map: THREE.Texture; sigma: number; threshold: number; kSigma: number };
        const k = 1 - tracer.samples / STILL_DENOISE_BELOW;
        m.map = target.texture; m.sigma = 3 + 3 * k; m.threshold = 0.1 + 0.1 * k; m.kSigma = 1.5;
        dq.render(renderer);
      } else quad.render(renderer);
      renderer.autoClear = auto;
    };
    const prevExposure = gl.toneMappingExposure;
    gl.toneMappingExposure = STILL_EXPOSURE;

    const restore = () => {
      tracer.dispose();
      dq.material.dispose(); dq.dispose();
      gl.toneMappingExposure = prevExposure;
      showHelpers();
      unflatten();
      skyData?.dispose();
      scene.environment = prevEnv; scene.environmentIntensity = prevEnvI; scene.environmentRotation.copy(prevEnvR);
      gl.setPixelRatio(prevRatio);
      gl.setSize(prevSize.x, prevSize.y, false);
    };
    const made: Job = { tracer, camera: cam, restore, settings, w, h };
    jobRef.current = made;

    const fail = (e: unknown) => {
      if (token.current !== my) return;
      restore(); jobRef.current = null;
      useStudio.getState().patchStill({ status: "error", error: e instanceof Error ? `${e.message} @ ${(e.stack ?? "").split(String.fromCharCode(10)).slice(1, 4).join(" | ")}` : String(e) });
    };
    // let React paint the "preparing" overlay before the synchronous BVH build blocks the thread
    const t = setTimeout(() => {
      if (token.current !== my) return;
      try {
        void Promise.resolve(tracer.setScene(scene, cam)).then(() => {
          if (token.current !== my) return;
          useStudio.getState().patchStill({ status: "rendering", width: w, height: h, slowBackend: isD3D11(gl) });
          setJob(made);
        }).catch(fail);
      } catch (e) { fail(e); }
    }, 60);
    return () => clearTimeout(t);
  }, [status, gl, scene, camera]);

  // cancel / close while running
  useEffect(() => {
    if (status !== "cancelled") return;
    token.current++;
    jobRef.current?.restore(); jobRef.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tearing the loop down with the job
    setJob(null);
    useStudio.setState({ still: { ...useStudio.getState().still, status: "idle" } });
  }, [status]);

  // unmount safety
  useEffect(() => () => { token.current++; jobRef.current?.restore(); jobRef.current = null; }, []);

  if (!job || status !== "rendering") return null;
  return (
    <StillLoop
      job={job}
      onDone={({ truncated }) => {
        jobRef.current?.restore(); jobRef.current = null;
        setJob(null);
        useStudio.getState().patchStill({ status: "done", truncated });
      }}
    />
  );
}
