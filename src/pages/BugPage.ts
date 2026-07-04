import { Page, FrameLocator } from '@playwright/test';

export class BugPage {
  private frame: FrameLocator;

  constructor(private page: Page) {
    this.frame = this.page.frameLocator('iframe[name="app-qa"]');
  }

  submitBugLink = () =>
    this.frame.getByRole('link', { name: /提Bug/ });

  titleInput = () =>
    this.frame.locator('#zin_bug_create_colorInput');

  branchLink = () =>
    this.frame.getByRole('link', { name: '主干' });

  affectedVersionPicker = () =>
    this.frame.locator('#zin_bug_create_picker_2_openedBuild\\[\\] .picker');

  saveButton = () =>
    this.frame.getByRole('button', { name: '保存', exact: true });

  async createBug(title: string) {
    await this.submitBugLink().click();
    await this.titleInput().fill(title);

    await this.affectedVersionPicker().click();

    await this.branchLink().click();
    await this.saveButton().click();
  }
}