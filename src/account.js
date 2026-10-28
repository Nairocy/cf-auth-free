/**
 * 账户中心 —— 方正主义（DesignLab 16 号）。
 * 12×11 满铺 8 块：身份 6×4 · 资料 6×4 · 安全 6×3 · 会话 6×3 ·
 *                  数据 6×4 · 危险区 3×4 · 字格 2×4 · 竖脊 1×4
 * 面积守恒：24+24+18+18+24+12+8+4 = 132 = 12×11。
 * 这一页只谈账号本身（登录、资料、密码、会话），不绑定任何具体产品。
 * 用户数据一律 textContent 注入，不拼 innerHTML。
 */
import { rectilinearCss, icons } from "./ui.js";

export function renderAccount({ origin = "https://id.example.com" } = {}) {
  // 竖脊域名跟着部署者的 APP_ORIGIN 走，不写死
  let host = "";
  try { host = new URL(origin).host.toUpperCase(); } catch { host = "ID.EXAMPLE.COM"; }
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light">
<link rel="icon" href="data:,">
<title>账户中心 · Nairocy</title>
<style>
${rectilinearCss}
  /* ── 12×12 满铺格位（mosaic-solver 输出） ── */
  .b-hero{grid-area:1 / 1 / 5 / 7}
  .b-profile{grid-area:1 / 7 / 5 / 13}
  .b-security{grid-area:5 / 1 / 8 / 7}
  .b-sessions{grid-area:5 / 7 / 8 / 13}
  .b-privacy{grid-area:8 / 1 / 12 / 7}
  .b-danger{grid-area:8 / 7 / 12 / 10}
  .b-mark{grid-area:8 / 10 / 12 / 12}
  .b-spine{grid-area:8 / 12 / 12 / 13}

  h2{font-size:clamp(20px,2vw,24px);line-height:1.25;font-weight:800;letter-spacing:-.01em}
  .hero-top{display:flex;gap:18px;align-items:flex-start;margin-top:18px}
  .hero-id{min-width:0;flex:1}
  .hero-mail{margin-top:8px;font-size:clamp(16px,1.7vw,20px);font-weight:800;line-height:1.3;
    word-break:break-all;letter-spacing:-.01em}
  .hero-name{margin-top:6px;font:10px/1.6 var(--mono);letter-spacing:.12em;opacity:.72}
  .hero-blurb{margin-top:auto;padding-top:18px;font-size:13.5px;line-height:1.8;opacity:.9;max-width:34ch}
  .grid2{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
  .grid2 .field{margin-top:0}
  .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
  .grid3 .field{margin-top:0}
  .b-security .fields{margin-top:18px}
  .b-spine{padding:24px 0;align-items:center;justify-content:space-between;gap:14px}
  .b-spine .sq{width:12px;height:12px;background:var(--mustard);border:2px solid var(--ink)}
  .vt{writing-mode:vertical-rl;text-orientation:mixed;letter-spacing:.3em;font-size:13px;font-weight:800;margin:0}
  .vno{writing-mode:vertical-rl;font:10px/1 var(--mono);letter-spacing:.22em;opacity:.6}
  .b-mark .markbody{margin-top:auto;display:flex;flex-direction:column;gap:16px;align-items:flex-start}
  .b-mark .meta{margin-top:0;border-top:0;padding-top:0;flex-direction:column;gap:2px;opacity:.72}
  .pill{display:inline-block;border:1px solid currentColor;padding:2px 6px;font:9px/1.4 var(--mono);letter-spacing:.1em}
  .empty{opacity:.62;font-size:13px}
  .spacer{flex:1}

  @media (max-width:1279px){
    .b-hero{grid-area:1 / 1 / 5 / 6}
    .b-spine{grid-area:1 / 6 / 5 / 7;padding:16px 0}
    .b-profile{grid-area:5 / 1 / 8 / 7}
    .b-security{grid-area:8 / 1 / 11 / 7}
    .b-sessions{grid-area:11 / 1 / 14 / 7}
    .b-privacy{grid-area:14 / 1 / 17 / 7}
    .b-danger{grid-area:17 / 1 / 19 / 5}
    .b-mark{grid-area:17 / 5 / 19 / 7}
    .grid2,.grid3{grid-template-columns:1fr}
    .b-mark .markbody{margin-top:14px;gap:12px}
  }
  @media (max-width:700px){
    /* 窄屏：身份块吃满 6 列；字格与竖脊挪到最后一行并肩（2 行高） */
    .b-hero{grid-area:1 / 1 / 5 / 7}
    .b-danger{grid-area:17 / 1 / 20 / 7}
    .b-mark{grid-area:20 / 1 / 22 / 6}
    .b-spine{grid-area:20 / 6 / 22 / 7;padding:14px 0}
    .b-mark .markbody{flex-direction:row;align-items:center;gap:14px;margin-top:12px}
    .b-mark .mark{width:68px}
    .b-mark .mark span{font-size:28px}
    .hero-top{gap:14px}
    .b-spine .vt{font-size:11px;letter-spacing:.22em}
    .b-danger .field + .field{margin-top:14px}
  }
</style>
</head>
<body>
<div class="page">
  <header class="topbar">
    <a class="brand" href="/account">
      <span class="brand-mark" id="brand-mark">N</span>
      <span class="brand-name">Nairocy<small>ACCOUNT CENTER</small></span>
    </a>
    <nav class="nav">
      <a href="#profile-block">资料</a>
      <a href="#security-block">安全</a>
      <a href="#sessions-block">会话</a>
      <a href="#data-block">数据</a>
      <a href="#danger-block">危险区</a>
    </nav>
    <div class="status"><i></i><span id="status-text">已登录</span></div>
  </header>

  <main class="mosaic">
    <!-- 01 身份 -->
    <section class="b b-hero b--navy">
      <div class="eyebrow"><span class="idx">01 / IDENTITY</span><span class="dim">6 × 4</span></div>
      <div class="hero-top">
        <div class="avatar" id="avatar"><span id="avatar-initial">N</span></div>
        <div class="hero-id">
          <h2>统一账号</h2>
          <div class="hero-mail" id="hero-email">—</div>
          <div class="hero-name" id="hero-name">加载中…</div>
          <div class="meta" style="border-top:0;padding-top:6px;margin-top:8px">
            <span id="meta-joined">JOINED —</span>
            <span id="meta-uid">UID —</span>
          </div>
        </div>
      </div>
      <p class="hero-blurb">统一账号只管登录本身：邮箱、称呼、头像、密码、登录设备。改一次，所有接入的产品都跟着变。</p>
      <div class="bar">
        <button class="bar-cell primary" type="button" id="btn-avatar"><span>更换头像</span>${icons.upload}</button>
        <button class="bar-cell quiet" type="button" id="btn-logout"><span>退出登录</span>${icons.logout}</button>
      </div>
      <input id="file-avatar" type="file" accept="image/png,image/jpeg,image/webp" hidden>
    </section>

    <!-- 02 资料 -->
    <section class="b b-profile b--mustard" id="profile-block">
      <div class="eyebrow"><span class="idx">02 / PROFILE</span><span class="dim">6 × 4</span></div>
      <div class="grid2" style="margin-top:18px">
        <div class="field">
          <label for="f-fullname">全名</label>
          <input id="f-fullname" type="text" maxlength="64" autocomplete="name" placeholder="你的全名">
        </div>
        <div class="field">
          <label for="f-nickname">称呼</label>
          <input id="f-nickname" type="text" maxlength="64" autocomplete="nickname" placeholder="怎么称呼你">
        </div>
      </div>
      <p class="note" style="margin-top:16px;font-size:13px">头像首字母取「称呼」，两项都会带到所有接入统一账号的产品里。</p>
      <div class="meta"><span>DISPLAY NAME / NICKNAME</span><span>SAVED ON ACCOUNT</span></div>
      <div class="bar">
        <button class="bar-cell primary" type="button" id="btn-save-profile"><span>保存资料</span>${icons.save}</button>
      </div>
    </section>

    <!-- 03 安全 -->
    <section class="b b-security b--olive" id="security-block">
      <div class="eyebrow"><span class="idx">03 / SECURITY</span><span class="dim">6 × 3</span></div>
      <div class="fields">
        <div class="grid3">
          <div class="field">
            <label for="f-oldpass">原密码</label>
            <input id="f-oldpass" type="password" autocomplete="current-password" placeholder="当前密码">
          </div>
          <div class="field">
            <label for="f-newpass">新密码</label>
            <input id="f-newpass" type="password" autocomplete="new-password" placeholder="至少 8 位">
          </div>
          <div class="field">
            <label for="f-newpass2">确认新密码</label>
            <input id="f-newpass2" type="password" autocomplete="new-password" placeholder="再输一次">
          </div>
        </div>
      </div>
      <div class="bar">
        <button class="bar-cell primary" type="button" id="btn-change-pass"><span>更新密码</span>${icons.lock}</button>
        <a class="bar-cell quiet" href="/login#reset" style="text-decoration:none"><span>忘记原密码</span>${icons.arrow}</a>
      </div>
    </section>

    <!-- 04 会话 -->
    <section class="b b-sessions" id="sessions-block">
      <div class="eyebrow"><span class="idx">04 / SESSIONS</span><span class="dim">6 × 3</span></div>
      <div class="rows" id="sess-list"><div class="empty">加载中…</div></div>
      <div class="bar">
        <button class="bar-cell primary" type="button" id="btn-revoke"><span>退出其他设备</span>${icons.logout}</button>
        <a class="bar-cell quiet" href="#security-block" style="text-decoration:none"><span>去改密码</span>${icons.lock}</a>
      </div>
    </section>

    <!-- 05 数据 -->
    <section class="b b-privacy b--ink" id="data-block">
      <div class="eyebrow"><span class="idx">05 / DATA</span><span class="dim">6 × 4</span></div>
      <h2 style="margin-top:16px">服务端只存账号本身</h2>
      <p class="note" style="margin-top:12px">邮箱、全名、称呼、头像、密码哈希、登录记录——账号之外没有别的东西，也没有「云端同步」开关。各产品自己的内容不归这里管。</p>
      <p class="note">密码用 PBKDF2-SHA256 加盐存储，服务端不留明文；登录态是 HttpOnly 会话 Cookie。<b>头像</b>是一张 256×256 的 JPEG，按账号 UUID 取图，不含个人信息。</p>
      <div class="meta" style="margin-top:auto">
        <span id="meta-avatar">AVATAR v0</span>
        <span>SESSION 30 DAYS</span>
        <span>${origin.replace(/^https?:\/\//, "")}</span>
      </div>
    </section>

    <!-- 06 危险区 -->
    <section class="b b-danger b--brick" id="danger-block">
      <div class="eyebrow"><span class="idx">06 / DELETE</span><span class="dim">3 × 4</span></div>
      <p class="note" style="margin-top:16px">删除后账号、头像、登录态一并消失，无法恢复。</p>
      <div class="field" style="margin-top:14px">
        <label for="f-confirm-email">输入邮箱确认</label>
        <input id="f-confirm-email" type="email" autocomplete="off" spellcheck="false" placeholder="与账号邮箱完全一致">
      </div>
      <div class="field" style="margin-top:12px">
        <label for="f-confirm-pass">账号密码</label>
        <input id="f-confirm-pass" type="password" autocomplete="current-password" placeholder="密码">
      </div>
      <div class="bar">
        <button class="bar-cell primary" type="button" id="btn-delete"><span>删除账户</span>${icons.trash}</button>
      </div>
    </section>

    <!-- 07 字格 -->
    <section class="b b-mark">
      <div class="eyebrow"><span class="idx">07 / MARK</span><span class="dim">2 × 4</span></div>
      <div class="markbody">
        <div class="mark"><span id="mark-char">N</span></div>
        <div class="meta">
          <b>NAIROCY</b>
          <span id="mark-uid">UNAFFILIATED</span>
          <span>UNIFIED ID</span>
        </div>
      </div>
    </section>

    <!-- 08 竖脊 -->
    <section class="b b-spine" aria-hidden="true">
      <span class="sq"></span>
      <span class="vt">统一账号 · UNIFIED ID</span>
      <span class="vno">${host}</span>
    </section>
  </main>

  <footer class="footer">
    <span>© 2026 <b>Nairocy</b> · 账户中心</span>
    <span id="foot-mail">—</span>
  </footer>
</div>

<div class="toast" id="toast" role="status" aria-live="polite"></div>

<script>
(function(){
  var toastEl = document.getElementById('toast');
  var toastTimer = 0;
  var me = null;

  function $(id){ return document.getElementById(id); }
  function say(msg, kind){
    toastEl.textContent = msg || '';
    toastEl.className = 'toast' + (kind ? ' ' + kind : '') + (msg ? ' on' : '');
    clearTimeout(toastTimer);
    if (msg) toastTimer = setTimeout(function(){ toastEl.className = 'toast'; }, 4200);
  }
  function api(method, path, body){
    var opt = { method: method, credentials: 'same-origin', headers: {} };
    if (body !== undefined) {
      opt.headers['content-type'] = 'application/json';
      opt.body = JSON.stringify(body);
    }
    return fetch(path, opt).then(function(r){
      return r.json().catch(function(){ return {ok:false, error:'响应异常 (' + r.status + ')'}; }).then(function(d){
        if (r.status === 401) { location.href = '/'; }
        return d;
      });
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
  function pad(n){ return (n < 10 ? '0' : '') + n; }
  function fmt(ts){
    if (!ts) return '—';
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function shortUid(id){
    if (!id) return '—';
    return id.replace(/-/g, '').slice(0, 8).toUpperCase();
  }
  function initialOf(name, email){
    var s = (name || '').trim() || (email || '').trim();
    if (!s) return 'N';
    var ch = s.charAt(0);
    return ch.toUpperCase();
  }
  function uaLabel(ua){
    if (!ua) return '未知设备';
    var os = /Android/i.test(ua) ? 'Android'
      : /iPhone|iPad|iPod/i.test(ua) ? 'iOS'
      : /Windows/i.test(ua) ? 'Windows'
      : /Macintosh|Mac OS X/i.test(ua) ? 'macOS'
      : /Linux/i.test(ua) ? 'Linux' : '其他';
    var br = /Edg\\//i.test(ua) ? 'Edge'
      : /OPR\\//i.test(ua) ? 'Opera'
      : /Chrome\\//i.test(ua) ? 'Chrome'
      : /Firefox\\//i.test(ua) ? 'Firefox'
      : /Safari\\//i.test(ua) ? 'Safari' : '浏览器';
    return br + ' · ' + os;
  }

  function renderAvatar(){
    var box = $('avatar');
    var initial = initialOf(me.preferredName || me.displayName, me.email);
    box.textContent = '';
    if (me.avatarVer > 0) {
      var img = document.createElement('img');
      img.alt = '头像';
      img.src = '/api/avatar/' + encodeURIComponent(me.id) + '?v=' + me.avatarVer;
      box.appendChild(img);
    } else {
      var span = document.createElement('span');
      span.textContent = initial;
      box.appendChild(span);
    }
    $('brand-mark').textContent = initial;
    $('mark-char').textContent = initial;
  }

  function fill(){
    $('hero-email').textContent = me.email || '—';
    $('hero-name').textContent = (me.preferredName || me.displayName || '未设置称呼').toUpperCase();
    $('meta-joined').textContent = 'JOINED ' + fmt(me.createdAt);
    $('meta-uid').textContent = 'UID ' + shortUid(me.id);
    $('mark-uid').textContent = shortUid(me.id);
    $('meta-avatar').textContent = 'AVATAR v' + (me.avatarVer || 0);
    $('foot-mail').textContent = me.email || '—';
    $('f-fullname').value = me.displayName || '';
    $('f-nickname').value = me.preferredName || '';
    renderAvatar();
  }

  function bootstrap(){
    Promise.all([api('GET', '/api/profile'), api('GET', '/api/sessions')]).then(function(res){
      var d = res[0];
      if (!d.ok) { location.href = '/'; return; }
      me = d.user;
      fill();
      renderSessions(res[1]);
    }).catch(function(){ say('加载账号信息失败，请刷新', 'err'); });
  }

  function renderSessions(payload){
    var list = $('sess-list');
    list.textContent = '';
    if (!payload || !payload.ok || !payload.sessions || !payload.sessions.length) {
      var e = document.createElement('div');
      e.className = 'empty';
      e.textContent = '没有有效会话';
      list.appendChild(e);
      return;
    }
    payload.sessions.forEach(function(s){
      var row = document.createElement('div');
      row.className = 'row';
      var k = document.createElement('div');
      k.className = 'k';
      var dot = document.createElement('span');
      dot.className = 'dot' + (s.current ? ' cur' : '');
      var name = document.createElement('b');
      name.textContent = uaLabel(s.ua);
      k.appendChild(dot);
      k.appendChild(name);
      if (s.current) {
        var tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = '当前';
        k.appendChild(tag);
      }
      var v = document.createElement('div');
      v.className = 'v';
      v.textContent = fmt(s.createdAt);
      row.appendChild(k);
      row.appendChild(v);
      list.appendChild(row);
    });
  }

  // 保存资料
  $('btn-save-profile').addEventListener('click', function(){
    var btn = this;
    var fn = $('f-fullname').value.trim();
    var nn = $('f-nickname').value.trim();
    busy(btn, true, '保存中…');
    api('PATCH', '/api/profile', { displayName: fn, preferredName: nn }).then(function(d){
      busy(btn, false);
      if (!d.ok){ say(d.error || '保存失败', 'err'); return; }
      me = d.user;
      fill();
      say('资料已保存', 'ok');
    }).catch(function(){ busy(btn, false); say('网络异常，请重试', 'err'); });
  });

  // 头像：选图 → 居中裁方 256 → JPEG → PUT
  $('btn-avatar').addEventListener('click', function(){ $('file-avatar').click(); });
  $('file-avatar').addEventListener('change', function(){
    var file = this.files && this.files[0];
    this.value = '';
    if (!file) return;
    if (file.size > 8 * 1024 * 1024){ say('图片太大，请选 8MB 以内', 'err'); return; }
    var reader = new FileReader();
    reader.onload = function(){
      var img = new Image();
      img.onload = function(){
        var side = Math.min(img.width, img.height);
        var cv = document.createElement('canvas');
        cv.width = 256; cv.height = 256;
        var ctx = cv.getContext('2d');
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256);
        cv.toBlob(function(blob){
          if (!blob){ say('图片处理失败', 'err'); return; }
          var btn = $('btn-avatar');
          busy(btn, true, '上传中…');
          fetch('/api/profile/avatar', {
            method: 'PUT',
            credentials: 'same-origin',
            headers: { 'content-type': 'image/jpeg' },
            body: blob
          }).then(function(r){ return r.json(); }).then(function(d){
            busy(btn, false);
            if (!d.ok){ say(d.error || '上传失败', 'err'); return; }
            me.avatarVer = d.avatarVer;
            renderAvatar();
            $('meta-avatar').textContent = 'AVATAR v' + me.avatarVer;
            say('头像已更新', 'ok');
          }).catch(function(){ busy(btn, false); say('上传失败，请重试', 'err'); });
        }, 'image/jpeg', 0.88);
      };
      img.onerror = function(){ say('这个文件不是图片', 'err'); };
      img.src = reader.result;
    };
    reader.onerror = function(){ say('读取文件失败', 'err'); };
    reader.readAsDataURL(file);
  });

  // 改密码
  $('btn-change-pass').addEventListener('click', function(){
    var btn = this;
    var oldp = $('f-oldpass').value;
    var p1 = $('f-newpass').value;
    var p2 = $('f-newpass2').value;
    if (!oldp){ say('先填原密码', 'err'); return; }
    if (p1.length < 8){ say('新密码至少 8 位', 'err'); return; }
    if (p1 !== p2){ say('两次输入的新密码不一致', 'err'); return; }
    busy(btn, true, '更新中…');
    api('POST', '/api/password', { oldPassword: oldp, newPassword: p1 }).then(function(d){
      busy(btn, false);
      if (!d.ok){ say(d.error || '更新失败', 'err'); return; }
      $('f-oldpass').value = ''; $('f-newpass').value = ''; $('f-newpass2').value = '';
      say('密码已更新，其他设备已被登出', 'ok');
      api('GET', '/api/sessions').then(renderSessions);
    }).catch(function(){ busy(btn, false); say('网络异常，请重试', 'err'); });
  });

  // 退出其他设备
  $('btn-revoke').addEventListener('click', function(){
    var btn = this;
    busy(btn, true, '处理中…');
    api('POST', '/api/sessions/revoke', {}).then(function(d){
      busy(btn, false);
      if (!d.ok){ say(d.error || '操作失败', 'err'); return; }
      say('其他设备已全部登出', 'ok');
      api('GET', '/api/sessions').then(renderSessions);
    }).catch(function(){ busy(btn, false); say('网络异常，请重试', 'err'); });
  });

  // 删除账户
  $('btn-delete').addEventListener('click', function(){
    var btn = this;
    var email = $('f-confirm-email').value.trim();
    var pass = $('f-confirm-pass').value;
    if (!email || !pass){ say('确认邮箱和密码都要填', 'err'); return; }
    if (email !== me.email){ say('确认邮箱与账号不一致', 'err'); return; }
    if (!confirm('删除账号 ' + me.email + '？此操作不可恢复。')) return;
    busy(btn, true, '删除中…');
    api('DELETE', '/api/account', { email: email, password: pass }).then(function(d){
      busy(btn, false);
      if (!d.ok){ say(d.error || '删除失败', 'err'); return; }
      say('账号已删除', 'ok');
      setTimeout(function(){ location.href = '/'; }, 800);
    }).catch(function(){ busy(btn, false); say('网络异常，请重试', 'err'); });
  });

  // 退出登录
  $('btn-logout').addEventListener('click', function(){
    busy(this, true, '退出中…');
    api('POST', '/api/logout', {}).then(function(){ location.href = '/'; })
      .catch(function(){ location.href = '/'; });
  });

  bootstrap();
})();
</script>
</body>
</html>`;
}
