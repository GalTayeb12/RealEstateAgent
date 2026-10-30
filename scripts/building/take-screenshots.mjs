/**
 * Screenshot script for HAVENIQ Building Explorer
 * Captures the yarkon-towers building explorer at /aom/seed-yarkon-3
 *
 * The requested URL /aom/seed-yarkon-towers does not load because
 * seed-yarkon-towers is the project ID, not a unitType ID.
 * The correct unit-type IDs are seed-yarkon-3 and seed-yarkon-4.
 * We use seed-yarkon-3 (3-room units) which has the full building data.
 */
import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'output');

// The working URL for the yarkon towers building explorer
const BASE_URL = 'http://localhost:3000/aom/seed-yarkon-3';
const BUILDING_ID = 'seed-yarkon-a';
const FLOOR = 5;
// First unit on floor 5
const UNIT_ID = 'seed-yarkon-a-f5-p0';

const DESKTOP_W = 1440;
const DESKTOP_H = 900;
const MOBILE_W = 390;
const MOBILE_H = 844;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitForPageReady(page, extraMs = 3000) {
  // Wait for the building stage
  try {
    await page.waitForSelector('.hn-building-stage', { timeout: 20000 });
  } catch {
    // Stage may not appear if no WebGL; wait a bit anyway
    console.log('  (hn-building-stage not found, continuing)');
  }
  // Wait for 3D animations to settle
  await sleep(extraMs);
}

async function clickFirstUnitInPanel(page) {
  // Try multiple selector strategies for the unit rows in the floor panel
  const selectors = [
    '.hn-floor-panel div[style*="overflow"] > div:first-child',
    '.hn-floor-panel div[style*="flex: 1"] > div:first-child',
    '.hn-floor-panel div[style*="flex:1"] > div:first-child',
  ];

  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        await el.click();
        await sleep(1500);
        return true;
      }
    } catch { /* try next */ }
  }

  // Fallback: use evaluate to find unit rows (div children of the scrollable area)
  const clicked = await page.evaluate(() => {
    const panel = document.querySelector('.hn-floor-panel');
    if (!panel) return false;
    // The unit list is the flex:1 overflowY:auto div
    const allDivs = Array.from(panel.querySelectorAll('div'));
    const scrollDiv = allDivs.find(d => {
      const cs = window.getComputedStyle(d);
      return cs.overflowY === 'auto' || cs.overflowY === 'scroll';
    });
    if (!scrollDiv) {
      // Try clicking first cursor:pointer child
      const clickable = panel.querySelector('div[style*="cursor: pointer"], div[style*="cursor:pointer"]');
      if (clickable) { clickable.click(); return true; }
      return false;
    }
    const firstUnit = scrollDiv.firstElementChild;
    if (firstUnit) { firstUnit.click(); return true; }
    return false;
  });

  if (clicked) await sleep(1500);
  return clicked;
}

async function run() {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--enable-webgl',
      '--use-gl=swiftshader',
      '--ignore-gpu-blacklist',
      '--disable-software-rasterizer',
    ],
  });

  const results = [];

  try {
    // ─── DESKTOP SCREENSHOTS ──────────────────────────────────────────────────
    console.log('Opening desktop page...');
    const desktopPage = await browser.newPage();
    await desktopPage.setViewport({ width: DESKTOP_W, height: DESKTOP_H });

    // ── 1. Desktop building view ──────────────────────────────────────────────
    console.log('1. Desktop building view (1440×900)...');
    await desktopPage.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await waitForPageReady(desktopPage, 3000);

    const out1 = path.join(OUTPUT_DIR, 'r1_desktop_building.png');
    await desktopPage.screenshot({ path: out1, fullPage: false });
    console.log(`   Saved: r1_desktop_building.png`);
    results.push({ name: 'r1_desktop_building.png', ok: true });

    // ── 2. Desktop floor view ─────────────────────────────────────────────────
    console.log('2. Desktop floor view (floor 5)...');
    const floorUrl = `${BASE_URL}?building=${BUILDING_ID}&floor=${FLOOR}`;
    await desktopPage.goto(floorUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await waitForPageReady(desktopPage, 3000);

    // Confirm floor panel appeared
    const floorPanel = await desktopPage.$('.hn-floor-panel');
    console.log(`   Floor panel present: ${!!floorPanel}`);

    const out2 = path.join(OUTPUT_DIR, 'r1_desktop_floor.png');
    await desktopPage.screenshot({ path: out2, fullPage: false });
    console.log(`   Saved: r1_desktop_floor.png`);
    results.push({ name: 'r1_desktop_floor.png', ok: true, note: floorPanel ? 'floor panel shown' : 'floor panel not visible' });

    // ── 3. Desktop unit view ──────────────────────────────────────────────────
    console.log('3. Desktop unit view (first unit on floor 5)...');

    // Try clicking first unit in the floor panel
    let unitOpened = await clickFirstUnitInPanel(desktopPage);
    console.log(`   Clicked first unit in panel: ${unitOpened}`);

    if (!unitOpened) {
      // Navigate directly via URL with unit param
      console.log('   Falling back to direct unit URL navigation...');
      const unitUrl = `${BASE_URL}?building=${BUILDING_ID}&floor=${FLOOR}&unit=${UNIT_ID}`;
      await desktopPage.goto(unitUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await waitForPageReady(desktopPage, 3000);
      unitOpened = true;
    }

    const out3 = path.join(OUTPUT_DIR, 'r1_desktop_unit.png');
    await desktopPage.screenshot({ path: out3, fullPage: false });
    console.log(`   Saved: r1_desktop_unit.png`);
    results.push({ name: 'r1_desktop_unit.png', ok: true });

    await desktopPage.close();

    // ─── MOBILE SCREENSHOTS ───────────────────────────────────────────────────
    console.log('Opening mobile page...');
    const mobilePage = await browser.newPage();
    await mobilePage.setViewport({ width: MOBILE_W, height: MOBILE_H, isMobile: true, hasTouch: true });

    // ── 4. Mobile building view ───────────────────────────────────────────────
    console.log('4. Mobile building view (390×844)...');
    await mobilePage.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await waitForPageReady(mobilePage, 3000);

    const out4 = path.join(OUTPUT_DIR, 'r1_mobile_building.png');
    await mobilePage.screenshot({ path: out4, fullPage: false });
    console.log(`   Saved: r1_mobile_building.png`);
    results.push({ name: 'r1_mobile_building.png', ok: true });

    // ── 5. Mobile floor view ──────────────────────────────────────────────────
    console.log('5. Mobile floor view (floor 5)...');
    await mobilePage.goto(floorUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await waitForPageReady(mobilePage, 3000);

    const mobileFloorPanel = await mobilePage.$('.hn-floor-panel');
    console.log(`   Mobile floor panel present: ${!!mobileFloorPanel}`);

    const out5 = path.join(OUTPUT_DIR, 'r1_mobile_floor.png');
    await mobilePage.screenshot({ path: out5, fullPage: false });
    console.log(`   Saved: r1_mobile_floor.png`);
    results.push({ name: 'r1_mobile_floor.png', ok: true, note: mobileFloorPanel ? 'floor panel shown' : 'floor panel not visible' });

    await mobilePage.close();

  } catch (err) {
    console.error('ERROR:', err.message);
    console.error(err.stack);
    results.push({ name: 'ERROR', ok: false, error: err.message });
  } finally {
    await browser.close();
  }

  console.log('\n=== Results ===');
  for (const r of results) {
    const status = r.ok ? 'OK  ' : 'FAIL';
    const note = r.note ? ` — ${r.note}` : '';
    const err = r.error ? ` — ERROR: ${r.error}` : '';
    console.log(`${status} ${r.name}${note}${err}`);
  }
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
