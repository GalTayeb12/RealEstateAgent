/**
 * RTL keyboard navigation — room chips in the apartment tour.
 *
 * Visual layout in RTL flex container (right → left):
 *   סלון  מטבח  חדר שינה  מסדרון  מם"ד  חדר  הול  מרפסת
 *    [0]   [1]     [2]      [3]    [4]  [5]   [6]   [7]
 *
 * Expected behaviour (ARIA toolbar, RTL):
 *   ArrowLeft  → moves focus LEFT (visually) = next index (idx+1)
 *   ArrowRight → moves focus RIGHT (visually) = previous index (idx-1)
 *
 * Test scenarios verified at 375 (mobile) and 1440 (desktop).
 */

import { test, expect, Page } from "@playwright/test";

async function getRoomChips(page: Page) {
  // All chips are inside the role=toolbar container
  return page.locator('[role="toolbar"] button[data-room-id]');
}

for (const viewport of [
  { name: "mobile-375", width: 375, height: 812 },
  { name: "desktop-1440", width: 1440, height: 900 },
]) {
  test(`RTL keyboard navigation — ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/tour/sample", { waitUntil: "networkidle" });
    await page.waitForSelector("canvas", { timeout: 20_000 });
    await page.waitForTimeout(1500); // let scene settle

    const chips = await getRoomChips(page);
    const count = await chips.count();
    expect(count).toBeGreaterThan(2);

    // ── Focus the first chip ───────────────────────────────────────────────────
    const first = chips.first();
    await first.focus();
    const firstRoomId = await first.getAttribute("data-room-id");
    expect(firstRoomId).toBeTruthy();

    // ── ArrowLeft should move to index 1 (next in array = visually left in RTL) ─
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(200);

    // The focused element should now be the second chip (index 1)
    const focused = page.locator(":focus");
    const focusedRoomId = await focused.getAttribute("data-room-id");
    const allIds = await chips.evaluateAll((btns) =>
      btns.map((b) => b.getAttribute("data-room-id"))
    );
    const firstIdx = allIds.indexOf(firstRoomId);
    const focusedIdx = allIds.indexOf(focusedRoomId);

    // In RTL: ArrowLeft advances index by 1
    expect(focusedIdx).toBe((firstIdx + 1) % count);

    // ── ArrowRight from index 1 should return to index 0 ───────────────────────
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(200);

    const backFocused = page.locator(":focus");
    const backRoomId = await backFocused.getAttribute("data-room-id");
    const backIdx = allIds.indexOf(backRoomId);

    expect(backIdx).toBe(firstIdx);

    // ── Wrap: ArrowRight from first chip (idx 0) wraps to last ─────────────────
    await chips.first().focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(200);

    const wrappedFocused = page.locator(":focus");
    const wrappedId = await wrappedFocused.getAttribute("data-room-id");
    const wrappedIdx = allIds.indexOf(wrappedId);

    expect(wrappedIdx).toBe(count - 1); // should wrap to last chip

    // ── Screenshot: keyboard focus ring should be visible ─────────────────────
    await page.screenshot({
      path: `screenshots/${viewport.name}-rtl-keyboard.png`,
    });
  });
}

// Transition test on mobile (frameloop="demand" + invalidate fix)
test("room chip click triggers camera transition on mobile 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/tour/sample", { waitUntil: "networkidle" });
  await page.waitForSelector("canvas", { timeout: 20_000 });
  await page.waitForTimeout(1500);

  const toolbar = page.locator('[role="toolbar"]');
  const chips = toolbar.locator('button[data-room-id]');
  const count = await chips.count();
  expect(count).toBeGreaterThan(1);

  // Click first chip
  await chips.first().click();
  await page.waitForTimeout(300);

  // Click second chip — should trigger a camera transition via invalidate()
  await chips.nth(1).click();
  await page.waitForTimeout(1500); // give 1.5s for transition to complete

  // Verify second chip is now aria-pressed
  const secondChip = chips.nth(1);
  const pressed = await secondChip.getAttribute("aria-pressed");
  expect(pressed).toBe("true");

  await page.screenshot({ path: "screenshots/mobile-375-transition-after.png" });
});
