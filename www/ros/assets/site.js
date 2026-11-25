/* Reload OS website: menu, light / dark, the API filter, colours for C and shell code */
(function () {
  var nav = document.getElementById('site-nav'), menu = document.querySelector('.menu-btn');
  if (menu) menu.addEventListener('click', function () {
    var open = nav.classList.toggle('open');
    menu.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  var theme = document.querySelector('.theme-btn');
  if (theme) theme.addEventListener('click', function () {
    var root = document.documentElement, cur = root.dataset.theme ||
      (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    root.dataset.theme = cur === 'light' ? 'dark' : 'light';
    try { localStorage.setItem('ros-theme', root.dataset.theme); } catch (e) {}
  });

  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  var KW = /^(static|const|void|int|bool|char|float|double|return|if|else|for|while|do|struct|typedef|enum|union|unsigned|signed|long|short|sizeof|extern|volatile|true|false|NULL|break|continue|switch|case|default|goto|inline)$/;
  var TY = /^([a-z0-9_]+_t|uint\d+_t|int\d+_t|size_t|lv_obj_t|esp_err_t)$/;
  function hlC(src) {
    var re = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(^[ \t]*#[^\n]*)|\b(0x[0-9A-Fa-f]+|\d+(?:\.\d+)?[uUlLfF]*)\b|([A-Za-z_]\w*)(?=\s*\()|([A-Za-z_]\w*)/gm;
    var out = '', last = 0, m;
    while ((m = re.exec(src))) {
      out += esc(src.slice(last, m.index));
      var t = esc(m[0]);
      if (m[1]) out += '<span class="c-c">' + t + '</span>';
      else if (m[2]) out += '<span class="c-s">' + t + '</span>';
      else if (m[3]) out += '<span class="c-p">' + t + '</span>';
      else if (m[4]) out += '<span class="c-n">' + t + '</span>';
      else if (m[5]) out += KW.test(m[5]) ? '<span class="c-k">' + t + '</span>' : '<span class="c-f">' + t + '</span>';
      else if (m[6]) out += KW.test(m[6]) ? '<span class="c-k">' + t + '</span>' : TY.test(m[6]) ? '<span class="c-t">' + t + '</span>' : t;
      last = re.lastIndex;
    }
    return out + esc(src.slice(last));
  }
  function hlSh(src) {
    return src.split('\n').map(function (l) {
      var i = l.search(/(^|\s)#/);
      return i < 0 ? esc(l) : esc(l.slice(0, i)) + '<span class="c-c">' + esc(l.slice(i)) + '</span>';
    }).join('\n');
  }
  document.querySelectorAll('pre code.lang-c, pre code.lang-cmake').forEach(function (c) { c.innerHTML = hlC(c.textContent); });
  document.querySelectorAll('pre code.lang-bash, pre code.lang-sh').forEach(function (c) { c.innerHTML = hlSh(c.textContent); });

  var filter = document.getElementById('api-filter');
  if (filter) {
    var entries = [].slice.call(document.querySelectorAll('.api-entry')), count = document.getElementById('api-count');
    var secs = [].slice.call(document.querySelectorAll('.api-sec'));
    var run = function () {
      var q = filter.value.trim().toLowerCase(), n = 0;
      entries.forEach(function (e) {
        var hit = !q || e.dataset.name.indexOf(q) >= 0;
        e.classList.toggle('hide', !hit);
        if (hit) n++;
      });
      secs.forEach(function (s) {
        var any = s.querySelector('.api-entry:not(.hide)') || (!q && s.id === 'sec-everything-else');
        s.classList.toggle('hide', !any);
        s.querySelectorAll('.api-note, .api-hidden').forEach(function (p) { p.classList.toggle('hide', !!q); });
      });
      count.textContent = q ? n + ' found' : '';
    };
    filter.addEventListener('input', run);
  }
})();

/* Tabs (the account page, the key desk): <div class="tabs" role="tablist"> of buttons with data-tab="<pane's id>", the
 * panes .tab-pane. The tab last chosen is kept for the visit. A button with data-needs="<id>" shows only while that
 * element is not hidden - its pane's content comes and goes with what the server allows. */
(function () {
  document.querySelectorAll('.tabs').forEach(function (bar) {
    var tabs = Array.prototype.slice.call(bar.querySelectorAll('[data-tab]')), key = 'ros-tab-' + (bar.id || location.pathname);
    function show(tab) {
      tabs.forEach(function (b) {
        var on = b === tab, pane = document.getElementById(b.dataset.tab);
        b.classList.toggle('on', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
        if (pane) pane.hidden = !on;
      });
    }
    function open() { return tabs.filter(function (b) { return !b.hidden; }); }
    tabs.forEach(function (b, i) {
      var pane = document.getElementById(b.dataset.tab), needs = b.dataset.needs && document.getElementById(b.dataset.needs);
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-controls', b.dataset.tab);
      if (pane) { pane.setAttribute('role', 'tabpanel'); pane.setAttribute('aria-label', b.textContent.trim()); }
      b.addEventListener('click', function () {
        show(b);
        try { sessionStorage.setItem(key, b.dataset.tab); } catch (e) { /* this visit only */ }
      });
      b.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        var all = open(), to = all[(all.indexOf(b) + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length];
        to.focus();
        to.click();
      });
      if (needs) {
        var sync = function () {
          b.hidden = needs.hidden;
          if (b.hidden && b.classList.contains('on') && open()[0]) show(open()[0]);
        };
        new MutationObserver(sync).observe(needs, { attributes: true, attributeFilter: ['hidden'] });
        sync();
      }
    });
    var kept = null;
    try { kept = sessionStorage.getItem(key); } catch (e) { /* none */ }
    show(tabs.filter(function (b) { return b.dataset.tab === kept && !b.hidden; })[0] || open()[0] || tabs[0]);
  });
})();
