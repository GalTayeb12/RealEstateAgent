"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Profile, QuickQuestion } from "@/lib/tour/types";
import { getAnswer } from "@/lib/tour/tourAnswers";

interface BotMessage {
  text: string;
  roomId?: string;
  isUser: boolean;
}

interface PresenterBotProps {
  profileId: string;
  profiles: Profile[];
  questions: QuickQuestion[];
  activeRoomId: string | null;
  onProfileChange: (id: string) => void;
  danaNameLabel: string;
  danaSubtitleLabel: string;
}

export default function PresenterBot({
  profileId,
  profiles,
  questions,
  activeRoomId,
  onProfileChange,
  danaNameLabel,
  danaSubtitleLabel,
}: PresenterBotProps) {
  const [messages, setMessages] = useState<BotMessage[]>([]);
  const spokenRef = useRef(new Set<string>());
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevProfileRef = useRef(profileId);

  // Profile change: reset
  useEffect(() => {
    if (profileId !== prevProfileRef.current) {
      prevProfileRef.current = profileId;
      spokenRef.current = new Set();
      const profile = profiles.find((p) => p.id === profileId);
      if (profile) {
        setMessages([{ text: profile.bot.intro, isUser: false }]);
      }
    }
  }, [profileId, profiles]);

  // Initial intro
  useEffect(() => {
    const profile = profiles.find((p) => p.id === profileId);
    if (profile && messages.length === 0) {
      setMessages([{ text: profile.bot.intro, isUser: false }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Room change: add bot message
  useEffect(() => {
    if (!activeRoomId) return;
    if (spokenRef.current.has(activeRoomId)) return;
    spokenRef.current.add(activeRoomId);

    const profile = profiles.find((p) => p.id === profileId);
    const text = profile?.bot[activeRoomId];
    if (text) {
      setMessages((prev) => [...prev, { text, roomId: activeRoomId, isUser: false }]);
    }
  }, [activeRoomId, profileId, profiles]);

  // Auto scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleQuestion = useCallback(
    (q: QuickQuestion) => {
      setMessages((prev) => [...prev, { text: q.q, isUser: true }]);
      setTimeout(() => {
        const answer = getAnswer(q.k, profileId, profiles);
        if (answer) {
          setMessages((prev) => [...prev, { text: answer, isUser: false }]);
        }
      }, 350);
    },
    [profileId, profiles],
  );

  return (
    <div style={{ direction: "rtl", fontFamily: "var(--font-heebo), sans-serif" }}>
      {/* Dana header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            background: "var(--qp-soft)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 16,
            color: "#444",
            position: "relative",
            flexShrink: 0,
          }}
        >
          {"ד"}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              right: 0,
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "var(--qp-accent)",
              border: "2px solid var(--qp-surface)",
            }}
          />
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{danaNameLabel}</div>
          <div style={{ fontSize: 12, color: "#888" }}>{danaSubtitleLabel}</div>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        style={{
          maxHeight: 260,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          marginBottom: 10,
          paddingLeft: 4,
          paddingRight: 4,
        }}
      >
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              alignSelf: msg.isUser ? "flex-end" : "flex-start",
              background: msg.isUser ? "var(--qp-ink)" : "var(--qp-soft)",
              color: msg.isUser ? "var(--qp-on-primary)" : "var(--qp-ink)",
              borderRadius: 12,
              padding: "8px 14px",
              fontSize: 13,
              lineHeight: 1.5,
              maxWidth: "88%",
            }}
          >
            {msg.text}
          </div>
        ))}
      </div>

      {/* Quick questions */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {questions.map((q) => (
          <button
            key={q.k}
            onClick={() => handleQuestion(q)}
            style={{
              background: "var(--qp-surface)",
              border: "1px solid var(--qp-border)",
              borderRadius: 16,
              padding: "5px 14px",
              fontSize: 12,
              cursor: "pointer",
              color: "#333",
              fontFamily: "inherit",
              whiteSpace: "nowrap",
            }}
          >
            {q.q}
          </button>
        ))}
      </div>
    </div>
  );
}
