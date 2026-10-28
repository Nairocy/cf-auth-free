#!/usr/bin/env node
// 量块高：node tools/measure.mjs <url> <cookieName=value> [width]
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";

const [target, cookieArg, wArg] = process.argv.slice(2);
const PORT = +(process.env.PORT || 9244);
const EDGE = process.env.EDGE || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const W = +(wArg || 1280);

const child = spawn(EDGE, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  "--disable-extensions", "--hide-scrollbars", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=" + path.join(process.env.TEMP || ".", "edge-measure-" + PORT),
  "--window-size=1440,900", "about:blank",
], { stdio: "ignore" });

let version = null;
for (let i = 0; i < 60 && !version; i++) {
  try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); }
  catch { await sleep(400); }
}
if (!version) { console.error("! DevTools 未启动"); child.kill(); process.exit(2); }

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const pageT = targets.find((t) => t.type === "page");
const ws = new WebSocket(pageT.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id; pend.set(i, (d) => d.error ? rej(new Error(method + ": " + JSON.stringify(d.error))) : res(d.result));
  ws.send(JSON.stringify({ id: i, method, params }));
});
const evaluate = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
};

await send("Runtime.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: 900, deviceScaleFactor: 1, mobile: W <= 900 });
if (cookieArg) {
  const eq = cookieArg.indexOf("=");
  await send("Network.enable");
  await send("Network.setCookie", { name: cookieArg.slice(0, eq), value: cookieArg.slice(eq + 1), url: new URL(target).origin, path: "/", httpOnly: true });
}
await send("Page.navigate", { url: target });
await sleep(1600);

const data = await evaluate(`(() => {
  const out = {};
  document.querySelectorAll('.b').forEach(b => {
    const r = b.getBoundingClientRect();
    out[b.className.split(' ').filter(c=>c.startsWith('b-')).join('.')] = {w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top)};
  });
  const kidsOf = sel => [...document.querySelector(sel).children].map(k => ({
    cls: (k.className || k.tagName).toString().slice(0, 28),
    h: Math.round(k.getBoundingClientRect().height),
    gapBelow: null
  }));
  return JSON.stringify({ vw: innerWidth, blocks: out, heroKids: kidsOf('.b-hero'), profileKids: kidsOf('.b-profile') }, null, 1);
})()`);
console.log(data);
child.kill();
