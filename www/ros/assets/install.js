/* The Install page: the boards of firmware/index.json (website/build.py, INSTALL) to pick from; the pick gives the
 * ESP Web Tools button (esp-web-tools/install-button.js) that board's manifest. The texts are the page's. */
(function () {
  var box = document.getElementById('install');
  if (!box) return;
  var pick = document.getElementById('install-boards'), status = document.getElementById('install-status');
  var btn = document.getElementById('install-btn'), info = document.getElementById('install-info');
  var base = box.dataset.base;
  /* a browser without Web Serial: the button says so itself (its "unsupported" slot) - show it from the start */
  if (!('serial' in navigator) || !window.isSecureContext) btn.hidden = false;

  function el(tag, text, cls) {
    var e = document.createElement(tag);
    if (text) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  }
  function choose(fw, b) {
    btn.setAttribute('manifest', base + b.id + '/manifest.json');
    btn.hidden = false;
    document.querySelectorAll('[data-port]').forEach(function (p) { p.hidden = p.dataset.port !== b.port; });
    info.textContent = '';
    info.append('Reload OS ' + fw.version + ' · ' + b.name + ' · ' + b.chip + ' · ' + (b.bytes / 1048576).toFixed(0) +
                ' MB · SHA-256 ', el('code', b.sha256));
    try { history.replaceState(null, '', '?board=' + b.id); } catch (e) {}
  }
  fetch(base + 'index.json').then(function (r) {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }).then(function (fw) {
    if (!fw.boards.length) throw new Error('no boards');
    var want = new URLSearchParams(location.search).get('board');
    fw.boards.forEach(function (b) {
      var label = el('label'), radio = el('input');
      radio.type = 'radio';
      radio.name = 'board';
      radio.value = b.id;
      radio.addEventListener('change', function () { choose(fw, b); });
      label.append(radio, el('strong', b.name), el('small', b.what + ' · ' + b.chip),
                   b.tried ? el('span', box.dataset.tried, 'badge teal') : el('span', box.dataset.untried, 'badge warn'));
      pick.append(label);
      if (b.id === want) { radio.checked = true; choose(fw, b); }
    });
    status.textContent = box.dataset.version.replace('%s', fw.version);
  }).catch(function () {
    status.textContent = box.dataset.missing;
  });
})();
