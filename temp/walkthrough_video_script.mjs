import puppeteer from 'puppeteer';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browser = await puppeteer.launch({
  headless: false,
  defaultViewport: { width: 1440, height: 900 },
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

try {
  const page = await browser.newPage();
  await page.goto('http://localhost:8080/login', { waitUntil: 'networkidle2' });
  await page.type('#email', 'admin@slimbooks.app');
  await page.type('#password', 'password');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2' }),
    page.click('button[type="submit"]')
  ]);

  // Clients card layout
  await page.goto('http://localhost:8080/clients', { waitUntil: 'networkidle2' });
  await sleep(1200);

  // Expenses module: header order + import/export modal
  await page.goto('http://localhost:8080/expenses', { waitUntil: 'networkidle2' });
  await sleep(1200);
  await page.evaluate(() => {
    const trigger = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').includes('Import/Export'));
    trigger?.click();
  });
  await sleep(900);

  // Invoices module list/card (view button removed; open invoice modal via card click)
  await page.goto('http://localhost:8080/invoices', { waitUntil: 'networkidle2' });
  await sleep(1200);
  await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('div.bg-card.rounded-lg.shadow-sm.border.border-border.p-6')).at(0);
    if (card instanceof HTMLElement) card.click();
  });
  await sleep(900);
  await page.keyboard.press('Escape');
  await sleep(500);

  // Payments module: import/export button placement + xlsx export option
  await page.goto('http://localhost:8080/payments', { waitUntil: 'networkidle2' });
  await sleep(1200);
  await page.evaluate(() => {
    const trigger = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').includes('Import/Export'));
    trigger?.click();
  });
  await sleep(700);
  await page.evaluate(() => {
    const exportBtn = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').includes('Export Payments'));
    exportBtn?.click();
  });
  await sleep(700);
  const select = await page.$('#payment-export-format');
  if (select) {
    await select.select('xlsx');
    await sleep(1000);
  }

  await sleep(1200);
} finally {
  await browser.close();
}
