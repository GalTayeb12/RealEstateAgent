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
  factsTitle: string;
  sampleTag: string;
  danaName: string;
  danaSubtitle: string;
  analyticsTitle: string;
  analyticsReset: string;
  analyticsEmpty: string;
  analyticsInsight: string;
  analyticsFooter: string;
  sqm: string;
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
  return (
    <div
      className={className}
      style={{
        overflowY: "auto",
        padding: "14px 18px",
        direction: "rtl",
        fontFamily: "var(--font-heebo), sans-serif",
        borderLeft: "1px solid var(--qp-soft)",
        position: "relative",
        height: "100%",
        ...style,
      }}
    >
      {/* Header: label (+ sample tag) and close, one line */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--qp-muted)" }}>{m.factsTitle}</span>
        {isSample && (
          <span
            style={{
              background: "var(--qp-bg)",
              borderRadius: 4,
              padding: "1px 8px",
              fontSize: 11,
              color: "var(--qp-accent-text)",
            }}
          >
            {m.sampleTag}
          </span>
        )}
        <button
          onClick={onClose}
          aria-label="close"
          style={{
            marginInlineStart: "auto",
            background: "none",
            border: "none",
            fontSize: 22,
            cursor: "pointer",
            color: "var(--qp-muted)",
            lineHeight: 1,
            padding: 0,
          }}
        >
          &times;
        </button>
      </div>

      {/* Facts grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 6,
          marginBottom: 12,
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
              padding: "6px 8px",
              textAlign: "center",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 14 }}>{value}</div>
            <div style={{ color: "var(--qp-muted)", fontSize: 11 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Style chips */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "var(--qp-muted)", marginBottom: 6 }}>נסה סגנון אחר</div>
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
                color: profileId === chip.id ? "#fff" : "var(--qp-ink)",
                border: profileId === chip.id ? "none" : "1px solid var(--qp-border)",
              }}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Dana bot */}
      <div style={{ marginBottom: 12 }}>
        <PresenterBot
          profileId={profileId}
          profiles={model.profiles}
          questions={model.questions}
          activeRoomId={activeRoomId}
          danaNameLabel={m.danaName}
          danaSubtitleLabel={m.danaSubtitle}
        />
      </div>

      {/* Analytics (its own footer carries the "sent to the learning module" note) */}
      <div>
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

    </div>
  );
}
