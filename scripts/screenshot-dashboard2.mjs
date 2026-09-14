import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });

// Login as developer
await page.goto("http://localhost:3000/dev/login", { waitUntil: "networkidle2" });
await page.type("input[type=email]", "dev@buildco.com");
await page.type("input[type=password]", "devpass123");
await page.click("button[type=submit]");
await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 10000 }).catch(() => {});
await new Promise(r => setTimeout(r, 3000));
console.log("Dashboard URL:", page.url());

// Screenshot 1: My Projects tab — all collapsed
await page.screenshot({ path: "public/ss-projects-collapsed.png", fullPage: true });
console.log("ss1: collapsed");

// Expand Riverside Towers — find the specific button by evaluating in-page
await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll("button"));
  const btn = btns.find(b => b.textContent?.includes("Riverside Towers"));
  if (btn) btn.click();
  else console.error("Riverside Towers button not found");
});
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: "public/ss-projects-expanded.png", fullPage: true });
console.log("ss2: expanded");

// Click "+ Add unit type" — the dashed button inside Riverside Towers
await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll("button"));
  const btn = btns.find(b => b.textContent?.trim() === "+ Add unit type");
  if (btn) btn.click();
  else console.error("Add unit type button not found:", btns.map(b => b.textContent?.trim()).join(" | "));
});
await new Promise(r => setTimeout(r, 1000));
await page.screenshot({ path: "public/ss-add-unit-type.png", fullPage: true });
console.log("ss3: add unit type form");

// Navigate to Incoming Offers tab
await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll("button"));
  const btn = btns.find(b => b.textContent?.includes("Incoming Offers"));
  if (btn) btn.click();
});
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: "public/ss-offers-new.png", fullPage: true });
console.log("ss4: incoming offers");

await browser.close();
console.log("Done");
