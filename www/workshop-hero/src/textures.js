import * as THREE from 'three';
import { FONT } from './strings.js';
import { rr, drawWrapped } from './util.js';

// พื้นผิวทั้งหมดวาดด้วย canvas ตอนรันไทม์ — ไม่มีไฟล์ภาพ จึงเล่นออฟไลน์ได้

const cache = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

export function toTex(c, { repeat = null, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

function speckle(g, w, h, n, alpha, light = false) {
  for (let i = 0; i < n; i++) {
    const v = light ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${Math.random() * alpha})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

/** Wooden planks (floors) or a single board's grain (furniture). */
export function woodTex(base = '#c58b4e', planks = 4, repeat = [1, 1]) {
  return cached(`wood${base}${planks}${repeat}`, () => {
    const [c, g] = canvas(512, 512);
    const ph = 512 / planks;
    for (let p = 0; p < planks; p++) {
      const col = new THREE.Color(base).offsetHSL(0, 0, (Math.random() - 0.5) * 0.06);
      g.fillStyle = `#${col.getHexString()}`;
      g.fillRect(0, p * ph, 512, ph);
      for (let i = 0; i < 26; i++) {
        g.strokeStyle = `rgba(80,40,10,${0.05 + Math.random() * 0.1})`;
        g.lineWidth = 1 + Math.random() * 2;
        g.beginPath();
        const y = p * ph + Math.random() * ph;
        g.moveTo(0, y);
        for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 3);
        g.stroke();
      }
      if (planks > 1) {
        g.fillStyle = 'rgba(60,30,10,0.35)';
        g.fillRect(0, p * ph, 512, 2);
        const off = (p % 2) * 256 + 128;
        g.fillRect(off, p * ph, 2, ph);
      }
    }
    return toTex(c, { repeat });
  });
}

export function concreteTex(repeat = [4, 4]) {
  return cached(`concrete${repeat}`, () => {
    const [c, g] = canvas(256, 256);
    g.fillStyle = '#9aa1a6'; g.fillRect(0, 0, 256, 256);
    speckle(g, 256, 256, 2400, 0.18);
    speckle(g, 256, 256, 900, 0.15, true);
    return toTex(c, { repeat });
  });
}

export function tileTex(a = '#f4f1ea', grout = '#cfc8bb', n = 4, repeat = [4, 4]) {
  return cached(`tile${a}${grout}${n}${repeat}`, () => {
    const [c, g] = canvas(256, 256);
    g.fillStyle = grout; g.fillRect(0, 0, 256, 256);
    const s = 256 / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const col = new THREE.Color(a).offsetHSL(0, 0, (Math.random() - 0.5) * 0.03);
      g.fillStyle = `#${col.getHexString()}`;
      g.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
    }
    return toTex(c, { repeat });
  });
}

export function checkerTex(a, b, repeat = [6, 6]) {
  return cached(`check${a}${b}${repeat}`, () => {
    const [c, g] = canvas(128, 128);
    g.fillStyle = a; g.fillRect(0, 0, 128, 128);
    g.fillStyle = b; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64);
    speckle(g, 128, 128, 300, 0.06);
    return toTex(c, { repeat });
  });
}

export function wallTex(color = '#f3ead8', repeat = [3, 1]) {
  return cached(`wall${color}${repeat}`, () => {
    const [c, g] = canvas(256, 256);
    g.fillStyle = color; g.fillRect(0, 0, 256, 256);
    speckle(g, 256, 256, 1600, 0.035);
    return toTex(c, { repeat });
  });
}

export function pegboardTex(repeat = [1, 1]) {
  return cached(`peg${repeat}`, () => {
    const [c, g] = canvas(512, 256);
    g.fillStyle = '#c9a272'; g.fillRect(0, 0, 512, 256);
    speckle(g, 512, 256, 1500, 0.06);
    g.fillStyle = 'rgba(60,40,20,0.55)';
    for (let x = 12; x < 512; x += 24) for (let y = 12; y < 256; y += 24) {
      g.beginPath(); g.arc(x, y, 3.2, 0, Math.PI * 2); g.fill();
    }
    return toTex(c, { repeat });
  });
}

/** View out of a window: sky, a school field, and trees. */
export function windowViewTex() {
  return cached('window', () => {
    const [c, g] = canvas(512, 384);
    const sky = g.createLinearGradient(0, 0, 0, 260);
    sky.addColorStop(0, '#62b6f0'); sky.addColorStop(1, '#d6efff');
    g.fillStyle = sky; g.fillRect(0, 0, 512, 384);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    for (const [x, y, s] of [[90, 60, 1], [330, 40, 1.3], [450, 90, 0.8]]) {
      for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x + k * 22 * s, y + (k % 2) * 6, 20 * s, 0, Math.PI * 2); g.fill(); }
    }
    g.fillStyle = '#8fcf6a'; g.fillRect(0, 250, 512, 134);
    g.fillStyle = '#c8b28a'; g.fillRect(0, 300, 512, 18);
    for (let i = 0; i < 9; i++) {
      const x = 20 + i * 60 + Math.random() * 20, y = 230 + Math.random() * 20;
      g.fillStyle = '#6b4a2b'; g.fillRect(x - 4, y, 8, 40);
      g.fillStyle = ['#3f9b45', '#4caf50', '#2f8a3d'][i % 3];
      g.beginPath(); g.arc(x, y - 6, 26 + Math.random() * 10, 0, Math.PI * 2); g.fill();
    }
    return toTex(c);
  });
}

/** A text sign. Sizes are in canvas px; the caller picks the plane size. */
export function signTex(text, { w = 512, h = 128, bg = '#16306b', fg = '#ffffff', size = 56, border = null, sub = null, subSize = 30, radius = 18 } = {}) {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg; rr(g, 0, 0, w, h, radius); g.fill();
  if (border) { g.strokeStyle = border; g.lineWidth = 8; rr(g, 4, 4, w - 8, h - 8, radius); g.stroke(); }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 ${size}px ${FONT}`;
  if (sub) {
    g.fillText(text, w / 2, h * 0.4);
    g.font = `500 ${subSize}px ${FONT}`;
    g.globalAlpha = 0.85;
    g.fillText(sub, w / 2, h * 0.76);
    g.globalAlpha = 1;
  } else g.fillText(text, w / 2, h / 2 + 2);
  return toTex(c, { aniso: 16 });
}

/** A poster: coloured header band, then wrapped body text. */
export function posterTex({ title, body, accent = '#e23b3b', w = 512, h = 704, icon = null }) {
  const [c, g] = canvas(w, h);
  g.fillStyle = '#fffdf6'; g.fillRect(0, 0, w, h);
  g.fillStyle = accent; g.fillRect(0, 0, w, 150);
  g.fillStyle = '#fff'; g.font = `800 54px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  drawWrapped(g, title, w / 2, 56, w - 40, 60, 2);
  if (icon) icon(g, w / 2, 330);
  g.fillStyle = '#23303d'; g.font = `600 38px ${FONT}`; g.textBaseline = 'top';
  drawWrapped(g, body, w / 2, h - 230, w - 60, 50, 4);
  g.strokeStyle = accent; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
  return toTex(c, { aniso: 16 });
}

/** Glow sprite for hint rings and sparkles. */
export function glowTex(color = '#ffd84a') {
  return cached(`glow${color}`, () => {
    const [c, g] = canvas(128, 128);
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    gr.addColorStop(0, color); gr.addColorStop(0.35, color + 'aa'); gr.addColorStop(1, color + '00');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return toTex(c);
  });
}

/** Simple star shape on canvas (used by result panels). */
export function drawStar(g, cx, cy, r, fill, stroke = null) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const rad = i % 2 ? r * 0.45 : r;
    g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  g.closePath();
  g.fillStyle = fill; g.fill();
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = r * 0.12; g.stroke(); }
}

// ---------------------------------------------------------------------
// Photographic materials (optional) — generated by tools/gen-textures.py
// ---------------------------------------------------------------------
// assets/textures/manifest.json lists what exists: { name: { file, covers: [w, h] metres } }.
// Anything missing keeps the canvas-drawn surface, so the game never depends on these files.
let photoManifest = {};
const photoBase = new Map();
const photoClones = new Map();
const photoLoader = new THREE.TextureLoader();

export async function loadPhotoManifest() {
  try {
    const r = await fetch('assets/textures/manifest.json', { cache: 'no-cache' });
    if (r.ok) photoManifest = await r.json();
  } catch { /* offline without assets: drawn surfaces */ }
  return Object.keys(photoManifest);
}
export const hasPhoto = (name) => !!photoManifest[name];

/**
 * A photo texture for surfaces whose UVs are in metres (room shells): repeat = 1 / covers.
 * `repeat` overrides that for meshes with 0..1 UVs (e.g. a 3.3 m pegboard box face).
 */
export function photo(name, { repeat = null, mirror = false } = {}) {
  const m = photoManifest[name];
  if (!m) return null;
  if (!photoBase.has(name)) {
    const t = photoLoader.load(`assets/textures/${m.file}`, undefined, undefined, () => {
      // a failed download must not leave a black surface: neutral white keeps the material's own colour
      const c = document.createElement('canvas'); c.width = c.height = 4;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 4, 4);
      t.image = c; t.needsUpdate = true;
    });
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    photoBase.set(name, t);
  }
  const key = `${name}|${repeat || ''}|${mirror}`;
  if (photoClones.has(key)) return photoClones.get(key);
  const t = photoBase.get(name).clone();       // shares the image; own repeat
  t.wrapS = t.wrapT = mirror ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  else if (m.covers) t.repeat.set(1 / m.covers[0], 1 / m.covers[1]);
  photoClones.set(key, t);
  return t;
}
