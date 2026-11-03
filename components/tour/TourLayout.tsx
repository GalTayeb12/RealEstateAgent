"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
  // Fix 3d: start with "neutral" profile
  const [profileId, setProfileId] = useState("neutral");
  const [mode, setMode] = useState<"orbit" | "walk">("orbit");
  const [focusRoomId, setFocusRoomId] = useState<string | null>(null);
  const [currentWalkRoom, setCurrentWalkRoom] = useState<string | null>(null);
  const [dwell, setDwell] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const sessionRef = useRef(generateSessionId());

  // Fix 2: back URL state
  const [backUrl, setBackUrl] = useState<string | null>(null);

  // Fix 3a: buyer profile (deferred — stays null for now)
  const [buyerProfile] = useState<{
    match: number; why: string[]; persona: string;
  } | null>(null);

  // Fix 4b+c: shared label elements ref
  const labelElemsRef = useRef<Record<string, HTMLElement | null>>({});

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
          // Fix 2: store backUrl
          if (utId) {
            if (!cancelled) setBackUrl(`/aom/${utId}?unit=${unitId}`);
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
    background: "#fff",
    fontFamily: "var(--font-heebo), sans-serif",
  };

  if (loading || !model) {
    return (
      <div
        className="tour-skel-wrap"
        style={containerStyle}
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
          style={{ padding: "20px 22px", borderLeft: "1px solid #e8e6e1", display: "flex", flexDirection: "column", gap: 12, height: "100%" }}
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
          style={{ background: "#e4e7ea", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, height: "100%" }}
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
          height: "100%",
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
            {model.facts.areaSqm} {m.sqm}
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

        {/* ── Fix 3b: Profile section ─────────────────────────────── */}
        {buyerProfile ? (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>מותאם עבורך</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: "#d27a12" }}>{buyerProfile.match}%</span>
              <span style={{ fontSize: 13, color: "#444" }}>התאמה</span>
            </div>
            <ul style={{ paddingRight: 16, paddingLeft: 0, margin: 0, fontSize: 12, lineHeight: 1.7, color: "#444" }}>
              {buyerProfile.why.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        ) : (
          <div style={{
            background: "#fdf8f0", border: "1px solid #f0e0c0", borderRadius: 10,
            padding: "12px 14px", marginBottom: 16, direction: "rtl",
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>הכירו את הדירה כמו שהיא שלכם</div>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
              עברו ראיון קצר וראו את הדירה מרוהטת בדיוק בשבילכם.
            </div>
            <a href="/interview" style={{
              display: "inline-block", background: "#d27a12", color: "#fff",
              borderRadius: 6, padding: "5px 14px", fontSize: 12, fontWeight: 600,
              textDecoration: "none",
            }}>לראיון הקצר ←</a>
          </div>
        )}

        {/* ── Fix 3b: Style chips ──────────────────────────────────── */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#aaa", marginBottom: 6 }}>נסה סגנון אחר</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {([
              { id: "family",   label: "משפחה" },
              { id: "wfh",      label: "עבודה מהבית" },
              { id: "investor", label: "השכרה" },
            ] as const).map(chip => (
              <button
                key={chip.id}
                onClick={() => handleProfileChange(chip.id)}
                style={{
                  padding: "4px 12px", borderRadius: 14, fontSize: 12,
                  fontFamily: "inherit", cursor: "pointer",
                  background: profileId === chip.id ? "#d27a12" : "#f2f0ec",
                  color: profileId === chip.id ? "#fff" : "#444",
                  border: profileId === chip.id ? "none" : "1px solid #e0ddd8",
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>
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
      <div
        className="tour-stage"
        style={{
          position: "relative",
          background: "#e4e7ea",
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
                    background: isFocused ? "rgba(210,122,18,0.92)" : "rgba(255,255,255,0.92)",
                    color: isFocused ? "#fff" : "#1a1a1a",
                    borderRadius: 8,
                    padding: "6px 12px",
                    fontSize: 13,
                    fontFamily: "var(--font-heebo), sans-serif",
                    direction: "rtl",
                    textAlign: "center",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                    userSelect: "none",
                    lineHeight: 1.4,
                    transition: "background 0.15s",
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{label}</div>
                  <div style={{ fontSize: 11, opacity: 0.8 }}>{room.area.toFixed(1)} {m.sqm}</div>
                  {rent != null && (
                    <div style={{ fontSize: 11, opacity: 0.8, color: isFocused ? "#ffe8c0" : "#d27a12" }}>
                      {rent.toLocaleString()} ₪
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
                background: mode === m2 ? "#d27a12" : "#fff",
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
