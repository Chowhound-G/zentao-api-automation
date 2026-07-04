const { test, expect } = require('@playwright/test');
const {
  ensureToken,
  getProductID,
  listTestcases,
  createDefaultTestcase,
  getTestcase,
  deleteTestcase,
} = require('../src/api/zentaoClient');

const PRODUCT_ID = getProductID(process.env.ZENTAO_URL);

test.describe('测试用例管理（API）', () => {
  let token;
  let createdCaseID;

  test.beforeAll(async ({ request }) => {
    token = await ensureToken(request);
  });

  // 清理：如果创建了用例，测试结束后删除，避免污染禅道
  test.afterAll(async ({ request }) => {
    if (createdCaseID) {
      await deleteTestcase(request, token, createdCaseID);
    }
  });

  test('查询测试用例列表', async ({ request }) => {
    const res = await listTestcases(request, token, PRODUCT_ID, { limit: 5 });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.total).toBeGreaterThan(0);
    expect(body.testcases.length).toBeGreaterThan(0);

    // 校验用例字段结构
    const sample = body.testcases[0];
    expect(sample).toHaveProperty('id');
    expect(sample).toHaveProperty('title');
    console.log(`✅ 产品 ${PRODUCT_ID} 共 ${body.total} 个用例，示例: #${sample.id} ${sample.title}`);
  });

  test('创建测试用例（默认字段）', async ({ request }) => {
    const title = `[API自动化] 测试用例-${Date.now()}`;
    const res = await createDefaultTestcase(request, token, PRODUCT_ID, title);

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.id).toBeTruthy();

    createdCaseID = body.id; // 记录供清理
    console.log(`✅ 创建用例成功: #${body.id} "${title}"`);
  });

  test('获取用例详情并校验', async ({ request }) => {
    // 先创建一个用例用于查询
    const title = `[API自动化] 详情查询用例-${Date.now()}`;
    const createRes = await createDefaultTestcase(request, token, PRODUCT_ID, title);
    const created = await createRes.json();

    const res = await getTestcase(request, token, created.id);
    expect(res.status()).toBe(200);
    const detail = await res.json();
    expect(detail.id).toBe(created.id);
    expect(detail.title).toBe(title);

    console.log(`✅ 用例 #${detail.id} 详情: type=${detail.type}, pri=${detail.pri}`);

    // 清理本用例
    await deleteTestcase(request, token, created.id);
  });
});
