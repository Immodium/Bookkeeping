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

  // Clients cards layout (response rate removed)
  await page.goto('http://localhost:8080/clients', { waitUntil: 'networkidle2' });
  await sleep(700);
  await page.screenshot({ path: '/opt/cursor/artifacts/clients_cards_without_response_rate.png' });

  // Expenses import/export with xlsx import option
  await page.goto('http://localhost:8080/expenses', { waitUntil: 'networkidle2' });
  await sleep(700);
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').includes('Import/Export'));
    button?.click();
  });
  await sleep(500);
  await page.screenshot({ path: '/opt/cursor/artifacts/expenses_import_export_xlsx_option.png' });

  // Payments import/export style and xlsx export option
  await page.goto('http://localhost:8080/payments', { waitUntil: 'networkidle2' });
  await sleep(700);
  await page.screenshot({ path: '/opt/cursor/artifacts/payments_import_export_primary_right.png' });
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').includes('Import/Export'));
    button?.click();
  });
  await sleep(400);
  await page.evaluate(() => {
    const exportButton = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').includes('Export Payments'));
    exportButton?.click();
  });
  await sleep(500);
  await page.select('#payment-export-format', 'xlsx');
  await sleep(300);
  await page.screenshot({ path: '/opt/cursor/artifacts/payments_export_xlsx_selected.png' });

  // Programmatic checks output
  const checks = await page.evaluate(() => {
    const getButtonsText = () => Array.from(document.querySelectorAll('button')).map((b) => (b.textContent || '').replace(/\s+/g, ' ').trim());
    return {
      paymentsButtons: getButtonsText(),
      paymentExportSelectOptions: Array.from(document.querySelectorAll('#payment-export-format option')).map((o) => o.textContent?.trim()),
      paymentDownloadLabel: (Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').includes('Download'))?.textContent || '').trim()
    };
  });

  // Record button order checks in separate fresh pages
  await page.goto('http://localhost:8080/expenses', { waitUntil: 'networkidle2' });
  await sleep(400);
  const expenseHeaderButtons = await page.evaluate(() => {
    const container = Array.from(document.querySelectorAll('div.flex.space-x-3')).find((div) => (div.textContent || '').includes('Add Expense') && (div.textContent || '').includes('Upload Receipt') && (div.textContent || '').includes('Import/Export'));
    if (!container) return [];
    return Array.from(container.querySelectorAll('button, label')).map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim());
  });

  await page.goto('http://localhost:8080/payments', { waitUntil: 'networkidle2' });
  await sleep(400);
  const paymentHeaderButtons = await page.evaluate(() => {
    const container = Array.from(document.querySelectorAll('div.flex.space-x-3')).find((div) => (div.textContent || '').includes('Add Payment') && (div.textContent || '').includes('Import/Export'));
    if (!container) return [];
    return Array.from(container.querySelectorAll('button')).map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim());
  });

  console.log(JSON.stringify({ checks, expenseHeaderButtons, paymentHeaderButtons }, null, 2));
} finally {
  await browser.close();
}
