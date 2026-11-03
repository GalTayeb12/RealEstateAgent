"use client";

import type { Room, Profile } from "@/lib/tour/types";

const ROOM_FEATURES: Record<string, string> = {
  living: "סלון גדול",
  kitchen: "מטבח מרווח",
  master: "חדר הורים גדול",
  room2: "חדר נוסף מרווח",
  mamad: 'ממ"ד שמיש',
  bath: "חדר רחצה מושקע",
  balcony: "מרפסת גדולה",
  hall: "כניסה מרווחת",
};

interface TourAnalyticsProps {
  dwell: Record<string, number>;
  profileId: string;
  rooms: Room[];
  profiles: Profile[];
  onReset: () => void;
  titleLabel: string;
  resetLabel: string;
  emptyLabel: string;
  insightTemplate: string;
  footerLabel: string;
}

export default function TourAnalytics({
  dwell,
  rooms,
  profiles,
  onReset,
  titleLabel,
  resetLabel,
  emptyLabel,
  insightTemplate,
  footerLabel,
  profileId,
}: TourAnalyticsProps) {
  const profile = profiles.find((p) => p.id === profileId);

  // Filter rooms with >= 1 second, sort desc, top 6
  const entries = Object.entries(dwell)
    .filter(([, s]) => s >= 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const maxDwell = entries.length > 0 ? entries[0][1] : 1;
  const topRoom = entries.length > 0 ? entries[0][0] : null;

  const getRoomName = (id: string) => {
    if (profile?.labels[id]) return profile.labels[id];
    return rooms.find((r) => r.id === id)?.name ?? id;
  };

  return (
    <div style={{ direction: "rtl", fontFamily: "var(--font-heebo), sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{titleLabel}</span>
        <button
          onClick={onReset}
          style={{
            background: "none",
            border: "none",
            color: "var(--qp-accent)",
            cursor: "pointer",
            fontSize: 12,
            fontFamily: "inherit",
          }}
        >
          {resetLabel}
        </button>
      </div>

      {entries.length === 0 ? (
        <p style={{ fontSize: 12, color: "#888", lineHeight: 1.5 }}>{emptyLabel}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          {entries.map(([id, sec]) => {
            const pct = (sec / maxDwell) * 100;
            return (
              <div key={id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                <span style={{ width: 80, textAlign: "start", flexShrink: 0, color: "#333" }}>
                  {getRoomName(id)}
                </span>
                <div
                  style={{
                    flex: 1,
                    height: 8,
                    background: "#eee",
                    borderRadius: 4,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      background: "var(--qp-accent)",
                      borderRadius: 4,
                      transition: "width 0.4s",
                    }}
                  />
                </div>
                <span style={{ width: 32, textAlign: "end", color: "#888" }}>
                  {Math.round(sec)}s
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Insight */}
      {topRoom && (
        <p style={{ fontSize: 12, color: "#555", lineHeight: 1.5, marginBottom: 8 }}>
          {insightTemplate
            .replace("{room}", getRoomName(topRoom) ?? "")
            .replace("{feature}", ROOM_FEATURES[topRoom] ?? "")}
        </p>
      )}

      {/* Footer */}
      <p style={{ fontSize: 11, color: "#aaa", lineHeight: 1.4 }}>{footerLabel}</p>
    </div>
  );
}
