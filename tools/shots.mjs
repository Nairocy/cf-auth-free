#!/usr/bin/env node
// shots.mjs — 多视口整页截图 + 方正主义布局断言（零依赖，Edge headless + CDP）
// 用法：node tools/shots.mjs <url> <outDir> [cookieName=cookieValue]
// 环境：VIEWS="1280x800,1279x800,390x844" PORT=9233 EDGE=浏览器路径
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";

const [target, outArg, cookieArg] = process.argv.slice(2);
if (!target) { console.error("usage: node tools/shots.mjs <url> <outDir> [name=value]"); process.exit(2); }
const PORT = +(process.env.PORT || 9233);
const EDGE = process.env.EDGE || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const OUT = path.resolve(outArg || "shots");
mkdirSync(OUT, { recursive: true });

const views = (process.env.VIEWS || "1280x800,1279x800,390x844")
  .split(",").map((s) => s.trim()).filter(Boolean)
  .map((s) => { const [w, h] = s.split("x").map(Number); return { w, h }; });

const child = spawn(EDGE, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  "--disable-extensions", "--mute-audio", "--hide-scrollbars",
  `--remote-debugging-port=${PORT}`,
  "--user-data-dir=" + path.join(process.env.TEMP || ".", "edge-shots-" + PORT),
  "--window-size=1440,900", "about:blank",
], { stdio: "ignore" });

let version = null;
for (let i = 0; i < 60; i++) {
  try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; }
  catch { await sleep(400); }
}
if (!version) { console.error("! DevTools 未启动"); child.kill(); process.exit(2); }

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const pageT = targets.find((t) => t.type === "page");
const ws = new WebSocket(pageT.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0; const pend = new Map(); const errors = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
  else if (d.method === "Runtime.exceptionThrown") errors.push(JSON.stringify(d.params.exceptionDetails.text || ""));
  else if (d.method === "Log.entryAdded" && d.params.entry.level === "error") errors.push(d.params.entry.text);
};
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
await send("Log.enable");
await send("Page.enable");

if (cookieArg) {
  const eq = cookieArg.indexOf("=");
  const name = cookieArg.slice(0, eq), value = cookieArg.slice(eq + 1);
  const u = new URL(target);
  await send("Network.enable");
  await send("Network.setCookie", { name, value, url: u.origin, path: "/", httpOnly: true });
}

const report = [];
for (const v of views) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: v.w, height: v.h, deviceScaleFactor: v.w <= 500 ? 3 : 1, mobile: v.w <= 900,
  });
  await send("Page.navigate", { url: target });
  await sleep(+(process.env.WAIT || 1400));
  if (process.env.CLICK) {
    await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(process.env.CLICK)});if(el)el.click();return 1})()`);
    await sleep(700);
  }

  // 整页滚动一遍（入场动画/懒加载都走完），再回顶
  await evaluate(`(async()=>{const h=document.documentElement.scrollHeight;for(let y=0;y<h;y+=Math.round(innerHeight*0.7)){scrollTo(0,y);await new Promise(r=>setTimeout(r,110));}scrollTo(0,0);await new Promise(r=>setTimeout(r,300));return 1})()`);
  await sleep(400);
  const hideToast = await evaluate(`(()=>{document.querySelectorAll('.toast').forEach(e=>e.style.display='none');return 1})()`);

  const metrics = await evaluate(`(()=>{
    const bs=[...document.querySelectorAll('.b')];
    const clipped=bs.filter(b=>b.scrollWidth>b.clientWidth+1||b.scrollHeight>b.clientHeight+1)
      .map(b=>b.className+' sw='+b.scrollWidth+'/'+b.clientWidth+' sh='+b.scrollHeight+'/'+b.clientHeight);
    const overlap=[];
    for(let i=0;i<bs.length;i++)for(let j=i+1;j<bs.length;j++){
      const a=bs[i].getBoundingClientRect(),b=bs[j].getBoundingClientRect();
      if(a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1)
        overlap.push(bs[i].className+' × '+bs[j].className);
    }
    const h2split=[...document.querySelectorAll('h2')].filter(h=>{
      const r=document.createRange();r.selectNodeContents(h);
      return r.getClientRects().length>1;
    }).map(h=>h.textContent.trim());
    const radii=bs.filter(b=>{const s=getComputedStyle(b).borderRadius;return s!=='0px';}).length;
    const page=document.querySelector('.page');
    return {
      pageW: innerWidth, docW: document.documentElement.scrollWidth,
      hOverflow: document.documentElement.scrollWidth>innerWidth+1,
      blocks: bs.length, clipped, overlap, h2split, roundedBlocks: radii,
      pageMaxW: page?getComputedStyle(page).maxWidth:'—',
      cols: getComputedStyle(document.querySelector('.mosaic')).gridTemplateColumns.split(' ').length,
      h: document.documentElement.scrollHeight,
      toast: ${hideToast},
    };
  })()`);

  const shot = await send("Page.captureScreenshot", {
    format: "png", captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: v.w, height: metrics.h, scale: 1 },
  });
  const name = `${path.basename(new URL(target).pathname.replace(/\//g, "_") || "root")}_${v.w}.png`;
  writeFileSync(path.join(OUT, name), Buffer.from(shot.data, "base64"));
  report.push({ view: `${v.w}x${v.h}`, shot: name, ...metrics, consoleErrors: errors.length });
}

writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ target, report, errors }, null, 2));
console.log(JSON.stringify(report, null, 2));
child.kill();
const bad = report.some((r) => r.hOverflow || r.clipped.length || r.overlap.length || r.h2split.length || r.roundedBlocks);
process.exit(bad ? 1 : 0);
