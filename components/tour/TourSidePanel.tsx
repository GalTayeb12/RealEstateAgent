"use client";

/**
 * The tour's side panel: apartment facts, interview CTA, style chips, Dana
 * (PresenterBot) and room-dwell analytics. Shared by the procedural tour
 * (TourLayout) and the baked first-person walk (ApartmentWalk).
 */
import type { ApartmentModelData } from "@/lib/tour/types";
import PresenterBot from "./PresenterBot";
import TourAnalytics from "./TourAnalytics";

export interface TourStrings {
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

interface TourSidePanelProps {
  model: ApartmentModelData;
  isSample: boolean;
  strings: TourStrings;
  profileId: string;
  onProfileChange: (id: string) => void;
  /** Room Dana should narrate (model room id). */
  activeRoomId: string | null;
  dwell: Record<string, number>;
  onResetDwell: () => void;
  onClose: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export default function TourSidePanel({
  model,
  isSample,
  strings: m,
  profileId,
  onProfileChange,
  activeRoomId,
  dwell,
  onResetDwell,
  onClose,
  className = "tour-panel",
  style,
}: TourSidePanelProps) {
  // Buyer profile match is deferred — stays null for now.
  const buyerProfile = null as { match: number; why: string[]; persona: string } | null;

  return (
    <div
      className={className}
      style={{
        overflowY: "auto",
        padding: "20px 22px",
        direction: "rtl",
        fontFamily: "var(--font-heebo), sans-serif",
        borderLeft: "1px solid var(--qp-soft)",
        position: "relative",
        height: "100%",
        ...style,
      }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
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
              background: "var(--qp-bg)",
              borderRadius: 4,
              padding: "2px 8px",
              fontSize: 11,
              color: "var(--qp-accent-text)",
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
              background: "var(--qp-surface)",
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

      {/* Profile section */}
      {buyerProfile ? (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>מותאם עבורך</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: "var(--qp-accent)" }}>{buyerProfile.match}%</span>
            <span style={{ fontSize: 13, color: "#444" }}>התאמה</span>
          </div>
          <ul style={{ paddingRight: 16, paddingLeft: 0, margin: 0, fontSize: 12, lineHeight: 1.7, color: "#444" }}>
            {buyerProfile.why.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      ) : (
        <div style={{
          background: "var(--qp-surface)", border: "1px solid var(--qp-warning-bg)", borderRadius: 10,
          padding: "12px 14px", marginBottom: 16, direction: "rtl",
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>הכירו את הדירה כמו שהיא שלכם</div>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
            עברו ראיון קצר וראו את הדירה מרוהטת בדיוק בשבילכם.
          </div>
          <a href="/interview" style={{
            display: "inline-block", background: "var(--qp-accent)", color: "#fff",
            borderRadius: 6, padding: "5px 14px", fontSize: 12, fontWeight: 600,
            textDecoration: "none",
          }}>לראיון הקצר ←</a>
        </div>
      )}

      {/* Style chips */}
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
              onClick={() => onProfileChange(chip.id)}
              style={{
                padding: "4px 12px", borderRadius: 14, fontSize: 12,
                fontFamily: "inherit", cursor: "pointer",
                background: profileId === chip.id ? "var(--qp-accent)" : "var(--qp-soft)",
                color: profileId === chip.id ? "#fff" : "#444",
                border: profileId === chip.id ? "none" : "1px solid var(--qp-border)",
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
          activeRoomId={activeRoomId}
          onProfileChange={onProfileChange}
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
          onReset={onResetDwell}
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
  );
}
