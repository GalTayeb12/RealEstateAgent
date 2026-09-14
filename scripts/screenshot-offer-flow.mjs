/**
 * End-to-end screenshot: buyer sends offer → dev sees it in dashboard
 */
import puppeteer from "puppeteer";

const BASE = "http://localhost:3000";
const OFFER_SCORE = "68";
const OFFER_TERMS = "Cash purchase, 45-day settlement, no conditions";

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });

async function newPage() {
  const p = await browser.newPage();
  await p.setViewport({ width: 1280, height: 900 });
  return p;
}

// ─────────────────────────────────────────────────────────────────────────────
// BUYER FLOW
// ─────────────────────────────────────────────────────────────────────────────
const buyer = await newPage();

// 1. Login as buyer
await buyer.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
await buyer.type("input[type=email]", "buyer@demo.com");
await buyer.type("input[type=password]", "buyer123");
await buyer.click("button[type=submit]");
await buyer.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
await new Promise(r => setTimeout(r, 1000));
console.log("Buyer logged in, URL:", buyer.url());

// 2. Go to /processing and trigger "Use demo transcript"
await buyer.goto(`${BASE}/processing`, { waitUntil: "networkidle2" });
await new Promise(r => setTimeout(r, 1500));

const demoBtn = await buyer.evaluate(() => {
  const btns = Array.from(document.querySelectorAll("button"));
  const b = btns.find(b => b.textContent?.includes("demo transcript") || b.textContent?.includes("Use demo"));
  if (b) { b.click(); return true; }
  return false;
});
console.log("Demo transcript button clicked:", demoBtn);

// Wait for results to load (characterize + match API calls)
await new Promise(r => setTimeout(r, 8000));
console.log("After processing wait, URL:", buyer.url());

// If still on processing, wait more
if (buyer.url().includes("processing")) {
  await buyer.waitForFunction(() => window.location.pathname === "/results", { timeout: 20000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));
}
console.log("Results URL:", buyer.url());

// 3. Screenshot: results with "Send offer" buttons visible
await buyer.screenshot({ path: "public/ss-results-send-offer.png", fullPage: true });
console.log("ss1: results page with Send offer buttons saved");

// 4. Click "Send offer" on the first feasible match
const openedForm = await buyer.evaluate(() => {
  const btns = Array.from(document.querySelectorAll("button"));
  const b = btns.find(b => b.textContent?.trim() === "Send offer");
  if (b) { b.click(); return true; }
  return false;
});
console.log("Send offer button clicked:", openedForm);
await new Promise(r => setTimeout(r, 800));

// 5. Screenshot: form is open
await buyer.screenshot({ path: "public/ss-offer-form-open.png", fullPage: true });
console.log("ss2: offer form open saved");

// 6. Fill in the form — clear the pre-filled score and type our value
const scoreInput = await buyer.$("input[type=number][max='100']");
if (scoreInput) {
  await scoreInput.click({ clickCount: 3 });
  await scoreInput.type(OFFER_SCORE);
}

// Fill terms textarea
const termsInput = await buyer.$("textarea");
if (termsInput) {
  await termsInput.click({ clickCount: 3 });
  await termsInput.type(OFFER_TERMS);
}

await new Promise(r => setTimeout(r, 400));

// 7. Submit
const submitted = await buyer.evaluate(() => {
  const btns = Array.from(document.querySelectorAll("button"));
  const b = btns.find(b => b.textContent?.trim() === "Submit offer");
  if (b) { b.click(); return true; }
  return false;
});
console.log("Submit offer clicked:", submitted);
await new Promise(r => setTimeout(r, 2000));

// 8. Screenshot: confirmation state
await buyer.screenshot({ path: "public/ss-offer-sent.png", fullPage: true });
console.log("ss3: offer sent confirmation saved");

// ─────────────────────────────────────────────────────────────────────────────
// DEVELOPER FLOW — open new page, log in, check Incoming Offers
// ─────────────────────────────────────────────────────────────────────────────
const dev = await newPage();

await dev.goto(`${BASE}/dev/login`, { waitUntil: "networkidle2" });
await dev.type("input[type=email]", "dev@buildco.com");
await dev.type("input[type=password]", "devpass123");
await dev.click("button[type=submit]");
await dev.waitForNavigation({ waitUntil: "networkidle2", timeout: 10000 }).catch(() => {});
await new Promise(r => setTimeout(r, 2000));
console.log("Dev logged in, URL:", dev.url());

// Navigate to Incoming Offers tab
await dev.evaluate(() => {
  const btns = Array.from(document.querySelectorAll("button"));
  const b = btns.find(b => b.textContent?.includes("Incoming Offers"));
  if (b) b.click();
});
await new Promise(r => setTimeout(r, 2000));

// 9. Screenshot: dev incoming offers showing the real offer
await dev.screenshot({ path: "public/ss-dev-incoming-offer.png", fullPage: true });
console.log("ss4: dev incoming offers saved");

await browser.close();
console.log("\nAll screenshots complete.");
