"use client";
/* eslint-disable react-hooks/immutability, react-hooks/refs --
   three.js scene objects, cameras and the input ref are mutated imperatively per frame (r3f pattern). */

/**
 * First-person walkthrough of the Seed Yarkon 4-room apartment.
 *
 * Assets come from scripts/blender/apartment_walk.py → apartment_bake.py →
 * build-walk-assets.mjs (public/walk/yarkon-v2). Lighting is baked in Cycles:
 * every lightmapped material gets its group's irradiance atlas (uv1) and a
 * per-room reflection probe for specular; image-based diffuse is switched off
 * on those materials so the bake is the only diffuse light.
 *
 * Coordinates: the plan is Blender's (x east, y north = into the apartment,
 * facade on y = 0); three.js is y-up, so plan (x, y) ↔ world (x, -z).
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, useProgress, PerformanceMonitor } from "@react-three/drei";
import { EffectComposer, Bloom, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/LocaleProvider";
import TourSidePanel from "@/components/tour/TourSidePanel";
import yarkonData from "@/lib/tour/yarkonApartment.json";
import type { ApartmentModelData } from "@/lib/tour/types";

export const BASE = "/walk/yarkon-v2";
const EYE = 1.6;
const RADIUS = 0.2;
const WALK_SPEED = 1.35;   // m/s
const RUN_SPEED = 2.6;
const TURN_SPEED = 1.9;    // rad/s for arrow-key turning
const EXPOSURE = 1.12;     // global scale on all baked light
// The 2700 K downlights + oak bounce leave a warm cast; a camera would white-balance it out.
const WHITE_BALANCE = "vec3(0.93, 0.98, 1.10)";
const LOOK_SENS = 0.0022;

type Rect = [number, number, number, number];
export interface WalkData {
  lightmaps: { A: number; B: number };
  probes: Record<string, number>;
  sky: number;
  skyRot: number;
  probeAt: Record<string, [number, number, number]>;
  rooms: Record<string, Rect>;
  boxes: Rect[];
  spawn: [number, number, number];
}

export const ROOM_NAMES: Record<string, { he: string; en: string }> = {
  living: { he: "סלון ופינת אוכל", en: "Living & dining" },
  kitchen: { he: "מטבח", en: "Kitchen" },
  corridor: { he: "מבואה ומסדרון", en: "Entry & hallway" },
  bed3: { he: "חדר שינה 3", en: "Bedroom 3" },
  master: { he: "יחידת הורים", en: "Master bedroom" },
  bed2: { he: "חדר שינה 2", en: "Bedroom 2" },
  bath: { he: "חדר רחצה הורים", en: "Master bath" },
  balcony: { he: "מרפסת", en: "Balcony" },
};

/** Where "go to room" puts you: a clear spot and a composed view (yaw: forward = (-sin, cos) in plan). */
const STAND: Record<string, [number, number, number]> = {
  living: [5.0, 3.9, 2.36],
  kitchen: [5.2, 4.25, 0.0],
  corridor: [7.6, 7.9, Math.PI],
  bed3: [2.6, 5.6, 1.03],
  master: [9.9, 1.3, -1.0],
  bed2: [8.65, 7.65, -2.36],
  bath: [12.3, 5.1, -0.54],
  balcony: [8.5, -1.0, 1.57],
};

function roomAt(rooms: Record<string, Rect>, x: number, y: number): string {
  if (x >= 7.0 && x <= 8.2 && y >= 3.4) return "corridor";
  for (const [n, [x1, y1, x2, y2]] of Object.entries(rooms)) {
    if (x >= x1 && x <= x2 && y >= y1 && y <= y2) return n;
  }
  return "living";
}

/** Circle-vs-AABB push-out, a few relaxation passes. */
function collide(p: { x: number; y: number }, boxes: Rect[]) {
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const [x1, y1, x2, y2] of boxes) {
      const cx = Math.max(x1, Math.min(p.x, x2));
      const cy = Math.max(y1, Math.min(p.y, y2));
      let dx = p.x - cx, dy = p.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= RADIUS * RADIUS) continue;
      if (d2 < 1e-10) {
        // centre inside the box: leave by the nearest side
        const opts = [p.x - x1, x2 - p.x, p.y - y1, y2 - p.y];
        const i = opts.indexOf(Math.min(...opts));
        if (i === 0) p.x = x1 - RADIUS; else if (i === 1) p.x = x2 + RADIUS;
        else if (i === 2) p.y = y1 - RADIUS; else p.y = y2 + RADIUS;
      } else {
        const d = Math.sqrt(d2);
        dx /= d; dy /= d;
        p.x = cx + dx * RADIUS;
        p.y = cy + dy * RADIUS;
      }
      moved = true;
    }
    if (!moved) break;
  }
}

// ─── shared input state (keyboard, mouse, touch) ────────────────────────────
interface Input {
  keys: Set<string>;
  lookDX: number;
  lookDY: number;
  stick: { x: number; y: number };   // touch joystick, -1..1 (y up = forward)
  teleport: { x: number; y: number; yaw?: number } | null;
}

/** Patch: drop image-based *diffuse* on lightmapped materials (the bake already holds it). */
function bakedOnly(mat: THREE.MeshStandardMaterial) {
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_fragment_maps>",
      THREE.ShaderChunk.lights_fragment_maps
        .replace("iblIrradiance += getIBLIrradiance( geometryNormal );", "")
        .replace("vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;",
          `vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity * ${WHITE_BALANCE};`),
    );
  };
  mat.customProgramCacheKey = () => "baked-lm";
}

function useTex(url: string, cs: THREE.ColorSpace, flipY: boolean) {
  const [tex] = useState(() => {
    const t = new THREE.TextureLoader().load(url);
    t.colorSpace = cs;
    t.flipY = flipY;
    return t;
  });
  return tex;
}

// ─── the apartment ──────────────────────────────────────────────────────────
/** overview: dollhouse view from above — ceiling-level meshes hidden, plain backdrop instead of the sky. */
export function Apartment({ data, mobile, overview = false }: { data: WalkData; mobile: boolean; overview?: boolean }) {
  const { scene } = useGLTF(`${BASE}/apartment.glb`, false, true);
  const gl = useThree((s) => s.gl);
  const threeScene = useThree((s) => s.scene);
  const suffix = mobile ? "-2k" : "";
  const lmA = useTex(`${BASE}/lm-A${suffix}.webp`, THREE.SRGBColorSpace, false);
  const lmB = useTex(`${BASE}/lm-B${suffix}.webp`, THREE.SRGBColorSpace, false);
  const envUsers = useRef<Record<string, THREE.MeshStandardMaterial[]>>({});

  const probeTex = useMemo(() => {
    const out: Record<string, THREE.Texture> = {};
    for (const r of Object.keys(data.probes)) {
      const t = new THREE.TextureLoader().load(`${BASE}/probe-${r}.webp`, (tt) => {
        const pm = new THREE.PMREMGenerator(gl);
        const env = pm.fromEquirectangular(tt).texture;
        pm.dispose();
        out[r].userData.pmrem = env;
        for (const m of envUsers.current[r] ?? []) { m.envMap = env; m.needsUpdate = true; }
      });
      t.mapping = THREE.EquirectangularReflectionMapping;
      t.colorSpace = THREE.SRGBColorSpace;
      out[r] = t;
    }
    return out;
  }, [data.probes, gl]);

  // sky backdrop through the glass (+ env for the balcony)
  useEffect(() => {
    if (overview) return;
    const pm = new THREE.PMREMGenerator(gl);
    let skyEnv: THREE.Texture | null = null;
    const sky = new THREE.TextureLoader().load(`${BASE}/sky.webp`, (t) => {
      skyEnv = pm.fromEquirectangular(t).texture;
      for (const m of envUsers.current.balcony ?? []) { m.envMap = skyEnv; m.needsUpdate = true; }
    });
    sky.mapping = THREE.EquirectangularReflectionMapping;
    sky.colorSpace = THREE.SRGBColorSpace;
    threeScene.background = sky;
    threeScene.backgroundIntensity = data.sky * EXPOSURE;
    threeScene.backgroundRotation.set(0, data.skyRot ?? 0, 0);
    return () => { threeScene.background = null; sky.dispose(); skyEnv?.dispose(); pm.dispose(); };
  }, [threeScene, gl, data.sky, data.skyRot, overview]);

  // overview: open the dollhouse — hide everything that starts at ceiling height
  useEffect(() => {
    if (!overview) return;
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const hidden: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return;
      box.setFromObject(o);
      if (box.min.y > 2.2 || /ceiling|soffit/i.test(o.name + (o.parent?.name ?? ""))) { o.visible = false; hidden.push(o); }
    });
    return () => { for (const o of hidden) o.visible = true; };
  }, [scene, overview]);

  useMemo(() => {
    const cache = new Map<string, THREE.Material>();
    const nearestProbe = (room: string) => (data.probes[room] !== undefined ? room : room === "balcony" ? "balcony" : "living");
    for (const lm of [lmA, lmB]) { lm.channel = 1; lm.anisotropy = 4; }

    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      let n: THREE.Object3D | null = mesh;
      let tag = "";
      while (n) { if (n.name.includes("|")) { tag = n.name; break; } n = n.parent; }
      const [grp = "A", room = "living", src = ""] = tag.split("|");
      const probe = nearestProbe(room);
      const src0 = mesh.material as THREE.MeshStandardMaterial;
      const key = `${src0.uuid}|${grp}|${probe}`;
      let mat = cache.get(key) as THREE.MeshStandardMaterial | undefined;
      if (!mat) {
        const isGlass = /glass|water/i.test(src0.name) || (src0 as THREE.MeshPhysicalMaterial).transmission > 0;
        if (isGlass) {
          mat = new THREE.MeshPhysicalMaterial({
            color: 0xffffff, roughness: 0.02, metalness: 0, transparent: true,
            opacity: /shower/i.test(src0.name) ? 0.1 : 0.06, depthWrite: false, envMapIntensity: 1,
          });
        } else {
          mat = src0.clone();
          if (grp === "A" || grp === "B") {
            mat.lightMap = grp === "A" ? lmA : lmB;
            mat.lightMapIntensity = (grp === "A" ? data.lightmaps.A : data.lightmaps.B) * Math.PI * EXPOSURE;
            bakedOnly(mat);
          }
          if (grp === "E") mat.emissiveIntensity = (mat.emissiveIntensity || 1) * EXPOSURE;
        }
        mat.envMapIntensity = (probe === "balcony" ? data.sky : data.probes[probe] ?? 1) * EXPOSURE *
          (isGlass ? 1 : grp === "N" ? 0.9 : 1);
        if (/ceiling/i.test(src)) mat.envMapIntensity *= 0.3;
        (envUsers.current[probe] ??= []).push(mat);
        const ready = probe === "balcony" ? null : probeTex[probe]?.userData.pmrem;
        if (ready) mat.envMap = ready;
        cache.set(key, mat);
      }
      mesh.material = mat;
      // lightmap needs uv1; meshes without it (foliage) stay env-lit
      if (mat.lightMap && !mesh.geometry.getAttribute("uv1")) mat.lightMap = null;
      mesh.frustumCulled = true;
    });
  }, [scene, lmA, lmB, data, probeTex]);

  useEffect(() => {
    if (!window.location.search.includes("debug")) return;
    const rows: unknown[] = [];
    let n = 0;
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (!(o as THREE.Mesh).isMesh || !m) return;
      n++;
      if (rows.length < 14 && /floor|wall|ceiling|sofa|Cube|chair/i.test(o.name + o.parent?.name))
        rows.push([o.name, o.parent?.name, m.type, !!m.lightMap, m.lightMapIntensity?.toFixed(2), !!m.envMap,
          m.envMapIntensity?.toFixed(2), !!(o as THREE.Mesh).geometry.getAttribute("uv1"), m.color?.getHexString(), !!m.map]);
    });
    const el = document.getElementById("walk-debug") ?? Object.assign(document.createElement("pre"), { id: "walk-debug", hidden: true });
    el.textContent = JSON.stringify({ n, rows, info: gl.info.render });
    document.body.appendChild(el);
  }, [scene, gl]);

  return <primitive object={scene} />;
}

// ─── first-person controller ────────────────────────────────────────────────
function Walker({ data, input, reduce, onRoom, onPose }: {
  data: WalkData; input: React.RefObject<Input>; reduce: boolean;
  onRoom: (r: string) => void; onPose: (x: number, y: number, yaw: number) => void;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const st = useRef({ x: data.spawn[0], y: data.spawn[1], yaw: data.spawn[2], pitch: -0.04, vx: 0, vy: 0, turn: 0, bob: 0, room: "", poseT: 0 });

  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  useEffect(() => {
    camera.rotation.order = "YXZ";
    // ~70° vertical on landscape; on portrait phones keep ~78° horizontal instead (else it's a keyhole)
    const hfov = 78 * (Math.PI / 180);
    camera.fov = aspect >= 1.15 ? 70 : Math.min(100, (2 * Math.atan(Math.tan(hfov / 2) / aspect) * 180) / Math.PI);
    camera.near = 0.05;
    camera.far = 200;
    camera.updateProjectionMatrix();
  }, [camera, aspect]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = st.current;
    const inp = input.current!;
    const k = inp.keys;
    if (inp.teleport) {
      s.x = inp.teleport.x; s.y = inp.teleport.y;
      if (inp.teleport.yaw !== undefined) { s.yaw = inp.teleport.yaw; s.pitch = -0.05; }
      s.vx = s.vy = 0; inp.teleport = null;
    }
    // look
    s.yaw -= inp.lookDX * LOOK_SENS;
    s.pitch = Math.max(-1.2, Math.min(1.2, s.pitch - inp.lookDY * LOOK_SENS));
    inp.lookDX = inp.lookDY = 0;
    // arrow-key turning with eased angular velocity
    const turnIn = (k.has("ArrowLeft") || k.has("KeyQ") ? 1 : 0) - (k.has("ArrowRight") || k.has("KeyE") ? 1 : 0);
    s.turn += (turnIn * TURN_SPEED - s.turn) * (1 - Math.exp(-dt * (reduce ? 20 : 9)));
    s.yaw += s.turn * dt;
    // move
    let f = (k.has("ArrowUp") || k.has("KeyW") ? 1 : 0) - (k.has("ArrowDown") || k.has("KeyS") ? 1 : 0);
    let r = (k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0);
    f += inp.stick.y; r += inp.stick.x;
    const len = Math.hypot(f, r);
    if (len > 1) { f /= len; r /= len; }
    const speed = k.has("ShiftLeft") || k.has("ShiftRight") ? RUN_SPEED : WALK_SPEED;
    const fx = -Math.sin(s.yaw), fy = Math.cos(s.yaw);   // plan-space forward
    const rx = Math.cos(s.yaw), ry = Math.sin(s.yaw);    // plan-space right
    const tvx = (fx * f + rx * r) * speed, tvy = (fy * f + ry * r) * speed;
    const a = 1 - Math.exp(-dt * (len > 0.01 ? 7 : 10));  // accelerate / brake
    s.vx += (tvx - s.vx) * a;
    s.vy += (tvy - s.vy) * a;
    const px = s.x, py = s.y;
    const p = { x: s.x + s.vx * dt, y: s.y + s.vy * dt };
    collide(p, data.boxes);
    s.x = p.x; s.y = p.y;
    // keep velocity consistent with what collision allowed (no sticking)
    if (dt > 0) { s.vx = (s.x - px) / dt; s.vy = (s.y - py) / dt; }
    const sp = Math.hypot(s.vx, s.vy);
    s.bob += sp * dt * 6.0;
    const bob = reduce ? 0 : Math.sin(s.bob) * 0.012 * Math.min(1, sp / WALK_SPEED);
    camera.position.set(s.x, EYE + bob, -s.y);
    camera.rotation.set(s.pitch, s.yaw, 0);
    const room = roomAt(data.rooms, s.x, s.y);
    if (room !== s.room) { s.room = room; onRoom(room); }
    s.poseT += dt;
    if (s.poseT > 0.066) { s.poseT = 0; onPose(s.x, s.y, s.yaw); }
  });
  return null;
}

function Loader({ he }: { he: boolean }) {
  const { progress, active } = useProgress();
  if (!active && progress >= 100) return null;
  return (
    <div className="aw-loading" role="status" aria-live="polite">
      <div className="aw-loading__bar"><span style={{ width: `${progress.toFixed(0)}%` }} /></div>
      <p>{he ? "טוענים את הדירה…" : "Loading the apartment…"} {progress.toFixed(0)}%</p>
    </div>
  );
}

// ─── page shell: canvas + HUD + touch controls ──────────────────────────────
// apt-top.webp: ortho camera, scale 16.6 m across 1600×1120 px, centred (7.5, 3.15)
const MAP = { x0: 7.5 - 8.3, w: 16.6, yTop: 3.15 + (16.6 * 1120) / 1600 / 2, h: (16.6 * 1120) / 1600 };

/** Only same-site paths are accepted as the exit target. */
function safeBack(v: string | null): string | null {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : null;
}

/**
 * Side-panel data: the unit's stored tour model when there is one, else the
 * Yarkon content (lib/tour/yarkonApartment.json, room ids = walk room ids);
 * facts are overridden with the real unit, and "{price}" in answers is filled in.
 */
function useTourPanel(unitId: string | null) {
  const [state, setState] = useState<{ model: ApartmentModelData; isSample: boolean } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let model = yarkonData as unknown as ApartmentModelData;
      let isSample = false;
      try {
        if (unitId) {
          const u = (await (await fetch(`/api/buildings/unit/${encodeURIComponent(unitId)}`)).json())?.unit;
          if (u?.unitTypeId) {
            const r = await fetch(`/api/tour/model/${encodeURIComponent(u.unitTypeId)}`);
            const dbModel = r.ok ? (await r.json())?.model : null;
            if (dbModel) { model = dbModel as ApartmentModelData; isSample = false; }
            const area = Number(u.unitType?.attributes?.area);
            const price = Number(u.price ?? u.listPrice);
            model = {
              ...model,
              facts: {
                ...model.facts,
                ...(area > 0 ? { areaSqm: area } : {}),
                floor: u.building?.floorCount ? `${u.floor}/${u.building.floorCount}` : String(u.floor),
                ...(price > 0 ? { priceIls: `${(price / 1e6).toFixed(2)} מ׳ ₪` } : {}),
              },
            };
          }
        }
      } catch { /* keep the built-in content */ }
      const price = model.facts.priceIls;
      model = { ...model, questions: model.questions.map((q) => (q.a ? { ...q, a: q.a.replace("{price}", price) } : q)) };
      if (!cancelled) setState({ model, isSample });
    })();
    return () => { cancelled = true; };
  }, [unitId]);
  return state;
}

export default function ApartmentWalk() {
  const { locale, m } = useI18n();
  const he = locale === "he";
  const [{ unitId, backUrl }] = useState(() => {
    const p = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
    return { unitId: p.get("unit"), backUrl: safeBack(p.get("back")) };
  });
  const panel = useTourPanel(unitId);
  const [profileId, setProfileId] = useState("neutral");
  const [dwell, setDwell] = useState<Record<string, number>>({});
  const [data, setData] = useState<WalkData | null>(null);
  const [room, setRoom] = useState("corridor");
  const [pose, setPose] = useState({ x: 7.6, y: 7.9, yaw: Math.PI });
  const [locked, setLocked] = useState(false);
  const [dpr, setDpr] = useState(1.5);
  const [stickUi, setStickUi] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);
  const input = useRef<Input>({ keys: new Set(), lookDX: 0, lookDY: 0, stick: { x: 0, y: 0 }, teleport: null });
  const wrap = useRef<HTMLDivElement>(null);
  const [{ mobile, reduce }] = useState(() => ({
    mobile: typeof window !== "undefined" && (window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 760),
    reduce: typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  }));

  useEffect(() => {
    fetch(`${BASE}/walk.json`).then((r) => r.json()).then(setData).catch(() => setData(null));
  }, []);

  // dwell per room (model ids) for the analytics card
  const modelRoom = room;
  useEffect(() => {
    const id = window.setInterval(() => {
      setDwell((d) => ({ ...d, [modelRoom]: (d[modelRoom] ?? 0) + 1 }));
    }, 1000);
    return () => window.clearInterval(id);
  }, [modelRoom]);

  const changeProfile = useCallback((id: string) => { setProfileId(id); setDwell({}); }, []);

  // keyboard
  useEffect(() => {
    const keys = input.current.keys;
    const GAME = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"]);
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, textarea, select")) return;
      keys.add(e.code);
      if (GAME.has(e.code)) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => keys.delete(e.code);
    const blur = () => keys.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, []);

  // mouse look: pointer lock when granted, drag-to-look otherwise
  useEffect(() => {
    const el = wrap.current;
    if (!el || mobile) return;
    let dragging = false;
    const onLock = () => setLocked(document.pointerLockElement === el.querySelector("canvas"));
    const move = (e: MouseEvent) => {
      if (document.pointerLockElement || dragging) {
        input.current.lookDX += e.movementX;
        input.current.lookDY += e.movementY;
      }
    };
    const downM = (e: MouseEvent) => {
      if ((e.target as HTMLElement).tagName !== "CANVAS") return;
      dragging = true;
      const c = el.querySelector("canvas");
      try { const p = c?.requestPointerLock?.() as unknown as Promise<void> | undefined; p?.catch?.(() => {}); } catch { /* drag fallback */ }
    };
    const upM = () => { dragging = false; };
    document.addEventListener("pointerlockchange", onLock);
    window.addEventListener("mousemove", move);
    el.addEventListener("mousedown", downM);
    window.addEventListener("mouseup", upM);
    return () => {
      document.removeEventListener("pointerlockchange", onLock);
      window.removeEventListener("mousemove", move);
      el.removeEventListener("mousedown", downM);
      window.removeEventListener("mouseup", upM);
    };
  }, [mobile]);

  // touch: left half = joystick, right half = look
  const touches = useRef(new Map<number, { kind: "stick" | "look"; x: number; y: number; ox: number; oy: number }>());
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if ((t.target as HTMLElement).closest(".aw-ui")) continue;
      const kind = t.clientX < window.innerWidth * 0.45 ? "stick" : "look";
      touches.current.set(t.identifier, { kind, x: t.clientX, y: t.clientY, ox: t.clientX, oy: t.clientY });
      if (kind === "stick") setStickUi({ ox: t.clientX, oy: t.clientY, x: 0, y: 0 });
    }
  }, []);
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      const s = touches.current.get(t.identifier);
      if (!s) continue;
      if (s.kind === "look") {
        input.current.lookDX += (t.clientX - s.x) * 1.4;
        input.current.lookDY += (t.clientY - s.y) * 1.4;
      } else {
        const R = 56;
        let dx = (t.clientX - s.ox) / R, dy = (t.clientY - s.oy) / R;
        const l = Math.hypot(dx, dy);
        if (l > 1) { dx /= l; dy /= l; }
        input.current.stick = { x: dx, y: -dy };
        setStickUi({ ox: s.ox, oy: s.oy, x: dx, y: dy });
      }
      s.x = t.clientX; s.y = t.clientY;
    }
  }, []);
  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      const s = touches.current.get(t.identifier);
      if (s?.kind === "stick") { input.current.stick = { x: 0, y: 0 }; setStickUi(null); }
      touches.current.delete(t.identifier);
    }
  }, []);

  const goRoom = useCallback((r: string) => {
    const p = STAND[r];
    if (p) input.current.teleport = { x: p[0], y: p[1], yaw: p[2] };
  }, []);

  const onMapClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!data) return;
    const b = e.currentTarget.getBoundingClientRect();
    const x = MAP.x0 + ((e.clientX - b.left) / b.width) * MAP.w;
    const y = MAP.yTop - ((e.clientY - b.top) / b.height) * MAP.h;
    const p = { x, y };
    collide(p, data.boxes);
    if (p.x > 0.2 && p.x < 14.8 && p.y > -2.0 && p.y < 8.3) input.current.teleport = { x: p.x, y: p.y };
    else goRoom(roomAt(data.rooms, x, y));
  }, [data, goRoom]);

  const exit = () => {
    if (document.pointerLockElement) document.exitPointerLock();
    if (backUrl) window.location.href = backUrl;
    else if (window.history.length > 1) window.history.back();
    else window.location.href = "/";
  };

  const T = he
    ? { title: "סיור בדירה — סיד ירקון, 4 חדרים", back: "יציאה", hintDesk: "חיצים / WASD ללכת · לחצו וגררו כדי להסתכל · Shift לריצה · Esc לשחרר", hintTouch: "אגודל שמאל ללכת · גררו בצד ימין כדי להסתכל", rooms: "מעבר לחדר", map: "תוכנית הדירה — לחצו כדי לעבור" }
    : { title: "Walkthrough — Seed Yarkon, 4 rooms", back: "Exit", hintDesk: "Arrows / WASD to walk · click & drag to look · Shift to run · Esc to release", hintTouch: "Left thumb to walk · drag on the right to look", rooms: "Go to room", map: "Floor plan — click to jump" };

  return (
    <div
      ref={wrap}
      className="aw-root"
      dir={he ? "rtl" : "ltr"}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <style>{CSS}</style>
      {panel && (
        <TourSidePanel
          className="aw-ui aw-panel qp-glass"
          style={{ position: "absolute", height: "auto" }}
          model={panel.model}
          isSample={panel.isSample}
          strings={m.tour}
          profileId={profileId}
          onProfileChange={changeProfile}
          activeRoomId={modelRoom}
          dwell={dwell}
          onResetDwell={() => setDwell({})}
          onClose={exit}
        />
      )}
      <div className="aw-stage">
      {data && (
        <Canvas
          dpr={mobile ? [1, 1.5] : dpr}
          gl={{ antialias: mobile, powerPreference: "high-performance", toneMapping: mobile ? THREE.AgXToneMapping : THREE.NoToneMapping }}
          camera={{ fov: 70, near: 0.05, far: 200, position: [data.spawn[0], EYE, -data.spawn[1]] }}
          aria-label={T.title}
        >
          <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.5)} />
          <Suspense fallback={null}>
            <Apartment data={data} mobile={mobile} />
          </Suspense>
          <Walker data={data} input={input} reduce={reduce} onRoom={setRoom} onPose={(x, y, yaw) => setPose({ x, y, yaw })} />
          {!mobile && (
            <EffectComposer multisampling={4}>
              <Bloom mipmapBlur intensity={0.28} luminanceThreshold={1.6} luminanceSmoothing={0.4} radius={0.7} />
              <ToneMapping mode={ToneMappingMode.AGX} />
              <Vignette offset={0.32} darkness={0.42} />
            </EffectComposer>
          )}
        </Canvas>
      )}
      <Loader he={he} />

      <div className="aw-ui aw-top">
        <button type="button" className="aw-btn" onClick={exit}>{he ? "→" : "←"} {T.back}</button>
        <div className="aw-title">
          <strong>{T.title}</strong>
          <span aria-live="polite">{ROOM_NAMES[room]?.[he ? "he" : "en"]}</span>
        </div>
      </div>

      <div className="aw-ui aw-map" role="button" tabIndex={0} aria-label={T.map} title={T.map} onClick={onMapClick}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/buildings/yarkon-v2/apt-top.webp" alt="" draggable={false} />
        <span
          className="aw-dot"
          style={{
            left: `${((pose.x - MAP.x0) / MAP.w) * 100}%`,
            top: `${((MAP.yTop - pose.y) / MAP.h) * 100}%`,
            transform: `translate(-50%, -50%) rotate(${-pose.yaw}rad)`,
          }}
        />
      </div>

      {!locked && <p className="aw-hint">{mobile ? T.hintTouch : T.hintDesk}</p>}
      </div>

      {mobile && stickUi && (
        <div className="aw-stick" style={{ left: stickUi.ox, top: stickUi.oy }} aria-hidden>
          <span style={{ transform: `translate(${stickUi.x * 40}px, ${stickUi.y * 40}px)` }} />
        </div>
      )}
    </div>
  );
}

useGLTF.preload?.(`${BASE}/apartment.glb`, false, true);

const CSS = `
.aw-root { position: fixed; inset: 0; z-index: 1000; background: #0b0b0c; color: #f4efe6; touch-action: none; user-select: none; -webkit-user-select: none; overscroll-behavior: none; font-family: var(--font-heebo, system-ui, sans-serif); }
.aw-root canvas { display: block; cursor: grab; }
.aw-root canvas:active { cursor: grabbing; }
.aw-top { position: absolute; top: 14px; inset-inline: 16px; display: flex; gap: 12px; align-items: center; pointer-events: none; }
.aw-top > * { pointer-events: auto; }
.aw-btn { background: rgba(20,20,22,.62); color: inherit; border: 1px solid rgba(255,255,255,.18); border-radius: 999px; padding: 8px 16px; font-size: 14px; backdrop-filter: blur(10px); cursor: pointer; }
.aw-btn:hover { background: rgba(40,40,44,.75); }
.aw-title { display: flex; flex-direction: column; gap: 2px; text-shadow: 0 1px 8px rgba(0,0,0,.6); }
.aw-title strong { font-weight: 600; font-size: 15px; letter-spacing: .01em; }
.aw-title span { font-size: 13px; opacity: .85; }
.aw-map { position: absolute; bottom: 16px; inset-inline-end: 16px; width: min(300px, 38vw); aspect-ratio: 1600 / 1120; border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,.2); background: rgba(16,16,18,.55); backdrop-filter: blur(8px); cursor: crosshair; box-shadow: 0 8px 30px rgba(0,0,0,.35); }
.aw-map img { width: 100%; height: 100%; display: block; opacity: .92; }
.aw-dot { position: absolute; width: 18px; height: 18px; pointer-events: none; }
.aw-dot::before { content: ""; position: absolute; inset: 4px; border-radius: 50%; background: #e8b65e; box-shadow: 0 0 0 2px #fff, 0 0 10px rgba(232,182,94,.9); }
.aw-dot::after { content: ""; position: absolute; left: 50%; top: -9px; transform: translateX(-50%); border: 6px solid transparent; border-bottom: 10px solid rgba(232,182,94,.95); }
/* The scene runs under the panel; the panel floats as glass (qp-glass), like the building's floor picker */
.aw-root { --aw-panel-w: 340px; }
.aw-stage { position: absolute; inset: 0; overflow: hidden; }
.aw-panel { position: absolute; top: 16px; bottom: 16px; right: 16px; width: var(--aw-panel-w); box-sizing: border-box; z-index: 3; touch-action: pan-y; user-select: text; -webkit-user-select: text; }
/* keep the HUD clear of the panel (it sits on the physical right in both languages) */
.aw-top { left: 16px; right: calc(var(--aw-panel-w) + 32px); }
.aw-map { inset-inline-end: auto; left: 16px; }
.aw-hint { left: calc((100% - var(--aw-panel-w) - 32px) / 2); }
.aw-hint { position: absolute; top: 72px; left: 50%; transform: translateX(-50%); margin: 0; padding: 6px 14px; border-radius: 999px; background: rgba(20,20,22,.5); font-size: 13px; white-space: nowrap; pointer-events: none; backdrop-filter: blur(6px); max-width: calc(100% - 32px); overflow: hidden; text-overflow: ellipsis; }
.aw-loading { position: absolute; inset: 0; display: grid; place-content: center; gap: 12px; text-align: center; background: #0b0b0c; z-index: 2; }
.aw-loading__bar { width: min(320px, 70vw); height: 3px; background: rgba(255,255,255,.12); border-radius: 3px; overflow: hidden; }
.aw-loading__bar span { display: block; height: 100%; background: #e8b65e; transition: width .3s ease; }
.aw-loading p { margin: 0; font-size: 14px; opacity: .8; }
.aw-stick { position: fixed; width: 112px; height: 112px; margin: -56px 0 0 -56px; border-radius: 50%; border: 2px solid rgba(255,255,255,.35); background: rgba(255,255,255,.08); pointer-events: none; }
.aw-stick span { position: absolute; left: 50%; top: 50%; width: 44px; height: 44px; margin: -22px; border-radius: 50%; background: rgba(255,255,255,.55); }
@media (max-width: 760px) {
  .aw-map { width: 42vw; bottom: 12px; }
  .aw-hint { top: 64px; font-size: 12px; }
}
@media (max-width: 860px) {
  .aw-stage { bottom: 42dvh; }
  .aw-panel { top: 58dvh; bottom: 0; left: 0; right: 0; width: auto; border-radius: 18px 18px 0 0; }
  .aw-top { right: 16px; }
  .aw-hint { left: 50%; }
}
@media (prefers-reduced-motion: reduce) {
  .aw-loading__bar span { transition: none; }
}
`;
