/**
 * 方正主义（DesignLab 16 号）皮肤底座：token、顶栏、拼版块、齐边操作条、字格印记、表单件。
 * 两个页面（登录 / 账户中心）共用，改 token 只改这里。
 * 红线：零圆角、2px 墨边、16px 纸沟、色块配额（海军蓝/砖红/芥黄/橄榄各 ≤2 块）、无阴影无渐变。
 */
export const rectilinearCss = `
:root{
  --paper:#F4F1EA; --panel:#EFE9DD; --ink:#2B2B2B;
  --navy:#2C3E50;  --brick:#AE5244; --mustard:#D4A373; --olive:#666B57;
  --seam:16px; --row:76px; --pad:24px;
  --hair:rgba(43,43,43,.22); --hair-lt:rgba(244,241,234,.30);
  --mono:"Cascadia Mono",ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",Menlo,monospace;
  --sans:"Inter","Segoe UI","PingFang SC","Microsoft YaHei",system-ui,sans-serif;
}
*{margin:0;padding:0;box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  background-color:var(--paper); color:var(--ink); font-family:var(--sans);
  line-height:1.65; -webkit-font-smoothing:antialiased; overflow-x:hidden;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.045'/%3E%3C/svg%3E");
}
::selection{background:var(--mustard);color:var(--ink)}
.page{max-width:1280px;margin:0 auto;padding:24px clamp(16px,3vw,32px) 32px}

/* 顶栏：细线 + 方块标 + 方形状态点 */
.topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;
  padding-bottom:16px;border-bottom:1px solid rgba(43,43,43,.55)}
.brand{display:flex;align-items:center;gap:12px;text-decoration:none;color:inherit}
.brand-mark{width:36px;height:36px;border:2px solid var(--ink);background:var(--panel);
  display:grid;place-items:center;font-size:17px;font-weight:900;line-height:1}
.brand-name{display:flex;flex-direction:column;gap:2px;font-size:15px;font-weight:800;letter-spacing:.02em}
.brand-name small{font:9px/1.2 var(--mono);font-weight:400;letter-spacing:.18em;color:#6f6a60}
.nav{display:flex;align-items:center;gap:clamp(10px,2vw,28px)}
.nav a,.nav button{display:inline-flex;align-items:center;min-height:44px;padding:0 2px;font:inherit;font-size:13px;
  color:var(--ink);text-decoration:none;background:none;border:0;border-bottom:1px solid transparent;
  cursor:pointer;transition:border-color .15s}
.nav a:hover,.nav button:hover{border-color:var(--brick)}
.status{display:flex;align-items:center;gap:8px;font:10px/1 var(--mono);letter-spacing:.12em;color:#6f6a60;white-space:nowrap}
.status i{display:block;width:7px;height:7px;background:var(--olive)}
.status i.off{background:var(--brick)}

/* 拼版：12 列满铺，缝恒为 16px 纸沟 */
.mosaic{display:grid;grid-template-columns:repeat(12,1fr);grid-auto-rows:minmax(var(--row),auto);
  gap:var(--seam);margin-top:16px}
.b{position:relative;min-width:0;border:2px solid var(--ink);background:var(--panel);color:var(--ink);
  padding:var(--pad);display:flex;flex-direction:column;overflow:hidden}
.b--dark{color:var(--paper);--hair:var(--hair-lt)}
.b--navy{background:var(--navy);color:var(--paper);--hair:var(--hair-lt)}
.b--ink{background:var(--ink);color:var(--paper);--hair:var(--hair-lt)}
.b--brick{background:var(--brick);color:var(--paper);--hair:var(--hair-lt)}
.b--olive{background:var(--olive);color:var(--paper);--hair:var(--hair-lt)}
.b--mustard{background:var(--mustard);color:var(--ink)}

/* 模块标头：编号 + 模数 */
.eyebrow{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex:none;
  padding-bottom:10px;border-bottom:1px solid var(--hair);
  font:10px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase}
.eyebrow .idx{display:inline-flex;align-items:center;gap:8px;white-space:nowrap}
.eyebrow .idx::before{content:"";width:16px;height:1px;background:var(--brick)}
.b--navy .eyebrow .idx::before,.b--ink .eyebrow .idx::before,.b--brick .eyebrow .idx::before,.b--olive .eyebrow .idx::before{background:var(--mustard)}
.eyebrow .dim{opacity:.6;white-space:nowrap}

/* 齐边操作条：按钮即格子 */
.bar{display:flex;border-top:2px solid currentColor;margin:auto calc(-1 * var(--pad)) calc(-1 * var(--pad));flex:none}
.bar-cell{flex:1 1 0;min-height:56px;display:flex;align-items:center;justify-content:space-between;gap:10px;
  padding:0 20px;font-family:inherit;font-size:14px;font-weight:800;letter-spacing:.04em;text-align:left;
  background:transparent;border:0;color:inherit;text-decoration:none;cursor:pointer;
  transition:background .16s,color .16s}
.bar-cell + .bar-cell{border-left:2px solid currentColor}
.bar-cell svg{width:18px;height:18px;flex:none;transition:transform .18s}
.bar-cell:hover svg{transform:translateX(3px)}
.bar-cell.primary{background:var(--brick);color:var(--paper)}
.bar-cell.primary:hover{background:#9a483b}
.bar-cell.quiet:hover{background:var(--mustard);color:var(--ink)}
.b--mustard .bar-cell.quiet:hover{background:var(--paper);color:var(--ink)}
/* 砖红底上的主动作反转为纸白，否则按钮和块底糊成一片 */
.b--brick .bar-cell.primary{background:var(--paper);color:var(--ink)}
.b--brick .bar-cell.primary:hover{background:var(--mustard);color:var(--ink)}
.bar-cell[disabled]{opacity:.55;cursor:default}
.bar-cell[disabled]:hover svg{transform:none}

/* 表单件：0 圆角，2px 边 */
.field{display:flex;flex-direction:column;gap:7px;margin-top:18px}
.field:first-of-type{margin-top:16px}
.field label{font:10px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;opacity:.72}
.field input,.field textarea{
  width:100%;min-height:44px;padding:10px 12px;border:2px solid currentColor;border-radius:0;
  background:var(--paper);color:var(--ink);font-family:inherit;font-size:15px;line-height:1.4;outline:none;
  -webkit-appearance:none;transition:background .15s
}
.field textarea{min-height:150px;resize:vertical}
.field input::placeholder,.field textarea::placeholder{color:#8a8478;opacity:1}
.field input:focus,.field textarea:focus{outline:2px solid var(--brick);outline-offset:2px}
.b--mustard .field input,.b--mustard .field textarea{background:#FBF8F2}
.field .hintline{font:10px/1.6 var(--mono);letter-spacing:.08em;opacity:.62}

/* 分段 tab：三格，选中转砖红 */
.tabs{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;border:2px solid currentColor;margin-top:16px;flex:none}
.tabs button{min-height:44px;background:transparent;border:0;border-left:2px solid currentColor;
  font-family:inherit;font-size:13.5px;font-weight:800;letter-spacing:.06em;color:inherit;cursor:pointer;
  transition:background .16s,color .16s}
.tabs button:first-child{border-left:0}
.tabs button[aria-selected="true"]{background:var(--ink);color:var(--paper)}
.b--mustard .tabs button[aria-selected="true"]{background:var(--ink);color:var(--paper)}
.tabs button:hover{background:var(--mustard);color:var(--ink)}

/* 字格印记 */
.mark{position:relative;width:104px;aspect-ratio:1;border:2px solid var(--ink);display:grid;place-items:center;
  background-color:var(--paper);
  background-image:
    repeating-linear-gradient(0deg,rgba(43,43,43,.30) 0 4px,transparent 4px 10px),
    repeating-linear-gradient(90deg,rgba(43,43,43,.30) 0 4px,transparent 4px 10px);
  background-size:1px 100%,100% 1px;background-position:center,center;background-repeat:no-repeat}
.mark::after{content:"";position:absolute;inset:9px;border:1px solid rgba(43,43,43,.28);pointer-events:none}
.mark span{position:relative;z-index:1;font-size:44px;font-weight:900;line-height:1;background:var(--paper);padding:0 4px}

/* 头像：方正主义里是方块，不是圆 */
.avatar{width:96px;height:96px;flex:none;border:2px solid currentColor;background:var(--mustard);color:var(--ink);
  display:grid;place-items:center;font-size:40px;font-weight:900;line-height:1;overflow:hidden}
.avatar img{width:100%;height:100%;object-fit:cover;display:block}

/* 列表行（会话） */
.rows{display:flex;flex-direction:column;margin-top:14px;border-top:1px solid var(--hair)}
.row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;
  border-bottom:1px solid var(--hair);font-size:13px}
.row .k{display:flex;align-items:center;gap:8px;min-width:0}
.row .k b{font-weight:700}
.row .v{font:10px/1.4 var(--mono);letter-spacing:.06em;opacity:.7;text-align:right;white-space:nowrap}
.row .dot{width:7px;height:7px;background:var(--olive);flex:none}
.row .dot.cur{background:var(--mustard)}
.row .tag{font:9px/1 var(--mono);letter-spacing:.1em;border:1px solid currentColor;padding:3px 5px;opacity:.8}

/* 元数据 */
.meta{display:flex;flex-wrap:wrap;gap:4px 16px;margin-top:14px;padding-top:10px;border-top:1px solid var(--hair);
  font:9px/1.9 var(--mono);letter-spacing:.14em;opacity:.62}
.note{font-size:13.5px;line-height:1.85;opacity:.9}
.note + .note{margin-top:10px}

/* 页脚 */
.footer{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;
  margin-top:16px;padding-top:14px;border-top:1px solid rgba(43,43,43,.55);
  font:10px/1.8 var(--mono);letter-spacing:.1em;color:#6f6a60}
.footer b{color:var(--ink);font-weight:400}

/* 提示条 */
.toast{position:fixed;left:50%;bottom:24px;transform:translate(-50%,20px);z-index:50;
  max-width:min(92vw,520px);padding:12px 16px;border:2px solid var(--ink);background:var(--paper);
  font-size:13px;line-height:1.5;opacity:0;pointer-events:none;transition:opacity .18s,transform .18s}
.toast.on{opacity:1;transform:translate(-50%,0)}
.toast.err{border-color:var(--brick);color:var(--brick)}
.toast.ok{border-color:var(--olive);color:#3d4032}

.hide{display:none !important}
[hidden]{display:none !important}

a:focus-visible,button:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid var(--brick);outline-offset:3px}
.b--navy a:focus-visible,.b--navy button:focus-visible,.b--ink a:focus-visible,.b--ink button:focus-visible,
.b--brick a:focus-visible,.b--brick button:focus-visible,.b--olive a:focus-visible,.b--olive button:focus-visible{outline-color:var(--mustard)}
.bar-cell:focus-visible{outline-offset:-3px}

@media (prefers-reduced-motion:no-preference){
  @keyframes blk{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
  .b{animation:blk .5s cubic-bezier(.2,.7,.3,1) both}
  .b:nth-child(2){animation-delay:.05s}
  .b:nth-child(3){animation-delay:.1s}
  .b:nth-child(4){animation-delay:.14s}
  .b:nth-child(5){animation-delay:.18s}
  .b:nth-child(6){animation-delay:.22s}
  .b:nth-child(7){animation-delay:.26s}
  .b:nth-child(8){animation-delay:.3s}
  .b:nth-child(9){animation-delay:.34s}
}

@media (max-width:1279px){
  .mosaic{grid-template-columns:repeat(6,1fr);grid-auto-rows:minmax(56px,auto);gap:12px}
}
@media (max-width:700px){
  .mosaic{grid-auto-rows:minmax(50px,auto);gap:10px}
  .page{padding-top:20px}
  .topbar{gap:8px 12px}
  .nav{order:3;width:100%;justify-content:flex-start;gap:18px;padding-top:6px;border-top:1px solid var(--hair)}
  .b{padding:20px;--pad:20px}
  .mark{width:76px}
  .mark span{font-size:32px}
  .avatar{width:76px;height:76px;font-size:32px}
  .field textarea{min-height:120px}
}
`;

/** 手绘描边图标（不用 emoji / 字体字符） */
export const icons = {
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6"/></svg>',
  save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" aria-hidden="true"><path d="M4 5h13l3 3v11H4z"/><path d="M8 5v6h8V5"/><path d="M8 19v-5h8v5"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" aria-hidden="true"><path d="M14 5H5v14h9"/><path d="M12 12h9M18 8l3 4-3 4"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" aria-hidden="true"><path d="M12 17V4M7 9l5-5 5 5"/><path d="M4 17v3h16v-3"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" aria-hidden="true"><path d="M6 11h12v9H6z"/><path d="M9 11V8a3 3 0 0 1 6 0v3"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" aria-hidden="true"><path d="M4 13l5 5L20 6"/></svg>',
};
