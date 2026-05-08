import puppeteer from 'puppeteer';

const APP_URL = 'http://localhost:8080';
const API_URL = 'http://127.0.0.1:3002';
const EMAIL = 'admin@slimbooks.app';
const PASSWORD = 'password';

const main = async () => {
  const login = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const loginJson = await login.json();
  const token = loginJson?.data?.token;
  if (!token) {
    throw new Error('Unable to authenticate for runtime trace');
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    const logs = [];

    page.on('console', (message) => {
      logs.push(`console:${message.type()}:${message.text()}`);
    });

    page.on('requestfailed', (request) => {
      logs.push(`requestfailed:${request.url()}:${request.failure()?.errorText}`);
    });

    page.on('response', (response) => {
      if (response.url().includes('/uploads/') || response.url().includes('/api/expenses')) {
        logs.push(`response:${response.status()}:${response.url()}`);
      }
    });

    await page.evaluateOnNewDocument((authToken, apiBase) => {
      localStorage.setItem('auth_token', authToken);
      localStorage.setItem('remember_me', 'true');
      localStorage.setItem('VITE_API_URL', apiBase);
    }, token, API_URL);

    await page.goto(`${APP_URL}/expenses`, { waitUntil: 'networkidle2' });
    await page.click('button[title="View receipt details"]');
    await page.waitForFunction(() => document.body.innerText.includes('Expense Details'));

    const clicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const target = buttons.find((button) => button.textContent?.trim() === 'View Receipt');
      if (!target) {
        return false;
      }
      target.click();
      return true;
    });

    await new Promise((resolve) => setTimeout(resolve, 3500));

    console.log(
      JSON.stringify(
        {
          clicked,
          pageUrl: page.url(),
          logs,
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
