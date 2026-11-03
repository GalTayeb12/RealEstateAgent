"use client";

import { Html } from "@react-three/drei";
import type { Room, Profile } from "@/lib/tour/types";

interface RoomLabelsProps {
  rooms: Room[];
  profileId: string;
  profiles: Profile[];
  focusRoomId: string | null;
  mode: "orbit" | "walk";
  onFocusRoom: (id: string) => void;
  sqmLabel: string;
  monthlyRentLabel: string;
}

export default function RoomLabels({
  rooms,
  profileId,
  profiles,
  focusRoomId,
  mode,
  onFocusRoom,
  sqmLabel,
  monthlyRentLabel,
}: RoomLabelsProps) {
  if (mode === "walk") return null;

  const profile = profiles.find((p) => p.id === profileId);

  return (
    <group>
      {rooms.map((room) => {
        const label = profile?.labels[room.id] ?? room.name;
        const isFocused = focusRoomId === room.id;
        const rent = profile?.rent?.[room.id];

        return (
          <Html
            key={room.id}
            position={[room.cx, 1.25, room.cz]}
            center
            distanceFactor={12}
            style={{ pointerEvents: "auto" }}
          >
            <div
              onClick={() => onFocusRoom(room.id)}
              style={{
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
                transition: "background 0.2s",
                lineHeight: 1.4,
              }}
            >
              <div style={{ fontWeight: 600 }}>{label}</div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>
                {room.area.toFixed(1)} {sqmLabel}
              </div>
              {rent != null && (
                <div style={{ fontSize: 11, opacity: 0.8, color: isFocused ? "#ffe8c0" : "#d27a12" }}>
                  {rent.toLocaleString()} {monthlyRentLabel}
                </div>
              )}
            </div>
          </Html>
        );
      })}
    </group>
  );
}
