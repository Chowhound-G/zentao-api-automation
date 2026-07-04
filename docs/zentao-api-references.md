# 禅道 API 参考文档

本项目 API 自动化实现所参考的禅道（Zentao）RESTful API 官方文档。

## 参考链接

1. **禅道 RESTful API 配置与常见问题**
   - 包含 API 版本要求、Token 使用示例、常见问题排查
   - https://www.zentao.net/book/api/1397.html

2. **禅道获取 Token 接口文档**
   - 登录接口 `POST /api.php/v1/tokens` 的详细说明
   - https://www.zentao.net/book/api/post-users-login-2142.html

3. **禅道报告单个 Bug 接口（英文）**
   - 创建 Bug 接口 `POST /api.php/v1/products/{productId}/bugs` 的字段说明
   - https://www.zentao.pm/book/zentao-secondary-development/1010.html

## 本项目实际验证结论

> ⚠️ 以下结论来自实际接口测试，与部分文档描述存在差异，以实际为准。

| 项目 | 文档/常见写法 | 实测正确值 |
|------|--------------|-----------|
| 鉴权头格式 | `Authorization: Token xxx` | **`Token: xxx`**（独立头，非 Authorization） |
| 创建 Bug 必填字段 | title | **title + pri + severity + type** 全部必填 |
| `pri` 类型 | 字符串 | 数字（如 `1`） |
| `severity` 类型 | 字符串 | 数字（如 `3`） |
| `type` 取值 | — | 字符串，如 `"codeerror"` |
| `openedBuild` | — | 数组，主干为 `["trunk"]` |
| 登录成功状态码 | 200 | **201** |
| 创建 Bug 成功状态码 | 200 | **201** |
