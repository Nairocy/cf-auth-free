/**
 * 登录 / 注册 / 找回密码页 —— 方正主义（DesignLab 16 号）。
 * 12×6 满铺：表单 7×6 · 说明 5×3 · 字格 5×3。
 * 已登录访问 `/` 会在 Worker 层 302 到 `/account`。
 *
 * 关于 Turnstile 脚本：Cloudflare 官方要求直接引用
 * https://challenges.cloudflare.com/turnstile/v0/api.js，脚本内容随其版本滚动更新，
 * 无法固定 SRI 哈希（加了 integrity 会因内容变更而整站挂死），因此这里不带 integrity。
 */
import { rectilinearCss, icons } from "./ui.js";

export function renderPage({ siteKey = "", origin = "https://id.example.com" } = {}) {
  // 竖排域名跟着部署者的 APP_ORIGIN 走，不写死
  let host = "";
  try { host = new URL(origin).host.toUpperCase(); } catch { host = "ID.EXAMPLE.COM"; }
  const turnstile = siteKey
    ? `<div class="cf-turnstile" data-sitekey="${siteKey}" data-theme="light" data-size="flexible"></div>`
    : `<div class="cf-turnstile" data-theme="light" hidden></div>`;
  const turnstileScript = siteKey
    ? '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>'
    : "";

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light">
<link rel="icon" href="data:,">
<title>Nairocy · 统一账号</title>
<style>
${rectilinearCss}
  /* 12×6 满铺：7 + 5 两栏 */
  .mosaic{grid-template-rows:repeat(6,minmax(var(--row),auto))}
  .b-auth{grid-area:1 / 1 / 7 / 8}
  .b-intro{grid-area:1 / 8 / 4 / 13}
  .b-mark{grid-area:4 / 8 / 7 / 13}
  h1{font-size:clamp(26px,2.6vw,34px);line-height:1.15;font-weight:900;letter-spacing:-.01em;margin-top:14px}
  .lead{margin-top:8px;font-size:13.5px;line-height:1.75;opacity:.78;max-width:52ch}
  .statement{margin:auto 0;font-size:clamp(17px,1.5vw,19px);line-height:1.9;font-weight:700;letter-spacing:.01em}
  .statement em{font-style:normal;color:var(--mustard)}
  .b-mark .markbody{margin-top:auto;display:flex;align-items:flex-end;justify-content:space-between;gap:16px}
  .b-mark .meta{margin-top:0;border-top:0;padding-top:0;flex-direction:column;gap:2px;opacity:.72;flex:1}
  .stepnote{font:10px/1.6 var(--mono);letter-spacing:.1em;opacity:.62;margin-top:12px}
  .cf-turnstile{margin-top:16px}
  /* 让齐边操作条真的贴到块底：pane / step 撑满，bar 的 margin-top:auto 才有作用 */
  .b-auth [data-pane]{display:flex;flex-direction:column;flex:1;min-height:0}
  .b-auth [data-step]{display:flex;flex-direction:column;flex:1;min-height:0}
  @media (max-width:1279px){
    .mosaic{grid-template-rows:none}
    .b-auth{grid-area:1 / 1 / 7 / 7}
    .b-intro{grid-area:7 / 1 / 9 / 7}
    .b-mark{grid-area:9 / 1 / 11 / 7}
  }
</style>
</head>
<body>
<div class="page">
  <header class="topbar">
    <a class="brand" href="/">
      <span class="brand-mark">萘</span>
      <span class="brand-name">Nairocy<small>UNIFIED ACCOUNT</small></span>
    </a>
    <nav class="nav">
      <a href="#what">这是什么</a>
      <a href="/account">账户中心</a>
    </nav>
    <div class="status"><i class="off"></i>未登录</div>
  </header>

  <main class="mosaic">
    <section class="b b-auth">
      <div class="eyebrow"><span class="idx">01 / ACCESS</span><span class="dim">7 × 6</span></div>
      <h1>统一账号</h1>
      <p class="lead">一个邮箱，一套密码，全系列产品通用。</p>

      <div class="tabs" role="tablist">
        <button type="button" role="tab" data-mode="login" aria-selected="true">登录</button>
        <button type="button" role="tab" data-mode="register" aria-selected="false">注册</button>
        <button type="button" role="tab" data-mode="reset" aria-selected="false">找回密码</button>
      </div>

      <!-- 登录 -->
      <div data-pane="login">
        <div class="field">
          <label for="login-email">电子邮箱</label>
          <input id="login-email" type="email" inputmode="email" autocomplete="username" spellcheck="false" placeholder="you@example.com">
        </div>
        <div class="field">
          <label for="login-pass">密码</label>
          <input id="login-pass" type="password" autocomplete="current-password" placeholder="至少 8 位">
        </div>
        <div class="bar">
          <button class="bar-cell primary" type="button" id="btn-login"><span>登录</span>${icons.arrow}</button>
          <button class="bar-cell quiet" type="button" id="btn-to-reset"><span>忘记密码</span>${icons.lock}</button>
        </div>
      </div>

      <!-- 注册 -->
      <div data-pane="register" hidden>
        <div data-step="1">
          <div class="field">
            <label for="reg-email">电子邮箱</label>
            <input id="reg-email" type="email" inputmode="email" autocomplete="email" spellcheck="false" placeholder="you@example.com">
          </div>
          ${turnstile}
          <p class="stepnote">验证码 10 分钟内有效，一个邮箱只能注册一个账号。</p>
          <div class="bar">
            <button class="bar-cell primary" type="button" id="btn-reg-send"><span>发送验证码</span>${icons.arrow}</button>
            <button class="bar-cell quiet" type="button" data-back="login"><span>返回登录</span>${icons.lock}</button>
          </div>
        </div>
        <div data-step="2" hidden>
          <p class="stepnote" id="reg-sent"></p>
          <div class="field">
            <label for="reg-code">验证码</label>
            <input id="reg-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6 位数字">
          </div>
          <div class="field">
            <label for="reg-pass">设置密码</label>
            <input id="reg-pass" type="password" autocomplete="new-password" placeholder="至少 8 位">
          </div>
          <div class="field">
            <label for="reg-pass2">确认密码</label>
            <input id="reg-pass2" type="password" autocomplete="new-password" placeholder="再输一次">
          </div>
          <div class="bar">
            <button class="bar-cell primary" type="button" id="btn-reg-create"><span>创建账号</span>${icons.check}</button>
            <button class="bar-cell quiet" type="button" data-back="register"><span>改邮箱</span>${icons.lock}</button>
          </div>
        </div>
      </div>

      <!-- 找回密码 -->
      <div data-pane="reset" hidden>
        <div data-step="1">
          <div class="field">
            <label for="rst-email">注册邮箱</label>
            <input id="rst-email" type="email" inputmode="email" autocomplete="email" spellcheck="false" placeholder="you@example.com">
          </div>
          ${turnstile}
          <p class="stepnote">我们会给这个邮箱发一个 6 位验证码，用它设置新密码。</p>
          <div class="bar">
            <button class="bar-cell primary" type="button" id="btn-rst-send"><span>发送验证码</span>${icons.arrow}</button>
            <button class="bar-cell quiet" type="button" data-back="login"><span>返回登录</span>${icons.lock}</button>
          </div>
        </div>
        <div data-step="2" hidden>
          <p class="stepnote" id="rst-sent"></p>
          <div class="field">
            <label for="rst-code">验证码</label>
            <input id="rst-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6 位数字">
          </div>
          <div class="field">
            <label for="rst-pass">新密码</label>
            <input id="rst-pass" type="password" autocomplete="new-password" placeholder="至少 8 位">
          </div>
          <div class="bar">
            <button class="bar-cell primary" type="button" id="btn-rst-do"><span>重置密码</span>${icons.check}</button>
            <button class="bar-cell quiet" type="button" data-back="reset"><span>改邮箱</span>${icons.lock}</button>
          </div>
        </div>
      </div>
    </section>

    <section class="b b-intro b--ink" id="what">
      <div class="eyebrow"><span class="idx">02 / WHY</span><span class="dim">5 × 3</span></div>
      <p class="statement">账号只在<em>一处</em>管理：改一次名字、换一次头像，所有接入的产品都跟着变。</p>
      <div class="meta"><span>ONE ID / ALL PRODUCTS</span><span>${host}</span></div>
    </section>

    <section class="b b-mark">
      <div class="eyebrow"><span class="idx">03 / MARK</span><span class="dim">5 × 3</span></div>
      <div class="markbody">
        <div class="mark"><span>萘</span></div>
        <div class="meta">
          <b>NAIROCY</b>
          <span>ACCOUNT SYSTEM</span>
          <span>EST. 2026</span>
        </div>
      </div>
    </section>
  </main>

  <footer class="footer">
    <span>© 2026 <b>Nairocy</b> · 统一账号</span>
    <span>密码以 PBKDF2 加盐存储，服务端不保存明文</span>
  </footer>
</div>

<div class="toast" id="toast" role="status" aria-live="polite"></div>

<script>
(function(){
  var mode = 'login';
  var pendingEmail = '';
  var toastEl = document.getElementById('toast');
  var toastTimer = 0;

  function $(s, r){ return (r || document).querySelector(s); }
  function say(msg, kind){
    toastEl.textContent = msg || '';
    toastEl.className = 'toast' + (kind ? ' ' + kind : '') + (msg ? ' on' : '');
    clearTimeout(toastTimer);
    if (msg) toastTimer = setTimeout(function(){ toastEl.className = 'toast'; }, 4200);
  }
  function api(path, body, method){
    return fetch(path, {
      method: method || 'POST',
      headers: {'content-type':'application/json'},
      credentials: 'same-origin',
      body: JSON.stringify(body || {})
    }).then(function(r){
      return r.json().catch(function(){ return {ok:false, error:'响应异常 (' + r.status + ')'}; });
    });
  }
  function busy(btn, on, label){
    if (!btn) return;
    btn.disabled = !!on;
    var span = btn.querySelector('span');
    if (!span) return;
    if (on){ span.dataset.label = span.textContent; span.textContent = label || '处理中…'; }
    else if (span.dataset.label){ span.textContent = span.dataset.label; }
  }
  function widgetFor(paneEl){
    var el = paneEl ? paneEl.querySelector('.cf-turnstile') : null;
    return el && !el.hasAttribute('hidden') ? el : null;
  }
  function tokenFor(paneEl){
    var el = widgetFor(paneEl);
    if (!el || !window.turnstile) return '';
    try { return window.turnstile.getResponse(el) || ''; } catch(e){ return ''; }
  }
  function resetWidget(paneEl){
    var el = widgetFor(paneEl);
    if (!el || !window.turnstile) return;
    try { window.turnstile.reset(el); } catch(e){}
  }

  function pane(name){ return document.querySelector('[data-pane="' + name + '"]'); }

  function setMode(next){
    mode = next;
    ['login','register','reset'].forEach(function(n){
      pane(n).hidden = n !== next;
    });
    document.querySelectorAll('.tabs button').forEach(function(b){
      b.setAttribute('aria-selected', String(b.getAttribute('data-mode') === next));
    });
    var el = pane(next);
    el.querySelectorAll('[data-step]').forEach(function(s){ s.hidden = s.getAttribute('data-step') !== '1'; });
    resetWidget(el);
    var first = el.querySelector('input');
    if (first) setTimeout(function(){ first.focus(); }, 60);
    say('');
  }

  document.querySelectorAll('.tabs button').forEach(function(b){
    b.addEventListener('click', function(){ setMode(b.getAttribute('data-mode')); });
  });
  document.querySelectorAll('[data-back]').forEach(function(b){
    b.addEventListener('click', function(){ setMode(b.getAttribute('data-back')); });
  });
  document.getElementById('btn-to-reset').addEventListener('click', function(){ setMode('reset'); });

  function step(paneName, n){
    var el = pane(paneName);
    el.querySelectorAll('[data-step]').forEach(function(s){ s.hidden = s.getAttribute('data-step') !== String(n); });
    if (n === 2){ var f = el.querySelector('[data-step="2"] input'); if (f) f.focus(); }
  }

  // 登录
  document.getElementById('btn-login').addEventListener('click', function(){
    var btn = this;
    var email = $('#login-email').value.trim();
    var pass = $('#login-pass').value;
    if (!email || !pass){ say('邮箱和密码都要填', 'err'); return; }
    busy(btn, true, '登录中…');
    api('/api/login', { email: email, password: pass }).then(function(d){
      busy(btn, false);
      if (!d.ok){ say(d.error || '登录失败', 'err'); return; }
      location.href = '/account';
    }).catch(function(){ busy(btn, false); say('网络异常，请重试', 'err'); });
  });

  // 注册：发码
  document.getElementById('btn-reg-send').addEventListener('click', function(){
    var btn = this;
    var email = $('#reg-email').value.trim();
    if (!email){ say('先填邮箱', 'err'); return; }
    busy(btn, true, '发送中…');
    api('/api/register/request', { email: email, turnstileToken: tokenFor(pane('register')) }).then(function(d){
      busy(btn, false);
      if (!d.ok){ say(d.error || '发送失败', 'err'); resetWidget(pane('register')); return; }
      pendingEmail = email;
      $('#reg-sent').textContent = '验证码已发往 ' + email + (d.devCode ? ' · 开发模式：' + d.devCode : '');
      step('register', 2);
      say('验证码已发送，10 分钟内有效', 'ok');
    }).catch(function(){ busy(btn, false); say('网络异常，请重试', 'err'); });
  });

  // 注册：创建
  document.getElementById('btn-reg-create').addEventListener('click', function(){
    var btn = this;
    var code = $('#reg-code').value.trim();
    var p1 = $('#reg-pass').value;
    var p2 = $('#reg-pass2').value;
    if (!/^\\d{6}$/.test(code)){ say('验证码应为 6 位数字', 'err'); return; }
    if (p1.length < 8){ say('密码至少 8 位', 'err'); return; }
    if (p1 !== p2){ say('两次输入的密码不一致', 'err'); return; }
    busy(btn, true, '创建中…');
    api('/api/register/verify', { email: pendingEmail, code: code, password: p1 }).then(function(d){
      busy(btn, false);
      if (!d.ok){ say(d.error || '创建失败', 'err'); return; }
      say('账号已创建，正在进入账户中心…', 'ok');
      setTimeout(function(){ location.href = '/account'; }, 700);
    }).catch(function(){ busy(btn, false); say('网络异常，请重试', 'err'); });
  });

  // 找回：发码
  document.getElementById('btn-rst-send').addEventListener('click', function(){
    var btn = this;
    var email = $('#rst-email').value.trim();
    if (!email){ say('先填注册邮箱', 'err'); return; }
    busy(btn, true, '发送中…');
    api('/api/password/reset/request', { email: email, turnstileToken: tokenFor(pane('reset')) }).then(function(d){
      busy(btn, false);
      if (!d.ok){ say(d.error || '发送失败', 'err'); resetWidget(pane('reset')); return; }
      pendingEmail = email;
      $('#rst-sent').textContent = '验证码已发往 ' + email + (d.devCode ? ' · 开发模式：' + d.devCode : '');
      step('reset', 2);
      say('验证码已发送，10 分钟内有效', 'ok');
    }).catch(function(){ busy(btn, false); say('网络异常，请重试', 'err'); });
  });

  // 找回：重置
  document.getElementById('btn-rst-do').addEventListener('click', function(){
    var btn = this;
    var code = $('#rst-code').value.trim();
    var pass = $('#rst-pass').value;
    if (!/^\\d{6}$/.test(code)){ say('验证码应为 6 位数字', 'err'); return; }
    if (pass.length < 8){ say('新密码至少 8 位', 'err'); return; }
    busy(btn, true, '重置中…');
    api('/api/password/reset/verify', { email: pendingEmail, code: code, password: pass }).then(function(d){
      busy(btn, false);
      if (!d.ok){ say(d.error || '重置失败', 'err'); return; }
      say('密码已重置，请用新密码登录', 'ok');
      setTimeout(function(){ setMode('login'); }, 700);
    }).catch(function(){ busy(btn, false); say('网络异常，请重试', 'err'); });
  });

  document.addEventListener('keydown', function(e){
    if (e.key !== 'Enter') return;
    var el = pane(mode);
    if (!el) return;
    var visible = el.querySelector('[data-step]:not([hidden])') || el;
    var btn = visible.querySelector('.bar-cell.primary');
    if (btn) { e.preventDefault(); btn.click(); }
  });

  // /login#reset 直接落到「找回密码」（账户中心里的「忘记原密码」用这个）
  if (location.hash === '#reset') setMode('reset');
})();
</script>
${turnstileScript}
</body>
</html>`;
}
