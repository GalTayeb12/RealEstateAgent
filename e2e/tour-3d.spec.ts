/**
 * 3D Tour smoke test — baseline screenshots at 1440 (desktop) and 375 (mobile).
 * Run before and after the visual improvements to compare.
 *
 * Measured metrics:
 *   - FPS via rAF counter (3 s window)
 *   - Load time (navigationStart → DOMContentLoaded)
 *   - Console errors/warnings
 *   - Screenshots of: initial view, room label overlay, room chip click, walk mode
 */

import { test, expect, Page } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

const TOUR_URL = "/tour/sample";
const SCREENSHOT_DIR = path.join(process.cwd(), "screenshots");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Measure FPS by counting rAF ticks for `durationMs` milliseconds. */
async function measureFPS(page: Page, durationMs = 3000): Promise<number> {
  return page.evaluate((ms) => {
    return new Promise<number>((resolve) => {
      let frames = 0;
      const start = performance.now();
      function tick() {
        frames++;
        if (performance.now() - start < ms) {
          requestAnimationFrame(tick);
        } else {
          resolve(Math.round((frames / ms) * 1000));
        }
      }
      requestAnimationFrame(tick);
    });
  }, durationMs);
}

/** Returns load time in ms (navigation start → load event). */
async function measureLoadTime(page: Page): Promise<number> {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    return nav ? Math.round(nav.loadEventEnd - nav.startTime) : -1;
  });
}

for (const viewport of [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "mobile-375",   width: 375,  height: 812 },
]) {
  test(`tour 3D — ${viewport.name}`, async ({ page }) => {
    ensureDir(SCREENSHOT_DIR);

    // Collect console messages
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") {
        consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
      }
    });

    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    const t0 = Date.now();
    await page.goto(TOUR_URL, { waitUntil: "networkidle" });

    // Wait for the Canvas element to appear (tour has loaded)
    await page.waitForSelector("canvas", { timeout: 20_000 });

    // Extra settle time for 3D scene to draw first frame
    await page.waitForTimeout(1500);

    const loadMs = Date.now() - t0;

    // ── Screenshot 1: initial orbit view ─────────────────────────────────────
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `${viewport.name}-01-initial.png`),
      fullPage: false,
    });

    // ── Screenshot 2: click first room chip ──────────────────────────────────
    const chips = page.locator("button").filter({ hasText: /סלון|מטבח|חדר/ });
    if (await chips.count() > 0) {
      await chips.first().click();
      await page.waitForTimeout(800);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${viewport.name}-02-room-chip.png`),
      });
    }

    // ── Screenshot 3: walk mode ───────────────────────────────────────────────
    const walkBtn = page.locator("button").filter({ hasText: /הליכה|walk/i });
    if (await walkBtn.count() > 0) {
      await walkBtn.first().click();
      await page.waitForTimeout(800);
      // Move forward a bit (W key)
      await page.keyboard.down("ArrowUp");
      await page.waitForTimeout(400);
      await page.keyboard.up("ArrowUp");
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${viewport.name}-03-walk.png`),
      });
    }

    // ── Measure FPS ───────────────────────────────────────────────────────────
    // Go back to orbit for the measurement
    const orbitBtn = page.locator("button").filter({ hasText: /מבט|orbit/i });
    if (await orbitBtn.count() > 0) await orbitBtn.first().click();
    await page.waitForTimeout(300);

    const fps = await measureFPS(page, 3000);
    const loadTime = await measureLoadTime(page);

    // Write metrics to a JSON file so we can diff before/after
    const metricsFile = path.join(SCREENSHOT_DIR, `${viewport.name}-metrics.json`);
    let metrics: Record<string, unknown[]> = {};
    if (fs.existsSync(metricsFile)) {
      metrics = JSON.parse(fs.readFileSync(metricsFile, "utf8"));
    }
    if (!metrics.runs) metrics.runs = [];
    (metrics.runs as unknown[]).push({
      timestamp: new Date().toISOString(),
      loadMs,
      loadTime,
      fps,
      consoleErrors: consoleErrors.slice(0, 20),
    });
    fs.writeFileSync(metricsFile, JSON.stringify(metrics, null, 2));

    console.log(`[${viewport.name}] FPS: ${fps}  load: ${loadMs}ms  errors: ${consoleErrors.length}`);

    // Soft assertions — test shouldn't fail just because FPS is low
    expect(fps).toBeGreaterThan(0);
    expect(consoleErrors.filter((e) => e.includes("TypeError") || e.includes("ReferenceError"))).toHaveLength(0);
  });
}
