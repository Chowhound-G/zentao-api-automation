# zentao-api-automation

用 API 自动化在 [禅道 / Zentao](https://www.zentao.net/) 中创建 Bug，替代传统 UI 自动化（点页面、填表单、等渲染）。

由 Playwright UI 自动化改造而来，保留了原 UI 用例作对比。

## 为什么从 UI 改成 API

| | UI 自动化 | API 自动化（本项目） |
|---|---|---|
| 速度 | 启动浏览器 + 渲染 + 等待元素，单条约 10-30s | 纯 HTTP 请求，单条约 1-2s |
| 稳定性 | 受页面改版、加载时序影响 | 接口契约稳定 |
| 适用场景 | 验证前端交互 | 批量造数据、回归提 Bug |

## 工作流程

```
登录 POST /api.php/v1/tokens  ──►  拿到 token  ──►  写入 .token 缓存
                                                         │
                                                         ▼
创建 Bug POST /api.php/v1/products/{id}/bugs  ◄──  带 Token 头请求
                  │                                      │
                  └─────  遇 401 自动重登并重试  ◄────────┘
```

支持两类对象：

- **Bug**：创建缺陷（`createBug` / `createDefaultBug`）
- **测试用例 testcase**：增/查/删（`listTestcases` / `createDefaultTestcase` / `getTestcase` / `deleteTestcase`）

> ⏳ **执行用例（testtask）暂未实现**：禅道执行用例必须通过测试单（testtask）体系，且 testtask 依赖"版本 build"，而当前测试环境无创建 build 的权限。后续权限到位再补。

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制模板并填入禅道账号信息：

```bash
cp .env.example .env
```

```ini
ZENTAO_USERNAME=你的禅道账号
ZENTAO_PASSWORD=你的禅道密码
ZENTAO_URL=https://your-host/zentao/index.php?m=user&f=login&referer=Lw==
```

> `ZENTAO_URL` 只需粘贴禅道登录页完整地址即可，`base URL` 与 `productID` 会自动从中提取。

### 3. 运行

```bash
# Bug 相关
npx playwright test bug-api           # 单个 Bug 创建
npx playwright test submit-wenxuan-bugs   # 批量提交缺陷

# 测试用例相关
npx playwright test testcase-api      # 用例增/查/删
```

首次运行会在项目根目录生成 `.token` 文件缓存登录态，后续请求复用，避免重复登录。该文件已被 `.gitignore` 忽略。

## 项目结构

```
src/
├── api/
│   └── zentaoClient.ts          # API 客户端：登录 / token 缓存 / 创建 Bug / 401 重试
└── pages/                       # 原 UI 自动化的页面对象（Page Object）
    ├── LoginPage.ts             #   保留作对比
    └── BugPage.ts
tests/
├── bug-api.spec.ts              # Bug API 用例：ensureToken → createDefaultBug
├── testcase-api.spec.js         # 测试用例 API：增/查/删
├── bug.spec.ts                  # 原 UI 用例（保留）
├── submit-wenxuan-bugs.spec.js  # 批量提交缺陷到禅道（数据驱动）
└── example.spec.ts
docs/
└── zentao-api-references.md     # 禅道 API 文档链接 + 实测差异对照表
```

## 核心 API：`zentaoClient`

| 方法 | 说明 |
|------|------|
| `ensureToken(request)` | 读缓存或登录，返回 token |
| **Bug** | |
| `createBug(request, token, productID, payload)` | 创建 Bug，遇 401 自动重登重试 |
| `createDefaultBug(request, token, productID, title)` | 用合理默认字段创建 Bug |
| **测试用例 testcase** | |
| `listTestcases(request, token, productID, options)` | 查询产品下的用例列表（含分页） |
| `createTestcase(request, token, productID, payload)` | 创建用例，遇 401 自动重登重试 |
| `createDefaultTestcase(request, token, productID, title, overrides?)` | 用默认字段创建用例（可覆盖字段） |
| `getTestcase(request, token, caseID)` | 获取用例详情 |
| `deleteTestcase(request, token, caseID)` | 删除用例 |
| **通用** | |
| `getBaseURL(envURL)` | 从 `ZENTAO_URL` 提取 base，如 `https://host/zentao` |
| `getProductID(envURL)` | 从 URL 的 base64 `referer` 解析 productID，默认 `1` |

## 实测发现的禅道 API 关键点

> ⚠️ 这些与部分文档描述存在差异，以实测为准。详见 [docs/zentao-api-references.md](docs/zentao-api-references.md)。

| 项目 | 常见写法（错误） | 实测正确值 |
|------|------------------|-----------|
| 鉴权头 | `Authorization: Token xxx` | **`Token: xxx`**（独立头） |
| 创建 Bug 必填字段 | title | **title + pri + severity + type** 全部必填 |
| `pri` / `severity` | 字符串 | 数字 |
| Bug `type` 取值 | — | 字符串，如 `"codeerror"` |
| Bug 成功状态码 | 200 | **201** |
| 创建用例必填字段 | title | **title + type + pri + steps** |
| 用例 `type` 取值 | — | `"interface"`（接口）/ `"feature"`（功能）等 |
| 用例 `steps` | — | 字符串或 `[{desc, expect}]` 数组均可 |
| 用例创建成功状态码 | 201 | **200**（注意与 Bug 不同） |
| 用例 id 格式 | 列表返回 `case_300` | 创建/删除用数字 `300` |

## 安全说明

- `.env`、`.env copy`、`.token` 均已被 `.gitignore` 忽略，凭据不会进入版本库
- `.gitignore` 用 `.env*` 通配忽略所有环境文件变体，仅保留 `.env.example` 模板

## 技术栈

- [Playwright](https://playwright.dev/) — 使用其 `request` fixture 发送 API 请求，不启动浏览器
- [dotenv](https://github.com/motdotla/dotenv) — 加载环境变量
- Node.js CommonJS
