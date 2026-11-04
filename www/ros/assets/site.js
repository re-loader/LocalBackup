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
