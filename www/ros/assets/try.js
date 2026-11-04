/* The "Try it" page: the real Reload OS UI as WebAssembly (tools/sim/web.sh) in the page's canvas - one screen per load,
 * chosen by ?screen= (switching reloads the page: one renderer a page) */
(function () {
  var stage = document.getElementById('sim-stage');
  if (!stage) return;
  var SCREENS = {
    h:   { file: 'sim_jc_dev', w: 1024, h: 600 },
    v:   { file: 'sim_jc_dev', w: 600, h: 1024 },
    pad: { file: 'sim_jc3248_pad', w: 320, h: 480, args: ['app', 'PAD'] }
  };
  var key = new URLSearchParams(location.search).get('screen');
  if (!SCREENS[key]) key = 'h';
  var s = SCREENS[key];
  document.querySelectorAll('[data-screen]').forEach(function (a) {
    if (a.dataset.screen === key) a.setAttribute('aria-current', 'page');
  });
  var device = document.getElementById('sim-device'), canvas = document.getElementById('canvas');
  var load = document.getElementById('sim-load');
  device.style.setProperty('--sw', s.w);
  device.style.setProperty('--sh', s.h);
  device.classList.add(s.w > s.h ? 'wide' : 'tall');
  /* the device has no wheel: over the screen it scrolls the page, as anywhere else (SDL would keep it) */
  device.addEventListener('wheel', function (e) { e.stopPropagation(); }, true);
  /* SDL puts a press where the pointer last moved: a tap without a move before it (a touch screen, a quick click)
   * would land on the previous spot - so the screen gets a move to the press first */
  ['mousedown', 'mouseup'].forEach(function (type) {
    device.addEventListener(type, function (e) {
      if (e.target === canvas) canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: e.clientX, clientY: e.clientY,
        screenX: e.screenX, screenY: e.screenY, buttons: e.buttons, bubbles: true, cancelable: true, view: window }));
    }, true);
  });
  var base = stage.dataset.base;
  var light = (document.documentElement.dataset.theme ||
               (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')) === 'light';
  function fail(msg) { load.textContent = msg; load.classList.add('err'); }
  if (typeof WebAssembly !== 'object') { fail(stage.dataset.nowasm); return; }
  /* the UI's tasks run on threads: SharedArrayBuffer, which a browser gives a cross-origin isolated page only */
  if (!window.crossOriginIsolated) { fail(stage.dataset.isolation); return; }
  var js = document.createElement('script');
  js.src = base + s.file + '.js';
  js.onerror = function () { fail(stage.dataset.missing); };
  js.onload = function () {
    window.RosSim({
      canvas: canvas,
      arguments: [s.w + 'x' + s.h].concat(location.hash === '#log' ? ['log', '1'] : [], ['theme', light ? '1' : '0', 'free', '0', 'wifi', 'connected']).concat(s.args || [], ['live']),
      locateFile: function (p) { return base + p; },
      print: function () {},
      printErr: function (t) { if (window.console) console.log('[Reload OS] ' + t); },
      onAbort: function () { fail(stage.dataset.crashed); }
    }).then(function () {
      load.classList.add('done');
      canvas.focus({ preventScroll: true });
    }, function () { fail(stage.dataset.crashed); });
  };
  document.body.appendChild(js);
  document.getElementById('sim-restart').addEventListener('click', function () { location.reload(); });
})();
