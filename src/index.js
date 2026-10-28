/**
 * cf-auth-free
 * 邮箱验证码 + 密码注册/登录，运行在 Cloudflare Workers Free + D1。
 *
 * 环境变量（wrangler secret put）：
 *   AUTH_SECRET      必填，签名/哈希 pepper（openssl rand -hex 32）
 *   RESEND_API_KEY   Resend API key；未设置时邮件只打到 console（dev）
 *   TURNSTILE_SECRET Turnstile secret；未设置时跳过人机校验（dev）
 */

import { renderPage } from "./page.js";
import { renderAccount } from "./account.js";

const enc = new TextEncoder();

const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_MAX_ATTEMPTS = 5;
const SESSION_TTL_S = 30 * 24 * 60 * 60; // 30 天
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;
const HANDOFF_TTL_MS = 2 * 60 * 1000;   // App → 浏览器 登录态交接票据有效期
const NAME_MAX = 64;
const PREFS_MAX = 4000;
const AVATAR_MAX_BYTES = 200 * 1024;

/* ---------------- 套餐 / 订阅常量 ---------------- */

const PLANS = {
  free: { id:"free", name:"Free", priceCents:0,     days:0,  dailyRequests:50,   dailyTokens:200000,
          ranks:["low","high"] },
  pro:  { id:"pro",  name:"Pro",  priceCents:6800,  days:30, dailyRequests:500,  dailyTokens:1500000,
          ranks:["low","high","xhigh","max"] },
  max:  { id:"max",  name:"Max",  priceCents:19800, days:30, dailyRequests:2500, dailyTokens:6000000,
          ranks:["low","high","xhigh","max"] },
};
const PLAN_ORDER = { free: 0, pro: 1, max: 2 };
const REDEEM_DAYS = 30;   // 固定 1 个月，无年付

/* ---------------- 小工具 ---------------- */

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });

const toHex = (buf) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function sha256(text) {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

function randomHex(bytes = 16) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sixDigits() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(a[0] % 1000000).padStart(6, "0");
}

/** 常量时间比较（长度不同直接 false） */
function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function normalizeEmail(raw) {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return null;
  if (!EMAIL_RE.test(email)) return null;
  return email;
}

async function readJson(request, maxBytes = 4096) {
  const len = Number(request.headers.get("content-length") || "0");
  if (len > maxBytes) throw new Error("payload_too_large");
  const text = await request.text();
  if (text.length > maxBytes) throw new Error("payload_too_large");
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

/* ---------------- 密码 ---------------- */

async function hashPassword(password, env) {
  const iter = Math.max(1000, Math.min(100000, Number(env.PBKDF2_ITER || "10000")));
  const salt = randomHex(16);
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const saltBytes = Uint8Array.from(salt.match(/../g).map((h) => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations: iter, hash: "SHA-256" },
    key,
    256
  );
  return `pbkdf2$${iter}$${salt}$${toHex(bits)}`;
}

async function verifyPassword(password, stored, env) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iter = Number(parts[1]);
  const salt = parts[2];
  if (!Number.isFinite(iter) || iter < 1000 || iter > 100000) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const saltBytes = Uint8Array.from(salt.match(/../g).map((h) => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations: iter, hash: "SHA-256" },
    key,
    256
  );
  return timingSafeEqual(toHex(bits), parts[3]);
}

/* ---------------- 限流（D1 固定窗口） ---------------- */

async function bumpLimit(env, key, limit, windowSec) {
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    "SELECT window_start, count FROM rate_limits WHERE key = ?"
  )
    .bind(key)
    .first();

  if (!row || now - row.window_start >= windowSec) {
    await env.DB.prepare(
      "INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1) " +
        "ON CONFLICT(key) DO UPDATE SET window_start = excluded.window_start, count = 1"
    )
      .bind(key, now)
      .run();
    return { ok: true, remaining: limit - 1 };
  }
  if (row.count >= limit) {
    return { ok: false, retryAfter: windowSec - (now - row.window_start) };
  }
  await env.DB.prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ?").bind(key).run();
  return { ok: true, remaining: limit - row.count - 1 };
}

/* ---------------- Turnstile ---------------- */

async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return { ok: true, skipped: true };
  if (!token || typeof token !== "string") return { ok: false };
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
    const d = await r.json();
    return { ok: !!d.success, codes: d["error-codes"] || [] };
  } catch (e) {
    console.error("turnstile_error", e.message);
    return { ok: false };
  }
}

/* ---------------- 邮件（Resend HTTP API） ---------------- */

async function sendMail(env, { to, subject, html, text }) {
  if (!env.RESEND_API_KEY) {
    console.log(`[DEV MAIL] to=${to} subject=${subject}\n${text}`);
    return { ok: true, dev: true };
  }
  const from = env.MAIL_FROM_NAME ? `${env.MAIL_FROM_NAME} <${env.MAIL_FROM}>` : env.MAIL_FROM;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
    });
    if (!r.ok) {
      console.error("resend_error", r.status, await r.text());
      return { ok: false, status: r.status };
    }
    const d = await r.json();
    return { ok: true, id: d.id };
  } catch (e) {
    console.error("resend_exception", e.message);
    return { ok: false };
  }
}

function codeMail(code, origin) {
  const text = [
    `你的验证码是：${code}`,
    "",
    "10 分钟内有效。如果不是你本人操作，请忽略这封邮件。",
    "",
    `— Nairocy  (${origin})`,
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;padding:32px;background:#0b0c0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,'PingFang SC','Microsoft YaHei',sans-serif;color:#e8eaed">
  <div style="max-width:480px;margin:0 auto;background:#14161b;border:1px solid #24272e;border-radius:16px;padding:32px">
    <div style="font-size:13px;letter-spacing:.12em;color:#8b93a1;text-transform:uppercase;margin-bottom:18px">Nairocy</div>
    <div style="font-size:18px;font-weight:600;margin-bottom:8px">验证你的邮箱</div>
    <div style="font-size:14px;color:#9aa0a6;line-height:1.7;margin-bottom:24px">把下面的验证码填回注册页面，10 分钟内有效。</div>
    <div style="font-size:34px;font-weight:700;letter-spacing:.32em;padding:18px 0;text-align:center;background:#0b0c0f;border:1px solid #24272e;border-radius:12px;color:#e8eaed">${code}</div>
    <div style="font-size:12px;color:#6c727c;line-height:1.7;margin-top:24px">如果不是你本人操作，忽略这封邮件即可，不会有账号被创建。</div>
  </div>
</body></html>`;
  return { text, html };
}

function welcomeMail(origin) {
  const text = `账号已创建。\n\n登录地址：${origin}\n\n— Nairocy`;
  const html = `<!doctype html><html><body style="margin:0;padding:32px;background:#0b0c0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,'PingFang SC','Microsoft YaHei',sans-serif;color:#e8eaed">
  <div style="max-width:480px;margin:0 auto;background:#14161b;border:1px solid #24272e;border-radius:16px;padding:32px">
    <div style="font-size:13px;letter-spacing:.12em;color:#8b93a1;text-transform:uppercase;margin-bottom:18px">Nairocy</div>
    <div style="font-size:18px;font-weight:600;margin-bottom:8px">账号已创建</div>
    <div style="font-size:14px;color:#9aa0a6;line-height:1.7">你的邮箱已验证，现在可以登录了。</div>
    <div style="margin-top:24px"><a href="${origin}" style="display:inline-block;padding:12px 20px;background:#e8eaed;color:#0b0c0f;border-radius:10px;text-decoration:none;font-size:14px;font-weight:600">去登录</a></div>
  </div>
</body></html>`;
  return { text, html };
}

/* ---------------- 会话 ---------------- */

const cookieName = "na_session";

function getCookie(request, name) {
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

function sessionCookie(token, maxAge, secure) {
  const parts = [
    `${cookieName}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

async function createSession(env, userId, userAgent = "") {
  const token = randomHex(32);
  const tokenHash = await sha256(token);
  const now = Date.now();
  const exp = now + SESSION_TTL_S * 1000;
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash, user_id, expires_at, created_at, user_agent) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(tokenHash, userId, exp, now, String(userAgent || "").slice(0, 300))
    .run();
  return { token, expiresAt: exp };
}

const BEARER_RE = /^Bearer\s+([0-9a-f]{64})$/i;

/** App 走 `Authorization: Bearer <token>`，网页仍走 cookie。 */
function sessionToken(request) {
  const auth = (request.headers.get("authorization") || "").trim();
  const m = BEARER_RE.exec(auth);
  if (m) return m[1].toLowerCase();
  return getCookie(request, cookieName);
}

/** App 客户端标记（跳过 Turnstile 用）；APP_CLIENT_KEY 未配置时永远 false。 */
function appClientOk(request, env) {
  const expected = env.APP_CLIENT_KEY;
  if (!expected || expected.length < 16) return false;
  return timingSafeEqual(request.headers.get("x-app-key") || "", expected);
}

function userJson(u) {
  return {
    id: u.id,
    email: u.email,
    createdAt: u.createdAt,
    displayName: u.displayName || "",
    preferredName: u.preferredName || "",
    preferences: u.preferences || "",
    avatarVer: u.avatarVer || 0,
  };
}

async function getSession(request, env) {
  const token = sessionToken(request);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(
    "SELECT s.token_hash, s.expires_at, u.id, u.email, u.created_at, u.display_name, u.preferred_name, " +
      "u.preferences, u.avatar_ver FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?"
  )
    .bind(tokenHash)
    .first();
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
    return null;
  }
  return {
    tokenHash,
    id: row.id,
    email: row.email,
    createdAt: row.created_at,
    displayName: row.display_name || "",
    preferredName: row.preferred_name || "",
    preferences: row.preferences || "",
    avatarVer: row.avatar_ver || 0,
  };
}

/* ---------------- 业务处理 ---------------- */

async function handleRequestCode(request, env, ip) {
  const body = await readJson(request);
  if (!body) return json({ ok: false, error: "请求格式不正确" }, 400);

  const email = normalizeEmail(body.email);
  if (!email) return json({ ok: false, error: "邮箱格式不正确" }, 400);

  const isApp = appClientOk(request, env);
  if (!isApp) {
    const tv = await verifyTurnstile(env, body.turnstileToken, ip);
    if (!tv.ok) return json({ ok: false, error: "人机校验未通过，请重试" }, 403);
  }

  const secret = env.AUTH_SECRET || "dev-secret";
  const ipHash = await sha256(`${ip}:${secret}`);
  const scope = isApp ? "app:" : "";

  const ipLimit = await bumpLimit(env, `code:${scope}ip:${ipHash}`, isApp ? 3 : 10, 3600);
  if (!ipLimit.ok) {
    return json({ ok: false, error: "请求过于频繁，请稍后再试" }, 429, {
      "retry-after": String(ipLimit.retryAfter || 600),
    });
  }
  const mailLimit = await bumpLimit(env, `code:${scope}email:${await sha256(email)}`, isApp ? 2 : 5, 3600);
  if (!mailLimit.ok) {
    return json({ ok: false, error: "请求过于频繁，请稍后再试" }, 429, {
      "retry-after": String(mailLimit.retryAfter || 600),
    });
  }

  // 已注册：网页端返回同样的成功响应（防枚举）；App 端要能提示去登录，多带 exists 标记
  const exists = await env.DB.prepare("SELECT 1 AS x FROM users WHERE email = ?").bind(email).first();
  if (exists) return json({ ok: true, ...(isApp ? { exists: true } : {}) });

  const code = sixDigits();
  const codeHash = await sha256(`${email}:${code}:${secret}`);
  const now = Date.now();

  await env.DB.prepare(
    "INSERT INTO email_codes (email, code_hash, expires_at, attempts, sent_at, ip_hash) " +
      "VALUES (?, ?, ?, 0, ?, ?) " +
      "ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash, expires_at=excluded.expires_at, attempts=0, sent_at=excluded.sent_at, ip_hash=excluded.ip_hash"
  )
    .bind(email, codeHash, now + CODE_TTL_MS, now, ipHash)
    .run();

  const origin = env.APP_ORIGIN || "https://id.example.com";
  const mail = codeMail(code, origin);
  const sent = await sendMail(env, {
    to: email,
    subject: `${code} 是你的验证码`,
    ...mail,
  });
  if (!sent.ok) return json({ ok: false, error: "验证码发送失败，请稍后再试" }, 502);

  // dev 模式（没有 RESEND_API_KEY）把 code 带回来，方便本地联调
  return json({ ok: true, ...(sent.dev ? { devCode: code } : {}) });
}

async function handleVerify(request, env, ip, ctx) {
  const body = await readJson(request);
  if (!body) return json({ ok: false, error: "请求格式不正确" }, 400);

  const email = normalizeEmail(body.email);
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email) return json({ ok: false, error: "邮箱格式不正确" }, 400);
  if (!/^\d{6}$/.test(code)) return json({ ok: false, error: "验证码应为 6 位数字" }, 400);
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return json({ ok: false, error: `密码需 ${PASSWORD_MIN}–${PASSWORD_MAX} 位` }, 400);
  }

  const secret = env.AUTH_SECRET || "dev-secret";
  const row = await env.DB.prepare(
    "SELECT code_hash, expires_at, attempts FROM email_codes WHERE email = ?"
  )
    .bind(email)
    .first();

  if (!row) return json({ ok: false, error: "验证码无效或已过期" }, 400);
  if (row.expires_at < Date.now()) {
    await env.DB.prepare("DELETE FROM email_codes WHERE email = ?").bind(email).run();
    return json({ ok: false, error: "验证码已过期，请重新获取" }, 400);
  }
  if (row.attempts >= CODE_MAX_ATTEMPTS) {
    return json({ ok: false, error: "尝试次数过多，请重新获取验证码" }, 429);
  }

  const expected = await sha256(`${email}:${code}:${secret}`);
  if (!timingSafeEqual(expected, row.code_hash)) {
    await env.DB.prepare("UPDATE email_codes SET attempts = attempts + 1 WHERE email = ?")
      .bind(email)
      .run();
    return json({ ok: false, error: "验证码不正确" }, 400);
  }

  const exists = await env.DB.prepare("SELECT 1 AS x FROM users WHERE email = ?").bind(email).first();
  if (exists) return json({ ok: false, error: "该邮箱已注册，请直接登录" }, 409);

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password, env);
  const now = Date.now();

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO users (id, email, password_hash, email_verified, created_at) VALUES (?, ?, ?, 1, ?)"
    ).bind(id, email, passwordHash, now),
    env.DB.prepare("DELETE FROM email_codes WHERE email = ?").bind(email),
  ]);

  const origin = env.APP_ORIGIN || "https://id.example.com";
  const welcome = welcomeMail(origin);
  const sendWelcome = sendMail(env, { to: email, subject: "账号已创建", ...welcome });
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(sendWelcome);

  const session = await createSession(env, id, request.headers.get("user-agent") || "");
  const secure = new URL(request.url).protocol === "https:";
  return json(
    {
      ok: true,
      token: session.token,
      user: userJson({
        id,
        email,
        createdAt: now,
        displayName: "",
        preferredName: "",
        preferences: "",
        avatarVer: 0,
      }),
    },
    200,
    { "set-cookie": sessionCookie(session.token, SESSION_TTL_S, secure) }
  );
}

async function handleLogin(request, env, ip) {
  const body = await readJson(request);
  if (!body) return json({ ok: false, error: "请求格式不正确" }, 400);

  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) return json({ ok: false, error: "邮箱或密码不正确" }, 400);

  const secret = env.AUTH_SECRET || "dev-secret";
  const ipHash = await sha256(`${ip}:${secret}`);

  const ipLimit = await bumpLimit(env, `login:ip:${ipHash}`, 20, 3600);
  const mailLimit = await bumpLimit(env, `login:email:${await sha256(email)}`, 10, 3600);
  if (!ipLimit.ok || !mailLimit.ok) {
    return json({ ok: false, error: "尝试过于频繁，请稍后再试" }, 429);
  }

  const user = await env.DB.prepare(
    "SELECT id, email, password_hash, created_at, display_name, preferred_name, preferences, avatar_ver " +
      "FROM users WHERE email = ?"
  )
    .bind(email)
    .first();
  if (!user) return json({ ok: false, error: "邮箱或密码不正确" }, 401);

  const ok = await verifyPassword(password, user.password_hash, env);
  if (!ok) return json({ ok: false, error: "邮箱或密码不正确" }, 401);

  const session = await createSession(env, user.id, request.headers.get("user-agent") || "");
  const secure = new URL(request.url).protocol === "https:";
  return json(
    {
      ok: true,
      token: session.token,
      user: userJson({
        id: user.id,
        email: user.email,
        createdAt: user.created_at,
        displayName: user.display_name,
        preferredName: user.preferred_name,
        preferences: user.preferences,
        avatarVer: user.avatar_ver,
      }),
    },
    200,
    { "set-cookie": sessionCookie(session.token, SESSION_TTL_S, secure) }
  );
}

async function handleLogout(request, env) {
  const token = getCookie(request, cookieName);
  if (token) {
    const tokenHash = await sha256(token);
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
  }
  const secure = new URL(request.url).protocol === "https:";
  return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0, secure) });
}

async function handleMe(request, env) {
  const s = await getSession(request, env);
  if (!s) return json({ ok: false, error: "未登录" }, 401);
  return json({ ok: true, user: userJson(s) });
}

/* ---------------- 资料 / 头像 ---------------- */

/** 返回 trim 后的字符串；非字符串 → null；超长 → { tooLong: true }。 */
function cleanText(v, max) {
  if (v === null || v === undefined) return "";
  if (typeof v !== "string") return null;
  const t = v.replace(/\r\n/g, "\n").trim();
  if (t.length > max) return { tooLong: true };
  return t;
}

async function handleProfilePatch(request, env) {
  const s = await getSession(request, env);
  if (!s) return json({ ok: false, error: "未登录" }, 401);

  const body = await readJson(request, 16 * 1024);
  if (!body) return json({ ok: false, error: "请求格式不正确" }, 400);

  const sets = [];
  const binds = [];
  for (const [key, col, max] of [
    ["displayName", "display_name", NAME_MAX],
    ["preferredName", "preferred_name", NAME_MAX],
    ["preferences", "preferences", PREFS_MAX],
  ]) {
    if (!(key in body)) continue;
    const v = cleanText(body[key], max);
    if (v === null) return json({ ok: false, error: `${key} 必须是字符串` }, 400);
    if (typeof v === "object" && v.tooLong) {
      return json({ ok: false, error: `${key} 超出长度上限（${max} 字）` }, 400);
    }
    sets.push(`${col} = ?`);
    binds.push(v);
  }
  if (!sets.length) return json({ ok: false, error: "没有要更新的字段" }, 400);

  sets.push("updated_at = ?");
  binds.push(Date.now());
  binds.push(s.id);
  await env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();

  const fresh = await getSession(request, env);
  return json({ ok: true, user: userJson(fresh || s) });
}

function bytesToBase64(bytes) {
  let out = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(out);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function handleAvatarPut(request, env) {
  const s = await getSession(request, env);
  if (!s) return json({ ok: false, error: "未登录" }, 401);

  const buf = await request.arrayBuffer();
  if (!buf || buf.byteLength === 0) return json({ ok: false, error: "没有图片数据" }, 400);
  if (buf.byteLength > AVATAR_MAX_BYTES) {
    return json({ ok: false, error: "图片过大（上限 200KB）" }, 413);
  }
  const head = new Uint8Array(buf.slice(0, 3));
  if (!(head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff)) {
    return json({ ok: false, error: "只接受 JPEG" }, 415);
  }

  const ver = (s.avatarVer || 0) + 1;
  await env.DB.prepare("UPDATE users SET avatar_b64 = ?, avatar_ver = ?, updated_at = ? WHERE id = ?")
    .bind(bytesToBase64(new Uint8Array(buf)), ver, Date.now(), s.id)
    .run();
  return json({ ok: true, avatarVer: ver });
}

async function handleAvatarDelete(request, env) {
  const s = await getSession(request, env);
  if (!s) return json({ ok: false, error: "未登录" }, 401);
  const ver = (s.avatarVer || 0) + 1;
  await env.DB.prepare("UPDATE users SET avatar_b64 = NULL, avatar_ver = ?, updated_at = ? WHERE id = ?")
    .bind(ver, Date.now(), s.id)
    .run();
  return json({ ok: true, avatarVer: ver });
}

/** 头像读取：按 uuid 公开（URL 不可猜），带 ETag 让客户端能便宜地重取。 */
async function handleAvatarGet(url, env) {
  const id = url.pathname.slice("/api/avatar/".length).trim();
  if (!/^[0-9a-fA-F-]{8,64}$/.test(id)) return new Response("not found", { status: 404 });
  const row = await env.DB.prepare("SELECT avatar_b64, avatar_ver FROM users WHERE id = ?").bind(id).first();
  if (!row || !row.avatar_b64) return new Response("not found", { status: 404 });
  return new Response(base64ToBytes(row.avatar_b64), {
    headers: {
      "content-type": "image/jpeg",
      "cache-control": "public, max-age=600",
      etag: `"v${row.avatar_ver || 0}"`,
    },
  });
}

/* ---------------- App → 浏览器 登录态交接 ---------------- */

async function handleHandoffCreate(request, env) {
  const s = await getSession(request, env);
  if (!s) return json({ ok: false, error: "未登录" }, 401);

  const ticket = randomHex(24); // 48 hex
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO handoff_tickets (code_hash, user_id, expires_at, used_at) VALUES (?, ?, ?, NULL)"
  )
    .bind(await sha256(ticket), s.id, now + HANDOFF_TTL_MS)
    .run();

  const origin = env.APP_ORIGIN || "https://id.example.com";
  return json({
    ok: true,
    url: `${origin}/api/session/handoff?t=${ticket}`,
    expiresIn: Math.floor(HANDOFF_TTL_MS / 1000),
  });
}

async function handleHandoffConsume(url, request, env) {
  const t = url.searchParams.get("t") || "";
  const fail = (msg, status) =>
    new Response(msg, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
  if (!/^[0-9a-f]{48}$/.test(t)) return fail("链接无效", 400);

  const hash = await sha256(t);
  const row = await env.DB.prepare(
    "SELECT user_id, expires_at, used_at FROM handoff_tickets WHERE code_hash = ?"
  )
    .bind(hash)
    .first();
  if (!row || row.used_at || row.expires_at < Date.now()) {
    return fail("链接已失效，请回到 App 重新发起", 410);
  }

  await env.DB.prepare("UPDATE handoff_tickets SET used_at = ? WHERE code_hash = ?")
    .bind(Date.now(), hash)
    .run();

  const session = await createSession(env, row.user_id, request.headers.get("user-agent") || "");
  const secure = url.protocol === "https:";
  const origin = env.APP_ORIGIN || "https://id.example.com";
  return new Response(null, {
    status: 302,
    headers: {
      location: `${origin}/account`,
      "set-cookie": sessionCookie(session.token, SESSION_TTL_S, secure),
      "cache-control": "no-store",
    },
  });
}

/* ---------------- 改密 / 重置 / 会话 / 销号 ---------------- */

async function handlePasswordChange(request, env) {
  const s = await getSession(request, env);
  if (!s) return json({ ok: false, error: "未登录" }, 401);

  const body = await readJson(request);
  if (!body) return json({ ok: false, error: "请求格式不正确" }, 400);
  const oldPassword = typeof body.oldPassword === "string" ? body.oldPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

  const lim = await bumpLimit(env, `pwd:${await sha256(s.id)}`, 10, 3600);
  if (!lim.ok) return json({ ok: false, error: "尝试过于频繁，请稍后再试" }, 429);

  if (newPassword.length < PASSWORD_MIN || newPassword.length > PASSWORD_MAX) {
    return json({ ok: false, error: `新密码需 ${PASSWORD_MIN}–${PASSWORD_MAX} 位` }, 400);
  }
  const user = await env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(s.id).first();
  if (!user) return json({ ok: false, error: "账号不存在" }, 404);
  if (!(await verifyPassword(oldPassword, user.password_hash, env))) {
    return json({ ok: false, error: "原密码不正确" }, 400);
  }

  const hash = await hashPassword(newPassword, env);
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
      .bind(hash, Date.now(), s.id),
    // 其他设备上的会话一律失效，当前这条保留
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?")
      .bind(s.id, s.tokenHash),
  ]);
  return json({ ok: true });
}

function resetMail(code, origin) {
  const text = [
    `你的密码重置验证码是：${code}`,
    "",
    "10 分钟内有效。如果不是你本人操作，请忽略这封邮件，你的密码不会被改动。",
    "",
    `— Nairocy  (${origin})`,
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;padding:32px;background:#F4F1EA;font-family:'Inter','Segoe UI','PingFang SC','Microsoft YaHei',system-ui,sans-serif;color:#2B2B2B">
  <div style="max-width:480px;margin:0 auto;background:#EFE9DD;border:2px solid #2B2B2B;padding:32px">
    <div style="font:10px/1 ui-monospace,Consolas,monospace;letter-spacing:.18em;color:#6f6a60;text-transform:uppercase;margin-bottom:18px">Nairocy / 统一账号</div>
    <div style="font-size:20px;font-weight:800;margin-bottom:8px">重置密码</div>
    <div style="font-size:13.5px;color:#5c574e;line-height:1.8;margin-bottom:24px">把下面的验证码填回网页，10 分钟内有效。</div>
    <div style="font:700 32px/1 ui-monospace,Consolas,monospace;letter-spacing:.3em;padding:18px 0;text-align:center;background:#F4F1EA;border:1px solid rgba(43,43,43,.22);color:#2B2B2B">${code}</div>
    <div style="font-size:12px;color:#6f6a60;line-height:1.8;margin-top:24px;border-top:1px solid rgba(43,43,43,.22);padding-top:12px">不是你本人操作？忽略这封邮件即可，密码不会被改动。</div>
  </div>
</body></html>`;
  return { text, html };
}

async function handleResetRequest(request, env, ip) {
  const body = await readJson(request);
  if (!body) return json({ ok: false, error: "请求格式不正确" }, 400);
  const email = normalizeEmail(body.email);
  if (!email) return json({ ok: false, error: "邮箱格式不正确" }, 400);

  const tv = await verifyTurnstile(env, body.turnstileToken, ip);
  if (!tv.ok) return json({ ok: false, error: "人机校验未通过，请重试" }, 403);

  const secret = env.AUTH_SECRET || "dev-secret";
  const ipHash = await sha256(`${ip}:${secret}`);
  const ipLimit = await bumpLimit(env, `reset:ip:${ipHash}`, 10, 3600);
  if (!ipLimit.ok) return json({ ok: false, error: "请求过于频繁，请稍后再试" }, 429, {
    "retry-after": String(ipLimit.retryAfter || 600),
  });
  const mailLimit = await bumpLimit(env, `reset:email:${await sha256(email)}`, 5, 3600);
  if (!mailLimit.ok) return json({ ok: false, error: "请求过于频繁，请稍后再试" }, 429, {
    "retry-after": String(mailLimit.retryAfter || 600),
  });

  // 未注册邮箱也返回成功（防枚举），只是不发信
  const user = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (!user) return json({ ok: true });

  const code = sixDigits();
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO email_codes (email, code_hash, expires_at, attempts, sent_at, ip_hash) " +
      "VALUES (?, ?, ?, 0, ?, ?) " +
      "ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash, expires_at=excluded.expires_at, attempts=0, sent_at=excluded.sent_at, ip_hash=excluded.ip_hash"
  )
    .bind(email, await sha256(`${email}:${code}:${secret}`), now + CODE_TTL_MS, now, ipHash)
    .run();

  const origin = env.APP_ORIGIN || "https://id.example.com";
  const sent = await sendMail(env, {
    to: email,
    subject: `${code} 是你的密码重置验证码`,
    ...resetMail(code, origin),
  });
  if (!sent.ok) return json({ ok: false, error: "验证码发送失败，请稍后再试" }, 502);
  return json({ ok: true, ...(sent.dev ? { devCode: code } : {}) });
}

async function handleResetVerify(request, env) {
  const body = await readJson(request);
  if (!body) return json({ ok: false, error: "请求格式不正确" }, 400);

  const email = normalizeEmail(body.email);
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email) return json({ ok: false, error: "邮箱格式不正确" }, 400);
  if (!/^\d{6}$/.test(code)) return json({ ok: false, error: "验证码应为 6 位数字" }, 400);
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return json({ ok: false, error: `密码需 ${PASSWORD_MIN}–${PASSWORD_MAX} 位` }, 400);
  }

  const secret = env.AUTH_SECRET || "dev-secret";
  const row = await env.DB.prepare(
    "SELECT code_hash, expires_at, attempts FROM email_codes WHERE email = ?"
  )
    .bind(email)
    .first();
  if (!row) return json({ ok: false, error: "验证码无效或已过期" }, 400);
  if (row.expires_at < Date.now()) {
    await env.DB.prepare("DELETE FROM email_codes WHERE email = ?").bind(email).run();
    return json({ ok: false, error: "验证码已过期，请重新获取" }, 400);
  }
  if (row.attempts >= CODE_MAX_ATTEMPTS) {
    return json({ ok: false, error: "尝试次数过多，请重新获取验证码" }, 429);
  }
  const expected = await sha256(`${email}:${code}:${secret}`);
  if (!timingSafeEqual(expected, row.code_hash)) {
    await env.DB.prepare("UPDATE email_codes SET attempts = attempts + 1 WHERE email = ?")
      .bind(email)
      .run();
    return json({ ok: false, error: "验证码不正确" }, 400);
  }

  const user = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (!user) return json({ ok: false, error: "验证码无效或已过期" }, 400);

  const hash = await hashPassword(password, env);
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
      .bind(hash, Date.now(), user.id),
    env.DB.prepare("DELETE FROM email_codes WHERE email = ?").bind(email),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
  ]);
  return json({ ok: true });
}

async function handleSessionsList(request, env) {
  const s = await getSession(request, env);
  if (!s) return json({ ok: false, error: "未登录" }, 401);
  const rows = await env.DB.prepare(
    "SELECT token_hash, created_at, expires_at, user_agent FROM sessions " +
      "WHERE user_id = ? ORDER BY created_at DESC LIMIT 50"
  )
    .bind(s.id)
    .all();
  const list = (rows.results || []).map((r) => ({
    id: String(r.token_hash).slice(0, 12),
    current: r.token_hash === s.tokenHash,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    ua: r.user_agent || "",
  }));
  return json({ ok: true, sessions: list });
}

async function handleSessionsRevoke(request, env) {
  const s = await getSession(request, env);
  if (!s) return json({ ok: false, error: "未登录" }, 401);

  let body = null;
  try {
    body = await readJson(request);
  } catch (e) {
    body = null;
  }
  const id = body && typeof body.id === "string" ? body.id.trim().toLowerCase() : "";
  if (id && !/^[0-9a-f]{8,12}$/.test(id)) {
    return json({ ok: false, error: "会话标识不正确" }, 400);
  }
  if (id) {
    await env.DB.prepare(
      "DELETE FROM sessions WHERE user_id = ? AND token_hash LIKE ? AND token_hash <> ?"
    )
      .bind(s.id, `${id}%`, s.tokenHash)
      .run();
  } else {
    // 没有 id = 退出其他所有设备
    await env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?")
      .bind(s.id, s.tokenHash)
      .run();
  }
  return json({ ok: true });
}

async function handleAccountDelete(request, env) {
  const s = await getSession(request, env);
  if (!s) return json({ ok: false, error: "未登录" }, 401);

  const body = await readJson(request);
  if (!body) return json({ ok: false, error: "请求格式不正确" }, 400);
  const password = typeof body.password === "string" ? body.password : "";
  const confirmEmail = normalizeEmail(body.email);
  if (confirmEmail !== s.email) return json({ ok: false, error: "确认邮箱与当前账号不一致" }, 400);

  const lim = await bumpLimit(env, `del:${await sha256(s.id)}`, 5, 3600);
  if (!lim.ok) return json({ ok: false, error: "尝试过于频繁，请稍后再试" }, 429);

  const user = await env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(s.id).first();
  if (!user || !(await verifyPassword(password, user.password_hash, env))) {
    return json({ ok: false, error: "密码不正确" }, 400);
  }

  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(s.id),
    env.DB.prepare("DELETE FROM handoff_tickets WHERE user_id = ?").bind(s.id),
    env.DB.prepare("DELETE FROM email_codes WHERE email = ?").bind(s.email),
    env.DB.prepare("DELETE FROM users WHERE id = ?").bind(s.id),
  ]);

  const secure = new URL(request.url).protocol === "https:";
  return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0, secure) });
}

/* ---------------- 订阅 / 兑换码 ---------------- */

/* 码字母表：Crockford Base32（32 字符，已排除 I L O U，避免与 1 / 0 / V 混淆） */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LEN = 20;      // 19 位随机 + 1 位 Luhn mod 32 校验位
const CODE_GROUP = 5;     // 展示为 4 组 × 5：XXXXX-XXXXX-XXXXX-XXXXX
const CODE_RE = /^[0-9A-HJ-KM-NP-TV-Z]{20}$/;
/* 未知码 / 已用码 / 已撤销码对外文案必须完全一致（只靠状态码和 code 字段区分），防枚举 */
const CODE_INVALID_MSG = "代码无效或已使用";

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000; // Asia/Shanghai = UTC+8，无夏令时
const DAY_MS = 24 * 60 * 60 * 1000;

/** 去干扰字符并大写：I/L → 1，O → 0，U → V（返回 20 位纯字母表串，失败时长度对不上） */
function normalizeCode(s) {
  if (typeof s !== "string") return "";
  return s
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/I/g, "1")
    .replace(/L/g, "1")
    .replace(/O/g, "0")
    .replace(/U/g, "V");
}

/**
 * 标准 Luhn mod N（N = 32）：从右往左，权重 2 / 1 交替；
 * 加倍后按 Math.floor(t/32) + (t%32) 折算，返回 0..31 的校验位索引。
 */
function luhnMod32Check(payload) {
  let sum = 0;
  let double = true; // 最右一位（载荷最后一位）先加倍，因为校验位追加在它右边
  for (let i = payload.length - 1; i >= 0; i--) {
    let v = CROCKFORD.indexOf(payload[i]);
    if (v < 0) return -1;
    if (double) {
      v *= 2;
      v = Math.floor(v / 32) + (v % 32);
    }
    sum += v;
    double = !double;
  }
  return (32 - (sum % 32)) % 32;
}

/** 重算 20 位码的校验位并比对 */
function verifyCheckChar(code20) {
  if (typeof code20 !== "string" || code20.length !== CODE_LEN) return false;
  const expect = luhnMod32Check(code20.slice(0, CODE_LEN - 1));
  return expect >= 0 && expect === CROCKFORD.indexOf(code20[CODE_LEN - 1]);
}

/** 20 位 → XXXXX-XXXXX-XXXXX-XXXXX */
function formatCode(body20) {
  const parts = [];
  for (let i = 0; i < body20.length; i += CODE_GROUP) parts.push(body20.slice(i, i + CODE_GROUP));
  return parts.join("-");
}

/** 生成一个展示用码（带横线）。与 tools/mint-codes.mjs 的实现必须保持一致。 */
function generateCode() {
  const buf = new Uint8Array(64);
  let payload = "";
  // 拒绝采样：只接受 0..31 的字节（> 31 重抽），保证 32 个字符严格等概率
  while (payload.length < CODE_LEN - 1) {
    crypto.getRandomValues(buf);
    for (let i = 0; i < buf.length && payload.length < CODE_LEN - 1; i++) {
      if (buf[i] > 31) continue;
      payload += CROCKFORD[buf[i]];
    }
  }
  return formatCode(payload + CROCKFORD[luhnMod32Check(payload)]);
}

/**
 * 码哈希 = sha256(规范化后的 20 位串)，**不加 pepper**。
 * 理由：redeem_codes 本来就为后台查询存了明文 `code` 列，能读表的人已经能直接拿到码，
 * 加 pepper 不增加任何实际安全性；反而要求本机发码 CLI 和 Worker 的密钥手工同步，
 * 多一个「码全部失效」的故障点。故有意只用纯哈希。
 */
async function codeHash(normalized) {
  return sha256(normalized);
}

/** UTC+8 的 YYYY-MM-DD */
function shanghaiDay(ms = Date.now()) {
  return new Date(ms + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);
}

/** 下一个 UTC+8 00:00 的毫秒时间戳（配额重置点） */
function shanghaiNextMidnight(ms = Date.now()) {
  const shifted = ms + SHANGHAI_OFFSET_MS;
  return Math.floor(shifted / DAY_MS) * DAY_MS + DAY_MS - SHANGHAI_OFFSET_MS;
}

/**
 * 读订阅：无记录 → free / none；撤销 → free / revoked；过期 → free / expired；
 * 有效 → 该套餐 / active。plan 始终是「当前真正可用的套餐」。
 */
async function loadEntitlement(env, userId) {
  const now = Date.now();
  const row = await env.DB.prepare(
    "SELECT plan, status, started_at, expires_at FROM subscriptions WHERE user_id = ?"
  )
    .bind(userId)
    .first();

  let plan = "free";
  let status = "none";
  let expiresAt = 0;
  if (row) {
    expiresAt = Number(row.expires_at) || 0;
    if (row.status === "revoked") {
      status = "revoked";
    } else if (expiresAt <= now) {
      status = "expired";
    } else if (PLANS[row.plan] && row.plan !== "free") {
      plan = row.plan;
      status = "active";
    } else {
      status = "active";
    }
  }
  return { plan, status, expiresAt, row: row || null };
}

/** 当日配额快照（usage_daily 可能没有当天行 → used = 0） */
async function loadQuota(env, userId, planId) {
  const day = shanghaiDay();
  const row = await env.DB.prepare(
    "SELECT requests FROM usage_daily WHERE user_id = ? AND day = ?"
  )
    .bind(userId, day)
    .first();
  const used = row ? Number(row.requests) || 0 : 0;
  const limit = (PLANS[planId] || PLANS.free).dailyRequests;
  return { limit, used, remaining: Math.max(0, limit - used), resetAt: shanghaiNextMidnight(), day };
}

const PLAN_FEATURES = {
  free: ["每日 50 次请求", "适合日常使用与短任务", "基础思考强度", "标准响应速度"],
  pro: ["包含 Free 全部功能", "每日 500 次请求", "解锁全部思考强度档位", "优先响应"],
  max: ["包含 Pro 全部功能", "每日 2500 次请求（Pro 的 5 倍）", "解锁全部思考强度档位", "优先响应"],
};

/** GET /api/plans —— 公开套餐表（价格单位：分） */
async function handlePlans(env) {
  const plans = Object.keys(PLANS)
    .sort((a, b) => PLAN_ORDER[a] - PLAN_ORDER[b])
    .map((id) => {
      const p = PLANS[id];
      return {
        id: p.id,
        name: p.name,
        priceCents: p.priceCents,
        currency: "CNY",
        period: "month",
        days: p.days,
        dailyRequests: p.dailyRequests,
        dailyTokens: p.dailyTokens,
        ranks: p.ranks,
        features: PLAN_FEATURES[id] || [],
      };
    });
  return json({ ok: true, plans });
}

/** GET /api/entitlements —— 当前套餐 + 当日配额 */
async function handleEntitlements(request, env) {
  const s = await getSession(request, env);
  if (!s) return json({ ok: false, error: "未登录" }, 401);

  const ent = await loadEntitlement(env, s.id);
  const quota = await loadQuota(env, s.id, ent.plan);
  return json({
    ok: true,
    plan: ent.plan,
    expiresAt: ent.expiresAt,
    status: ent.status,
    ranks: PLANS[ent.plan].ranks,
    quota,
  });
}

/** POST /api/redeem —— 兑换码换订阅（顺序即错误码优先级，勿随意调整） */
async function handleRedeem(request, env, ip) {
  const s = await getSession(request, env);
  if (!s) return json({ ok: false, error: "未登录" }, 401);

  const body = await readJson(request);
  if (!body) return json({ ok: false, error: "请求格式不正确" }, 400);

  const plan = typeof body.plan === "string" ? body.plan.trim().toLowerCase() : "";
  if (plan !== "pro" && plan !== "max") {
    return json({ ok: false, code: "BAD_PLAN", error: "套餐参数不正确" }, 400);
  }

  // 1) 限流：同一用户 5 次/小时，同一 IP 20 次/小时（取不到 IP 时只按用户限流）
  const uLim = await bumpLimit(env, "redeem:u:" + s.id, 5, 3600);
  const ipLim = ip ? await bumpLimit(env, "redeem:ip:" + ip, 20, 3600) : { ok: true };
  if (!uLim.ok || !ipLim.ok) {
    return json({ ok: false, code: "RATE_LIMITED", error: "尝试过于频繁，请稍后再试" }, 429);
  }

  // 2) 规范化 + 位数 / 非法字符
  const code = normalizeCode(body.code);
  if (code.length !== CODE_LEN || !CODE_RE.test(code)) {
    return json({ ok: false, code: "BAD_FORMAT", error: "代码格式不正确" }, 400);
  }
  // 3) 校验位
  if (!verifyCheckChar(code)) {
    return json({ ok: false, code: "BAD_FORMAT", error: "代码格式不正确" }, 400);
  }

  // 4) 查码（未知码的文案与已用码完全一致）
  const hash = await codeHash(code);
  const row = await env.DB.prepare(
    "SELECT code_hash, plan, days, status, user_id FROM redeem_codes WHERE code_hash = ?"
  )
    .bind(hash)
    .first();
  if (!row) return json({ ok: false, code: "CODE_INVALID", error: CODE_INVALID_MSG }, 404);

  // 5) 已用 / 已撤销
  if (row.status !== "unused") {
    return json({ ok: false, code: "CODE_INVALID", error: CODE_INVALID_MSG }, 409);
  }

  // 6) 码的套餐与当前入口不一致
  if (row.plan !== plan) {
    return json(
      {
        ok: false,
        code: "PLAN_MISMATCH",
        error: `这是 ${String(row.plan).toUpperCase()} 代码，请在对应套餐处兑换`,
      },
      409
    );
  }

  const now = Date.now();
  const cur = await env.DB.prepare(
    "SELECT plan, status, started_at, expires_at FROM subscriptions WHERE user_id = ?"
  )
    .bind(s.id)
    .first();
  const curActive = !!cur && cur.status === "active" && Number(cur.expires_at) > now;

  // 7) 另一个套餐仍在有效期内 → 不允许互相叠加
  if (curActive && cur.plan !== row.plan) {
    return json(
      {
        ok: false,
        code: "PLAN_CONFLICT",
        error: `当前 ${PLANS[cur.plan]?.name || cur.plan} 套餐生效中（至 ${shanghaiDay(Number(cur.expires_at))}），请在到期后兑换`,
      },
      409
    );
  }

  // 8) 同套餐未过期 → 顺延；否则从现在起算
  const extended = curActive && cur.plan === row.plan;
  const days = Number(row.days) > 0 ? Number(row.days) : REDEEM_DAYS;
  const newExpires = (extended ? Number(cur.expires_at) : now) + days * DAY_MS;
  const startedAt = extended ? Number(cur.started_at) || now : now;

  // 9) 原子占码：必须靠 meta.changes 防并发，成功后不许再回滚成 unused（下面单独处理）
  const take = await env.DB.prepare(
    "UPDATE redeem_codes SET status = 'used', user_id = ?, used_at = ? " +
      "WHERE code_hash = ? AND status = 'unused'"
  )
    .bind(s.id, now, hash)
    .run();
  if (!take.meta || take.meta.changes !== 1) {
    return json({ ok: false, code: "CODE_INVALID", error: CODE_INVALID_MSG }, 409);
  }

  // 10) 订阅 upsert + 兑换流水（同一 batch）
  const ipHash = ip ? await sha256("redeem:ip:" + ip) : null;
  try {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO subscriptions (user_id, plan, status, started_at, expires_at, updated_at) " +
          "VALUES (?, ?, 'active', ?, ?, ?) " +
          "ON CONFLICT(user_id) DO UPDATE SET plan = excluded.plan, status = 'active', " +
          "started_at = excluded.started_at, expires_at = excluded.expires_at, updated_at = excluded.updated_at"
      ).bind(s.id, row.plan, startedAt, newExpires, now),
      env.DB.prepare(
        "INSERT INTO redeem_logs (id, user_id, code_hash, plan, days, before_expires, after_expires, ip_hash, created_at) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        randomHex(16),
        s.id,
        hash,
        row.plan,
        days,
        cur ? Number(cur.expires_at) : null,
        newExpires,
        ipHash,
        now
      ),
    ]);
  } catch (e) {
    // 订阅落库失败 → 把码退回未使用，避免用户的码被白白吃掉
    await env.DB.prepare(
      "UPDATE redeem_codes SET status = 'unused', user_id = NULL, used_at = NULL " +
        "WHERE code_hash = ? AND user_id = ?"
    )
      .bind(hash, s.id)
      .run();
    throw e;
  }

  // 11) 返回
  return json({ ok: true, plan: row.plan, expiresAt: newExpires, days, extended });
}

/** GET /api/subscription —— 当前套餐 + 最近 20 条兑换记录 */
async function handleSubscription(request, env) {
  const s = await getSession(request, env);
  if (!s) return json({ ok: false, error: "未登录" }, 401);

  const ent = await loadEntitlement(env, s.id);
  const rows = await env.DB.prepare(
    "SELECT plan, days, created_at FROM redeem_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 20"
  )
    .bind(s.id)
    .all();
  const history = (rows.results || []).map((r) => ({
    plan: r.plan,
    days: Number(r.days) || 0,
    at: Number(r.created_at) || 0,
    kind: "redeem",
  }));
  return json({ ok: true, plan: ent.plan, expiresAt: ent.expiresAt, status: ent.status, history });
}

/* ---------------- 入口 ---------------- */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const ip = request.headers.get("cf-connecting-ip") || "";

    try {
      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        // 已登录直接进账户中心（登录页只服务未登录）
        if (await getSession(request, env)) {
          return new Response(null, { status: 302, headers: { location: "/account", "cache-control": "no-store" } });
        }
        return new Response(renderPage({ siteKey: env.TURNSTILE_SITE_KEY || "", origin: env.APP_ORIGIN || "https://id.example.com" }), {
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
        });
      }
      if (request.method === "GET" && url.pathname === "/login") {
        // 永远出登录页（即使已登录）——账户中心里的「忘记原密码」走这里
        return new Response(renderPage({ siteKey: env.TURNSTILE_SITE_KEY || "", origin: env.APP_ORIGIN || "https://id.example.com" }), {
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
        });
      }
      if (request.method === "GET" && url.pathname === "/account") {
        if (!(await getSession(request, env))) {
          return new Response(null, { status: 302, headers: { location: "/", "cache-control": "no-store" } });
        }
        return new Response(renderAccount({ origin: env.APP_ORIGIN || "https://id.example.com" }), {
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
        });
      }
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, service: "cf-auth-free" });
      }
      if (request.method === "POST" && url.pathname === "/api/register/request") {
        return await handleRequestCode(request, env, ip);
      }
      if (request.method === "POST" && url.pathname === "/api/register/verify") {
        return await handleVerify(request, env, ip, ctx);
      }
      if (request.method === "POST" && url.pathname === "/api/login") {
        return await handleLogin(request, env, ip);
      }
      if (request.method === "POST" && url.pathname === "/api/logout") {
        return await handleLogout(request, env);
      }
      if (request.method === "GET" && url.pathname === "/api/me") {
        return await handleMe(request, env);
      }
      if (url.pathname === "/api/profile") {
        if (request.method === "GET") return await handleMe(request, env);
        if (request.method === "PATCH") return await handleProfilePatch(request, env);
      }
      if (url.pathname === "/api/profile/avatar") {
        if (request.method === "PUT") return await handleAvatarPut(request, env);
        if (request.method === "DELETE") return await handleAvatarDelete(request, env);
      }
      if (request.method === "GET" && url.pathname.startsWith("/api/avatar/")) {
        return await handleAvatarGet(url, env);
      }
      if (url.pathname === "/api/session/handoff") {
        if (request.method === "POST") return await handleHandoffCreate(request, env);
        if (request.method === "GET") return await handleHandoffConsume(url, request, env);
      }
      if (request.method === "POST" && url.pathname === "/api/password") {
        return await handlePasswordChange(request, env);
      }
      if (request.method === "POST" && url.pathname === "/api/password/reset/request") {
        return await handleResetRequest(request, env, ip);
      }
      if (request.method === "POST" && url.pathname === "/api/password/reset/verify") {
        return await handleResetVerify(request, env);
      }
      if (request.method === "GET" && url.pathname === "/api/sessions") {
        return await handleSessionsList(request, env);
      }
      if (request.method === "POST" && url.pathname === "/api/sessions/revoke") {
        return await handleSessionsRevoke(request, env);
      }
      if (request.method === "DELETE" && url.pathname === "/api/account") {
        return await handleAccountDelete(request, env);
      }
      if (url.pathname === "/api/plans") {
        if (request.method === "GET") return await handlePlans(env);
      }
      if (url.pathname === "/api/entitlements") {
        if (request.method === "GET") return await handleEntitlements(request, env);
      }
      if (url.pathname === "/api/redeem") {
        if (request.method === "POST") return await handleRedeem(request, env, ip);
      }
      if (url.pathname === "/api/subscription") {
        if (request.method === "GET") return await handleSubscription(request, env);
      }
      return json({ ok: false, error: "接口不存在" }, 404);
    } catch (e) {
      if (e && e.message === "payload_too_large") {
        return json({ ok: false, error: "请求体过大" }, 413);
      }
      console.error("unhandled", e && e.stack ? e.stack : String(e));
      return json({ ok: false, error: "服务器错误" }, 500);
    }
  },
};
