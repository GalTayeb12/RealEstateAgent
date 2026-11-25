"use client";
/**
 * Drawing tools for architectural proposals, working in any camera (walk, design,
 * top or isometric plan): the pointer is projected onto the floor plane. A partition
 * is two clicks (ends snap to wall faces, the 5 cm grid and the axes); an opening is
 * one click on a wall. Every proposal is validated live (ghost turns red when it
 * would be refused) and committed through the same validated command path as edits.
 */
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { previewProposal } from "@/lib/studio/design/preview";
import { snapTo } from "@/lib/studio/design/snap";
import { newNodeId } from "@/lib/studio/schema/ids";
import type { DesignNode, OpeningProposalNode, PartitionProposalNode } from "@/lib/studio/schema/nodes";
import { nearestWall, OPENING_EDGE, snapToWallFace } from "@/lib/studio/validation/architecture";
import { gesture } from "../gesture";
import { useStudio } from "../store";

const AXIS_SNAP = 0.07; // radians (about 4 degrees)
export const DEFAULT_OPENING = 0.9;
export const DEFAULT_THICKNESS = 0.1;

export function ArchTool() {
  const camera = useThree((s) => s.camera);
  const dom = useThree((s) => s.gl.domElement);
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const floor = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const hit = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    const point = (e: MouseEvent): [number, number] | null => {
      const r = dom.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      return ray.ray.intersectPlane(floor, hit) ? [hit.x, -hit.z] : null;
    };

    const build = (p: [number, number]): DesignNode | null => {
      const st = useStudio.getState();
      const tool = st.tool;
      if (!tool || !st.baseline) return null;
      if (tool.kind === "partition") {
        const snappedP = snapToWallFace(st.baseline, p);
        const q: [number, number] = snappedP.snapped ? snappedP.point : [snapTo(p[0]), snapTo(p[1])];
        if (!tool.a) return null;
        let b = q;
        const dx = b[0] - tool.a[0], dy = b[1] - tool.a[1];
        if (!snappedP.snapped && Math.hypot(dx, dy) > 0.01) {
          const ang = Math.atan2(dy, dx);
          if (Math.abs(Math.sin(ang)) < AXIS_SNAP) b = [b[0], tool.a[1]];
          else if (Math.abs(Math.cos(ang)) < AXIS_SNAP) b = [tool.a[0], b[1]];
        }
        return { id: "ghost", kind: "partitionProposal", locked: false, a: tool.a, b, thickness: DEFAULT_THICKNESS } satisfies PartitionProposalNode;
      }
      const near = nearestWall(st.baseline, p, 0.6);
      if (!near) return null;
      const w = st.baseline.walls[near.wallId];
      const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
      const at = Math.min(Math.max(near.at, DEFAULT_OPENING / 2 + OPENING_EDGE), L - DEFAULT_OPENING / 2 - OPENING_EDGE);
      return { id: "ghost", kind: "openingProposal", locked: false, wallId: near.wallId, at: Math.round(at * 20) / 20, width: DEFAULT_OPENING } satisfies OpeningProposalNode;
    };

    const move = (e: MouseEvent) => {
      const st = useStudio.getState();
      if (!st.tool || !st.doc || !st.baseline || !st.catalog) return;
      const p = point(e);
      if (!p) return;
      const node = build(p);
      if (!node) {
        // a partition with no start yet shows the snapped start point as a tiny stub
        if (st.tool.kind === "partition" && !st.tool.a) {
          const s = snapToWallFace(st.baseline, p);
          const q: [number, number] = s.snapped ? s.point : [snapTo(p[0]), snapTo(p[1])];
          st.setGhost({ node: { id: "ghost", kind: "partitionProposal", locked: false, a: q, b: [q[0] + 0.01, q[1]], thickness: 0.05 }, ok: true });
        } else st.setGhost(null);
        return;
      }
      st.setGhost({ node, ok: previewProposal(st.doc, node, st.baseline, st.catalog).ok });
    };

    const click = (e: MouseEvent) => {
      const st = useStudio.getState();
      const tool = st.tool;
      if (!tool || e.button !== 0 || performance.now() < gesture.suppressClickUntil) return;
      const p = point(e);
      if (!p || !st.baseline) return;
      if (tool.kind === "partition" && !tool.a) {
        const s = snapToWallFace(st.baseline, p);
        st.setTool({ kind: "partition", a: s.snapped ? s.point : [snapTo(p[0]), snapTo(p[1])] });
        return;
      }
      const node = build(p);
      if (!node) return;
      gesture.suppressClickUntil = performance.now() + 300; // r3f sees this same click next: it must not select the surface behind
      const id = newNodeId();
      const final = { ...node, id } as DesignNode;
      if (st.commit({ type: "add", node: final }, id)) {
        st.setTool(null);
        st.select(id);
      }
    };

    dom.addEventListener("pointermove", move);
    dom.addEventListener("click", click);
    return () => { dom.removeEventListener("pointermove", move); dom.removeEventListener("click", click); };
  }, [camera, dom, ray, floor, hit]);

  return null;
}
