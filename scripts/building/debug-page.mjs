import puppeteer from 'puppeteer';

const BASE_URL = 'http://localhost:3000/aom/seed-yarkon-towers';

async function run() {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--enable-webgl',
      '--use-gl=swiftshader',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // Log console messages
  page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err.message));

  console.log('Navigating to:', BASE_URL);
  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('DOM loaded');
    await new Promise(r => setTimeout(r, 5000));
    console.log('5s wait done');

    // Check page title and body
    const title = await page.title();
    console.log('Title:', title);

    // Check for key elements
    const stage = await page.$('.hn-building-stage');
    const body = await page.$eval('body', el => el.innerHTML.substring(0, 500));
    console.log('Building stage found:', !!stage);
    console.log('Body snippet:', body);

    // List all className containing hn-
    const hnEls = await page.evaluate(() => {
      const all = document.querySelectorAll('[class*="hn-"]');
      return Array.from(all).map(el => el.className);
    });
    console.log('HN elements:', hnEls);

    await page.screenshot({ path: 'C:/RealEstateAgent/scripts/building/output/debug_main.png', fullPage: false });
    console.log('Screenshot saved');
  } catch (err) {
    console.error('ERROR:', err.message);
    // Take screenshot anyway
    try {
      await page.screenshot({ path: 'C:/RealEstateAgent/scripts/building/output/debug_err.png', fullPage: false });
      console.log('Error screenshot saved');
    } catch (e2) {
      console.error('Screenshot also failed:', e2.message);
    }
  }

  await browser.close();
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
