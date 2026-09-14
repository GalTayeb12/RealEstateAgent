/**
 * Usage: node scripts/screenshot.mjs <url> <output-path> [--login]
 * --login: logs in as buyer@demo.com first, then navigates to url
 */
import puppeteer from "puppeteer";
import { writeFileSync } from "fs";

const [,, url, outPath, flag] = process.argv;

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });

if (flag === "--login") {
  // Log in first to get the token in localStorage
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle2" });
  await page.type('input[type="email"]', "buyer@demo.com");
  await page.type('input[type="password"]', "buyer123");
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: "networkidle2" });
}

await page.goto(url, { waitUntil: "networkidle2" });
// Extra wait for client-side data fetch
await new Promise(r => setTimeout(r, 1200));

const buf = await page.screenshot({ fullPage: true });
writeFileSync(outPath, buf);
console.log("Screenshot saved to", outPath);
await browser.close();
