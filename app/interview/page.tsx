"use client";
/**
 * /interview — Phase 2b
 *
 * After the power-off transition, this page:
 *   0. Checks rate limit and whether the buyer already has a profile.
 *      - Has profile + not an explicit retake → redirects to /processing
 *        (processing re-runs matching with the saved profile, then goes to /results).
 *      - Rate limit reached → shows blocked state with wait time.
 *   1. Calls POST /api/liveavatar/session (server-side) to get LiveKit credentials.
 *   2. Joins the LiveKit room using livekit-client (low-level SDK).
 *   3. Renders the avatar's video track full-screen.
 *   4. Buffers transcript lines arriving on the "agent-response" data channel.
 *   5. Shows an "End conversation" button; on click: saves transcript → /processing.
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

interface TranscriptLine {
  role: "user" | "agent";
  text: string;
  ts: number;
}

type InterviewState =
  | { phase: "checking" }                             // pre-flight: rate limit + profile check
  | { phase: "connecting" }
  | { phase: "ready"; room: Room }                    // room connected, waiting for user gesture
  | { phase: "live"; room: Room }                     // mic active, conversation in progress
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
  const transcriptRef = useRef<TranscriptLine[]>([]);
  const [state, setState] = useState<InterviewState>({ phase: "checking" });
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  // DEMO ONLY — remove before production
  const [demoCountdown, setDemoCountdown] = useState(5);

  // DEMO ONLY — auto-navigate to /processing after 5 seconds.
  // Guard: do not fire while checking or rate-limited.
  useEffect(() => {
    const interval = setInterval(() => {
      setDemoCountdown((n) => (n <= 1 ? 0 : n - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (demoCountdown === 0 && state.phase !== "checking" && state.phase !== "rate-limited") {
      router.push("/processing");
    }
  }, [demoCountdown, router, state.phase]);

  // ── Attach a remote video track directly to our styled <video> ref ───────
  const attachVideo = useCallback((track: RemoteTrack) => {
    if (videoRef.current) {
      track.attach(videoRef.current);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      // ── Phase 0: Pre-flight check ─────────────────────────────────────────
      const token = typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : "";

      try {
        const limitRes = await fetch("/api/interview/rate-limit", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (limitRes.ok) {
          const { hasCompletedProfile, remaining, nextAvailableAt } =
            await limitRes.json() as {
              hasCompletedProfile: boolean;
              remaining: number;
              nextAvailableAt: string | null;
            };

          // "requestedRetake" is set by the results page retake button.
          // Without it, a returning buyer with a profile is sent back to results.
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
        // If the check fails (e.g. unauthenticated), proceed — server enforces the limit.
      } catch {
        // Graceful degradation: continue to connect; server will enforce via 429.
      }

      if (cancelled) return;
      setState({ phase: "connecting" });

      try {
        // ── Phase 1: Fetch LiveKit credentials ─────────────────────────────
        const res = await fetch("/api/liveavatar/session", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });

        // Handle server-side rate-limit enforcement (fallback / race condition)
        if (res.status === 429) {
          const data = await res.json().catch(() => ({})) as { nextAvailableAt?: string };
          if (!cancelled) {
            setState({ phase: "rate-limited", nextAvailableAt: data.nextAvailableAt ?? "" });
          }
          return;
        }

        if (!res.ok) {
          const { error } = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(error ?? "Session API returned " + res.status);
        }

        const { livekit_url, livekit_client_token } = await res.json() as {
          livekit_url: string;
          livekit_client_token: string;
        };

        if (cancelled) return;

        // ── Phase 2: Create and connect the Room ───────────────────────────
        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
        });
        roomRef.current = room;

        // ── Phase 3: Wire up remote video track subscriptions ──────────────
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

        // ── Phase 4: Capture transcript from ElevenLabs data channel ───────
        room.on(RoomEvent.DataReceived, (payload: Uint8Array, _participant, _kind, topic?: string) => {
          if (topic !== "agent-response") return;
          try {
            const text = new TextDecoder().decode(payload);
            const outer = JSON.parse(text) as {
              type: string;
              elevenlabs_event_type?: string;
              message?: string;
            };

            if (outer.type !== "elevenlabs_agent_event") return;

            const eventType = outer.elevenlabs_event_type;
            const message = outer.message ?? "";

            if (eventType === "user_transcript" && message) {
              const line: TranscriptLine = { role: "user", text: message, ts: Date.now() };
              transcriptRef.current.push(line);
              setTranscript((prev) => [...prev, line]);
            } else if (eventType === "agent_response" && message) {
              const line: TranscriptLine = { role: "agent", text: message, ts: Date.now() };
              transcriptRef.current.push(line);
              setTranscript((prev) => [...prev, line]);
            }
          } catch {
            // Malformed payload — ignore
          }
        });

        await room.connect(livekit_url, livekit_client_token);

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
      roomRef.current?.disconnect();
    };
  }, [attachVideo, router]);

  // ── Start conversation (user gesture → mic enabled) ─────────────────────
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

  // ── End conversation ─────────────────────────────────────────────────────
  const endConversation = useCallback(async () => {
    setState({ phase: "ending" });

    if (roomRef.current) {
      await roomRef.current.disconnect();
      roomRef.current = null;
    }

    const lines = transcriptRef.current;
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

    try {
      const res = await fetch("/api/transcript", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token ?? ""}`,
        },
        body: JSON.stringify({ lines }),
      });
      if (res.ok) {
        const { transcriptId } = await res.json();
        if (transcriptId) localStorage.setItem("transcriptId", transcriptId);
      }
    } catch {
      // Don't block navigation even if save fails
    }

    router.push("/processing");
  }, [router]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        background: "#000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-inter, ui-sans-serif, sans-serif)",
      }}
    >
      {/* Avatar video */}
      <div
        style={{
          flex: 1,
          width: "100%",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
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

        {/* Checking spinner */}
        {state.phase === "checking" && (
          <div style={{ color: "#6B6860", fontSize: "0.875rem", letterSpacing: "0.05em" }}>
            Checking…
          </div>
        )}

        {/* Connecting spinner */}
        {state.phase === "connecting" && (
          <div style={{ color: "#6B6860", fontSize: "0.875rem", letterSpacing: "0.05em" }}>
            Connecting…
          </div>
        )}

        {/* Rate-limited state */}
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

        {/* Ready overlay — avatar visible, waiting for user to start */}
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

        {/* Error state */}
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
            <div style={{ color: "#6B6860" }}>{state.message}</div>
          </div>
        )}

        {/* Ending state */}
        {state.phase === "ending" && (
          <div style={{ color: "#6B6860", fontSize: "0.875rem" }}>
            Saving conversation…
          </div>
        )}
      </div>

      {/* DEMO ONLY — countdown banner. Remove before production. */}
      {state.phase !== "rate-limited" && state.phase !== "checking" && (
        <div
          style={{
            position: "absolute",
            top: "1rem",
            right: "1rem",
            background: "rgba(200,155,60,0.15)",
            border: "1px solid rgba(200,155,60,0.35)",
            borderRadius: "0.5rem",
            padding: "0.375rem 0.875rem",
            fontSize: "0.75rem",
            color: "#C89B3C",
            fontWeight: 600,
            letterSpacing: "0.04em",
            backdropFilter: "blur(6px)",
            zIndex: 20,
          }}
        >
          DEMO — proceeding in {demoCountdown}s
        </div>
      )}

      {/* Bottom bar — visible once conversation is active */}
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
          {/* Live transcript preview (last line) */}
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

          {/* End button */}
          <button
            onClick={endConversation}
            disabled={state.phase !== "live"}
            style={{
              flexShrink: 0,
              padding: "0.625rem 1.5rem",
              borderRadius: "0.5rem",
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.06)",
              color: state.phase === "live" ? "#F7F5F1" : "#6B6860",
              fontSize: "0.8125rem",
              fontWeight: 600,
              letterSpacing: "0.04em",
              cursor: state.phase === "live" ? "pointer" : "not-allowed",
              transition: "background 0.15s, border-color 0.15s",
            }}
            onMouseEnter={(e) => {
              if (state.phase === "live")
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
