"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/components/LocaleProvider";
import { Money } from "@/components/Money";
import BuildingFallback from "./BuildingFallback";
import type { ExplorerBuilding, HoverInfo } from "./types";

const BuildingCanvas = dynamic(() => import("./BuildingCanvas"), { ssr: false });

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

class CanvasGuard extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function statusLabel(status: string | undefined, labels: { available: string; reserved: string; sold: string }): string {
  if (status === "reserved") return labels.reserved;
  if (status === "sold") return labels.sold;
  return labels.available;
}

export default function BuildingExplorer({
  buildings,
  activeUnitTypeId,
}: {
  buildings: ExplorerBuilding[];
  activeUnitTypeId: string;
}) {
  const { m } = useI18n();
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    setWebgl(hasWebGL());
  }, []);

  const copy = m.explorer;
  const onHover = (info: HoverInfo | null, id: string | null = null) => {
    setHover(info);
    setHoveredId(id);
  };

  const legend = [
    { color: "#8AAEC2", label: copy.available },
    { color: "#8090A8", label: copy.sold },
    { color: "#5C8AA2", label: copy.lobby },
    { color: "#C89B3C", label: copy.reserved },
  ];

  return (
    <section style={{ marginBottom: "2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "baseline", flexWrap: "wrap", marginBottom: "0.75rem" }}>
        <h2 style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "1.25rem", fontWeight: 800, color: "#14130F", margin: 0 }}>
          {copy.title}
        </h2>
        <span style={{ fontSize: "0.8125rem", color: "#6B6860" }}>{webgl ? copy.drag : copy.fallback}</span>
      </div>
      <div style={{ background: "#14202C", borderRadius: 16, border: "1px solid rgba(28,27,25,0.12)", overflow: "hidden" }}>
        <style>{`@media (max-width: 640px) { .hn-building-stage { height: 400px !important; } }`}</style>
        <div className="hn-building-stage" style={{ height: 560 }}>
          {webgl === null ? null : webgl ? (
            <CanvasGuard fallback={<BuildingFallback buildings={buildings} activeUnitTypeId={activeUnitTypeId} onHover={(info) => onHover(info)} />}>
              <BuildingCanvas
                buildings={buildings}
                activeUnitTypeId={activeUnitTypeId}
                hoveredId={hoveredId}
                onHover={onHover}
              />
            </CanvasGuard>
          ) : (
            <BuildingFallback buildings={buildings} activeUnitTypeId={activeUnitTypeId} onHover={(info) => onHover(info)} />
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", padding: "0.75rem 1rem", background: "#0E1C28", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", gap: "0.875rem", flexWrap: "wrap", alignItems: "center" }}>
            {legend.map((item) => (
              <span key={item.label} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.75rem", color: "#9AAAB8" }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: item.color, display: "inline-block" }} />
                {item.label}
              </span>
            ))}
          </div>
          <div style={{ fontSize: "0.8125rem", color: "#CBD5E0", minHeight: "1.25rem" }}>
            {hover ? (
              hover.lobby ? (
                <span>{hover.buildingName} · {copy.floor} {hover.floor} · {copy.lobby}</span>
              ) : hover.availableCount !== undefined ? (
                /* Floor-level hover (3-D canvas) */
                <span>
                  {hover.buildingName}
                  {" · "}
                  {hover.isPenthouse ? copy.penthouse : `${copy.floor} ${hover.floor}`}
                  {" · "}
                  {hover.availableCount > 0
                    ? `${hover.availableCount} ${copy.available}`
                    : copy.sold}
                </span>
              ) : (
                /* Per-unit hover (2-D fallback) */
                <span>
                  {hover.buildingName} · {copy.floor} {hover.floor} · {copy.apartment} {hover.unitNumber}
                  {hover.unitLabel ? ` · ${hover.unitLabel}` : ""} · {statusLabel(hover.status, copy)}
                  {hover.price != null && hover.price > 0 ? <> · {copy.price} <Money amount={hover.price} /></> : null}
                </span>
              )
            ) : (
              <span style={{ color: "#647888" }}>{copy.hoverFloor ?? copy.hover}</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
