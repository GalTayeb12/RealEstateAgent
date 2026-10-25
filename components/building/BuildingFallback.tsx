"use client";

import { layoutTowers } from "./layout";
import type { ExplorerBuilding, HoverInfo } from "./types";

function cellColor(status: string, sameType: boolean): string {
  if (status === "reserved") return "#C89B3C";
  if (status === "sold") return "#C5C0B8";
  return sameType ? "#2F8F86" : "#8FB8B4";
}

export default function BuildingFallback({
  buildings,
  activeUnitTypeId,
  onHover,
}: {
  buildings: ExplorerBuilding[];
  activeUnitTypeId: string;
  onHover: (info: HoverInfo | null) => void;
}) {
  const { towers } = layoutTowers(buildings);

  return (
    <div style={{ display: "flex", gap: "1.25rem", justifyContent: "center", alignItems: "flex-end", overflowX: "auto", padding: "1rem 0.5rem 0.25rem", minHeight: 360 }}>
      {towers.map((tower) => (
        <div key={tower.building.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 140 }}>
          <div style={{ textAlign: "center", fontSize: "0.8125rem", fontWeight: 700, color: "#1C1B19" }}>{tower.building.name}</div>
          <div style={{ display: "flex", flexDirection: "column-reverse", gap: 4 }}>
          {[...tower.floors].map((floor) => (
            <div key={floor.floor} style={{ display: "flex", gap: 4, justifyContent: "center" }}>
              {floor.lobby ? (
                <button
                  type="button"
                  onMouseEnter={() => onHover({ buildingName: tower.building.name, floor: floor.floor, lobby: true })}
                  onMouseLeave={() => onHover(null)}
                  onFocus={() => onHover({ buildingName: tower.building.name, floor: floor.floor, lobby: true })}
                  onBlur={() => onHover(null)}
                  style={{ width: "100%", minWidth: 120, height: 22, border: "none", borderRadius: 4, background: "#D9D3C7", cursor: "pointer" }}
                />
              ) : (
                floor.units.map((unit) => (
                  <button
                    key={unit.id}
                    type="button"
                    onMouseEnter={() => onHover({
                      buildingName: tower.building.name,
                      floor: unit.floor,
                      lobby: false,
                      unitNumber: unit.unitNumber,
                      unitLabel: unit.unitLabel,
                      status: unit.status,
                      price: unit.price ?? unit.listPrice,
                    })}
                    onMouseLeave={() => onHover(null)}
                    onFocus={() => onHover({
                      buildingName: tower.building.name,
                      floor: unit.floor,
                      lobby: false,
                      unitNumber: unit.unitNumber,
                      unitLabel: unit.unitLabel,
                      status: unit.status,
                      price: unit.price ?? unit.listPrice,
                    })}
                    onBlur={() => onHover(null)}
                    style={{
                      width: 28,
                      height: 36,
                      border: unit.unitTypeId === activeUnitTypeId ? "2px solid #1F4B4A" : "1px solid rgba(28,27,25,0.08)",
                      borderRadius: 4,
                      background: cellColor(unit.status, unit.unitTypeId === activeUnitTypeId),
                      cursor: "pointer",
                      padding: 0,
                    }}
                    aria-label={unit.unitNumber}
                  />
                ))
              )}
            </div>
          ))}
          </div>
        </div>
      ))}
    </div>
  );
}
