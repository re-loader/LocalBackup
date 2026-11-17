/* A QR code from a text, drawn as SVG - for the Buy page's PromptPay code (buy.js). Nothing is loaded from another
 * site, so the encoder is here: QR Code Model 2, byte mode, versions 1-40, error correction L or M, the mask chosen
 * by the standard's penalty rules. Its output was compared module for module with qrcodegen (the encoder LVGL has,
 * the one a device draws its codes with) - website/README.md, "Buy".
 *   rosQr.modules(text, 'M') -> { size, dark(x, y) }      rosQr.svg(text, { ecl: 'M', border: 4 }) -> '<svg ...>' */
(function (root) {
  'use strict';
  var ECC_PER_BLOCK = {
    L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28]
  };
  var NUM_BLOCKS = {
    L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49]
  };
  var FORMAT_BITS = { L: 1, M: 0 };

  function utf8(text) {
    var out = [], s = unescape(encodeURIComponent(text));
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }
  function rawModules(ver) {                       /* data and error correction bits a version holds */
    var n = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var a = Math.floor(ver / 7) + 2;
      n -= (25 * a - 10) * a - 55;
      if (ver >= 7) n -= 36;
    }
    return n;
  }
  function dataCodewords(ver, ecl) { return Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ecl][ver] * NUM_BLOCKS[ecl][ver]; }

  /* Reed-Solomon over GF(2^8 / 0x11D) */
  function mul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }
  function divisor(degree) {
    var r = [], i, j, rt = 1;
    for (i = 0; i < degree - 1; i++) r.push(0);
    r.push(1);
    for (i = 0; i < degree; i++) {
      for (j = 0; j < r.length; j++) {
        r[j] = mul(r[j], rt);
        if (j + 1 < r.length) r[j] ^= r[j + 1];
      }
      rt = mul(rt, 2);
    }
    return r;
  }
  function remainder(data, div) {
    var r = div.map(function () { return 0; });
    data.forEach(function (b) {
      var f = b ^ r.shift();
      r.push(0);
      div.forEach(function (c, i) { r[i] ^= mul(c, f); });
    });
    return r;
  }

  /* mask: 0-7 to fix it (the comparison with qrcodegen), else the one with the lowest penalty */
  function modules(text, ecl, mask) {
    ecl = ecl === 'L' ? 'L' : 'M';
    var bytes = utf8(text), ver, need;
    for (ver = 1; ; ver++) {
      if (ver > 40) throw new Error('too long for a QR code');
      need = 4 + (ver < 10 ? 8 : 16) + 8 * bytes.length;
      if (need <= dataCodewords(ver, ecl) * 8) break;
    }
    var size = ver * 4 + 17, cap = dataCodewords(ver, ecl) * 8, bits = [], i, j;
    function put(v, n) { for (var k = n - 1; k >= 0; k--) bits.push((v >>> k) & 1); }
    put(4, 4);                                       /* byte mode */
    put(bytes.length, ver < 10 ? 8 : 16);
    bytes.forEach(function (b) { put(b, 8); });
    put(0, Math.min(4, cap - bits.length));
    put(0, (8 - bits.length % 8) % 8);
    for (var pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
    var data = [];
    for (i = 0; i < bits.length; i += 8) {
      var b = 0;
      for (j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      data.push(b);
    }

    /* the blocks' error correction, interleaved */
    var nb = NUM_BLOCKS[ecl][ver], el = ECC_PER_BLOCK[ecl][ver], raw = Math.floor(rawModules(ver) / 8);
    var nShort = nb - raw % nb, shortLen = Math.floor(raw / nb), blocks = [], div = divisor(el), k = 0;
    for (i = 0; i < nb; i++) {
      var dat = data.slice(k, k + shortLen - el + (i < nShort ? 0 : 1));
      k += dat.length;
      var ecc = remainder(dat, div);
      if (i < nShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    var all = [];
    for (i = 0; i < blocks[0].length; i++) {
      for (j = 0; j < nb; j++) if (i !== shortLen - el || j >= nShort) all.push(blocks[j][i]);
    }

    var m = [], fn = [], x, y;
    for (y = 0; y < size; y++) { m.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
    function setFn(px, py, dark) { m[py][px] = dark; fn[py][px] = true; }
    function formatBits(mask) {
      var d = (FORMAT_BITS[ecl] << 3) | mask, rem = d, n;
      for (n = 0; n < 10; n++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var f = ((d << 10) | rem) ^ 0x5412;
      function bit(q) { return ((f >>> q) & 1) !== 0; }
      for (n = 0; n <= 5; n++) setFn(8, n, bit(n));
      setFn(8, 7, bit(6)); setFn(8, 8, bit(7)); setFn(7, 8, bit(8));
      for (n = 9; n < 15; n++) setFn(14 - n, 8, bit(n));
      for (n = 0; n < 8; n++) setFn(size - 1 - n, 8, bit(n));
      for (n = 8; n < 15; n++) setFn(8, size - 15 + n, bit(n));
      setFn(8, size - 8, true);
    }
    /* timing, finders, alignment, format and version */
    for (i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
    [[3, 3], [size - 4, 3], [3, size - 4]].forEach(function (c) {
      for (var dy = -4; dy <= 4; dy++) {
        for (var dx = -4; dx <= 4; dx++) {
          var d = Math.max(Math.abs(dx), Math.abs(dy)), xx = c[0] + dx, yy = c[1] + dy;
          if (xx >= 0 && xx < size && yy >= 0 && yy < size) setFn(xx, yy, d !== 2 && d !== 4);
        }
      }
    });
    var pos = [];
    if (ver > 1) {
      var na = Math.floor(ver / 7) + 2, step = ver === 32 ? 26 : Math.ceil((size - 13) / (na * 2 - 2)) * 2;
      pos = [6];
      for (var p = size - 7; pos.length < na; p -= step) pos.splice(1, 0, p);
    }
    pos.forEach(function (ax, ai) {
      pos.forEach(function (ay, aj) {
        var last = pos.length - 1;
        if ((ai === 0 && aj === 0) || (ai === 0 && aj === last) || (ai === last && aj === 0)) return;
        for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) setFn(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      });
    });
    formatBits(0);
    if (ver >= 7) {
      var rem = ver;
      for (i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      var vb = (ver << 12) | rem;
      for (i = 0; i < 18; i++) {
        var dark = ((vb >>> i) & 1) !== 0, a = size - 11 + i % 3, bb = Math.floor(i / 3);
        setFn(a, bb, dark); setFn(bb, a, dark);
      }
    }
    /* the codewords, in the zigzag from the bottom right */
    i = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (j = 0; j < 2; j++) {
          x = right - j;
          y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
          if (!fn[y][x] && i < all.length * 8) {
            m[y][x] = ((all[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
            i++;
          }
        }
      }
    }

    function applyMask(mask) {
      for (var yy = 0; yy < size; yy++) {
        for (var xx = 0; xx < size; xx++) {
          var inv;
          switch (mask) {
            case 0: inv = (xx + yy) % 2 === 0; break;
            case 1: inv = yy % 2 === 0; break;
            case 2: inv = xx % 3 === 0; break;
            case 3: inv = (xx + yy) % 3 === 0; break;
            case 4: inv = (Math.floor(xx / 3) + Math.floor(yy / 2)) % 2 === 0; break;
            case 5: inv = xx * yy % 2 + xx * yy % 3 === 0; break;
            case 6: inv = (xx * yy % 2 + xx * yy % 3) % 2 === 0; break;
            default: inv = ((xx + yy) % 2 + xx * yy % 3) % 2 === 0;
          }
          if (!fn[yy][xx] && inv) m[yy][xx] = !m[yy][xx];
        }
      }
    }
    function addHistory(len, h) { if (h[0] === 0) len += size; h.pop(); h.unshift(len); }
    function countPatterns(h) {
      var n = h[1], core = n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n;
      return (core && h[0] >= n * 4 && h[6] >= n ? 1 : 0) + (core && h[6] >= n * 4 && h[0] >= n ? 1 : 0);
    }
    function terminate(color, len, h) {
      if (color) { addHistory(len, h); len = 0; }
      len += size;
      addHistory(len, h);
      return countPatterns(h);
    }
    function penalty() {
      var result = 0, xx, yy, color, run, h, darkCount = 0;
      for (var pass = 0; pass < 2; pass++) {             /* rows, then columns */
        for (yy = 0; yy < size; yy++) {
          color = false; run = 0; h = [0, 0, 0, 0, 0, 0, 0];
          for (xx = 0; xx < size; xx++) {
            var v = pass === 0 ? m[yy][xx] : m[xx][yy];
            if (v === color) {
              run++;
              if (run === 5) result += 3; else if (run > 5) result++;
            } else {
              addHistory(run, h);
              if (!color) result += countPatterns(h) * 40;
              color = v;
              run = 1;
            }
          }
          result += terminate(color, run, h) * 40;
        }
      }
      for (yy = 0; yy < size - 1; yy++) {
        for (xx = 0; xx < size - 1; xx++) {
          var c = m[yy][xx];
          if (c === m[yy][xx + 1] && c === m[yy + 1][xx] && c === m[yy + 1][xx + 1]) result += 3;
        }
      }
      for (yy = 0; yy < size; yy++) for (xx = 0; xx < size; xx++) if (m[yy][xx]) darkCount++;
      var total = size * size;
      result += (Math.ceil(Math.abs(darkCount * 20 - total * 10) / total) - 1) * 10;
      return result;
    }
    var best = mask >= 0 && mask <= 7 ? mask : -1, least = Infinity;
    for (i = 0; i < 8 && !(mask >= 0 && mask <= 7); i++) {
      applyMask(i);
      formatBits(i);
      var pen = penalty();
      if (pen < least) { least = pen; best = i; }
      applyMask(i);                                  /* taken off again */
    }
    applyMask(best);
    formatBits(best);
    return { size: size, version: ver, mask: best, dark: function (px, py) { return m[py][px]; } };
  }

  /* dark modules on white, with the quiet zone: readable on the dark theme too */
  function svg(text, o) {
    o = o || {};
    var q = modules(text, o.ecl), b = o.border == null ? 4 : o.border, n = q.size + b * 2, d = '';
    for (var y = 0; y < q.size; y++) for (var x = 0; x < q.size; x++) if (q.dark(x, y)) d += 'M' + (x + b) + ',' + (y + b) + 'h1v1h-1z';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + ' ' + n + '" shape-rendering="crispEdges" role="img"' +
      (o.label ? ' aria-label="' + String(o.label).replace(/[&<>"]/g, '') + '"' : '') + '><rect width="' + n + '" height="' + n +
      '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  }

  var api = { modules: modules, svg: svg };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.rosQr = api;
})(typeof self !== 'undefined' ? self : this);
