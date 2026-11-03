"use client";

/**
 * BuildingEnvironment
 *
 * Shared in-Canvas component used by both BuildingCanvas (procedural) and
 * BuildingGLBScene (baked GLB). Provides:
 *   • Sun / hemisphere / fill lights (scaleable via lightIntensity)
 *   • Enhanced ground: grass · sidewalk · road · parking
 *   • Trees (optional, desktop high-quality only)
 *   • ContactShadows (optional, desktop high-quality only)
 *   • EffectComposer: N8AO + Bloom + Vignette (N8AO / Bloom disabled on mobile)
 *
 * Usage inside a <Canvas>:
 *   <BuildingEnvironment maxHeight={h} dist={d} quality={q} isMobile={m} />
 */

import { ContactShadows } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette, N8AO } from "@react-three/postprocessing";

// ─── Palette ──────────────────────────────────────────────────────────────────
const C_GRASS    = "#A8BA98";
const C_SIDEWALK = "#C4C0B8";
const C_ROAD     = "#484840";
const C_PARKING  = "#3A3A36";

// ─── Enhanced ground ─────────────────────────────────────────────────────────
function EnhancedGround({ r }: { r: number }) {
  return (
    <group>
      {/* Grass base */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <circleGeometry args={[r, 72]} />
        <meshStandardMaterial color={C_GRASS} roughness={0.94} />
      </mesh>

      {/* Paved sidewalk around building */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, r * 0.04]} receiveShadow>
        <planeGeometry args={[r * 0.62, r * 0.54]} />
        <meshStandardMaterial color={C_SIDEWALK} roughness={0.82} metalness={0.02} />
      </mesh>

      {/* Grass strip between sidewalk and road */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, r * 0.37]}>
        <planeGeometry args={[r * 0.88, r * 0.07]} />
        <meshStandardMaterial color={C_GRASS} roughness={0.94} />
      </mesh>

      {/* Road */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, r * 0.47]} receiveShadow>
        <planeGeometry args={[r * 0.90, r * 0.15]} />
        <meshStandardMaterial color={C_ROAD} roughness={0.92} />
      </mesh>

      {/* Road centre-line dashes */}
      {Array.from({ length: 7 }, (_, i) => (
        <mesh
          key={i}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[-r * 0.36 + i * r * 0.12, 0.001, r * 0.47]}
        >
          <planeGeometry args={[r * 0.048, 0.038]} />
          <meshBasicMaterial color="#F0EEE0" transparent opacity={0.60} />
        </mesh>
      ))}

      {/* Parking area */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[r * 0.34, 0.001, r * 0.24]} receiveShadow>
        <planeGeometry args={[r * 0.30, r * 0.22]} />
        <meshStandardMaterial color={C_PARKING} roughness={0.90} />
      </mesh>

      {/* Parking space lines */}
      {Array.from({ length: 6 }, (_, i) => (
        <mesh
          key={i}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[r * 0.21 + i * r * 0.057, 0.002, r * 0.24]}
        >
          <planeGeometry args={[0.036, r * 0.20]} />
          <meshBasicMaterial color="#D8D6D0" transparent opacity={0.75} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Tree ─────────────────────────────────────────────────────────────────────
function Tree({ x, z, s = 1 }: { x: number; z: number; s?: number }) {
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh position={[0, 0.44, 0]} castShadow>
        <cylinderGeometry args={[0.044, 0.062, 0.88, 8]} />
        <meshStandardMaterial color="#483018" roughness={0.94} />
      </mesh>
      <mesh position={[0, 1.32, 0]} castShadow>
        <coneGeometry args={[0.60, 1.22, 9]} />
        <meshStandardMaterial color="#2C5434" roughness={0.88} />
      </mesh>
      <mesh position={[0, 1.76, 0]} castShadow>
        <coneGeometry args={[0.38, 0.84, 9]} />
        <meshStandardMaterial color="#386040" roughness={0.88} />
      </mesh>
    </group>
  );
}

function Trees({ dist }: { dist: number }) {
  const pts: [number, number, number, number][] = [
    [-dist * 0.24, -1.1, 2.3, 0],
    [ dist * 0.24, -1.7, 2.0, 1],
    [-dist * 0.32,  1.6, 2.5, 2],
    [ dist * 0.28,  1.0, 2.1, 3],
    [-dist * 0.14, -dist * 0.16, 1.9, 4],
    [ dist * 0.16, -dist * 0.14, 2.0, 5],
    [-dist * 0.20,  dist * 0.26, 2.2, 6],
    [ dist * 0.22,  dist * 0.28, 1.8, 7],
  ];
  return (
    <>
      {pts.map(([x, z, s, key]) => (
        <Tree key={key} x={x} z={z} s={s} />
      ))}
    </>
  );
}

// ─── Exported component ───────────────────────────────────────────────────────
export interface BuildingEnvironmentProps {
  maxHeight: number;
  /** Used for light positioning, ground sizing, tree placement */
  dist: number;
  quality: "high" | "low";
  isMobile: boolean;
  /** Scale all light intensities (0 = no lights, 1 = full). Default 1. */
  lightIntensity?: number;
  /** Render the enhanced ground plane. Default true. */
  showGround?: boolean;
  /** Render trees (only at high quality desktop). Default true. */
  showTrees?: boolean;
}

export function BuildingEnvironment({
  maxHeight,
  dist,
  quality,
  isMobile,
  lightIntensity = 1.0,
  showGround = true,
  showTrees = true,
}: BuildingEnvironmentProps) {
  const li = lightIntensity;
  const hiDesktop = quality === "high" && !isMobile;

  return (
    <>
      {/* ── Lights ── */}
      {li > 0 && (
        <>
          <ambientLight intensity={0.28 * li} color="#FFD0A0" />
          {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
          {/* @ts-ignore r3f overloaded args */}
          <hemisphereLight args={["#FFBC78", "#78A0C0", 0.58 * li]} />

          {/* Key light: low sun from building's left-back */}
          <directionalLight
            position={[-dist * 0.55, maxHeight * 1.85, dist * 0.38]}
            intensity={2.6 * li}
            color="#FFCC88"
            castShadow
            shadow-mapSize={[isMobile ? 512 : 1024, isMobile ? 512 : 1024]}
            shadow-camera-near={0.5}
            shadow-camera-far={dist * 3.5}
            shadow-camera-left={-dist * 0.8}
            shadow-camera-right={dist * 0.8}
            shadow-camera-top={maxHeight * 2}
            shadow-camera-bottom={-4}
            shadow-bias={-0.0006}
          />

          {/* Fill light: cool from opposite side */}
          <directionalLight
            position={[dist * 0.85, maxHeight * 0.55, -dist * 0.55]}
            intensity={0.38 * li}
            color="#A0C0DA"
          />
        </>
      )}

      {/* ── Ground ── */}
      {showGround && <EnhancedGround r={dist * 0.62} />}

      {/* ── Trees ── */}
      {showTrees && hiDesktop && <Trees dist={dist} />}

      {/* ── Contact shadows ── */}
      {hiDesktop && (
        <ContactShadows
          position={[0, 0.002, 0]}
          opacity={0.48}
          scale={dist * 0.88}
          blur={2.6}
          far={maxHeight * 1.3}
          color="#162A28"
          frames={2}
        />
      )}

      {/* ── Post-processing ── */}
      {hiDesktop ? (
        <EffectComposer multisampling={0}>
          <N8AO aoRadius={2.5} intensity={2.2} quality="medium" />
          <Bloom intensity={0.18} luminanceThreshold={0.88} mipmapBlur />
          <Vignette eskil={false} offset={0.36} darkness={0.58} />
        </EffectComposer>
      ) : (
        <EffectComposer multisampling={0}>
          <Vignette eskil={false} offset={0.36} darkness={0.40} />
        </EffectComposer>
      )}
    </>
  );
}
