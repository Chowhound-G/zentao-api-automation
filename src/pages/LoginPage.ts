import { Page } from '@playwright/test';

export class LoginPage {
  constructor(private page: Page) {}

  accountInput = this.page.locator('#account');
  passwordInput = this.page.locator('#password');
  keepLoginCheckbox = this.page.getByText('保持登录');
  loginButton = this.page.getByRole('button', { name: '登录' });

  async goto(url: string) {
    await this.page.goto(url);
  }

  async login(username: string, password: string) {
    await this.accountInput.fill(username);
    await this.passwordInput.fill(password);
    await this.keepLoginCheckbox.click();
    await this.loginButton.click();
  }
}