#!/usr/bin/env node
/**
 * tools/mint-codes.mjs —— 批量生成兑换码并写入 D1（cf-auth-free）
 *
 * 用法：
 *   node tools/mint-codes.mjs --plan pro --count 10 [--days 30] [--batch 2026-11] \
 *                             [--note "客户A"] [--local] [--out 文件名]
 *
 * 行为：
 *   1. 本地生成 count 个码（与 src/index.js 的 generateCode 完全同一算法）
 *   2. 拼成一个 SQL 文件写到系统临时目录，一次性交给 wrangler d1 execute
 *   3. 打印码清单并写 codes-<plan>-<batch|日期>.txt
 *   4. 回读校验：插入前后各数一次该 batch 的行数，差值必须等于 count，否则退出码 1
 *
 * 注意：默认写远端库（--remote）。加 --local 只写本机 .wrangler 的本地 D1。
 * 无第三方依赖，Node 18+。
 */

import { createHash, randomBytes } from "node:crypto";
import { writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

/* ------------------------------------------------------------------ *
 * 码的编码：必须与 src/index.js 的 CROCKFORD / luhnMod32Check /
 * generateCode 保持一致（改了这边就要同步改 Worker，反之亦然）
 * ------------------------------------------------------------------ */

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // 32 字符，排除 I L O U
const CODE_LEN = 20; // 19 位随机 + 1 位 Luhn mod 32 校验位
const CODE_GROUP = 5;

function luhnMod32Check(payload) {
  let sum = 0;
  let double = true; // 载荷最右一位先加倍（校验位追加在它右边）
  for (let i = payload.length - 1; i >= 0; i--) {
    let v = CROCKFORD.indexOf(payload[i]);
    if (v < 0) throw new Error(`非法字符 ${payload[i]}（不在 Crockford 字母表内）`);
    if (double) {
      v *= 2;
      v = Math.floor(v / 32) + (v % 32);
    }
    sum += v;
    double = !double;
  }
  return (32 - (sum % 32)) % 32;
}

function formatCode(body20) {
  const parts = [];
  for (let i = 0; i < body20.length; i += CODE_GROUP) parts.push(body20.slice(i, i + CODE_GROUP));
  return parts.join("-");
}

function generateCode() {
  let payload = "";
  // 拒绝采样：只接受 0..31 的字节（> 31 丢弃），保证 32 个字符严格等概率
  while (payload.length < CODE_LEN - 1) {
    const buf = randomBytes(64);
    for (const b of buf) {
      if (payload.length >= CODE_LEN - 1) break;
      if (b > 31) continue;
      payload += CROCKFORD[b];
    }
  }
  return formatCode(payload + CROCKFORD[luhnMod32Check(payload)]);
}

/** 与 Worker 一致：sha256(规范化后的 20 位串)，不加 pepper */
function codeHash(normalized) {
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

/** 后台展示用掩码：保留首尾各 5 位，中间打码 */
function maskOf(displayCode) {
  return `${displayCode.slice(0, 5)}-*****-*****-${displayCode.slice(-5)}`;
}

/* ------------------------------------------------------------------ *
 * 参数
 * ------------------------------------------------------------------ */

function usage(msg) {
  if (msg) console.error("错误：" + msg);
  console.error(`
用法：node tools/mint-codes.mjs --plan <pro|max> [--count 10] [--days 30]
                             [--batch 2026-11] [--note "客户A"]
                             [--local] [--out codes.txt]

  --plan   必填，pro | max
  --count  生成数量，默认 10
  --days   每码天数，默认 30
  --batch  批次号，默认当天日期（YYYY-MM-DD）
  --note   备注，写进 redeem_codes.note
  --local  写本地 D1（默认 --remote）
  --out    码清单输出文件名/路径，默认 codes-<plan>-<batch>.txt
`);
  process.exit(2);
}

function parseArgs(argv) {
  const out = {
    plan: "",
    count: 10,
    days: 30,
    batch: "",
    note: null,
    local: false,
    out: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) usage(`${a} 缺少取值`);
      return v;
    };
    switch (a) {
      case "--plan":
        out.plan = String(next()).toLowerCase();
        break;
      case "--count":
        out.count = Number(next());
        break;
      case "--days":
        out.days = Number(next());
        break;
      case "--batch":
        out.batch = String(next());
        break;
      case "--note":
        out.note = String(next());
        break;
      case "--local":
        out.local = true;
        break;
      case "--out":
        out.out = String(next());
        break;
      case "-h":
      case "--help":
        usage();
        break;
      default:
        usage(`未知参数 ${a}`);
    }
  }
  if (out.plan !== "pro" && out.plan !== "max") usage("--plan 只支持 pro | max");
  if (!Number.isInteger(out.count) || out.count < 1 || out.count > 5000) usage("--count 需为 1..5000 的整数");
  if (!Number.isInteger(out.days) || out.days < 1 || out.days > 3650) usage("--days 需为 1..3650 的整数");
  if (!out.batch) out.batch = todayLocal();
  return out;
}

function todayLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ------------------------------------------------------------------ *
 * SQL
 * ------------------------------------------------------------------ */

/** SQL 字符串字面量：单引号内的单引号翻倍 */
function sqlStr(v) {
  return "'" + String(v).replace(/'/g, "''") + "'";
}

function buildSql(rows) {
  const lines = [
    "-- cf-auth-free 兑换码批量导入（由 tools/mint-codes.mjs 生成）",
    `-- plan=${rows[0].plan} days=${rows[0].days} batch=${rows[0].batch} count=${rows.length}`,
    "-- 码明文只应保存在发码人的离线清单里；此处 code 列供后台客服查询用。",
    "",
  ];
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    lines.push(
      "INSERT INTO redeem_codes (code_hash, code, code_mask, plan, days, batch, status, user_id, used_at, created_at, note) VALUES"
    );
    lines.push(
      slice
        .map(
          (r) =>
            `(${[r.hash, r.code, r.mask, r.plan, r.days, r.batch, "unused", null, null, r.createdAt, r.note]
              .map((v) => (v === null ? "NULL" : typeof v === "number" ? String(v) : sqlStr(v)))
              .join(", ")})`
        )
        .join(",\n") + ";"
    );
    lines.push("");
  }
  return lines.join("\n");
}

/* ------------------------------------------------------------------ *
 * wrangler 调用
 * ------------------------------------------------------------------ */

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function quoteWinArg(a) {
  if (!/[\s"]/.test(a)) return a;
  if (a.includes('"')) throw new Error("参数中不能包含双引号：" + a);
  return '"' + a + '"';
}

function runWrangler(args) {
  const isWin = process.platform === "win32";
  const bin = isWin ? "npx.cmd" : "npx";
  const argv = ["wrangler", ...args];
  const base = {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  };
  // Windows 上 .cmd 必须经 cmd.exe 解析。这里自己拼整条命令行 + windowsVerbatimArguments，
  // 让引号原样交给 cmd（Node 默认会给带空格的参数加 \" 转义，cmd 并不认）。
  const res = isWin
    ? spawnSync([bin, ...argv].map(quoteWinArg).join(" "), { ...base, shell: true, windowsVerbatimArguments: true })
    : spawnSync(bin, argv, base);
  if (res.error) {
    console.error("调用 wrangler 失败：" + res.error.message);
    process.exit(1);
  }
  return { status: res.status, stdout: res.stdout || "", stderr: res.stderr || "" };
}

/** 从 wrangler 的混杂输出里抠出 JSON（--json 前面可能带提示行） */
function parseJsonLoose(text) {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function countBatch(batch, local) {
  const sql = `SELECT count(*) AS n FROM redeem_codes WHERE batch = ${sqlStr(batch)}`;
  const args = ["d1", "execute", "cf-auth-free", local ? "--local" : "--remote", "--json", "--command", sql];
  const res = runWrangler(args);
  if (res.status !== 0) {
    console.error("回读失败（wrangler 退出码 " + res.status + "）：");
    console.error((res.stderr || res.stdout || "").trim());
    process.exit(1);
  }
  const data = parseJsonLoose(res.stdout);
  if (!Array.isArray(data) || !data[0] || !Array.isArray(data[0].results)) {
    console.error("回读结果无法解析，原始输出：\n" + res.stdout.trim());
    process.exit(1);
  }
  const row = data[0].results[0] || {};
  const n = Number(row.n ?? row["count(*)"] ?? 0);
  if (!Number.isFinite(n)) {
    console.error("回读计数字段异常：" + JSON.stringify(row));
    process.exit(1);
  }
  return n;
}

/* ------------------------------------------------------------------ *
 * main
 * ------------------------------------------------------------------ */

function main() {
  const opt = parseArgs(process.argv.slice(2));
  const createdAt = Date.now();
  const target = opt.local ? "本地 D1 (--local)" : "远端 D1 (--remote)";

  // 1) 生成
  const seen = new Set();
  const rows = [];
  while (rows.length < opt.count) {
    const code = generateCode();
    const normalized = code.replace(/-/g, "");
    const hash = codeHash(normalized);
    if (seen.has(hash)) continue; // 理论不可能，兜底防重
    seen.add(hash);
    rows.push({
      code,
      hash,
      mask: maskOf(code),
      plan: opt.plan,
      days: opt.days,
      batch: opt.batch,
      note: opt.note,
      createdAt,
    });
  }
  console.log(`生成 ${rows.length} 个 ${opt.plan.toUpperCase()} 码（${opt.days} 天/码，批次 ${opt.batch}）`);

  // 2) 写临时 SQL
  const sqlPath = join(tmpdir(), `cf-auth-free-mint-${opt.plan}-${Date.now()}-${process.pid}.sql`);
  writeFileSync(sqlPath, buildSql(rows), "utf8");

  // 3) 插入前计数
  const before = countBatch(opt.batch, opt.local);

  // 4) 执行
  console.log(`写入${target}：npx wrangler d1 execute cf-auth-free ${opt.local ? "--local" : "--remote"} --file=${sqlPath}`);
  const res = runWrangler([
    "d1",
    "execute",
    "cf-auth-free",
    opt.local ? "--local" : "--remote",
    "--file=" + sqlPath,
  ]);
  if (res.status !== 0) {
    console.error("写入失败（wrangler 退出码 " + res.status + "）：");
    console.error((res.stderr || res.stdout || "").trim());
    console.error("SQL 文件保留在：" + sqlPath);
    process.exit(1);
  }
  try {
    rmSync(sqlPath, { force: true });
  } catch {
    /* 删不掉就留着，不影响发码 */
  }

  // 5) 回读校验
  const after = countBatch(opt.batch, opt.local);
  const inserted = after - before;
  if (inserted !== rows.length) {
    console.error(
      `回读校验失败：批次 ${opt.batch} 期望新增 ${rows.length} 行，实际新增 ${inserted} 行（前 ${before} / 后 ${after}）`
    );
    process.exit(1);
  }
  console.log(`回读校验通过：批次 ${opt.batch} 现有 ${after} 行（本次新增 ${inserted}）`);

  // 6) 输出码清单
  const txt = rows.map((r) => r.code).join("\n") + "\n";
  const outPath = resolve(opt.out || `codes-${opt.plan}-${opt.batch}.txt`);
  writeFileSync(outPath, txt, "utf8");

  console.log("\n码清单：");
  for (const r of rows) console.log("  " + r.code);
  console.log(`\n已写入清单文件：${outPath}`);
  console.log(`注意：明细已入库（redeem_codes.code 存明文，客服可查），本清单只为方便转交。`);
}

main();
