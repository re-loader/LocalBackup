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
    not_found: 'Not found', shop_closed: 'The shop is off on this server', 'Wrong email or password': 'Wrong email or password' };
  try { account = JSON.parse(localStorage.getItem(KEY)); } catch (e) { account = null; }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function api(base, method, p, body) {
    return fetch(base + p, { method: method, cache: 'no-store',
      headers: Object.assign({ 'Content-Type': 'application/json' }, account ? { Authorization: 'Bearer ' + account.token } : {}),
      body: body == null ? undefined : JSON.stringify(body) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.ok) return j;
          var e = new Error(SAY[j.error] || j.error || 'The server answered ' + r.status);
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
      keys = made = accounts = [];
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
  // ---------------------------------------------------------------- apps given to accounts (the account server's)

  var accounts = [];
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
      tr.appendChild(el('td', null, String(a.devices)));
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
      add.addEventListener('click', function () { $('desk-give-email').value = a.email; $('desk-give-app').focus(); });
      td.appendChild(add);
      tr.appendChild(td);
      body.appendChild(tr);
    });
    var given = accounts.filter(function (a) { return a.apps.length; }).length;
    $('desk-apps-count').textContent = given + ' of ' + accounts.length + ' accounts have apps';
    $('desk-apps-more').textContent = rows.length > MAX_ROWS ? 'The first ' + MAX_ROWS + ' of ' + rows.length + ': narrow it down with Find.'
      : rows.length ? '' : all || find ? 'No account here.' : 'No account has an app of its own yet.';
    var list = $('desk-emails');
    list.replaceChildren();
    accounts.forEach(function (a) { var o = el('option'); o.value = a.email; list.appendChild(o); });
  }
  function loadAccounts() {
    api(ACCOUNT, 'GET', '/admin/apps').then(function (r) {
      accounts = r.accounts;
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
    var go = $('desk-give-go'), email = $('desk-give-email').value.trim(), app = $('desk-give-app').value.trim().toLowerCase();
    if (!email || !app) { $('desk-give-err').textContent = 'The account\'s email and the app\'s id'; return; }
    go.disabled = true;
    give(email, app, true).then(function () { $('desk-give-app').value = ''; }, function () { /* said */ })
      .then(function () { go.disabled = false; });
  });
  ['desk-apps-find', 'desk-apps-all'].forEach(function (id) { $(id).addEventListener('input', drawAccounts); });
  $('desk-apps-reload').addEventListener('click', loadAccounts);

  ['desk-find', 'desk-state', 'desk-show'].forEach(function (id) { $(id).addEventListener('input', drawKeys); });
  $('desk-reload').addEventListener('click', load);

  start();
})();
