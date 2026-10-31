"use client";
/**
 * /interview — buyers only.
 *
 * Live path:
 *   0. Role gate, rate-limit, existing-profile check.
 *   1. POST /api/liveavatar/session → LiveKit credentials (HeyGen + ElevenLabs).
 *   2. Join the room, attach video and audio to unmuted elements, start playback.
 *   3. Enable the microphone. The conversation starts as soon as the avatar is ready.
 *   4. Buffer transcript lines in memory (not shown). End saves them → /processing.
 *
 * Audio autoplay: entry is a client-side router.push from a click on the
 * previous page, so startAudio() usually succeeds. A refresh has no gesture;
 * then a small "turn on sound" button calls startAudio() inside the click.
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
import { useI18n } from "@/components/LocaleProvider";

type InterviewState =
  | { phase: "checking" }
  | { phase: "connecting" }
  | { phase: "live"; room: Room }
  | { phase: "ending" }
  | { phase: "rate-limited"; nextAvailableAt: string }
  | { phase: "buyer-only" }
  | { phase: "mic-denied" }
  | { phase: "error"; message: string };

function formatWait(nextAvailableAt: string): string {
  const diff = new Date(nextAvailableAt).getTime() - Date.now();
  if (diff <= 0) return "";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.ceil((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function isMicBlocked(err: unknown): boolean {
  const name = err instanceof DOMException ? err.name : (err as { name?: string })?.name;
  return name === "NotAllowedError" || name === "PermissionDeniedError" || name === "NotFoundError" || name === "SecurityError";
}

function readStoredUser(): { role?: string } | null {
  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) as { role?: string } : null;
  } catch {
    return null;
  }
}

export default function InterviewPage() {
  const router = useRouter();
  const { m } = useI18n();
  const copy = m.interview;
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const roomRef = useRef<Room | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const transcriptRef = useRef<TranscriptLine[]>([]);
  const endingRef = useRef(false);
  const endConversationRef = useRef<() => Promise<void>>(async () => {});
  const [state, setState] = useState<InterviewState>({ phase: "checking" });
  const [needsSound, setNeedsSound] = useState(false);

  const pushLine = useCallback((line: TranscriptLine) => {
    const last = transcriptRef.current[transcriptRef.current.length - 1];
    if (last && last.role === line.role && last.text === line.text) return;
    transcriptRef.current.push(line);
  }, []);

  const playElement = useCallback(async (el: HTMLMediaElement | null): Promise<boolean> => {
    if (!el) return false;
    el.muted = false;
    if (!el.srcObject && !el.currentSrc) return true;
    try {
      await el.play();
      return !el.paused;
    } catch {
      // Autoplay blocked. The sound button unlocks this on a click.
      return false;
    }
  }, []);

  const attachTrack = useCallback((track: RemoteTrack) => {
    if (track.kind === Track.Kind.Video && videoRef.current) {
      track.attach(videoRef.current);
      void playElement(videoRef.current);
    }
    if (track.kind === Track.Kind.Audio && audioRef.current) {
      track.attach(audioRef.current);
      void playElement(audioRef.current).then((ok) => {
        if (!ok) setNeedsSound(true);
      });
    }
  }, [playElement]);

  const attachExisting = useCallback((room: Room) => {
    room.remoteParticipants.forEach((participant) => {
      participant.trackPublications.forEach((pub: RemoteTrackPublication) => {
        if (pub.track) attachTrack(pub.track);
      });
    });
  }, [attachTrack]);

  const unlockSound = useCallback(async () => {
    const room = roomRef.current;
    try {
      await room?.startAudio();
    } catch {
      // Still try the elements; the click itself is the user gesture.
    }
    await playElement(audioRef.current);
    await playElement(videoRef.current);
    setNeedsSound(room ? !room.canPlaybackAudio : false);
  }, [playElement]);

  const enableMicrophone = useCallback(async (room: Room) => {
    await room.localParticipant.setMicrophoneEnabled(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      const token = localStorage.getItem("token") ?? "";
      const user = readStoredUser();

      if (!token) {
        router.push("/login");
        return;
      }
      if (user?.role !== "buyer") {
        if (!cancelled) setState({ phase: "buyer-only" });
        return;
      }

      try {
        const limitRes = await fetch("/api/interview/rate-limit", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (limitRes.status === 401) {
          router.push("/login");
          return;
        }
        if (limitRes.status === 403) {
          const data = (await limitRes.json().catch(() => ({}))) as { code?: string };
          if (data.code === "BUYER_ONLY") {
            if (!cancelled) setState({ phase: "buyer-only" });
            return;
          }
        }

        if (limitRes.ok) {
          const { hasCompletedProfile, remaining, nextAvailableAt } =
            (await limitRes.json()) as {
              hasCompletedProfile: boolean;
              remaining: number;
              nextAvailableAt: string | null;
            };

          const isRetake = sessionStorage.getItem("requestedRetake") === "true";
          // A refresh drops the click that started this visit. Keep the
          // interview open so the sound button can unlock playback.
          const resumed = sessionStorage.getItem("interviewActive") === "1";
          sessionStorage.removeItem("requestedRetake");

          if (hasCompletedProfile && !isRetake && !resumed) {
            sessionStorage.removeItem("interviewActive");
            if (!cancelled) router.push("/processing");
            return;
          }
          sessionStorage.setItem("interviewActive", "1");

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

        if (res.status === 401) {
          router.push("/login");
          return;
        }
        if (res.status === 403) {
          const data = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
          if (!cancelled && data.code === "BUYER_ONLY") setState({ phase: "buyer-only" });
          else if (!cancelled) setState({ phase: "error", message: data.error ?? "Forbidden" });
          return;
        }
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

        room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
          attachTrack(track);
        });

        room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
          participant.trackPublications.forEach((pub: RemoteTrackPublication) => {
            if (pub.track) attachTrack(pub.track);
          });
        });

        room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
          setNeedsSound(!room.canPlaybackAudio);
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
        attachExisting(room);

        if (cancelled) {
          await room.disconnect();
          return;
        }

        // Show the avatar before the microphone prompt resolves. A missing
        // device or a pending permission must not leave the screen on "connecting".
        let playbackBlocked = false;
        try {
          await room.startAudio();
        } catch {
          // NotAllowedError when this load has no user gesture (refresh).
          playbackBlocked = true;
        }
        const audioPlaying = await playElement(audioRef.current);
        await playElement(videoRef.current);
        if (!cancelled) setNeedsSound(playbackBlocked || !audioPlaying || !room.canPlaybackAudio);
        if (cancelled) return;
        setState({ phase: "live", room });

        let micBlocked = false;
        const micPromise = enableMicrophone(room);
        // A hung permission prompt must not reject later as an unhandled error.
        micPromise.catch(() => {});
        try {
          await Promise.race([
            micPromise,
            new Promise((_, reject) => {
              setTimeout(() => reject(new DOMException("Microphone timed out", "NotAllowedError")), 8000);
            }),
          ]);
        } catch (err) {
          if (isMicBlocked(err)) micBlocked = true;
          else throw err;
        }
        if (cancelled) return;
        if (micBlocked) setState({ phase: "mic-denied" });
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
      const token = localStorage.getItem("token") ?? "";
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
  }, [attachExisting, attachTrack, enableMicrophone, playElement, pushLine, router]);

  const retryMicrophone = useCallback(async () => {
    const room = roomRef.current;
    if (!room) {
      window.location.reload();
      return;
    }
    try {
      await enableMicrophone(room);
      await room.startAudio();
      await playElement(audioRef.current);
      setNeedsSound(!room.canPlaybackAudio);
      setState({ phase: "live", room });
    } catch (err) {
      if (!isMicBlocked(err)) {
        setState({ phase: "error", message: (err as Error).message });
      }
    }
  }, [enableMicrophone, playElement]);

  const endConversation = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    setState({ phase: "ending" });

    const token = localStorage.getItem("token") ?? "";
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
      setState({ phase: "error", message: copy.emptyTranscript });
      endingRef.current = false;
      return;
    }

    sessionStorage.removeItem("interviewActive");

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
      setState({ phase: "error", message: (err as Error).message });
      endingRef.current = false;
      return;
    }

    router.push("/processing");
  }, [copy.emptyTranscript, router]);

  endConversationRef.current = endConversation;

  const showVideo = state.phase === "live" || state.phase === "mic-denied";
  const homeForRole = () => {
    const role = readStoredUser()?.role;
    if (role === "admin") router.push("/dev/admin/approvals");
    else if (role === "developer") router.push("/dev/dashboard");
    else if (role === "seller") router.push("/seller/dashboard");
    else router.push("/");
  };

  const quietButton: React.CSSProperties = {
    padding: "0.5rem 1rem",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(6,14,24,0.55)",
    color: "#F7F5F1",
    fontSize: "0.8125rem",
    fontWeight: 600,
    cursor: "pointer",
    backdropFilter: "blur(12px)",
  };

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
      <audio
        ref={audioRef}
        autoPlay
        playsInline
        muted={false}
        style={{ position: "fixed", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
      />

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
            display: showVideo ? "block" : "none",
          }}
        />

        {needsSound && showVideo && (
          <button
            type="button"
            onClick={() => { void unlockSound(); }}
            style={{
              position: "absolute",
              top: 16,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 5,
              ...quietButton,
            }}
          >
            {copy.enableSound}
          </button>
        )}

        {state.phase === "checking" && (
          <div style={{ color: "#6B6860", fontSize: "0.875rem", letterSpacing: "0.05em" }}>
            {copy.checking}
          </div>
        )}

        {state.phase === "connecting" && (
          <div style={{ color: "#6B6860", fontSize: "0.875rem", letterSpacing: "0.05em" }}>
            {copy.connecting}
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
            <div style={{ fontWeight: 700, fontSize: "1rem" }}>{copy.limitTitle}</div>
            <div style={{ color: "#9A958F", lineHeight: 1.6 }}>
              {copy.limitBody}{" "}
              <span style={{ color: "#C89B3C", fontWeight: 600 }}>
                {state.nextAvailableAt ? (formatWait(state.nextAvailableAt) || copy.limitFallback) : copy.limitFallback}
              </span>
              .
            </div>
            <button type="button" onClick={() => router.push("/results")} style={quietButton}>
              {copy.backToResults}
            </button>
          </div>
        )}

        {state.phase === "buyer-only" && (
          <div
            style={{
              color: "#F7F5F1",
              textAlign: "center",
              padding: "2rem",
              maxWidth: "28rem",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.75rem",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: "1.05rem" }}>{copy.buyerOnlyTitle}</div>
            <div style={{ color: "#9A958F", lineHeight: 1.6, fontSize: "0.9375rem" }}>{copy.buyerOnlyBody}</div>
            <button type="button" onClick={homeForRole} style={{ ...quietButton, marginTop: "0.5rem" }}>
              {copy.back}
            </button>
          </div>
        )}

        {state.phase === "mic-denied" && (
          <div
            style={{
              position: "absolute",
              left: "50%",
              bottom: "5.5rem",
              transform: "translateX(-50%)",
              zIndex: 5,
              width: "min(28rem, calc(100% - 2rem))",
              textAlign: "center",
              padding: "1rem 1.25rem",
              borderRadius: 16,
              background: "rgba(6,14,24,0.72)",
              border: "1px solid rgba(255,255,255,0.12)",
              backdropFilter: "blur(16px)",
              color: "#F7F5F1",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: "0.35rem" }}>{copy.micDeniedTitle}</div>
            <div style={{ color: "#C5CDD4", fontSize: "0.875rem", lineHeight: 1.55, marginBottom: "0.85rem" }}>
              {copy.micDeniedBody}
            </div>
            <button type="button" onClick={() => { void retryMicrophone(); }} style={quietButton}>
              {copy.tryAgain}
            </button>
          </div>
        )}

        {state.phase === "error" && (
          <div style={{ color: "#B04040", fontSize: "0.875rem", textAlign: "center", padding: "1rem", maxWidth: "28rem" }}>
            <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>{copy.connectionError}</div>
            <div style={{ color: "#6B6860", marginBottom: "1rem" }}>{state.message}</div>
            <button type="button" onClick={() => window.location.reload()} style={quietButton}>
              {copy.tryAgain}
            </button>
          </div>
        )}

        {state.phase === "ending" && (
          <div style={{ color: "#6B6860", fontSize: "0.875rem" }}>{copy.saving}</div>
        )}

        {state.phase === "live" && (
          <button
            type="button"
            onClick={() => { void endConversation(); }}
            style={{
              position: "absolute",
              bottom: 20,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 5,
              ...quietButton,
            }}
          >
            {copy.end}
          </button>
        )}
      </div>
    </main>
  );
}
