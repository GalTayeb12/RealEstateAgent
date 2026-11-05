/**
 * e2e/audio-rms.spec.ts
 *
 * Verifies that the avatar's audio actually flows through the Web Audio pipeline:
 *   1. Login as a buyer → interview page opens (cinematic).
 *   2. Wait for LiveKit to connect and the audio track to be routed.
 *   3. Capture "[LiveAvatar audio] RMS:" console lines.
 *   4. Assert at least one RMS value > 0.000 (non-silent).
 *
 * Requires:
 *   E2E_BUYER_EMAIL    — buyer account e-mail
 *   E2E_BUYER_PASSWORD — buyer account password
 *
 * Run:
 *   E2E_BUYER_EMAIL=... E2E_BUYER_PASSWORD=... npx playwright test e2e/audio-rms.spec.ts
 */
import { test, expect, type ConsoleMessage } from "@playwright/test";

const EMAIL    = process.env.E2E_BUYER_EMAIL    ?? "";
const PASSWORD = process.env.E2E_BUYER_PASSWORD ?? "";

test.beforeAll(() => {
  if (!EMAIL || !PASSWORD) {
    throw new Error(
      "Set E2E_BUYER_EMAIL and E2E_BUYER_PASSWORD before running this test."
    );
  }
});

test("avatar audio RMS > 0 within 60 s of connecting", async ({ page }) => {
  // ── Collect console messages ──────────────────────────────────────────────
  const rmsValues: number[] = [];
  const audioLogs: string[] = [];

  page.on("console", (msg: ConsoleMessage) => {
    const text = msg.text();
    if (text.startsWith("[LiveAvatar audio]") || text.startsWith("[AudioUnlock]") || text.startsWith("[interview]")) {
      audioLogs.push(text);
      console.log("  [page]", text);
    }
    const rmsMatch = text.match(/\[LiveAvatar audio\] RMS: (\d+\.\d+)/);
    if (rmsMatch) {
      rmsValues.push(parseFloat(rmsMatch[1]));
    }
  });

  // ── Login ─────────────────────────────────────────────────────────────────
  await page.goto("/login");
  // Use type selectors — independent of Hebrew/English label text
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();

  // Should land on /interview (buyer) or be redirected there
  await page.waitForURL(/\/interview/, { timeout: 15_000 });

  // ── Wait for AudioContext to be running ───────────────────────────────────
  await expect.poll(
    () => audioLogs.some(l => l.includes("ctx.state: running")),
    { timeout: 20_000, message: "AudioContext never reached running state" }
  ).toBe(true);

  // ── Wait for track routed through AudioContext ────────────────────────────
  await expect.poll(
    () => audioLogs.some(l => l.includes("✓ routed through AudioContext")),
    { timeout: 30_000, message: "Audio track was never routed through AudioContext" }
  ).toBe(true);

  // ── Wait for anchor element to be playing ─────────────────────────────────
  await expect.poll(
    () => audioLogs.some(l => l.includes("anchor el: muted: true paused: false")),
    { timeout: 10_000, message: "Anchor audio element never started playing" }
  ).toBe(true);

  // ── Wait for non-silent RMS (avatar starts speaking within 60 s) ──────────
  // The avatar may take some seconds to send the first utterance.
  await expect.poll(
    () => rmsValues.some(v => v > 0.0001),
    { timeout: 60_000, intervals: [1000], message: "RMS never exceeded 0.0001 — audio stream is silent" }
  ).toBe(true);

  const maxRms = Math.max(...rmsValues);
  console.log(`\n✓ Max RMS observed: ${maxRms.toFixed(5)}`);
  console.log(`  Total RMS samples: ${rmsValues.length}`);
  console.log("  Audio logs:\n   ", audioLogs.join("\n    "));

  expect(maxRms).toBeGreaterThan(0.0001);
});
