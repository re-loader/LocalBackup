/* An app's .elf onto a Reload OS device over its USB cable (Web Serial: Chrome or Edge on a computer). The device
 * takes it only while Settings › USB › Install apps over USB is on; it checks the file, keeps it on its flash drive
 * and restarts. Used by the Install an app page (installapp.js) and by Studio (Export › Onto the device).
 *
 *   RosUsb.supported                      this browser can do it
 *   RosUsb.pick()                         the browser's port list - call it from a click
 *   RosUsb.install(port, bytes, name, on) -> Promise {board, chip, version, bytes}
 *       on(stage, done, total): 'connect' | 'copy' | 'check'
 *       rejects with an Error whose .code is 'file' (not an app for it; before anything is sent), 'silent' (no
 *       answer: the switch is off, or the firmware is older), 'refused' (the device said why: .message), 'cut' (the
 *       link broke) - the device keeps what it had in every case
 */
(function () {
  'use strict';
  var CHUNK = 720;                                  /* bytes a line: 960 characters of base64 */
  var MACHINE = { 'ESP32-P4': 243, 'ESP32-S31': 243, 'ESP32-S3': 94 };   /* the ELF's e_machine: RISC-V, Xtensa */

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
  function fail(code, message) {
    var e = new Error(message);
    e.code = code;
    return e;
  }
  /* the name the device keeps the file under: letters, digits, - and _ */
  function appName(file) {
    return String(file).replace(/^.*[\\/]/, '').replace(/\.elf$/i, '');
  }
  function checkFile(bytes, name) {
    if (!/^[A-Za-z0-9_-]{1,24}$/.test(name)) throw fail('file', 'The file\'s name may have letters, digits, - and _ only, 24 at most');
    if (bytes.length < 52 || bytes[0] !== 0x7F || bytes[1] !== 0x45 || bytes[2] !== 0x4C || bytes[3] !== 0x46)
      throw fail('file', 'This is not an app: an app is an .elf file made by Studio or the app kit');
  }

  async function install(port, bytes, name, on) {
    on = on || function () {};
    checkFile(bytes, name);
    await port.open({ baudRate: 115200 });
    var reader = port.readable.getReader(), writer = port.writable.getWriter();
    var enc = new TextEncoder(), dec = new TextDecoder(), text = '', waiting = null, closed = false;
    var lines = [];
    /* every answer is a line "ROSI <WORD> ..." among the device's log */
    var pump = (async function () {
      try {
        for (;;) {
          var r = await reader.read();
          if (r.done) break;
          text += dec.decode(r.value, { stream: true });
          var at;
          while ((at = text.indexOf('\n')) >= 0) {
            var m = /(?:^|[^A-Z])ROSI (HELLO|READY|K|OK|ERR)\b ?(.*)$/.exec(text.slice(0, at).replace(/\r/g, ''));
            text = text.slice(at + 1);
            if (m) { lines.push({ word: m[1], rest: m[2] }); if (waiting) waiting(); }
          }
          if (text.length > 8192) text = text.slice(-2048);
        }
      } catch (e) { /* the cable */ }
      closed = true;
      if (waiting) waiting();
    })();
    function answer(ms) {
      return new Promise(function (resolve) {
        if (lines.length) return resolve(lines.shift());
        if (closed) return resolve(null);
        var t = setTimeout(function () { waiting = null; resolve(null); }, ms);
        waiting = function () {
          if (!lines.length && !closed) return;
          clearTimeout(t); waiting = null; resolve(lines.shift() || null);
        };
      });
    }
    /* A device that does not read its port (the switch is off: nothing listens) takes a few bytes and then none:
     * the write waits for ever. One that is not through after 3 s counts as no answer */
    var stuck = false;
    function send(s) {
      if (stuck) return Promise.reject(fail('silent', 'The device does not take what is sent'));
      var t;
      return Promise.race([
        writer.write(enc.encode(s + '\n')),
        new Promise(function (_, no) { t = setTimeout(function () { stuck = true; no(fail('silent', 'The device does not take what is sent')); }, 3000); })
      ]).finally(function () { clearTimeout(t); });
    }
    try {
      /* opening the port may restart the board (its reset is on the port's control lines): ask until it answers */
      try { await port.setSignals({ dataTerminalReady: false, requestToSend: false }); } catch (e) { /* a port without them */ }
      on('connect');
      var hello = null;
      for (var t0 = Date.now(); !hello && Date.now() - t0 < 20000 && !closed;) {
        await send('rosi hello');
        var a = await answer(700);
        if (a && a.word === 'HELLO') hello = a.rest;
      }
      if (closed) throw fail('cut', 'The USB link closed');
      if (!hello) throw fail('silent', 'The device does not answer');
      var h = /^(\d+) chip=(\S+) version=(\S+) max=(\d+) board=(.+)$/.exec(hello);
      if (!h) throw fail('silent', 'The device answers something else: ' + hello);
      var info = { chip: h[2], version: h[3], board: h[5].trim(), bytes: bytes.length };
      if (bytes.length > +h[4]) throw fail('file', 'The app is larger than the ' + info.board + ' takes (' + (+h[4] >> 20) + ' MB)');
      var machine = bytes[18] | bytes[19] << 8;
      if (MACHINE[info.chip] && machine !== MACHINE[info.chip])
        throw fail('file', 'This app was built for another chip than the ' + info.board + '\'s ' + info.chip + ' - build it for this board');
      lines.length = 0;
      await send('rosi put ' + name + ' ' + bytes.length + ' ' + crc32(bytes).toString(16));
      for (;;) {                                    /* late answers to hello may still come first */
        var r0 = await answer(8000);
        if (!r0) throw fail(closed ? 'cut' : 'silent', 'The device stopped answering');
        if (r0.word === 'ERR') throw fail('refused', r0.rest);
        if (r0.word === 'READY') break;
      }
      var off = 0;
      while (off < bytes.length) {
        on('copy', off, bytes.length);
        var line = off + ' ' + b64(bytes.subarray(off, Math.min(off + CHUNK, bytes.length)));
        var k = null;
        for (var tries = 0; tries < 2 && !k; tries++) {     /* the device gives up after 5 s without a byte */
          await send(line);
          k = await answer(2200);
          if (closed) throw fail('cut', 'The USB link closed at ' + off + ' of ' + bytes.length + ' bytes');
        }
        if (!k) throw fail('cut', 'The device stopped answering at ' + off + ' of ' + bytes.length + ' bytes');
        if (k.word === 'ERR') throw fail('refused', k.rest);
        if (k.word === 'K') off = +k.rest;          /* where the device is: the next line, or this one again */
      }
      on('check', bytes.length, bytes.length);
      await send('end');
      for (;;) {
        var e = await answer(40000);
        if (!e) throw fail(closed ? 'cut' : 'silent', 'The device did not say whether it kept the app');
        if (e.word === 'ERR') throw fail('refused', e.rest);
        if (e.word === 'OK') return info;
      }
    } finally {
      try { await reader.cancel(); } catch (e) { /* closed already */ }
      await pump;
      try { if (stuck) await writer.abort(); } catch (e) { /* gone */ }
      try { reader.releaseLock(); } catch (e) { /* gone */ }
      try { writer.releaseLock(); } catch (e) { /* gone */ }
      try { await port.close(); } catch (e) { /* unplugged */ }
    }
  }

  window.RosUsb = {
    supported: 'serial' in navigator && window.isSecureContext,
    pick: function () { return navigator.serial.requestPort(); },
    appName: appName,
    install: install
  };
})();
