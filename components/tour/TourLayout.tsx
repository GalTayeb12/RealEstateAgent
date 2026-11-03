"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { ApartmentModelData } from "@/lib/tour/types";
import type { ApartmentSceneProps } from "./ApartmentScene";
import sampleData from "@/lib/tour/sampleApartment.json";
import PresenterBot from "./PresenterBot";
import TourAnalytics from "./TourAnalytics";

const ApartmentScene = dynamic<ApartmentSceneProps>(() => import("./ApartmentScene"), { ssr: false });

// ─── i18n strings interface ─────────────────────────────────────────────────
interface TourStrings {
  sampleTag: string;
  orbit: string;
  walk: string;
  profileTitle: string;
  profileTag: string;
  danaName: string;
  danaSubtitle: string;
  analyticsTitle: string;
  analyticsReset: string;
  analyticsEmpty: string;
  analyticsInsight: string;
  analyticsFooter: string;
  hintOrbit: string;
  hintWalk: string;
  herePrefix: string;
  loading: string;
  noWebGL: string;
  matchLabel: string;
  sqm: string;
  monthlyRent: string;
}

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
  const [profileId, setProfileId] = useState("family");
  const [mode, setMode] = useState<"orbit" | "walk">("orbit");
  const [focusRoomId, setFocusRoomId] = useState<string | null>(null);
  const [currentWalkRoom, setCurrentWalkRoom] = useState<string | null>(null);
  const [dwell, setDwell] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const sessionRef = useRef(generateSessionId());

  // Load data
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // Try to fetch the unit's unitTypeId first
        const unitRes = await fetch(`/api/buildings/unit/${unitId}`);
        if (unitRes.ok) {
          const unitData = await unitRes.json();
          const utId = unitData.unit?.unitTypeId;
          if (utId) {
            const modelRes = await fetch(`/api/tour/model/${utId}`);
            if (modelRes.ok) {
              const { model: dbModel } = await modelRes.json();
              if (dbModel && !cancelled) {
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
        setModel(sampleData as unknown as ApartmentModelData);
        setIsSample(true);
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [unitId]);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isModal) {
          router.back();
        } else {
          window.history.back();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isModal, router]);

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

  // Dwell update callback
  const handleDwellUpdate = useCallback((roomId: string, dtSeconds: number) => {
    setDwell((prev) => ({
      ...prev,
      [roomId]: (prev[roomId] ?? 0) + dtSeconds,
    }));
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
    if (isModal) router.back();
    else window.history.back();
  }, [isModal, router]);

  if (loading || !model) {
    return (
      <div
        style={{
          position: isModal ? "fixed" : "relative",
          inset: 0,
          zIndex: isModal ? 200 : undefined,
          display: "grid",
          gridTemplateColumns: "372px 1fr",
          background: "#fff",
          fontFamily: "var(--font-heebo), sans-serif",
        }}
      >
        <style>{`
          @keyframes tourSkelPulse {
            0%,100% { opacity: 1 } 50% { opacity: 0.45 }
          }
          @media (prefers-reduced-motion: reduce) {
            .tour-skel-pulse { animation: none !important; }
          }
          @media (max-width: 860px) {
            .tour-skel-wrap { grid-template-columns: 1fr !important; grid-template-rows: 60vh 1fr !important; }
            .tour-skel-panel { order: 2 !important; }
            .tour-skel-stage { order: 1 !important; }
          }
        `}</style>
        {/* Panel skeleton */}
        <div
          className="tour-skel-panel"
          style={{ padding: "20px 22px", borderLeft: "1px solid #e8e6e1", display: "flex", flexDirection: "column", gap: 12 }}
        >
          {/* Title bar */}
          <div className="tour-skel-pulse" style={{ height: 22, width: "60%", background: "#ece9e3", borderRadius: 6, animation: "tourSkelPulse 1.4s ease-in-out infinite" }} />
          {/* Facts grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 4 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="tour-skel-pulse" style={{ height: 52, background: "#f2f0ec", borderRadius: 6, animation: "tourSkelPulse 1.4s ease-in-out infinite", animationDelay: `${i * 0.08}s` }} />
            ))}
          </div>
          {/* Profile cards */}
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="tour-skel-pulse" style={{ height: 54, background: "#f2f0ec", borderRadius: 10, animation: "tourSkelPulse 1.4s ease-in-out infinite", animationDelay: `${0.5 + i * 0.1}s` }} />
          ))}
          {/* Dana bot area */}
          <div className="tour-skel-pulse" style={{ height: 90, background: "#f2f0ec", borderRadius: 10, animation: "tourSkelPulse 1.4s ease-in-out infinite", animationDelay: "0.8s" }} />
          {/* Analytics area */}
          <div className="tour-skel-pulse" style={{ height: 70, background: "#f2f0ec", borderRadius: 10, animation: "tourSkelPulse 1.4s ease-in-out infinite", animationDelay: "0.9s" }} />
        </div>
        {/* Canvas skeleton */}
        <div
          className="tour-skel-stage"
          style={{ background: "#e4e7ea", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10 }}
        >
          <div className="tour-skel-pulse" style={{ width: 48, height: 48, borderRadius: "50%", background: "#d0d4d8", animation: "tourSkelPulse 1.4s ease-in-out infinite" }} />
          <div style={{ color: "#8AAEC2", fontFamily: "var(--font-heebo), sans-serif", fontSize: 14, direction: "rtl" }}>{m.loading}</div>
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
        position: isModal ? "fixed" : "relative",
        inset: 0,
        zIndex: isModal ? 200 : undefined,
        display: "grid",
        gridTemplateColumns: "372px 1fr",
        background: "#fff",
        animation: "tourFadeIn 0.35s ease",
        minHeight: isModal ? undefined : "100vh",
      }}
    >
      <style>{`
        @keyframes tourFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @media (max-width: 860px) {
          .tour-grid { grid-template-columns: 1fr !important; grid-template-rows: 60vh 1fr !important; }
          .tour-panel { order: 2 !important; }
          .tour-stage { order: 1 !important; }
        }
      `}</style>

      {/* ─── Left panel ─────────────────────────────────────────────── */}
      <div
        className="tour-panel"
        style={{
          overflowY: "auto",
          padding: "20px 22px",
          direction: "rtl",
          fontFamily: "var(--font-heebo), sans-serif",
          borderLeft: "1px solid #e8e6e1",
          position: "relative",
        }}
      >
        {/* Close button */}
        <button
          onClick={close}
          aria-label="close"
          style={{
            position: "absolute",
            top: 14,
            left: 14,
            background: "none",
            border: "none",
            fontSize: 22,
            cursor: "pointer",
            color: "#888",
            lineHeight: 1,
          }}
        >
          &times;
        </button>

        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
            {model.profiles.find((p) => p.id === profileId)?.name ?? ""}
          </h2>
          {isSample && (
            <span
              style={{
                display: "inline-block",
                background: "#f5f0e8",
                borderRadius: 4,
                padding: "2px 8px",
                fontSize: 11,
                color: "#b88a3a",
                marginTop: 4,
              }}
            >
              {m.sampleTag}
            </span>
          )}
        </div>

        {/* Facts grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 8,
            marginBottom: 18,
            fontSize: 12,
          }}
        >
          {[
            [`${model.facts.areaSqm} ${m.sqm}`, "שטח דירה"],
            [`${model.facts.balconySqm} ${m.sqm}`, "מרפסת"],
            [`קומה ${model.facts.floor}`, "קומה"],
            [`${model.facts.storageSqm} ${m.sqm}`, "מחסן"],
            [`${model.facts.parking}`, "חניה"],
            [model.facts.priceIls, "מחיר"],
          ].map(([value, label], i) => (
            <div
              key={i}
              style={{
                background: "#faf9f7",
                borderRadius: 6,
                padding: "8px 10px",
                textAlign: "center",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 14 }}>{value}</div>
              <div style={{ color: "#888", fontSize: 11 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Profile selector */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            {m.profileTitle}
            <span style={{ fontWeight: 400, color: "#aaa", marginRight: 6, fontSize: 11 }}>
              {m.profileTag}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {model.profiles.map((p) => (
              <button
                key={p.id}
                onClick={() => handleProfileChange(p.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  background: profileId === p.id ? "#f0ebe3" : "#faf9f7",
                  border: profileId === p.id ? "2px solid #d27a12" : "1px solid #e8e6e1",
                  borderRadius: 10,
                  cursor: "pointer",
                  textAlign: "start",
                  fontFamily: "inherit",
                  width: "100%",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "#888" }}>{p.sub}</div>
                </div>
                <div
                  style={{
                    background: profileId === p.id ? "#d27a12" : "#e8e6e1",
                    color: profileId === p.id ? "#fff" : "#666",
                    borderRadius: 6,
                    padding: "2px 8px",
                    fontSize: 12,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  {p.match}% {m.matchLabel}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Why section */}
        <div style={{ marginBottom: 18 }}>
          <ul style={{ paddingRight: 18, paddingLeft: 0, margin: 0, fontSize: 12, lineHeight: 1.7, color: "#444" }}>
            {model.profiles
              .find((p) => p.id === profileId)
              ?.why.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>

        {/* Dana bot */}
        <div style={{ marginBottom: 18 }}>
          <PresenterBot
            profileId={profileId}
            profiles={model.profiles}
            questions={model.questions}
            activeRoomId={activeRoomForBot}
            onProfileChange={handleProfileChange}
            danaNameLabel={m.danaName}
            danaSubtitleLabel={m.danaSubtitle}
          />
        </div>

        {/* Analytics */}
        <div style={{ marginBottom: 18 }}>
          <TourAnalytics
            dwell={dwell}
            profileId={profileId}
            rooms={model.rooms}
            profiles={model.profiles}
            onReset={handleResetDwell}
            titleLabel={m.analyticsTitle}
            resetLabel={m.analyticsReset}
            emptyLabel={m.analyticsEmpty}
            insightTemplate={m.analyticsInsight}
            footerLabel={m.analyticsFooter}
          />
        </div>

        {/* Footer note */}
        <p style={{ fontSize: 11, color: "#bbb", lineHeight: 1.4 }}>{m.analyticsFooter}</p>
      </div>

      {/* ─── Right stage ────────────────────────────────────────────── */}
      <div className="tour-stage" style={{ position: "relative", background: "#e4e7ea", overflow: "hidden" }}>
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
        />

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
                background: mode === m2 ? "#d27a12" : "#fff",
                color: mode === m2 ? "#fff" : "#333",
                fontWeight: mode === m2 ? 600 : 400,
              }}
            >
              {m2 === "orbit" ? m.orbit : m.walk}
            </button>
          ))}
        </div>

        {/* Walk mode: current room indicator (top-right) */}
        {mode === "walk" && walkRoomObj && (
          <div
            style={{
              position: "absolute",
              top: 14,
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

        {/* Room chips (bottom) */}
        <div
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
          {model.rooms.map((room) => {
            const label =
              model.profiles.find((p) => p.id === profileId)?.labels[room.id] ?? room.name;
            const active = focusRoomId === room.id;
            return (
              <button
                key={room.id}
                onClick={() => handleRoomChange(room.id)}
                style={{
                  flexShrink: 0,
                  padding: "6px 14px",
                  borderRadius: 16,
                  fontSize: 12,
                  fontFamily: "var(--font-heebo), sans-serif",
                  border: active ? "2px solid #d27a12" : "1px solid rgba(255,255,255,0.7)",
                  background: active ? "#d27a12" : "rgba(255,255,255,0.88)",
                  color: active ? "#fff" : "#333",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Touch movement pad (walk mode, bottom-right) */}
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

  const buttons = [
    { label: "\u25B2", key: "w", row: 0, col: 1 },
    { label: "\u25C0", key: "q", row: 1, col: 0 },
    { label: "\u25BC", key: "s", row: 1, col: 1 },
    { label: "\u25B6", key: "e", row: 1, col: 2 },
    { label: "A", key: "a", row: 2, col: 0 },
    { label: "D", key: "d", row: 2, col: 2 },
  ];

  return (
    <div
      style={{
        position: "absolute",
        bottom: 60,
        right: 14,
        display: "grid",
        gridTemplateColumns: "42px 42px 42px",
        gridTemplateRows: "42px 42px 42px",
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
