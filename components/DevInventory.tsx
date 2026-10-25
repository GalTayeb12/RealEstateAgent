"use client";

import { useState } from "react";
import { useI18n } from "@/components/LocaleProvider";

export interface InventoryUnit {
  id: string;
  unitTypeId: string;
  floor: number;
  unitNumber: string;
  positionIndex: number;
  status: "available" | "reserved" | "sold" | string;
  price: number | null;
}

export interface InventoryBuilding {
  id: string;
  name: string;
  floorCount: number;
  unitsPerFloor: number;
  units: InventoryUnit[];
}

interface UnitTypeRef {
  id: string;
  unitLabel: string;
}

const cell: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #DDD9D3",
  borderRadius: "0.35rem",
  padding: "0.35rem 0.5rem",
  fontSize: "0.8125rem",
  width: "100%",
  boxSizing: "border-box",
};

export default function DevInventory({
  buildings,
  unitTypes,
  onSaved,
}: {
  buildings: InventoryBuilding[];
  unitTypes: UnitTypeRef[];
  onSaved: () => Promise<void> | void;
}) {
  const { m } = useI18n();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const typeLabel = new Map(unitTypes.map((type) => [type.id, type.unitLabel]));

  async function saveBuilding(building: InventoryBuilding, form: HTMLFormElement) {
    const data = new FormData(form);
    setBusyId(building.id);
    setError("");
    const token = localStorage.getItem("token") ?? "";
    const res = await fetch(`/api/dev/buildings/${building.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: String(data.get("name") ?? ""),
        floorCount: Number(data.get("floorCount")),
        unitsPerFloor: Number(data.get("unitsPerFloor")),
      }),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Save failed");
      return;
    }
    await onSaved();
  }

  async function saveUnit(unit: InventoryUnit, form: HTMLFormElement) {
    const data = new FormData(form);
    const priceRaw = String(data.get("price") ?? "").trim();
    setBusyId(unit.id);
    setError("");
    const token = localStorage.getItem("token") ?? "";
    const res = await fetch(`/api/dev/units/${unit.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        floor: Number(data.get("floor")),
        unitNumber: String(data.get("unitNumber") ?? ""),
        positionIndex: Number(data.get("positionIndex")),
        status: String(data.get("status")),
        price: priceRaw === "" ? null : Number(priceRaw),
      }),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Save failed");
      return;
    }
    await onSaved();
  }

  async function releaseHold(unit: InventoryUnit) {
    if (!window.confirm(m.dev.releaseHoldConfirm)) return;
    setBusyId(unit.id);
    setError("");
    const token = localStorage.getItem("token") ?? "";
    const res = await fetch(`/api/dev/units/${unit.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: "available" }),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Save failed");
      return;
    }
    await onSaved();
  }

  if (buildings.length === 0) {
    return (
      <p style={{ margin: 0, padding: "0.875rem 1.375rem", fontSize: "0.8125rem", color: "#9A958F" }}>
        {m.dev.noApartments}
      </p>
    );
  }

  return (
    <div style={{ borderTop: "1px solid #F0EDE8", padding: "1rem 1.375rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9A958F" }}>
        {m.dev.apartments}
      </div>
      {error && <p style={{ margin: 0, color: "#B04040", fontSize: "0.8125rem" }}>{error}</p>}
      {buildings.map((building) => (
        <div key={building.id} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void saveBuilding(building, event.currentTarget);
            }}
            style={{ display: "flex", gap: "0.625rem", flexWrap: "wrap", alignItems: "end" }}
          >
            <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem", fontSize: "0.6875rem", color: "#6B6860", fontWeight: 600 }}>
              {m.dev.buildingName}
              <input name="name" defaultValue={building.name} style={{ ...cell, minWidth: "8rem" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem", fontSize: "0.6875rem", color: "#6B6860", fontWeight: 600 }}>
              {m.dev.floors}
              <input name="floorCount" type="number" min={1} defaultValue={building.floorCount} style={{ ...cell, width: "5.5rem" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem", fontSize: "0.6875rem", color: "#6B6860", fontWeight: 600 }}>
              {m.dev.perFloor}
              <input name="unitsPerFloor" type="number" min={1} defaultValue={building.unitsPerFloor} style={{ ...cell, width: "5.5rem" }} />
            </label>
            <button
              type="submit"
              disabled={busyId === building.id}
              style={{ padding: "0.4rem 0.75rem", borderRadius: "0.35rem", border: "1px solid #1F4B4A", background: "#1F4B4A", color: "#fff", fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer" }}
            >
              {m.dev.saveRow}
            </button>
          </form>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
              <thead>
                <tr style={{ color: "#6B6860", textAlign: "start" }}>
                  <th style={{ fontWeight: 600, padding: "0.35rem" }}>{m.dev.floor}</th>
                  <th style={{ fontWeight: 600, padding: "0.35rem" }}>{m.dev.unitNumber}</th>
                  <th style={{ fontWeight: 600, padding: "0.35rem" }}>{m.dev.position}</th>
                  <th style={{ fontWeight: 600, padding: "0.35rem" }}>{m.dev.unitLabel}</th>
                  <th style={{ fontWeight: 600, padding: "0.35rem" }}>{m.dev.priceOverride}</th>
                  <th style={{ fontWeight: 600, padding: "0.35rem" }}>{m.dev.aptStatus}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {building.units.map((unit) => (
                  <tr key={unit.id} style={{ borderTop: "1px solid #F0EDE8" }}>
                    <td colSpan={7} style={{ padding: 0 }}>
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void saveUnit(unit, event.currentTarget);
                        }}
                        style={{ display: "grid", gridTemplateColumns: "4.5rem 6rem 5.5rem 1fr 8rem 7rem auto", gap: "0.4rem", alignItems: "center", padding: "0.4rem 0" }}
                      >
                        <input name="floor" type="number" defaultValue={unit.floor} style={cell} />
                        <input name="unitNumber" defaultValue={unit.unitNumber} style={cell} />
                        <input name="positionIndex" type="number" min={0} defaultValue={unit.positionIndex} style={cell} />
                        <span style={{ color: "#1C1B19" }}>{typeLabel.get(unit.unitTypeId) ?? unit.unitTypeId}</span>
                        <input name="price" type="number" min={0} defaultValue={unit.price ?? ""} placeholder="—" style={cell} />
                        <select name="status" defaultValue={unit.status} style={cell}>
                          <option value="available">{m.dev.statusAvailable}</option>
                          <option value="reserved">{m.dev.statusReserved}</option>
                          <option value="sold">{m.dev.statusSold}</option>
                        </select>
                        <div style={{ display: "flex", gap: "0.35rem", justifyContent: "flex-end" }}>
                          {unit.status === "reserved" && (
                            <button
                              type="button"
                              disabled={busyId === unit.id}
                              onClick={() => void releaseHold(unit)}
                              style={{ padding: "0.35rem 0.65rem", borderRadius: "0.35rem", border: "1px solid #E7C9C9", background: "#FDF6F6", color: "#8C3030", fontSize: "0.75rem", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                            >
                              {m.dev.releaseHold}
                            </button>
                          )}
                          <button
                            type="submit"
                            disabled={busyId === unit.id}
                            style={{ padding: "0.35rem 0.65rem", borderRadius: "0.35rem", border: "1px solid #DDD9D3", background: "#fff", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer" }}
                          >
                            {m.dev.saveRow}
                          </button>
                        </div>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
