import puppeteer from 'puppeteer';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://localhost:8080/login', { waitUntil: 'networkidle2' });
  await page.type('#email', 'admin@slimbooks.app');
  await page.type('#password', 'password');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2' }),
    page.click('button[type="submit"]')
  ]);

  await page.goto('http://localhost:8080/expenses', { waitUntil: 'networkidle2' });
  await sleep(600);
  await page.screenshot({ path: '/opt/cursor/artifacts/expenses_actions_order.png', fullPage: false });

  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const trigger = buttons.find((button) => button.textContent?.includes('Import/Export'));
    if (trigger) trigger.click();
  });
  await sleep(600);

  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const exportButton = buttons.find((button) => button.textContent?.includes('Export Expenses'));
    if (exportButton) exportButton.click();
  });
  await page.waitForSelector('#expense-export-format', { visible: true });
  await page.select('#expense-export-format', 'xlsx');
  await sleep(400);
  await page.screenshot({ path: '/opt/cursor/artifacts/expenses_export_xlsx_option.png', fullPage: false });
} finally {
  await browser.close();
}
