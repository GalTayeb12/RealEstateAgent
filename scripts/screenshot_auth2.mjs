import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });

// 1. /register — buyer only
await page.goto('http://localhost:3000/register', { waitUntil: 'networkidle0' });
await page.screenshot({ path: 'C:/screenshots/register_buyer_only.png', fullPage: true });
console.log('register done');

// 2. Approved developer → /dev/dashboard
await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
await page.type('input[type="email"]', 'dev@buildco.com');
await page.type('input[type="password"]', 'devpass123');
await Promise.all([
  page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }),
  page.click('button[type="submit"]'),
]);
await new Promise(r => setTimeout(r, 2000));
console.log('approved dev url:', page.url());
await page.screenshot({ path: 'C:/screenshots/login_approved_dev.png', fullPage: true });

// 3. Pending developer → /dev/pending (client-side push, wait for URL change)
await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
await page.type('input[type="email"]', 'dev@urbanfix.com');
await page.type('input[type="password"]', 'devpass123');
await page.click('button[type="submit"]');
// Wait for URL to change away from /login
await page.waitForFunction(
  () => !window.location.pathname.includes('/login'),
  { timeout: 10000 }
);
await new Promise(r => setTimeout(r, 1000));
console.log('pending dev url:', page.url());
await page.screenshot({ path: 'C:/screenshots/login_pending_dev.png', fullPage: true });

await browser.close();
