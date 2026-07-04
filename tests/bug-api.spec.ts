const { test, expect } = require('@playwright/test');
const {
  ensureToken,
  createDefaultBug,
  getProductID,
} = require('../src/api/zentaoClient');

test('create a bug via API', async ({ request }) => {
  // 1. 登录获取 token（带文件缓存）
  const token = await ensureToken(request);

  // 2. 从 ZENTAO_URL 解析 productID
  const productID = getProductID(process.env.ZENTAO_URL);

  // 3. 调用 API 创建 Bug
  const title = `playwright-api-${Date.now()}`;
  const res = await createDefaultBug(request, token, productID, title);

  // 4. 标准断言：状态码 + 返回 bug id
  expect([200, 201]).toContain(res.status());
  const body = await res.json();
  expect(body.id).toBeTruthy();
});
