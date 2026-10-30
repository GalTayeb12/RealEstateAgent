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

import { Html, useGLTF, ContactShadows, Environment, OrbitControls, PerformanceMonitor } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import type { ExplorerBuilding, FloorSelection, HoverInfo } from "./types";

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
  roofTopY: number,
  useActualHeight = false,
): UnitLayout[] {
  const units = [...floor.units].sort((a, b) => a.positionIndex - b.positionIndex);
  const N = units.length;
  if (N === 0) return [];

  const floorW = floor.width * scale;
  const floorD = floor.depth * scale;
  const unitH = 3.0;
  // When useActualHeight: place units at real floor position (inside building)
  // Otherwise: float above roofline so they're always visible
  const floatY = useActualHeight ? floor.baseY * scale : roofTopY + 2.0;

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
function BakedModel({ url, opacity = 1.0 }: { url: string; opacity?: number }) {
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
          // Always make transparent if fading building; otherwise respect material's own alpha
          const shouldBeTransparent = forceTransparent || m.opacity < 0.999;
          if (m.transparent !== shouldBeTransparent || Math.abs(m.opacity - (forceTransparent ? opacity : m.opacity)) > 0.001) {
            m.transparent = shouldBeTransparent;
            if (forceTransparent) m.opacity = opacity;
            m.needsUpdate = true;
          }
        }
      }
    });
  }, [cloned, opacity]);

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

// ── Unit block (Phase 2) ──────────────────────────────────────────────────────
function UnitBlock({
  unit,
  position,
  size,
  color,
  opacity,
  isSelected,
  isHovered,
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
  onEnter: (e: THREE.Event) => void;
  onLeave: (e: THREE.Event) => void;
  onClick: (e: THREE.Event) => void;
}) {
  const alpha = opacity ?? 0.92;
  return (
    <group position={position}>
      {/* Main unit box — meshBasicMaterial works reliably in software WebGL */}
      <mesh
        onPointerEnter={onEnter}
        onPointerLeave={onLeave}
        onClick={onClick}
      >
        <boxGeometry args={size} />
        <meshBasicMaterial color={color} transparent opacity={alpha} />
      </mesh>

      {/* Glow outline when selected or hovered */}
      {(isSelected || isHovered) && (
        <mesh>
          <boxGeometry args={[size[0] + 0.14, size[1] + 0.14, size[2] + 0.14]} />
          <meshBasicMaterial
            color={isSelected ? "#FFFFFF" : "#88DDFF"}
            transparent
            opacity={isSelected ? 0.45 : 0.28}
            side={THREE.BackSide}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Unit number label — floats above the block, always faces camera */}
      {alpha > 0.3 && (
        <Html
          position={[0, size[1] / 2 + 0.3, 0]}
          center
          distanceFactor={12}
          style={{ pointerEvents: "none", userSelect: "none" }}
          zIndexRange={[10, 20]}
        >
          <div style={{
            color: "#FFFFFF",
            fontSize: 13,
            fontWeight: 700,
            fontFamily: "var(--font-inter, ui-sans-serif, sans-serif)",
            textShadow: "0 1px 4px rgba(0,0,0,0.95), 0 0 10px rgba(0,0,0,0.7)",
            whiteSpace: "nowrap",
            letterSpacing: "0.02em",
            background: "rgba(0,0,0,0.45)",
            padding: "1px 5px",
            borderRadius: 3,
          }}>
            {unit.unitNumber}
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

      {/* Placeholder when no floor plan loaded yet */}
      {!texture && (
        <Html position={[0, 0.5, 0]} center distanceFactor={12} style={{ pointerEvents: "none" }}>
          <div style={{
            color: "#7A9DB8",
            fontSize: 11,
            fontWeight: 600,
            fontFamily: "var(--font-inter, ui-sans-serif, sans-serif)",
            textAlign: "center",
            background: "rgba(14,28,40,0.75)",
            padding: "3px 8px",
            borderRadius: 4,
            whiteSpace: "nowrap",
          }}>
            {floorPlanUrl ? "…" : "תוכנית הדירה תעלה בקרוב"}
          </div>
        </Html>
      )}
    </group>
  );
}

// ── Floor open view (Phase 2 + 3) ─────────────────────────────────────────────
// Units float ABOVE the building's roofline so they're always visible from the
// aerial camera regardless of which floor is selected.
function FloorOpenView({
  floor,
  scale,
  roofTopY,
  selectedUnitId,
  hoveredUnitId,
  floorPlanUrl,
  onUnitEnter,
  onUnitLeave,
  onUnitClick,
}: {
  floor: FloorMeta;
  scale: number;
  roofTopY: number;
  selectedUnitId: string | null;
  hoveredUnitId: string | null;
  floorPlanUrl: string | null;
  onUnitEnter: (unitId: string) => void;
  onUnitLeave: () => void;
  onUnitClick: (unitId: string) => void;
}) {
  // Use actual floor height when a specific unit is selected (building fades to transparent)
  const layout = useMemo(
    () => computeFloorLayout(floor, scale, roofTopY, selectedUnitId !== null),
    [floor, scale, roofTopY, selectedUnitId],
  );
  if (layout.length === 0) return null;

  const floorW = floor.width * scale;
  const floorD = floor.depth * scale;

  return (
    <group>
      {/* Thin floor slab highlight at actual floor level */}
      <mesh
        position={[floor.centerX * scale, floor.topY * scale + 0.05, floor.centerZ * scale]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[floorW * 0.92, floorD * 0.92]} />
        <meshBasicMaterial color="#4488CC" transparent opacity={0.25} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      {/* Unit blocks / dollhouse views */}
      {layout.map(({ unit, position, size }) => {
        const color =
          unit.status === "sold" ? "#5A6878" :
          unit.status === "reserved" ? "#B08A30" :
          "#2E6E9A";

        const isThisSelected = unit.id === selectedUnitId;
        // Dim siblings when a unit is selected
        const isDimmed = selectedUnitId !== null && !isThisSelected;

        if (isThisSelected) {
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
            opacity={isDimmed ? 0.22 : 0.92}
            isSelected={false}
            isHovered={unit.id === hoveredUnitId && !isDimmed}
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
  maxHeight,
  sceneWidth,
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
  maxHeight: number;
  sceneWidth: number;
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

  // ── Camera animation target ──
  const camTarget = useRef<{
    pos: THREE.Vector3;
    lookAt: THREE.Vector3;
    active: boolean;
  }>({ pos: new THREE.Vector3(), lookAt: new THREE.Vector3(), active: false });

  useEffect(() => {
    if (selectedUnitId && selectedFloor) {
      // Phase 3: zoom into the selected unit (dollhouse view at actual floor height)
      const mb = enrichedMeta.buildings.find((b) => b.id === selectedFloor.buildingId);
      const fl = mb?.floors.find((f) => f.floor === selectedFloor.floor);
      if (mb && fl) {
        const layout = computeFloorLayout(fl, scale, maxHeight * scale, true);
        const entry = layout.find((l) => l.unit.id === selectedUnitId);
        if (entry) {
          const [ux, uy, uz] = entry.position;
          const [uw, , ud] = entry.size;
          // Aerial diagonal pulled back enough to see the dollhouse at actual floor level
          const pullH = Math.max(uw * 2.0, ud * 2.5, 12);
          const pullZ = Math.max(uw * 1.4, ud * 1.8, 10);
          camTarget.current = {
            pos: new THREE.Vector3(ux, uy + pullH, uz - pullZ),
            lookAt: new THREE.Vector3(ux, uy, uz),
            active: true,
          };
        }
      }
    } else if (selectedFloor) {
      // Phase 2: aerial view of floating unit grid
      const mb = enrichedMeta.buildings.find((b) => b.id === selectedFloor.buildingId);
      const fl = mb?.floors.find((f) => f.floor === selectedFloor.floor);
      if (mb && fl) {
        const flW = fl.width * scale;
        const flD = fl.depth * scale;
        const roofTopY = maxHeight * scale;
        const floatY = roofTopY + 2.0 + 1.5; // center of floating units
        const pullH = Math.max(flW * 0.8, flD * 1.2, 12);
        const pullZ = Math.max(flW * 0.7, flD * 1.0, 10);
        camTarget.current = {
          pos: new THREE.Vector3(
            fl.centerX * scale,
            floatY + pullH,
            fl.centerZ * scale - pullZ,
          ),
          lookAt: new THREE.Vector3(fl.centerX * scale, floatY, fl.centerZ * scale),
          active: true,
        };
      }
    } else {
      // Back to full building view
      const dist = Math.max(sceneWidth * 0.82, maxHeight * 2.2);
      camTarget.current = {
        pos: new THREE.Vector3(sceneWidth * 0.06, 3.5, -dist),
        lookAt: new THREE.Vector3(0, maxHeight * 0.32, 0),
        active: true,
      };
    }
  }, [selectedUnitId, selectedFloor, enrichedMeta, maxHeight, sceneWidth, scale]);

  useFrame(() => {
    if (!camTarget.current.active) return;
    const FACTOR = 0.075;
    camera.position.lerp(camTarget.current.pos, FACTOR);
    orbitRef.current?.target.lerp(camTarget.current.lookAt, FACTOR);
    orbitRef.current?.update();
    if (camera.position.distanceTo(camTarget.current.pos) < 0.22) {
      camera.position.copy(camTarget.current.pos);
      orbitRef.current?.target.copy(camTarget.current.lookAt);
      orbitRef.current?.update();
      camTarget.current.active = false;
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

      {/* Baked GLB geometry — fades to let unit/floor view show through */}
      <BakedModel
        url={glbUrl}
        opacity={selectedUnitId ? 0.15 : selectedFloor ? 0.35 : 1.0}
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
                  roofTopY={maxHeight * scale}
                  selectedUnitId={selectedUnitId}
                  hoveredUnitId={hoveredUnitId}
                  floorPlanUrl={floorPlanUrl}
                  onUnitEnter={handleUnitEnter}
                  onUnitLeave={handleUnitLeave}
                  onUnitClick={handleUnitClick}
                />
              )}
            </group>
          );
        }),
      )}

      {/* Ground shadow */}
      <ContactShadows
        position={[0, -0.01, 0]}
        width={Math.max(60, maxHeight * 3)}
        height={Math.max(60, maxHeight * 3)}
        blur={2.5}
        far={maxHeight * 1.5}
        opacity={0.5}
        frames={1}
      />

      <Environment preset="city" background />

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

      {quality === "high" && (
        <EffectComposer>
          <Bloom luminanceThreshold={0.85} luminanceSmoothing={0.9} intensity={0.4} />
          <Vignette eskil={false} offset={0.3} darkness={0.7} />
        </EffectComposer>
      )}
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
  onHover: (info: HoverInfo | null, id: string | null) => void;
  onFloorClick: (buildingId: string, floor: number) => void;
  onUnitClick: (unitId: string) => void;
  onUnitHover: (unitId: string | null) => void;
}) {
  const [meta, setMeta] = useState<SceneMeta | null>(null);

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
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#647888" }}>
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
        toneMappingExposure: 1.1,
        outputColorSpace: THREE.SRGBColorSpace,
        // alpha sorting needed for the glass material's depth ordering
        alpha: false,
        stencil: false,
        depth: true,
      }}
      dpr={[1, 2]}
      style={{ width: "100%", height: "100%" }}
    >
      <SceneContent
        glbUrl={glbUrl}
        enrichedMeta={enrichedMeta}
        selectedFloor={selectedFloor}
        selectedUnitId={selectedUnitId}
        hoveredUnitId={hoveredUnitId}
        floorPlanUrl={floorPlanUrl}
        maxHeight={maxHeight}
        sceneWidth={sceneWidth}
        onHover={onHover}
        onFloorClick={onFloorClick}
        onUnitClick={onUnitClick}
        onUnitHover={onUnitHover}
      />
    </Canvas>
  );
}
