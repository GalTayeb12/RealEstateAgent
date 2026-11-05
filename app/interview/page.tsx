"use client";
/**
 * /interview — buyers only.
 *
 * Live path:
 *   0. Cinematic opening plays while the LiveKit connection runs in the background.
 *   1. Rate-limit + profile check inside connect(); quotaWasReset bypasses the
 *      hasCompletedProfile redirect so an admin-reset user can retake.
 *   2. POST /api/liveavatar/session → LiveKit credentials.
 *   3. Join the room, attach video/audio, start playback.
 *   4. Enable the microphone. Conversation starts as the avatar is ready.
 *   5. Buffer transcript lines → /processing on end.
 *
 * Audio autoplay: the connection effect runs ONCE on mount (state.phase is NOT
 * in its deps — that caused triple-connect and triple quota burn on every phase
 * change).  When the user arrived via client-side navigation (router.push)
 * navigator.userActivation.hasBeenActive is true, so room.startAudio() succeeds.
 * Direct URL / refresh shows a "Tap to enter" overlay which calls unlockSound()
 * inside the click handler.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Room,
  RoomEvent,
  RemoteParticipant,
  RemoteTrackPublication,
  RemoteTrack,
  RemoteAudioTrack,
  Track,
} from "livekit-client";
import {
  parseAgentResponsePayload,
  type TranscriptLine,
} from "@/lib/liveavatar";
import { useI18n } from "@/components/LocaleProvider";
import { useAudioUnlock } from "@/components/AudioUnlockProvider";

// ── Cinematic sound (Web Audio API, zero external files) ──────────────────────
// Uses the shared AudioContext from AudioUnlockProvider — do NOT create a new
// context here and do NOT close it (it's shared with the avatar audio stream).

function playCinematicSoundVia(ctx: AudioContext): void {
  try {
    const now = ctx.currentTime;

    // Synthetic reverb: white noise × exponential decay → ConvolverNode
    const irLen = Math.round(ctx.sampleRate * 2.0);
    const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c);
      for (let i = 0; i < irLen; i++) {
        ch[i] = (Math.random() * 2 - 1) * Math.exp(-2.5 * i / irLen);
      }
    }
    const reverb = ctx.createConvolver();
    reverb.buffer = ir;

    const dry = ctx.createGain();
    dry.gain.value = 0.62;
    dry.connect(ctx.destination);
    const wet = ctx.createGain();
    wet.gain.value = 0.32;
    wet.connect(reverb);
    reverb.connect(ctx.destination);

    function tone(
      freq: number, type: OscillatorType,
      startAt: number, attack: number, hold: number, decay: number, peak: number
    ) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, now + startAt);
      g.gain.linearRampToValueAtTime(peak, now + startAt + attack);
      g.gain.setValueAtTime(peak, now + startAt + attack + hold);
      g.gain.exponentialRampToValueAtTime(0.0001, now + startAt + attack + hold + decay);
      osc.connect(g);
      g.connect(dry);
      g.connect(wet);
      osc.start(now + startAt);
      osc.stop(now + startAt + attack + hold + decay + 0.1);
    }

    // A minor pentatonic chord build-up (~2.5 s total)
    tone(55,   "sine",     0,    0.60, 0.60, 1.30, 0.22); // A1 sub
    tone(82.4, "sine",     0.10, 0.50, 0.50, 1.10, 0.14); // E2
    tone(110,  "sine",     0.15, 0.40, 0.40, 1.00, 0.11); // A2
    tone(165,  "sine",     0.20, 0.30, 0.30, 1.00, 0.08); // E3
    tone(220,  "triangle", 0.25, 0.25, 0.30, 1.10, 0.06); // A3 warm
    tone(440,  "sine",     0.30, 0.15, 0.20, 0.90, 0.035);// A4 shimmer
    tone(880,  "sine",     0.40, 0.08, 0.10, 0.65, 0.020);// A5 sparkle
    // Nodes auto-disconnect after they stop; don't close the shared context.
  } catch {
    // Web Audio blocked or unavailable — silent
  }
}

// ── Type helpers ──────────────────────────────────────────────────────────────

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
  return (
    name === "NotAllowedError" ||
    name === "PermissionDeniedError" ||
    name === "NotFoundError" ||
    name === "SecurityError"
  );
}

function readStoredUser(): { role?: string } | null {
  try {
    const raw = localStorage.getItem("user");
    return raw ? (JSON.parse(raw) as { role?: string }) : null;
  } catch {
    return null;
  }
}

// ── Speaker icons ─────────────────────────────────────────────────────────────

function SpeakerOnIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M11 5L6 9H2v6h4l5 4V5z" fill="currentColor" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function SpeakerOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M11 5L6 9H2v6h4l5 4V5z" fill="currentColor" />
      <line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function InterviewPage() {
  const router = useRouter();
  const { m } = useI18n();
  const copy = m.interview;

  const { getCtx, unlock } = useAudioUnlock();

  // Media refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Session refs
  const roomRef = useRef<Room | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const transcriptRef = useRef<TranscriptLine[]>([]);
  const endingRef = useRef(false);
  const endConversationRef = useRef<() => Promise<void>>(async () => {});
  const cinematicSoundPlayedRef = useRef(false);
  // Web Audio routing for avatar audio — avoids autoplay-policy blocks
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  // AnalyserNode on the source — used for RMS monitoring logs
  const audioAnalyserRef = useRef<AnalyserNode | null>(null);
  const rmsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Holds an audio track that arrived before the AudioContext was running
  const pendingAudioTrackRef = useRef<RemoteTrack | null>(null);
  // Auto-end: timer started when buyer says a farewell phrase
  const farewellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Interview state machine
  const [state, setState] = useState<InterviewState>({ phase: "checking" });
  const [needsSound, setNeedsSound] = useState(false);
  const [avatarSpeaking, setAvatarSpeaking] = useState(false);

  // Cinematic state
  const [cinematicVisible, setCinematicVisible] = useState(true);
  const [tapNeeded, setTapNeeded] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [prefersReduced, setPrefersReduced] = useState(false);

  // ── Cinematic bootstrap (runs once on mount) ──────────────────────────────

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setPrefersReduced(reduced);

    const muted = localStorage.getItem("interview-muted") === "1";
    setIsMuted(muted);

    // navigator.userActivation.hasBeenActive is true when the user arrived via
    // client-side navigation (they clicked a button on the previous page).
    const ua = (
      navigator as unknown as { userActivation?: { hasBeenActive: boolean } }
    ).userActivation;
    const hasActivation = ua?.hasBeenActive ?? false;

    if (!hasActivation) {
      setTapNeeded(true);
      return; // timer starts on tap
    }

    // Client-side navigation: unlock the shared AudioContext (may already be
    // running from the login/homepage handler; this call is idempotent).
    void unlock().then(() => {
      const ctx = getCtx();
      console.log("[interview] cinematic mount, ctx.state:", ctx?.state ?? "none");
      if (!muted && !reduced && ctx?.state === "running") {
        cinematicSoundPlayedRef.current = true;
        playCinematicSoundVia(ctx);
      }
    });

    const duration = reduced ? 700 : 2500;
    const timer = setTimeout(() => setCinematicVisible(false), duration);
    return () => clearTimeout(timer);
  }, [unlock, getCtx]); // both are stable useCallback refs — effect still runs once

  // Dismiss cinematic when a terminal state is reached
  useEffect(() => {
    if (
      state.phase === "rate-limited" ||
      state.phase === "buyer-only" ||
      state.phase === "error"
    ) {
      const t = setTimeout(() => setCinematicVisible(false), 900);
      return () => clearTimeout(t);
    }
  }, [state.phase]);

  // Show "enable sound" button only when avatar is speaking AND context is blocked.
  // (In the happy login→interview path the context is already running, so this
  //  never fires. It only appears on direct-URL entry / refresh if the user somehow
  //  reached the live phase without the tap-to-enter gesture.)
  useEffect(() => {
    if (avatarSpeaking) {
      const ctx = getCtx();
      if (!ctx || ctx.state !== "running") {
        console.log("[interview] avatar speaking, ctx not running → show enable button");
        setNeedsSound(true);
      }
    }
  }, [avatarSpeaking, getCtx]);

  // ── Audio helpers ─────────────────────────────────────────────────────────

  const pushLine = useCallback((line: TranscriptLine) => {
    const last = transcriptRef.current[transcriptRef.current.length - 1];
    if (last && last.role === line.role && last.text === line.text) return;
    transcriptRef.current.push(line);

    // Auto-end: detect buyer farewell intent and trigger end after 2 s
    if (line.role === "user" && farewellTimerRef.current === null) {
      const text = line.text.toLowerCase().trim();
      const isFarewell =
        // Hebrew
        /ביי|להתראות|שלום.*(סיים|גמר)|סיימנו|תודה.*(זהו|גמרנו|סיים)|זהו.*(תודה|טוב)|נגמר|אנחנו גמרנו|די.*(תודה|לא צריך)|חצינו/.test(text) ||
        // English
        /^bye|goodbye|that('?s| is) (all|it)|we('re| are) done|thanks.*that('?s| is) it|see you|all set|that'?ll do|no (more|further)/.test(text);
      if (isFarewell) {
        farewellTimerRef.current = setTimeout(() => {
          farewellTimerRef.current = null;
          void endConversationRef.current();
        }, 2000);
      }
    }
  }, []);

  const playElement = useCallback(async (el: HTMLMediaElement | null): Promise<boolean> => {
    if (!el) return false;
    el.muted = false;
    if (!el.srcObject && !el.currentSrc) return true;
    try {
      await el.play();
      return !el.paused;
    } catch {
      return false;
    }
  }, []);

  const attachTrack = useCallback(
    (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Video && videoRef.current) {
        track.attach(videoRef.current);
        void playElement(videoRef.current);
      }
      if (track.kind === Track.Kind.Audio) {
        const ctx = getCtx();
        const msTrack = track.mediaStreamTrack;
        console.log("[LiveAvatar audio] track received:", track.sid, "| ctx.state:", ctx?.state ?? "none");

        // Disconnect any previous source node for this track
        if (audioSourceRef.current) {
          try { audioSourceRef.current.disconnect(); } catch {}
          audioSourceRef.current = null;
        }

        if (ctx?.state === "running" && msTrack) {
          // Primary path: Web Audio API — context is already running (unlocked by
          // the login/homepage button), so there is no autoplay-policy block.
          try {
            // Stop any previous RMS timer before replacing nodes
            if (rmsTimerRef.current !== null) {
              clearInterval(rmsTimerRef.current);
              rmsTimerRef.current = null;
            }
            if (audioAnalyserRef.current) {
              try { audioAnalyserRef.current.disconnect(); } catch {}
              audioAnalyserRef.current = null;
            }

            const stream = new MediaStream([msTrack]);
            const source = ctx.createMediaStreamSource(stream);

            // Chrome bug: createMediaStreamSource on a remote WebRTC stream is
            // silent unless the same stream also plays through a media element.
            // Fix: pipe the stream into a muted <audio> element.  Muted elements
            // are allowed to autoplay unconditionally, so this never hits the
            // autoplay policy.  The audible output comes from the AudioContext.
            const el = audioRef.current;
            if (el) {
              el.srcObject = stream;
              el.muted = true;
              void el.play().then(() => {
                console.log("[LiveAvatar audio] anchor el: muted:", el.muted, "paused:", el.paused);
              }).catch((err: unknown) => {
                console.warn("[LiveAvatar audio] anchor el play failed:", err);
              });
            }

            // source → analyser → destination
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            analyser.connect(ctx.destination);
            audioSourceRef.current = source;
            audioAnalyserRef.current = analyser;

            // Log RMS every second so we can verify audio is actually flowing.
            const buf = new Float32Array(analyser.fftSize);
            rmsTimerRef.current = setInterval(() => {
              analyser.getFloatTimeDomainData(buf);
              let sum = 0;
              for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
              const rms = Math.sqrt(sum / buf.length);
              console.log("[LiveAvatar audio] RMS:", rms.toFixed(5));
            }, 1000);

            console.log("[LiveAvatar audio] ✓ routed through AudioContext");
            setNeedsSound(false);
          } catch (err) {
            console.warn("[LiveAvatar audio] MediaStreamSource error:", err);
            pendingAudioTrackRef.current = track;
          }
        } else {
          // Context not yet running (direct URL / refresh before tap).
          // Park the track — it will be routed in unlockSound() / handleCinematicTap().
          pendingAudioTrackRef.current = track;
          console.log("[LiveAvatar audio] ctx not running, parked track. ctx.state:", ctx?.state ?? "none");
        }

        // Keep LiveKit's RemoteAudioTrack in a known attached state via the
        // built-in Web Audio path so level monitoring still works.
        if (ctx?.state === "running") {
          (track as RemoteAudioTrack).setAudioContext(ctx);
        }
      }
    },
    [getCtx, playElement]
  );

  const attachExisting = useCallback(
    (room: Room) => {
      room.remoteParticipants.forEach((participant) => {
        participant.trackPublications.forEach((pub: RemoteTrackPublication) => {
          if (pub.track) attachTrack(pub.track);
        });
      });
    },
    [attachTrack]
  );

  const unlockSound = useCallback(async () => {
    // Resume the shared AudioContext — this is called from a button click so
    // the user-gesture token is active.
    await unlock();
    const ctx = getCtx();
    console.log("[LiveAvatar audio] unlockSound: ctx.state:", ctx?.state ?? "none");

    // Route any audio track that arrived before the context was running.
    const pending = pendingAudioTrackRef.current;
    if (pending && ctx?.state === "running") {
      pendingAudioTrackRef.current = null;
      attachTrack(pending);
    }

    setNeedsSound(ctx ? ctx.state !== "running" : false);
  }, [unlock, getCtx, attachTrack]);

  const enableMicrophone = useCallback(async (room: Room) => {
    await room.localParticipant.setMicrophoneEnabled(true);
  }, []);

  // ── Cinematic tap handler ─────────────────────────────────────────────────

  const tapHandledRef = useRef(false);
  const handleCinematicTap = useCallback(() => {
    if (tapHandledRef.current) return;
    tapHandledRef.current = true;

    void (async () => {
      // Resume the AudioContext while the gesture token is active.
      await unlock();
      const ctx = getCtx();
      console.log("[interview] tap: ctx.state after unlock:", ctx?.state ?? "none");

      // Play the cinematic chord through the now-running context.
      if (!cinematicSoundPlayedRef.current && !isMuted && !prefersReduced) {
        cinematicSoundPlayedRef.current = true;
        if (ctx?.state === "running") playCinematicSoundVia(ctx);
      }

      // Route any audio track that arrived during the tap-to-enter wait.
      const pending = pendingAudioTrackRef.current;
      if (pending && ctx?.state === "running") {
        pendingAudioTrackRef.current = null;
        attachTrack(pending);
      }
    })();

    setTapNeeded(false);
    const duration = prefersReduced ? 700 : 2500;
    setTimeout(() => setCinematicVisible(false), duration);
  }, [isMuted, prefersReduced, unlock, getCtx, attachTrack]);

  // ── Mute toggle ───────────────────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      localStorage.setItem("interview-muted", next ? "1" : "0");
      return next;
    });
  }, []);

  // ── Connection effect (runs ONCE on mount — state.phase intentionally omitted
  //    from deps to prevent double/triple connects on every phase transition) ──

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
          const { hasCompletedProfile, remaining, nextAvailableAt, quotaWasReset } =
            (await limitRes.json()) as {
              hasCompletedProfile: boolean;
              remaining: number;
              nextAvailableAt: string | null;
              quotaWasReset: boolean;
            };

          const isRetake = sessionStorage.getItem("requestedRetake") === "true";
          // Keep the page open on refresh so the sound button can unlock playback.
          const resumed = sessionStorage.getItem("interviewActive") === "1";
          sessionStorage.removeItem("requestedRetake");

          // Redirect only if: has profile, not a retake, not a resume, AND quota
          // was not recently reset (admin reset means user should be allowed back in).
          if (hasCompletedProfile && !isRetake && !resumed && !quotaWasReset) {
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
          const data = (await res.json().catch(() => ({}))) as {
            code?: string;
            error?: string;
          };
          if (!cancelled && data.code === "BUYER_ONLY") setState({ phase: "buyer-only" });
          else if (!cancelled) setState({ phase: "error", message: data.error ?? "Forbidden" });
          return;
        }
        if (res.status === 429) {
          const data = (await res.json().catch(() => ({}))) as {
            nextAvailableAt?: string;
          };
          if (!cancelled) {
            setState({
              phase: "rate-limited",
              nextAvailableAt: data.nextAvailableAt ?? "",
            });
          }
          return;
        }
        if (!res.ok) {
          const { error } = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(error ?? "Session API returned " + res.status);
        }

        const { livekit_url, livekit_client_token, session_id } =
          (await res.json()) as {
            livekit_url: string;
            livekit_client_token: string;
            session_id?: string;
          };

        if (cancelled) return;
        sessionIdRef.current = session_id ?? null;

        const room = new Room({ adaptiveStream: true, dynacast: true });
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
          // We use AudioContext for audio — ignore this element-based event when
          // the context is already running.
          const ctx = getCtx();
          if (ctx?.state === "running") return;
          setNeedsSound(!room.canPlaybackAudio);
        });

        room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
          setAvatarSpeaking(speakers.some((s) => s instanceof RemoteParticipant));
        });

        room.on(
          RoomEvent.DataReceived,
          (payload: Uint8Array, _participant, _kind, topic?: string) => {
            if (topic && topic !== "agent-response") return;
            try {
              const parsed = parseAgentResponsePayload(
                new TextDecoder().decode(payload)
              );
              if (parsed === "session_stopped") {
                void endConversationRef.current();
                return;
              }
              if (parsed) pushLine(parsed);
            } catch {
              // Malformed payload — ignore
            }
          }
        );

        await room.connect(livekit_url, livekit_client_token);
        attachExisting(room);

        if (cancelled) {
          await room.disconnect();
          return;
        }

        // Audio is routed through the shared AudioContext in attachTrack() —
        // no room.startAudio() needed. Video still plays through the HTML element.
        await playElement(videoRef.current);
        const ctx = getCtx();
        console.log("[interview] connected, ctx.state:", ctx?.state ?? "none");
        // needsSound is managed by attachTrack (happy path) and the
        // avatarSpeaking effect (fallback for direct-URL entry).
        if (cancelled) return;
        setState({ phase: "live", room });

        let micBlocked = false;
        const micPromise = enableMicrophone(room);
        micPromise.catch(() => {});
        try {
          await Promise.race([
            micPromise,
            new Promise<void>((_, reject) => {
              setTimeout(
                () =>
                  reject(
                    new DOMException("Microphone timed out", "NotAllowedError")
                  ),
                8000
              );
            }),
          ]);
        } catch (err) {
          if (isMicBlocked(err)) micBlocked = true;
          else throw err;
        }
        if (cancelled) return;
        if (micBlocked) setState({ phase: "mic-denied" });
      } catch (err) {
        const msg = (err as Error).message;
        console.error("[interview] connection error:", msg);
        if (!cancelled) {
          setState({ phase: "error", message: msg });
        }
      }
    }

    connect();

    return () => {
      cancelled = true;
      // Cancel any pending farewell-triggered auto-end timer
      if (farewellTimerRef.current !== null) {
        clearTimeout(farewellTimerRef.current);
        farewellTimerRef.current = null;
      }
      // Stop RMS monitoring
      if (rmsTimerRef.current !== null) {
        clearInterval(rmsTimerRef.current);
        rmsTimerRef.current = null;
      }
      // Disconnect the Web Audio nodes so the MediaStream is released.
      if (audioAnalyserRef.current) {
        try { audioAnalyserRef.current.disconnect(); } catch {}
        audioAnalyserRef.current = null;
      }
      if (audioSourceRef.current) {
        try { audioSourceRef.current.disconnect(); } catch {}
        audioSourceRef.current = null;
      }
      // Release anchor element
      if (audioRef.current) {
        audioRef.current.srcObject = null;
      }
      pendingAudioTrackRef.current = null;
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // ^ Intentionally empty deps: the connection runs exactly once on mount.
  //   Stable callbacks (attachExisting, attachTrack, etc.) are captured at first render.
  //   Adding state.phase here would re-run connect() on every phase transition,
  //   burning the user's quota 3× per session attempt.

  // ── Retry / end helpers ───────────────────────────────────────────────────

  const retryMicrophone = useCallback(async () => {
    const room = roomRef.current;
    if (!room) {
      window.location.reload();
      return;
    }
    try {
      await enableMicrophone(room);
      // Audio flows through AudioContext; just check if it's running.
      const ctx = getCtx();
      setNeedsSound(ctx ? ctx.state !== "running" : false);
      setState({ phase: "live", room });
    } catch (err) {
      if (!isMicBlocked(err)) {
        setState({ phase: "error", message: (err as Error).message });
      }
    }
  }, [enableMicrophone, getCtx]);

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
        // Fall through to empty-transcript error
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

  // ── Derived display state ─────────────────────────────────────────────────

  const showVideo = state.phase === "live" || state.phase === "mic-denied";

  const homeForRole = () => {
    const role = readStoredUser()?.role;
    if (role === "admin") router.push("/dev/admin/approvals");
    else if (role === "developer") router.push("/dev/dashboard");
    else if (role === "seller") router.push("/seller/dashboard");
    else router.push("/");
  };

  const quietButton: React.CSSProperties = {
    padding: "0.5rem 1.1rem",
    borderRadius: 999,
    border: "1px solid transparent",
    background: "var(--qp-ink)",
    color: "var(--qp-on-primary)",
    fontSize: "0.875rem",
    fontWeight: 500,
    minHeight: 48,
    cursor: "pointer",
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main
      style={{
        position: "fixed",
        top: "3.25rem",
        left: 0,
        right: 0,
        bottom: 0,
        background: "var(--qp-bg)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-heebo, sans-serif)",
      }}
    >
      <style>{`
        @keyframes speakBar {
          from { transform: scaleY(0.35); opacity: 0.6; }
          to   { transform: scaleY(1.0);  opacity: 1.0; }
        }
        @keyframes logoReveal {
          from { opacity: 0; transform: scale(0.90) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
        @keyframes tapPulse {
          0%, 100% { opacity: 0.65; }
          50%       { opacity: 1;    }
        }
        @media (prefers-reduced-motion: reduce) {
          .cine-logo { animation-duration: 0.4s !important; }
        }
      `}</style>

      {/* ── Cinematic overlay ────────────────────────────────────────────── */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 20,
          background: "#091F20",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          opacity: cinematicVisible ? 1 : 0,
          transition: "opacity 1.2s ease-in-out",
          pointerEvents: cinematicVisible ? "all" : "none",
        }}
      >
        {/* Mute / unmute button */}
        <button
          type="button"
          aria-label={isMuted ? copy.unmuteLabel : copy.muteLabel}
          onClick={toggleMute}
          style={{
            position: "absolute",
            top: 16,
            right: 20,
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: "50%",
            width: 40,
            height: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "rgba(245,240,232,0.75)",
            transition: "background 0.2s",
          }}
        >
          {isMuted ? <SpeakerOffIcon /> : <SpeakerOnIcon />}
        </button>

        {/* Logo */}
        <div
          className="cine-logo"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.75rem",
            animationName: "logoReveal",
            animationDuration: "1.4s",
            animationFillMode: "both",
            animationTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <span
            style={{
              fontSize: "clamp(2rem, 6vw, 3rem)",
              fontWeight: 700,
              color: "#F5F0E8",
              letterSpacing: "-0.02em",
              fontFamily: "var(--font-heebo, sans-serif)",
            }}
          >
            Haveniq
          </span>
          <div
            style={{
              width: 40,
              height: 1.5,
              background: "#C89B3C",
              borderRadius: 1,
              opacity: 0.6,
            }}
          />
        </div>

        {/* Tap to enter — shown when no user activation on mount */}
        {tapNeeded && (
          <button
            type="button"
            onClick={handleCinematicTap}
            style={{
              marginTop: "2.75rem",
              background: "none",
              border: "1px solid rgba(245,240,232,0.22)",
              color: "rgba(245,240,232,0.75)",
              borderRadius: 999,
              padding: "0.625rem 1.875rem",
              fontSize: "0.9375rem",
              letterSpacing: "0.025em",
              cursor: "pointer",
              fontFamily: "var(--font-heebo, sans-serif)",
              animationName: "tapPulse",
              animationDuration: "2.4s",
              animationIterationCount: "infinite",
              animationTimingFunction: "ease-in-out",
            }}
          >
            {copy.tapToEnter}
          </button>
        )}
      </div>

      {/* ── Avatar area ──────────────────────────────────────────────────── */}

      {/* Anchor element: holds the same MediaStream as the AudioContext source node.
          Chrome requires a playing media element backed by the stream, otherwise
          createMediaStreamSource is silent.  The element is muted in JS so only
          the AudioContext produces audible output. */}
      <audio
        ref={audioRef}
        playsInline
        style={{
          position: "fixed",
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: "none",
        }}
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

        {/* Enable sound button */}
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

        {/* Speaking indicator — 3 pulsing bars */}
        {avatarSpeaking && showVideo && (
          <div
            style={{
              position: "absolute",
              bottom: 72,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 4,
              display: "flex",
              alignItems: "flex-end",
              gap: 4,
              height: 22,
              pointerEvents: "none",
            }}
          >
            {([0, 1, 2] as const).map((i) => (
              <div
                key={i}
                style={{
                  width: 4,
                  borderRadius: 2,
                  background: "rgba(255,255,255,0.90)",
                  transformOrigin: "bottom center",
                  animationName: "speakBar",
                  animationDuration: "0.65s",
                  animationTimingFunction: "ease-in-out",
                  animationIterationCount: "infinite",
                  animationDirection: "alternate",
                  animationDelay: `${i * 0.18}s`,
                  height: [10, 20, 13][i],
                }}
              />
            ))}
          </div>
        )}

        {/* Connection states */}

        {(state.phase === "checking" || state.phase === "connecting") && (
          <div style={{ color: "var(--qp-muted)", fontSize: "0.875rem" }}>
            {state.phase === "checking" ? copy.checking : copy.connecting}
          </div>
        )}

        {state.phase === "rate-limited" && (
          <div
            style={{
              color: "var(--qp-ink)",
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
            <div style={{ fontWeight: 600, fontSize: "1rem" }}>{copy.limitTitle}</div>
            <div style={{ color: "var(--qp-muted)", lineHeight: 1.6 }}>
              {copy.limitBody}{" "}
              <span style={{ color: "var(--qp-accent-text)", fontWeight: 600 }}>
                {state.nextAvailableAt
                  ? formatWait(state.nextAvailableAt) || copy.limitFallback
                  : copy.limitFallback}
              </span>
              .
            </div>
            <button
              type="button"
              onClick={() => router.push("/results")}
              style={quietButton}
            >
              {copy.backToResults}
            </button>
          </div>
        )}

        {state.phase === "buyer-only" && (
          <div
            style={{
              color: "var(--qp-ink)",
              textAlign: "center",
              padding: "2rem",
              maxWidth: "28rem",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.75rem",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: "1.05rem" }}>
              {copy.buyerOnlyTitle}
            </div>
            <div
              style={{
                color: "var(--qp-muted)",
                lineHeight: 1.6,
                fontSize: "0.9375rem",
              }}
            >
              {copy.buyerOnlyBody}
            </div>
            <button
              type="button"
              onClick={homeForRole}
              style={{ ...quietButton, marginTop: "0.5rem" }}
            >
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
              background: "var(--qp-surface)",
              border: "1px solid var(--qp-border)",
              color: "var(--qp-ink)",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: "0.35rem" }}>
              {copy.micDeniedTitle}
            </div>
            <div
              style={{
                color: "var(--qp-muted)",
                fontSize: "0.875rem",
                lineHeight: 1.7,
                marginBottom: "0.85rem",
              }}
            >
              {copy.micDeniedBody}
            </div>
            <button
              type="button"
              onClick={() => { void retryMicrophone(); }}
              style={quietButton}
            >
              {copy.tryAgain}
            </button>
          </div>
        )}

        {state.phase === "error" && (
          <div
            style={{
              color: "var(--qp-error)",
              fontSize: "0.875rem",
              textAlign: "center",
              padding: "1rem",
              maxWidth: "28rem",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
              {copy.connectionError}
            </div>
            <div style={{ color: "var(--qp-muted)", marginBottom: "1rem" }}>
              {copy.connectionErrorBody}
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={quietButton}
            >
              {copy.tryAgain}
            </button>
          </div>
        )}

        {state.phase === "ending" && (
          <div style={{ color: "var(--qp-muted)", fontSize: "0.875rem" }}>
            {copy.saving}
          </div>
        )}

        {state.phase === "live" && (
          <button
            type="button"
            onClick={() => { void endConversation(); }}
            style={{
              position: "absolute",
              bottom: 16,
              right: 20,
              zIndex: 5,
              background: "none",
              border: "none",
              color: "rgba(245,240,232,0.38)",
              fontSize: "0.8125rem",
              fontWeight: 400,
              letterSpacing: "0.01em",
              cursor: "pointer",
              padding: "0.5rem 0.625rem",
              lineHeight: 1,
            }}
          >
            {copy.endLink}
          </button>
        )}
      </div>
    </main>
  );
}
