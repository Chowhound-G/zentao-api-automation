const { test, expect, request } = require('@playwright/test');
const { loginSession, createTesttask, deleteTesttask } = require('../src/api/zentaoClient');

/**
 * 测试任务（testtask）API 用例。
 *
 * 注意：testtask 走禅道「传统表单接口」，鉴权用 session cookie（非 REST Token），
 * 因此这里用 request.request 直接创建独立 context，不依赖 REST 的 ensureToken。
 */
let ctx;
let createdTaskID;

test.beforeAll(async () => {
  // 传统接口登录，建立带 keepLogin cookie 的 session
  ctx = await loginSession(request);
});

test.afterAll(async () => {
  // 清理探测创建的测试单
  if (createdTaskID) {
    await deleteTesttask(ctx, createdTaskID);
  }
  if (ctx) {
    await ctx.dispose();
  }
});

test('创建测试单（传统接口）', async () => {
  const name = `[API自动化] 测试单-${Date.now()}`;
  const result = await createTesttask(ctx, { name, product: 1, execution: 3, build: 1 });

  expect(result.result).toBe('success');
  expect(result.id).toBeTruthy();

  createdTaskID = result.id; // 记录供 afterAll 清理
  console.log(`✅ 创建测试单成功: #${result.id} "${name}"`);
});

test('创建测试单后会话保持有效（连续创建）', async () => {
  // 验证 session 的持久性：同一个 ctx 连续创建两个
  const name1 = `[API自动化] 连续测试单1-${Date.now()}`;
  const name2 = `[API自动化] 连续测试单2-${Date.now()}`;

  const r1 = await createTesttask(ctx, { name: name1, product: 1, execution: 3, build: 1 });
  const r2 = await createTesttask(ctx, { name: name2, product: 1, execution: 3, build: 1 });

  expect(r1.result).toBe('success');
  expect(r2.result).toBe('success');

  // 清理这两个（用数组记录，afterAll 只清理最后一个）
  await deleteTesttask(ctx, r1.id);
  await deleteTesttask(ctx, r2.id);

  console.log(`✅ 连续创建成功: #${r1.id}、#${r2.id}（已清理）`);
});
