"use client";
/**
 * VirtualTour — Pannellum 360° panorama viewer.
 *
 * This file is intentionally loaded ONLY via next/dynamic with ssr:false because
 * Pannellum accesses browser APIs (WebGL, Canvas) that don't exist in Node.
 *
 * Scene switching is handled by React state + Pannellum remount via `key` prop —
 * the most reliable pattern since Pannellum's `image` prop doesn't hot-reload.
 */
import { useState } from "react";
import { Pannellum } from "pannellum-react";
import "pannellum-react/lib/pannellum/css/pannellum.css";

export type TourScene = {
  id: string;
  label: string;
  panoramaUrl: string;
};

export function VirtualTour({ scenes }: { scenes: TourScene[] }) {
  const [activeId, setActiveId] = useState(scenes[0]?.id ?? "");
  const active = scenes.find((s) => s.id === activeId) ?? scenes[0];

  if (!active) return null;

  return (
    <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid rgba(28,27,25,0.08)", boxShadow: "0 2px 4px rgba(28,27,25,0.04), 0 12px 24px -12px rgba(18,51,50,0.10)" }}>
      {/* Pannellum viewer — key forces full remount on scene change */}
      <style>{`
        @media (max-width: 640px) { .hn-tour-viewer > div { height: 260px !important; } }
        @media (max-width: 480px) { .hn-tour-viewer > div { height: 220px !important; } }
      `}</style>
      <div className="hn-tour-viewer" style={{ lineHeight: 0 }}>
        <Pannellum
          key={active.id}
          width="100%"
          height="460px"
          image={active.panoramaUrl}
          pitch={5}
          yaw={180}
          hfov={110}
          autoLoad
          showZoomCtrl={false}
          mouseZoom
        />
      </div>

      {/* Scene tabs + hint */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.875rem 1rem", background: "#F5F3EE", borderTop: "1px solid rgba(28,27,25,0.08)", overflowX: "auto" }}>
        {scenes.map((scene) => {
          const isActive = scene.id === activeId;
          return (
            <button
              key={scene.id}
              onClick={() => setActiveId(scene.id)}
              style={{
                padding: "0.4375rem 0.9375rem",
                borderRadius: 999,
                border: isActive ? "none" : "1.5px solid rgba(28,27,25,0.15)",
                background: isActive ? "linear-gradient(155deg, #2F6664, #123332)" : "transparent",
                color: isActive ? "#fff" : "#55534C",
                fontWeight: 600,
                fontSize: "0.8125rem",
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "opacity 0.15s",
                flexShrink: 0,
              }}
              onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.opacity = "0.75"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
            >
              {scene.label}
            </button>
          );
        })}
        <span style={{ marginLeft: "auto", fontSize: "0.6875rem", color: "#9A958F", fontFamily: "var(--font-jetbrains, monospace)", fontWeight: 500, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
          Drag · Scroll to zoom
        </span>
      </div>
    </div>
  );
}
