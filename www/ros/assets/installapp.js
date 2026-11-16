/* The Install an app page: an .elf file from this computer onto a Reload OS device over its USB cable
 * (usbinstall.js: Web Serial). The texts are the page's (data-*); what a device says for itself is English. */
(function () {
  var box = document.getElementById('appinstall');
  if (!box) return;
  var file = document.getElementById('app-file'), go = document.getElementById('app-go');
  var status = document.getElementById('app-status'), bar = document.getElementById('app-bar');
  var T = box.dataset, busy = false;
  if (!window.RosUsb || !RosUsb.supported) {
    document.getElementById('app-unsupported').hidden = false;
    go.disabled = file.disabled = true;
    return;
  }
  function say(text, cls) {
    status.textContent = text;
    status.className = 'app-status' + (cls ? ' ' + cls : '');
  }
  function ready() { go.disabled = busy || !file.files.length; }
  file.addEventListener('change', function () { ready(); say(''); bar.hidden = true; });
  go.addEventListener('click', function () {
    var f = file.files[0];
    if (!f || busy) return;
    var name = RosUsb.appName(f.name), port;
    busy = true;
    ready();
    /* the port list first: it must come straight from the click */
    RosUsb.pick().then(function (p) {
      port = p;
      return f.arrayBuffer();
    }).then(function (buf) {
      return RosUsb.install(port, new Uint8Array(buf), name, function (stage, done, total) {
        if (stage === 'connect') say(T.connect);
        else if (stage === 'copy') {
          bar.hidden = false;
          bar.max = total;
          bar.value = done;
          say(T.copy.replace('%s', Math.round(done / 1024) + ' / ' + Math.round(total / 1024) + ' KB'));
        } else say(T.check);
      });
    }).then(function (info) {
      bar.hidden = true;
      say(T.done.replace('%a', name).replace('%b', info.board), 'ok');
    }).catch(function (e) {
      bar.hidden = true;
      if (e && e.name === 'NotFoundError') say('');                 /* the port list closed without a pick */
      else if (e && e.code === 'silent') say(T.silent, 'bad');
      else if (e && e.code === 'cut') say(T.cut, 'bad');
      else if (e && e.code) say(T.refused + ' ' + e.message, 'bad');     /* 'file', 'refused': why, in the device's words */
      else say(T.port + (e && e.message ? ' (' + e.message + ')' : ''), 'bad');
    }).then(function () { busy = false; ready(); });
  });
})();
