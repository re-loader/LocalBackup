/* The USB console page: a Reload OS device's commands and files over its USB cable (Web Serial: Chrome or Edge on a
 * computer). The device answers only while Settings › USB › Commands over USB is on; its side is main/ros_usbcon.c,
 * the protocol docs/drivers/usbconsole.md (tools/usbfile.py is the same on the command line). Every answer is lines
 * among the device's log, the last one "ok" or "error: ...". The texts are the page's (data-*); what a device says is
 * English.
 */
(function () {
  'use strict';
  var box = document.getElementById('usbcon');
  if (!box) return;
  var T = box.dataset;
  var $ = function (id) { return document.getElementById(id); };
  var out = $('con-out'), input = $('con-in'), status = $('con-status'), go = $('con-go');
  var CHUNK = 720;                                    /* bytes a line, as the device's own: 960 characters of base64 */
  var LOG = /^(\x1b\[[0-9;]*m)?[IWEDV] \(\d+\) /;    /* the system's log on the same port */

  if (!('serial' in navigator) || !window.isSecureContext) {
    $('con-unsupported').hidden = false;
    go.disabled = true;
    return;
  }

  var TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(b) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < b.length; i++) c = TABLE[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function b64(b) {
    var s = '';
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s);
  }
  function unb64(s) {
    var bin = atob(s), b = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    return b;
  }
  function say(text, cls) {
    status.textContent = text || '';
    status.className = 'app-status' + (cls ? ' ' + cls : '');
  }
  function print(text, cls) {
    var div = document.createElement('div');
    if (cls) div.className = cls;
    div.textContent = text;
    out.appendChild(div);
    while (out.childNodes.length > 2000) out.removeChild(out.firstChild);
    out.scrollTop = out.scrollHeight;
  }
  function kb(n) { return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; }

  /* ---------------------------------------------------------------- the link */

  var port = null, reader = null, writer = null, pump = null, lines = [], waiting = null, closed = true, stuck = false;
  var enc = new TextEncoder(), busy = Promise.resolve(), showLog = false;

  function nextLine(ms) {
    return new Promise(function (resolve) {
      if (lines.length) return resolve(lines.shift());
      if (closed) return resolve(null);
      var t = setTimeout(function () { waiting = null; resolve(null); }, ms);
      waiting = function () {
        if (!lines.length && !closed) return;
        clearTimeout(t); waiting = null; resolve(lines.length ? lines.shift() : null);
      };
    });
  }
  /* a device that reads nothing (the switch off) takes a few bytes, then none: the write would wait for ever */
  function send(s) {
    if (stuck || closed) return Promise.reject(new Error(T.silent));
    var t;
    return Promise.race([
      writer.write(enc.encode(s + '\n')),
      new Promise(function (_, no) { t = setTimeout(function () { stuck = true; no(new Error(T.silent)); }, 5000); })
    ]).finally(function () { clearTimeout(t); });
  }
  function drain(ms) {                                /* lines still on their way: answers to earlier tries */
    return nextLine(ms).then(function (l) { return l === null ? null : drain(ms); });
  }

  async function connect() {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    try { await port.setSignals({ dataTerminalReady: false, requestToSend: false }); } catch (e) { /* none */ }
    reader = port.readable.getReader();
    writer = port.writable.getWriter();
    closed = false; stuck = false; lines = [];
    var dec = new TextDecoder(), text = '';
    pump = (async function () {
      try {
        for (;;) {
          var r = await reader.read();
          if (r.done) break;
          text += dec.decode(r.value, { stream: true });
          var at;
          while ((at = text.indexOf('\n')) >= 0) {
            var l = text.slice(0, at).replace(/\r$/, '');
            text = text.slice(at + 1);
            if (!l) continue;
            if (LOG.test(l)) { if (showLog) print(l.replace(/\x1b\[[0-9;]*m/g, ''), 'log'); continue; }
            lines.push(l);
            if (waiting) waiting();
          }
          if (text.length > 65536) text = '';
        }
      } catch (e) { /* the cable */ }
      closed = true;
      if (waiting) waiting();
      if (port) disconnected(T.gone);
    })();
    /* opening the port may restart the board: ask until it answers */
    say(T.connect);
    var info = [];
    for (var t0 = Date.now(); Date.now() - t0 < 40000 && !closed;) {
      lines.length = 0;
      await send('version');
      var l, got = [];
      while ((l = await nextLine(2000)) !== null && l !== 'ok') got.push(l);
      if (l === 'ok') { info = got; break; }
    }
    if (!info.length) throw new Error(T.silent);
    await drain(500);
    return info;
  }

  async function close() {
    var p = port;
    port = null;
    if (!p) return;
    try { await reader.cancel(); } catch (e) { /* closed */ }
    try { await pump; } catch (e) { /* closed */ }
    try { if (stuck) await writer.abort(); } catch (e) { /* gone */ }
    try { reader.releaseLock(); } catch (e) { /* gone */ }
    try { writer.releaseLock(); } catch (e) { /* gone */ }
    try { await p.close(); } catch (e) { /* unplugged */ }
  }

  /* one command at a time: a command's lines up to its "ok"; rejects with the device's "error: ..." */
  function run(cmd, quiet) {
    var job = busy.then(async function () {
      if (!quiet) print('> ' + cmd, 'cmd');
      await send(cmd);
      var got = [];
      for (;;) {
        var l = await nextLine(20000);
        if (l === null) throw new Error(closed ? T.gone : T.silent);
        if (l === 'ok' || l.indexOf('ok ') === 0) return got;
        if (l.indexOf('error: ') === 0) { if (!quiet) print(l, 'err'); throw new Error(l.slice(7)); }
        got.push(l);
        if (!quiet) print(l);
      }
    });
    busy = job.catch(function () {});
    return job;
  }

  /* ---------------------------------------------------------------- files */

  var cwd = '', bar = $('con-bar');

  function progress(done, total, what) {
    bar.hidden = !total;
    if (total) { bar.max = total; bar.value = done; say(what + ': ' + kb(done) + ' / ' + kb(total)); }
  }

  function getFile(path) {
    var job = busy.then(async function () {
      await send('get ' + path);
      var head = await nextLine(20000);
      if (head === null) throw new Error(T.silent);
      if (head.indexOf('error: ') === 0) throw new Error(head.slice(7));
      var m = /^size (\d+) crc ([0-9a-f]{8})$/.exec(head);
      if (!m) throw new Error(head);
      var size = +m[1], data = new Uint8Array(size), off = 0;
      for (;;) {
        var l = await nextLine(10000);
        if (l === null) throw new Error(T.cut);
        if (l === 'ok') break;
        if (l.indexOf('error: ') === 0) throw new Error(l.slice(7));
        var sp = l.indexOf(' ');
        if (+l.slice(0, sp) !== off) throw new Error(T.cut);
        var b = unb64(l.slice(sp + 1));
        if (off + b.length > size) throw new Error(T.cut);
        data.set(b, off);
        off += b.length;
        progress(off, size, T.down);
      }
      if (off !== size || crc32(data) !== parseInt(m[2], 16)) throw new Error(T.cut);
      return data;
    });
    busy = job.catch(function () {});
    return job;
  }

  function putFile(path, data) {
    var job = busy.then(async function () {
      await send('put ' + path + ' ' + data.length + ' ' + crc32(data).toString(16));
      var l = await nextLine(20000);
      if (l === null) throw new Error(T.silent);
      if (l !== 'ready') throw new Error(l.indexOf('error: ') === 0 ? l.slice(7) : l);
      var off = 0;
      while (off < data.length) {
        progress(off, data.length, T.up);
        await send(off + ' ' + b64(data.subarray(off, Math.min(off + CHUNK, data.length))));
        var k = await nextLine(10000);
        if (k === null) throw new Error(T.cut);
        if (k.indexOf('error: ') === 0) throw new Error(k.slice(7));
        if (k.indexOf('k ') !== 0) throw new Error(k);
        off = +k.slice(2);                            /* where the device is: a lost line is sent again */
      }
      progress(data.length, data.length, T.up);
      await send('end');
      for (;;) {
        var e = await nextLine(30000);
        if (e === null) throw new Error(T.cut);
        if (e.indexOf('error: ') === 0) throw new Error(e.slice(7));
        if (e.indexOf('ok ') === 0) return;
      }
    });
    busy = job.catch(function () {});
    return job;
  }

  function join(dir, name) { return dir.replace(/\/$/, '') + '/' + name; }

  function crumbs() {
    var c = $('con-path');
    c.textContent = '';
    var parts = cwd ? cwd.split('/').filter(Boolean) : [];
    var top = document.createElement('button');
    top.type = 'button'; top.className = 'linkish'; top.textContent = T.drives;
    top.onclick = function () { list(''); };
    c.appendChild(top);
    parts.forEach(function (p, i) {
      c.appendChild(document.createTextNode(' / '));
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'linkish'; b.textContent = p;
      var to = '/' + parts.slice(0, i + 1).join('/');
      b.onclick = function () { list(to); };
      c.appendChild(b);
    });
    $('con-upload-l').hidden = $('con-mkdir').hidden = !cwd;
  }

  async function list(dir) {
    var rows;
    try { rows = await run('ls' + (dir ? ' ' + dir : ''), true); } catch (e) { say(e.message, 'bad'); return; }
    cwd = dir;
    crumbs();
    var tb = $('con-files');
    tb.textContent = '';
    rows.forEach(function (r) {
      var isDir = /\/$/.test(r), name, size = null;
      if (isDir) name = r.slice(0, -1).replace(/^\//, '');
      else {
        var m = /^(.*?)\s+(-?\d+)$/.exec(r);
        if (!m) return;                               /* "N items" */
        name = m[1]; size = +m[2];
      }
      if (!dir && !isDir) return;
      var path = dir ? join(dir, name) : '/' + name;
      var tr = document.createElement('tr'), td1 = document.createElement('td'), td2 = document.createElement('td'),
          td3 = document.createElement('td');
      var a = document.createElement('button');
      a.type = 'button'; a.className = 'linkish';
      a.textContent = (isDir ? '📁 ' : '') + name;
      a.onclick = isDir ? function () { list(path); } : function () { download(path, name); };
      a.title = isDir ? T.open : T.download;
      td1.appendChild(a);
      td2.textContent = size === null ? '' : kb(size);
      td2.className = 'num';
      if (dir) {
        var del = document.createElement('button');
        del.type = 'button'; del.className = 'btn small'; del.textContent = T.del;
        del.onclick = function () { remove(path, name); };
        td3.appendChild(del);
      }
      tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3);
      tb.appendChild(tr);
    });
    if (!tb.childNodes.length) {
      var tr = document.createElement('tr'), td = document.createElement('td');
      td.colSpan = 3; td.className = 'muted'; td.textContent = T.empty;
      tr.appendChild(td); tb.appendChild(tr);
    }
  }

  async function download(path, name) {
    try {
      var data = await getFile(path);
      var url = URL.createObjectURL(new Blob([data]));
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
      say(T.got.replace('%s', name), 'ok');
    } catch (e) { say(e.message, 'bad'); }
    bar.hidden = true;
  }

  async function remove(path, name) {
    if (!confirm(T.sure.replace('%s', name))) return;
    try { await run('rm ' + path, true); say(T.removed.replace('%s', name), 'ok'); } catch (e) { say(e.message, 'bad'); }
    list(cwd);
  }

  $('con-upload').addEventListener('change', async function () {
    var files = Array.prototype.slice.call(this.files);
    this.value = '';
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (/[^\x21-\x7e]/.test(f.name)) { say(T.badname.replace('%s', f.name), 'bad'); break; }
      try {
        await putFile(join(cwd, f.name), new Uint8Array(await f.arrayBuffer()));
        say(T.sent.replace('%s', f.name), 'ok');
      } catch (e) { say(f.name + ': ' + e.message, 'bad'); break; }
    }
    bar.hidden = true;
    list(cwd);
  });
  $('con-mkdir').addEventListener('click', async function () {
    var n = prompt(T.newdir);
    if (!n) return;
    try { await run('mkdir ' + join(cwd, n.trim()), true); } catch (e) { say(e.message, 'bad'); }
    list(cwd);
  });

  /* ---------------------------------------------------------------- the page */

  var history = [], hi = 0;

  function connected(info) {
    $('con-device').textContent = info.join(' · ');
    box.classList.add('on');
    go.textContent = T.disconnect;
    input.disabled = false;
    say('');
    input.focus();
    list('');
  }
  function disconnected(why) {
    box.classList.remove('on');
    go.textContent = T.connectBtn;
    input.disabled = true;
    $('con-files').textContent = '';
    bar.hidden = true;
    if (why) say(why, 'bad');
    close();
  }

  go.addEventListener('click', async function () {
    if (port) { disconnected(''); return; }
    go.disabled = true;
    try { connected(await connect()); }
    catch (e) {
      if (e && e.name === 'NotFoundError') say('');            /* the port list closed without a pick */
      else { say(e && e.message ? e.message : T.port, 'bad'); await close(); }
    }
    go.disabled = false;
  });

  input.addEventListener('keydown', function (ev) {
    if (ev.key === 'ArrowUp' && hi > 0) { input.value = history[--hi]; ev.preventDefault(); return; }
    if (ev.key === 'ArrowDown') { hi = Math.min(hi + 1, history.length); input.value = history[hi] || ''; ev.preventDefault(); return; }
    if (ev.key !== 'Enter') return;
    var cmd = input.value.trim();
    input.value = '';
    if (!cmd) return;
    if (/^(get|put)\b/.test(cmd)) { print(T.usefiles, 'err'); return; }
    history.push(cmd); hi = history.length;
    run(cmd).then(function () {
      if (/^(rm|mkdir|mv)\b/.test(cmd)) list(cwd);
    }, function (e) { if (!/^error/.test(e.message)) say(e.message, 'bad'); });
  });
  Array.prototype.forEach.call(box.querySelectorAll('[data-cmd]'), function (b) {
    b.addEventListener('click', function () { if (port) run(b.dataset.cmd).catch(function () {}); });
  });
  $('con-log').addEventListener('change', function () { showLog = this.checked; });
  $('con-clear').addEventListener('click', function () { out.textContent = ''; });
  window.addEventListener('beforeunload', function () { if (port) close(); });
})();
