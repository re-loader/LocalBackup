/* The account page (pages/<lang>/account.html): the Reload OS Account - sign in, add a device by the code on its
 * screen, the devices and what they run. The account is Studio's (the same sign-in in this browser: one key in
 * localStorage); the texts are the page's (its "acct-texts" block). */
(function () {
  var box = document.getElementById('account');
  if (!box) return;
  var T = JSON.parse(document.getElementById('acct-texts').textContent);
  var API = box.dataset.api || (box.dataset.root + 'api/account'), LANG = box.dataset.lang;
  var KEY = 'ros-studio-account', CODE_KEY = 'ros-account-code';
  var account = null, info = null, mode = 'in', resetToken = null, pending = null, timer = null;
  var $ = function (id) { return document.getElementById(id); };
  try { account = JSON.parse(localStorage.getItem(KEY)); } catch (e) { account = null; }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function fill(t, v) { return t.replace('%s', v); }
  function say(msg) { return (T.errors && T.errors[msg]) || msg; }

  function api(method, p, body) {
    return fetch(API + p, { method: method, cache: 'no-store',
      headers: Object.assign({ 'Content-Type': 'application/json' }, account ? { Authorization: 'Bearer ' + account.token } : {}),
      body: body == null ? undefined : JSON.stringify(body) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.ok) return j;
          var e = new Error(say(j.error || 'The server answered ' + r.status));
          e.status = r.status;
          e.body = j;
          if (r.status === 401 && account && p !== '/login') { setAccount(null); show(); }
          throw e;
        });
      }, function () { throw new Error(say('The server does not answer')); });
  }
  function setAccount(a) {
    account = a;
    try { if (a) localStorage.setItem(KEY, JSON.stringify(a)); else localStorage.removeItem(KEY); } catch (e) { /* this page only */ }
  }

  /* a code from the device's QR (?code=...) or typed: kept while the person signs up and confirms the mail */
  function codeOf(v) {
    var s = String(v || '').toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
    return /^[0-9A-HJKMNP-TV-Z]{8}$/.test(s) ? s : '';
  }
  var codeText = function (c) { return c.slice(0, 4) + '-' + c.slice(4); };
  function keepCode(c) {
    pending = c || null;
    try {
      if (c) localStorage.setItem(CODE_KEY, JSON.stringify({ code: c, at: Date.now() }));
      else localStorage.removeItem(CODE_KEY);
    } catch (e) { /* this page only */ }
    document.querySelectorAll('a.lang').forEach(function (a) {      /* the other language's page takes it along */
      a.href = a.href.split('?')[0] + (c ? '?code=' + c : '');
    });
  }
  var q = new URLSearchParams(location.search), fromMail = { verify: q.get('verify'), reset: q.get('reset') };
  var first = codeOf(q.get('code'));
  if (!first) {
    try {
      var kept = JSON.parse(localStorage.getItem(CODE_KEY));
      if (kept && Date.now() - kept.at < 15 * 60 * 1000) first = codeOf(kept.code);
    } catch (e) { first = ''; }
  }
  keepCode(first);
  if (location.search) { try { history.replaceState(null, '', location.pathname); } catch (e) { /* stays */ } }

  // ---------------------------------------------------------------- signed out

  function form(m, note) {
    mode = m;
    $('acct-title').textContent = T.titles[m];
    $('f-name').hidden = m !== 'up';
    $('f-email').hidden = m === 'reset';
    $('f-pass').hidden = m === 'forgot';
    $('acct-pass').autocomplete = m === 'in' ? 'current-password' : 'new-password';
    $('acct-pass').value = '';
    $('acct-go').textContent = T.go[m];
    var sw = m === 'in' ? (info && info.signup ? T.toUp : '') : T.toIn;
    $('acct-switch').textContent = sw;
    $('acct-switch').hidden = !sw;
    $('acct-forgot').hidden = m !== 'in';
    $('acct-note').textContent = note || (m === 'in' && info && !info.signup ? T.notes.inClosed : T.notes[m]);
    $('acct-err').replaceChildren();
  }
  $('acct-switch').addEventListener('click', function () { form(mode === 'in' ? 'up' : 'in'); });
  $('acct-forgot').addEventListener('click', function () { form('forgot'); });
  $('acct-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var email = $('acct-email').value.trim(), pass = $('acct-pass').value, name = $('acct-name').value.trim(), go = $('acct-go');
    var err = function (x) {
      $('acct-err').replaceChildren(x.message);
      if (x.body && x.body.unverified) {
        var again = el('button', 'acct-link', T.resend);
        again.type = 'button';
        again.addEventListener('click', function () {
          api('POST', '/resend', { email: email, page: 'account', lang: LANG }).then(function () { form('in', fill(T.resent, email)); }, err);
        });
        $('acct-err').append(' ', again);
      }
    };
    go.disabled = true;
    var p;
    if (mode === 'in') {
      p = api('POST', '/login', { email: email, password: pass }).then(function (r) {
        setAccount({ token: r.token, email: r.user.email, name: r.user.name });
        show();
      });
    } else if (mode === 'up') {
      p = api('POST', '/signup', { email: email, password: pass, name: name, lang: LANG, page: 'account' })
        .then(function () { form('in', fill(T.sent, email)); });
    } else if (mode === 'forgot') {
      p = api('POST', '/forgot', { email: email, page: 'account', lang: LANG }).then(function () { form('in', fill(T.sentIf, email)); });
    } else {
      /* the new password set: signed in with it (the server's answer has the session) - asked to sign in again, a
       * browser fills in the password it has saved, the old one */
      p = api('POST', '/reset', { token: resetToken, password: pass }).then(function (r) {
        resetToken = null;
        mode = 'in';
        if (!r.token) { form('in', T.resetDone); return; }      /* a closed account: its sign-in says so */
        setAccount({ token: r.token, email: r.user.email, name: r.user.name });
        show();
        $('acct-done').textContent = T.resetIn;
        $('acct-done').hidden = false;
      });
    }
    p.catch(err).then(function () { go.disabled = false; });
  });

  // ---------------------------------------------------------------- signed in: the devices

  var boardName = function (b) { return String(b || '').toUpperCase().replace(/_/g, '-'); };
  function ago(t) {
    var s = Math.max(0, Math.floor(Date.now() / 1000) - t);
    if (s < 120) return T.now;
    if (s < 3600) return fill(T.min, Math.floor(s / 60));
    if (s < 86400) return fill(T.hour, Math.floor(s / 3600));
    if (s < 30 * 86400) return fill(T.day, Math.floor(s / 86400));
    return new Date(t * 1000).toLocaleDateString();
  }
  function what(d) {
    return T.what.replace('%b', boardName(d.board)).replace('%p · ', d.product && d.product !== 'os' ? d.product + ' · ' : '')  /* "os": one image per board, nothing to say */.replace('%v', d.fw || '?')
      .replace('%l', d.licensed ? T.licensed : d.activating ? T.activating : d.trial > 0 ? fill(T.trial, d.trial)
        : d.trial === 0 ? T.freeLocked : T.free);
  }
  function devices() {
    return api('GET', '/devices').then(function (r) {
      var list = $('acct-devices');
      list.replaceChildren();
      $('acct-empty').hidden = r.devices.length > 0;
      r.devices.forEach(function (d) {
        var row = el('div', 'acct-dev'), main = el('div', 'acct-dev-main'), acts = el('div', 'acct-dev-acts');
        var head = el('p', 'acct-dev-name');
        head.append(el('strong', '', d.name || boardName(d.board)), ' ',
          d.update ? el('span', 'badge accent', fill(T.update, d.latest)) : d.latest ? el('span', 'badge ok', T.current) : '');
        main.append(head, el('p', 'muted', what(d) + ' · ' + fill(T.seen, ago(d.seen))), el('p', 'acct-dev-id', d.device));
        // the apps from files it has and their own versions, as it said them at its last check-in
        if (d.apps && d.apps.length) {
          // ... and, where the update server has a newer one of an app for this board, that version
          main.append(el('p', 'muted', T.apps + ' ' + d.apps.map(function (a) {
            return a.name + ' ' + (a.ver || T.noVer) + (a.update ? ' ' + fill(T.appNew, a.latest) : '');
          }).join(' · ')));
        }
        if (d.update) main.append(el('p', 'muted', T.howto));
        var ren = el('button', 'btn small', T.rename), rem = el('button', 'btn small', T.remove);
        ren.type = rem.type = 'button';
        ren.addEventListener('click', function () {
          var n = prompt(T.renameAsk, d.name);
          if (n == null || !n.trim() || n.trim() === d.name) return;
          api('PUT', '/devices/' + d.id, { name: n.trim() }).then(devices, function (e) { alert(e.message); });
        });
        rem.addEventListener('click', function () {
          if (!confirm(fill(T.removeAsk, d.name || d.device))) return;
          api('DELETE', '/devices/' + d.id).then(devices, function (e) { alert(e.message); });
        });
        acts.append(ren, rem);
        if (!d.licensed && !d.activating) {             // a product key typed here: the device takes its license at its next contact
          var act = el('button', 'btn small primary', T.activate);
          act.type = 'button';
          act.addEventListener('click', function () {
            var k = prompt(fill(T.keyAsk, d.name || d.device));
            if (k == null || !k.trim()) return;
            api('POST', '/devices/' + d.id + '/activate', { key: k.trim() })
              .then(function () { alert(T.keyDone); return devices(); }, function (e) { alert(e.message); });
          });
          acts.prepend(act);
        }
        if (d.activating) main.append(el('p', 'muted', T.keyDone));
        if (d.store) main.append(store(d));
        row.append(main, acts);
        list.append(row);
      });
    });
  }

  /* The device's store - the apps its own Settings > Apps > Get apps offers (the public ones and those given to the
   * account): Install / Update here, and the device takes it at its next contact (within minutes), then says how it
   * went. Folded while nothing is under way. */
  /* an app's tile as its device shows it (main/ros_elfapp.c, ros_shell.c): its picture (the update server has it) -
   * on white when the app asks for that -, else its drawn icon (the firmware's ICONS - build.py checks the list) or
   * symbol on its colour; an icon the firmware does not draw, or none, leaves a file app's own look there: the SD card
   * symbol on violet */
  var APPS = API.replace(/api\/(account|studio)$/, 'api/v1/apps'), ICONS = box.dataset.root + 'assets/icons/';
  var DRAWN = ['camera', 'chart', 'chip', 'clock', 'database', 'globe', 'globe_s', 'heartbeat', 'hotspot', 'idcard', 'idcard_s', 'info', 'lan', 'mic', 'moon', 'screen', 'stopwatch', 'sun'];
  function appIcon(a, board) {
    var white = Boolean(a.tile && a.white);
    var b = el('div', 'store-icon acct-store-icon' + (white ? ' store-white' : ''));
    b.setAttribute('aria-hidden', 'true');
    if (!white) b.style.background = a.color || '#6b4fbb';                       // 0x6B4FBB
    if (a.tile) {
      var img = el('img', '');
      img.alt = '';
      img.loading = 'lazy';
      img.src = APPS + '/' + board + '/' + a.id + '/tile';
      b.append(img);
    } else if (a.icon && a.icon.charAt(0) === '@' && DRAWN.indexOf(a.icon.slice(1)) >= 0) {
      var pic = el('i', 'store-drawn'), url = 'url(' + ICONS + a.icon.slice(1) + '.png)';
      pic.style.webkitMaskImage = url;
      pic.style.maskImage = url;
      b.append(pic);
    } else b.append(el('span', 'store-glyph', String.fromCodePoint(parseInt(a.icon && /^[0-9a-f]{4,5}$/.test(a.icon) ? a.icon : 'f7c2', 16))));
    return b;                                                                     // f7c2: LV_SYMBOL_SD_CARD
  }
  function store(d) {
    var box = el('details', 'acct-store'), list = el('div', 'acct-store-list');
    var busy = d.store.some(function (a) { return a.install && a.install.state === 'waiting'; });
    box.open = busy || !!open[d.device];
    box.addEventListener('toggle', function () { open[d.device] = box.open; });
    box.append(el('summary', '', T.store + ' (' + d.store.length + ')'));
    var locked = !d.licensed && d.trial === 0;
    if (!d.remote) list.append(el('p', 'muted', T.storeOld));
    else if (locked) list.append(el('p', 'muted', T.storeFree));
    if (!d.store.length) list.append(el('p', 'muted', T.storeEmpty));
    d.store.forEach(function (a) {
      var line = el('div', 'acct-store-app'), txt = el('p', '');
      txt.append(el('strong', '', a.name), ' ' + a.version + ' · ' + (a.size < 1e5 ? Math.max(1, Math.ceil(a.size / 1000)) + ' KB' : fill(T.size, (a.size / 1e6).toFixed(1))));
      if (a.have != null) txt.append(' · ', el('span', 'muted', fill(T.installedAs, a.have || T.noVer)));
      var st = a.install, note = null, btn = null;
      if (st && st.state === 'waiting') note = el('span', 'muted', T.waiting);
      else if (st && st.state === 'failed') note = el('span', 'acct-err', fill(T.instFail, st.msg === 'no_answer' ? T.noAnswer : st.msg || '?'));
      else if (st && st.state === 'done' && a.have != null) note = null;
      else if (st && st.state === 'done') note = el('span', 'muted', fill(T.instDone, st.ver));
      if (note) txt.append(el('br'), note);
      if (st && st.state === 'waiting') {
        btn = el('button', 'btn small', T.cancel);
        btn.addEventListener('click', function () {
          btn.disabled = true;
          api('POST', '/devices/' + d.id + '/install', { app: a.id, cancel: true }).then(devices, function (e) { alert(e.message); btn.disabled = false; });
        });
      } else if (d.remote && !locked && (a.have == null || a.update)) {
        btn = el('button', 'btn small primary', a.have == null ? T.install : T.updateApp);
        btn.addEventListener('click', function () {
          if (a.have == null && !confirm(T.instAsk.replace('%a', a.name).replace('%d', d.name || d.device))) return;
          btn.disabled = true;
          open[d.device] = true;
          api('POST', '/devices/' + d.id + '/install', { app: a.id }).then(devices, function (e) { alert(e.message); btn.disabled = false; });
        });
      }
      line.append(appIcon(a, d.board), txt);
      if (btn) { btn.type = 'button'; line.append(btn); }
      list.append(line);
    });
    box.append(list);
    if (busy) watch();
    return box;
  }
  var open = {}, quick = null;
  /* while an install waits: the list again every 15 s for a few minutes */
  function watch() {
    if (quick) return;
    var n = 0;
    quick = setInterval(function () {
      if (!account || ++n > 40) { clearInterval(quick); quick = null; return; }
      if (document.visibilityState === 'visible') devices().catch(function () {});
    }, 15000);
  }

  /* the device a code belongs to: asked for a yes */
  function ask(code) {
    $('acct-code-err').textContent = '';
    $('acct-done').hidden = true;
    return api('GET', '/link?code=' + encodeURIComponent(code)).then(function (l) {
      keepCode(code);
      $('acct-link-what').replaceChildren(el('strong', '', codeText(code)), ' · ', what(l), el('br'),
        el('span', 'acct-dev-id', fill(T.id, l.device)), l.mine ? el('br') : '', l.mine ? el('span', 'muted', fill(T.mine, l.name)) : '');
      $('acct-link-name').value = l.name || '';
      $('acct-link-err').textContent = '';
      $('acct-link').hidden = false;
      $('acct-link-name').focus();
    }, function (e) {
      keepCode(null);
      $('acct-link').hidden = true;
      $('acct-code-err').textContent = e.message;
    });
  }
  $('acct-link-yes').addEventListener('click', function () {
    var btn = $('acct-link-yes');
    btn.disabled = true;
    api('POST', '/link', { code: pending, name: $('acct-link-name').value.trim() }).then(function (r) {
      keepCode(null);
      $('acct-link').hidden = true;
      $('acct-code').value = '';
      $('acct-done').textContent = fill(T.added, r.name);
      $('acct-done').hidden = false;
      [2500, 6000, 12000].forEach(function (ms) { setTimeout(function () { if (account) devices().catch(function () {}); }, ms); });
    }, function (e) { $('acct-link-err').textContent = e.message; }).then(function () { btn.disabled = false; });
  });
  $('acct-link-no').addEventListener('click', function () { keepCode(null); $('acct-link').hidden = true; });
  $('acct-code-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var c = codeOf($('acct-code').value);
    if (!c) { $('acct-code-err').textContent = say('A code is 8 letters and digits, as on the device: ABCD-2345'); return; }
    ask(c);
  });
  $('acct-notify').addEventListener('change', function () {
    api('PUT', '/me', { notify: $('acct-notify').checked }).catch(function (e) { alert(e.message); });
  });
  $('acct-lang').addEventListener('change', function () {
    api('PUT', '/me', { lang: $('acct-lang').value }).catch(function (e) { alert(e.message); });
  });
  $('acct-out').addEventListener('click', function () {
    api('POST', '/logout').catch(function () {}).then(function () { setAccount(null); show(); });
  });

  // ---------------------------------------------------------------- which of the two

  function show() {
    $('acct-wait').hidden = true;
    clearInterval(timer);
    if (!account) {
      $('acct-in').hidden = true;
      $('acct-done').hidden = true;           /* what the last person here was told */
      $('acct-sign').hidden = false;
      $('acct-code-note').hidden = !pending;
      if (pending) $('acct-code-note').textContent = fill(T.codeNote, codeText(pending));
      form(mode === 'reset' && resetToken ? 'reset' : 'in');
      return;
    }
    $('acct-sign').hidden = true;
    $('acct-in').hidden = false;
    $('acct-who').textContent = account.name ? account.name + ' (' + account.email + ')' : account.email;
    api('GET', '/me').then(function (r) {
      account.name = r.user.name;
      setAccount(account);
      $('acct-who').textContent = r.user.name ? r.user.name + ' (' + r.user.email + ')' : r.user.email;
      $('acct-notify').checked = !!r.user.notify;
      $('acct-lang').value = r.user.lang === 'th' ? 'th' : 'en';
      return devices();
    }).then(function () {
      if (pending) ask(pending);
      timer = setInterval(function () { if (account && document.visibilityState === 'visible') devices().catch(function () {}); }, 60000);
    }).catch(function () { /* signed out meanwhile (401): show() ran */ });
  }

  fetch(API, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (i) {
    info = i;
    if (!info) { $('acct-wait').textContent = T.offline; return; }
    if (fromMail.reset) {                       /* a link from a mail: a new password */
      resetToken = fromMail.reset;
      setAccount(null);
      mode = 'reset';
      show();
      return;
    }
    if (fromMail.verify) {                      /* ... or the address confirmed */
      api('POST', '/verify', { token: fromMail.verify }).then(function () { show(); if (!account) form('in', T.verified); },
        function (e) { show(); if (!account) form('in', e.message); });
      return;
    }
    show();
  });
})();
