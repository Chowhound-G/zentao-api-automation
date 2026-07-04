const fs = require('fs');
const path = require('path');

const TOKEN_FILE = path.resolve(__dirname, '../../.token');

/**
 * 从 ZENTAO_URL 中提取禅道的 base 地址。
 * 例：https://sub2.hermes.cn.mt/zentao/index.php?m=user&f=login...
 * 得到：https://sub2.hermes.cn.mt/zentao
 */
function getBaseURL(envURL) {
  if (!envURL) throw new Error('ZENTAO_URL 未配置');
  const idx = envURL.indexOf('/zentao');
  if (idx === -1) throw new Error('ZENTAO_URL 中未找到 /zentao 路径');
  return envURL.slice(0, idx + '/zentao'.length);
}

/**
 * 从 ZENTAO_URL 的 referer 参数中解码出 productID。
 * referer 是 base64，解码后形如：/zentao/index.php?m=bug&f=browse&productID=1
 * 若 URL 未携带 referer 或解码后不含 productID（如 referer=Lw== 仅是 "/"），
 * 默认返回 1。
 */
function getProductID(envURL) {
  try {
    const match = /referer=([^&]+)/.exec(envURL);
    if (match) {
      const decoded = Buffer.from(match[1], 'base64').toString('utf-8');
      const idMatch = /productID=(\d+)/.exec(decoded);
      if (idMatch) return parseInt(idMatch[1], 10);
    }
  } catch {
    // 忽略解析异常
  }
  return 1;
}

/**
 * 登录获取 token。
 * POST {base}/api.php/v1/tokens，body 为 { account, password } JSON。
 */
async function login(request) {
  const base = getBaseURL(process.env.ZENTAO_URL);
  const res = await request.post(`${base}/api.php/v1/tokens`, {
    data: {
      account: process.env.ZENTAO_USERNAME,
      password: process.env.ZENTAO_PASSWORD,
    },
  });

  if (!res.ok()) {
    const text = await res.text();
    throw new Error(`登录失败 ${res.status()}: ${text}`);
  }

  const body = await res.json();
  // 禅道返回 { token: "...", realname: ... }
  return body.token;
}

/**
 * 读取本地缓存的 token。
 */
function loadCachedToken() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      return fs.readFileSync(TOKEN_FILE, 'utf-8').trim() || null;
    }
  } catch {
    // 忽略读取异常，后续走重新登录
  }
  return null;
}

/**
 * 将 token 写入本地文件缓存。
 */
function saveCachedToken(token) {
  try {
    fs.writeFileSync(TOKEN_FILE, token, 'utf-8');
  } catch {
    // 忽略写入异常（不影响主流程）
  }
}

function clearCachedToken() {
  try {
    if (fs.existsSync(TOKEN_FILE)) fs.unlinkSync(TOKEN_FILE);
  } catch {
    // 忽略
  }
}

/**
 * 确保 token 可用：先读缓存，无缓存则登录并写盘。
 */
async function ensureToken(request) {
  let token = loadCachedToken();
  if (token) return token;

  token = await login(request);
  saveCachedToken(token);
  return token;
}

/**
 * 带鉴权头构造请求选项。
 */
function authHeaders(token) {
  // 禅道 v1 鉴权使用独立的 Token 头（非 Authorization: Token xxx，后者会被判 401）
  return {
    'Content-Type': 'application/json',
    Token: token,
  };
}

/**
 * 创建单个 Bug。遇到 401 自动重新登录并重试一次。
 */
async function createBug(request, token, productID, payload) {
  const base = getBaseURL(process.env.ZENTAO_URL);
  const url = `${base}/api.php/v1/products/${productID}/bugs`;

  let res = await request.post(url, {
    headers: authHeaders(token),
    data: payload,
  });

  // token 失效：清缓存、重新登录、重试一次
  if (res.status() === 401) {
    const newToken = await login(request);
    saveCachedToken(newToken);
    res = await request.post(url, {
      headers: authHeaders(newToken),
      data: payload,
    });
  }

  return res;
}

/**
 * 使用默认字段创建 Bug。
 * 标题由调用方传入，其余字段用禅道必填项的合理默认值。
 */
async function createDefaultBug(request, token, productID, title) {
  const payload = {
    title,
    pri: 1, // 优先级（必填）
    severity: 3, // 严重程度：3=一般（必填）
    type: 'codeerror', // Bug类型：代码错误（必填）
    openedBuild: ['trunk'], // 影响版本：主干
    steps: `<p>[API 自动化] ${title}</p>`,
  };
  return createBug(request, token, productID, payload);
}

/**
 * ============ 测试用例（testcase）相关 ============
 *
 * 实测结论（与 Bug 接口略有差异）：
 * - 列表：GET /products/{productID}/testcases，返回 { total, testcases: [...] }
 * - 创建：POST /products/{productID}/testcases，成功返回 200（注意不是 201）+ { id }
 * - 必填：title + type + pri + steps
 * - type 取值：interface（接口测试）、feature（功能测试）、performance 等
 * - steps 可为字符串或 [{ desc, expect }] 数组
 * - 用例 id 在列表里形如 "case_300"，但创建/删除用数字 id（如 300）
 */

/**
 * 获取产品下的测试用例列表。
 * @param {object} request  Playwright request fixture 或 APIRequestContext
 * @param {string} token
 * @param {number} productID
 * @param {object} [options] { page, limit }
 */
async function listTestcases(request, token, productID, options = {}) {
  const base = getBaseURL(process.env.ZENTAO_URL);
  const { page = 1, limit = 20 } = options;
  const res = await request.get(
    `${base}/api.php/v1/products/${productID}/testcases?page=${page}&limit=${limit}`,
    { headers: authHeaders(token) }
  );

  if (res.status() === 401) {
    const newToken = await login(request);
    saveCachedToken(newToken);
    return request.get(
      `${base}/api.php/v1/products/${productID}/testcases?page=${page}&limit=${limit}`,
      { headers: authHeaders(newToken) }
    );
  }
  return res;
}

/**
 * 创建单个测试用例。遇 401 自动重登重试。
 * @param {object} payload 完整字段，至少含 { title, type, pri, steps }
 */
async function createTestcase(request, token, productID, payload) {
  const base = getBaseURL(process.env.ZENTAO_URL);
  const url = `${base}/api.php/v1/products/${productID}/testcases`;

  let res = await request.post(url, {
    headers: authHeaders(token),
    data: payload,
  });

  if (res.status() === 401) {
    const newToken = await login(request);
    saveCachedToken(newToken);
    res = await request.post(url, {
      headers: authHeaders(newToken),
      data: payload,
    });
  }
  return res;
}

/**
 * 使用默认字段创建测试用例。
 * 标题由调用方传入，type/pri/steps 用合理默认值。
 * @param {string} title 用例标题
 * @param {object} [overrides] 覆盖默认字段，如 { type:'feature', steps:[{desc,expect}] }
 */
async function createDefaultTestcase(request, token, productID, title, overrides = {}) {
  const payload = {
    title,
    type: 'interface', // 用例类型：接口测试
    pri: 1, // 优先级（必填）
    stage: '【单元测试阶段】', // 测试阶段
    precondition: '', // 前置条件
    steps: `1. 操作步骤\n预期：${title}`, // 用例步骤（字符串形式）
    ...overrides,
  };
  return createTestcase(request, token, productID, payload);
}

/**
 * 获取单个测试用例详情。
 */
async function getTestcase(request, token, caseID) {
  const base = getBaseURL(process.env.ZENTAO_URL);
  const res = await request.get(`${base}/api.php/v1/testcases/${caseID}`, {
    headers: authHeaders(token),
  });

  if (res.status() === 401) {
    const newToken = await login(request);
    saveCachedToken(newToken);
    return request.get(`${base}/api.php/v1/testcases/${caseID}`, {
      headers: authHeaders(newToken),
    });
  }
  return res;
}

/**
 * 删除单个测试用例。
 */
async function deleteTestcase(request, token, caseID) {
  const base = getBaseURL(process.env.ZENTAO_URL);
  const res = await request.delete(`${base}/api.php/v1/testcases/${caseID}`, {
    headers: authHeaders(token),
  });

  if (res.status() === 401) {
    const newToken = await login(request);
    saveCachedToken(newToken);
    return request.delete(`${base}/api.php/v1/testcases/${caseID}`, {
      headers: authHeaders(newToken),
    });
  }
  return res;
}

/**
 * ============ 测试任务（testtask）相关 ============
 *
 * 重要：testtask 的 REST API (/api.php/v1/) 在当前禅道实例上是残缺的
 * （创建返回假 200，关联用例 404）。因此 testtask 走「传统表单接口」
 * （/index.php?m=testtask&f=xxx），鉴权用 session cookie（keepLogin），
 * 与 REST Token 是两套独立体系。
 *
 * 已实测可用：
 * - 登录：GET 登录页 → POST m=user&f=login（keepLogin=on）→ 拿 za/zp cookie
 * - 创建测试单：POST m=testtask&f=create → {"result":"success","id":N}
 * - 删除测试单：GET  m=testtask&f=delete&taskID=N → {"result":"success"}
 *
 * 暂不可用（接口未摸透，需补充真实抓包）：
 * - 关联用例 linkCase：依赖查询上下文 param=myQueryID
 * - 执行用例 runCase：真实 form data 未知
 * - 测试报告 testreport：依赖前序步骤
 *
 * 因为传统接口返回 HTML 而非 JSON，这里统一用 Playwright 的 APIRequestContext
 * 并手动管理 Cookie。Playwright 的 request.newContext() 会自动管理 cookie jar。
 */

/**
 * 传统接口登录，返回一个已建立 session 的 APIRequestContext。
 * 调用方负责在用完后 ctx.dispose()。
 *
 * 流程：
 * 1. GET 登录页（建立 zentaosid）
 * 2. POST m=user&f=login（keepLogin=on）→ 写入 za/zp 持久 cookie
 */
async function loginSession(playwright) {
  const base = getBaseURL(process.env.ZENTAO_URL);
  const ctx = await playwright.request.newContext({
    baseURL: base,
    extraHTTPHeaders: { 'X-Requested-With': 'XMLHttpRequest' },
  });

  // 1. 建立会话
  await ctx.get('/index.php?m=user&f=login');

  // 2. 登录（keepLogin=on 拿持久 cookie）
  const form = new URLSearchParams();
  form.set('account', process.env.ZENTAO_USERNAME);
  form.set('password', process.env.ZENTAO_PASSWORD);
  form.set('passwordStrength', '1');
  form.set('referer', '/zentao/');
  form.set('keepLogin', 'on');

  const loginRes = await ctx.post('/index.php?m=user&f=login', {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    data: form.toString(),
  });

  // 校验：登录成功响应是 <script>self.location='/zentao/'</script>
  const body = await loginRes.text();
  if (!body.includes("self.location='/zentao/'") && !body.includes('self.location="/zentao/"')) {
    await ctx.dispose();
    throw new Error(`传统接口登录失败（未跳转到首页）: ${body.slice(0, 200)}`);
  }

  return ctx;
}

/**
 * 创建测试单（传统接口）。
 * @param {object} ctx  由 loginSession 返回的 APIRequestContext
 * @param {object} payload  表单字段，至少含 { name, product, execution, build }
 * @returns {Promise<{id:number}>}  返回 { result, id }
 *
 * 实测成功响应：{"result":"success","message":"保存成功","id":N}
 */
async function createTesttask(ctx, payload) {
  const form = new URLSearchParams();
  const defaults = {
    product: 1,
    execution: 3,
    build: 1,
    'type[]': 'integrate',
    owner: '',
    'members[]': '',
    begin: new Date().toISOString().slice(0, 10),
    end: new Date().toISOString().slice(0, 10),
    status: 'doing',
    testreport: 0,
    pri: 3,
    desc: '',
  };
  Object.entries({ ...defaults, ...payload }).forEach(([k, v]) => form.set(k, String(v)));
  // uid 是禅道文件上传用的临时标识，这里给个唯一值
  form.set('uid', `api-${Date.now()}`);

  const res = await ctx.post('/index.php?m=testtask&f=create&product=1&zin=1', {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: '/index.php?m=testtask&f=create&product=1',
    },
    data: form.toString(),
  });

  const text = await res.text();
  try {
    const json = JSON.parse(text);
    if (json.result !== 'success') {
      throw new Error(`创建测试单失败: ${json.message || text.slice(0, 200)}`);
    }
    return json;
  } catch (e) {
    if (e.message.includes('创建测试单失败')) throw e;
    throw new Error(`创建测试单响应解析失败: ${text.slice(0, 200)}`);
  }
}

/**
 * 删除测试单（传统接口）。
 */
async function deleteTesttask(ctx, taskID) {
  const res = await ctx.get(`/index.php?m=testtask&f=delete&taskID=${taskID}`);
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    return json;
  } catch {
    return { result: 'unknown', raw: text.slice(0, 200) };
  }
}

module.exports = {
  getBaseURL,
  getProductID,
  login,
  ensureToken,
  createBug,
  createDefaultBug,
  // 测试用例相关（REST API）
  listTestcases,
  createTestcase,
  createDefaultTestcase,
  getTestcase,
  deleteTestcase,
  // 测试任务相关（传统接口，需 session）
  loginSession,
  createTesttask,
  deleteTesttask,
  loadCachedToken,
  saveCachedToken,
  clearCachedToken,
};
