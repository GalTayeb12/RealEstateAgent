"use client";
/**
 * AudioUnlockProvider — lives in app/layout.tsx, survives client-side navigation.
 *
 * Holds a single AudioContext for the whole app. Any page that leads to the
 * interview calls unlock() in its click handler (synchronously, while the
 * user-gesture token is still active). By the time the interview page mounts,
 * the context is in "running" state and avatar audio routes through it without
 * hitting the browser's autoplay policy.
 */
import {
  createContext,
  useContext,
  useRef,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";

interface AudioUnlockCtx {
  /** Returns the shared AudioContext, or null if not yet created. */
  getCtx: () => AudioContext | null;
  /**
   * Creates (if needed) and resumes the AudioContext.
   * Safe to call multiple times — idempotent once running.
   * Must be called in or close to a user-gesture handler for Safari compat.
   */
  unlock: () => Promise<void>;
}

const AudioUnlockContext = createContext<AudioUnlockCtx>({
  getCtx: () => null,
  unlock: async () => {},
});

export function AudioUnlockProvider({ children }: { children: ReactNode }) {
  const ctxRef = useRef<AudioContext | null>(null);

  /** Create the context on first call or after it was closed. */
  function ensureCtx(): AudioContext {
    if (!ctxRef.current || ctxRef.current.state === "closed") {
      ctxRef.current = new AudioContext();
      console.log("[AudioUnlock] created AudioContext, state:", ctxRef.current.state);
    }
    return ctxRef.current;
  }

  const unlock = useCallback(async () => {
    const ctx = ensureCtx();
    console.log("[AudioUnlock] unlock() — state before:", ctx.state);
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    if (ctx.state === "running") {
      // Play a 1-frame silent buffer — satisfies autoplay requirements in all browsers
      const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
    }
    console.log("[AudioUnlock] state after:", ctx.state);
  // ensureCtx closes over ctxRef (a ref, stable); no dep needed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getCtx = useCallback(() => ctxRef.current, []);

  const value = useMemo(() => ({ getCtx, unlock }), [getCtx, unlock]);

  return (
    <AudioUnlockContext.Provider value={value}>
      {children}
    </AudioUnlockContext.Provider>
  );
}

export function useAudioUnlock() {
  return useContext(AudioUnlockContext);
}
