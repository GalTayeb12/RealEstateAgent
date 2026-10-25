"use client";
/**
 * /interview
 *
 * Live path:
 *   0. Rate-limit + existing-profile check.
 *   1. POST /api/liveavatar/session → LiveKit credentials (HeyGen + ElevenLabs).
 *   2. Join the LiveKit room and render the avatar video.
 *   3. Buffer transcript lines from the `agent-response` data channel.
 *   4. "End conversation" (or agent hang-up) saves the transcript → /processing.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Room,
  RoomEvent,
  RemoteParticipant,
  RemoteTrackPublication,
  RemoteTrack,
  Track,
} from "livekit-client";
import {
  parseAgentResponsePayload,
  type TranscriptLine,
} from "@/lib/liveavatar";

type InterviewState =
  | { phase: "checking" }
  | { phase: "connecting" }
  | { phase: "ready"; room: Room }
  | { phase: "live"; room: Room }
  | { phase: "ending" }
  | { phase: "rate-limited"; nextAvailableAt: string }
  | { phase: "error"; message: string };

function formatWait(nextAvailableAt: string): string {
  const diff = new Date(nextAvailableAt).getTime() - Date.now();
  if (diff <= 0) return "any moment";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.ceil((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export default function InterviewPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<Room | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const transcriptRef = useRef<TranscriptLine[]>([]);
  const endingRef = useRef(false);
  const endConversationRef = useRef<() => Promise<void>>(async () => {});
  const [state, setState] = useState<InterviewState>({ phase: "checking" });
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);

  const pushLine = useCallback((line: TranscriptLine) => {
    const last = transcriptRef.current[transcriptRef.current.length - 1];
    if (last && last.role === line.role && last.text === line.text) return;
    transcriptRef.current.push(line);
    setTranscript((prev) => [...prev, line]);
  }, []);

  const attachVideo = useCallback((track: RemoteTrack) => {
    if (videoRef.current) {
      track.attach(videoRef.current);
    }
  }, []);

  const attachExistingVideo = useCallback(
    (room: Room) => {
      room.remoteParticipants.forEach((participant) => {
        participant.trackPublications.forEach((pub: RemoteTrackPublication) => {
          if (pub.track && pub.track.kind === Track.Kind.Video) {
            attachVideo(pub.track);
          }
        });
      });
    },
    [attachVideo]
  );

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : "";

      try {
        const limitRes = await fetch("/api/interview/rate-limit", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (limitRes.ok) {
          const { hasCompletedProfile, remaining, nextAvailableAt } =
            (await limitRes.json()) as {
              hasCompletedProfile: boolean;
              remaining: number;
              nextAvailableAt: string | null;
            };

          const isRetake =
            typeof window !== "undefined" &&
            sessionStorage.getItem("requestedRetake") === "true";
          if (typeof window !== "undefined") {
            sessionStorage.removeItem("requestedRetake");
          }

          if (hasCompletedProfile && !isRetake) {
            if (!cancelled) router.push("/processing");
            return;
          }

          if (remaining === 0) {
            if (!cancelled) {
              setState({ phase: "rate-limited", nextAvailableAt: nextAvailableAt ?? "" });
            }
            return;
          }
        }
      } catch {
        // Server still enforces the limit on session create.
      }

      if (cancelled) return;
      setState({ phase: "connecting" });

      try {
        const res = await fetch("/api/liveavatar/session", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 429) {
          const data = (await res.json().catch(() => ({}))) as { nextAvailableAt?: string };
          if (!cancelled) {
            setState({ phase: "rate-limited", nextAvailableAt: data.nextAvailableAt ?? "" });
          }
          return;
        }

        if (!res.ok) {
          const { error } = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(error ?? "Session API returned " + res.status);
        }

        const { livekit_url, livekit_client_token, session_id } = (await res.json()) as {
          livekit_url: string;
          livekit_client_token: string;
          session_id?: string;
        };

        if (cancelled) return;
        sessionIdRef.current = session_id ?? null;

        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
        });
        roomRef.current = room;

        room.on(RoomEvent.TrackSubscribed, (track, _pub, _participant) => {
          if (track.kind === Track.Kind.Video) {
            attachVideo(track);
          }
        });

        room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
          participant.trackPublications.forEach((pub: RemoteTrackPublication) => {
            if (pub.track && pub.track.kind === Track.Kind.Video) {
              attachVideo(pub.track);
            }
          });
        });

        room.on(RoomEvent.DataReceived, (payload: Uint8Array, _participant, _kind, topic?: string) => {
          if (topic && topic !== "agent-response") return;
          try {
            const parsed = parseAgentResponsePayload(new TextDecoder().decode(payload));
            if (parsed === "session_stopped") {
              void endConversationRef.current();
              return;
            }
            if (parsed) pushLine(parsed);
          } catch {
            // Malformed payload — ignore
          }
        });

        await room.connect(livekit_url, livekit_client_token);
        attachExistingVideo(room);

        if (cancelled) {
          await room.disconnect();
          return;
        }

        setState({ phase: "ready", room });
      } catch (err) {
        if (!cancelled) {
          setState({ phase: "error", message: (err as Error).message });
        }
      }
    }

    connect();

    return () => {
      cancelled = true;
      const sid = sessionIdRef.current;
      const token = typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : "";
      if (sid && !endingRef.current) {
        void fetch("/api/liveavatar/stop", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ sessionId: sid }),
        }).catch(() => {});
      }
      roomRef.current?.disconnect();
    };
  }, [attachExistingVideo, attachVideo, pushLine, router]);

  const startConversation = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.startAudio();
      await room.localParticipant.setMicrophoneEnabled(true);
      setState({ phase: "live", room });
    } catch (err) {
      setState({ phase: "error", message: `Microphone error: ${(err as Error).message}` });
    }
  }, []);

  const endConversation = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    setState({ phase: "ending" });

    const token = typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : "";
    const sessionId = sessionIdRef.current;

    if (sessionId) {
      await fetch("/api/liveavatar/stop", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId }),
      }).catch(() => {});
    }

    if (roomRef.current) {
      await roomRef.current.disconnect();
      roomRef.current = null;
    }

    let lines = transcriptRef.current;
    if (lines.length === 0 && sessionId) {
      try {
        const fallback = await fetch(
          `/api/liveavatar/transcript?sessionId=${encodeURIComponent(sessionId)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (fallback.ok) {
          const data = (await fallback.json()) as { lines?: TranscriptLine[] };
          if (data.lines?.length) {
            lines = data.lines;
            transcriptRef.current = lines;
          }
        }
      } catch {
        // Fall through to the empty-transcript error below.
      }
    }

    if (lines.length === 0) {
      setState({
        phase: "error",
        message: "We didn't capture the conversation. Please start the interview again.",
      });
      endingRef.current = false;
      return;
    }

    try {
      const res = await fetch("/api/transcript", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ lines }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(error ?? "Failed to save transcript");
      }
      const { transcriptId } = await res.json();
      if (transcriptId) localStorage.setItem("transcriptId", transcriptId);
    } catch (err) {
      setState({
        phase: "error",
        message: (err as Error).message,
      });
      endingRef.current = false;
      return;
    }

    router.push("/processing");
  }, [router]);

  endConversationRef.current = endConversation;

  return (
    <main
      style={{
        position: "fixed",
        top: "3.25rem",
        left: 0,
        right: 0,
        bottom: 0,
        background: "#000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-inter, ui-sans-serif, sans-serif)",
      }}
    >
      <div
        style={{
          flex: 1,
          width: "100%",
          minHeight: 0,
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={false}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: state.phase === "live" || state.phase === "ready" ? "block" : "none",
          }}
        />

        {state.phase === "checking" && (
          <div style={{ color: "#6B6860", fontSize: "0.875rem", letterSpacing: "0.05em" }}>
            Checking…
          </div>
        )}

        {state.phase === "connecting" && (
          <div style={{ color: "#6B6860", fontSize: "0.875rem", letterSpacing: "0.05em" }}>
            Connecting…
          </div>
        )}

        {state.phase === "rate-limited" && (
          <div
            style={{
              color: "#F7F5F1",
              fontSize: "0.9375rem",
              textAlign: "center",
              padding: "2rem",
              maxWidth: "28rem",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "1rem",
            }}
          >
            <div
              style={{
                width: "3rem",
                height: "3rem",
                borderRadius: "50%",
                background: "rgba(200,155,60,0.15)",
                border: "1px solid rgba(200,155,60,0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.25rem",
              }}
            >
              ⏱
            </div>
            <div style={{ fontWeight: 700, fontSize: "1rem", color: "#F7F5F1" }}>
              Interview limit reached
            </div>
            <div style={{ color: "#9A958F", lineHeight: 1.6, fontSize: "0.9375rem" }}>
              You&apos;ve used both of today&apos;s interviews. Try again in{" "}
              <span style={{ color: "#C89B3C", fontWeight: 600 }}>
                {state.nextAvailableAt ? formatWait(state.nextAvailableAt) : "24 hours"}
              </span>
              .
            </div>
            <button
              onClick={() => router.push("/results")}
              style={{
                marginTop: "0.5rem",
                padding: "0.625rem 1.5rem",
                borderRadius: "0.5rem",
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.06)",
                color: "#F7F5F1",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: "pointer",
                letterSpacing: "0.02em",
              }}
            >
              Back to results
            </button>
          </div>
        )}

        {state.phase === "ready" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
              paddingBottom: "5rem",
              background: "linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 40%)",
            }}
          >
            <button
              onClick={startConversation}
              style={{
                padding: "0.875rem 2.5rem",
                borderRadius: "0.625rem",
                border: "1px solid rgba(255,255,255,0.25)",
                background: "rgba(31,75,74,0.85)",
                color: "#F7F5F1",
                fontSize: "0.9375rem",
                fontWeight: 600,
                letterSpacing: "0.03em",
                cursor: "pointer",
                backdropFilter: "blur(8px)",
              }}
            >
              Start conversation
            </button>
          </div>
        )}

        {state.phase === "error" && (
          <div
            style={{
              color: "#B04040",
              fontSize: "0.875rem",
              textAlign: "center",
              padding: "1rem",
              maxWidth: "28rem",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Connection error</div>
            <div style={{ color: "#6B6860", marginBottom: "1rem" }}>{state.message}</div>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "0.625rem 1.5rem",
                borderRadius: "0.5rem",
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.06)",
                color: "#F7F5F1",
                fontSize: "0.8125rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        )}

        {state.phase === "ending" && (
          <div style={{ color: "#6B6860", fontSize: "0.875rem" }}>
            Saving conversation…
          </div>
        )}
      </div>

      {state.phase === "live" && (
        <div
          style={{
            width: "100%",
            padding: "1.25rem 2rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(255,255,255,0.07)",
            gap: "1rem",
          }}
        >
          <div
            style={{
              flex: 1,
              fontSize: "0.8125rem",
              color: "rgba(255,255,255,0.45)",
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            {transcript.length > 0
              ? `${transcript[transcript.length - 1].role === "agent" ? "Avatar" : "You"}: ${transcript[transcript.length - 1].text}`
              : "Listening…"}
          </div>

          <button
            onClick={endConversation}
            style={{
              flexShrink: 0,
              padding: "0.625rem 1.5rem",
              borderRadius: "0.5rem",
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.06)",
              color: "#F7F5F1",
              fontSize: "0.8125rem",
              fontWeight: 600,
              letterSpacing: "0.04em",
              cursor: "pointer",
              transition: "background 0.15s, border-color 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.12)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)";
            }}
          >
            End conversation
          </button>
        </div>
      )}
    </main>
  );
}
