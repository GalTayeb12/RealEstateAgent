import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });

// ── Admin approvals — wait properly ──────────────────────────────────────────
await page.goto('http://localhost:3000/dev/admin/approvals', { waitUntil: 'networkidle0' });
// Wait until the loading text is gone
await page.waitForFunction(
  () => !document.body.innerText.includes('Loading'),
  { timeout: 10000 }
);
await page.screenshot({ path: 'C:/screenshots/dev_admin.png', fullPage: true });
console.log('admin done');

// ── Dashboard — log in via form ───────────────────────────────────────────────
await page.goto('http://localhost:3000/dev/login', { waitUntil: 'networkidle0' });
await page.type('input[type="email"]', 'dev@buildco.com');
await page.type('input[type="password"]', 'devpass123');
await page.click('button[type="submit"]');
// Wait for redirect to dashboard
await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 });
console.log('after login, url:', page.url());
// Wait for data to load
await new Promise(r => setTimeout(r, 2000));
await page.screenshot({ path: 'C:/screenshots/dev_dashboard_aoms.png', fullPage: true });
console.log('AOMs tab done');

// Offers tab
const allButtons = await page.$$('button');
for (const btn of allButtons) {
  const txt = await page.evaluate(el => el.textContent, btn);
  if (txt && txt.includes('Incoming')) { await btn.click(); break; }
}
await new Promise(r => setTimeout(r, 1000));
await page.screenshot({ path: 'C:/screenshots/dev_dashboard_offers.png', fullPage: true });
console.log('Offers tab done');

// Leverage Groups tab
const allButtons2 = await page.$$('button');
for (const btn of allButtons2) {
  const txt = await page.evaluate(el => el.textContent, btn);
  if (txt && txt.includes('Leverage')) { await btn.click(); break; }
}
await new Promise(r => setTimeout(r, 1000));
await page.screenshot({ path: 'C:/screenshots/dev_dashboard_groups.png', fullPage: true });
console.log('Groups tab done');

await browser.close();
