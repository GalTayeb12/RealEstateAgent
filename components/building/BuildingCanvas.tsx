"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { TOUCH } from "three";
import { useMemo } from "react";
import { HOME_H, layoutTowers, unitX } from "./layout";
import type { ExplorerBuilding, HoverInfo } from "./types";

const SHELL = "#F4F1EB";
const LOBBY = "#D9D3C7";
const ROOF = "#1F4B4A";
const AVAILABLE = "#2F8F86";
const AVAILABLE_OTHER = "#8FB8B4";
const RESERVED = "#C89B3C";
const SOLD = "#C5C0B8";

function apartmentColor(status: string, sameType: boolean): string {
  if (status === "reserved") return RESERVED;
  if (status === "sold") return SOLD;
  return sameType ? AVAILABLE : AVAILABLE_OTHER;
}

function Scene({
  buildings,
  activeUnitTypeId,
  hoveredId,
  onHover,
}: {
  buildings: ExplorerBuilding[];
  activeUnitTypeId: string;
  hoveredId: string | null;
  onHover: (info: HoverInfo | null, id: string | null) => void;
}) {
  const { towers, maxHeight } = useMemo(() => layoutTowers(buildings), [buildings]);
  const distance = Math.max(10, maxHeight * 1.55, towers.length * 7);
  const target = useMemo<[number, number, number]>(() => [0, maxHeight * 0.42, 0], [maxHeight]);
  // modelUrl is kept on each building for a later GLB. This stage always draws the floors from the apartments that exist.

  return (
    <>
      <color attach="background" args={["#E7F0EF"]} />
      <ambientLight intensity={0.72} />
      <hemisphereLight args={["#F7F4EE", "#C9D5D4", 0.45]} />
      <directionalLight position={[8, 16, 10]} intensity={1.2} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <circleGeometry args={[Math.max(distance * 0.7, 8), 48]} />
        <meshStandardMaterial color="#E4EEED" roughness={1} />
      </mesh>
      {towers.map((tower) => (
        <group key={tower.building.id}>
          {tower.floors.map((floor) => (
            <group key={floor.floor}>
              <mesh position={[tower.x, floor.y + floor.h / 2, -0.12]}>
                <boxGeometry args={[floor.w + 0.16, floor.h, 1.2]} />
                <meshStandardMaterial color={floor.lobby ? LOBBY : SHELL} roughness={0.86} />
              </mesh>
              {floor.lobby ? (
                <mesh
                  position={[tower.x, floor.y + floor.h / 2, 0.5]}
                  onPointerOver={(event) => {
                    event.stopPropagation();
                    onHover({ buildingName: tower.building.name, floor: floor.floor, lobby: true }, `lobby-${tower.building.id}-${floor.floor}`);
                  }}
                  onPointerOut={(event) => {
                    event.stopPropagation();
                    onHover(null, null);
                  }}
                >
                  <boxGeometry args={[floor.w * 0.72, floor.h * 0.45, 0.08]} />
                  <meshStandardMaterial color="#C4BBAE" roughness={0.7} />
                </mesh>
              ) : (
                floor.units.map((unit, index) => {
                  const id = unit.id;
                  const hot = hoveredId === id;
                  const sameType = unit.unitTypeId === activeUnitTypeId;
                  const color = apartmentColor(unit.status, sameType);
                  return (
                    <mesh
                      key={id}
                      position={[tower.x + unitX(index, floor.units.length), floor.y + floor.h / 2, 0.48]}
                      onPointerOver={(event) => {
                        event.stopPropagation();
                        onHover({
                          buildingName: tower.building.name,
                          floor: unit.floor,
                          lobby: false,
                          unitNumber: unit.unitNumber,
                          unitLabel: unit.unitLabel,
                          status: unit.status,
                          price: unit.price ?? unit.listPrice,
                        }, id);
                      }}
                      onPointerOut={(event) => {
                        event.stopPropagation();
                        onHover(null, null);
                      }}
                    >
                      <boxGeometry args={[0.84, HOME_H * 0.72, 0.38]} />
                      <meshStandardMaterial
                        color={color}
                        emissive={hot ? color : "#000000"}
                        emissiveIntensity={hot ? 0.38 : 0}
                        roughness={0.48}
                      />
                    </mesh>
                  );
                })
              )}
            </group>
          ))}
          <mesh position={[tower.x, tower.height + 0.06, -0.12]}>
            <boxGeometry args={[(tower.floors[tower.floors.length - 1]?.w ?? tower.width) + 0.28, 0.12, 1.32]} />
            <meshStandardMaterial color={ROOF} roughness={0.6} />
          </mesh>
        </group>
      ))}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={Math.PI / 2.05}
        minPolarAngle={0.28}
        minDistance={5}
        maxDistance={distance * 2.2}
        target={target}
        touches={{ ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }}
      />
    </>
  );
}

export default function BuildingCanvas(props: {
  buildings: ExplorerBuilding[];
  activeUnitTypeId: string;
  hoveredId: string | null;
  onHover: (info: HoverInfo | null, id: string | null) => void;
}) {
  const { towers, maxHeight } = useMemo(() => layoutTowers(props.buildings), [props.buildings]);
  const distance = Math.max(10, maxHeight * 1.55, towers.length * 7);

  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [distance * 0.2, maxHeight * 0.7, distance], fov: 40, near: 0.1, far: 200 }}
      gl={{ antialias: true, alpha: false }}
      style={{ width: "100%", height: "100%", touchAction: "none" }}
      onPointerMissed={() => props.onHover(null, null)}
    >
      <Scene {...props} />
    </Canvas>
  );
}
