/**
 * e2e: "חזרה לבניין" back-button in apartment tour
 *
 * Tests that navigating from BuildingExplorer → Tour → back:
 *   1. The back button on the tour page returns to the building page
 *   2. The browser Back button also works
 *   3. The previously selected floor + unit are restored
 *
 * Seed data used:
 *   aom page id  : seed-yarkon-3
 *   building id  : seed-yarkon-a
 *   unit id      : seed-yarkon-a-f2-p0  (floor 2, unit 21)
 */

import { test, expect } from "@playwright/test";

const AOM_ID      = "seed-yarkon-3";
const BUILDING_ID = "seed-yarkon-a";
const FLOOR       = 2;
const UNIT_ID     = "seed-yarkon-a-f2-p0";

/** URL of the aom page with floor + unit already selected */
const AOM_WITH_SELECTION = `/aom/${AOM_ID}?building=${BUILDING_ID}&floor=${FLOOR}&unit=${UNIT_ID}`;
/** URL of the tour page for that unit */
const TOUR_URL = `/tour/${UNIT_ID}`;

test.describe("Building back-button", () => {

  test("back button on tour page returns to building with selection restored", async ({ page }) => {
    // ── 1. Land directly on the tour page (simulates having come from the building) ──
    await page.goto(TOUR_URL, { waitUntil: "domcontentloaded" });

    // Wait until the layout has loaded enough to show the back button.
    // The button appears once TourLayout fetches /api/buildings/unit/:id and sets backUrl.
    const backBtn = page.locator("button", { hasText: /חזרה לבניין|Back to building/i });
    await backBtn.waitFor({ timeout: 15_000 });

    // ── 2. Click the back button ──
    await backBtn.click();

    // ── 3. Should navigate to /aom/seed-yarkon-3 with all three params ──
    await page.waitForURL((url) =>
      url.pathname === `/aom/${AOM_ID}` &&
      url.searchParams.get("building") === BUILDING_ID &&
      url.searchParams.get("floor")    === String(FLOOR) &&
      url.searchParams.get("unit")     === UNIT_ID,
      { timeout: 10_000 }
    );

    // ── 4. BuildingExplorer should restore the UnitCard (shows unit number) ──
    // The UnitCard renders the apartment number; give it time to fetch unit data
    await expect(page.locator(".hn-floor-panel")).toBeVisible({ timeout: 10_000 });
  });

  test("browser Back from tour returns to building with selection restored", async ({ page }) => {
    // ── 1. Start at the aom page with a floor+unit selected ──
    await page.goto(AOM_WITH_SELECTION, { waitUntil: "domcontentloaded" });

    // Wait for the UnitCard to appear (proves selection was restored from URL)
    await expect(page.locator(".hn-floor-panel")).toBeVisible({ timeout: 15_000 });

    // ── 2. Navigate to the tour page (as if user clicked "Enter Tour") ──
    await page.goto(TOUR_URL, { waitUntil: "domcontentloaded" });
    await page.locator("button", { hasText: /חזרה לבניין|Back to building/i })
      .waitFor({ timeout: 15_000 });

    // ── 3. Browser Back ──
    await page.goBack();

    // ── 4. Should land back at aom with selection params ──
    await page.waitForURL((url) =>
      url.pathname === `/aom/${AOM_ID}`,
      { timeout: 10_000 }
    );

    // ── 5. Building panel should be visible (floor panel or unit card) ──
    await expect(page.locator(".hn-floor-panel")).toBeVisible({ timeout: 10_000 });
  });

  test("back button URL includes building + floor + unit params", async ({ page }) => {
    // Visit the tour page and inspect what URL the back button would navigate to.
    // We do this by intercepting the router.push call via URL inspection after click.
    await page.goto(TOUR_URL, { waitUntil: "domcontentloaded" });

    const backBtn = page.locator("button", { hasText: /חזרה לבניין|Back to building/i });
    await backBtn.waitFor({ timeout: 15_000 });

    // Capture the navigation that happens on click
    const [nav] = await Promise.all([
      page.waitForURL((url) => url.pathname.startsWith("/aom/"), { timeout: 10_000 }),
      backBtn.click(),
    ]);

    const finalUrl = new URL(page.url());
    expect(finalUrl.searchParams.get("building")).toBeTruthy();
    expect(finalUrl.searchParams.get("floor")).toBeTruthy();
    expect(finalUrl.searchParams.get("unit")).toBe(UNIT_ID);
  });
});
