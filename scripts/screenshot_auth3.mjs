import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });

// 3 only — pending developer login from a fresh page
// Clear any leftover auth state
await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
await page.evaluate(() => { localStorage.clear(); });

await page.type('input[type="email"]', 'dev@urbanfix.com');
await page.type('input[type="password"]', 'devpass123');
await page.click('button[type="submit"]');

// Poll URL every 300ms until it changes or 8s passes
let url = page.url();
for (let i = 0; i < 27; i++) {
  await new Promise(r => setTimeout(r, 300));
  url = page.url();
  if (!url.includes('/login')) break;
}
await new Promise(r => setTimeout(r, 800));
console.log('pending dev final url:', page.url());
await page.screenshot({ path: 'C:/screenshots/login_pending_dev.png', fullPage: true });

await browser.close();
