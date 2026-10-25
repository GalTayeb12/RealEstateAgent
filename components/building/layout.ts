import type { ExplorerBuilding, ExplorerUnit } from "./types";

export const SLOT = 1.02;
export const HOME_H = 0.9;
export const LOBBY_H = 0.42;
const GAP = 2.4;

export interface FloorLayout {
  floor: number;
  y: number;
  h: number;
  w: number;
  lobby: boolean;
  units: ExplorerUnit[];
}

export interface TowerLayout {
  building: ExplorerBuilding;
  floors: FloorLayout[];
  height: number;
  width: number;
  x: number;
}

export function layoutTowers(buildings: ExplorerBuilding[]): {
  towers: TowerLayout[];
  maxHeight: number;
} {
  const measured = buildings.map((building) => {
    const byFloor = new Map<number, ExplorerUnit[]>();
    for (const unit of building.units) {
      const list = byFloor.get(unit.floor) ?? [];
      list.push(unit);
      byFloor.set(unit.floor, list);
    }
    let residentialWidth = SLOT;
    for (const list of byFloor.values()) {
      list.sort((a, b) => a.positionIndex - b.positionIndex || a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true }));
      residentialWidth = Math.max(residentialWidth, list.length * SLOT);
    }
    const floors: FloorLayout[] = [];
    let y = 0;
    for (let floor = 1; floor <= building.floorCount; floor++) {
      const units = byFloor.get(floor) ?? [];
      const lobby = units.length === 0;
      const h = lobby ? LOBBY_H : HOME_H;
      const w = lobby ? residentialWidth : Math.max(units.length, 1) * SLOT;
      floors.push({ floor, y, h, w, lobby, units });
      y += h + 0.045;
    }
    return { building, floors, height: y, width: residentialWidth, x: 0 };
  });

  let cursor = 0;
  for (const tower of measured) {
    tower.x = cursor + tower.width / 2;
    cursor += tower.width + GAP;
  }
  const total = Math.max(cursor - GAP, SLOT);
  const shift = total / 2;
  for (const tower of measured) tower.x -= shift;

  return {
    towers: measured,
    maxHeight: Math.max(0.5, ...measured.map((tower) => tower.height)),
  };
}

export function unitX(index: number, count: number): number {
  const row = count * SLOT;
  return -row / 2 + SLOT / 2 + index * SLOT;
}
