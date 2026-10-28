---
name: Bug report
about: 报告一个可复现的问题
title: ''
labels: bug
assignees: ''
---

## 环境

- 部署方式：`wrangler dev --local` / 线上 Workers
- `wrangler` 版本：（`npx wrangler --version`）
- Node 版本：（`node -v`）
- Workers 套餐：Free / Paid
- 浏览器与版本（涉及前端时）：
- 自定义域名 / `workers.dev` 子域：

## 复现步骤

1.
2.
3.

## 期望结果

## 实际结果

<!-- 贴出完整响应体或错误信息。注意脱敏：不要贴 AUTH_SECRET、RESEND_API_KEY、TURNSTILE_SECRET、会话 token、真实用户邮箱。 -->

```
（粘贴这里）
```

## 已排查

- [ ] `schema.sql` 已完整执行（不是只跑了部分 `migrations/`）
- [ ] `AUTH_SECRET` / `RESEND_API_KEY` / `TURNSTILE_SECRET` 都已 `wrangler secret put`
- [ ] 跑过 `npx wrangler tail` 并看过 `cpuTime` / 异常堆栈
- [ ] 用全新 persist 目录复现过（排除旧库干扰）

## 补充

<!-- 截图请放在这里；前端问题请说明视口宽度。 -->
