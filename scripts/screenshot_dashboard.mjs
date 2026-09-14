import puppeteer from 'puppeteer';
import { mkdirSync } from 'fs';

mkdirSync('C:/screenshots', { recursive: true });

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });

await page.goto('http://localhost:3000/dev/login', { waitUntil: 'domcontentloaded' });
const loginData = await page.evaluate(async () => {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dev@buildco.com', password: 'devpass123' }),
  });
  return res.json();
});
console.log('login ok, role:', loginData.user?.role);

await page.evaluate((token, user) => {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}, loginData.token, loginData.user);

await page.goto('http://localhost:3000/dev/dashboard', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 2000));
await page.screenshot({ path: 'C:/screenshots/dev_dashboard_aoms.png', fullPage: true });
console.log('AOMs tab done');

const allButtons = await page.$$('button');
for (const btn of allButtons) {
  const txt = await page.evaluate(el => el.textContent, btn);
  if (txt && txt.includes('Incoming')) { await btn.click(); break; }
}
await new Promise(r => setTimeout(r, 1000));
await page.screenshot({ path: 'C:/screenshots/dev_dashboard_offers.png', fullPage: true });
console.log('Offers tab done');

const allButtons2 = await page.$$('button');
for (const btn of allButtons2) {
  const txt = await page.evaluate(el => el.textContent, btn);
  if (txt && txt.includes('Leverage')) { await btn.click(); break; }
}
await new Promise(r => setTimeout(r, 1000));
await page.screenshot({ path: 'C:/screenshots/dev_dashboard_groups.png', fullPage: true });
console.log('Groups tab done');

await browser.close();
