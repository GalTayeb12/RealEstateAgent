"use client";

import { useMemo } from "react";
import * as THREE from "three";

// ─── Color constants (from demo) ────────────────────────────────────────────
const WOOD   = 0xb98b5c;
const WOOD_D = 0x76553a;
const WHITE  = 0xf5f4f0;
const DARK   = 0x2b2f35;
const LINEN  = 0xe7e1d6;
const CAB    = 0xe8e6e1;

function c(hex: number) { return new THREE.Color(hex); }
function cs(hex: string) { return new THREE.Color(hex); }

// ─── Sofa ────────────────────────────────────────────────────────────────────
export function Sofa({ w = 2.0, color = "#7b8ea4" }: { w?: number; color?: string }) {
  return (
    <group>
      {/* base */}
      <mesh position={[0, 0.18, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, 0.36, 0.85]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      {/* back */}
      <mesh position={[0, 0.48, -0.32]} castShadow receiveShadow>
        <boxGeometry args={[w, 0.26, 0.2]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      {/* legs */}
      {([-w / 2 + 0.06, w / 2 - 0.06] as const).map((x) =>
        ([-0.33, 0.33] as const).map((z) => (
          <mesh key={`${x}-${z}`} position={[x, 0.03, z]} castShadow>
            <boxGeometry args={[0.05, 0.06, 0.05]} />
            <meshStandardMaterial color={c(WOOD_D)} roughness={0.7} />
          </mesh>
        )),
      )}
    </group>
  );
}

// ─── L-shaped Sofa ──────────────────────────────────────────────────────────
export function LSofa({ color = "#7b8ea4" }: { color?: string }) {
  return (
    <group>
      <Sofa w={2.2} color={color} />
      {/* extension arm */}
      <mesh position={[-1.0, 0.18, 0.42]} castShadow receiveShadow>
        <boxGeometry args={[0.65, 0.36, 0.6]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
    </group>
  );
}

// ─── Armchair ────────────────────────────────────────────────────────────────
export function Armchair({ color = "#a3ad97" }: { color?: string }) {
  return (
    <group>
      <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.72, 0.38, 0.72]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.48, -0.28]} castShadow receiveShadow>
        <boxGeometry args={[0.72, 0.2, 0.16]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      {/* armrests */}
      {([-0.32, 0.32] as const).map((x) => (
        <mesh key={x} position={[x, 0.36, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.08, 0.14, 0.60]} />
          <meshStandardMaterial color={color} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Coffee Table ────────────────────────────────────────────────────────────
export function CoffeeTable() {
  return (
    <group>
      <mesh position={[0, 0.32, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.9, 0.04, 0.5]} />
        <meshStandardMaterial color={c(WOOD)} roughness={0.6} />
      </mesh>
      {([-0.38, 0.38] as const).map((x) =>
        ([-0.18, 0.18] as const).map((z) => (
          <mesh key={`${x}-${z}`} position={[x, 0.15, z]} castShadow>
            <cylinderGeometry args={[0.015, 0.015, 0.30, 8]} />
            <meshStandardMaterial color={c(DARK)} roughness={0.5} metalness={0.3} />
          </mesh>
        )),
      )}
    </group>
  );
}

// ─── TV ──────────────────────────────────────────────────────────────────────
export function TV() {
  return (
    <group>
      {/* stand */}
      <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.6, 0.8, 0.3]} />
        <meshStandardMaterial color={c(WHITE)} roughness={0.7} />
      </mesh>
      {/* screen */}
      <mesh position={[0, 1.0, 0.02]} castShadow receiveShadow>
        <boxGeometry args={[1.1, 0.62, 0.04]} />
        <meshStandardMaterial color={c(DARK)} roughness={0.3} />
      </mesh>
    </group>
  );
}

// ─── Rug ─────────────────────────────────────────────────────────────────────
export function Rug({ w = 2.0, d = 1.5, color = "#d8ccb6" }: { w?: number; d?: number; color?: string }) {
  return (
    <mesh position={[0, 0.005, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color={color} roughness={0.95} />
    </mesh>
  );
}

// ─── Dining Set ──────────────────────────────────────────────────────────────
export function DiningSet({ n = 6, len = 2.0 }: { n?: number; len?: number }) {
  const chairs = useMemo(() => {
    const seats: [number, number, number][] = [];
    const perSide = Math.ceil(n / 2);
    for (let i = 0; i < perSide; i++) {
      const x = -len / 2 + 0.25 + (i * (len - 0.5)) / Math.max(perSide - 1, 1);
      seats.push([x, 0.32, 0.42]);
      if (seats.length < n) seats.push([x, 0.32, -0.42]);
    }
    return seats;
  }, [n, len]);

  return (
    <group>
      {/* table top */}
      <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
        <boxGeometry args={[len, 0.05, 0.8]} />
        <meshStandardMaterial color={c(WOOD)} roughness={0.55} />
      </mesh>
      {/* table legs */}
      {([-len / 2 + 0.08, len / 2 - 0.08] as const).map((x) =>
        ([-0.32, 0.32] as const).map((z) => (
          <mesh key={`${x}-${z}`} position={[x, 0.35, z]} castShadow>
            <boxGeometry args={[0.05, 0.70, 0.05]} />
            <meshStandardMaterial color={c(WOOD_D)} roughness={0.6} />
          </mesh>
        )),
      )}
      {/* chairs */}
      {chairs.map(([x, _y, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.38, 0.04, 0.38]} />
            <meshStandardMaterial color={c(WOOD)} roughness={0.65} />
          </mesh>
          <mesh position={[0, 0.44, z > 0 ? -0.16 : 0.16]} castShadow>
            <boxGeometry args={[0.36, 0.4, 0.04]} />
            <meshStandardMaterial color={c(WOOD)} roughness={0.65} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ─── Round Table ─────────────────────────────────────────────────────────────
export function RoundTable({ n = 4 }: { n?: number }) {
  const chairs = useMemo(() => {
    const r = 0.55;
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return [Math.cos(a) * r, Math.sin(a) * r, a] as [number, number, number];
    });
  }, [n]);

  return (
    <group>
      {/* table */}
      <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.45, 0.45, 0.05, 24]} />
        <meshStandardMaterial color={c(WOOD)} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.35, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 0.70, 8]} />
        <meshStandardMaterial color={c(DARK)} roughness={0.5} metalness={0.3} />
      </mesh>
      {/* chairs */}
      {chairs.map(([x, z, a], i) => (
        <group key={i} position={[x, 0, z]} rotation={[0, -a + Math.PI, 0]}>
          <mesh position={[0, 0.22, 0]} castShadow>
            <boxGeometry args={[0.36, 0.04, 0.36]} />
            <meshStandardMaterial color={c(WOOD)} roughness={0.65} />
          </mesh>
          <mesh position={[0, 0.42, -0.15]} castShadow>
            <boxGeometry args={[0.34, 0.36, 0.04]} />
            <meshStandardMaterial color={c(WOOD)} roughness={0.65} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ─── Bed ─────────────────────────────────────────────────────────────────────
export function Bed({ w = 1.4, duvetColor = "#e3b46b" }: { w?: number; duvetColor?: string }) {
  const len = 2.0;
  return (
    <group>
      {/* frame */}
      <mesh position={[0, 0.15, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, 0.3, len]} />
        <meshStandardMaterial color={c(WOOD)} roughness={0.7} />
      </mesh>
      {/* mattress */}
      <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
        <boxGeometry args={[w - 0.06, 0.12, len - 0.06]} />
        <meshStandardMaterial color={c(WHITE)} roughness={0.9} />
      </mesh>
      {/* duvet */}
      <mesh position={[0, 0.42, 0.15]} castShadow receiveShadow>
        <boxGeometry args={[w - 0.1, 0.06, len * 0.55]} />
        <meshStandardMaterial color={duvetColor} roughness={0.88} />
      </mesh>
      {/* pillow(s) */}
      <mesh position={[0, 0.44, -(len / 2) + 0.2]} castShadow receiveShadow>
        <boxGeometry args={[w - 0.2, 0.08, 0.28]} />
        <meshStandardMaterial color={c(LINEN)} roughness={0.92} />
      </mesh>
      {/* headboard */}
      <mesh position={[0, 0.6, -(len / 2) + 0.02]} castShadow receiveShadow>
        <boxGeometry args={[w, 0.6, 0.05]} />
        <meshStandardMaterial color={c(WOOD_D)} roughness={0.7} />
      </mesh>
    </group>
  );
}

// ─── Nightstand ──────────────────────────────────────────────────────────────
export function Nightstand() {
  return (
    <group>
      <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.4, 0.44, 0.35]} />
        <meshStandardMaterial color={c(WOOD)} roughness={0.65} />
      </mesh>
    </group>
  );
}

// ─── Wardrobe ────────────────────────────────────────────────────────────────
export function Wardrobe({ w = 1.6 }: { w?: number }) {
  return (
    <group>
      <mesh position={[0, 1.0, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, 2.0, 0.55]} />
        <meshStandardMaterial color={c(CAB)} roughness={0.7} />
      </mesh>
      {/* handles */}
      <mesh position={[0.04, 1.0, 0.28]} castShadow>
        <boxGeometry args={[0.02, 0.15, 0.02]} />
        <meshStandardMaterial color={c(DARK)} roughness={0.4} metalness={0.4} />
      </mesh>
      <mesh position={[-0.04, 1.0, 0.28]} castShadow>
        <boxGeometry args={[0.02, 0.15, 0.02]} />
        <meshStandardMaterial color={c(DARK)} roughness={0.4} metalness={0.4} />
      </mesh>
    </group>
  );
}

// ─── Desk ────────────────────────────────────────────────────────────────────
export function Desk() {
  return (
    <group>
      {/* top */}
      <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.1, 0.04, 0.55]} />
        <meshStandardMaterial color={c(WOOD)} roughness={0.55} />
      </mesh>
      {/* legs */}
      {([-0.48, 0.48] as const).map((x) => (
        <mesh key={x} position={[x, 0.35, -0.2]} castShadow>
          <boxGeometry args={[0.04, 0.70, 0.04]} />
          <meshStandardMaterial color={c(DARK)} roughness={0.5} metalness={0.3} />
        </mesh>
      ))}
      {([-0.48, 0.48] as const).map((x) => (
        <mesh key={`f${x}`} position={[x, 0.35, 0.2]} castShadow>
          <boxGeometry args={[0.04, 0.70, 0.04]} />
          <meshStandardMaterial color={c(DARK)} roughness={0.5} metalness={0.3} />
        </mesh>
      ))}
      {/* chair */}
      <mesh position={[0, 0.38, 0.5]} castShadow receiveShadow>
        <boxGeometry args={[0.42, 0.04, 0.42]} />
        <meshStandardMaterial color={c(DARK)} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.56, 0.68]} castShadow>
        <boxGeometry args={[0.40, 0.32, 0.04]} />
        <meshStandardMaterial color={c(DARK)} roughness={0.7} />
      </mesh>
    </group>
  );
}

// ─── Shelf ───────────────────────────────────────────────────────────────────
export function Shelf({ w = 1.0 }: { w?: number }) {
  return (
    <group>
      {[0.6, 1.0, 1.4].map((y) => (
        <mesh key={y} position={[0, y, 0]} castShadow receiveShadow>
          <boxGeometry args={[w, 0.03, 0.25]} />
          <meshStandardMaterial color={c(WOOD)} roughness={0.6} />
        </mesh>
      ))}
      {([-w / 2, w / 2] as const).map((x) => (
        <mesh key={x} position={[x, 1.0, 0]} castShadow>
          <boxGeometry args={[0.03, 0.84, 0.25]} />
          <meshStandardMaterial color={c(WOOD)} roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Plant ───────────────────────────────────────────────────────────────────
export function Plant({ s = 1.0 }: { s?: number }) {
  return (
    <group scale={s}>
      {/* pot */}
      <mesh position={[0, 0.12, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.12, 0.09, 0.24, 12]} />
        <meshStandardMaterial color="#8B6F4E" roughness={0.85} />
      </mesh>
      {/* soil */}
      <mesh position={[0, 0.25, 0]}>
        <cylinderGeometry args={[0.11, 0.11, 0.02, 12]} />
        <meshStandardMaterial color="#3E2C1A" roughness={0.95} />
      </mesh>
      {/* foliage */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <sphereGeometry args={[0.25, 10, 10]} />
        <meshStandardMaterial color="#3A6B35" roughness={0.88} />
      </mesh>
      <mesh position={[0.08, 0.72, 0.06]} castShadow>
        <sphereGeometry args={[0.16, 8, 8]} />
        <meshStandardMaterial color="#4A7D42" roughness={0.88} />
      </mesh>
    </group>
  );
}

// ─── Lamp ────────────────────────────────────────────────────────────────────
export function Lamp() {
  return (
    <group>
      {/* base */}
      <mesh position={[0, 0.02, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.12, 0.04, 12]} />
        <meshStandardMaterial color={c(DARK)} roughness={0.5} metalness={0.3} />
      </mesh>
      {/* pole */}
      <mesh position={[0, 0.7, 0]} castShadow>
        <cylinderGeometry args={[0.015, 0.015, 1.36, 8]} />
        <meshStandardMaterial color={c(DARK)} roughness={0.4} metalness={0.4} />
      </mesh>
      {/* shade */}
      <mesh position={[0, 1.42, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.12, 0.28, 12]} />
        <meshStandardMaterial color={c(LINEN)} roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// ─── Crib ────────────────────────────────────────────────────────────────────
export function Crib() {
  return (
    <group>
      {/* base */}
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.65, 0.06, 1.2]} />
        <meshStandardMaterial color={c(WOOD)} roughness={0.7} />
      </mesh>
      {/* mattress */}
      <mesh position={[0, 0.36, 0]} receiveShadow>
        <boxGeometry args={[0.58, 0.06, 1.12]} />
        <meshStandardMaterial color={c(WHITE)} roughness={0.9} />
      </mesh>
      {/* rails */}
      {([-0.3, 0.3] as const).map((x) => (
        <mesh key={x} position={[x, 0.52, 0]} castShadow>
          <boxGeometry args={[0.03, 0.50, 1.2]} />
          <meshStandardMaterial color={c(WOOD)} roughness={0.7} />
        </mesh>
      ))}
      {([-0.55, 0.55] as const).map((z) => (
        <mesh key={z} position={[0, 0.52, z]} castShadow>
          <boxGeometry args={[0.65, 0.50, 0.03]} />
          <meshStandardMaterial color={c(WOOD)} roughness={0.7} />
        </mesh>
      ))}
      {/* legs */}
      {([-0.28, 0.28] as const).map((x) =>
        ([-0.52, 0.52] as const).map((z) => (
          <mesh key={`${x}-${z}`} position={[x, 0.14, z]} castShadow>
            <boxGeometry args={[0.04, 0.28, 0.04]} />
            <meshStandardMaterial color={c(WOOD_D)} roughness={0.7} />
          </mesh>
        )),
      )}
    </group>
  );
}

// ─── ToyBox ──────────────────────────────────────────────────────────────────
export function ToyBox({ color = "#e3b46b" }: { color?: string }) {
  return (
    <group>
      <mesh position={[0, 0.16, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.5, 0.32, 0.35]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
    </group>
  );
}

// ─── KidTable ────────────────────────────────────────────────────────────────
export function KidTable() {
  return (
    <group>
      <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.6, 0.04, 0.6]} />
        <meshStandardMaterial color={c(WOOD)} roughness={0.65} />
      </mesh>
      {([-0.25, 0.25] as const).map((x) =>
        ([-0.25, 0.25] as const).map((z) => (
          <mesh key={`${x}-${z}`} position={[x, 0.2, z]} castShadow>
            <cylinderGeometry args={[0.02, 0.02, 0.40, 8]} />
            <meshStandardMaterial color={c(WOOD_D)} roughness={0.6} />
          </mesh>
        )),
      )}
    </group>
  );
}

// ─── BeanBag ─────────────────────────────────────────────────────────────────
export function BeanBag({ color = "#6f8fbf" }: { color?: string }) {
  return (
    <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
      <sphereGeometry args={[0.3, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  );
}

// ─── Panels (acoustic) ──────────────────────────────────────────────────────
export function Panels() {
  return (
    <group>
      {[-0.4, 0, 0.4].map((dy) => (
        <mesh key={dy} position={[0, 1.3 + dy, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.04, 0.35, 0.8]} />
          <meshStandardMaterial color="#5a6e7a" roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Lounger ─────────────────────────────────────────────────────────────────
export function Lounger({ color = "#d9cfbf" }: { color?: string }) {
  return (
    <group>
      <mesh position={[0, 0.18, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.65, 0.12, 1.7]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      {/* headrest incline */}
      <mesh position={[0, 0.3, -0.68]} rotation={[0.35, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.6, 0.06, 0.5]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      {/* legs */}
      {([-0.26, 0.26] as const).map((x) =>
        ([-0.72, 0.72] as const).map((z) => (
          <mesh key={`${x}-${z}`} position={[x, 0.06, z]} castShadow>
            <boxGeometry args={[0.04, 0.12, 0.04]} />
            <meshStandardMaterial color={c(DARK)} roughness={0.5} metalness={0.3} />
          </mesh>
        )),
      )}
    </group>
  );
}

// ─── Furniture factory — maps type string to component ──────────────────────
export function FurnitureItem({ type, params }: { type: string; params: (number | string)[] }) {
  switch (type) {
    case "sofa":
      return <Sofa w={params[0] as number | undefined} color={params[1] as string | undefined} />;
    case "lsofa":
      return <LSofa color={params[0] as string | undefined} />;
    case "armchair":
      return <Armchair color={params[0] as string | undefined} />;
    case "coffee":
      return <CoffeeTable />;
    case "tv":
      return <TV />;
    case "rug":
      return <Rug w={params[0] as number | undefined} d={params[1] as number | undefined} color={params[2] as string | undefined} />;
    case "dining":
      return <DiningSet n={params[0] as number | undefined} len={params[1] as number | undefined} />;
    case "round":
      return <RoundTable n={params[0] as number | undefined} />;
    case "bed":
      return <Bed w={params[0] as number | undefined} duvetColor={params[1] as string | undefined} />;
    case "nightstand":
      return <Nightstand />;
    case "wardrobe":
      return <Wardrobe w={params[0] as number | undefined} />;
    case "desk":
      return <Desk />;
    case "shelf":
      return <Shelf w={params[0] as number | undefined} />;
    case "plant":
      return <Plant s={params[0] as number | undefined} />;
    case "lamp":
      return <Lamp />;
    case "crib":
      return <Crib />;
    case "toybox":
      return <ToyBox color={params[0] as string | undefined} />;
    case "kidtable":
      return <KidTable />;
    case "beanbag":
      return <BeanBag color={params[0] as string | undefined} />;
    case "panels":
      return <Panels />;
    case "lounger":
      return <Lounger color={params[0] as string | undefined} />;
    default:
      return null;
  }
}
