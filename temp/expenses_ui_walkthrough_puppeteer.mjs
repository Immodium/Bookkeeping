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

  await page.goto('http://localhost:8080/expenses', { waitUntil: 'networkidle2' });
  await sleep(2500);
  await sleep(2000);

  const clickedImportExport = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const target = buttons.find((button) => button.textContent?.includes('Import/Export'));
    if (!target) {
      return false;
    }
    target.click();
    return true;
  });
  if (!clickedImportExport) {
    throw new Error('Import/Export button not found on expenses page');
  }
  await sleep(1200);

  const clickedExport = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const target = buttons.find((button) => button.textContent?.includes('Export Expenses'));
    if (!target) {
      return false;
    }
    target.click();
    return true;
  });
  if (!clickedExport) {
    throw new Error('Export Expenses button not found in modal');
  }
  await sleep(1000);

  const selectHandle = await page.waitForSelector('#expense-export-format', { visible: true });
  await selectHandle.select('xlsx');
  await sleep(1500);
  await selectHandle.select('csv');
  await sleep(1500);

  await sleep(2000);
} finally {
  await browser.close();
}
