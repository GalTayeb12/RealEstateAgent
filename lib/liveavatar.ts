export const LIVEAVATAR_BASE = "https://api.liveavatar.com";

export type TranscriptLine = {
  role: "user" | "agent";
  text: string;
  ts: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/**
 * Parse a LiveKit `agent-response` payload from the ElevenLabs connector.
 * Accepts LiveAvatar native events and ElevenLabs passthrough wrappers.
 */
export function parseAgentResponsePayload(
  raw: string
): TranscriptLine | "session_stopped" | null {
  let ev: Record<string, unknown>;
  try {
    ev = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }

  const eventType = pickString(ev.event_type, ev.type);
  if (eventType === "session.stopped" || eventType === "session_stopped") {
    return "session_stopped";
  }

  if (eventType === "user.transcription") {
    const data = asRecord(ev.data);
    const text = pickString(ev.text, data?.text, data?.transcript);
    return text ? { role: "user", text, ts: Date.now() } : null;
  }

  if (eventType === "avatar.transcription") {
    const data = asRecord(ev.data);
    const text = pickString(ev.text, data?.text, data?.transcript);
    return text ? { role: "agent", text, ts: Date.now() } : null;
  }

  if (eventType === "elevenlabs_agent_event") {
    const elType = pickString(ev.elevenlabs_event_type);
    const data = asRecord(ev.data) ?? ev;

    if (elType === "user_transcript") {
      const inner = asRecord(data.user_transcription_event);
      const text = pickString(
        inner?.user_transcript,
        inner?.text,
        data.user_transcript,
        data.text,
        ev.message
      );
      return text ? { role: "user", text, ts: Date.now() } : null;
    }

    if (elType === "agent_response") {
      const inner = asRecord(data.agent_response_event);
      const text = pickString(
        inner?.agent_response,
        inner?.text,
        data.agent_response,
        data.text,
        ev.message
      );
      return text ? { role: "agent", text, ts: Date.now() } : null;
    }
  }

  return null;
}

export function mapLiveAvatarTranscript(
  items: Array<{ role?: string; transcript?: string; absolute_timestamp?: number }>
): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  for (const item of items) {
    const text = item.transcript?.trim();
    if (!text) continue;
    lines.push({
      role: item.role === "user" ? "user" : "agent",
      text,
      ts: item.absolute_timestamp ?? Date.now(),
    });
  }
  return lines;
}
