/**
 * 将 web-wenxuan（元气购电商平台）自动化测试发现的 6 个真实缺陷提交到禅道。
 *
 * 数据来源：Playwright E2E 测试（frontend/tests/specs/）跑通真实联调环境时发现，
 * 每个缺陷均经过源码核对 + 真实 HTTP 请求复现，附精确的重现步骤、预期/实际结果。
 *
 * 运行：
 *   cd playwright-learning
 *   npx playwright test tests/submit-wenxuan-bugs.spec.js
 */
require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { ensureToken, createBug, getProductID } = require('../src/api/zentaoClient');

/**
 * 6 个缺陷定义。
 * severity: 1=致命 2=严重 3=一般 4=轻微
 * pri: 1=最高 ... 4=最低
 * type: codeerror(代码错误) / interface(界面优化) / config(配置相关) / security(安全相关)
 */
const BUGS = [
  {
    title: '[元气购] 商品评价接口要求登录，导致游客无法查看商品详情页（401 全局跳转登录页）',
    severity: 1,
    pri: 1,
    type: 'codeerror',
    steps: `<h3>缺陷描述</h3>
<p>商品评价接口 <code>GET /v1/reviews?productId=&lt;id&gt;</code> 要求登录认证，游客访问返回 <strong>401 UNAUTHORIZED</strong>。
该 401 触发前端 api.ts 拦截器的全局 <code>app:unauthorized</code> 事件，main.ts 监听后执行 <code>auth.logout() + router.push('/login')</code>，
导致 <strong>游客访问任意商品详情页时被强制跳转到登录页，无法查看商品</strong>。</p>

<h3>环境影响</h3>
<p>前端：frontend/src/views/ProductDetailView.vue（onMounted 并发请求商品详情 + reviews）<br/>
后端：back/ ReviewController 的 @GetMapping 应允许游客访问</p>

<h3>前置条件</h3>
<p>1. 未登录的游客浏览器<br/>
2. 前端 dev server 运行在 http://localhost:5173<br/>
3. 后端运行在 http://localhost:8080/api，商品 id=1 存在</p>

<h3>重现步骤</h3>
<p>1. 清空浏览器 localStorage（确保未登录）<br/>
2. 访问商品详情页：<code>http://localhost:5173/products/1</code><br/>
3. 观察：页面会请求 <code>GET /api/v1/products/1</code>（成功 200）和 <code>GET /api/v1/reviews?productId=1</code>（失败 401）</p>

<h3>预期结果</h3>
<p>游客应能正常浏览商品详情页，商品信息正常展示，评价列表展示已有评价（电商网站的常见行为：商品与评价对游客可见）。</p>

<h3>实际结果</h3>
<p>reviews 接口返回 401 → 触发全局跳转 → 页面被重定向到 <code>/login</code>，游客<strong>完全无法查看任何商品详情</strong>。</p>

<h3>复现请求（curl）</h3>
<p><code>curl -i "http://localhost:8080/api/v1/reviews?productId=1"</code><br/>
返回：<code>HTTP 401 {"error":{"code":"UNAUTHORIZED","message":"未登录或令牌失效"}}</code></p>

<h3>影响面</h3>
<p>阻塞级：游客（未登录用户）无法浏览任何商品详情，严重影响购物转化。所有依赖商品详情页的 E2E 测试因 401 跳转而失败。</p>`,
  },
  {
    title: '[元气购] 下单接口 POST /v1/orders/checkout 缺少幂等头，重复提交会产生重复订单',
    severity: 2,
    pri: 2,
    type: 'codeerror',
    steps: `<h3>缺陷描述</h3>
<p>结算下单接口 <code>POST /v1/orders/checkout</code> 未携带 <code>Idempotency-Key</code> 幂等头。
前端代码库 <code>src/lib/api.ts</code> 已提供 <code>withIdempotency()</code> 工具函数（生成 UUID 作为幂等键），
但 <code>CheckoutView.vue</code> 的 <code>submit()</code> 方法提交时<strong>未调用该函数</strong>。</p>

<h3>环境影响</h3>
<p>前端：frontend/src/views/CheckoutView.vue 第 194 行：<br/>
<code>const res = await api.post('/v1/orders/checkout', { addressId: 0, couponCode })</code> —— 缺少 headers 幂等键<br/>
对比：src/lib/api.ts 第 26 行已定义 <code>withIdempotency()</code> 但未被下单流程使用</p>

<h3>前置条件</h3>
<p>1. 已登录用户，购物车有商品<br/>
2. 进入结算页 /checkout，选择了地址</p>

<h3>重现步骤</h3>
<p>1. 在结算页点击"提交订单并支付"按钮<br/>
2. 快速连续点击多次（或网络抖动下用户重复点击/刷新重提）<br/>
3. 抓包观察：每次点击都发出一个 POST /v1/orders/checkout 请求，且各请求<strong>无 Idempotency-Key 头</strong></p>

<h3>预期结果</h3>
<p>下单接口应支持幂等：相同 Idempotency-Key 的重复请求只创建一个订单，避免重复扣库存、重复占用优惠券、重复生成待支付订单。</p>

<h3>实际结果</h3>
<p>每次提交都生成新订单。前端虽有 <code>submitting</code> 标志位防抖（按钮 disabled），但<strong>不能覆盖所有场景</strong>：网络超时重试、用户刷新页面后重提、多标签页同时下单等都会产生重复订单。</p>

<h3>修复建议</h3>
<p>在 CheckoutView.vue 的 submit 中加入幂等头：<br/>
<code>const res = await api.post('/v1/orders/checkout', {...}, { headers: withIdempotency() })</code><br/>
并确保后端按 Idempotency-Key 做去重。</p>`,
  },
  {
    title: '[元气购] 注册页"两次输入的密码不一致"提示文案永远不会显示（dead code）',
    severity: 3,
    pri: 3,
    type: 'codeerror',
    steps: `<h3>缺陷描述</h3>
<p>注册页（RegisterView.vue）的"两次输入的密码不一致"错误提示文案在正常用户交互路径下<strong>永远不会出现</strong>，
属于无效的死代码。</p>

<h3>根因</h3>
<p>1. 提交按钮的 <code>canSubmit</code> computed 包含 <code>confirmOk</code> 条件：<br/>
<code>canSubmit = !submitting && agree && accountOk && codeOk && passwordOk && confirmOk</code><br/>
2. 当两次密码不一致时，<code>confirmOk = false</code> → <code>canSubmit = false</code> → 提交按钮 <code>:disabled="!canSubmit"</code> 直接禁用<br/>
3. 因此 submit() 函数内的 <code>if (!confirmOk.value) throw new Error('两次输入的密码不一致')</code> 这一行<strong>永远无法被点击触发</strong></p>

<h3>环境影响</h3>
<p>前端：frontend/src/views/RegisterView.vue<br/>
- 第 91 行：submit 内 <code>if (!confirmOk.value) throw new Error('两次输入的密码不一致')</code><br/>
- 第 58 行：canSubmit 含 confirmOk</p>

<h3>前置条件</h3>
<p>访问注册页 http://localhost:5173/register</p>

<h3>重现步骤</h3>
<p>1. 切换到"邮箱"注册方式<br/>
2. 填写合法邮箱<br/>
3. 填写验证码<br/>
4. 密码输入：123456<br/>
5. 确认密码输入：123457（与上一步不一致）<br/>
6. 观察"注册并登录"按钮状态</p>

<h3>预期结果</h3>
<p>应该向用户明确提示"两次输入的密码不一致"，帮助用户定位错误（电商注册场景的常见 UX）。</p>

<h3>实际结果</h3>
<p>提交按钮直接变成 disabled（灰色不可点），但<strong>没有任何文字提示告诉用户为什么不能提交</strong>。用户不知道是密码不一致、还是别的字段有问题，体验差。submit 里的提示文案成了 dead code。</p>

<h3>修复建议</h3>
<p>方案一（推荐）：在确认密码框下方增加实时校验提示 <code>&lt;div v-if="!confirmOk"&gt;两次输入的密码不一致&lt;/div&gt;</code><br/>
方案二：移除 canSubmit 中的 confirmOk，让按钮可点，依赖 submit 内的 throw 提示（但不推荐，体验不如实时校验）</p>`,
  },
  {
    title: '[元气购] 管理员后台登录密码错误时跳转到普通用户登录页，错误提示不显示',
    severity: 3,
    pri: 3,
    type: 'codeerror',
    steps: `<h3>缺陷描述</h3>
<p>管理员后台登录页（/admin/login）密码错误时，<strong>不会停留在管理员登录页显示错误提示</strong>，
而是被全局 401 拦截器跳转到普通用户登录页（/login），导致用户困惑。</p>

<h3>根因</h3>
<p>1. AdminLoginView.vue 的 submit 调用 <code>adminAuth.login(account, password)</code><br/>
2. adminAuth.login 跳过本地账号校验（account === 'admin'）后，调用后端 <code>POST /v1/auth/login</code><br/>
3. 密码错误时后端返回 HTTP 401<br/>
4. api.ts 拦截器捕获 401，dispatch <code>app:unauthorized</code> 全局事件<br/>
5. main.ts 监听该事件，执行 <code>auth.logout() + router.push({ name: 'login' })</code> —— 跳转到<strong>普通用户</strong>登录页<br/>
6. AdminLoginView 的 catch 块设置的 <code>errorText</code>（"管理员账号或密码错误"）虽然执行了，但页面已被跳走，用户看不到</p>

<h3>环境影响</h3>
<p>前端：<br/>
- src/views/AdminLoginView.vue（错误提示 .error[role=alert]）<br/>
- src/lib/api.ts 第 49 行（401 触发全局事件）<br/>
- src/main.ts 第 15-21 行（全局监听跳转）</p>

<h3>前置条件</h3>
<p>访问管理员登录页 http://localhost:5173/admin/login</p>

<h3>重现步骤</h3>
<p>1. 访问 /admin/login<br/>
2. 账号输入：admin<br/>
3. 密码输入：wrong123（任意错误的 6 位以上密码）<br/>
4. 点击"进入管理后台"</p>

<h3>预期结果</h3>
<p>停留在 /admin/login 页面，显示错误提示"管理员账号或密码错误"，让用户知道是密码错了。</p>

<h3>实际结果</h3>
<p>页面跳转到 <code>/login?redirect=/admin/login</code>（普通用户登录页），并弹出"请先登录后再进行操作"的 toast。用户会困惑：我明明在登录管理员后台，为什么跳到了普通用户登录页？是不是进错地方了？</p>

<h3>复现请求</h3>
<p><code>curl -i -X POST "http://localhost:8080/api/v1/auth/login" -H "Content-Type: application/json" -d '{"account":"admin","password":"wrong123"}'</code><br/>
返回：<code>HTTP 401 {"error":{"code":"UNAUTHORIZED","message":"用户不存在或密码错误"}}</code></p>

<h3>修复建议</h3>
<p>api.ts 的全局 401 处理应排除"当前已在登录/adminLogin 页面"的情况；或 adminAuth.login 用独立请求（不走全局 401 拦截），自行 catch 并显示错误。</p>`,
  },
  {
    title: '[元气购] 下单接口未传递真实收货地址，addressId 恒为 0',
    severity: 2,
    pri: 2,
    type: 'codeerror',
    steps: `<h3>缺陷描述</h3>
<p>结算下单时，前端 <code>POST /v1/orders/checkout</code> 的请求体中 <code>addressId</code> 被<strong>硬编码为 0</strong>，
用户在结算页选择的收货地址（收货人/手机号/地区/详细地址）从未传递给后端。</p>

<h3>根因</h3>
<p>CheckoutView.vue 第 194 行：<br/>
<code>const res = await api.post('/v1/orders/checkout', { addressId: 0, couponCode })</code><br/>
addressId 写死为 0。虽然第 175-182 行把选中的地址存入了 orderDraft store，但<strong>没有传给后端</strong>。</p>

<h3>环境影响</h3>
<p>前端：frontend/src/views/CheckoutView.vue 第 194 行</p>

<h3>前置条件</h3>
<p>已登录用户，购物车有商品，进入结算页</p>

<h3>重现步骤</h3>
<p>1. 登录后进入 /checkout<br/>
2. 选择或新增一个收货地址（如：张三 / 13800000000 / 北京市朝阳区 / XX路XX号）<br/>
3. 点击"提交订单并支付"<br/>
4. 抓包查看 POST /v1/orders/checkout 的请求体</p>

<h3>预期结果</h3>
<p>请求体应包含真实的收货地址信息（addressId 或完整地址字段），后端据此生成订单的收货信息。</p>

<h3>实际结果</h3>
<p>请求体始终是 <code>{"addressId":0,"couponCode":""}</code>，<strong>收货地址完全丢失</strong>。后端无法知道商品发往哪里，
这意味着：<br/>
- 订单详情页的收货信息可能为空或错误<br/>
- 仓库无法发货<br/>
- 整个电商闭环的"物流配送"环节断裂</p>

<h3>影响面</h3>
<p>严重：影响所有真实订单的发货流程。当前测试环境因数据 mock 未暴露此问题，但生产环境必然出问题。</p>`,
  },
  {
    title: '[元气购] 售后申请与评价提交无文件上传 UI，接口字段 evidence/images 始终为空',
    severity: 4,
    pri: 4,
    type: 'interface',
    steps: `<h3>缺陷描述</h3>
<p>售后申请（AftersaleApplyView）和评价发布（ReviewCreateView）页面<strong>缺少文件/图片上传 UI 入口</strong>，
但对应的接口字段 <code>evidence</code>（售后凭证）和 <code>images</code>（评价图片）在提交时被硬编码为空数组，
功能不完整。</p>

<h3>根因</h3>
<p>1. 售后：AftersaleApplyView.vue 提交时未传 evidence 字段（或传空数组），UI 上无任何上传按钮/区域<br/>
2. 评价：ReviewCreateView.vue 提交时 images 字段传空数组，UI 上无图片上传入口<br/>
3. 后端接口已支持 evidence（JSON string）/ images（JSON string）字段，但前端从不填充</p>

<h3>环境影响</h3>
<p>前端：<br/>
- src/views/AftersaleApplyView.vue（售后申请）<br/>
- src/views/ReviewCreateView.vue（评价发布）<br/>
- src/stores/aftersales.ts（POST /v1/aftersales/apply 的 evidence 字段）<br/>
- src/stores/reviews.ts（POST /v1/reviews 的 images 字段）</p>

<h3>前置条件</h3>
<p>已登录用户，有已完成（Completed）的订单</p>

<h3>重现步骤</h3>
<p><strong>售后申请：</strong><br/>
1. 从订单详情进入 /aftersales/apply?orderId=1&orderItemId=1<br/>
2. 观察页面：有售后类型（仅退款/退货退款）、数量、原因输入框<br/>
3. <strong>找不到任何"上传凭证/图片"的按钮或区域</strong></p>

<p><strong>评价发布：</strong><br/>
1. 从订单详情进入 /reviews/create?orderId=1&productId=1<br/>
2. 观察页面：有星级评分、文字内容输入框<br/>
3. <strong>找不到任何"上传图片/添加照片"的按钮或区域</strong></p>

<h3>预期结果</h3>
<p>售后申请应支持上传问题凭证（商品损坏照片、物流单等）；评价应支持上传买家秀图片——这是电商平台的标配功能，且接口字段已预留。</p>

<h3>实际结果</h3>
<p>两个页面都没有上传 UI，evidence/images 始终为空。售后审核人员看不到凭证无法判断，评价页缺少图片影响其他买家决策。</p>

<h3>修复建议</h3>
<p>在两个页面增加文件上传组件（&lt;input type="file"&gt; 或封装的 UiUpload），上传后把返回的 URL 数组序列化为 JSON 填入 evidence/images 字段提交。</p>`,
  },
];

test.describe('提交 web-wenxuan 测试发现的缺陷到禅道', () => {
  for (const bug of BUGS) {
    test(`提交：${bug.title.slice(0, 30)}...`, async ({ request }) => {
      const token = await ensureToken(request);
      const productID = getProductID(process.env.ZENTAO_URL);

      const payload = {
        title: bug.title,
        pri: bug.pri,
        severity: bug.severity,
        type: bug.type,
        openedBuild: ['trunk'],
        steps: bug.steps,
      };

      const res = await createBug(request, token, productID, payload);
      // 禅道创建成功通常返回 200 或 201，body 含 id
      expect([200, 201]).toContain(res.status());
      const body = await res.json();
      expect(body.id).toBeTruthy();
      // eslint-disable-next-line no-console
      console.log(`✅ 已提交 Bug #${body.id}: ${bug.title.slice(0, 40)}`);
    });
  }
});