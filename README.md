# cf-auth-free

**跑在 Cloudflare Workers Free + D1 上的完整账号系统**：邮箱验证码注册、密码登录、账户中心、会话管理、密码找回、销号，外加一套**兑换码订阅**（套餐 / 发码 / 兑换 / 顺延 / 并发占码）。

零依赖、零构建、单 Worker —— 四个 JS 文件，没有 `package.json`，没有 `node_modules`，`wrangler deploy` 直接上线。

- 前端页面自带（登录/注册/找回 + 账户中心），**方正主义**拼版风格：零圆角、2px 墨边、16px 纸沟、色块配额，无阴影无渐变。
- 网页用 Cookie 会话，App 用 `Authorization: Bearer`，同一条 `/api/*` 双通道；还有一次性票据把 App 登录态交给浏览器。
- 全免费额度内可跑：Workers 10 万请求/天、D1 500 万读/10 万写/天、Resend 100 封/天、Turnstile 免费。

> 界面里的 **Nairocy** 是原作者的产品名，仅作示例保留；部署后请自行替换 `src/page.js` / `src/account.js` / `src/index.js` 里的品牌串。

---

## 为什么又造一个

GitHub 上「Cloudflare 邮箱认证」不是空白（`leopoldsw/cloudflare-auth` 41★、`G4brym/authentication-using-d1-example` 77★、`HarlonWang/loginbase`），但它们的组合和本项目不同：

| | 本项目 | 常见同类 |
|---|---|---|
| 构建 | **零依赖零构建**，4 个 JS 文件 | TypeScript + monorepo + CLI 脚手架 |
| 订阅/兑换码 | **内置**（Crockford Base32 + Luhn 校验位、并发占码、顺延语义） | 无 |
| 双通道鉴权 | cookie + Bearer 同端点，含一次性 handoff 票据 | 一般只有一种 |
| Workers Free 调参 | PBKDF2 迭代数按 10ms CPU 预算实测标定 | 多按 OWASP 默认值写，Free 档直接超时 |
| 前端 | 自带完整设计语言的两页 | 多数只有 API 或极简 demo |

**没有的东西**（有意不做）：OAuth/社交登录、passkey、MFA、组织/角色、管理后台、计费对接。

---

## 快速开始

```bash
git clone https://github.com/<you>/cf-auth-free.git
cd cf-auth-free
```

### 1. 建 D1 并填 ID

```bash
npx wrangler d1 create cf-auth-free
```

把输出的 `database_id` 填进 `wrangler.jsonc`，替换 `00000000-0000-0000-0000-000000000000`。

```bash
npx wrangler d1 execute cf-auth-free --remote --file=schema.sql
```

> `schema.sql` 是全量建表脚本，**从零建库即可用**，不需要再跑 `migrations/`。`migrations/` 只给已经按旧版建过库的人补字段用。

### 2. 配密钥

```bash
# 必填：验证码签名 / IP 哈希的 pepper
openssl rand -hex 32 | npx wrangler secret put AUTH_SECRET

# 发信（Resend → API Keys）
npx wrangler secret put RESEND_API_KEY

# 人机校验（Turnstile → 添加站点，拿 secret）
npx wrangler secret put TURNSTILE_SECRET
```

Turnstile 的 **Site Key** 不是 secret，填 `wrangler.jsonc` 的 `vars.TURNSTILE_SITE_KEY`。
不填则页面不挂 widget，后端在 `TURNSTILE_SECRET` 缺省时也跳过校验 —— **仅适合本地开发**。

### 3. 发信域名

在 Resend 添加发信**子域**（如 `send.example.com`），按它给的 MX / SPF / DKIM 记录加到 Cloudflare DNS。

> 用子域而不是根域：根域 MX 通常已被企业邮箱占用，动了就收不到正常邮件。本项目默认 `MAIL_FROM=noreply@send.example.com`。

### 4. 部署

```bash
npx wrangler deploy
```

绑自定义域名：取消 `wrangler.jsonc` 里 `routes` 那段注释，改成你的域名（须已托管在同一 Cloudflare 账号下，自动出证书）。同时把 `vars.APP_ORIGIN` 改成同一个域名 —— **邮件里的链接、竖排域名都取自它**。

### 5. 本地开发

```bash
npx wrangler d1 execute cf-auth-free --local --file=schema.sql
npx wrangler dev --local --port 8787
```

没设 `RESEND_API_KEY` 时验证码打到控制台，并在响应里带 `devCode`（页面会直接显示）。

---

## 接口

### 账号

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/` | 登录页（已登录 302 → `/account`） |
| GET | `/login` | 登录页（**永远**出，供「忘记原密码」跳转） |
| GET | `/account` | 账户中心（未登录 302 → `/`） |
| GET | `/health` | 健康检查 |
| POST | `/api/register/request` | `{email, turnstileToken?}` → 发 6 位验证码 |
| POST | `/api/register/verify` | `{email, code, password}` → 建账号 + 登录 |
| POST | `/api/login` | `{email, password}` → 登录 |
| POST | `/api/logout` | 退出 |
| GET | `/api/me` | 当前账号 |

### 资料 / 头像 / 会话

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/api/profile` | 账号资料 |
| PATCH | `/api/profile` | `{displayName?, preferredName?, preferences?}`（64/64/4000 字） |
| PUT | `/api/profile/avatar` | 原始 JPEG（≤200KB）→ `{avatarVer}` |
| DELETE | `/api/profile/avatar` | 删头像 |
| GET | `/api/avatar/<uid>` | 头像字节，公开（UUID 不可猜），`etag=v<ver>` |
| GET | `/api/sessions` | 会话列表 |
| POST | `/api/sessions/revoke` | `{id?}` 带 id 吊销单条，不带则退出其他所有设备 |
| POST | `/api/session/handoff` | 生成一次性票据 `{url, expiresIn:120}` |
| GET | `/api/session/handoff?t=` | 消费票据：种 cookie + 302 到 `/` |

### 密码 / 销号

| 方法 | 路径 | 作用 |
|---|---|---|
| POST | `/api/password` | `{oldPassword, newPassword}` 改密，踢掉其他会话 |
| POST | `/api/password/reset/request` | `{email}` 发重置码（未注册也回 ok，防枚举） |
| POST | `/api/password/reset/verify` | `{email, code, password}` 重置，踢掉全部会话 |
| DELETE | `/api/account` | `{email, password}` 销号，邮箱须与当前账号一致 |

### 订阅 / 兑换码

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/api/plans` | 公开套餐表 |
| GET | `/api/entitlements` | 当前权益 + 当日额度（需登录） |
| POST | `/api/redeem` | `{plan, code}` 兑换（需登录） |
| GET | `/api/subscription` | 当前套餐 + 最近 20 条兑换记录 |

**鉴权双通道**：`Authorization: Bearer <64hex>` 优先，回退 cookie `na_session`。
`login` / `verify` 的响应体带 `token`，App 直接拿去用，不用处理 Cookie。

---

## 发码

```bash
node tools/mint-codes.mjs --plan pro --count 10 --days 30 --batch 2026-11 --note "客户A" --local
```

生成后**自动回读校验**数量（比对写入前后 `count(*)`），不一致就报错退出。清单落在 `codes-<plan>-<batch>.txt`，**转交完请删掉**。

- 码：20 字符 Crockford Base32（排除 I L O U）+ 1 位 Luhn-mod-32 校验位，展示为 `XXXXX-XXXXX-XXXXX-XXXXX`
- `code_hash = sha256(归一化码)`，不加 pepper（明文 `code` 列已在库里供客服查询，加 pepper 只会让 CLI 与 Worker 必须同步密钥）

**兑换语义**：

- 同套餐未过期 → **顺延**（`expiresAt += days`）
- 跨套餐仍在有效期内 → 拒绝 `409 PLAN_CONFLICT`
- 未知码 / 已用码 / 已撤销 → **对外文案完全一致**（「代码无效或已使用」），仅 `code` 字段不同，防枚举
- 并发靠 `UPDATE ... WHERE code_hash=? AND status='unused'` 的 `meta.changes===1` 占码；订阅写入失败会把码退回 `unused`

---

## ⚠️ Workers Free 的两个硬约束

### 1. CPU 只有 10ms/请求

`PBKDF2_ITER` 默认 **6000**（`wrangler.jsonc` 的 `vars` 里设；代码内兜底 10000）。这是 10ms 预算下的折中，**远低于 OWASP 推荐的 600k**。

实测（R9 8945HX，2026-10）：`10000` 时注册请求 peak 15.2ms 已超 Free 限额，`6000` 时 10.16ms 卡在线上，其中 PBKDF2 本身只占 2–3ms，大头是冷启动。

上线后跑 `npx wrangler tail` 看每次请求的 CPU 时间。频繁超 10ms 或出现 `exceeded CPU time limit` 就降到 4000，或升 Paid（$5/月，CPU 5 分钟）把迭代数提到安全值。

### 2. Resend 免费 100 封/天

注册 = 2 封（验证码 + 欢迎），所以每天约 **50 个新用户**。生产**必须**开 Turnstile，否则一个脚本就能把当天额度打光。

---

## 安全设计

- 验证码只存 `SHA-256(email:code:AUTH_SECRET)`，不存明文；10 分钟过期；最多试 5 次；用后即删
- 请求验证码时，已注册邮箱返回同样的 `{ok:true}` 但不发信（防枚举）
- 登录失败统一提示「邮箱或密码不正确」；未找到用户时不做假哈希（省 CPU，接受轻微时序差异）
- 会话：32 字节随机 token，D1 只存 SHA-256，有效期 **30 天**；Cookie 为 `HttpOnly; SameSite=Lax`，HTTPS 下自动加 `Secure`
- 密码：PBKDF2-HMAC-SHA256，16 字节随机盐，格式 `pbkdf2$iter$salt$hash`，常量时间比较；密码长度 **8–128 位**
- 限流（全部落在 `rate_limits` 表，按小时窗口）：验证码 同 IP 10 / 同邮箱 5；登录 同 IP 20 / 同邮箱 10；重置 同 IP 10 / 同邮箱 5；改密 10；销号 5；兑换 同用户 5 / 同 IP 20
- 头像只收 JPEG（验 `FF D8 FF` 魔数），≤200KB，按账号 UUID 取图
- 销号是**真删**：邮箱 + 密码双确认，服务端删 `users` / `sessions` / `handoff_tickets` / `email_codes` 并清 cookie

---

## 目录

```
src/
  index.js     逻辑 + 路由（单文件，含所有 handler）
  ui.js        皮肤底座：token / 顶栏 / 拼版块 / 齐边操作条 / 图标 SVG
  page.js      登录 / 注册 / 找回（三 tab，12×6 拼版）
  account.js   账户中心（12×11 拼版，8 块）
schema.sql     全量建表
migrations/    增量迁移（只给旧库补字段用）
tools/
  mint-codes.mjs   批量发码 + 回读校验
  shots.mjs        多视口截图 + 布局断言（零依赖，Edge headless + CDP）
  measure.mjs      打印每块宽高，判断留白
wrangler.jsonc 部署配置（D1 绑定 / 环境变量 / 路由）
```

---

## 页面验收

改前端后跑这个，通过线是 **0 块裁切 / 0 块重叠 / h2 不断行 / roundedBlocks=0 / 0 控制台异常**，三档 1280 · 1279 · 390 全跑：

```bash
npx wrangler dev --local --port 8787 &
PORT=9411 node tools/shots.mjs "http://127.0.0.1:8787/" shots/login
PORT=9412 node tools/shots.mjs "http://127.0.0.1:8787/account" shots/account "na_session=<64hex>"
```

`WAIT=<ms>` 可延长首屏等待（默认 1400ms）。`node tools/measure.mjs <url> <cookie>` 打印每块宽高与块内子元素高度，用来判断留白是否过大。

---

## 已知取舍

- Turnstile 脚本不带 SRI：它是 Cloudflare 官方 widget 且随版本更新，硬编码 `integrity` 会失效导致整站挂死
- 未做邮箱变更（只有销号重注册）
- 未做管理后台（发码走 CLI，订阅查询走 `/api/subscription`）
- `usage_daily` 表留给下游消费方写（本项目只建表，不写）

## License

MIT
