/**
 * Three-frame proof of the power-off transition:
 *   A — login page
 *   B — /transition t=0  (paper colour, animations frozen)
 *   B2— /transition ~650 ms in (collapse bar mid-animation, live)
 *   C — /interview black screen placeholder
 */
import puppeteer from "puppeteer";
import { writeFileSync } from "fs";

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });

// ── A: login ──────────────────────────────────────────────────────────────
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle2" });
  await page.waitForSelector('input[type="email"]', { timeout: 8000 });
  writeFileSync("C:/RealEstateAgent/public/ss-A-login.png", await page.screenshot());
  console.log("A: login saved");
  await page.close();
}

// ── B: transition t=0 (animations frozen at paper colour) ────────────────
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto("http://localhost:3000/transition", { waitUntil: "domcontentloaded" });
  await page.addStyleTag({
    content: "*, *::before, *::after { animation-play-state: paused !important; animation-fill-mode: none !important; }"
  });
  await new Promise(r => setTimeout(r, 100));
  writeFileSync("C:/RealEstateAgent/public/ss-B-transition-t0.png", await page.screenshot());
  console.log("B: transition t=0 saved");
  await page.close();
}

// ── B2: transition ~680 ms in (live, mid-collapse) ────────────────────────
// This shows the CRT crush line — the most visually distinctive frame
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto("http://localhost:3000/transition", { waitUntil: "domcontentloaded" });
  // Let the animation run freely for ~680 ms:
  // 0–550 ms = flicker, 550–1650 ms = collapse → at 680 ms collapse is ~12% in
  await new Promise(r => setTimeout(r, 680));
  writeFileSync("C:/RealEstateAgent/public/ss-B2-transition-collapse.png", await page.screenshot());
  console.log("B2: mid-collapse saved");
  await page.close();
}

// ── C: /interview placeholder ─────────────────────────────────────────────
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto("http://localhost:3000/interview", { waitUntil: "networkidle2" });
  writeFileSync("C:/RealEstateAgent/public/ss-C-interview.png", await page.screenshot());
  console.log("C: interview placeholder saved");
  await page.close();
}

await browser.close();
