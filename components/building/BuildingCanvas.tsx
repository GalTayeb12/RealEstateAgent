"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  PerformanceMonitor,
  Sky,
} from "@react-three/drei";
import { TOUCH } from "three";
import * as THREE from "three";
import { useRef, useMemo, useState, useCallback, useEffect } from "react";
import { layoutTowers } from "./layout";
import { BuildingEnvironment } from "./BuildingEnvironment";
import type { ExplorerBuilding, HoverInfo } from "./types";
import type { TowerLayout, FloorLayout } from "./layout";

// ─── Geometry constants ───────────────────────────────────────────────────────
const DEPTH    = 1.18;   // building front-to-back depth
const SHELL_T  = 0.088;  // concrete wall thickness
const SLAB_H   = 0.048;  // floor-slab band height
const SLAB_OVR = 0.058;  // slab overhang
const MULL_W   = 0.024;  // vertical mullion width
const MULL_D   = 0.028;  // vertical mullion depth
const BAL_D    = 0.30;   // balcony depth (increased from 0.22)
const BAL_T    = 0.034;  // balcony slab thickness

// ─── Material colours ─────────────────────────────────────────────────────────
const C_SHELL   = "#C0BCA8"; // facade body — warm concrete
const C_SLAB    = "#EDE9E0"; // slab edge band — bright cream
const C_MULL    = "#888480"; // aluminium mullion
const C_ROOF    = "#1B4240"; // parapet / roof cap
const C_GOLD    = "#756039"; // luxury accent

// ─── Floor analysis ───────────────────────────────────────────────────────────
function floorAvail(floor: FloorLayout) {
  const total = floor.units.length;
  const avail = floor.units.filter((u) => u.status === "available").length;
  return { avail, total };
}
function topResidentialFloor(floors: FloorLayout[]) {
  const res = floors.filter((f) => !f.lobby);
  return res.length > 0 ? Math.max(...res.map((f) => f.floor)) : 0;
}

// ─── Camera fly-in ────────────────────────────────────────────────────────────
function CameraFlyIn({
  from, to, lookAt, onDone,
}: {
  from: THREE.Vector3; to: THREE.Vector3; lookAt: THREE.Vector3; onDone: () => void;
}) {
  const prog = useRef(0);
  const done = useRef(false);
  const { camera } = useThree();

  useEffect(() => {
    camera.position.copy(from);
    camera.lookAt(lookAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((_, dt) => {
    if (done.current) return;
    prog.current = Math.min(1, prog.current + dt * 0.42);
    const t = 1 - Math.pow(1 - prog.current, 3);
    camera.position.lerpVectors(from, to, t);
    camera.lookAt(lookAt);
    if (prog.current >= 1) { done.current = true; onDone(); }
  });

  return null;
}

// ─── Single floor ─────────────────────────────────────────────────────────────
interface FloorProps {
  floor: FloorLayout;
  floors: FloorLayout[];
  cx: number;
  hovered: boolean;
  quality: "high" | "low";
  onEnter: () => void;
  onLeave: () => void;
}

function LuxuryFloor({ floor, floors, cx, hovered, quality, onEnter, onLeave }: FloorProps) {
  const { y, h, w, lobby } = floor;
  const cy  = y + h / 2;
  const faceZ = DEPTH / 2 + 0.002;

  const topFloor    = topResidentialFloor(floors);
  const penthouse   = !lobby && floor.floor === topFloor;
  const { avail, total } = floorAvail(floor);
  const allSold     = !lobby && total > 0 && avail === 0;

  // Balcony on every residential floor (removed the even-floor restriction)
  const withBalcony = !lobby && !penthouse && quality === "high";

  // Setback: upper 28 % step back slightly
  const setback =
    !lobby && topFloor > 0 && floor.floor >= Math.ceil(topFloor * 0.72)
      ? penthouse ? 0.86 : 0.93
      : 1.0;
  const fw = w * setback;

  // Glass tint and emissive
  const glassColor   = lobby ? "#0A2030" : allSold ? "#181E2C" : "#0A2030";
  const glassOpacity = lobby ? 0.72 : allSold ? 0.88 : 0.92;
  const glassEmissive = useMemo(
    () => new THREE.Color(lobby ? "#B06020" : hovered ? "#1040A0" : "#000000"),
    [lobby, hovered],
  );
  const glassEmissiveInt = lobby ? 0.45 : hovered ? 0.38 : 0;

  const divisions = Math.max(2, floor.units.length);

  // Warm interior-light colour — random per window based on floor + index
  const windowLit = useCallback(
    (i: number) => !lobby && !allSold && (floor.floor * 3 + i * 7) % 5 !== 0,
    [lobby, allSold, floor.floor],
  );

  return (
    <group>
      {/* ── Concrete back ── */}
      <mesh position={[cx, cy, -(DEPTH / 2) + SHELL_T / 2]} receiveShadow>
        <boxGeometry args={[fw, h, SHELL_T]} />
        <meshStandardMaterial color={C_SHELL} roughness={0.78} />
      </mesh>

      {/* ── Concrete sides ── */}
      <mesh position={[cx - fw / 2 + SHELL_T / 2, cy, 0]} receiveShadow>
        <boxGeometry args={[SHELL_T, h, DEPTH]} />
        <meshStandardMaterial color={C_SHELL} roughness={0.78} />
      </mesh>
      <mesh position={[cx + fw / 2 - SHELL_T / 2, cy, 0]} receiveShadow>
        <boxGeometry args={[SHELL_T, h, DEPTH]} />
        <meshStandardMaterial color={C_SHELL} roughness={0.78} />
      </mesh>

      {/* ── Slab edge band ── */}
      <mesh position={[cx, y + SLAB_H / 2, 0]} receiveShadow>
        <boxGeometry args={[fw + SLAB_OVR * 2, SLAB_H, DEPTH + SLAB_OVR]} />
        <meshStandardMaterial color={C_SLAB} roughness={0.55} metalness={0.05} />
      </mesh>

      {/* ── Glass curtain wall ── */}
      <mesh position={[cx, cy + SLAB_H * 0.5, faceZ]} castShadow>
        <boxGeometry args={[fw - SHELL_T * 2, h - SLAB_H * 1.5, 0.026]} />
        <meshPhysicalMaterial
          color={glassColor}
          transparent
          opacity={glassOpacity}
          metalness={0.22}
          roughness={0.04}
          envMapIntensity={2.8}
          reflectivity={0.96}
          emissive={glassEmissive}
          emissiveIntensity={glassEmissiveInt}
          side={THREE.FrontSide}
        />
      </mesh>

      {/* ── Interior window glow (warm light behind glass) ── */}
      {!lobby && quality === "high" &&
        Array.from({ length: divisions }, (_, i) => {
          if (!windowLit(i)) return null;
          const slot = (fw - SHELL_T * 2) / divisions;
          const wx = cx - fw / 2 + SHELL_T + slot * (i + 0.5);
          const alpha = 0.055 + 0.04 * ((floor.floor * 7 + i * 13) % 5) / 4;
          return (
            <mesh key={i} position={[wx, cy + SLAB_H * 0.4, faceZ - 0.005]}>
              <planeGeometry args={[slot * 0.72, (h - SLAB_H * 2) * 0.68]} />
              <meshBasicMaterial
                color="#FFD880"
                transparent
                opacity={alpha}
                depthWrite={false}
              />
            </mesh>
          );
        })}

      {/* ── Vertical mullions ── */}
      {!lobby && quality === "high" &&
        Array.from({ length: divisions - 1 }, (_, i) => {
          const slot = (fw - SHELL_T * 2) / divisions;
          const mx = cx - fw / 2 + SHELL_T + slot * (i + 1);
          return (
            <mesh key={i} position={[mx, cy, faceZ + 0.014]}>
              <boxGeometry args={[MULL_W, h * 0.93, MULL_D]} />
              <meshStandardMaterial color={C_MULL} metalness={0.54} roughness={0.28} />
            </mesh>
          );
        })}

      {/* ── Penthouse top accent ── */}
      {penthouse && (
        <>
          <mesh position={[cx, y + h - 0.008, faceZ - 0.005]}>
            <boxGeometry args={[fw + 0.04, 0.040, 0.060]} />
            <meshStandardMaterial color={C_GOLD} metalness={0.90} roughness={0.13} />
          </mesh>
          <mesh position={[cx - fw / 2 - 0.01, cy, faceZ - DEPTH * 0.1]}>
            <boxGeometry args={[0.022, h * 0.85, 0.040]} />
            <meshStandardMaterial color={C_GOLD} metalness={0.88} roughness={0.15} />
          </mesh>
          <mesh position={[cx + fw / 2 + 0.01, cy, faceZ - DEPTH * 0.1]}>
            <boxGeometry args={[0.022, h * 0.85, 0.040]} />
            <meshStandardMaterial color={C_GOLD} metalness={0.88} roughness={0.15} />
          </mesh>
        </>
      )}

      {/* ── Balcony: every residential floor ── */}
      {withBalcony && (
        <group>
          {/* Slab */}
          <mesh position={[cx, y + BAL_T / 2, faceZ + BAL_D / 2]} castShadow>
            <boxGeometry args={[fw * 0.68, BAL_T, BAL_D]} />
            <meshStandardMaterial color="#CCCAC0" roughness={0.70} />
          </mesh>
          {/* Glass railing — front */}
          <mesh position={[cx, y + BAL_T + 0.050, faceZ + BAL_D - 0.007]}>
            <boxGeometry args={[fw * 0.68, 0.092, 0.011]} />
            <meshPhysicalMaterial
              color="#88A8C0"
              transparent
              opacity={0.46}
              metalness={0.14}
              roughness={0.04}
              envMapIntensity={2.2}
            />
          </mesh>
          {/* Glass railing — left side */}
          <mesh position={[cx - fw * 0.34 + 0.006, y + BAL_T + 0.050, faceZ + BAL_D / 2]}>
            <boxGeometry args={[0.011, 0.092, BAL_D]} />
            <meshPhysicalMaterial
              color="#88A8C0" transparent opacity={0.38}
              metalness={0.12} roughness={0.04} envMapIntensity={2.0}
            />
          </mesh>
          {/* Glass railing — right side */}
          <mesh position={[cx + fw * 0.34 - 0.006, y + BAL_T + 0.050, faceZ + BAL_D / 2]}>
            <boxGeometry args={[0.011, 0.092, BAL_D]} />
            <meshPhysicalMaterial
              color="#88A8C0" transparent opacity={0.38}
              metalness={0.12} roughness={0.04} envMapIntensity={2.0}
            />
          </mesh>
          {/* Metal top rail */}
          <mesh position={[cx, y + BAL_T + 0.097, faceZ + BAL_D - 0.007]}>
            <boxGeometry args={[fw * 0.68 + 0.012, 0.014, 0.026]} />
            <meshStandardMaterial color={C_MULL} metalness={0.75} roughness={0.18} />
          </mesh>
        </group>
      )}

      {/* ── Invisible hit-box for floor hover ── */}
      {!lobby && (
        <mesh
          position={[cx, cy, 0]}
          onPointerEnter={(e) => { e.stopPropagation(); onEnter(); }}
          onPointerLeave={(e) => { e.stopPropagation(); onLeave(); }}
          onPointerOut={(e)   => { e.stopPropagation(); onLeave(); }}
        >
          <boxGeometry args={[fw + 0.14, h + 0.01, DEPTH + 0.18]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

// ─── Tower ────────────────────────────────────────────────────────────────────
function LuxuryTower({
  tower, hoveredFloor, quality, onEnter, onLeave,
}: {
  tower: TowerLayout;
  hoveredFloor: number | null;
  quality: "high" | "low";
  onEnter: (f: FloorLayout) => void;
  onLeave: () => void;
}) {
  const { floors, height, width, x: cx } = tower;
  const topFL = floors[floors.length - 1];
  const topW  = (topFL?.w ?? width) * (topFL ? 0.86 : 1);

  return (
    <group>
      {floors.map((fl) => (
        <LuxuryFloor
          key={fl.floor}
          floor={fl}
          floors={floors}
          cx={cx}
          hovered={hoveredFloor === fl.floor}
          quality={quality}
          onEnter={() => onEnter(fl)}
          onLeave={onLeave}
        />
      ))}

      {/* ── Roof parapet cap ── */}
      <mesh position={[cx, height + 0.042, 0]} castShadow receiveShadow>
        <boxGeometry args={[topW + 0.12, 0.084, DEPTH + 0.12]} />
        <meshStandardMaterial color={C_ROOF} roughness={0.48} metalness={0.14} />
      </mesh>

      {/* ── Crown / mechanical penthouse ── */}
      <mesh position={[cx, height + 0.20, 0]}>
        <boxGeometry args={[topW * 0.34, 0.24, DEPTH * 0.36]} />
        <meshStandardMaterial color="#173A38" roughness={0.60} metalness={0.10} />
      </mesh>

      {/* ── Gold crown line on front parapet ── */}
      <mesh position={[cx, height + 0.086, DEPTH / 2 + 0.003]}>
        <boxGeometry args={[topW + 0.12, 0.009, 0.008]} />
        <meshStandardMaterial color={C_GOLD} metalness={0.92} roughness={0.12} />
      </mesh>

      {/* ── Solar water heaters (דודי שמש) — Israeli rooftop detail ── */}
      {quality === "high" && [-0.28, 0.28].map((xOff, i) => (
        <group key={i} position={[cx + topW * xOff, height + 0.19, DEPTH * 0.05]}>
          {/* Collector plate */}
          <mesh rotation={[0.35, 0, 0]}>
            <boxGeometry args={[0.22, 0.05, 0.30]} />
            <meshStandardMaterial color="#1A2A38" metalness={0.55} roughness={0.28} />
          </mesh>
          {/* Tank (horizontal cylinder) */}
          <mesh position={[0, 0.18, -0.04]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.055, 0.055, 0.22, 10]} />
            <meshStandardMaterial color="#8C9098" metalness={0.55} roughness={0.38} />
          </mesh>
        </group>
      ))}

      {/* ── AC / mechanical units on roof ── */}
      {quality === "high" && [0.12, -0.10, 0.30].map((xOff, i) => (
        <mesh key={i} position={[cx + xOff * topW, height + 0.11, (i - 1) * 0.16]}>
          <boxGeometry args={[0.13, 0.09, 0.17]} />
          <meshStandardMaterial color="#9A9A94" metalness={0.28} roughness={0.62} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Scene ────────────────────────────────────────────────────────────────────
function Scene({
  buildings,
  activeUnitTypeId,
  hoveredFloor,
  hoveredBuildingId,
  quality,
  isMobile,
  setQuality,
  onFloorHover,
}: {
  buildings: ExplorerBuilding[];
  activeUnitTypeId: string;
  hoveredFloor: number | null;
  hoveredBuildingId: string | null;
  quality: "high" | "low";
  isMobile: boolean;
  setQuality: (q: "high" | "low") => void;
  onFloorHover: (info: HoverInfo | null, floor: number | null, bid: string | null) => void;
}) {
  const { towers, maxHeight } = useMemo(() => layoutTowers(buildings), [buildings]);
  const dist   = Math.max(10, maxHeight * 1.55, towers.length * 6.5);
  const target = useMemo<[number, number, number]>(() => [0, maxHeight * 0.45, 0], [maxHeight]);
  const targetVec = useMemo(() => new THREE.Vector3(...target),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [target[0], target[1], target[2]]);

  // Opening camera: slightly lower / more frontal than before → architectural 3/4 shot
  const startPos = useMemo(
    () => new THREE.Vector3(dist * 0.42, maxHeight * 1.40, dist * 1.70),
    [dist, maxHeight],
  );
  const endPos = useMemo(
    () => new THREE.Vector3(dist * 0.32, maxHeight * 0.30, dist * 0.82),
    [dist, maxHeight],
  );

  const [flyDone, setFlyDone] = useState(false);

  const handleEnter = useCallback(
    (tower: TowerLayout, floor: FloorLayout) => {
      const { avail, total } = floorAvail(floor);
      const top = topResidentialFloor(tower.floors);
      onFloorHover(
        {
          buildingName: tower.building.name,
          floor: floor.floor,
          lobby: floor.lobby,
          availableCount: avail,
          totalCount: total,
          isPenthouse: !floor.lobby && floor.floor === top,
        },
        floor.floor,
        tower.building.id,
      );
    },
    [onFloorHover],
  );

  const handleLeave = useCallback(() => { onFloorHover(null, null, null); }, [onFloorHover]);

  return (
    <>
      {/* ── HDRI reflections (sky shown via <Sky>) ── */}
      <Environment files="/hdri/venice_sunset_1k.hdr" />

      {/* ── Procedural sky (high quality desktop) ── */}
      {quality === "high" && !isMobile && (
        <Sky
          sunPosition={[-0.55, 0.055, -1]}
          turbidity={7}
          rayleigh={3.8}
          mieCoefficient={0.005}
          mieDirectionalG={0.85}
          distance={450}
        />
      )}
      {(quality === "low" || isMobile) && (
        <color attach="background" args={["#C08050"]} />
      )}

      {/* ── Shared environment: lights, ground, trees, shadows, N8AO ── */}
      <BuildingEnvironment
        maxHeight={maxHeight}
        dist={dist}
        quality={quality}
        isMobile={isMobile}
      />

      {/* ── Performance monitor ── */}
      <PerformanceMonitor
        onDecline={() => setQuality("low")}
        onIncline={() => setQuality("high")}
      />

      {/* ── Buildings ── */}
      {towers.map((tower) => (
        <LuxuryTower
          key={tower.building.id}
          tower={tower}
          hoveredFloor={hoveredBuildingId === tower.building.id ? hoveredFloor : null}
          quality={quality}
          onEnter={(fl) => handleEnter(tower, fl)}
          onLeave={handleLeave}
        />
      ))}

      {/* ── Camera fly-in + orbit controls ── */}
      {!flyDone && (
        <CameraFlyIn
          from={startPos}
          to={endPos}
          lookAt={targetVec}
          onDone={() => setFlyDone(true)}
        />
      )}
      <OrbitControls
        makeDefault
        enabled={flyDone}
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={Math.PI / 2.05}
        minPolarAngle={0.28}
        minDistance={4}
        maxDistance={dist * 2.5}
        target={target}
        touches={{ ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }}
      />
    </>
  );
}

// ─── Canvas wrapper ───────────────────────────────────────────────────────────
export default function BuildingCanvas(props: {
  buildings: ExplorerBuilding[];
  activeUnitTypeId: string;
  hoveredId: string | null;
  onHover: (info: HoverInfo | null, id: string | null) => void;
}) {
  const { towers, maxHeight } = useMemo(() => layoutTowers(props.buildings), [props.buildings]);
  const dist = Math.max(10, maxHeight * 1.55, towers.length * 6.5);

  const [quality,  setQuality]  = useState<"high" | "low">("high");
  const [isMobile, setIsMobile] = useState(false);
  const [hoveredFloor,      setHoveredFloor]      = useState<number | null>(null);
  const [hoveredBuildingId, setHoveredBuildingId] = useState<string | null>(null);

  useEffect(() => {
    setIsMobile(window.matchMedia("(max-width: 767px)").matches);
  }, []);

  const handleFloorHover = useCallback(
    (info: HoverInfo | null, floor: number | null, bid: string | null) => {
      setHoveredFloor(floor);
      setHoveredBuildingId(bid);
      props.onHover(info, floor !== null ? `floor-${bid}-${floor}` : null);
    },
    [props.onHover],
  );

  return (
    <Canvas
      dpr={[1, isMobile ? 1.2 : 1.75]}
      camera={{
        position: [dist * 0.42, maxHeight * 1.40, dist * 1.70],
        fov: 44,
        near: 0.1,
        far: dist * 6,
      }}
      gl={{
        antialias: true,
        alpha: false,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.08,
      }}
      shadows="soft"
      style={{ width: "100%", height: "100%", touchAction: "none" }}
      onPointerMissed={() => props.onHover(null, null)}
    >
      <Scene
        buildings={props.buildings}
        activeUnitTypeId={props.activeUnitTypeId}
        hoveredFloor={hoveredFloor}
        hoveredBuildingId={hoveredBuildingId}
        quality={quality}
        isMobile={isMobile}
        setQuality={setQuality}
        onFloorHover={handleFloorHover}
      />
    </Canvas>
  );
}
