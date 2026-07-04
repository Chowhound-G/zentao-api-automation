const { test, expect, request } = require('@playwright/test');
const {
  loginSession,
  createTesttask,
  deleteTesttask,
  linkCases,
  runCase,
  ensureToken,
  createDefaultTestcase,
  getProductID,
} = require('../src/api/zentaoClient');

/**
 * 测试任务（testtask）API 用例。
 *
 * testtask 走禅道「传统表单接口」，鉴权用 session cookie（非 REST Token）。
 * 关联用例 / 执行用例 也走传统接口。
 */
const PRODUCT_ID = getProductID(process.env.ZENTAO_URL);
const FIXED_TASK_ID = 2; // 用已存在的测试单做关联/执行（避免污染）
let ctx;
let token;

test.beforeAll(async () => {
  ctx = await loginSession(request);
  token = await ensureToken(request);
});

test.afterAll(async () => {
  if (ctx) await ctx.dispose();
});

test('创建并删除测试单（传统接口）', async () => {
  const name = `[API自动化] 测试单-${Date.now()}`;
  const result = await createTesttask(ctx, { name, product: 1, execution: 3, build: 1 });

  expect(result.result).toBe('success');
  expect(result.id).toBeTruthy();
  console.log(`✅ 创建测试单成功: #${result.id}`);

  // 清理
  const del = await deleteTesttask(ctx, result.id);
  expect(del.result).toBe('success');
  console.log(`✅ 删除测试单 #${result.id}`);
});

test('关联用例到测试单 + 执行用例', async () => {
  // 1. 先创建一个临时用例
  const caseTitle = `[API自动化] 关联执行用例-${Date.now()}`;
  const createRes = await createDefaultTestcase(request, token, PRODUCT_ID, caseTitle);
  const caseData = await createRes.json();
  const caseID = caseData.id;
  const version = caseData.version || 1;
  console.log(`✅ 创建临时用例 #${caseID}`);

  try {
    // 2. 关联到固定测试单
    const linkRes = await linkCases(ctx, FIXED_TASK_ID, [{ case: caseID, version }]);
    expect(linkRes.result).toBe('success');
    console.log(`✅ 关联到 testtask#${FIXED_TASK_ID}`);

    // 3. 查 testtask 详情拿到 run 记录 id
    // 注意：testcases 列表项有 { id, case, caseVersion }，
    //   - id 是关联记录 id（即 runCase 要的 runID）
    //   - case 是真正的用例 id
    const detailRes = await ctx.get(
      `/api.php/v1/testtasks/${FIXED_TASK_ID}`,
      { headers: { Token: token } }
    );
    const taskDetail = await detailRes.json();
    const runRec = (taskDetail.testcases || []).find(
      (c) => String(c.case) === String(caseID)
    );
    const runID = runRec && runRec.id;
    expect(runID).toBeTruthy();
    console.log(`✅ run 记录 id = ${runID} (case=${caseID})`);

    // 4. 执行用例（标记 pass）
    const runResult = await runCase(ctx, {
      runID,
      caseID,
      version,
      result: 'pass',
      real: `[API自动化] 执行通过`,
    });
    expect(runResult.result).toBe('success');
    console.log(`✅ 执行用例结果: pass`);
  } finally {
    // 清理用例（关联记录会级联删除）
    await require('../src/api/zentaoClient').deleteTestcase(request, token, caseID);
    console.log(`✅ 清理用例 #${caseID}`);
  }
});
