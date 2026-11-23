/**
 * e2e/smoke.spec.ts — read-only end-to-end checks of the main flows. Never submits offers, groups or approvals.
 *
 * Public checks run with no setup. Signed-in checks need a Playwright storage state saved outside the repo
 * (docs/design-impl/login.mjs writes one):
 *   E2E_BUYER_STATE=<path to buyer state.json>   npx playwright test e2e/smoke.spec.ts
 */
import { test, expect, type Browser } from "@playwright/test";

const BUYER_STATE = process.env.E2E_BUYER_STATE ?? "";

async function page(browser: Browser, opts: { locale?: "he" | "en"; state?: string; mobile?: boolean } = {}) {
  const ctx = await browser.newContext({
    storageState: opts.state || undefined,
    viewport: opts.mobile ? { width: 390, height: 844 } : { width: 1366, height: 800 },
  });
  await ctx.addCookies([{ name: "haveniq-locale", value: opts.locale ?? "he", url: "http://localhost:3001" }]);
  return { ctx, p: await ctx.newPage() };
}

for (const locale of ["he", "en"] as const) {
  test.describe(`public pages (${locale})`, () => {
    test("home renders with the right direction and no horizontal overflow", async ({ browser }) => {
      const { ctx, p } = await page(browser, { locale });
      const errors: string[] = [];
      p.on("pageerror", (e) => errors.push(e.message));
      await p.goto("/");
      await expect(p.locator("h1").first()).toBeVisible();
      expect(await p.evaluate(() => document.documentElement.dir)).toBe(locale === "he" ? "rtl" : "ltr");
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      expect(errors).toEqual([]);
      await ctx.close();
    });

    test("login page has the form and mobile layout fits", async ({ browser }) => {
      const { ctx, p } = await page(browser, { locale, mobile: true });
      await p.goto("/login");
      await expect(p.locator("input[type=email]")).toBeVisible();
      await expect(p.locator("input[type=password]")).toBeVisible();
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      await ctx.close();
    });
  });
}

test.describe("API security", () => {
  test("protected endpoints reject anonymous callers", async ({ request }) => {
    for (const url of ["/api/buyer/profile", "/api/ledger", "/api/dev/admin/stats", "/api/dev/admin/users", "/api/offers"]) {
      expect([401, 403], url).toContain((await request.get(url)).status());
    }
  });

  test("forged and unsigned tokens are rejected", async ({ request }) => {
    for (const token of ["abc.def.ghi", "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ1c2VySWQiOiJ4Iiwicm9sZSI6ImFkbWluIn0."]) {
      const r = await request.get("/api/dev/admin/stats", { headers: { Authorization: `Bearer ${token}` } });
      expect(r.status()).toBe(401);
    }
  });

  test("SQL-injection payloads never authenticate or error", async ({ request }) => {
    for (const p of ["' OR '1'='1", "1; DROP TABLE \"User\";--"]) {
      const login = await request.post("/api/auth/login", { data: { email: p, password: p } });
      expect([400, 401, 429]).toContain(login.status());
      const aom = await request.get(`/api/aom/${encodeURIComponent(p)}`);
      expect([400, 401, 404]).toContain(aom.status());
    }
  });

  test("path traversal on the stage file route is a 404", async ({ request }) => {
    expect((await request.get("/api/stage/..%2F..%2Fetc/on.json")).status()).toBe(404);
  });

  test("responses carry security headers", async ({ request }) => {
    const h = (await request.get("/")).headers();
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("SAMEORIGIN");
    expect(h["referrer-policy"]).toBeTruthy();
  });
});

test.describe("signed-in buyer", () => {
  test.skip(!BUYER_STATE, "set E2E_BUYER_STATE to a saved buyer session");

  test("session token is not readable by scripts", async ({ browser }) => {
    const { ctx, p } = await page(browser, { state: BUYER_STATE });
    await p.goto("/results");
    await p.waitForTimeout(2500); // legacy-token migration runs on first load
    const seen = await p.evaluate(() => ({ token: localStorage.getItem("token"), cookie: document.cookie }));
    expect(seen.token === null || seen.token === "session").toBe(true);
    expect(seen.cookie).not.toContain("hq_session");
    await ctx.close();
  });

  for (const locale of ["he", "en"] as const) {
    test(`results survive an empty browser cache (${locale})`, async ({ browser }) => {
      const { ctx, p } = await page(browser, { state: BUYER_STATE, locale });
      await p.goto("/results");
      await p.evaluate(() => sessionStorage.clear());
      await p.reload();
      await expect(p.locator("h1").first()).toBeVisible({ timeout: 30_000 });
      await expect(p.locator(".rh-score")).toBeVisible({ timeout: 30_000 }); // hero fit score: rebuilt from the server profile
      expect(await p.evaluate(() => !!sessionStorage.getItem("matchResults"))).toBe(true);
      await ctx.close();
    });
  }

  test("results and offers fit a phone screen", async ({ browser }) => {
    const { ctx, p } = await page(browser, { state: BUYER_STATE, mobile: true });
    for (const url of ["/results", "/buyer/offers", "/profile"]) {
      await p.goto(url);
      await p.waitForTimeout(2500);
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), url).toBe(true);
    }
    await ctx.close();
  });

  test("buyer cannot reach admin data", async ({ browser }) => {
    const { ctx, p } = await page(browser, { state: BUYER_STATE });
    await p.goto("/results");
    await p.waitForTimeout(2500);
    const codes = await p.evaluate(async () => [(await fetch("/api/ledger")).status, (await fetch("/api/dev/admin/stats")).status]);
    expect(codes.every((c) => c === 401 || c === 403)).toBe(true);
    await ctx.close();
  });
});
