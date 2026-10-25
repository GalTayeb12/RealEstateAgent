"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  ContactShadows,
  PerformanceMonitor,
  Sky,
} from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { TOUCH } from "three";
import * as THREE from "three";
import { useRef, useMemo, useState, useCallback, useEffect } from "react";
import { layoutTowers } from "./layout";
import type { ExplorerBuilding, HoverInfo } from "./types";
import type { TowerLayout, FloorLayout } from "./layout";

// ─── Geometry constants ───────────────────────────────────────────────────────
const DEPTH    = 1.18;  // building front-to-back depth
const SHELL_T  = 0.088; // concrete wall thickness (sides + back)
const SLAB_H   = 0.048; // floor-slab edge band height
const SLAB_OVR = 0.058; // slab overhang beyond shell
const MULL_W   = 0.024; // vertical mullion width
const MULL_D   = 0.028; // vertical mullion depth
const BAL_D    = 0.22;  // balcony depth
const BAL_T    = 0.034; // balcony slab thickness

// ─── Material palette ─────────────────────────────────────────────────────────
const C_SHELL  = "#C0BCA8"; // concrete sides & back — warm stone
const C_SLAB   = "#EDE9E0"; // slab edge — bright cream, pops against dark glass
const C_MULL   = "#888480"; // aluminum mullion — darker metal
const C_ROOF   = "#1B4240"; // parapet / roof cap
const C_GOLD   = "#C89B3C"; // luxury accent
const C_POOL   = "#4A9AAE"; // reflecting pool

// ─── Floor analysis helpers ───────────────────────────────────────────────────
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
  from,
  to,
  lookAt,
  onDone,
}: {
  from: THREE.Vector3;
  to: THREE.Vector3;
  lookAt: THREE.Vector3;
  onDone: () => void;
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
    const t = 1 - Math.pow(1 - prog.current, 3); // ease-out cubic
    camera.position.lerpVectors(from, to, t);
    camera.lookAt(lookAt);
    if (prog.current >= 1) {
      done.current = true;
      onDone();
    }
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
  const cy = y + h / 2;
  const faceZ = DEPTH / 2 + 0.002; // front glass z

  const topFloor = topResidentialFloor(floors);
  const penthouse = !lobby && floor.floor === topFloor;
  const { avail, total } = floorAvail(floor);
  const allSold = !lobby && total > 0 && avail === 0;
  const withBalcony = !lobby && floor.floor % 2 === 0 && !penthouse;

  // Setback: upper 28% of residential floors step back slightly
  const setback =
    !lobby && topFloor > 0 && floor.floor >= Math.ceil(topFloor * 0.72)
      ? penthouse
        ? 0.86
        : 0.93
      : 1.0;
  const fw = w * setback;

  // Glass appearance — dark architectural glass
  const glassColor = lobby ? "#0A2030" : allSold ? "#181E2C" : "#0A2030";
  const glassOpacity = lobby ? 0.72 : allSold ? 0.88 : 0.92;
  const glassEmissive = useMemo(
    () =>
      new THREE.Color(
        lobby ? "#B06020" : hovered ? "#1040A0" : "#000000"
      ),
    [lobby, hovered]
  );
  const glassEmissiveInt = lobby ? 0.45 : hovered ? 0.38 : 0;

  const divisions = Math.max(2, floor.units.length);

  return (
    <group>
      {/* Concrete back */}
      <mesh position={[cx, cy, -(DEPTH / 2) + SHELL_T / 2]} receiveShadow>
        <boxGeometry args={[fw, h, SHELL_T]} />
        <meshStandardMaterial color={C_SHELL} roughness={0.78} />
      </mesh>
      {/* Concrete left side */}
      <mesh position={[cx - fw / 2 + SHELL_T / 2, cy, 0]} receiveShadow>
        <boxGeometry args={[SHELL_T, h, DEPTH]} />
        <meshStandardMaterial color={C_SHELL} roughness={0.78} />
      </mesh>
      {/* Concrete right side */}
      <mesh position={[cx + fw / 2 - SHELL_T / 2, cy, 0]} receiveShadow>
        <boxGeometry args={[SHELL_T, h, DEPTH]} />
        <meshStandardMaterial color={C_SHELL} roughness={0.78} />
      </mesh>

      {/* Glass curtain wall */}
      <mesh position={[cx, cy + SLAB_H * 0.5, faceZ]} castShadow>
        <boxGeometry args={[fw - SHELL_T * 2, h - SLAB_H * 1.5, 0.026]} />
        <meshPhysicalMaterial
          color={glassColor}
          transparent
          opacity={glassOpacity}
          metalness={0.22}
          roughness={0.04}
          envMapIntensity={2.4}
          reflectivity={0.94}
          emissive={glassEmissive}
          emissiveIntensity={glassEmissiveInt}
          side={THREE.FrontSide}
        />
      </mesh>

      {/* Slab edge band */}
      <mesh position={[cx, y + SLAB_H / 2, 0]} receiveShadow>
        <boxGeometry args={[fw + SLAB_OVR * 2, SLAB_H, DEPTH + SLAB_OVR]} />
        <meshStandardMaterial color={C_SLAB} roughness={0.55} metalness={0.05} />
      </mesh>

      {/* Vertical mullions */}
      {!lobby &&
        quality === "high" &&
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

      {/* Penthouse: bevel corners + gold top accent */}
      {penthouse && (
        <>
          <mesh position={[cx, y + h - 0.008, faceZ - 0.005]}>
            <boxGeometry args={[fw + 0.04, 0.040, 0.060]} />
            <meshStandardMaterial color={C_GOLD} metalness={0.90} roughness={0.13} />
          </mesh>
          {/* Side accent fins */}
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

      {/* Balcony (even floors, high quality) */}
      {withBalcony && quality === "high" && (
        <group>
          {/* Slab */}
          <mesh position={[cx, y + BAL_T / 2, faceZ + BAL_D / 2]} castShadow>
            <boxGeometry args={[fw * 0.52, BAL_T, BAL_D]} />
            <meshStandardMaterial color="#CCCAC0" roughness={0.70} />
          </mesh>
          {/* Glass railing */}
          <mesh position={[cx, y + BAL_T + 0.050, faceZ + BAL_D - 0.007]}>
            <boxGeometry args={[fw * 0.52, 0.095, 0.011]} />
            <meshPhysicalMaterial
              color="#88A8C0"
              transparent
              opacity={0.50}
              metalness={0.14}
              roughness={0.04}
              envMapIntensity={2.0}
            />
          </mesh>
        </group>
      )}

      {/* Invisible hit-box for floor hover */}
      {!lobby && (
        <mesh
          position={[cx, cy, 0]}
          onPointerEnter={(e) => {
            e.stopPropagation();
            onEnter();
          }}
          onPointerLeave={(e) => {
            e.stopPropagation();
            onLeave();
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
            onLeave();
          }}
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
  tower,
  hoveredFloor,
  quality,
  onEnter,
  onLeave,
}: {
  tower: TowerLayout;
  hoveredFloor: number | null;
  quality: "high" | "low";
  onEnter: (f: FloorLayout) => void;
  onLeave: () => void;
}) {
  const { floors, height, width, x: cx } = tower;
  const topFL = floors[floors.length - 1];
  const topW = (topFL?.w ?? width) * (topFL ? 0.86 : 1);

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

      {/* Roof parapet cap */}
      <mesh position={[cx, height + 0.042, 0]} castShadow receiveShadow>
        <boxGeometry args={[topW + 0.12, 0.084, DEPTH + 0.12]} />
        <meshStandardMaterial color={C_ROOF} roughness={0.48} metalness={0.14} />
      </mesh>

      {/* Crown / mechanical penthouse on roof */}
      <mesh position={[cx, height + 0.20, 0]}>
        <boxGeometry args={[topW * 0.34, 0.24, DEPTH * 0.36]} />
        <meshStandardMaterial color="#173A38" roughness={0.60} metalness={0.10} />
      </mesh>

      {/* Gold crown line on front parapet */}
      <mesh position={[cx, height + 0.086, DEPTH / 2 + 0.003]}>
        <boxGeometry args={[topW + 0.12, 0.009, 0.008]} />
        <meshStandardMaterial color={C_GOLD} metalness={0.92} roughness={0.12} />
      </mesh>
    </group>
  );
}

// ─── Ground ───────────────────────────────────────────────────────────────────
function Ground({ r }: { r: number }) {
  return (
    <group>
      {/* Grass */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <circleGeometry args={[r, 72]} />
        <meshStandardMaterial color="#B4C2A4" roughness={0.96} />
      </mesh>
      {/* Paved plaza */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, r * 0.12]} receiveShadow>
        <planeGeometry args={[r * 0.54, r * 0.42]} />
        <meshStandardMaterial color="#C6C2BA" roughness={0.76} metalness={0.04} />
      </mesh>
      {/* Reflecting pool in plaza */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, r * 0.30]}>
        <planeGeometry args={[r * 0.20, r * 0.07]} />
        <meshPhysicalMaterial
          color={C_POOL}
          metalness={0.65}
          roughness={0.03}
          envMapIntensity={3.0}
        />
      </mesh>
      {/* Pool edge */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, r * 0.30]}>
        <ringGeometry args={[r * 0.10, r * 0.115, 32]} />
        <meshStandardMaterial color={C_SLAB} roughness={0.60} />
      </mesh>
    </group>
  );
}

// ─── Tree ─────────────────────────────────────────────────────────────────────
function Tree({ x, z, s = 1 }: { x: number; z: number; s?: number }) {
  return (
    <group position={[x, 0, z]} scale={s}>
      {/* Trunk */}
      <mesh position={[0, 0.44, 0]} castShadow>
        <cylinderGeometry args={[0.044, 0.062, 0.88, 8]} />
        <meshStandardMaterial color="#483018" roughness={0.94} />
      </mesh>
      {/* Lower foliage */}
      <mesh position={[0, 1.32, 0]} castShadow>
        <coneGeometry args={[0.60, 1.22, 9]} />
        <meshStandardMaterial color="#2C5434" roughness={0.88} />
      </mesh>
      {/* Upper foliage */}
      <mesh position={[0, 1.76, 0]} castShadow>
        <coneGeometry args={[0.38, 0.84, 9]} />
        <meshStandardMaterial color="#386040" roughness={0.88} />
      </mesh>
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
  setQuality,
  onFloorHover,
}: {
  buildings: ExplorerBuilding[];
  activeUnitTypeId: string;
  hoveredFloor: number | null;
  hoveredBuildingId: string | null;
  quality: "high" | "low";
  setQuality: (q: "high" | "low") => void;
  onFloorHover: (
    info: HoverInfo | null,
    floor: number | null,
    bid: string | null
  ) => void;
}) {
  const { towers, maxHeight } = useMemo(
    () => layoutTowers(buildings),
    [buildings]
  );
  const dist = Math.max(10, maxHeight * 1.55, towers.length * 6.5);
  const target = useMemo<[number, number, number]>(
    () => [0, maxHeight * 0.45, 0],
    [maxHeight]
  );
  const targetVec = useMemo(
    () => new THREE.Vector3(...target),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [target[0], target[1], target[2]]
  );

  const startPos = useMemo(
    () => new THREE.Vector3(dist * 0.48, maxHeight * 1.60, dist * 1.80),
    [dist, maxHeight]
  );
  const endPos = useMemo(
    () => new THREE.Vector3(dist * 0.36, maxHeight * 0.34, dist * 0.90),
    [dist, maxHeight]
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
        tower.building.id
      );
    },
    [onFloorHover]
  );

  const handleLeave = useCallback(() => {
    onFloorHover(null, null, null);
  }, [onFloorHover]);

  return (
    <>
      {/* Lighting — golden hour */}
      <ambientLight intensity={0.28} color="#FFD0A0" />
      <hemisphereLight args={["#FFBC78", "#78A0C0", 0.58]} />
      {/* Key light: low sun from side-back */}
      <directionalLight
        position={[-dist * 0.55, maxHeight * 1.85, dist * 0.38]}
        intensity={2.6}
        color="#FFCC88"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={0.5}
        shadow-camera-far={dist * 3.5}
        shadow-camera-left={-dist}
        shadow-camera-right={dist}
        shadow-camera-top={maxHeight * 2}
        shadow-camera-bottom={-4}
        shadow-bias={-0.0006}
      />
      {/* Fill light: cool from opposite */}
      <directionalLight
        position={[dist * 0.85, maxHeight * 0.55, -dist * 0.55]}
        intensity={0.38}
        color="#A0C0DA"
      />

      {/* HDRI reflections */}
      <Environment preset="sunset" />

      {/* Procedural sky */}
      {quality === "high" && (
        <Sky
          sunPosition={[-0.55, 0.055, -1]}
          turbidity={7}
          rayleigh={3.8}
          mieCoefficient={0.005}
          mieDirectionalG={0.85}
          distance={450}
        />
      )}
      {quality === "low" && (
        <color attach="background" args={["#C08050"]} />
      )}

      {/* Performance monitor — must live inside Canvas */}
      <PerformanceMonitor
        onDecline={() => setQuality("low")}
        onIncline={() => setQuality("high")}
      />

      {/* ── Buildings ── */}
      {towers.map((tower) => (
        <LuxuryTower
          key={tower.building.id}
          tower={tower}
          hoveredFloor={
            hoveredBuildingId === tower.building.id ? hoveredFloor : null
          }
          quality={quality}
          onEnter={(fl) => handleEnter(tower, fl)}
          onLeave={handleLeave}
        />
      ))}

      {/* Ground */}
      <Ground r={dist * 0.62} />

      {/* Contact shadows */}
      {quality === "high" && (
        <ContactShadows
          position={[0, 0.002, 0]}
          opacity={0.52}
          scale={dist * 0.88}
          blur={2.6}
          far={maxHeight * 1.3}
          color="#162A28"
        />
      )}

      {/* Trees */}
      {quality === "high" && (
        <>
          <Tree x={-dist * 0.24} z={-1.1} s={2.3} />
          <Tree x={dist * 0.24} z={-1.7} s={2.0} />
          <Tree x={-dist * 0.32} z={1.6} s={2.5} />
          <Tree x={dist * 0.28} z={1.0} s={2.1} />
          <Tree x={-dist * 0.14} z={-dist * 0.16} s={1.9} />
          <Tree x={dist * 0.16} z={-dist * 0.14} s={2.0} />
        </>
      )}

      {/* Post-processing */}
      {quality === "high" && (
        <EffectComposer>
          <Bloom intensity={0.18} luminanceThreshold={0.88} mipmapBlur />
          <Vignette eskil={false} offset={0.36} darkness={0.58} />
        </EffectComposer>
      )}

      {/* Camera fly-in + orbit controls */}
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
  const { towers, maxHeight } = useMemo(
    () => layoutTowers(props.buildings),
    [props.buildings]
  );
  const dist = Math.max(10, maxHeight * 1.55, towers.length * 6.5);

  const [quality, setQuality] = useState<"high" | "low">("high");
  const [hoveredFloor, setHoveredFloor] = useState<number | null>(null);
  const [hoveredBuildingId, setHoveredBuildingId] = useState<string | null>(
    null
  );

  const handleFloorHover = useCallback(
    (info: HoverInfo | null, floor: number | null, bid: string | null) => {
      setHoveredFloor(floor);
      setHoveredBuildingId(bid);
      props.onHover(
        info,
        floor !== null ? `floor-${bid}-${floor}` : null
      );
    },
    [props.onHover]
  );

  return (
    <Canvas
      dpr={[1, quality === "high" ? 1.75 : 1.2]}
      camera={{
        position: [dist * 0.48, maxHeight * 1.60, dist * 1.80],
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
        setQuality={setQuality}
        onFloorHover={handleFloorHover}
      />
    </Canvas>
  );
}
