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

module.exports = {
  getBaseURL,
  getProductID,
  login,
  ensureToken,
  createBug,
  createDefaultBug,
  loadCachedToken,
  saveCachedToken,
  clearCachedToken,
};
