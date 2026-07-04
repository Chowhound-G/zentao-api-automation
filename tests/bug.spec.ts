import { test } from '@playwright/test';
import { LoginPage } from '../src/pages/LoginPage';
import { BugPage } from '../src/pages/BugPage';
import 'dotenv/config';

test('create a bug in Zentao', async ({ page }) => {
  const loginPage = new LoginPage(page);
  const bugPage = new BugPage(page);

  await loginPage.goto(process.env.ZENTAO_URL!);

  await loginPage.login(
    process.env.ZENTAO_USERNAME!,
    process.env.ZENTAO_PASSWORD!
  );

  await bugPage.createBug(`playwright-${Date.now()}`);
});