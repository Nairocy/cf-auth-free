# 贡献指南

感谢你愿意改进 `cf-auth-free`。这个项目的取舍很明确，先读完这一页能省掉来回。

## 项目定位（改之前请先认同）

1. **零依赖、零构建**。没有 `package.json`、没有 `node_modules`、没有打包步骤。四个 JS 文件直接 `wrangler deploy`。
   —— 引入任何 npm 依赖、TypeScript 编译链、框架（Hono / React / Drizzle）的 PR 都会被拒绝，**这是本项目的核心卖点，不是技术债**。
2. **必须在 Workers Free 的 10ms CPU 预算内**。任何新增的密码学运算、同步大循环、逐条 `await` 的批量查询都要先算 CPU。
   —— 不要提交把 `PBKDF2_ITER` 提到 OWASP 推荐值（600k）的改动：Free 档直接超时，Paid 用户请自行 fork。
3. **单 Worker、无管理后台**。发码走 `tools/mint-codes.mjs` CLI，不做 web admin。
4. **界面是设计语言的一部分**。方正主义：零圆角、2px 墨边、16px 纸沟、色块配额、无阴影无渐变、无 emoji（功能图标必须手绘 SVG 描边）。
   —— 改成圆角卡片 / 加阴影 / 加渐变 / 塞 emoji 的 PR 会被拒绝。

## 不接受的方向

OAuth / 社交登录、passkey、MFA、组织与角色、多租户、计费对接、管理后台、前端框架重写。
这些不是「还没做」，是**有意不做**（见 README 末尾「已知取舍」）。需要就 fork。

## 提 PR 之前

### 1. 先开 issue 对齐

改动超过 30 行、或涉及 `schema.sql` / 鉴权流程 / 兑换语义的，**先开 issue 说明意图**再动手。
本喵（维护者）会回一个「做 / 不做 / 换个做法」。没对齐就写好的 PR 有可能整段推翻。

### 2. 本地跑通全链路

```bash
npx wrangler d1 execute cf-auth-free --local --file=schema.sql
npx wrangler dev --local --port 8787
```

**用全新的 persist 目录验一遍**（旧库会掩盖缺列问题）：

```bash
npx wrangler dev --local --port 8787 --persist-to /tmp/cf-auth-fresh
```

至少走通：`register/request` → `register/verify` → `me` → `logout` → `login` → `password` → `account`(DELETE)。
涉及订阅的还要走：`mint-codes.mjs` 发码 → `redeem` → `entitlements` → 同一码再兑换（应 409）。

### 3. 改了前端就跑布局验收

通过线是 **0 块裁切 / 0 块重叠 / h2 不断行 / roundedBlocks=0 / 0 控制台异常**，三档全跑：

```bash
PORT=9411 node tools/shots.mjs "http://127.0.0.1:8787/" shots/login
PORT=9412 node tools/shots.mjs "http://127.0.0.1:8787/account" shots/account "na_session=<64hex>"
```

脚本会把 `report.json` 落在输出目录，断言不过会非零退出。

### 4. 别提交这些

- `.wrangler/`（本地 D1 真实数据）
- `codes-*.txt` / 任何明文兑换码
- 截图（除非是 `docs/screenshots/` 下的正式素材）
- 密钥、真实域名、真实 D1 id、Turnstile sitekey

## 代码风格

- ES modules，双引号，分号结尾，2 空格缩进
- 注释写**为什么**，不写**是什么**（代码本身说明是什么）
- 所有用户数据用 `textContent` 注入，**不拼 `innerHTML`**（XSS）
- 新增接口必须同时支持 Bearer 和 cookie 两条通道（`getSession` 已封装）
- 新增限流一律走 `bumpLimit(env, key, limit, windowSec)`，不要自己造计数器
- 错误响应统一 `{ ok: false, error: "中文说明" }`；需要机器判断的再加 `code` 字段

## 提交信息

```
<type>: <一句话说明>

<可选：为什么这么改，踩了什么坑>
```

`type` 用 `feat` / `fix` / `docs` / `refactor` / `perf` / `test` / `chore`。

## 安全问题

**不要开公开 issue**。发邮件给维护者，或走 GitHub 的 Private vulnerability reporting。
涉及：验证码枚举、会话固定、时序泄漏、兑换码并发、限流绕过、XSS。

## License

提交即表示同意以 MIT 授权。
