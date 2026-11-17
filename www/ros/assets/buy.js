/* The Buy page (pages/<lang>/buy.html): a product key bought online - an email address, how many, a PromptPay QR
 * code (qr.js draws it), and the keys once the payment is confirmed: on this page and in a mail. The page only
 * asks; whether an order is paid is the server's word, which asks the payment service itself. The order's number and
 * the secret this browser asks with are kept in localStorage, so the page can be reloaded while the code is up.
 * The texts are the page's (its "buy-texts" block). */
(function () {
  var box = document.getElementById('buy');
  if (!box) return;
  var T = JSON.parse(document.getElementById('buy-texts').textContent);
  var API = box.dataset.api || (box.dataset.root + 'api/shop'), LANG = box.dataset.lang, KEY = 'ros-shop-order';
  var info = null, order = null, timer = null, tick = null, deadline = 0, lastEmail = '';
  var $ = function (id) { return document.getElementById(id); };
  var VIEWS = ['buy-wait', 'buy-closed', 'buy-form', 'buy-pay', 'buy-paid', 'buy-expired'];

  function show(id) { VIEWS.forEach(function (v) { $(v).hidden = v !== id; }); }
  function fill(t, v) { return t.replace('%s', v); }
  function say(code) { return (T.errors && T.errors[code]) || T.errors.other; }
  function money(v) { return Number(v).toLocaleString(LANG === 'th' ? 'th-TH' : 'en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 }); }

  function api(method, p, body, token) {
    var head = { 'Content-Type': 'application/json' };
    if (token) head.Authorization = 'Bearer ' + token;
    return fetch(API + p, { method: method, cache: 'no-store', headers: head, body: body == null ? undefined : JSON.stringify(body) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.ok) return j;
          var e = new Error(say(j.error));
          e.status = r.status;
          throw e;
        });
      }, function () { var e = new Error(say('offline')); e.status = 0; throw e; });
  }
  function keep(o) {
    order = o;
    try { if (o) localStorage.setItem(KEY, JSON.stringify(o)); else localStorage.removeItem(KEY); } catch (e) { /* this page only */ }
  }
  function stop() { clearTimeout(timer); clearInterval(tick); timer = tick = null; }

  // ---------------------------------------------------------------- the form

  function total() {
    var n = Math.max(1, Math.min(info.max, parseInt($('buy-qty').value, 10) || 1));
    $('buy-total').textContent = fill(T.total, money(n * Number(info.price)));
    return n;
  }
  function form() {
    stop();
    keep(null);
    $('buy-price').textContent = fill(T.price, money(Number(info.price)));
    $('buy-qty').max = info.max;
    $('buy-max').textContent = fill(T.max, info.max);
    total();
    $('buy-err').textContent = '';
    show('buy-form');
  }
  $('buy-qty').addEventListener('input', total);
  $('buy-tax').addEventListener('change', function () { $('buy-tax-fields').hidden = !this.checked; });
  $('buy-order').addEventListener('submit', function (e) {
    e.preventDefault();
    var email = $('buy-email').value.trim(), again = $('buy-email2').value.trim(), qty = total(), go = $('buy-go');
    var err = function (m) { $('buy-err').textContent = m; };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err(say('bad_email'));
    if (email.toLowerCase() !== again.toLowerCase()) return err(T.emailTwice);
    var body = { email: email, qty: qty, lang: LANG };
    if ($('buy-tax').checked) body.tax = { name: $('buy-tax-name').value, address: $('buy-tax-addr').value, id: $('buy-tax-id').value };
    err('');
    go.disabled = true;
    api('POST', '/orders', body).then(function (r) {
      keep({ order: r.order, token: r.token });
      pending(r);
    }, function (x) { err(x.message); }).then(function () { go.disabled = false; });
  });

  // ---------------------------------------------------------------- the QR code, until it is paid

  function pending(r) {
    $('buy-qr').innerHTML = window.rosQr.svg(r.qr, { ecl: 'M', border: 4, label: T.qrLabel });
    $('buy-amount').textContent = fill(T.amount, money(Number(r.amount)));
    $('buy-what').textContent = fill(T.what, r.qty) + ' · ' + r.email;
    $('buy-no').textContent = fill(T.orderNo, r.order);
    deadline = Date.now() + r.expires_in * 1000;
    clearInterval(tick);
    var left = function () {
      var s = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      $('buy-left').textContent = fill(T.left, Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'));
    };
    left();
    tick = setInterval(left, 1000);
    show('buy-pay');
    again(3000);
  }
  function again(ms) { clearTimeout(timer); timer = setTimeout(poll, ms); }
  function poll() {
    if (!order) return;
    api('GET', '/orders/' + order.order, null, order.token).then(function (r) {
      if (r.status === 'paid') return paid(r);
      if (r.status === 'pending') {
        if ($('buy-pay').hidden) return pending(r);            /* the page was reloaded while the code was up */
        deadline = Date.now() + r.expires_in * 1000;
        return again(3000);
      }
      stop();
      keep(null);
      show('buy-expired');
    }, function (x) {
      if (x.status === 404) return info && info.open ? form() : show('buy-closed');    /* not an order any more */
      again(x.status === 429 ? 15000 : 6000);                /* the network, the server: asked again */
    });
  }
  $('buy-cancel').addEventListener('click', form);
  $('buy-new').addEventListener('click', form);
  $('buy-more').addEventListener('click', form);

  // ---------------------------------------------------------------- paid: the keys

  function paid(r) {
    stop();
    lastEmail = r.email;
    $('buy-thanks').textContent = fill(T.thanks, r.order);
    var list = $('buy-keys');
    list.replaceChildren();
    (r.keys || []).forEach(function (k) {
      var li = document.createElement('li');
      li.textContent = k;
      list.appendChild(li);
    });
    $('buy-keys-note').textContent = r.keys && r.keys.length ? T.keysHere : T.keysMail;
    $('buy-copy').hidden = !(r.keys && r.keys.length && navigator.clipboard);
    $('buy-mailed').textContent = fill(r.mailed ? T.mailed : T.mailing, r.email);
    show('buy-paid');
    if (!r.mailed) again(5000);                               /* until the mail server took it */
  }
  $('buy-copy').addEventListener('click', function () {
    var keys = Array.prototype.map.call($('buy-keys').children, function (li) { return li.textContent; }).join('\n');
    navigator.clipboard.writeText(keys).then(function () { $('buy-copy').textContent = T.copied; });
  });
  function resend(email, out, button) {
    button.disabled = true;
    api('POST', '/resend', { email: email }).then(function () { out.textContent = fill(T.resent, email); },
      function (x) { out.textContent = x.message; }).then(function () { button.disabled = false; });
  }
  $('buy-resend').addEventListener('click', function () { resend(lastEmail, $('buy-resend-note'), this); });
  $('buy-lost').addEventListener('submit', function (e) {
    e.preventDefault();
    var email = $('buy-lost-email').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { $('buy-lost-note').textContent = say('bad_email'); return; }
    resend(email, $('buy-lost-note'), $('buy-lost-go'));
  });

  // ---------------------------------------------------------------- start

  try { order = JSON.parse(localStorage.getItem(KEY)); } catch (e) { order = null; }
  if (!order || !order.order || !order.token) order = null;
  api('GET', '', null).then(function (r) {
    info = r;
    $('buy-lost').hidden = !r.open;
    if (order) return poll();                                 /* an order of this browser: where it stands */
    if (r.open) form(); else show('buy-closed');
  }, function () { show('buy-closed'); });
})();
