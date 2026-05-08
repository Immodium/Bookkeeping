import puppeteer from 'puppeteer';

const APP_URL = 'http://localhost:8080';
const API_URL = 'http://127.0.0.1:3002';
const EMAIL = 'admin@slimbooks.app';
const PASSWORD = 'password';

const main = async () => {
  const loginResponse = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const loginPayload = await loginResponse.json();
  const token = loginPayload?.data?.token;
  if (!token) {
    throw new Error('Unable to authenticate for receipt verification');
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument((authToken, apiUrl) => {
      localStorage.setItem('auth_token', authToken);
      localStorage.setItem('remember_me', 'true');
      localStorage.setItem('VITE_API_URL', apiUrl);
    }, token, API_URL);

    await page.goto(`${APP_URL}/expenses`, { waitUntil: 'networkidle2' });

    const popupPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('No viewer tab opened')), 15000);
      const handler = async (target) => {
        if (target.type() !== 'page') return;
        const popupPage = await target.page();
        if (!popupPage) return;
        clearTimeout(timeout);
        browser.off('targetcreated', handler);
        resolve(popupPage);
      };
      browser.on('targetcreated', handler);
    });

    await page.waitForSelector('button[title="View receipt details"]', { timeout: 45000 });
    await page.click('button[title="View receipt details"]');
    await page.waitForFunction(() => document.body.innerText.includes('Expense Details'));

    const clicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const target = buttons.find((button) => button.textContent?.trim() === 'View Receipt');
      if (!target) return false;
      target.click();
      return true;
    });

    if (!clicked) {
      throw new Error('View Receipt button not found in expense modal');
    }

    const popup = await popupPromise;
    await new Promise((resolve) => setTimeout(resolve, 3200));

    const info = {
      viewer_url: popup.url(),
      is_blob: popup.url().startsWith('blob:'),
      title: await popup.title(),
    };

    console.log(JSON.stringify(info, null, 2));
    await popup.screenshot({
      path: '/opt/cursor/artifacts/expense_receipt_blob_viewer_tab.png',
      fullPage: true,
    });
  } finally {
    await browser.close();
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
