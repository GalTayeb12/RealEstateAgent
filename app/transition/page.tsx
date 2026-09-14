"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/* ── Synthesised power-down sound (Web Audio API, no external file) ────────
 *
 *  Layer 1 — noise burst / discharge click (0–120 ms)
 *  Layer 2 — sawtooth hum descending 200 Hz → 5 Hz over 1.3 s (CRT deflection coil)
 *  Layer 3 — low-pass filtered noise trail fading out (ambient hiss)
 */
function playPowerDown() {
  try {
    const ctx = new (
      window.AudioContext ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitAudioContext
    )();

    const now = ctx.currentTime;

    // — Layer 1: initial discharge click —
    const clickFrames = Math.floor(ctx.sampleRate * 0.12);
    const clickBuf = ctx.createBuffer(1, clickFrames, ctx.sampleRate);
    const cd = clickBuf.getChannelData(0);
    for (let i = 0; i < clickFrames; i++) {
      cd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.012));
    }
    const click = ctx.createBufferSource();
    click.buffer = clickBuf;
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.25, now);
    click.connect(clickGain).connect(ctx.destination);
    click.start(now);

    // — Layer 2: descending sawtooth hum —
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(5, now + 1.3);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.0, now);
    oscGain.gain.linearRampToValueAtTime(0.15, now + 0.05); // fast attack
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 1.35);

    osc.connect(oscGain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 1.4);

    // — Layer 3: hiss trail (filtered noise) —
    const hissFrames = Math.floor(ctx.sampleRate * 1.5);
    const hissBuf = ctx.createBuffer(1, hissFrames, ctx.sampleRate);
    const hd = hissBuf.getChannelData(0);
    for (let i = 0; i < hissFrames; i++) hd[i] = Math.random() * 2 - 1;

    const hiss = ctx.createBufferSource();
    hiss.buffer = hissBuf;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(3000, now);
    filter.frequency.exponentialRampToValueAtTime(80, now + 1.4);

    const hissGain = ctx.createGain();
    hissGain.gain.setValueAtTime(0.06, now);
    hissGain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);

    hiss.connect(filter).connect(hissGain).connect(ctx.destination);
    hiss.start(now);
  } catch {
    // AudioContext unavailable — silent fallback
  }
}

/*
 * Total animation duration:
 *   flicker  0.55 s  (CSS power-off-flicker)
 *   collapse 1.10 s  (CSS power-off-collapse, starts at 0.55 s)
 *   Total:   ~1.65 s
 *
 * We navigate after 1.80 s to give a comfortable tail of black.
 */
const NAVIGATE_AFTER_MS = 1800;

export default function TransitionPage() {
  const router = useRouter();

  useEffect(() => {
    playPowerDown();
    const t = setTimeout(() => router.push("/interview"), NAVIGATE_AFTER_MS);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <>
      {/* Flicker overlay — paper coloured, animates opacity to simulate flicker */}
      <div className="power-off-overlay" aria-hidden="true">
        {/* Collapse layer — dark bar that crushes to a horizontal line */}
        <div className="power-off-collapse" aria-hidden="true" />
      </div>

      {/* Black ground beneath — visible between flicker frames and after collapse */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "#000",
          zIndex: 9998,
        }}
        aria-hidden="true"
      />
    </>
  );
}
