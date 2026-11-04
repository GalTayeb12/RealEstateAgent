"use client";

/**
 * BuildingGLBScene
 *
 * Phase 1: Loads baked GLB + floor metadata → renders building with hover.
 * Phase 2: Floor click → smooth camera transition → unit blocks per positionIndex
 *           → hover/click at unit level → callbacks for side panel.
 * Phase 3: Unit click → dollhouse view (floor plan texture + low walls),
 *           semi-transparent sibling units, tight aerial camera.
 *
 * Coordinate system note:
 *   Blender Y-forward, Z-up → GLTF/Three.js Y-up, Z-forward
 *   Glass curtain wall faces Blender +Y → Three.js -Z
 *   Camera must be at NEGATIVE Z to face the glass facade.
 */

import { Html, useGLTF, Environment, OrbitControls, PerformanceMonitor, Sky } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { BuildingEnvironment } from "./BuildingEnvironment";
import type { ExplorerBuilding, FloorSelection, HoverInfo } from "./types";
import { statusHex } from "@/lib/statusColors";

// ── Floor / scene metadata (matches pipeline meta.json) ──────────────────────
export interface FloorMeta {
  floor: number;
  isLobby: boolean;
  isPenthouse: boolean;
  baseY: number;
  topY: number;
  width: number;
  depth: number;
  centerX: number;
  centerZ: number;
  units: Array<{
    id: string;
    unitNumber: string;
    positionIndex: number;
    status: string;
    unitTypeId: string;
  }>;
}

export interface BuildingMeta {
  id: string;
  name: string;
  worldX: number;
  worldZ: number;
  floors: FloorMeta[];
}

export interface SceneMeta {
  version: number;
  projectId: string;
  buildings: BuildingMeta[];
}

// ── Status labels (i18n strings passed from explorer) ────────────────────────
export interface StatusLabels {
  available: string;
  reserved: string;
  sold: string;
  sampleLayout?: string;
}

function getStatusLabel(status: string, labels: StatusLabels): string {
  if (status === "sold")     return labels.sold;
  if (status === "reserved") return labels.reserved;
  return labels.available;
}

// ── Shared layout helper ──────────────────────────────────────────────────────
// Computes the floating unit grid positions for a floor.
// Must stay in sync with FloorOpenView's rendering logic.
type UnitMeta = FloorMeta["units"][number];

interface UnitLayout {
  unit: UnitMeta;
  position: [number, number, number];
  size: [number, number, number];
}

function computeFloorLayout(
  floor: FloorMeta,
  scale: number,
): UnitLayout[] {
  const units = [...floor.units].sort((a, b) => a.positionIndex - b.positionIndex);
  const N = units.length;
  if (N === 0) return [];

  const floorW = floor.width * scale;
  const floorD = floor.depth * scale;
  const unitH = 0.28;  // flat floor-plan plate
  const floatY = floor.baseY * scale + 0.04;  // sit at actual floor level

  const cols = N <= 5 ? N : Math.ceil(N / 2);
  const rows = N <= 5 ? 1 : 2;
  const gapX = 0.28;
  const gapZ = 0.22;
  const unitW = (floorW - gapX * (cols - 1) - 0.5) / cols;
  const unitD = rows === 1 ? Math.min(floorD * 0.60, 5.0) : (floorD - gapZ) / 2 * 0.78;

  const totalW = cols * unitW + (cols - 1) * gapX;
  const totalZ = rows * unitD + (rows - 1) * gapZ;
  const startX = floor.centerX * scale - totalW / 2 + unitW / 2;
  const startZ = floor.centerZ * scale - totalZ / 2 + unitD / 2;

  return units.map((unit, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = startX + col * (unitW + gapX);
    const z = startZ + row * (unitD + gapZ);
    return {
      unit,
      position: [x, floatY + unitH / 2, z] as [number, number, number],
      size: [unitW, unitH, unitD] as [number, number, number],
    };
  });
}

// ── Baked GLB model ───────────────────────────────────────────────────────────
function BakedModel({
  url,
  opacity = 1.0,
  clipPlane,
}: {
  url: string;
  opacity?: number;
  clipPlane?: THREE.Plane | null;
}) {
  const { scene } = useGLTF(url);
  const cloned = useMemo(() => scene.clone(true), [scene]);

  useEffect(() => {
    const forceTransparent = opacity < 0.999;
    cloned.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          const m = mat as THREE.MeshStandardMaterial;
          const shouldBeTransparent = forceTransparent || m.opacity < 0.999;
          m.transparent = shouldBeTransparent;
          if (forceTransparent) m.opacity = opacity;
          // Apply clipping plane when floor is selected
          m.clippingPlanes = clipPlane ? [clipPlane] : [];
          m.needsUpdate = true;
        }
      }
    });
  }, [cloned, opacity, clipPlane]);

  return <primitive object={cloned} />;
}

// ── Per-floor hit box + hover glow ────────────────────────────────────────────
function FloorHitBox({
  floor,
  buildingName,
  scale,
  isHovered,
  onHover,
  onUnhover,
  onClick,
}: {
  floor: FloorMeta;
  buildingName: string;
  scale: number;
  isHovered: boolean;
  onHover: (info: HoverInfo) => void;
  onUnhover: () => void;
  onClick: () => void;
}) {
  const h = (floor.topY - floor.baseY) * scale;
  const w = floor.width * scale;
  const d = floor.depth * scale;
  const cy = (floor.baseY + (floor.topY - floor.baseY) / 2) * scale;
  const cx = floor.centerX * scale;
  const cz = floor.centerZ * scale;

  const availableCount = floor.units.filter((u) => u.status === "available").length;
  const totalCount = floor.units.length;

  const handleEnter = useCallback(() => {
    onHover({
      buildingName,
      floor: floor.floor,
      lobby: floor.isLobby,
      isPenthouse: floor.isPenthouse,
      availableCount,
      totalCount,
    });
  }, [buildingName, floor, availableCount, totalCount, onHover]);

  const glowColor = useMemo(() => {
    if (floor.isLobby) return "#3060C0";
    if (availableCount === 0) return "#602030";
    return "#1860E0";
  }, [floor.isLobby, availableCount]);

  return (
    <group position={[cx, cy, cz]}>
      <mesh
        onPointerEnter={(e) => { e.stopPropagation(); handleEnter(); }}
        onPointerLeave={(e) => { e.stopPropagation(); onUnhover(); }}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
      >
        <boxGeometry args={[w, h, d]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Front-face glow when hovered — Blender +Y face → Three.js -Z */}
      {isHovered && (
        <mesh position={[0, 0, -(d / 2 + 0.05)]}>
          <planeGeometry args={[w * 0.96, h * 0.88]} />
          <meshBasicMaterial
            color={glowColor}
            transparent
            opacity={0.28}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}

// ── Real-time status overlay (not baked — updates without re-pipeline) ────────
function StatusOverlay({ floor, scale }: { floor: FloorMeta; scale: number }) {
  if (floor.isLobby) return null;
  const availableCount = floor.units.filter((u) => u.status === "available").length;
  const totalCount = floor.units.length;
  if (totalCount === 0) return null;

  let color: string;
  let opacity: number;
  if (availableCount === totalCount) {
    return null; // all available — no tint
  } else if (availableCount === 0) {
    color = "#3A1A2A"; opacity = 0.35;
  } else {
    color = "#1A2A5A"; opacity = 0.18;
  }

  const h = (floor.topY - floor.baseY) * scale * 0.86;
  const w = floor.width * scale * 0.78;
  const faceZ = -(floor.centerZ + floor.depth / 2) * scale - 0.08;
  const cy = (floor.baseY + (floor.topY - floor.baseY) / 2) * scale;

  return (
    <mesh position={[floor.centerX * scale, cy, faceZ]}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} side={THREE.FrontSide} depthWrite={false} />
    </mesh>
  );
}

// ── Unit block — flat floor-plan plate (Stage 3) ─────────────────────────────
function UnitBlock({
  unit,
  position,
  size,
  color,
  opacity,
  isSelected,
  isHovered,
  statusLabel,
  onEnter,
  onLeave,
  onClick,
}: {
  unit: UnitMeta;
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  opacity?: number;
  isSelected: boolean;
  isHovered: boolean;
  statusLabel?: string;
  onEnter: (e: THREE.Event) => void;
  onLeave: (e: THREE.Event) => void;
  onClick: (e: THREE.Event) => void;
}) {
  const alpha = opacity ?? 0.92;
  const [w, , d] = size;
  const planH = 0.26;  // flat plate thickness

  return (
    <group position={position}>
      {/* Outline border — slightly oversized BackSide box */}
      {alpha > 0.12 && (
        <mesh>
          <boxGeometry args={[w + 0.10, planH + 0.06, d + 0.10]} />
          <meshBasicMaterial
            color={isSelected ? "#FFFFFF" : isHovered ? "#AADDFF" : color}
            transparent
            opacity={isSelected ? 0.90 : isHovered ? 0.72 : alpha * 0.68}
            side={THREE.BackSide}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Fill plate */}
      <mesh
        onPointerEnter={onEnter}
        onPointerLeave={onLeave}
        onClick={onClick}
      >
        <boxGeometry args={[w, planH, d]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={alpha * (isSelected ? 0.55 : 0.28)}
          depthWrite={false}
        />
      </mesh>

      {/* Expanded invisible hit area — easier to click flat plates */}
      <mesh onPointerEnter={onEnter} onPointerLeave={onLeave} onClick={onClick}>
        <boxGeometry args={[w + 0.20, planH + 0.80, d + 0.20]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Label: unit number + status text */}
      {alpha > 0.12 && (
        <Html
          position={[0, planH / 2 + 0.36, 0]}
          center
          distanceFactor={12}
          style={{ pointerEvents: "none", userSelect: "none" }}
          zIndexRange={[10, 20]}
        >
          <div style={{
            fontFamily: "var(--font-heebo, sans-serif)",
            whiteSpace: "nowrap",
            textAlign: "center",
            background: isSelected
              ? "rgba(255,255,255,0.94)"
              : "rgba(0,0,0,0.52)",
            border: isSelected ? `1.5px solid ${color}` : "none",
            color: isSelected ? "#123F40" : "#FFFFFF",
            padding: "2px 7px",
            borderRadius: 4,
            boxShadow: isSelected ? `0 0 8px ${color}66` : "none",
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.02em" }}>
              {unit.unitNumber}
            </div>
            {statusLabel && (
              <div style={{ fontSize: 9, fontWeight: 500, marginTop: 1, opacity: 0.82 }}>
                {statusLabel}
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

// ── Unit dollhouse view (Phase 3) ─────────────────────────────────────────────
// Replaces the selected unit block with a floor-plan plane + low perimeter walls.
function UnitDollhouseView({
  position,
  size,
  floorPlanUrl,
}: {
  position: [number, number, number];
  size: [number, number, number];
  floorPlanUrl: string | null;
}) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!floorPlanUrl) return;
    const loader = new THREE.TextureLoader();
    const tex = loader.load(floorPlanUrl, (t) => setTexture(t));
    return () => { tex.dispose(); setTexture(null); };
  }, [floorPlanUrl]);

  const [w, , d] = size;
  const wallH = 1.0;
  const wallThick = 0.12;
  const wallColor = "#C8D4DC";

  // Dollhouse floor sits at the bottom face of where the unit block was
  const baseY = position[1] - size[1] / 2;

  return (
    <group position={[position[0], baseY, position[2]]}>
      {/* Floor plane with floor plan texture */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <planeGeometry args={[w, d]} />
        <meshBasicMaterial
          map={texture ?? undefined}
          color={texture ? "#FFFFFF" : "#1A2E40"}
          transparent
          opacity={0.95}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Front wall (-Z) */}
      <mesh position={[0, wallH / 2, -d / 2]}>
        <boxGeometry args={[w + wallThick, wallH, wallThick]} />
        <meshBasicMaterial color={wallColor} transparent opacity={0.72} />
      </mesh>
      {/* Back wall (+Z) */}
      <mesh position={[0, wallH / 2, d / 2]}>
        <boxGeometry args={[w + wallThick, wallH, wallThick]} />
        <meshBasicMaterial color={wallColor} transparent opacity={0.72} />
      </mesh>
      {/* Left wall (-X) */}
      <mesh position={[-w / 2, wallH / 2, 0]}>
        <boxGeometry args={[wallThick, wallH, d]} />
        <meshBasicMaterial color={wallColor} transparent opacity={0.72} />
      </mesh>
      {/* Right wall (+X) */}
      <mesh position={[w / 2, wallH / 2, 0]}>
        <boxGeometry args={[wallThick, wallH, d]} />
        <meshBasicMaterial color={wallColor} transparent opacity={0.72} />
      </mesh>

      {/* Loading indicator when floor plan URL exists but texture not yet loaded */}
      {!texture && floorPlanUrl && (
        <Html position={[0, 0.5, 0]} center distanceFactor={12} style={{ pointerEvents: "none" }}>
          <div style={{
            color: "#7A9DB8",
            fontSize: 11,
            fontWeight: 600,
            fontFamily: "var(--font-heebo, sans-serif)",
            background: "rgba(14,28,40,0.75)",
            padding: "3px 8px",
            borderRadius: 4,
            whiteSpace: "nowrap",
          }}>
            …
          </div>
        </Html>
      )}
    </group>
  );
}

// ── Floor open view (Stage 3) ─────────────────────────────────────────────────
// Flat floor-plan explosion: unit plates sit at the actual floor level.
function FloorOpenView({
  floor,
  scale,
  selectedUnitId,
  hoveredUnitId,
  floorPlanUrl,
  statusLabels,
  onUnitEnter,
  onUnitLeave,
  onUnitClick,
}: {
  floor: FloorMeta;
  scale: number;
  selectedUnitId: string | null;
  hoveredUnitId: string | null;
  floorPlanUrl: string | null;
  statusLabels: StatusLabels;
  onUnitEnter: (unitId: string) => void;
  onUnitLeave: () => void;
  onUnitClick: (unitId: string) => void;
}) {
  const layout = useMemo(
    () => computeFloorLayout(floor, scale),
    [floor, scale],
  );
  if (layout.length === 0) return null;

  const floorW = floor.width * scale;
  const floorD = floor.depth * scale;
  const baseY  = floor.baseY * scale;

  return (
    <group>
      {/* Thin floor slab highlight at actual floor level */}
      <mesh
        position={[floor.centerX * scale, baseY + 0.02, floor.centerZ * scale]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[floorW * 0.92, floorD * 0.92]} />
        <meshBasicMaterial color="#4488CC" transparent opacity={0.25} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      {/* "Sample layout" badge */}
      {statusLabels.sampleLayout && (
        <Html
          position={[floor.centerX * scale, baseY + 0.5, floor.centerZ * scale - floorD * 0.5 - 0.3]}
          center
          distanceFactor={12}
          style={{ pointerEvents: "none", userSelect: "none" }}
          zIndexRange={[6, 10]}
        >
          <div style={{
            fontFamily: "var(--font-heebo, sans-serif)",
            fontSize: 10,
            fontWeight: 600,
            color: "var(--qp-status-available)",
            background: "rgba(0,0,0,0.55)",
            border: "1px solid rgba(68,120,180,0.35)",
            padding: "2px 8px",
            borderRadius: 10,
            whiteSpace: "nowrap",
            letterSpacing: "0.04em",
          }}>
            {statusLabels.sampleLayout}
          </div>
        </Html>
      )}

      {/* Flat floor-plan unit plates */}
      {layout.map(({ unit, position, size }) => {
        const color = statusHex(unit.status);

        const isThisSelected = unit.id === selectedUnitId;
        const isDimmed = selectedUnitId !== null && !isThisSelected;
        const sl = getStatusLabel(unit.status, statusLabels);

        // Selected unit with a floor plan: show dollhouse
        if (isThisSelected && floorPlanUrl) {
          return (
            <UnitDollhouseView
              key={unit.id}
              position={position}
              size={size}
              floorPlanUrl={floorPlanUrl}
            />
          );
        }

        return (
          <UnitBlock
            key={unit.id}
            unit={unit}
            position={position}
            size={size}
            color={color}
            opacity={isDimmed ? 0.18 : 0.92}
            isSelected={isThisSelected}
            isHovered={unit.id === hoveredUnitId && !isDimmed}
            statusLabel={sl}
            onEnter={(e: any) => { e.stopPropagation(); onUnitEnter(unit.id); }}
            onLeave={(e: any) => { e.stopPropagation(); onUnitLeave(); }}
            onClick={(e: any) => { e.stopPropagation(); onUnitClick(unit.id); }}
          />
        );
      })}
    </group>
  );
}

// ── Scene content — needs useThree / useFrame ─────────────────────────────────
function SceneContent({
  glbUrl,
  enrichedMeta,
  selectedFloor,
  selectedUnitId,
  hoveredUnitId,
  floorPlanUrl,
  statusLabels,
  maxHeight,
  sceneWidth,
  isMobile,
  onHover,
  onFloorClick,
  onUnitClick,
  onUnitHover,
}: {
  glbUrl: string;
  enrichedMeta: SceneMeta;
  selectedFloor: FloorSelection | null;
  selectedUnitId: string | null;
  hoveredUnitId: string | null;
  floorPlanUrl: string | null;
  statusLabels: StatusLabels;
  maxHeight: number;
  sceneWidth: number;
  isMobile: boolean;
  onHover: (info: HoverInfo | null, id: string | null) => void;
  onFloorClick: (buildingId: string, floor: number) => void;
  onUnitClick: (unitId: string) => void;
  onUnitHover: (unitId: string | null) => void;
}) {
  const { camera } = useThree();
  const orbitRef = useRef<any>(null);
  const [quality, setQuality] = useState<"high" | "low">("high");
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const scale = 1.0;

  // ── Clip plane (reveals floor at actual Y position) ──
  // THREE.Plane(normal (0,-1,0), constant K): clips points where -y+K < 0, i.e. y > K.
  // K = large ⟹ nothing clipped; K = topY ⟹ everything above floor ceiling clipped.
  const clipPlaneRef  = useRef(new THREE.Plane(new THREE.Vector3(0, -1, 0), 9999));
  const targetClipY   = useRef(9999);
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // ── Initial camera setup ──
  useEffect(() => {
    const dist = Math.max(sceneWidth * 0.82, maxHeight * 2.2);
    const cam = camera as THREE.PerspectiveCamera;
    cam.fov = 48;
    cam.near = 0.5;
    cam.far = 1500;
    cam.updateProjectionMatrix();
    camera.position.set(sceneWidth * 0.06, 3.5, -dist);
    camera.lookAt(0, maxHeight * 0.62, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Camera + clip animation targets ──
  const camTarget = useRef<{
    pos: THREE.Vector3;
    lookAt: THREE.Vector3;
    active: boolean;
  }>({ pos: new THREE.Vector3(), lookAt: new THREE.Vector3(), active: false });

  useEffect(() => {
    if (selectedFloor) {
      const mb = enrichedMeta.buildings.find((b) => b.id === selectedFloor.buildingId);
      const fl = mb?.floors.find((f) => f.floor === selectedFloor.floor);
      if (mb && fl) {
        const baseY = fl.baseY * scale;
        const topY  = fl.topY  * scale;
        const flW   = fl.width  * scale;
        const flD   = fl.depth  * scale;
        // Oblique view looking at actual floor — ~65° elevation angle
        const pullH = Math.max(flW * 1.1, flD * 1.4, 12);
        const pullZ = Math.max(flW * 0.40, flD * 0.55, 5);
        camTarget.current = {
          pos: new THREE.Vector3(
            fl.centerX * scale,
            topY + pullH,
            fl.centerZ * scale - pullZ,
          ),
          lookAt: new THREE.Vector3(fl.centerX * scale, baseY, fl.centerZ * scale),
          active: true,
        };
        // Animate clip plane down to floor ceiling
        targetClipY.current = topY;
        if (reducedMotion.current) clipPlaneRef.current.constant = topY;
      }
    } else {
      // Back to full building view
      const dist = Math.max(sceneWidth * 0.82, maxHeight * 2.2);
      camTarget.current = {
        pos: new THREE.Vector3(sceneWidth * 0.06, 3.5, -dist),
        lookAt: new THREE.Vector3(0, maxHeight * 0.32, 0),
        active: true,
      };
      // Snap clip plane back immediately on deselect
      targetClipY.current = 9999;
      clipPlaneRef.current.constant = 9999;
    }
  }, [selectedUnitId, selectedFloor, enrichedMeta, maxHeight, sceneWidth, scale]);

  useFrame(() => {
    // Camera lerp
    if (camTarget.current.active) {
      const FACTOR = reducedMotion.current ? 1.0 : 0.075;
      camera.position.lerp(camTarget.current.pos, FACTOR);
      orbitRef.current?.target.lerp(camTarget.current.lookAt, FACTOR);
      orbitRef.current?.update();
      if (camera.position.distanceTo(camTarget.current.pos) < 0.22) {
        camera.position.copy(camTarget.current.pos);
        orbitRef.current?.target.copy(camTarget.current.lookAt);
        orbitRef.current?.update();
        camTarget.current.active = false;
      }
    }
    // Clip plane lerp — ~800ms at 60fps with factor 0.09
    if (selectedFloor) {
      const CLIP_FACTOR = reducedMotion.current ? 1.0 : 0.09;
      clipPlaneRef.current.constant = THREE.MathUtils.lerp(
        clipPlaneRef.current.constant,
        targetClipY.current,
        CLIP_FACTOR,
      );
    }
  });

  // ── Hover callbacks ──
  const handleFloorHover = useCallback(
    (info: HoverInfo, key: string) => {
      setHoveredKey(key);
      onHover(info, key);
    },
    [onHover],
  );

  const handleFloorUnhover = useCallback(() => {
    setHoveredKey(null);
    onHover(null, null);
  }, [onHover]);

  const handleUnitEnter = useCallback(
    (unitId: string) => { onUnitHover(unitId); },
    [onUnitHover],
  );

  const handleUnitLeave = useCallback(() => { onUnitHover(null); }, [onUnitHover]);

  const handleUnitClick = useCallback(
    (unitId: string) => { onUnitClick(unitId); },
    [onUnitClick],
  );

  return (
    <>
      <PerformanceMonitor
        onDecline={() => setQuality("low")}
        onIncline={() => setQuality("high")}
      />

      {/* Baked GLB geometry — fades + clips above selected floor ceiling */}
      <BakedModel
        url={glbUrl}
        opacity={selectedFloor ? 0.35 : 1.0}
        clipPlane={selectedFloor ? clipPlaneRef.current : null}
      />

      {/* Per-building, per-floor: hit boxes + status overlays + floor open view */}
      {enrichedMeta.buildings.map((mb) =>
        mb.floors.map((fl) => {
          const key = `${mb.id}-${fl.floor}`;
          const isSelectedFloor =
            selectedFloor?.buildingId === mb.id &&
            selectedFloor?.floor === fl.floor;

          return (
            <group key={key}>
              {/* Floor hit box — only when NOT in floor-view mode */}
              {!selectedFloor && !fl.isLobby && (
                <FloorHitBox
                  floor={fl}
                  buildingName={mb.name}
                  scale={scale}
                  isHovered={hoveredKey === key}
                  onHover={(info) => handleFloorHover(info, key)}
                  onUnhover={handleFloorUnhover}
                  onClick={() => onFloorClick(mb.id, fl.floor)}
                />
              )}

              {/* Status overlay — always shown (real-time, not baked) */}
              <StatusOverlay floor={fl} scale={scale} />

              {/* Unit blocks / dollhouse for the selected floor */}
              {isSelectedFloor && (
                <FloorOpenView
                  floor={fl}
                  scale={scale}
                  selectedUnitId={selectedUnitId}
                  hoveredUnitId={hoveredUnitId}
                  floorPlanUrl={floorPlanUrl}
                  statusLabels={statusLabels}
                  onUnitEnter={handleUnitEnter}
                  onUnitLeave={handleUnitLeave}
                  onUnitClick={handleUnitClick}
                />
              )}
            </group>
          );
        }),
      )}

      {/* HDRI for reflections only — sky handled by <Sky> below */}
      <Environment files="/hdri/potsdamer_platz_1k.hdr" background={false} />

      {/* Procedural sky */}
      <Sky
        sunPosition={[-0.55, 0.055, -1]}
        turbidity={7}
        rayleigh={3.8}
        mieCoefficient={0.005}
        mieDirectionalG={0.85}
        distance={450}
      />

      {/* Horizon fog */}
      <fog attach="fog" args={["#C8D8F0", Math.max(sceneWidth * 0.82, maxHeight * 2.2) * 2.2, Math.max(sceneWidth * 0.82, maxHeight * 2.2) * 5.5]} />

      {/* Shared environment: lights (subtle fill), ground, trees, N8AO, vignette */}
      <BuildingEnvironment
        maxHeight={maxHeight}
        dist={Math.max(sceneWidth * 0.82, maxHeight * 2.2)}
        quality={quality}
        isMobile={isMobile}
        lightIntensity={0.18}
      />

      <OrbitControls
        ref={orbitRef}
        makeDefault
        minPolarAngle={Math.PI * 0.05}
        maxPolarAngle={Math.PI * 0.55}
        minDistance={5}
        maxDistance={maxHeight * 6}
        target={[0, maxHeight * 0.32, 0]}
        enableDamping
        dampingFactor={0.08}
      />
    </>
  );
}

// ── Exported wrapper ──────────────────────────────────────────────────────────
export default function BuildingGLBScene({
  glbUrl,
  metaUrl,
  buildings,
  activeUnitTypeId,
  selectedFloor,
  selectedUnitId,
  hoveredUnitId,
  floorPlanUrl,
  statusLabels,
  onHover,
  onFloorClick,
  onUnitClick,
  onUnitHover,
}: {
  glbUrl: string;
  metaUrl: string;
  buildings: ExplorerBuilding[];
  activeUnitTypeId: string;
  selectedFloor: FloorSelection | null;
  selectedUnitId: string | null;
  hoveredUnitId: string | null;
  floorPlanUrl: string | null;
  statusLabels: StatusLabels;
  onHover: (info: HoverInfo | null, id: string | null) => void;
  onFloorClick: (buildingId: string, floor: number) => void;
  onUnitClick: (unitId: string) => void;
  onUnitHover: (unitId: string | null) => void;
}) {
  const [meta,     setMeta]     = useState<SceneMeta | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(window.matchMedia("(max-width: 767px)").matches);
  }, []);

  useEffect(() => {
    fetch(metaUrl)
      .then((r) => r.json())
      .then(setMeta)
      .catch((e) => console.error("Failed to load building meta:", e));
  }, [metaUrl]);

  // Merge meta floors with live unit statuses from DB
  const enrichedMeta = useMemo((): SceneMeta | null => {
    if (!meta) return null;
    const statusMap = new Map<string, string>();
    for (const b of buildings) {
      for (const u of b.units) {
        statusMap.set(u.id, u.status);
      }
    }
    return {
      ...meta,
      buildings: meta.buildings.map((mb) => ({
        ...mb,
        floors: mb.floors.map((fl) => ({
          ...fl,
          units: fl.units.map((u) => ({
            ...u,
            status: statusMap.get(u.id) ?? u.status,
          })),
        })),
      })),
    };
  }, [meta, buildings]);

  if (!enrichedMeta) {
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--qp-muted)" }}>
        Loading 3D model…
      </div>
    );
  }

  const maxHeight = Math.max(
    ...enrichedMeta.buildings.flatMap((b) => b.floors.map((f) => f.topY)),
    20,
  );
  const sceneWidth =
    Math.max(
      ...enrichedMeta.buildings.map(
        (b) => Math.abs(b.worldX) + (b.floors[0]?.width ?? 0) / 2,
      ),
      30,
    ) * 2;

  return (
    <Canvas
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 0.9,
        outputColorSpace: THREE.SRGBColorSpace,
        alpha: false,
        stencil: false,
        depth: true,
      }}
      onCreated={({ gl }) => { gl.localClippingEnabled = true; }}
      dpr={[1, isMobile ? 1.2 : 2]}
      style={{ width: "100%", height: "100%" }}
    >
      <SceneContent
        glbUrl={glbUrl}
        enrichedMeta={enrichedMeta}
        selectedFloor={selectedFloor}
        selectedUnitId={selectedUnitId}
        hoveredUnitId={hoveredUnitId}
        floorPlanUrl={floorPlanUrl}
        statusLabels={statusLabels}
        maxHeight={maxHeight}
        sceneWidth={sceneWidth}
        isMobile={isMobile}
        onHover={onHover}
        onFloorClick={onFloorClick}
        onUnitClick={onUnitClick}
        onUnitHover={onUnitHover}
      />
    </Canvas>
  );
}
