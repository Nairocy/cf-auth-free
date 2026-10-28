# 请先读完 CONTRIBUTING.md

## 硬性红线（违反直接关闭，不解释）

1. **不允许引入 npm 依赖或构建步骤**。没有 `package.json`、没有 `node_modules`、没有 TS 编译、没有 Hono/React/Drizzle。
   零依赖零构建是这个项目的核心卖点。
2. **不允许把 `PBKDF2_ITER` 提到 OWASP 推荐值**。Workers Free 只有 10ms CPU，600k 迭代会直接超时。
3. **不允许改动方正主义设计语言**：零圆角、2px 墨边、16px 纸沟、色块配额、无阴影无渐变、无 emoji（功能图标必须手绘 SVG 描边）。
4. **不允许提交 `.wrangler/`、明文兑换码、密钥、真实域名 / D1 id / Turnstile sitekey**。
5. **不允许把用户数据拼进 `innerHTML`**。一律 `textContent`。

## 提交前自检

- [ ] 改动超过 30 行，或涉及 `schema.sql` / 鉴权流程 / 兑换语义 → 已先开 issue 对齐
- [ ] 用**全新 persist 目录**跑通了受影响的接口（旧库会掩盖缺列问题）
- [ ] 改了前端 → 跑了 `tools/shots.mjs`，三档 1280 / 1279 / 390 全过（0 裁切 / 0 重叠 / 0 控制台异常）
- [ ] 新增接口同时支持 Bearer 与 cookie 两条通道
- [ ] 新增限流走 `bumpLimit(...)`，没自造计数器
- [ ] 提交信息符合 `feat:` / `fix:` / `docs:` 约定

## 不接受的方向

OAuth / 社交登录、passkey、MFA、组织与角色、多租户、计费对接、管理后台、前端框架重写。
这些是**有意不做**（见 README「已知取舍」）。需要就 fork。

安全问题**不要**开公开 PR 或 issue，走 Private vulnerability reporting。
