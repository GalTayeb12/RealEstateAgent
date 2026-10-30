/**
 * Screenshot script r3 — HAVENIQ Building Explorer
 * Uses SwiftShader flags, expects 2D fallback.
 * Outputs: r3_desktop_building.png, r3_desktop_unit.png,
 *          r3_desktop_floor.png, r3_mobile_unit.png
 */
import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
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

async function getRenderMode(page) {
  return page.evaluate(() => {
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
}

async function takeShot(page, filename, waitMs) {
  try {
    await page.waitForSelector('.hn-building-stage', { timeout: 20000 });
  } catch {
    console.log('  (hn-building-stage not found, continuing)');
  }
  await sleep(waitMs);

  const mode = await getRenderMode(page);
  console.log(`  Render mode: ${mode}`);

  const out = path.join(OUTPUT_DIR, filename);
  await page.screenshot({ path: out, fullPage: false });

  const stat = fs.statSync(out);
  console.log(`  Saved: ${filename}  (${(stat.size / 1024).toFixed(1)} KB)`);
  return { mode, sizeKB: (stat.size / 1024).toFixed(1) };
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

    // ─── DESKTOP PAGE ─────────────────────────────────────────────────────────
    const desktopPage = await browser.newPage();
    await desktopPage.setViewport({ width: DESKTOP_W, height: DESKTOP_H });

    // 1. r3_desktop_building — base URL, wait 4s
    console.log('1. r3_desktop_building (1440×900)...');
    await desktopPage.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    const r1 = await takeShot(desktopPage, 'r3_desktop_building.png', 4000);
    results.push({ name: 'r3_desktop_building.png', ...r1 });

    // 2. r3_desktop_unit — unit params, wait 4s
    console.log('2. r3_desktop_unit (1440×900)...');
    await desktopPage.goto(unitUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    const r2 = await takeShot(desktopPage, 'r3_desktop_unit.png', 4000);
    results.push({ name: 'r3_desktop_unit.png', ...r2 });

    // 3. r3_desktop_floor — floor params, wait 3s
    console.log('3. r3_desktop_floor (1440×900)...');
    await desktopPage.goto(floorUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    const r3 = await takeShot(desktopPage, 'r3_desktop_floor.png', 3000);
    results.push({ name: 'r3_desktop_floor.png', ...r3 });

    await desktopPage.close();

    // ─── MOBILE PAGE ──────────────────────────────────────────────────────────
    const mobilePage = await browser.newPage();
    await mobilePage.setViewport({ width: MOBILE_W, height: MOBILE_H, isMobile: true, hasTouch: true });

    // 4. r3_mobile_unit — unit params on mobile, wait 4s
    console.log('4. r3_mobile_unit (390×844)...');
    await mobilePage.goto(unitUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    const r4 = await takeShot(mobilePage, 'r3_mobile_unit.png', 4000);
    results.push({ name: 'r3_mobile_unit.png', ...r4 });

    await mobilePage.close();

  } catch (err) {
    console.error('ERROR:', err.message);
    console.error(err.stack);
    results.push({ name: 'ERROR', mode: 'n/a', sizeKB: 0, error: err.message });
  } finally {
    await browser.close();
  }

  console.log('\n=== Results ===');
  for (const r of results) {
    const err = r.error ? `  — ERROR: ${r.error}` : '';
    console.log(`${r.name}  [${r.mode}]  ${r.sizeKB} KB${err}`);
  }
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
