import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });

// 1. /register — no toggle
await page.goto('http://localhost:3000/register', { waitUntil: 'networkidle0' });
await page.screenshot({ path: 'C:/screenshots/register_buyer_only.png', fullPage: true });
console.log('register done');

// 2. Log in as approved developer → should land on /dev/dashboard
await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
await page.type('input[type="email"]', 'dev@buildco.com');
await page.type('input[type="password"]', 'devpass123');
await page.click('button[type="submit"]');
await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 });
await new Promise(r => setTimeout(r, 1500));
console.log('approved dev landed on:', page.url());
await page.screenshot({ path: 'C:/screenshots/login_approved_dev.png', fullPage: true });

// 3. Log in as pending developer → should land on /dev/pending
await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
await page.type('input[type="email"]', 'dev@urbanfix.com');
await page.type('input[type="password"]', 'devpass123');
await page.click('button[type="submit"]');
await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 });
await new Promise(r => setTimeout(r, 1000));
console.log('pending dev landed on:', page.url());
await page.screenshot({ path: 'C:/screenshots/login_pending_dev.png', fullPage: true });

await browser.close();
