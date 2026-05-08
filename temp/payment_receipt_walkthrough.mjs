import puppeteer from 'puppeteer';

const APP_URL = 'http://localhost:8080';
const EMAIL = 'admin@slimbooks.app';
const PASSWORD = 'password';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const clickByText = async (page, selector, text) => {
  const clicked = await page.evaluate(
    ({ selector: elementSelector, text: targetText }) => {
      const elements = Array.from(document.querySelectorAll(elementSelector));
      const match = elements.find((element) =>
        element.textContent?.trim().toLowerCase().includes(targetText.toLowerCase())
      );
      if (!match) {
        return false;
      }
      match.click();
      return true;
    },
    { selector, text }
  );

  if (!clicked) {
    throw new Error(`Unable to click ${selector} containing "${text}"`);
  }
};

const setInputValue = async (page, selector, value) => {
  await page.evaluate(
    ({ selector: inputSelector, value: inputValue }) => {
      const input = document.querySelector(inputSelector);
      if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLTextAreaElement)) {
        throw new Error(`Input not found for selector ${inputSelector}`);
      }
      input.focus();
      input.value = inputValue;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { selector, value }
  );
};

const main = async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(30000);
    const logResponse = (response) => {
      const url = response.url();
      if (url.includes('/api/auth/login') || url.includes('/api/payments')) {
        console.log('api', response.status(), response.request().method(), url);
      }
    };
    page.on('response', logResponse);

    await page.goto(`${APP_URL}/login`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[name="email"]');
    await page.click('input[name="email"]', { clickCount: 3 });
    await page.keyboard.type(EMAIL);
    await page.click('input[name="password"]', { clickCount: 3 });
    await page.keyboard.type(PASSWORD);
    await sleep(400);

    await clickByText(page, 'button', 'Sign in');
    await page.waitForFunction(() => window.location.pathname !== '/login');
    await page.goto(`${APP_URL}/payments`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('button');
    await sleep(1200);

    await clickByText(page, 'button', 'Add Payment');
    await page.waitForFunction(() => document.body.innerText.includes('Add New Payment'));
    await sleep(1200);

    await page.waitForFunction(() => {
      const selects = Array.from(document.querySelectorAll('select'));
      return selects.some((select) =>
        Array.from(select.options).some((option) =>
          option.textContent?.includes('Test Client')
        )
      );
    });
    await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select'));
      const clientSelect = selects.find((select) =>
        Array.from(select.options).some((option) =>
          option.textContent?.includes('Test Client')
        )
      );
      if (!clientSelect) {
        throw new Error('Client select with Test Client not found');
      }
      const option = Array.from(clientSelect.options).find((entry) =>
        entry.textContent?.includes('Test Client')
      );
      if (!option) {
        throw new Error('Test Client option not found');
      }
      clientSelect.value = option.value;
      clientSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await sleep(1000);

    await setInputValue(page, 'input[type="number"]', '444.44');
    await setInputValue(page, 'input[placeholder*="Check #"]', 'UI-WALKTHROUGH');
    await setInputValue(page, 'textarea', 'UI walkthrough payment verification');
    await sleep(800);

    const createResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/payments') &&
        response.request().method() === 'POST' &&
        response.status() === 201
    );
    await clickByText(page, 'button', 'Save Payment');
    await createResponse;
    await page.waitForFunction(() => {
      const text = document.body.innerText;
      return text.includes('UI-WALKTHROUGH') || text.includes('Payment created successfully');
    });
    await sleep(1600);

    await page.goto(`${APP_URL}/expenses`, { waitUntil: 'networkidle2' });
    await page.waitForFunction(() => document.body.innerText.includes('Expenses'));
    await page.waitForSelector('button[title="View receipt details"]');
    await page.click('button[title="View receipt details"]');
    await page.waitForFunction(() => document.body.innerText.includes('Expense Details'));
    await sleep(900);

    const popupPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Receipt popup not opened in time')), 15000);
      const handler = async (target) => {
        if (target.type() !== 'page') {
          return;
        }
        const popupPage = await target.page();
        if (!popupPage) {
          return;
        }
        clearTimeout(timeout);
        browser.off('targetcreated', handler);
        resolve(popupPage);
      };
      browser.on('targetcreated', handler);
    });

    await clickByText(page, 'button', 'View Receipt');
    const popup = await popupPromise;
    await popup.bringToFront();
    await popup.waitForSelector('#print-btn');
    await popup.waitForSelector('#download-btn');
    await sleep(1800);

    await popup.screenshot({
      path: '/opt/cursor/artifacts/receipt_popup_with_print_download.png',
      fullPage: true,
    });

    await page.bringToFront();
    await page.screenshot({
      path: '/opt/cursor/artifacts/payment_form_client_dropdown_and_saved_payment.png',
      fullPage: true,
    });

    await sleep(1000);
  } finally {
    await browser.close();
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
