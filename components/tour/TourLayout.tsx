"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { ApartmentModelData } from "@/lib/tour/types";
import type { ApartmentSceneProps } from "./ApartmentScene";
import sampleData from "@/lib/tour/sampleApartment.json";
import TourSidePanel, { type TourStrings } from "./TourSidePanel";

const ApartmentScene = dynamic<ApartmentSceneProps>(() => import("./ApartmentScene"), { ssr: false });

interface TourLayoutProps {
  unitId: string;
  isModal: boolean;
  strings: TourStrings;
}

function generateSessionId() {
  return "tour_" + Math.random().toString(36).slice(2, 11) + "_" + Date.now();
}

export default function TourLayout({ unitId, isModal, strings: m }: TourLayoutProps) {
  const router = useRouter();
  const [model, setModel] = useState<ApartmentModelData | null>(null);
  const [isSample, setIsSample] = useState(false);
  // Fix 3d: start with "neutral" profile
  const [profileId, setProfileId] = useState("neutral");
  const [mode, setMode] = useState<"orbit" | "walk">("orbit");
  const [focusRoomId, setFocusRoomId] = useState<string | null>(null);
  const [currentWalkRoom, setCurrentWalkRoom] = useState<string | null>(null);
  const [dwell, setDwell] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const sessionRef = useRef(generateSessionId());
  // Dwell accumulator ref — avoids 60 setState/s from useFrame
  const dwellAccRef = useRef<Record<string, number>>({});

  // Fix 2: back URL state
  const [backUrl, setBackUrl] = useState<string | null>(null);

  // Fix 4b+c: shared label elements ref
  const labelElemsRef = useRef<Record<string, HTMLElement | null>>({});

  // Load data with fake-but-smooth progress for perceived performance
  useEffect(() => {
    let cancelled = false;
    setLoadProgress(10);

    async function load() {
      setLoadProgress(25);
      try {
        const unitRes = await fetch(`/api/buildings/unit/${unitId}`);
        setLoadProgress(50);
        if (unitRes.ok) {
          const unitData = await unitRes.json();
          const utId = unitData.unit?.unitTypeId;
          if (utId) {
            if (!cancelled) {
              const buildingId = unitData.unit?.buildingId;
              const floor = unitData.unit?.floor;
              const params = new URLSearchParams();
              if (buildingId) params.set("building", buildingId);
              if (floor != null) params.set("floor", String(floor));
              params.set("unit", unitId);
              setBackUrl(`/aom/${utId}?${params.toString()}`);
            }
            const modelRes = await fetch(`/api/tour/model/${utId}`);
            setLoadProgress(75);
            if (modelRes.ok) {
              const { model: dbModel } = await modelRes.json();
              if (dbModel && !cancelled) {
                setLoadProgress(90);
                setModel(dbModel as ApartmentModelData);
                setIsSample(false);
                setLoading(false);
                return;
              }
            }
          }
        }
      } catch {
        // Fall through to sample
      }

      if (!cancelled) {
        setLoadProgress(90);
        setModel(sampleData as unknown as ApartmentModelData);
        setIsSample(true);
        // Small delay so progress bar reaches 100 visually before unmounting
        setTimeout(() => { if (!cancelled) setLoadProgress(100); }, 100);
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [unitId]);

  // Sync dwell accumulator to state every 2 s to avoid 60fps setState
  useEffect(() => {
    const id = setInterval(() => {
      const acc = dwellAccRef.current;
      if (Object.keys(acc).length === 0) return;
      dwellAccRef.current = {};
      setDwell((prev) => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(acc)) {
          next[k] = (next[k] ?? 0) + v;
        }
        return next;
      });
    }, 2000);
    return () => clearInterval(id);
  }, []);

  // Fix 1: body scroll lock
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Fix 2: Escape handler — navigate to backUrl when available
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (backUrl) {
          router.push(backUrl);
        } else if (isModal) {
          router.back();
        } else {
          window.history.back();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isModal, router, backUrl]);

  // Room change callback
  const handleRoomChange = useCallback(
    (id: string) => {
      setFocusRoomId(id);
      setCurrentWalkRoom(id);
      // Analytics event
      fetch("/api/tour/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          eventType: "room_focus",
          roomId: id,
          sessionId: sessionRef.current,
        }),
      }).catch(() => {});
    },
    [profileId],
  );

  // Dwell update callback — writes to ref; interval above syncs to state
  const handleDwellUpdate = useCallback((roomId: string, dtSeconds: number) => {
    dwellAccRef.current[roomId] = (dwellAccRef.current[roomId] ?? 0) + dtSeconds;
  }, []);

  // Reset analytics
  const handleResetDwell = useCallback(() => {
    setDwell({});
  }, []);

  // Profile change
  const handleProfileChange = useCallback((id: string) => {
    setProfileId(id);
    setDwell({});
    fetch("/api/tour/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId: id,
        eventType: "mode_change",
        payload: { newProfile: id },
        sessionId: sessionRef.current,
      }),
    }).catch(() => {});
  }, []);

  const close = useCallback(() => {
    if (backUrl) router.push(backUrl);
    else if (isModal) router.back();
    else window.history.back();
  }, [isModal, router, backUrl]);

  // Fix 1: always fixed, full viewport
  const containerStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    height: "100dvh",
    zIndex: 200,
    display: "grid",
    gridTemplateColumns: "360px 1fr",
    background: "var(--qp-surface)",
    fontFamily: "var(--font-heebo), sans-serif",
  };

  if (loading || !model) {
    return (
      <div
        className="tour-skel-wrap"
        style={containerStyle}
        role="status"
        aria-live="polite"
        aria-label="טוען סיור תלת ממדי"
      >
        <style>{`
          @keyframes tourSkelPulse {
            0%,100% { opacity: 1 } 50% { opacity: 0.45 }
          }
          @media (prefers-reduced-motion: reduce) {
            .tour-skel-pulse { animation: none !important; }
          }
          @media (max-width: 860px) {
            .tour-skel-wrap { grid-template-columns: 1fr !important; grid-template-rows: 55dvh 45dvh !important; }
            .tour-skel-panel { order: 2 !important; height: 100% !important; }
            .tour-skel-stage { order: 1 !important; height: 100% !important; }
          }
        `}</style>
        {/* Panel skeleton */}
        <div
          className="tour-skel-panel"
          style={{ padding: "20px 22px", borderLeft: "1px solid var(--qp-soft)", display: "flex", flexDirection: "column", gap: 12, height: "100%" }}
        >
          <div className="tour-skel-pulse" style={{ height: 22, width: "60%", background: "var(--qp-soft)", borderRadius: 6, animation: "tourSkelPulse 1.4s ease-in-out infinite" }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 4 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="tour-skel-pulse" style={{ height: 52, background: "var(--qp-soft)", borderRadius: 6, animation: "tourSkelPulse 1.4s ease-in-out infinite", animationDelay: `${i * 0.08}s` }} />
            ))}
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="tour-skel-pulse" style={{ height: 54, background: "var(--qp-soft)", borderRadius: 10, animation: "tourSkelPulse 1.4s ease-in-out infinite", animationDelay: `${0.5 + i * 0.1}s` }} />
          ))}
          <div className="tour-skel-pulse" style={{ height: 90, background: "var(--qp-soft)", borderRadius: 10, animation: "tourSkelPulse 1.4s ease-in-out infinite", animationDelay: "0.8s" }} />
          <div className="tour-skel-pulse" style={{ height: 70, background: "var(--qp-soft)", borderRadius: 10, animation: "tourSkelPulse 1.4s ease-in-out infinite", animationDelay: "0.9s" }} />
        </div>
        {/* Canvas skeleton with real progress bar */}
        <div
          className="tour-skel-stage"
          style={{ background: "var(--qp-soft)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 14, height: "100%" }}
        >
          <div className="tour-skel-pulse" style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--qp-border)", animation: "tourSkelPulse 1.4s ease-in-out infinite" }} />
          <div style={{ color: "var(--qp-muted)", fontFamily: "var(--font-heebo), sans-serif", fontSize: 14, direction: "rtl" }}>{m.loading}</div>
          {/* Progress bar */}
          <div
            role="progressbar"
            aria-valuenow={loadProgress}
            aria-valuemin={0}
            aria-valuemax={100}
            style={{ width: 160, height: 4, borderRadius: 2, background: "var(--qp-border)", overflow: "hidden" }}
          >
            <div style={{
              height: "100%",
              width: `${loadProgress}%`,
              background: "var(--qp-accent, #c47a1a)",
              borderRadius: 2,
              transition: "width 0.4s ease",
            }} />
          </div>
        </div>
      </div>
    );
  }

  const activeRoomForBot = currentWalkRoom ?? focusRoomId;
  const walkRoomObj = model.rooms.find((r) => r.id === currentWalkRoom);

  return (
    <div
      className="tour-grid"
      style={{
        ...containerStyle,
        animation: "tourFadeIn 0.35s ease",
      }}
    >
      <style>{`
        @keyframes tourFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @media (max-width: 860px) {
          .tour-grid { grid-template-columns: 1fr !important; grid-template-rows: 55dvh 45dvh !important; }
          .tour-panel { order: 2 !important; height: 100% !important; }
          .tour-stage { order: 1 !important; height: 100% !important; }
        }
        /* Visible focus ring for keyboard users */
        .tour-room-chip:focus-visible {
          outline: 3px solid var(--qp-accent, #c47a1a);
          outline-offset: 2px;
        }
        .tour-room-chip:active {
          transform: scale(0.96);
          transition: transform 120ms ease-out;
        }
        /* Chip transitions */
        .tour-room-chip {
          transition: background 150ms ease, color 150ms ease, border-color 150ms ease, transform 120ms ease-out;
        }
      `}</style>

      {/* ─── Side panel (shared with the first-person walk) ─────────── */}
      <TourSidePanel
        model={model}
        isSample={isSample}
        strings={m}
        profileId={profileId}
        onProfileChange={handleProfileChange}
        activeRoomId={activeRoomForBot}
        dwell={dwell}
        onResetDwell={handleResetDwell}
        onClose={close}
      />

      {/* ─── Right stage ────────────────────────────────────────────── */}
      <div
        className="tour-stage"
        style={{
          position: "relative",
          background: "var(--qp-soft)",
          overflow: "hidden",
          height: "100%",
        }}
      >
        <ApartmentScene
          model={model}
          profileId={profileId}
          mode={mode}
          focusRoomId={focusRoomId}
          onRoomChange={handleRoomChange}
          onDwellUpdate={handleDwellUpdate}
          sqmLabel={m.sqm}
          monthlyRentLabel={m.monthlyRent}
          noWebGLLabel={m.noWebGL}
          labelElemsRef={labelElemsRef}
        />

        {/* Fix 4b+c: Room label overlay */}
        {model && mode === "orbit" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              zIndex: 5,
              overflow: "hidden",
            }}
          >
            {model.rooms.map((room) => {
              const profile = model.profiles.find((p) => p.id === profileId);
              const label = profile?.labels[room.id] ?? room.name;
              const rent = profile?.rent?.[room.id];
              const isFocused = focusRoomId === room.id;
              return (
                <div
                  key={room.id}
                  ref={(el) => { labelElemsRef.current[room.id] = el; }}
                  onClick={() => handleRoomChange(room.id)}
                  style={{
                    position: "absolute",
                    top: 0, left: 0,
                    opacity: 0,
                    pointerEvents: "none",
                    background: isFocused ? "rgba(179,139,77,0.93)" : "rgba(255,255,255,0.82)",
                    color: isFocused ? "#fff" : "var(--qp-ink)",
                    borderRadius: isFocused ? 8 : 6,
                    padding: isFocused ? "5px 11px" : "3px 8px",
                    fontSize: isFocused ? 12 : 10,
                    fontFamily: "var(--font-heebo), sans-serif",
                    direction: "rtl",
                    textAlign: "center",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    boxShadow: isFocused ? "0 2px 10px rgba(0,0,0,0.18)" : "0 1px 4px rgba(0,0,0,0.10)",
                    userSelect: "none",
                    lineHeight: 1.35,
                    transition: "background 0.15s",
                  }}
                >
                  <div style={{ fontWeight: isFocused ? 700 : 500 }}>{label}</div>
                  {isFocused && (
                    <div style={{ fontSize: 10, opacity: 0.88, marginTop: 1 }}>
                      {room.area.toFixed(1)} {m.sqm}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Fix 2: Back button (top-right of stage) */}
        <button
          onClick={() => { if (backUrl) router.push(backUrl); else close(); }}
          style={{
            position: "absolute",
            top: 14, right: 14, zIndex: 20,
            background: "rgba(255,255,255,0.92)",
            border: "1px solid rgba(0,0,0,0.1)",
            borderRadius: 8,
            padding: "6px 14px",
            fontSize: 13,
            fontFamily: "var(--font-heebo), sans-serif",
            cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
            direction: "rtl",
          }}
        >
          ← חזרה לבניין
        </button>

        {/* Mode toggle (top-left) */}
        <div
          style={{
            position: "absolute",
            top: 14,
            left: 14,
            display: "flex",
            borderRadius: 8,
            overflow: "hidden",
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
            zIndex: 10,
          }}
        >
          {(["orbit", "walk"] as const).map((m2) => (
            <button
              key={m2}
              onClick={() => setMode(m2)}
              style={{
                padding: "7px 16px",
                fontSize: 13,
                fontFamily: "var(--font-heebo), sans-serif",
                border: "none",
                cursor: "pointer",
                background: mode === m2 ? "var(--qp-accent)" : "var(--qp-surface)",
                color: mode === m2 ? "#fff" : "#333",
                fontWeight: mode === m2 ? 600 : 400,
              }}
            >
              {m2 === "orbit" ? m.orbit : m.walk}
            </button>
          ))}
        </div>

        {/* Walk mode: current room indicator — Fix 2: moved to top:56 to avoid back button collision */}
        {mode === "walk" && walkRoomObj && (
          <div
            style={{
              position: "absolute",
              top: 56,
              right: 14,
              background: "rgba(255,255,255,0.92)",
              borderRadius: 8,
              padding: "6px 14px",
              fontSize: 13,
              fontFamily: "var(--font-heebo), sans-serif",
              direction: "rtl",
              boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
              zIndex: 10,
            }}
          >
            {m.herePrefix}{" "}
            <strong>
              {model.profiles.find((p) => p.id === profileId)?.labels[walkRoomObj.id] ??
                walkRoomObj.name}
            </strong>
          </div>
        )}

        {/* Room chips (bottom) — keyboard navigable with Arrow keys */}
        <div
          role="toolbar"
          aria-label="חדרים"
          dir="rtl"
          style={{
            position: "absolute",
            bottom: 14,
            left: 14,
            right: 14,
            display: "flex",
            gap: 6,
            overflowX: "auto",
            zIndex: 10,
            paddingBottom: 4,
          }}
        >
          {model.rooms.map((room, idx) => {
            const label =
              model.profiles.find((p) => p.id === profileId)?.labels[room.id] ?? room.name;
            const active = focusRoomId === room.id;
            return (
              <button
                key={room.id}
                className="tour-room-chip"
                data-room-id={room.id}
                aria-pressed={active}
                aria-label={label}
                onClick={() => handleRoomChange(room.id)}
                onKeyDown={(e) => {
                  // Arrow key navigation between chips (RTL: right = previous)
                  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                    e.preventDefault();
                    const rooms = model.rooms;
                    const nextIdx =
                      e.key === "ArrowLeft"
                        ? (idx + 1) % rooms.length
                        : (idx - 1 + rooms.length) % rooms.length;
                    const nextId = rooms[nextIdx].id;
                    handleRoomChange(nextId);
                    // Move DOM focus to the next chip
                    const nextBtn = document.querySelector<HTMLButtonElement>(
                      `[data-room-id="${nextId}"]`,
                    );
                    nextBtn?.focus();
                  }
                }}
                style={{
                  flexShrink: 0,
                  padding: "6px 14px",
                  borderRadius: 16,
                  fontSize: 12,
                  fontFamily: "var(--font-heebo), sans-serif",
                  border: active ? "2px solid var(--qp-accent)" : "1px solid rgba(255,255,255,0.7)",
                  background: active ? "var(--qp-accent)" : "rgba(255,255,255,0.88)",
                  color: active ? "#fff" : "#333",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
                  direction: "rtl",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Fix 6: Touch movement pad (walk mode, bottom-right) — 4 arrows only */}
        {mode === "walk" && <TouchPad />}

        {/* Hint text */}
        <div
          style={{
            position: "absolute",
            bottom: mode === "walk" ? 56 : 50,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(0,0,0,0.55)",
            color: "#fff",
            borderRadius: 6,
            padding: "4px 14px",
            fontSize: 11,
            fontFamily: "var(--font-heebo), sans-serif",
            direction: "rtl",
            whiteSpace: "nowrap",
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          {mode === "orbit" ? m.hintOrbit : m.hintWalk}
        </div>
      </div>
    </div>
  );
}

// ─── Touch pad for walk mode ────────────────────────────────────────────────
function TouchPad() {
  const simulateKey = useCallback((key: string, down: boolean) => {
    window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { key }));
  }, []);

  // Fix 6: only 4 direction arrows
  const buttons = [
    { label: "▲", key: "ArrowUp",    row: 0, col: 1 },
    { label: "◀", key: "ArrowLeft",  row: 1, col: 0 },
    { label: "▼", key: "ArrowDown",  row: 1, col: 1 },
    { label: "▶", key: "ArrowRight", row: 1, col: 2 },
  ];

  return (
    <div
      style={{
        position: "absolute",
        bottom: 60,
        right: 14,
        display: "grid",
        gridTemplateColumns: "42px 42px 42px",
        gridTemplateRows: "42px 42px",
        gap: 3,
        zIndex: 10,
      }}
    >
      {buttons.map((b) => (
        <button
          key={b.key}
          style={{
            gridRow: b.row + 1,
            gridColumn: b.col + 1,
            background: "rgba(255,255,255,0.8)",
            border: "1px solid rgba(0,0,0,0.15)",
            borderRadius: 8,
            fontSize: 16,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            touchAction: "none",
            userSelect: "none",
          }}
          onPointerDown={() => simulateKey(b.key, true)}
          onPointerUp={() => simulateKey(b.key, false)}
          onPointerLeave={() => simulateKey(b.key, false)}
        >
          {b.label}
        </button>
      ))}
    </div>
  );
}
