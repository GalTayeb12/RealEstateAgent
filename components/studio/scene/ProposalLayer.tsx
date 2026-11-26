"use client";
/**
 * Architectural proposals in the 3D scene: concept partitions (a warm, slightly
 * translucent wall with an amber outline) and concept openings (a ghost doorway on
 * the wall). They are visibly different from the original apartment on purpose:
 * unverified, never baked, never part of the baseline. Also draws the ghost of the
 * proposal currently being placed (green = acceptable, red = refused).
 */
import { useMemo } from "react";
import * as THREE from "three";
import { openingProposalCenter } from "@/lib/studio/validation/architecture";
import type { DesignNode, OpeningProposalNode, PartitionProposalNode } from "@/lib/studio/schema/nodes";
import { useStudio, isEditing } from "../store";

const AMBER = "#e8b65e", GREEN = "#7bd88f", RED = "#ff6b6b", WHITE = "#ffffff";
const PLAN_CUT = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1.25);

type Look = { color: string; opacity: number };

function Partition({ n, height, color, planning, onPick }: { n: PartitionProposalNode; height: number; color: string; planning: boolean; onPick?: () => void }) {
  const dx = n.b[0] - n.a[0], dy = n.b[1] - n.a[1];
  const L = Math.hypot(dx, dy) || 0.01;
  const h = n.height ?? height;
  const geo = useMemo(() => new THREE.BoxGeometry(L, h, n.thickness), [L, h, n.thickness]);
  const edges = useMemo(() => new THREE.EdgesGeometry(geo), [geo]);
  const planes = planning ? [PLAN_CUT] : [];
  return (
    <group position={[(n.a[0] + n.b[0]) / 2, h / 2, -(n.a[1] + n.b[1]) / 2]} rotation={[0, Math.atan2(dy, dx), 0]}
      onPointerDown={(e) => { if (onPick) { e.stopPropagation(); onPick(); } }}>
      <mesh geometry={geo} castShadow receiveShadow>
        <meshLambertMaterial color="#efe3cd" emissive="#7a6a50" emissiveIntensity={0.55} transparent opacity={0.92} clippingPlanes={planes} />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={color} clippingPlanes={planes} />
      </lineSegments>
    </group>
  );
}

function Opening({ n, color, look, planning, onPick }: { n: OpeningProposalNode; color: string; look: Look; planning: boolean; onPick?: () => void }) {
  const baseline = useStudio((s) => s.baseline);
  const w = baseline?.walls[n.wallId];
  const c = baseline ? openingProposalCenter(baseline, n) : null;
  const H = 2.1;
  const geo = useMemo(() => (w ? new THREE.BoxGeometry(n.width, H, w.thickness + 0.04) : null), [n.width, w]);
  const edges = useMemo(() => (geo ? new THREE.EdgesGeometry(geo) : null), [geo]);
  if (!w || !c || !geo || !edges) return null;
  const ang = Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0]);
  const planes = planning ? [PLAN_CUT] : [];
  return (
    <group position={[c[0], H / 2, -c[1]]} rotation={[0, ang, 0]} onPointerDown={(e) => { if (onPick) { e.stopPropagation(); onPick(); } }}>
      <mesh geometry={geo}>
        <meshBasicMaterial color={look.color} transparent opacity={look.opacity} depthWrite={false} clippingPlanes={planes} />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={color} clippingPlanes={planes} />
      </lineSegments>
    </group>
  );
}

export function ProposalLayer() {
  const nodes = useStudio((s) => s.doc?.nodes);
  const baseline = useStudio((s) => s.baseline);
  const selection = useStudio((s) => s.selection);
  const ghost = useStudio((s) => s.ghost);
  const mode = useStudio((s) => s.mode);
  const planning = mode === "plan";
  const editing = isEditing(mode);
  const list = useMemo(() => Object.values(nodes ?? {}).filter((n): n is PartitionProposalNode | OpeningProposalNode => n.kind === "partitionProposal" || n.kind === "openingProposal"), [nodes]);
  if (!baseline) return null;
  const pick = (id: string) => () => { if (editing && !useStudio.getState().tool) useStudio.getState().select(id); };
  const render = (n: DesignNode, color: string, look: Look, key: string, onPick?: () => void) =>
    n.kind === "partitionProposal" ? <Partition key={key} n={n} height={baseline.wallHeight} color={color} planning={planning} onPick={onPick} />
    : n.kind === "openingProposal" ? <Opening key={key} n={n} color={color} look={look} planning={planning} onPick={onPick} /> : null;
  return (
    <group userData={{ stillHidden: true }}>
      {list.map((n) => render(n, n.id === selection ? WHITE : AMBER, { color: AMBER, opacity: n.id === selection ? 0.5 : 0.3 }, n.id, pick(n.id)))}
      {ghost && render(ghost.node, ghost.ok ? GREEN : RED, { color: ghost.ok ? GREEN : RED, opacity: 0.35 }, "ghost")}
    </group>
  );
}

