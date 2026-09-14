/**
 * Zoomed screenshots of the offer form and confirmation state
 */
import puppeteer from "puppeteer";

const BASE = "http://localhost:3000";
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });

async function newPage(w = 1280, h = 900) {
  const p = await browser.newPage();
  await p.setViewport({ width: w, height: h });
  return p;
}

// ─── Buyer — rerun processing to get fresh results ───────────────────────────
const buyer = await newPage();
await buyer.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
await buyer.type("input[type=email]", "buyer@demo.com");
await buyer.type("input[type=password]", "buyer123");
await buyer.click("button[type=submit]");
await buyer.waitForNavigation({ waitUntil: "networkidle2", timeout: 10000 }).catch(() => {});
await new Promise(r => setTimeout(r, 500));

// Clear existing transcriptId so demo button shows
await buyer.evaluate(() => localStorage.removeItem("transcriptId"));
await buyer.goto(`${BASE}/processing`, { waitUntil: "networkidle2" });
await new Promise(r => setTimeout(r, 1000));
await buyer.evaluate(() => {
  const btns = Array.from(document.querySelectorAll("button"));
  btns.find(b => b.textContent?.includes("demo transcript"))?.click();
});
await new Promise(r => setTimeout(r, 9000));
if (!buyer.url().includes("results")) {
  await buyer.waitForFunction(() => window.location.pathname === "/results", { timeout: 20000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));
}
console.log("Results URL:", buyer.url());

// Open the offer form on Match #1
await buyer.evaluate(() => {
  const btns = Array.from(document.querySelectorAll("button"));
  btns.find(b => b.textContent?.trim() === "Send offer")?.click();
});
await new Promise(r => setTimeout(r, 800));

// Screenshot: offer form open (cropped to first card)
const card1 = await buyer.$("div[style*='border-top: 4px solid rgb(31, 75, 74)']");
if (card1) {
  const box = await card1.boundingBox();
  await buyer.screenshot({
    path: "public/ss-offer-form-zoom.png",
    clip: { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: box.height + 16 },
  });
  console.log("ss-offer-form-zoom saved");
}

// Fill in offered price (type over pre-filled value)
await buyer.evaluate(() => {
  const inputs = Array.from(document.querySelectorAll("input[type=number]"));
  const scoreInput = inputs.find(i => Number(i.max) === 100);
  if (scoreInput) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeInputValueSetter.call(scoreInput, "68");
    scoreInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
});
await new Promise(r => setTimeout(r, 300));

// Fill in terms
await buyer.evaluate(() => {
  const ta = document.querySelector("textarea");
  if (ta) {
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    nativeSetter.call(ta, "Cash purchase, 45-day settlement, no conditions");
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
});
await new Promise(r => setTimeout(r, 300));

// Screenshot: form filled
if (card1) {
  const box = await card1.boundingBox();
  await buyer.screenshot({
    path: "public/ss-offer-form-filled.png",
    clip: { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: box.height + 200 },
  });
  console.log("ss-offer-form-filled saved");
}

// Submit
await buyer.evaluate(() => {
  const btns = Array.from(document.querySelectorAll("button"));
  btns.find(b => b.textContent?.trim() === "Submit offer")?.click();
});
await new Promise(r => setTimeout(r, 2500));

// Screenshot: sent confirmation
if (card1) {
  const box = await card1.boundingBox();
  await buyer.screenshot({
    path: "public/ss-offer-sent-zoom.png",
    clip: { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: box.height + 16 },
  });
  console.log("ss-offer-sent-zoom saved");
}

// ─── Developer — check Incoming Offers ───────────────────────────────────────
const dev = await newPage(1100, 900);
await dev.goto(`${BASE}/dev/login`, { waitUntil: "networkidle2" });
await dev.type("input[type=email]", "dev@buildco.com");
await dev.type("input[type=password]", "devpass123");
await dev.click("button[type=submit]");
await dev.waitForNavigation({ waitUntil: "networkidle2", timeout: 10000 }).catch(() => {});
await new Promise(r => setTimeout(r, 2000));
await dev.evaluate(() => {
  Array.from(document.querySelectorAll("button")).find(b => b.textContent?.includes("Incoming Offers"))?.click();
});
await new Promise(r => setTimeout(r, 1500));
await dev.screenshot({ path: "public/ss-dev-offers-zoom.png" });
console.log("ss-dev-offers-zoom saved");

await browser.close();
console.log("Done");
