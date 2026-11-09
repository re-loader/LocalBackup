import * as THREE from 'three';
import { FONT } from './strings.js';
import { rr, wrapLines, drawWrapped, easeOutBack, clamp } from './util.js';
import { toTex } from './textures.js';
import { ctx } from './ctx.js';

// แผ่นป้ายในฉาก (canvas texture) — อ่านได้ทั้งในแว่น VR และบนจอคอมพิวเตอร์
// ขนาดตัวอักษรเลือกให้ตัวอักษรเล็กสุดกว้างไม่น้อยกว่า ~1° เมื่อยืนห่าง 1.3–1.6 ม.

export const PX = 760; // canvas pixels per metre

const STYLES = {
  primary: { bg: '#22b14c', fg: '#ffffff', border: '#0f7a30', hover: '#33cf61' },
  blue: { bg: '#2a64c8', fg: '#ffffff', border: '#173f86', hover: '#3d7ae0' },
  option: { bg: '#ffffff', fg: '#16306b', border: '#2a64c8', hover: '#e3eeff' },
  ghost: { bg: '#e8edf2', fg: '#2b3a4a', border: '#b9c4cf', hover: '#d5dee8' },
  danger: { bg: '#e23b3b', fg: '#ffffff', border: '#a51f1f', hover: '#f25555' },
  warn: { bg: '#ffc21a', fg: '#3a2a00', border: '#c78f00', hover: '#ffd04d' },
};
const STATE_COLORS = {
  correct: { bg: '#22b14c', fg: '#ffffff', border: '#0f7a30' },
  wrong: { bg: '#e23b3b', fg: '#ffffff', border: '#a51f1f' },
  selected: { bg: '#ffd23f', fg: '#3a2a00', border: '#c78f00' },
  disabled: { bg: '#d9dee3', fg: '#8a96a3', border: '#c3cbd3' },
};

const live = new Set();

export class Button {
  constructor(panel, { id, label, sub = null, x = 0, y = 0, w = 0.4, h = 0.11, style = 'primary', size = null, align = 'center', onClick = null }) {
    this.panel = panel;
    this.id = id ?? label;
    this.label = label; this.sub = sub;
    this.w = w; this.h = h; this.style = style; this.align = align;
    this.size = size || Math.round(h * PX * (sub ? 0.36 : 0.44));
    this.onClick = onClick;
    this.state = 'normal';
    this.enabled = true;
    this.hover = false;
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(w * PX); this.canvas.height = Math.round(h * PX);
    this.g = this.canvas.getContext('2d');
    this.tex = toTex(this.canvas, { aniso: 16 });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: !panel.overlay, depthWrite: !panel.overlay, toneMapped: false }));
    this.mesh.position.set(x, y, 0.006);
    this.mesh.userData.button = this;
    this.mesh.renderOrder = (panel.mesh.renderOrder || 0) + 1;
    panel.group.add(this.mesh);
    this.paint();
    ctx.interaction.add(this.mesh, {
      enabled: () => this.enabled && this.state !== 'disabled' && this.panel.group.visible && this.panel.interactive,
      highlight: false,
      onHover: (on) => { this.hover = on; this.paint(); if (on) ctx.audio.hover(); },
      onSelect: () => { ctx.audio.click(); this.onClick?.(this); },
    });
  }

  setState(state) { this.state = state; this.paint(); }
  setLabel(label, sub = this.sub) { this.label = label; this.sub = sub; this.paint(); }

  paint() {
    const { g, canvas: c } = this;
    const W = c.width, H = c.height;
    const base = STYLES[this.style] || STYLES.primary;
    const st = STATE_COLORS[this.state] || null;
    const bg = st ? st.bg : (this.hover ? base.hover : base.bg);
    const fg = st ? st.fg : base.fg;
    const border = st ? st.border : base.border;
    g.clearRect(0, 0, W, H);
    const r = Math.min(H * 0.32, 34);
    // drop shadow
    g.fillStyle = 'rgba(0,0,0,0.18)'; rr(g, 4, 8, W - 8, H - 10, r); g.fill();
    g.fillStyle = border; rr(g, 2, 2, W - 4, H - 8, r); g.fill();
    g.fillStyle = bg; rr(g, 6, 6, W - 12, H - 16, r - 3); g.fill();
    if (this.hover && !st) { g.strokeStyle = '#ffd23f'; g.lineWidth = 6; rr(g, 5, 5, W - 10, H - 14, r - 3); g.stroke(); }
    g.fillStyle = fg;
    g.textBaseline = 'middle';
    g.font = `700 ${this.size}px ${FONT}`;
    const pad = Math.max(20, H * 0.25);
    const tx = this.align === 'left' ? pad : W / 2;
    g.textAlign = this.align;
    let label = this.label;
    while (g.measureText(label).width > W - pad * 2 && label.length > 2) label = label.slice(0, -2) + '…';
    if (this.sub) {
      g.fillText(label, tx, H * 0.38);
      g.font = `500 ${Math.round(this.size * 0.62)}px ${FONT}`;
      g.globalAlpha = 0.85; g.fillText(this.sub, tx, H * 0.7); g.globalAlpha = 1;
    } else g.fillText(label, tx, H * 0.46);
    this.tex.needsUpdate = true;
  }

  dispose() {
    ctx.interaction.remove(this.mesh);
    this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.tex.dispose();
    this.mesh.parent?.remove(this.mesh);
  }
}

export class Panel {
  constructor({ w = 1.2, h = 0.8, bg = '#ffffff', border = '#16306b', radius = 36, billboard = false, interactive = true, overlay = true } = {}) {
    this.w = w; this.h = h; this.bg = bg; this.border = border; this.radius = radius;
    this.billboard = billboard;
    this.interactive = interactive;
    this.group = new THREE.Group();
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(w * PX); this.canvas.height = Math.round(h * PX);
    this.g = this.canvas.getContext('2d');
    this.tex = toTex(this.canvas, { aniso: 16 });
    // UI cards draw over the world (like any VR menu) so props never hide them
    this.overlay = overlay;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: !overlay, depthWrite: !overlay, toneMapped: false }));
    if (overlay) this.mesh.renderOrder = 900;
    this.group.add(this.mesh);
    this.buttons = [];
    this._pop = 1;
    live.add(this);
  }

  get W() { return this.canvas.width; }
  get H() { return this.canvas.height; }

  /** Clears to the default card background and returns the 2D context. */
  clear() {
    const { g, W, H } = this;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(0,0,0,0.25)'; rr(g, 6, 12, W - 12, H - 14, this.radius); g.fill();
    g.fillStyle = this.border; rr(g, 0, 0, W, H - 8, this.radius); g.fill();
    g.fillStyle = this.bg; rr(g, 8, 8, W - 16, H - 24, this.radius - 6); g.fill();
    return g;
  }

  commit() { this.tex.needsUpdate = true; }

  /**
   * Standard card layout:
   * header band (accent) with eyebrow + title, wrapped body, optional chips.
   */
  setContent({ eyebrow = null, title = '', body = '', accent = '#16306b', chips = null, bodySize = 34, titleSize = 46, list = null, footer = null, bodyTop = null }) {
    const g = this.clear();
    const { W, H } = this;
    const head = eyebrow ? 150 : 112;
    g.fillStyle = accent; rr(g, 8, 8, W - 16, head, this.radius - 6); g.fill(); g.fillRect(8, head - 20, W - 16, 28);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    let y = 60;
    if (eyebrow) {
      g.fillStyle = '#ffffffcc'; g.font = `700 28px ${FONT}`;
      g.fillText(eyebrow, 40, y); y += 56;
    } else y += 20;
    g.fillStyle = '#ffffff'; g.font = `800 ${titleSize}px ${FONT}`;
    let t = title;
    while (g.measureText(t).width > W - 80 && t.length > 2) t = t.slice(0, -2) + '…';
    g.fillText(t, 40, y);
    y = bodyTop ?? head + 62;
    if (chips) {
      let x = 40;
      g.font = `700 26px ${FONT}`;
      for (const c of chips) {
        const tw = g.measureText(c.text).width + 36;
        g.fillStyle = c.color || '#2a64c8'; rr(g, x, y - 34, tw, 46, 23); g.fill();
        g.fillStyle = '#fff'; g.fillText(c.text, x + 18, y - 3);
        x += tw + 12;
      }
      y += 48;
    }
    g.fillStyle = '#1d2733'; g.font = `500 ${bodySize}px ${FONT}`;
    if (body) y = drawWrapped(g, body, 40, y, W - 80, bodySize * 1.42) + 8;
    if (list) {
      for (const item of list) {
        const y0 = y;
        const col = item.color || '#2a64c8';
        g.fillStyle = col; rr(g, 40, y - bodySize * 0.95, 64, bodySize * 1.25, 12); g.fill();
        g.fillStyle = '#fff'; g.font = `800 ${Math.round(bodySize * 0.8)}px ${FONT}`; g.textAlign = 'center';
        g.fillText(item.tag || '•', 72, y - bodySize * 0.12);
        g.textAlign = 'left';
        g.fillStyle = item.done === false ? '#7a8794' : '#1d2733';
        g.font = `${item.bold ? 700 : 500} ${bodySize}px ${FONT}`;
        y = drawWrapped(g, item.text, 124, y, W - 170, bodySize * 1.3) + 14;
        if (item.done !== undefined) {
          const cy = y0 - bodySize * 0.35;
          g.fillStyle = item.done ? '#22b14c' : '#c3cbd3';
          g.beginPath(); g.arc(W - 56, cy, 20, 0, Math.PI * 2); g.fill();
          if (item.done) {
            g.strokeStyle = '#fff'; g.lineWidth = 6; g.beginPath();
            g.moveTo(W - 66, cy); g.lineTo(W - 58, cy + 8); g.lineTo(W - 44, cy - 8); g.stroke();
          }
        }
      }
    }
    if (footer) {
      g.fillStyle = '#5b6875'; g.font = `500 ${Math.round(bodySize * 0.8)}px ${FONT}`;
      drawWrapped(g, footer, 40, H - 60, W - 80, bodySize, 2);
    }
    this.commit();
    return y;
  }

  addButton(opts) {
    const b = new Button(this, opts);
    this.buttons.push(b);
    return b;
  }

  /** Lays out buttons in a row along the bottom edge. */
  buttonRow(defs, { y = null, h = 0.11, gap = 0.04, w = null } = {}) {
    const n = defs.length;
    const bw = w || Math.min(n === 1 ? 0.62 : 0.5, (this.w - 0.1 - gap * (n - 1)) / n);
    const total = n * bw + (n - 1) * gap;
    const by = y ?? (-this.h / 2 + h / 2 + 0.05);
    return defs.map((d, i) => this.addButton({ ...d, x: -total / 2 + bw / 2 + i * (bw + gap), y: by, w: bw, h }));
  }

  clearButtons() { for (const b of this.buttons) b.dispose(); this.buttons = []; }

  pop() { this._pop = 0; this.group.scale.setScalar(0.6); return this; }

  dispose() {
    this.clearButtons();
    this.group.parent?.remove(this.group);
    this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.tex.dispose();
    live.delete(this);
  }

  static updateAll(dt, camWorld) {
    for (const p of live) {
      if (p._pop < 1) {
        p._pop = clamp(p._pop + dt / 0.28, 0, 1);
        p.group.scale.setScalar(0.6 + 0.4 * easeOutBack(p._pop));
      }
      if (p.billboard && p.group.parent) {
        const wp = new THREE.Vector3();
        p.group.getWorldPosition(wp);
        const yaw = Math.atan2(camWorld.x - wp.x, camWorld.z - wp.z);
        const parentYaw = new THREE.Euler().setFromQuaternion(p.group.parent.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
        p.group.rotation.set(0, yaw - parentYaw, 0);
      }
    }
  }
}

/** Speech bubble that follows an NPC's head and faces the viewer. */
export class Bubble {
  constructor(parent, { x = 0, y = 1.85, w = 1.05 } = {}) {
    this.panel = new Panel({ w, h: 0.36, bg: '#ffffff', border: '#1d2733', radius: 40, billboard: true, interactive: false, overlay: false });
    this.panel.group.position.set(x, y, 0);
    this.panel.group.visible = false;
    parent.add(this.panel.group);
    this.until = 0;
  }
  say(name, text, sec = 5) {
    const p = this.panel;
    const g = p.clear();
    const { W, H } = p;
    g.font = `800 32px ${FONT}`;
    g.fillStyle = '#ffd23f'; rr(g, 26, 22, Math.min(W - 52, g.measureText(name).width + 40), 54, 27); g.fill();
    g.fillStyle = '#3a2a00'; g.font = `800 32px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(name, 46, 49);
    g.fillStyle = '#1d2733'; g.font = `600 34px ${FONT}`; g.textBaseline = 'alphabetic';
    const lines = wrapLines(g, text, W - 70);
    let size = 34;
    if (lines.length > 3) { size = 28; g.font = `600 ${size}px ${FONT}`; }
    drawWrapped(g, text, 36, 118, W - 70, size * 1.3, 4);
    p.commit();
    p.group.visible = true;
    p.pop();
    this.until = performance.now() + sec * 1000;
  }
  hide() { this.panel.group.visible = false; }
  update() { if (this.panel.group.visible && performance.now() > this.until) this.panel.group.visible = false; }
}
