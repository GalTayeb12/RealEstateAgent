/**
 * Screenshot script r2 — HAVENIQ Building Explorer
 * Uses WebGL/GPU flags (swiftshader) and 5s wait for 3D init.
 * Outputs: r2_desktop_building.png, r2_desktop_floor.png, r2_desktop_unit.png,
 *          r2_mobile_building.png, r2_mobile_floor.png
 */
import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'output');

const BASE_URL = 'http://localhost:3000/aom/seed-yarkon-3';
const BUILDING_ID = 'seed-yarkon-a';
const FLOOR = 5;
const UNIT_ID = 'seed-yarkon-a-f5-p0';

const DESKTOP_W = 1440;
const DESKTOP_H = 900;
const MOBILE_W = 390;
const MOBILE_H = 844;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function takeShot(page, filename, waitMs = 5000) {
  // Wait for the page to settle
  try {
    await page.waitForSelector('.hn-building-stage', { timeout: 20000 });
  } catch {
    console.log('  (hn-building-stage not found, continuing)');
  }
  await sleep(waitMs);

  // Detect rendering mode
  const mode = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return 'no-canvas';
    try {
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const renderer = gl.getParameter(gl.RENDERER) || '';
        return 'webgl:' + renderer;
      }
    } catch {}
    return '2d-fallback';
  });
  console.log(`  Render mode: ${mode}`);

  const out = path.join(OUTPUT_DIR, filename);
  await page.screenshot({ path: out, fullPage: false });
  console.log(`  Saved: ${filename}`);
  return mode;
}

async function run() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--enable-webgl',
      '--enable-gpu',
      '--use-gl=swiftshader',
      '--disable-software-rasterizer',
      '--ignore-gpu-blacklist',
      '--enable-accelerated-2d-canvas',
    ],
  });

  const results = [];

  try {
    const floorUrl = `${BASE_URL}?building=${BUILDING_ID}&floor=${FLOOR}`;
    const unitUrl  = `${BASE_URL}?building=${BUILDING_ID}&floor=${FLOOR}&unit=${UNIT_ID}`;

    // ─── DESKTOP ──────────────────────────────────────────────────────────────
    const desktopPage = await browser.newPage();
    await desktopPage.setViewport({ width: DESKTOP_W, height: DESKTOP_H });

    // 1. Desktop building view
    console.log('1. Desktop building (1440×900)...');
    await desktopPage.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    const m1 = await takeShot(desktopPage, 'r2_desktop_building.png', 5000);
    results.push({ name: 'r2_desktop_building.png', mode: m1 });

    // 2. Desktop floor view
    console.log('2. Desktop floor (1440×900)...');
    await desktopPage.goto(floorUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    const m2 = await takeShot(desktopPage, 'r2_desktop_floor.png', 5000);
    results.push({ name: 'r2_desktop_floor.png', mode: m2 });

    // 3. Desktop unit view
    console.log('3. Desktop unit (1440×900)...');
    await desktopPage.goto(unitUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    const m3 = await takeShot(desktopPage, 'r2_desktop_unit.png', 5000);
    results.push({ name: 'r2_desktop_unit.png', mode: m3 });

    await desktopPage.close();

    // ─── MOBILE ───────────────────────────────────────────────────────────────
    const mobilePage = await browser.newPage();
    await mobilePage.setViewport({ width: MOBILE_W, height: MOBILE_H, isMobile: true, hasTouch: true });

    // 4. Mobile building view
    console.log('4. Mobile building (390×844)...');
    await mobilePage.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    const m4 = await takeShot(mobilePage, 'r2_mobile_building.png', 5000);
    results.push({ name: 'r2_mobile_building.png', mode: m4 });

    // 5. Mobile floor view
    console.log('5. Mobile floor (390×844)...');
    await mobilePage.goto(floorUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    const m5 = await takeShot(mobilePage, 'r2_mobile_floor.png', 5000);
    results.push({ name: 'r2_mobile_floor.png', mode: m5 });

    await mobilePage.close();

  } catch (err) {
    console.error('ERROR:', err.message);
    console.error(err.stack);
    results.push({ name: 'ERROR', mode: 'n/a', error: err.message });
  } finally {
    await browser.close();
  }

  console.log('\n=== Results ===');
  for (const r of results) {
    const err = r.error ? ` — ERROR: ${r.error}` : '';
    console.log(`${r.name}  [${r.mode}]${err}`);
  }
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
