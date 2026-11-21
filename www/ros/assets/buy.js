/* The Buy page (pages/<lang>/buy.html): a product key bought online - an email address, how many, the way to pay
 * (the server's channels: PromptPay, WeChat Pay, Alipay, ...), its QR code (qr.js draws it from the server's text;
 * ShopeePay's comes as a picture), and the keys once the payment is confirmed: on this page and in a mail. The page only
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
  /* the ways to pay the server offers; a server from before the channels: PromptPay */
  function channels() { return info && info.channels && info.channels.length ? info.channels : [{ id: 'promptpay', name: 'PromptPay' }]; }
  function chosen() {
    var on = document.querySelector('input[name="buy-channel"]:checked');
    return on ? on.value : channels()[0].id;
  }
  function nameOf(id) {
    var c = channels().filter(function (x) { return x.id === id; })[0];
    return c ? c.name : 'PromptPay';
  }
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
  /* '' for an address, else the error to say: a keyboard left on Thai puts a vowel mark in front of the first letter,
   * next to invisible in the field - told here, before anyone pays for a mail that cannot be sent */
  function badEmail(e) {
    if (/[^\x00-\x7f]/.test(e)) return 'email_letters';
    return /^[A-Za-z0-9.!#$%&*+\/=?^_`{|}~-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(e) ? '' : 'bad_email';
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
    var list = $('buy-channel-list'), was = chosen();
    list.replaceChildren();
    channels().forEach(function (c, i) {
      var label = document.createElement('label'), input = document.createElement('input');
      label.className = 'acct-check';
      input.type = 'radio';
      input.name = 'buy-channel';
      input.value = c.id;
      input.checked = c.id === was || (i === 0 && !channels().some(function (x) { return x.id === was; }));
      input.addEventListener('change', goText);
      var name = document.createElement('span');
      name.textContent = c.name;
      label.append(input, icon(c.id), name);
      list.appendChild(label);
    });
    $('buy-channels').hidden = channels().length < 2;
    goText();
    $('buy-err').textContent = '';
    show('buy-form');
  }
  /* a small mark per way to pay, in its colour: drawn here, not the brands' own logos */
  var ICONS = {
    promptpay: ['#1a4b8c', '<path d="M7 7h4v4H7zM13 7h4v4h-4zM7 13h4v4H7z" fill="none" stroke="#fff" stroke-width="1.6"/><path d="M14 14h1.5v1.5H14zM16 16h1.5v1.5H16z" fill="#fff"/>'],
    wechat: ['#07c160', '<ellipse cx="10" cy="10.5" rx="5" ry="4.2" fill="#fff"/><ellipse cx="14.8" cy="14" rx="4.2" ry="3.5" fill="#fff" stroke="#07c160" stroke-width="1"/><circle cx="8.3" cy="9.6" r=".8" fill="#07c160"/><circle cx="11.7" cy="9.6" r=".8" fill="#07c160"/>'],
    alipay: ['#1677ff', '<path d="M6.5 8.5h11M12 6v4.5M8 11.5h8c-.8 3.2-3.6 5.6-8 6.5M10 12.5c1.6 2.4 4.2 4.3 7.5 5" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'],
    truemoney: ['#ff6a00', '<rect x="5.5" y="8" width="13" height="9.5" rx="2" fill="none" stroke="#fff" stroke-width="1.7"/><path d="M7.5 8l7-2.5.8 2.5" fill="none" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/><circle cx="15.5" cy="12.8" r="1.2" fill="#fff"/>'],
    airpay: ['#ee4d2d', '<path d="M7 9.5h10l-.8 8.5H7.8z" fill="#fff"/><path d="M9.5 9.5V8.3a2.5 2.5 0 0 1 5 0v1.2" fill="none" stroke="#fff" stroke-width="1.5"/><path d="M13.4 12.2c-.5-.5-2.8-.6-2.8.6 0 1.3 2.9.7 2.9 2 0 1.2-2.4 1.1-3 .5" fill="none" stroke="#ee4d2d" stroke-width="1.1" stroke-linecap="round"/>']
  };
  function icon(id) {
    var i = ICONS[id] || ['#6b7280', '<rect x="6" y="8" width="12" height="8.5" rx="1.5" fill="none" stroke="#fff" stroke-width="1.7"/><path d="M6 11h12" stroke="#fff" stroke-width="1.7"/>'];
    var box = document.createElement('span');
    box.className = 'buy-ch-icon';
    box.setAttribute('aria-hidden', 'true');
    box.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28"><rect width="24" height="24" rx="6" fill="' + i[0] + '"/>' + i[1] + '</svg>';
    return box;
  }
  function goText() { $('buy-go').textContent = fill(T.go, nameOf(chosen())); }
  $('buy-qty').addEventListener('input', total);
  $('buy-tax').addEventListener('change', function () { $('buy-tax-fields').hidden = !this.checked; });
  $('buy-order').addEventListener('submit', function (e) {
    e.preventDefault();
    var email = $('buy-email').value.trim(), again = $('buy-email2').value.trim(), qty = total(), go = $('buy-go');
    var err = function (m) { $('buy-err').textContent = m; };
    if (badEmail(email)) return err(say(badEmail(email)));
    if (email.toLowerCase() !== again.toLowerCase()) return err(T.emailTwice);
    var body = { email: email, qty: qty, lang: LANG };
    if (info.channels && info.channels.length) body.channel = chosen();
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
    var label = fill(T.qrLabel, nameOf(r.channel || 'promptpay'));
    if (r.qr) {
      $('buy-qr').innerHTML = window.rosQr.svg(r.qr, { ecl: 'M', border: 4, label: label });
    } else if (/^(https:|data:image\/)/.test(r.qr_image || '')) {     /* ShopeePay: Ksher's picture of the code */
      var img = document.createElement('img');
      img.src = r.qr_image;
      img.alt = label;
      $('buy-qr').replaceChildren(img);
    } else {
      $('buy-qr').replaceChildren();
    }
    $('buy-scan').textContent = (T.scan && T.scan[r.channel]) || (T.scan && T.scan.promptpay) || $('buy-scan').textContent;
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
    if (badEmail(email)) { $('buy-lost-note').textContent = say(badEmail(email)); return; }
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
