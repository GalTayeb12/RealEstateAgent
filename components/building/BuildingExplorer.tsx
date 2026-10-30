"use client";

import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "@/components/LocaleProvider";
import { Money } from "@/components/Money";
import { formatUsdFromIls } from "@/lib/i18n/currency";
import BuildingFallback from "./BuildingFallback";
import type { ExplorerBuilding, FloorSelection, HoverInfo } from "./types";

const BuildingCanvas   = dynamic(() => import("./BuildingCanvas"),   { ssr: false });
const BuildingGLBScene = dynamic(() => import("./BuildingGLBScene"), { ssr: false });

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

class CanvasGuard extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function statusLabel(
  status: string | undefined,
  labels: { available: string; reserved: string; sold: string },
): string {
  if (status === "reserved") return labels.reserved;
  if (status === "sold") return labels.sold;
  return labels.available;
}

// ── Unit data from API ────────────────────────────────────────────────────────
interface UnitCardData {
  id: string;
  unitNumber: string;
  floor: number;
  positionIndex: number;
  status: string;
  price: number | null;
  listPrice: number;
  unitTypeId: string;
  buildingId: string;
  building: { id: string; name: string; floorCount: number };
  unitType: {
    unitLabel: string;
    attributes: Record<string, unknown>;
    floorPlanUrl: string | null;
    galleryCount: number;
    panoramaCount: number;
  };
}

// ── Floor panel (side panel on desktop, bottom sheet on mobile) ───────────────
function FloorPanel({
  selectedFloor,
  building,
  maxFloor,
  floorUnits,
  selectedUnitId,
  hoveredUnitId,
  isRtl,
  copy,
  explorerCopy,
  onBack,
  onFloorNav,
  onUnitClick,
  onUnitHover,
}: {
  selectedFloor: FloorSelection;
  building: ExplorerBuilding;
  maxFloor: number;
  floorUnits: ExplorerBuilding["units"];
  selectedUnitId: string | null;
  hoveredUnitId: string | null;
  isRtl: boolean;
  copy: {
    backToBuilding: string;
    floor: string;
    penthouse: string;
    available: string;
    reserved: string;
    sold: string;
    apartment: string;
    price: string;
    clickUnit: string;
    prevFloor: string;
    nextFloor: string;
    noUnits: string;
    escHint: string;
  };
  explorerCopy: { available: string; reserved: string; sold: string };
  onBack: () => void;
  onFloorNav: (delta: number) => void;
  onUnitClick: (unitId: string) => void;
  onUnitHover: (unitId: string | null) => void;
}) {
  const isPenthouse = selectedFloor.floor === maxFloor && floorUnits.length > 0;
  const floorTitle = isPenthouse ? copy.penthouse : `${copy.floor} ${selectedFloor.floor}`;

  const statusColor = (s: string) =>
    s === "sold" ? "#8090A8" : s === "reserved" ? "#C89B3C" : "#8AAEC2";

  const dir = isRtl ? "rtl" : "ltr";

  return (
    <div
      className="hn-floor-panel"
      style={{
        position: "absolute",
        top: 0, bottom: 0, right: 0,
        width: 272,
        background: "rgba(6,14,24,0.74)",
        backdropFilter: "blur(20px) saturate(1.5)",
        borderLeft: "1px solid rgba(90,180,255,0.13)",
        boxShadow: "-8px 0 40px rgba(0,0,0,0.45), inset 1px 0 0 rgba(255,255,255,0.04)",
        display: "flex",
        flexDirection: "column",
        zIndex: 10,
        overflowY: "hidden",
        direction: dir,
      }}
    >
      {/* ── Header ── */}
      <div style={{
        padding: "0.75rem 0.875rem",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          title={copy.backToBuilding}
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "none",
            color: "#9AAAB8",
            cursor: "pointer",
            width: 30,
            height: 30,
            borderRadius: 6,
            fontSize: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {isRtl ? "→" : "←"}
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#CBD5E0", fontSize: "0.875rem", fontWeight: 700, lineHeight: 1.2 }}>
            {floorTitle}
          </div>
          <div style={{ color: "#4A6070", fontSize: "0.6875rem", marginTop: 1 }}>{building.name}</div>
        </div>

        {/* Floor navigation: prev / number / next */}
        <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
          <button
            onClick={() => onFloorNav(-1)}
            disabled={selectedFloor.floor <= 1}
            title={copy.prevFloor}
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "none",
              color: selectedFloor.floor <= 1 ? "#2E3E4C" : "#9AAAB8",
              cursor: selectedFloor.floor <= 1 ? "default" : "pointer",
              width: 26, height: 26,
              borderRadius: 5, fontSize: 12,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            ▼
          </button>
          <span style={{ color: "#647888", fontSize: "0.6875rem", width: 22, textAlign: "center" }}>
            {selectedFloor.floor}
          </span>
          <button
            onClick={() => onFloorNav(1)}
            disabled={selectedFloor.floor >= maxFloor}
            title={copy.nextFloor}
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "none",
              color: selectedFloor.floor >= maxFloor ? "#2E3E4C" : "#9AAAB8",
              cursor: selectedFloor.floor >= maxFloor ? "default" : "pointer",
              width: 26, height: 26,
              borderRadius: 5, fontSize: 12,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            ▲
          </button>
        </div>
      </div>

      <div style={{
        padding: "0.3rem 0.875rem",
        background: "rgba(0,0,0,0.2)",
        fontSize: "0.625rem",
        color: "#3A5060",
        flexShrink: 0,
      }}>
        {copy.escHint}
      </div>

      {/* ── Unit list ── */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {floorUnits.length === 0 ? (
          <div style={{ padding: "1rem 0.875rem", color: "#4A6070", fontSize: "0.8125rem" }}>
            {copy.noUnits}
          </div>
        ) : (
          floorUnits.map((unit) => {
            const isSelected = unit.id === selectedUnitId;
            const isHovered = unit.id === hoveredUnitId;
            const sc = statusColor(unit.status);
            const sl = statusLabel(unit.status, {
              available: copy.available,
              reserved: copy.reserved,
              sold: copy.sold,
            });
            const price = (unit.price ?? unit.listPrice) || 0;

            return (
              <div
                key={unit.id}
                onClick={() => onUnitClick(unit.id)}
                onMouseEnter={() => onUnitHover(unit.id)}
                onMouseLeave={() => onUnitHover(null)}
                style={{
                  padding: "0.5rem 0.875rem",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  cursor: "pointer",
                  background:
                    isSelected ? "rgba(68,136,204,0.18)"
                    : isHovered ? "rgba(255,255,255,0.04)"
                    : "transparent",
                  transition: "background 0.12s",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.625rem",
                }}
              >
                <span style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: sc, flexShrink: 0,
                  boxShadow: isSelected ? `0 0 6px ${sc}` : "none",
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.25rem" }}>
                    <span style={{
                      color: isSelected ? "#E8EFF6" : "#CBD5E0",
                      fontSize: "0.8125rem",
                      fontWeight: isSelected ? 700 : 600,
                    }}>
                      {copy.apartment} {unit.unitNumber}
                    </span>
                    <span style={{ color: "#7A8E9E", fontSize: "0.6875rem", flexShrink: 0 }}>
                      {unit.unitLabel}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 1 }}>
                    <span style={{ color: sc, fontSize: "0.625rem", fontWeight: 600 }}>{sl}</span>
                    {price > 0 && (
                      <span style={{ color: "#8AAEC2", fontSize: "0.75rem" }}>
                        <Money amount={price} />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div style={{
        padding: "0.5rem 0.875rem",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        fontSize: "0.625rem",
        color: "#3A5060",
        flexShrink: 0,
      }}>
        {copy.clickUnit}
      </div>
    </div>
  );
}

// ── Unit card panel (Phase 3) ─────────────────────────────────────────────────
function UnitCard({
  unitData,
  loading,
  isRtl,
  copy,
  onBack,
  onBackToBuilding,
}: {
  unitData: UnitCardData | null;
  loading: boolean;
  isRtl: boolean;
  copy: {
    backToFloor: string;
    backToBuilding: string;
    apartment: string;
    floor: string;
    building: string;
    rooms: string;
    area: string;
    areaUnit: string;
    balcony: string;
    direction: string;
    price: string;
    estimatedUsd: string;
    status: string;
    available: string;
    reserved: string;
    sold: string;
    reserve: string;
    reserving: string;
    floorPlan: string;
    floorPlanFullscreen: string;
    noFloorPlan: string;
    gallery: string;
    panorama: string;
    escHint: string;
    loading: string;
  };
  onBack: () => void;
  onBackToBuilding: () => void;
}) {
  const [reserving, setReserving] = useState(false);
  const [reserveError, setReserveError] = useState<string | null>(null);
  const [floorPlanOpen, setFloorPlanOpen] = useState(false);

  const dir = isRtl ? "rtl" : "ltr";

  const handleReserve = useCallback(async () => {
    if (!unitData) return;
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?next=${next}`;
      return;
    }
    setReserving(true);
    setReserveError(null);
    try {
      const res = await fetch("/api/offers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          unitTypeId: unitData.unitTypeId,
          offeredPrice: unitData.listPrice,
          unitId: unitData.id,
        }),
      });
      if (res.status === 401) {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `/login?next=${next}`;
        return;
      }
      const data = await res.json();
      if (data.offer?.id) {
        window.location.href = `/deal/${data.offer.id}`;
        return;
      }
      setReserveError(data.error ?? "שגיאה בהזמנה");
    } catch {
      setReserveError("שגיאה בהזמנה");
    } finally {
      setReserving(false);
    }
  }, [unitData]);

  const statusColor = (s: string) =>
    s === "sold" ? "#8090A8" : s === "reserved" ? "#C89B3C" : "#52B880";

  const statusCopy = (s: string) =>
    s === "sold" ? copy.sold : s === "reserved" ? copy.reserved : copy.available;

  return (
    <div
      className="hn-floor-panel"
      style={{
        position: "absolute",
        top: 0, bottom: 0, right: 0,
        width: 288,
        background: "rgba(6,14,24,0.74)",
        backdropFilter: "blur(20px) saturate(1.5)",
        borderLeft: "1px solid rgba(90,180,255,0.13)",
        boxShadow: "-8px 0 40px rgba(0,0,0,0.45), inset 1px 0 0 rgba(255,255,255,0.04)",
        display: "flex",
        flexDirection: "column",
        zIndex: 10,
        overflowY: "hidden",
        direction: dir,
      }}
    >
      {/* ── Header ── */}
      <div style={{
        padding: "0.75rem 0.875rem",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          title={copy.backToFloor}
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "none",
            color: "#9AAAB8",
            cursor: "pointer",
            width: 30, height: 30,
            borderRadius: 6, fontSize: 16,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {isRtl ? "→" : "←"}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#CBD5E0", fontSize: "0.875rem", fontWeight: 700, lineHeight: 1.2 }}>
            {unitData
              ? `${copy.apartment} ${unitData.unitNumber}`
              : loading ? copy.loading : "—"}
          </div>
          {unitData && (
            <div style={{ color: "#4A6070", fontSize: "0.6875rem", marginTop: 1 }}>
              {unitData.building.name} · {copy.floor} {unitData.floor}
            </div>
          )}
        </div>
      </div>

      <div style={{
        padding: "0.3rem 0.875rem",
        background: "rgba(0,0,0,0.2)",
        fontSize: "0.625rem",
        color: "#3A5060",
        flexShrink: 0,
      }}>
        {copy.escHint}
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0.75rem 0.875rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>

        {loading && (
          <div style={{ color: "#4A6070", fontSize: "0.8125rem" }}>{copy.loading}</div>
        )}

        {unitData && (
          <>
            {/* Status badge */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: statusColor(unitData.status),
                flexShrink: 0,
                boxShadow: `0 0 6px ${statusColor(unitData.status)}`,
              }} />
              <span style={{ color: statusColor(unitData.status), fontSize: "0.75rem", fontWeight: 700 }}>
                {statusCopy(unitData.status)}
              </span>
            </div>

            {/* Attributes */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              {typeof unitData.unitType.attributes.rooms !== "undefined" && (
                <Row label={copy.rooms} value={String(unitData.unitType.attributes.rooms)} />
              )}
              {typeof unitData.unitType.attributes.area !== "undefined" && (
                <Row
                  label={copy.area}
                  value={`${unitData.unitType.attributes.area} ${copy.areaUnit}`}
                />
              )}
              {typeof unitData.unitType.attributes.balcony !== "undefined" && (
                <Row
                  label={copy.balcony}
                  value={String(unitData.unitType.attributes.balcony)}
                />
              )}
              {typeof unitData.unitType.attributes.direction !== "undefined" && (
                <Row
                  label={copy.direction}
                  value={String(unitData.unitType.attributes.direction)}
                />
              )}
            </div>

            {/* Price — data-display style */}
            {(unitData.price ?? unitData.listPrice) > 0 && (
              <div style={{
                background: "linear-gradient(135deg, rgba(20,40,60,0.7) 0%, rgba(10,24,36,0.5) 100%)",
                border: "1px solid rgba(80,160,200,0.15)",
                borderRadius: 10,
                padding: "0.75rem 0.875rem",
              }}>
                <div style={{ color: "#3A7888", fontSize: "0.5625rem", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>{copy.price}</div>
                <div style={{ color: "#E8F4FF", fontSize: "1.125rem", fontWeight: 800, letterSpacing: "-0.01em", lineHeight: 1.1 }}>
                  <Money amount={(unitData.price ?? unitData.listPrice)} />
                </div>
                <div style={{ color: "#3A5060", fontSize: "0.6875rem", marginTop: 4, letterSpacing: "0.01em" }}>
                  ≈ {formatUsdFromIls(unitData.price ?? unitData.listPrice)} {copy.estimatedUsd}
                </div>
              </div>
            )}

            {/* Media links */}
            {(unitData.unitType.galleryCount > 0 || unitData.unitType.panoramaCount > 0 || unitData.unitType.floorPlanUrl) && (
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {unitData.unitType.floorPlanUrl && (
                  <button
                    onClick={() => setFloorPlanOpen(true)}
                    style={{
                      background: "rgba(68,120,180,0.15)",
                      border: "1px solid rgba(68,120,180,0.3)",
                      color: "#8AAEC2",
                      cursor: "pointer",
                      padding: "0.3rem 0.625rem",
                      borderRadius: 5,
                      fontSize: "0.6875rem",
                      fontWeight: 600,
                    }}
                  >
                    📐 {copy.floorPlan}
                  </button>
                )}
                {unitData.unitType.galleryCount > 0 && (
                  <span style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: "#7A8E9E",
                    padding: "0.3rem 0.625rem",
                    borderRadius: 5,
                    fontSize: "0.6875rem",
                  }}>
                    🖼 {copy.gallery} {unitData.unitType.galleryCount}
                  </span>
                )}
                {unitData.unitType.panoramaCount > 0 && (
                  <span style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: "#7A8E9E",
                    padding: "0.3rem 0.625rem",
                    borderRadius: 5,
                    fontSize: "0.6875rem",
                  }}>
                    🔄 {copy.panorama}
                  </span>
                )}
              </div>
            )}

            {/* Reserve button */}
            {unitData.status === "available" && (
              <div>
                <button
                  onClick={handleReserve}
                  disabled={reserving}
                  style={{
                    width: "100%",
                    padding: "0.6875rem 1rem",
                    background: reserving
                      ? "rgba(20,90,100,0.4)"
                      : "linear-gradient(135deg, #1A7A8A 0%, #15616E 100%)",
                    border: "1px solid rgba(100,220,200,0.25)",
                    borderRadius: 8,
                    color: "#D4F5EF",
                    fontSize: "0.875rem",
                    fontWeight: 700,
                    cursor: reserving ? "default" : "pointer",
                    transition: "opacity 0.15s",
                    letterSpacing: "0.01em",
                    boxShadow: reserving ? "none" : "0 2px 14px rgba(20,120,140,0.35)",
                  }}
                >
                  {reserving ? copy.reserving : copy.reserve}
                </button>
                {reserveError && (
                  <div style={{ color: "#E08080", fontSize: "0.75rem", marginTop: "0.375rem", textAlign: "center" }}>
                    {reserveError}
                  </div>
                )}
              </div>
            )}

            {/* Back to building shortcut */}
            <button
              onClick={onBackToBuilding}
              style={{
                background: "none",
                border: "none",
                color: "#3A5060",
                cursor: "pointer",
                fontSize: "0.625rem",
                padding: 0,
                textAlign: isRtl ? "right" : "left",
              }}
            >
              {copy.backToBuilding}
            </button>
          </>
        )}
      </div>

      {/* ── Floor plan fullscreen lightbox ── */}
      {floorPlanOpen && unitData?.unitType.floorPlanUrl && (
        <div
          onClick={() => setFloorPlanOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.88)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "zoom-out",
          }}
        >
          <img
            src={unitData.unitType.floorPlanUrl}
            alt="floor plan"
            style={{
              maxWidth: "90vw",
              maxHeight: "88vh",
              objectFit: "contain",
              borderRadius: 8,
              boxShadow: "0 4px 40px rgba(0,0,0,0.7)",
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

// ── Simple label+value row helper ─────────────────────────────────────────────
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "baseline",
      gap: "0.5rem", padding: "0.2rem 0",
      borderBottom: "1px solid rgba(255,255,255,0.04)",
    }}>
      <span style={{ color: "#3A6070", fontSize: "0.625rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
      <span style={{ color: "#C8D8E8", fontSize: "0.875rem", fontWeight: 700 }}>{value}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function BuildingExplorer({
  buildings,
  activeUnitTypeId,
}: {
  buildings: ExplorerBuilding[];
  activeUnitTypeId: string;
}) {
  const { m, locale } = useI18n();
  const isRtl = locale === "he";

  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Phase 2 state
  const [selectedFloor, setSelectedFloor] = useState<FloorSelection | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [hoveredUnitId, setHoveredUnitId] = useState<string | null>(null);

  // Phase 3 state
  const [unitData, setUnitData] = useState<UnitCardData | null>(null);
  const [unitDataLoading, setUnitDataLoading] = useState(false);

  useEffect(() => { setWebgl(hasWebGL()); }, []);

  // ── Unit data fetch ──
  useEffect(() => {
    if (!selectedUnitId) { setUnitData(null); return; }
    setUnitDataLoading(true);
    fetch(`/api/buildings/unit/${selectedUnitId}`)
      .then((r) => r.json())
      .then((d) => { setUnitData(d.unit ?? null); setUnitDataLoading(false); })
      .catch(() => setUnitDataLoading(false));
  }, [selectedUnitId]);

  // ── URL state: read on mount + browser back ──
  useEffect(() => {
    const read = () => {
      const p = new URLSearchParams(window.location.search);
      const b = p.get("building");
      const f = p.get("floor");
      const u = p.get("unit");
      const n = f ? parseInt(f, 10) : NaN;
      setSelectedFloor(b && !isNaN(n) ? { buildingId: b, floor: n } : null);
      setSelectedUnitId(u ?? null);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  // ── Escape key: step back one level ──
  const handleBack = useCallback(() => {
    if (selectedUnitId) {
      setSelectedUnitId(null);
      setUnitData(null);
      const url = new URL(window.location.href);
      url.searchParams.delete("unit");
      window.history.pushState(null, "", url.toString());
    } else if (selectedFloor) {
      setSelectedFloor(null);
      setSelectedUnitId(null);
      setUnitData(null);
      const url = new URL(window.location.href);
      url.searchParams.delete("building");
      url.searchParams.delete("floor");
      url.searchParams.delete("unit");
      window.history.pushState(null, "", url.toString());
    }
  }, [selectedUnitId, selectedFloor]);

  const handleBackToBuilding = useCallback(() => {
    setSelectedFloor(null);
    setSelectedUnitId(null);
    setUnitData(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("building");
    url.searchParams.delete("floor");
    url.searchParams.delete("unit");
    window.history.pushState(null, "", url.toString());
  }, []);

  useEffect(() => {
    if (!selectedFloor && !selectedUnitId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleBack();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedFloor, selectedUnitId, handleBack]);

  // ── Handlers ──
  const onHover = useCallback((info: HoverInfo | null, id: string | null = null) => {
    setHover(info);
    setHoveredId(id);
  }, []);

  const handleFloorClick = useCallback((buildingId: string, floor: number) => {
    setSelectedFloor({ buildingId, floor });
    setSelectedUnitId(null);
    setUnitData(null);
    const url = new URL(window.location.href);
    url.searchParams.set("building", buildingId);
    url.searchParams.set("floor", String(floor));
    url.searchParams.delete("unit");
    window.history.pushState(null, "", url.toString());
  }, []);

  const handleFloorNav = useCallback(
    (delta: number) => {
      if (!selectedFloor) return;
      const building = buildings.find((b) => b.id === selectedFloor.buildingId);
      if (!building) return;
      const maxFloor = Math.max(...building.units.map((u) => u.floor), 1);
      const next = selectedFloor.floor + delta;
      if (next < 1 || next > maxFloor) return;
      const hasUnits = building.units.some((u) => u.floor === next);
      if (!hasUnits) {
        handleFloorNav(delta > 0 ? delta + 1 : delta - 1);
        return;
      }
      setSelectedFloor({ buildingId: selectedFloor.buildingId, floor: next });
      setSelectedUnitId(null);
      setUnitData(null);
      const url = new URL(window.location.href);
      url.searchParams.set("building", selectedFloor.buildingId);
      url.searchParams.set("floor", String(next));
      url.searchParams.delete("unit");
      window.history.pushState(null, "", url.toString());
    },
    [selectedFloor, buildings],
  );

  const handleUnitClick = useCallback((unitId: string) => {
    setSelectedUnitId((prev) => {
      const next = prev === unitId ? null : unitId;
      const url = new URL(window.location.href);
      if (next) {
        url.searchParams.set("unit", next);
      } else {
        url.searchParams.delete("unit");
        setUnitData(null);
      }
      window.history.pushState(null, "", url.toString());
      return next;
    });
  }, []);

  const handleUnitHover = useCallback((unitId: string | null) => {
    setHoveredUnitId(unitId);
  }, []);

  // ── GLB detection ──
  const glbBuilding = buildings.find((b) => b.modelUrl?.endsWith(".glb"));
  const glbUrl  = glbBuilding?.modelUrl ?? null;
  const metaUrl = glbUrl ? glbUrl.replace(".glb", "-meta.json") : null;

  // ── Panel data ──
  const selectedBuilding = useMemo(
    () => (selectedFloor ? buildings.find((b) => b.id === selectedFloor.buildingId) : null),
    [selectedFloor, buildings],
  );
  const maxFloor = useMemo(
    () => (selectedBuilding ? Math.max(...selectedBuilding.units.map((u) => u.floor), 1) : 1),
    [selectedBuilding],
  );
  const floorUnits = useMemo(() => {
    if (!selectedFloor || !selectedBuilding) return [];
    return [...selectedBuilding.units.filter((u) => u.floor === selectedFloor.floor)].sort(
      (a, b) => a.positionIndex - b.positionIndex,
    );
  }, [selectedFloor, selectedBuilding]);

  const floorPlanUrl = unitData?.unitType?.floorPlanUrl ?? null;

  const copy = m.explorer;
  const floorCopy = m.floorView;
  const unitCopy = m.unitView;

  // ── Breadcrumb parts for HUD ──
  const breadcrumbParts = useMemo((): string[] | null => {
    if (!selectedBuilding) return null;
    const parts: string[] = [selectedBuilding.name];
    if (selectedFloor) {
      const isPenth = selectedFloor.floor === maxFloor && floorUnits.length > 0;
      parts.push(isPenth ? floorCopy.penthouse : `${floorCopy.floor} ${selectedFloor.floor}`);
    }
    if (selectedUnitId && unitData) {
      parts.push(`${unitCopy.apartment} ${unitData.unitNumber}`);
    }
    return parts;
  }, [selectedBuilding, selectedFloor, maxFloor, floorUnits, selectedUnitId, unitData, floorCopy, unitCopy]);

  const legend = [
    { color: "#8AAEC2", label: copy.available },
    { color: "#8090A8", label: copy.sold },
    { color: "#5C8AA2", label: copy.lobby },
    { color: "#C89B3C", label: copy.reserved },
  ];

  const showUnitCard = !!(selectedUnitId && selectedFloor && glbUrl);
  const showFloorPanel = !!(selectedFloor && !selectedUnitId && selectedBuilding && glbUrl);

  // Hover status text (shown in HUD)
  const hoverText = useMemo(() => {
    if (selectedUnitId && unitData)
      return `${unitData.building.name} · ${copy.floor} ${unitData.floor} · ${copy.apartment} ${unitData.unitNumber}`;
    if (selectedFloor)
      return `${selectedBuilding?.name} · ${selectedFloor.floor === maxFloor && floorUnits.length > 0 ? floorCopy.penthouse : `${floorCopy.floor} ${selectedFloor.floor}`} · ${floorUnits.filter(u => u.status === "available").length} ${copy.available}`;
    if (hover) {
      if (hover.lobby) return `${hover.buildingName} · ${copy.floor} ${hover.floor} · ${copy.lobby}`;
      if (hover.availableCount !== undefined)
        return `${hover.buildingName} · ${hover.isPenthouse ? copy.penthouse : `${copy.floor} ${hover.floor}`} · ${hover.availableCount > 0 ? `${hover.availableCount} ${copy.available}` : copy.sold}`;
      return `${hover.buildingName} · ${copy.floor} ${hover.floor} · ${copy.apartment} ${hover.unitNumber}${hover.unitLabel ? ` · ${hover.unitLabel}` : ""}`;
    }
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUnitId, unitData, selectedFloor, selectedBuilding, maxFloor, floorUnits, hover, copy, floorCopy]);

  return (
    <section style={{
      marginBottom: "2.5rem",
      position: "relative",
    }}>
      {/* ── Project title above canvas ── */}
      <div style={{
        textAlign: "center",
        padding: "1.5rem 1rem 0.5rem",
        background: "#FAF8F4",
      }}>
        <h2 style={{
          fontFamily: "var(--font-fraunces, serif)",
          fontSize: "clamp(1.25rem, 2.5vw, 1.75rem)",
          fontWeight: 800,
          color: "#14130F",
          margin: "0 0 0.125rem",
          letterSpacing: "-0.01em",
        }}>
          {copy.title}
        </h2>
        {webgl && (
          <p style={{ fontSize: "0.8125rem", color: "#9E9C96", margin: 0 }}>
            {selectedUnitId ? unitCopy.escHint : selectedFloor ? floorCopy.escHint : copy.drag}
          </p>
        )}
      </div>

      {/* ── Immersive full-width stage ── */}
      <div style={{ position: "relative" }}>
        <style>{`
          .hn-building-stage { height: clamp(480px, 70vh, 700px); position: relative; }

          @keyframes hn-panel-in {
            from { transform: translateX(calc(var(--dir,1) * 100%)); opacity: 0; }
            to   { transform: translateX(0);                         opacity: 1; }
          }
          .hn-floor-panel {
            animation: hn-panel-in 0.28s cubic-bezier(0.22, 1, 0.36, 1) both;
            --dir: 1;
          }
          [dir="rtl"] .hn-floor-panel { --dir: -1; }

          @media (prefers-reduced-motion: reduce) {
            .hn-floor-panel { animation: none; }
          }

          @media (max-width: 640px) {
            .hn-building-stage { height: 480px !important; }
            .hn-floor-panel {
              top: auto !important;
              right: 0 !important; left: 0 !important; bottom: 0 !important;
              width: auto !important; height: 55vh !important;
              border-left: none !important;
              border-top: 1px solid rgba(90,180,255,0.15) !important;
              animation: none !important;
            }
          }
        `}</style>

        <div className="hn-building-stage">
          {/* 3D canvas */}
          {webgl === null ? null : webgl ? (
            <CanvasGuard
              fallback={
                <BuildingFallback
                  buildings={buildings}
                  activeUnitTypeId={activeUnitTypeId}
                  onHover={(info) => onHover(info)}
                />
              }
            >
              {glbUrl && metaUrl ? (
                <BuildingGLBScene
                  glbUrl={glbUrl}
                  metaUrl={metaUrl}
                  buildings={buildings}
                  activeUnitTypeId={activeUnitTypeId}
                  selectedFloor={selectedFloor}
                  selectedUnitId={selectedUnitId}
                  hoveredUnitId={hoveredUnitId}
                  floorPlanUrl={floorPlanUrl}
                  onHover={onHover}
                  onFloorClick={handleFloorClick}
                  onUnitClick={handleUnitClick}
                  onUnitHover={handleUnitHover}
                />
              ) : (
                <BuildingCanvas
                  buildings={buildings}
                  activeUnitTypeId={activeUnitTypeId}
                  hoveredId={hoveredId}
                  onHover={onHover}
                />
              )}
            </CanvasGuard>
          ) : (
            <BuildingFallback
              buildings={buildings}
              activeUnitTypeId={activeUnitTypeId}
              onHover={(info) => onHover(info)}
            />
          )}

          {/* ── Gradient edge fades ── */}
          <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2 }}>
            {/* top */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 70,
              background: "linear-gradient(to bottom, #FAF8F4 0%, transparent 100%)" }} />
            {/* bottom */}
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 90,
              background: "linear-gradient(to top, #FAF8F4 0%, transparent 100%)" }} />
            {/* left */}
            <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 80,
              background: "linear-gradient(to right, #FAF8F4 0%, transparent 100%)" }} />
            {/* right */}
            <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 80,
              background: "linear-gradient(to left, #FAF8F4 0%, transparent 100%)" }} />
          </div>

          {/* ── Breadcrumb HUD ── */}
          {breadcrumbParts && breadcrumbParts.length > 1 && (
            <div style={{
              position: "absolute",
              top: 16,
              [isRtl ? "right" : "left"]: 16,
              zIndex: 5,
              display: "flex",
              alignItems: "center",
              gap: "0.3rem",
              background: "rgba(6,14,24,0.68)",
              backdropFilter: "blur(12px) saturate(1.3)",
              border: "1px solid rgba(90,180,255,0.12)",
              borderRadius: 20,
              padding: "0.25rem 0.75rem",
              fontSize: "0.75rem",
              color: "#9AAAB8",
              direction: "ltr",
            }}>
              {breadcrumbParts.map((part, i) => (
                <span key={i} style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                  {i > 0 && <span style={{ color: "#3A5060", fontSize: "0.625rem" }}>›</span>}
                  <span style={{ color: i === breadcrumbParts.length - 1 ? "#CBD5E0" : "#647888", fontWeight: i === breadcrumbParts.length - 1 ? 700 : 400 }}>
                    {part}
                  </span>
                </span>
              ))}
            </div>
          )}

          {/* ── Legend pill HUD ── */}
          <div style={{
            position: "absolute",
            bottom: 20,
            [isRtl ? "right" : "left"]: 20,
            zIndex: 5,
            display: "flex",
            alignItems: "center",
            gap: "0.625rem",
            flexWrap: "wrap",
            background: "rgba(6,14,24,0.68)",
            backdropFilter: "blur(12px) saturate(1.3)",
            border: "1px solid rgba(90,180,255,0.10)",
            borderRadius: 20,
            padding: "0.3rem 0.875rem",
          }}>
            {legend.map((item) => (
              <span key={item.label} style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.6875rem", color: "#7A8E9E", whiteSpace: "nowrap" }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: item.color, display: "inline-block", flexShrink: 0 }} />
                {item.label}
              </span>
            ))}
            {hoverText && (
              <>
                <span style={{ width: 1, height: 14, background: "rgba(255,255,255,0.1)", display: "inline-block", margin: "0 0.125rem" }} />
                <span style={{ fontSize: "0.6875rem", color: "#647888" }}>{hoverText}</span>
              </>
            )}
          </div>

          {/* ── Unit card panel ── */}
          {showUnitCard && (
            <UnitCard
              unitData={unitData}
              loading={unitDataLoading}
              isRtl={isRtl}
              copy={unitCopy}
              onBack={handleBack}
              onBackToBuilding={handleBackToBuilding}
            />
          )}

          {/* ── Floor panel ── */}
          {showFloorPanel && selectedBuilding && (
            <FloorPanel
              selectedFloor={selectedFloor}
              building={selectedBuilding}
              maxFloor={maxFloor}
              floorUnits={floorUnits}
              selectedUnitId={selectedUnitId}
              hoveredUnitId={hoveredUnitId}
              isRtl={isRtl}
              copy={floorCopy}
              explorerCopy={copy}
              onBack={handleBack}
              onFloorNav={handleFloorNav}
              onUnitClick={handleUnitClick}
              onUnitHover={handleUnitHover}
            />
          )}
        </div>
      </div>
    </section>
  );
}
