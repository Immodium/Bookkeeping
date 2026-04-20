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

  const clickButtonByLabel = async (label) => {
    const clicked = await page.evaluate((labelText) => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const target = buttons.find((button) => (button.getAttribute('title') || '') === labelText || (button.textContent || '').includes(labelText));
      if (!target) return false;
      target.click();
      return true;
    }, label);
    if (!clicked) throw new Error(`Button not found: ${label}`);
  };

  // Clients
  await page.goto('http://localhost:8080/clients', { waitUntil: 'networkidle2' });
  await sleep(1300);
  await page.click('tbody tr');
  await sleep(1000);

  // Invoices
  await page.goto('http://localhost:8080/invoices', { waitUntil: 'networkidle2' });
  await sleep(1300);
  await clickButtonByLabel('Table View');
  await sleep(700);
  await page.click('tbody tr');
  await sleep(1000);
  await page.keyboard.press('Escape');
  await sleep(350);

  // Expenses
  await page.goto('http://localhost:8080/expenses', { waitUntil: 'networkidle2' });
  await sleep(1300);
  await clickButtonByLabel('Table View');
  await sleep(700);
  await page.click('tbody tr');
  await sleep(1000);
  const clickedViewReceipt = await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').includes('View Receipt'));
    if (!button) return false;
    button.click();
    return true;
  });
  if (clickedViewReceipt) {
    await sleep(900);
  }
  await page.keyboard.press('Escape');
  await sleep(400);
  await clickButtonByLabel('Import/Export');
  await sleep(800);

  // Payments
  await page.goto('http://localhost:8080/payments', { waitUntil: 'networkidle2' });
  await sleep(1300);
  await clickButtonByLabel('Table View');
  await sleep(700);
  await page.click('tbody tr');
  await sleep(1000);
  await page.keyboard.press('Escape');
  await sleep(400);
  await clickButtonByLabel('Import/Export');
  await sleep(600);
  await clickButtonByLabel('Export Payments');
  await sleep(600);
  const formatSelect = await page.$('#payment-export-format');
  if (formatSelect) {
    await formatSelect.select('xlsx');
    await sleep(700);
    await formatSelect.select('csv');
    await sleep(700);
  }

  await sleep(1200);
} finally {
  await browser.close();
}
