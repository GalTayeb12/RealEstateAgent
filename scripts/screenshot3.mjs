import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });

// Log in via form
await page.goto('http://localhost:3000/dev/login', { waitUntil: 'networkidle0' });
await page.type('input[type="email"]', 'dev@buildco.com');
await page.type('input[type="password"]', 'devpass123');
await page.click('button[type="submit"]');
await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 });
await new Promise(r => setTimeout(r, 2000));

// Debug: list all button texts
const btns = await page.$$eval('button', els => els.map(e => e.textContent?.trim()));
console.log('Buttons on page:', btns);

// AOMs (default)
await page.screenshot({ path: 'C:/screenshots/dev_dashboard_aoms.png', fullPage: true });
console.log('AOMs done');

// Click Incoming Offers tab using evaluate
await page.evaluate(() => {
  const allBtns = Array.from(document.querySelectorAll('button'));
  const tab = allBtns.find(b => b.textContent?.includes('Incoming'));
  if (tab) tab.click();
  else console.error('Offers tab not found');
});
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: 'C:/screenshots/dev_dashboard_offers.png', fullPage: true });
console.log('Offers done');

// Click Leverage Groups tab
await page.evaluate(() => {
  const allBtns = Array.from(document.querySelectorAll('button'));
  const tab = allBtns.find(b => b.textContent?.includes('Leverage'));
  if (tab) tab.click();
  else console.error('Groups tab not found');
});
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: 'C:/screenshots/dev_dashboard_groups.png', fullPage: true });
console.log('Groups done');

await browser.close();
