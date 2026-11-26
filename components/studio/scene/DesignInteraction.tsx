"use client";

/**
 * Design mode inside the 3D scene: click a piece to select it, drag it on the
 * floor (snapped to a 5 cm grid, validated live; an illegal drop snaps back with
 * a reason), click a wall / floor / ceiling to select that surface. Everything
 * that changes the design goes through the store's validated `commit`.
 */
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { resolveSize } from "@/lib/studio/catalog/sizing";
import { previewNode, withTransform } from "@/lib/studio/design/preview";
import { snapTo } from "@/lib/studio/design/snap";
import type { ItemNode } from "@/lib/studio/schema/nodes";
import { gesture } from "../gesture";
import { isEditing, useStudio } from "../store";

export type DesignApi = {
  onItemDown(id: string, e: ThreeEvent<PointerEvent>): void;
  onShellClick(e: ThreeEvent<MouseEvent>): void;
};
const Ctx = createContext<DesignApi | null>(null);
export const useDesign = () => useContext(Ctx);

type Active = { id: string; start: ItemNode; grabDx: number; grabDy: number; moved: boolean; plane: THREE.Plane };

export function DesignProvider({ children }: { children: React.ReactNode }) {
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const dom = useThree((s) => s.gl.domElement);
  const active = useRef<Active | null>(null);
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const hit = useMemo(() => new THREE.Vector3(), []);

  const planePoint = useCallback((cx: number, cy: number, plane: THREE.Plane): THREE.Vector3 | null => {
    const r = dom.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera);
    return ray.ray.intersectPlane(plane, hit) ? hit : null;
  }, [camera, dom, ray, hit]);

  const move = useCallback((ev: PointerEvent) => {
    const a = active.current;
    const st = useStudio.getState();
    if (!a || !st.doc || !st.baseline || !st.catalog) return;
    const p = planePoint(ev.clientX, ev.clientY, a.plane);
    if (!p) return;
    const x = snapTo(p.x - a.grabDx), y = snapTo(-p.z - a.grabDy);
    if (!a.moved && Math.hypot(x - a.start.transform.x, y - a.start.transform.y) < 0.04) return;
    a.moved = true;
    const node = withTransform(a.start, { x, y });
    st.setDrag({ id: a.id, x, y, rot: node.transform.rot, preview: previewNode(st.doc, node, st.baseline, st.catalog) });
  }, [planePoint]);

  const upRef = useRef<() => void>(() => {});
  const up = useCallback(() => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", upRef.current);
    window.removeEventListener("pointercancel", upRef.current);
    const a = active.current;
    active.current = null;
    gesture.itemActive = false;
    if (a?.moved) gesture.suppressClickUntil = performance.now() + 300; // the click that ends a drag must not change the selection
    const st = useStudio.getState();
    const d = st.drag;
    st.setDrag(null);
    if (a?.moved && d) st.commit({ type: "move", id: d.id, x: d.x, y: d.y }, d.id); // refuses with a message when illegal
  }, [move]);

  useEffect(() => {
    upRef.current = up;
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [move, up]);

  const onItemDown = useCallback((id: string, e: ThreeEvent<PointerEvent>) => {
    const st = useStudio.getState();
    if (!isEditing(st.mode) || st.tool) return;
    const ne = e.nativeEvent;
    if (ne.pointerType === "mouse" && ne.button !== 0) return; // the right button looks around
    e.stopPropagation();
    st.select(id);
    const node = st.doc?.nodes[id];
    const m = node && node.kind === "item" ? st.catalog?.model(node.catalog) : null;
    if (!node || node.kind !== "item" || !m || node.locked) return;
    gesture.itemActive = true;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(node.transform.z + m.placement.elevation));
    const p = planePoint(ne.clientX, ne.clientY, plane);
    active.current = { id, start: node, plane, moved: false, grabDx: p ? p.x - node.transform.x : 0, grabDy: p ? -p.z - node.transform.y : 0 };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }, [move, up, planePoint]);

  const onShellClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    const st = useStudio.getState();
    if (!isEditing(st.mode) || st.tool) return;
    e.stopPropagation();
    if (performance.now() < gesture.suppressClickUntil) return;
    const mat = (e.object as THREE.Mesh).material as THREE.Material | undefined;
    const name = mat?.name ?? "";
    st.select(name.startsWith("S|") ? name.slice(2) : null);
  }, []);

  // debug-only: project a plan point (x, y, z metres) to screen pixels so tests can click exactly on a piece
  useEffect(() => {
    if (typeof window === "undefined" || !window.location.search.includes("debug")) return;
    (window as unknown as { __gesture: typeof gesture }).__gesture = gesture;
    (window as unknown as { __studioRay: (cx: number, cy: number) => string[] }).__studioRay = (cx, cy) => {
      const r = dom.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera);
      return ray.intersectObjects(scene.children, true).filter((h) => !(h.object as THREE.Line).isLine).slice(0, 6).map((h) => `${h.object.name || h.object.type}<${h.object.parent?.name ?? ""}> ${h.distance.toFixed(2)}`);
    };
    // world-space bounds of a rendered item in plan axes (x east, y north, z up), for geometry-vs-size tests
    (window as unknown as { __studioBounds: (id: string) => number[] | null }).__studioBounds = (id) => {
      const o = scene.getObjectByName(`item:${id}`);
      if (!o) return null;
      const b = new THREE.Box3();
      o.updateWorldMatrix(true, true);
      o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh && m.name !== "ao-decal") b.union(new THREE.Box3().setFromObject(m)); });
      return [b.min.x, -b.max.z, b.min.y, b.max.x, -b.min.z, b.max.y];
    };
    (window as unknown as { __studioScreen: (x: number, y: number, z: number) => { x: number; y: number } }).__studioScreen = (x, y, z) => {
      const r = dom.getBoundingClientRect();
      const v = new THREE.Vector3(x, z, -y).project(camera);
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    };
  }, [camera, dom, scene, ray]);

  const api = useMemo(() => ({ onItemDown, onShellClick }), [onItemDown, onShellClick]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

/** Outline of the selected piece: green when fine, amber with advisories, red when it cannot go there. */
export function SelectionBox() {
  const mode = useStudio((s) => s.mode);
  const selection = useStudio((s) => s.selection);
  const node = useStudio((s) => (s.selection ? s.doc?.nodes[s.selection] : undefined));
  const drag = useStudio((s) => s.drag);
  const catalog = useStudio((s) => s.catalog);
  const doc = useStudio((s) => s.doc);
  const baseline = useStudio((s) => s.baseline);

  const item = node && node.kind === "item" ? node : null;
  const manifest = item && catalog ? catalog.model(item.catalog) : undefined;
  const dims = useMemo(() => {
    if (!item || !manifest) return null;
    try { return resolveSize(manifest, item); } catch { return null; }
  }, [item, manifest]);
  const geo = useMemo(() => (dims ? new THREE.EdgesGeometry(new THREE.BoxGeometry(dims.w, Math.max(dims.h, 0.05), dims.d)) : null), [dims]);
  useEffect(() => () => geo?.dispose(), [geo]);

  if (!isEditing(mode) || !item || !manifest || !dims || !geo || !selection) return null;
  const dragging = drag && drag.id === item.id ? drag : null;
  const t = dragging ? { ...item.transform, x: dragging.x, y: dragging.y, rot: dragging.rot } : item.transform;
  const preview = dragging ? dragging.preview : doc && baseline && catalog ? previewNode(doc, item, baseline, catalog) : null;
  const color = !preview ? "#7bd88f" : !preview.ok ? "#ff6b6b" : preview.advisories.length ? "#f2c45a" : "#7bd88f";
  return (
    <group userData={{ stillHidden: true }} position={[t.x, t.z + manifest.placement.elevation, -t.y]} rotation={[0, t.rot, 0]}>
      <lineSegments geometry={geo} position={[0, dims.h / 2, -dims.d / 2]} renderOrder={5}>
        <lineBasicMaterial color={color} depthTest={false} transparent opacity={0.95} />
      </lineSegments>
    </group>
  );
}
