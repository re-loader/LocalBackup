/* The key desk (admin/index.html): product keys made, listed and revoked by people at Reloader. The sign-in is the
 * Reload OS Account's (the same one in this browser as the account page and Studio: one key in localStorage); whether
 * that account may use the desk is the server's word (its list of admins). The keys come only in the answers to the
 * signed-in admin and stay hidden on the page until "Show the keys" is ticked. Apps given to accounts are the account
 * server's (api/account/admin/apps, its own ADMIN_EMAILS): the section shows only to someone on that list. */
(function () {
  var box = document.getElementById('desk');
  if (!box) return;
  var ROOT = box.dataset.root, ACCOUNT = ROOT + 'api/account', DESK = ROOT + 'api/shop/admin', KEY = 'ros-studio-account';
  var account = null, keys = [], made = [], MAX_ROWS = 300;
  var $ = function (id) { return document.getElementById(id); };
  var SAY = { sign_in: 'Sign in again', not_admin: 'This account is not on the key desk\'s list', bad_note: 'Say who the keys are for',
    bad_count: '1 to 100 keys at a time', rate_limited: 'Too many for today: ask for a higher limit, or wait', bad_key: 'Not a product key',
    key_unknown: 'Not a key of this server', no_account_server: 'The account service does not answer: try again in a moment',
    not_found: 'Not found', upload_off: 'Publishing here is off on this server', not_newer: 'Not newer than the version on the server',
    not_tested: 'Only a file that ran on that board', too_large: 'The file is too large', bad_app: 'Not an app file', shop_closed: 'The shop is off on this server', 'Wrong email or password': 'Wrong email or password' };
  try { account = JSON.parse(localStorage.getItem(KEY)); } catch (e) { account = null; }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function api(base, method, p, body) {
    return fetch(base + p, { method: method, cache: 'no-store',
      headers: Object.assign({ 'Content-Type': body instanceof Blob ? 'application/octet-stream' : 'application/json' }, account ? { Authorization: 'Bearer ' + account.token } : {}),
      body: body == null ? undefined : body instanceof Blob ? body : JSON.stringify(body) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.ok) return j;
          var e = new Error((j.error === 'bad_app' && j.detail) || SAY[j.error] || j.error || 'The server answered ' + r.status);
          e.status = r.status;
          throw e;
        });
      }, function () { var e = new Error('The server does not answer'); e.status = 0; throw e; });
  }
  function setAccount(a) {
    account = a;
    try { if (a) localStorage.setItem(KEY, JSON.stringify(a)); else localStorage.removeItem(KEY); } catch (e) { /* this page only */ }
  }
  function view(id, note) {
    ['desk-wait', 'desk-no', 'desk-sign', 'desk-in'].forEach(function (v) { $(v).hidden = v !== id; });
    if (note != null) $('desk-no').textContent = note;
  }
  var day = function (iso) { return iso ? iso.slice(0, 10) : ''; };
  var hide = function (k) { return k.slice(0, 4) + '-····-····-····'; };

  // ---------------------------------------------------------------- who

  function start() {
    if (!account || !account.token) return view('desk-sign');
    view('desk-wait');
    api(DESK, 'GET', '').then(function (r) {
      $('desk-who').textContent = r.email;
      $('desk-shop').hidden = !r.shop;
      view('desk-in');
      load();
      loadStore();
      loadAccounts();
    }, function (x) {
      if (x.status === 401) { setAccount(null); return view('desk-sign'); }
      if (x.status === 403) { $('desk-sign-err').textContent = x.message + ' (' + account.email + ')'; setAccount(null); return view('desk-sign'); }
      view('desk-no', x.status === 404 ? 'There is no key desk on this server.' : x.message);
    });
  }
  $('desk-sign').addEventListener('submit', function (e) {
    e.preventDefault();
    var go = $('desk-sign-go');
    go.disabled = true;
    $('desk-sign-err').textContent = '';
    api(ACCOUNT, 'POST', '/login', { email: $('desk-email').value.trim(), password: $('desk-pass').value }).then(function (r) {
      $('desk-pass').value = '';
      setAccount({ token: r.token, email: r.user.email, name: r.user.name });
      start();
    }, function (x) { $('desk-sign-err').textContent = x.message; }).then(function () { go.disabled = false; });
  });
  $('desk-out').addEventListener('click', function () {
    api(ACCOUNT, 'POST', '/logout').catch(function () { /* signed out here anyway */ }).then(function () {
      setAccount(null);
      keys = made = accounts = storeApps = [];
      $('desk-store').hidden = true;
      pickFile(null);
      $('desk-keys').tBodies[0].replaceChildren();
      $('desk-accounts').tBodies[0].replaceChildren();
      $('desk-apps').hidden = true;
      $('desk-made').hidden = true;
      view('desk-sign');
    });
  });

  // ---------------------------------------------------------------- make keys

  $('desk-new').addEventListener('submit', function (e) {
    e.preventDefault();
    var go = $('desk-new-go'), count = parseInt($('desk-count').value, 10), note = $('desk-note').value.trim();
    $('desk-new-err').textContent = '';
    go.disabled = true;
    api(DESK, 'POST', '/keys', { count: count, note: note }).then(function (r) {
      made = r.keys;
      $('desk-made-what').textContent = r.keys.length + (r.keys.length === 1 ? ' key' : ' keys') + ' for: ' + note +
        ' (#' + r.keys[0].id + (r.keys.length > 1 ? ' to #' + r.keys[r.keys.length - 1].id : '') + ')';
      var list = $('desk-made-keys');
      list.replaceChildren();
      r.keys.forEach(function (k) { list.appendChild(el('li', null, k.key)); });
      $('desk-made-copy').textContent = 'Copy';
      $('desk-made').hidden = false;
      $('desk-note').value = '';
      load();
    }, function (x) { $('desk-new-err').textContent = x.message; }).then(function () { go.disabled = false; });
  });
  var madeText = function () { return made.map(function (k) { return k.key; }).join('\n') + '\n'; };
  $('desk-made-copy').addEventListener('click', function () {
    navigator.clipboard.writeText(madeText()).then(function () { $('desk-made-copy').textContent = 'Copied'; });
  });
  $('desk-made-save').addEventListener('click', function () {
    var a = el('a');
    a.href = URL.createObjectURL(new Blob([madeText()], { type: 'text/plain' }));
    a.download = 'reloados-keys-' + made[0].id + (made.length > 1 ? '-' + made[made.length - 1].id : '') + '.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // ---------------------------------------------------------------- the keys, the orders

  function drawKeys() {
    var find = $('desk-find').value.trim().toLowerCase().replace(/^#/, ''), state = $('desk-state').value, show = $('desk-show').checked;
    var flat = find.replace(/[\s-]/g, '');
    var rows = keys.filter(function (k) {
      if (state && k.state !== state) return false;
      if (!find) return true;
      return String(k.id) === find || (k.note || '').toLowerCase().indexOf(find) >= 0 || (k.device || '').toLowerCase().indexOf(find) >= 0 ||
        (flat.length >= 4 && k.key.replace(/-/g, '').toLowerCase().indexOf(flat) >= 0);
    });
    var body = $('desk-keys').tBodies[0];
    body.replaceChildren();
    rows.slice(0, MAX_ROWS).forEach(function (k) {
      var tr = el('tr');
      tr.appendChild(el('td', null, '#' + k.id));
      tr.appendChild(el('td', 'desk-key', show ? k.key : hide(k.key)));
      tr.appendChild(el('td', 'desk-' + k.state, k.state));
      tr.appendChild(el('td', 'desk-dev', k.device ? k.device + ' ' + day(k.redeemed) : ''));
      tr.appendChild(el('td', null, day(k.created)));
      tr.appendChild(el('td', 'desk-notecell', k.note));
      var act = el('td'), b = el('button', 'acct-link', k.state === 'revoked' ? 'Take back' : 'Revoke');
      b.type = 'button';
      b.addEventListener('click', function () {
        var undo = k.state === 'revoked';
        if (!undo && !confirm('Revoke key #' + k.id + '? It activates nothing any more' + (k.device ? ' - ' + k.device + ' keeps the license it got.' : '.'))) return;
        api(DESK, 'POST', '/keys/revoke', { key: k.key, revoked: !undo }).then(load, function (x) { $('desk-err').textContent = x.message; });
      });
      act.appendChild(b);
      tr.appendChild(act);
      body.appendChild(tr);
    });
    $('desk-keys-more').textContent = rows.length > MAX_ROWS ? 'The first ' + MAX_ROWS + ' of ' + rows.length + ': narrow it down with Find.' : rows.length ? '' : 'No key here.';
  }
  function drawOrders(orders) {
    var body = $('desk-orders').tBodies[0];
    body.replaceChildren();
    orders.forEach(function (o) {
      var tr = el('tr');
      tr.appendChild(el('td', 'desk-dev', o.order + ' ' + day(o.created)));
      tr.appendChild(el('td', 'desk-' + (o.status === 'paid' ? 'used' : 'revoked'), o.status));
      tr.appendChild(el('td', 'desk-wrap', o.email + (o.tax ? ' · TAX INVOICE: ' + o.tax.name + ', ' + o.tax.address + ', ' + o.tax.id : '')));
      tr.appendChild(el('td', null, o.keys.map(function (n) { return '#' + n; }).join(' ') || (o.qty + ' x')));
      tr.appendChild(el('td', null, o.amount + ' ' + o.currency));
      tr.appendChild(el('td', null, o.status !== 'paid' ? '' : o.mailed ? 'sent ' + day(o.mailed) : 'NOT SENT' + (o.mailError ? ': ' + o.mailError : '')));
      var act = el('td');
      if (o.status === 'paid') {
        var b = el('button', 'acct-link', 'Mail again');
        b.type = 'button';
        b.addEventListener('click', function () {
          b.disabled = true;
          api(DESK, 'POST', '/orders/' + o.order + '/resend').then(function () { b.textContent = 'On its way'; }, function (x) { $('desk-err').textContent = x.message; b.disabled = false; });
        });
        act.appendChild(b);
      }
      tr.appendChild(act);
      body.appendChild(tr);
    });
  }
  function load() {
    $('desk-err').textContent = '';
    api(DESK, 'GET', '/keys').then(function (r) {
      keys = r.keys;
      $('desk-keys-count').textContent = r.unused + ' unused · ' + r.used + ' used · ' + r.revoked + ' revoked';
      drawKeys();
    }, function (x) { if (x.status === 401 || x.status === 403) return start(); $('desk-err').textContent = x.message; });
    if (!$('desk-shop').hidden) api(DESK, 'GET', '/orders').then(function (r) { drawOrders(r.orders); }, function () { /* the keys' error says it */ });
  }
  // ---------------------------------------------------------------- the apps on the update server

  var storeApps = [], storeTiles = {}, upFile = null, upApp = null;
  var unfolded = {};                                // app id -> its boards are shown (a card starts folded)
  var sizeText = function (n) { return n < 1e5 ? Math.ceil(n / 1000) + ' KB' : (n / 1e6).toFixed(1) + ' MB'; };
  /* an app's tile as its device shows it: its picture, or its icon on its colour - a drawn one ("@globe": icons/) or a
   * glyph of the devices' symbol font ("f067"); its first letter when it names neither */
  var DRAWN = ['camera', 'chart', 'chip', 'clock', 'database', 'globe', 'heartbeat', 'hotspot', 'idcard', 'info', 'lan', 'mic', 'moon', 'person', 'screen', 'stopwatch', 'sun'];
  function icon(box, a) {
    box.replaceChildren();
    box.className = 'store-icon' + (a.white ? ' store-white' : '');
    box.style.background = a.white ? '' : a.color || '';
    if (storeTiles[a.id]) {
      var img = el('img');
      img.src = storeTiles[a.id];
      img.alt = '';
      box.appendChild(img);
    } else if (a.icon && a.icon.charAt(0) === '@' && DRAWN.indexOf(a.icon.slice(1)) >= 0) {
      var pic = el('i', 'store-drawn'), url = 'url(' + ROOT + 'assets/icons/' + a.icon.slice(1) + '.png)';
      pic.style.webkitMaskImage = url;
      pic.style.maskImage = url;
      box.appendChild(pic);
    } else if (a.icon && /^[0-9a-f]{4,5}$/.test(a.icon)) {
      box.appendChild(el('span', 'store-glyph', String.fromCodePoint(parseInt(a.icon, 16))));
    } else box.textContent = (a.name || a.id).charAt(0).toUpperCase();
    return box;
  }
  function drawStore() {
    var find = $('desk-store-find').value.trim().toLowerCase(), groups = {}, order = [];
    storeApps.forEach(function (a) {
      if (find && (a.id + ' ' + a.name + ' ' + a.board).toLowerCase().indexOf(find) < 0) return;
      if (!groups[a.id]) { groups[a.id] = []; order.push(a.id); }
      groups[a.id].push(a);
    });
    order.sort(function (x, y) { return groups[x][0].name.localeCompare(groups[y][0].name); });
    var grid = $('desk-store-list');
    grid.replaceChildren();
    order.forEach(function (id) {
      var list = groups[id], first = list[0], card = el('details', 'store-card'), head = el('summary', 'store-head');
      card.open = !!unfolded[id];
      card.addEventListener('toggle', function () { unfolded[id] = card.open; });
      var pub = list.filter(function (a) { return a.public; }).length;
      var vers = list.map(function (a) { return a.version; }).filter(function (v, i, all) { return all.indexOf(v) === i; });
      var title = el('div', 'store-title');
      title.appendChild(el('h3', null, first.name));
      title.appendChild(el('p', 'muted', id + ' · ' + (vers.length === 1 ? vers[0] : vers.length + ' versions') + ' · ' +
        list.length + (list.length === 1 ? ' board' : ' boards')));
      head.appendChild(icon(el('div'), first));
      head.appendChild(title);
      head.appendChild(el('span', 'store-badge' + (pub ? ' on' : ''), pub === list.length ? 'Public' : pub ? pub + '/' + list.length + ' public' : 'Private'));
      head.appendChild(el('span', 'store-fold'));
      card.appendChild(head);
      var rows = el('ul', 'store-boards');
      list.forEach(function (a) {
        var li = el('li'), what = el('div', 'store-board');
        what.appendChild(el('span', 'desk-dev', a.board));
        what.appendChild(el('span', 'muted', a.version + ' · ' + sizeText(a.size) + ' · ' + day(a.published)));
        li.appendChild(what);
        var sw = el('label', 'store-switch'), tick = el('input');
        tick.type = 'checkbox';
        tick.checked = a.public;
        tick.setAttribute('aria-label', a.name + ' for ' + a.board + ' is public');
        sw.title = a.public ? 'Public: every device of this board is offered it' : 'Private: only the accounts it is given to';
        tick.addEventListener('change', function () {
          var on = tick.checked;
          if (on && !confirm('Show ' + a.name + ' ' + a.version + ' on every ' + a.board + '?')) { tick.checked = false; return; }
          tick.disabled = true;
          storeCall('/public', { board: a.board, id: a.id, public: on });
        });
        sw.appendChild(tick);
        sw.appendChild(el('span'));
        li.appendChild(sw);
        var b = el('button', 'acct-link store-off', '×');
        b.type = 'button';
        b.title = 'Take ' + a.name + ' off for ' + a.board;
        b.setAttribute('aria-label', b.title);
        b.addEventListener('click', function () {
          if (!confirm('Take ' + a.name + ' off for ' + a.board + '? No device is offered it or an update of it any more; one that has it keeps it.')) return;
          b.disabled = true;
          storeCall('/remove', { board: a.board, id: a.id });
        });
        li.appendChild(b);
        rows.appendChild(li);
      });
      card.appendChild(rows);
      grid.appendChild(card);
    });
    var ids = storeApps.map(function (a) { return a.id; }).filter(function (v, i, all) { return all.indexOf(v) === i; });
    $('desk-store-count').textContent = ids.length + (ids.length === 1 ? ' app · ' : ' apps · ') +
      storeApps.filter(function (a) { return a.public; }).length + ' public releases · ' +
      storeApps.filter(function (a) { return !a.public; }).length + ' private';
    $('desk-store-more').textContent = order.length ? '' : find ? 'No app here.' : 'No app on the server yet.';
    $('desk-store-fold').hidden = !order.length;
    $('desk-store-fold').textContent = order.every(function (id) { return unfolded[id]; }) ? 'Fold all' : 'Show all boards';
  }
  function storeHas(r) {
    storeApps = r.apps;
    storeTiles = r.tiles || {};
    $('desk-store').hidden = false;
    $('desk-up').hidden = !r.upload;
    $('desk-up-off').hidden = r.upload;
    drawStore();
    drawPick();
  }
  function storeCall(p, body) {
    $('desk-store-err').textContent = '';
    api(DESK, 'POST', '/apps' + p, body).then(storeHas, function (x) { $('desk-store-err').textContent = x.message; drawStore(); });
  }
  function loadStore() {
    $('desk-store-err').textContent = '';
    api(DESK, 'GET', '/apps').then(storeHas, function (x) {
      if (x.status === 404 || x.status === 405) { $('desk-store').hidden = true; return; }      // a server from before
      $('desk-store').hidden = false;
      $('desk-store-err').textContent = x.message;
    });
  }
  function upReady() { $('desk-up-go').disabled = !(upApp && upApp.newer && $('desk-up-tested').checked); }
  function pickFile(f) {
    upFile = f;
    upApp = null;
    $('desk-up-card').hidden = true;
    $('desk-up-tested').checked = $('desk-up-public').checked = false;
    if (!f) $('desk-up-file').value = '';
    upReady();
  }
  $('desk-up-file').addEventListener('change', function () {
    var f = this.files[0] || null;
    pickFile(f);
    $('desk-store-err').textContent = '';
    if (!f) return;
    api(DESK, 'POST', '/apps/check', f).then(function (r) {
      if (upFile !== f) return;                              // another file was picked meanwhile
      upApp = r;
      $('desk-up-name').textContent = r.name + ' ' + r.version;
      icon($('desk-up-icon'), r);
      $('desk-up-what').textContent = r.id + ' · ' + sizeText(r.size) + ' · for ' + r.boards.map(function (b) {
        return b.board + (b.version ? ' - ' + b.version + ' there now' : ' - new there');
      }).join(', ') + (r.newer ? '' : '. Not newer: raise its version.txt and build it again.');
      $('desk-up-public').checked = r.boards.some(function (b) { return b.public; });
      $('desk-up-card').hidden = false;
      upReady();
    }, function (x) { if (upFile === f) $('desk-store-err').textContent = x.message; });
  });
  $('desk-up-tested').addEventListener('change', upReady);
  $('desk-up-cancel').addEventListener('click', function () { pickFile(null); });
  $('desk-up-go').addEventListener('click', function () {
    var pub = $('desk-up-public').checked, go = this;
    if (!confirm('Publish ' + upApp.name + ' ' + upApp.version + ' for ' + upApp.boards.map(function (b) { return b.board; }).join(', ') +
      (pub ? ' - on every device of it?' : ' - for the accounts it is given to?'))) return;
    go.disabled = true;
    $('desk-store-err').textContent = '';
    api(DESK, 'POST', '/apps/publish?tested=1' + (pub ? '&public=1' : ''), upFile).then(function (r) { storeHas(r); pickFile(null); },
      function (x) { $('desk-store-err').textContent = x.message; upReady(); });
  });
  $('desk-store-find').addEventListener('input', drawStore);
  $('desk-store-fold').addEventListener('click', function () {
    var ids = storeApps.map(function (a) { return a.id; }), all = ids.every(function (id) { return unfolded[id]; });
    ids.forEach(function (id) { unfolded[id] = !all; });
    drawStore();
  });
  $('desk-store-reload').addEventListener('click', loadStore);

  // ---------------------------------------------------------------- apps given to accounts (the account server's)

  var accounts = [];
  /* Give: the apps on the update server to choose from, "Another id" for one that is not there yet; without that
   * list (a server from before it) the id is typed */
  function drawPick() {
    var pick = $('desk-give-pick'), was = pick.value, seen = {};
    pick.replaceChildren();
    var first = el('option', null, 'Choose an app…');
    first.value = '';
    pick.appendChild(first);
    storeApps.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (a) {
      if (seen[a.id]) return;
      seen[a.id] = true;
      var n = storeApps.filter(function (x) { return x.id === a.id; }).length;
      var o = el('option', null, a.name + ' (' + a.id + ') · ' + n + (n === 1 ? ' board' : ' boards'));
      o.value = a.id;
      pick.appendChild(o);
    });
    var other = el('option', null, 'Another id…');
    other.value = '*';
    pick.appendChild(other);
    pick.value = seen[was] || was === '*' ? was : '';
    $('desk-give-pick-box').hidden = !storeApps.length;
    pickChanged();
  }
  function pickChanged() {
    var typed = $('desk-give-pick-box').hidden || $('desk-give-pick').value === '*';
    $('desk-give-app-box').hidden = !typed;
  }
  function pickedApp() {
    return $('desk-give-app-box').hidden ? $('desk-give-pick').value : $('desk-give-app').value.trim().toLowerCase();
  }
  $('desk-give-pick').addEventListener('change', function () { pickChanged(); if (this.value === '*') $('desk-give-app').focus(); });
  function drawAccounts() {
    var find = $('desk-apps-find').value.trim().toLowerCase(), all = $('desk-apps-all').checked;
    var rows = accounts.filter(function (a) {
      if (!all && !a.apps.length && !find) return false;
      return !find || a.email.toLowerCase().indexOf(find) >= 0 || (a.name || '').toLowerCase().indexOf(find) >= 0 ||
        a.apps.some(function (x) { return x.indexOf(find) >= 0; });
    });
    var body = $('desk-accounts').tBodies[0];
    body.replaceChildren();
    rows.slice(0, MAX_ROWS).forEach(function (a) {
      var tr = el('tr');
      tr.appendChild(el('td', 'desk-wrap', a.email + (a.disabled ? ' (disabled)' : !a.verified ? ' (not confirmed)' : '')));
      tr.appendChild(el('td', null, a.name));
      tr.appendChild(el('td', null, a.lastLogin ? day(a.lastLogin) : a.created ? 'never (made ' + day(a.created) + ')' : ''));
      var dv = el('td');
      if (a.devices && a.lastLogin !== undefined) {              // a server that manages accounts: its devices on a tap
        var show = el('button', 'acct-link', a.devices + (shown[a.email] ? ' ▾' : ' ▸'));
        show.type = 'button';
        show.setAttribute('aria-expanded', shown[a.email] ? 'true' : 'false');
        show.addEventListener('click', function () { toggleDevices(a.email); });
        dv.appendChild(show);
      } else dv.textContent = String(a.devices);
      tr.appendChild(dv);
      var pj = el('td');
      if (a.lastLogin === undefined) pj.textContent = '';
      else if (a.projects) {                                  // its Studio projects on a tap: what there is, not the designs
        var showP = el('button', 'acct-link', a.projects + (shownProjects[a.email] ? ' ▾' : ' ▸'));
        showP.type = 'button';
        showP.setAttribute('aria-expanded', shownProjects[a.email] ? 'true' : 'false');
        showP.addEventListener('click', function () { toggleProjects(a.email); });
        pj.appendChild(showP);
      } else pj.textContent = '0';
      tr.appendChild(pj);
      var td = el('td', 'desk-appcell');
      a.apps.forEach(function (id) {
        var chip = el('span', 'desk-app', id), x = el('button', 'acct-link', '×');
        x.type = 'button';
        x.title = 'Take ' + id + ' from ' + a.email;
        x.setAttribute('aria-label', x.title);
        x.addEventListener('click', function () {
          if (!confirm('Take ' + id + ' from ' + a.email + '? Its devices no longer list it in Get apps (one that has it keeps it).')) return;
          give(a.email, id, false);
        });
        chip.appendChild(x);
        td.appendChild(chip);
      });
      var add = el('button', 'acct-link', '+ app');
      add.type = 'button';
      add.addEventListener('click', function () {
        $('desk-give-email').value = a.email;
        $('desk-give').scrollIntoView({ block: 'nearest' });
        ($('desk-give-app-box').hidden ? $('desk-give-pick') : $('desk-give-app')).focus();
      });
      td.appendChild(add);
      tr.appendChild(td);
      tr.appendChild(manage(a));
      body.appendChild(tr);
      if (shown[a.email]) body.appendChild(devicesRow(a.email, shown[a.email]));
      if (shownProjects[a.email]) body.appendChild(projectsRow(a.email, shownProjects[a.email]));
    });
    var given = accounts.filter(function (a) { return a.apps.length; }).length;
    $('desk-apps-count').textContent = accounts.length + (accounts.length === 1 ? ' account · ' : ' accounts · ') + given + ' with apps of their own';
    $('desk-apps-more').textContent = rows.length > MAX_ROWS ? 'The first ' + MAX_ROWS + ' of ' + rows.length + ': narrow it down with Find.'
      : rows.length ? '' : all || find ? 'No account here.' : 'No account has an app of its own yet.';
    var list = $('desk-emails');
    list.replaceChildren();
    accounts.forEach(function (a) { var o = el('option'); o.value = a.email; list.appendChild(o); });
  }
  /* ---- managing an account (the account server's admin calls: a server from before them has no lastLogin) */
  var shown = {};                                   // email -> its devices, while the row is open
  function manage(a) {
    var td = el('td');
    if (a.lastLogin === undefined) return td;
    var menu = el('select', 'desk-manage');
    menu.setAttribute('aria-label', 'Manage ' + a.email);
    [['', 'Manage…'], !a.verified && ['verify', 'Confirm the address'], !a.disabled && ['reset', 'Send a new-password mail'],
      !a.admin && (a.disabled ? ['enable', 'Enable'] : ['disable', 'Disable']), !a.admin && ['delete', 'Delete…']].forEach(function (o) {
      if (!o) return;
      var opt = el('option', null, o[1]);
      opt.value = o[0];
      menu.appendChild(opt);
    });
    menu.addEventListener('change', function () {
      var action = menu.value;
      menu.value = '';
      if (!action) return;
      if (action === 'disable' && !confirm('Disable ' + a.email + '? It is signed out and cannot sign in; its devices stay in it.')) return;
      if (action === 'reset' && !confirm('Send ' + a.email + ' a mail with a link to set a new password?')) return;
      if (action === 'delete') {
        var typed = prompt('Delete ' + a.email + ' with its ' + a.devices + ' device(s), ' + (a.projects || 0) + ' Studio design(s) and its apps? This cannot be undone.\n\nType the address to delete it:');
        if (typed == null) return;
        if (typed.trim().toLowerCase() !== a.email.toLowerCase()) { $('desk-give-err').textContent = 'Not deleted: the address typed was another'; return; }
      }
      $('desk-give-err').textContent = '';
      api(ACCOUNT, 'POST', '/admin/account', { email: a.email, action: action }).then(function () {
        if (action === 'delete') { delete shown[a.email]; delete shownProjects[a.email]; }
        if (action === 'reset') say('A new-password mail is on its way to ' + a.email + '.');
        loadAccounts();
      }, function (x) { $('desk-give-err').textContent = x.message; });
    });
    td.appendChild(menu);
    return td;
  }
  function say(text, link) {
    var box = $('desk-acct-done');
    box.replaceChildren(text);
    if (link) { box.appendChild(el('br')); box.appendChild(el('code', null, link)); }
    box.hidden = false;
  }
  function devicesRow(email, list) {
    var tr = el('tr', 'desk-devrow'), td = el('td');
    td.colSpan = 7;
    if (!list.length) td.appendChild(el('span', 'muted', 'No device in this account.'));
    list.forEach(function (d) {
      var line = el('div', 'desk-devline');
      line.appendChild(el('span', 'desk-dev', d.device));
      line.appendChild(el('span', null, (d.name || '') + ' · ' + d.board + ' · Reload OS ' + (d.fw || '?') + ' · ' +
        (d.licensed ? 'activated' : d.trial > 0 ? 'trial, ' + d.trial + ' days left' : 'not activated') + ' · heard of ' + day(d.seen)));
      var out = el('button', 'acct-link', 'Remove');
      out.type = 'button';
      out.addEventListener('click', function () {
        if (!confirm('Take ' + d.device + ' out of ' + email + '? The device signs itself out at its next contact.')) return;
        api(ACCOUNT, 'POST', '/admin/unlink', { device: d.device }).then(function () { delete shown[email]; return loadAccounts(); },
          function (x) { $('desk-give-err').textContent = x.message; });
      });
      line.appendChild(out);
      td.appendChild(line);
    });
    tr.appendChild(td);
    return tr;
  }
  /* an account's Studio projects: name, size, when - and Delete */
  var shownProjects = {};                           // email -> { projects, bytes, most, mostBytes }, while the row is open
  var kb = function (n) { return n < 1e5 ? Math.ceil(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; };
  function projectsRow(email, r) {
    var tr = el('tr', 'desk-devrow'), td = el('td');
    td.colSpan = 7;
    td.appendChild(el('div', 'muted', r.projects.length + ' of ' + r.most + ' projects, ' + kb(r.bytes) + ' together (one may be ' + kb(r.mostBytes) + ').'));
    r.projects.forEach(function (p) {
      var line = el('div', 'desk-devline');
      line.appendChild(el('strong', null, p.name));
      line.appendChild(el('span', null, kb(p.size) + ' · changed ' + day(p.updated) + ' · made ' + day(p.created)));
      var del = el('button', 'acct-link', 'Delete');
      del.type = 'button';
      del.addEventListener('click', function () {
        if (!confirm('Delete the Studio project "' + p.name + '" of ' + email + '? It cannot be brought back.')) return;
        api(ACCOUNT, 'POST', '/admin/project', { email: email, id: p.id, action: 'delete' }).then(function () {
          return loadProjects(email).then(loadAccounts);
        }, function (x) { $('desk-give-err').textContent = x.message; });
      });
      line.appendChild(del);
      td.appendChild(line);
    });
    tr.appendChild(td);
    return tr;
  }
  function loadProjects(email) {
    return api(ACCOUNT, 'GET', '/admin/projects?email=' + encodeURIComponent(email)).then(function (r) {
      if (r.projects.length) shownProjects[email] = r; else delete shownProjects[email];
    });
  }
  function toggleProjects(email) {
    if (shownProjects[email]) { delete shownProjects[email]; return drawAccounts(); }
    loadProjects(email).then(drawAccounts, function (x) { $('desk-give-err').textContent = x.message; });
  }
  function toggleDevices(email) {
    if (shown[email]) { delete shown[email]; return drawAccounts(); }
    api(ACCOUNT, 'GET', '/admin/devices?email=' + encodeURIComponent(email)).then(function (r) { shown[email] = r.devices; drawAccounts(); },
      function (x) { $('desk-give-err').textContent = x.message; });
  }
  $('desk-acct-new').addEventListener('submit', function (e) {
    e.preventDefault();
    var go = $('desk-acct-go'), email = $('desk-acct-email').value.trim();
    $('desk-acct-err').textContent = '';
    $('desk-acct-done').hidden = true;
    if (!email) { $('desk-acct-err').textContent = 'The new account\'s email'; return; }
    go.disabled = true;
    api(ACCOUNT, 'POST', '/admin/accounts', { email: email, name: $('desk-acct-name').value.trim() }).then(function (r) {
      $('desk-acct-email').value = $('desk-acct-name').value = '';
      if (r.mailed) say('Made ' + r.email + '. A mail with a link to set the password is on its way to it (72 hours, once).');
      else say('Made ' + r.email + '. No mail could be sent: give the person this link to set the password (72 hours, once):', r.link);
      return loadAccounts();
    }, function (x) { $('desk-acct-err').textContent = x.message; }).then(function () { go.disabled = false; });
  });

  function loadAccounts() {
    return api(ACCOUNT, 'GET', '/admin/apps').then(function (r) {
      accounts = r.accounts;
      $('desk-acct-new').hidden = !accounts.length || accounts[0].lastLogin === undefined;
      $('desk-apps').hidden = false;
      drawAccounts();
    }, function (x) {
      if (x.status === 404 || x.status === 403) { $('desk-apps').hidden = true; return; }   // not on the account server's list
      $('desk-apps').hidden = false;
      $('desk-give-err').textContent = x.message;
    });
  }
  function give(email, app, yes) {
    $('desk-give-err').textContent = '';
    return api(ACCOUNT, 'POST', '/admin/apps', { email: email, app: app, give: yes }).then(function (r) {
      accounts.forEach(function (a) { if (a.email === r.email) a.apps = r.apps; });
      drawAccounts();
      return r;
    }, function (x) { $('desk-give-err').textContent = x.message; throw x; });
  }
  $('desk-give').addEventListener('submit', function (e) {
    e.preventDefault();
    var go = $('desk-give-go'), email = $('desk-give-email').value.trim(), app = pickedApp();
    if (!email || !app) { $('desk-give-err').textContent = 'The account\'s email and the app'; return; }
    go.disabled = true;
    give(email, app, true).then(function () { $('desk-give-app').value = ''; if ($('desk-give-pick').value !== '*') $('desk-give-pick').value = ''; }, function () { /* said */ })
      .then(function () { go.disabled = false; });
  });
  ['desk-apps-find', 'desk-apps-all'].forEach(function (id) { $(id).addEventListener('input', drawAccounts); });
  $('desk-apps-reload').addEventListener('click', loadAccounts);

  ['desk-find', 'desk-state', 'desk-show'].forEach(function (id) { $(id).addEventListener('input', drawKeys); });
  $('desk-reload').addEventListener('click', load);

  start();
})();
