import * as THREE from 'three';
import { FONT, ADISAC, STAGE, T, ITEMS } from './strings.js';
import { rr, clamp, wrapLines } from './util.js';
import { toTex } from './textures.js';
import { ctx } from './ctx.js';

// HUD สองหน้า: DOM บนจอคอมพิวเตอร์ และแผ่นป้ายติดสายตาในแว่น VR
// แถบ ADISAC 6 ขั้นแสดงตลอด · ขั้น ADVICE กะพริบเมื่อครูช่างแนะนำ · SYNTHESIS = แถบ K-S-A

const KIND = {
  tip: { bg: '#2a64c8', label: 'คำแนะนำ' },
  warn: { bg: '#e23b3b', label: 'ระวัง!' },
  good: { bg: '#22b14c', label: 'เยี่ยม!' },
  info: { bg: '#16306b', label: 'ครูช่าง' },
};

function fmtTime(s) {
  const neg = s < 0; s = Math.abs(Math.round(s));
  return `${neg ? '-' : ''}${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export class HUD {
  constructor(camera) {
    this.camera = camera;
    this.s = { level: null, stage: null, objective: '', checklist: [], scores: null, timer: null, resources: null, bag: null, ppe: null, visible: false };
    this.adviceFlash = 0;
    this.toast = null;
    this.toastUntil = 0;
    this._dirty = true;
    this._buildDom();
    this._buildVR(camera);
  }

  // ------------------------------------------------------------------ DOM
  _buildDom() {
    const root = document.getElementById('hud');
    root.innerHTML = `
      <div class="hud-card hud-left">
        <div class="hud-level"></div>
        <div class="hud-adisac">${ADISAC.stages.map((s) => `<span data-k="${s.key}" style="--c:${s.color}"><b>${s.n}</b>${s.key}</span>`).join('')}</div>
        <div class="hud-stage"></div>
        <div class="hud-obj"></div>
        <ul class="hud-check"></ul>
      </div>
      <div class="hud-card hud-right">
        <div class="hud-syn">4.SYNTHESIS · ความก้าวหน้า</div>
        <div class="hud-scores"></div>
        <div class="hud-timer"></div>
        <div class="hud-res"></div>
      </div>
      <div class="hud-bottom">
        <div class="hud-toast hidden"><span class="who"></span><span class="msg"></span></div>
        <div class="hud-bag"></div>
      </div>`;
    const q = (s) => root.querySelector(s);
    this.dom = {
      root, level: q('.hud-level'), adisac: q('.hud-adisac'), stage: q('.hud-stage'), obj: q('.hud-obj'), check: q('.hud-check'),
      right: q('.hud-right'), scores: q('.hud-scores'), timer: q('.hud-timer'), res: q('.hud-res'),
      toast: q('.hud-toast'), who: q('.hud-toast .who'), msg: q('.hud-toast .msg'), bag: q('.hud-bag'),
    };
  }

  _renderDom() {
    const { s, dom } = this;
    dom.root.classList.toggle('hidden', !s.visible || ctx.vr);
    if (s.level) {
      dom.level.innerHTML = `<span style="background:${s.level.color}">ด่าน ${s.level.id}</span> ${s.level.name} <small>(${s.level.diff})</small>`;
    }
    for (const el of dom.adisac.children) {
      el.classList.toggle('on', el.dataset.k === s.stage);
      el.classList.toggle('flash', el.dataset.k === 'ADVICE' && this.adviceFlash > 0);
    }
    const st = STAGE[s.stage];
    dom.stage.textContent = st ? `${st.n}.${st.key} — ${st.th}` : '';
    dom.stage.style.color = st?.color || '';
    dom.obj.textContent = s.objective || '';
    dom.check.innerHTML = (s.checklist || []).map((c) => `<li class="${c.done ? 'done' : ''}">${c.text}</li>`).join('');
    if (s.scores) {
      dom.right.classList.remove('hidden');
      dom.scores.innerHTML = ['K', 'S', 'A'].map((k) => `
        <div class="sc"><b class="k${k}">${k}</b><span>${T.scoreLabels[k]}</span>
        <i><em style="width:${clamp(s.scores[k], 0, 100)}%"></em></i><strong>${Math.round(s.scores[k])}</strong></div>`).join('');
    } else dom.right.classList.add('hidden');
    dom.timer.classList.toggle('hidden', s.timer === null);
    if (s.timer !== null) {
      dom.timer.textContent = `${T.timeLeft} ${fmtTime(s.timer)}`;
      dom.timer.classList.toggle('late', s.timer < 0);
    }
    dom.res.classList.toggle('hidden', !s.resources);
    if (s.resources) {
      dom.res.innerHTML = Object.entries(s.resources).map(([k, v]) => `<span class="r-${k}">${T.resources[k]} <b>${v}</b></span>`).join('');
    }
    const parts = [];
    if (s.bag) parts.push(`<span class="lbl">${T.bag}</span>` + (s.bag.length ? s.bag.map((id) => `<span class="it">${ITEMS[id].th}</span>`).join('') : '<span class="it empty">ว่าง</span>'));
    if (s.ppe) parts.push('<span class="lbl">PPE</span>' + Object.entries(s.ppe).map(([k, on]) => `<span class="it ${on ? 'on' : 'off'}">${T.ppe[k]}</span>`).join(''));
    dom.bag.innerHTML = parts.join('<span class="sep"></span>');
    dom.bag.classList.toggle('hidden', !parts.length);
  }

  // ------------------------------------------------------------------ VR
  _buildVR(camera) {
    const mk = (w, h, pw, ph, y) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const tex = toTex(c, { aniso: 16 });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
      m.position.set(0, y, -0.9);
      m.renderOrder = 999;
      m.visible = false;
      camera.add(m);
      return { c, g: c.getContext('2d'), tex, m };
    };
    this.vr = mk(1024, 300, 0.5, 0.1465, -0.29);
    this.vrToast = mk(1024, 170, 0.5, 0.083, -0.15);
    // fade sphere for scene changes
    this.fader = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12), new THREE.MeshBasicMaterial({ color: '#000', side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false }));
    this.fader.renderOrder = 10000;
    this.fader.visible = false;
    camera.add(this.fader);
    this._fade = null;

    // ---- what the wearer sees of their own PPE, and the comfort vignette (VR) ----
    const overlay = (w, h, draw, z, y = 0, order = 990) => {
      const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * h / w);
      draw(c.getContext('2d'), c.width, c.height);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: toTex(c), transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
      m.position.set(0, y, z); m.renderOrder = order; m.visible = false;
      camera.add(m);
      return m;
    };
    // safety goggles: dark rubber rim at the edge of vision, a faint blue lens tint, a seam at the nose
    this.gogglesFx = overlay(0.56, 0.44, (g, W, H) => {
      g.fillStyle = 'rgba(150,205,255,0.07)'; g.fillRect(0, 0, W, H);
      const rim = g.createRadialGradient(W / 2, H / 2, H * 0.36, W / 2, H / 2, H * 0.72);
      rim.addColorStop(0, 'rgba(20,28,40,0)'); rim.addColorStop(0.55, 'rgba(20,28,40,0.55)'); rim.addColorStop(1, 'rgba(20,28,40,0.97)');
      g.fillStyle = rim; g.fillRect(0, 0, W, H);
      const nose = g.createLinearGradient(0, H * 0.62, 0, H);
      nose.addColorStop(0, 'rgba(20,28,40,0)'); nose.addColorStop(1, 'rgba(20,28,40,0.8)');
      g.fillStyle = nose; g.beginPath(); g.moveTo(W * 0.44, H); g.quadraticCurveTo(W / 2, H * 0.66, W * 0.56, H); g.fill();
    }, -0.2);
    // hard-hat brim along the top of the view
    this.helmetFx = overlay(0.62, 0.1, (g, W, H) => {
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, 'rgba(242,183,5,0.95)'); gr.addColorStop(0.55, 'rgba(199,143,0,0.75)'); gr.addColorStop(1, 'rgba(199,143,0,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.lineTo(W, 0); g.lineTo(W, H * 0.7); g.quadraticCurveTo(W / 2, H * 1.05, 0, H * 0.7); g.fill();
    }, -0.2, 0.2);
    // comfort vignette while moving with the stick or snap-turning
    this.vignette = overlay(0.6, 0.6, (g, W, H) => {
      const gr = g.createRadialGradient(W / 2, H / 2, W * 0.18, W / 2, H / 2, W * 0.5);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.7, 'rgba(0,0,0,0.7)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }, -0.16, 0, 995);
    this.vignette.material.opacity = 0;
  }

  _renderVR() {
    const { g, c, tex } = this.vr;
    const s = this.s;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(14,26,52,0.88)'; rr(g, 0, 0, c.width, c.height, 36); g.fill();
    // ADISAC strip
    const pw = (c.width - 40) / 6;
    ADISAC.stages.forEach((st, i) => {
      const on = st.key === s.stage;
      const flash = st.key === 'ADVICE' && this.adviceFlash > 0 && Math.floor(this.adviceFlash * 4) % 2 === 0;
      g.fillStyle = on || flash ? st.color : 'rgba(255,255,255,0.08)';
      rr(g, 20 + i * pw + 4, 16, pw - 8, 56, 28); g.fill();
      g.fillStyle = on || flash ? '#fff' : 'rgba(255,255,255,0.55)';
      g.font = `800 30px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(`${st.n} ${st.key}`, 20 + i * pw + pw / 2, 45);
    });
    // objective
    g.textAlign = 'left';
    let x = 30;
    if (s.level) {
      g.fillStyle = s.level.color; rr(g, 26, 92, 120, 56, 18); g.fill();
      g.fillStyle = '#fff'; g.font = `800 32px ${FONT}`; g.fillText(`ด่าน ${s.level.id}`, 42, 121);
      x = 162;
    }
    g.fillStyle = '#fff'; g.font = `600 36px ${FONT}`;
    let obj = s.objective || '';
    while (g.measureText(obj).width > c.width - x - 30 && obj.length > 2) obj = obj.slice(0, -2) + '…';
    g.fillText(obj, x, 121);
    // scores / timer / resources / bag
    let bx = 30;
    if (s.scores) {
      for (const k of ['K', 'S', 'A']) {
        g.fillStyle = { K: '#2f7fe0', S: '#f2a20c', A: '#22b14c' }[k];
        g.font = `800 34px ${FONT}`; g.fillText(k, bx, 205);
        g.fillStyle = 'rgba(255,255,255,0.15)'; rr(g, bx + 32, 190, 120, 26, 13); g.fill();
        g.fillStyle = { K: '#2f7fe0', S: '#f2a20c', A: '#22b14c' }[k]; rr(g, bx + 32, 190, 120 * clamp(s.scores[k], 0, 100) / 100, 26, 13); g.fill();
        g.fillStyle = '#fff'; g.font = `700 28px ${FONT}`; g.fillText(String(Math.round(s.scores[k])), bx + 162, 205);
        bx += 220;
      }
    }
    g.font = `700 32px ${FONT}`;
    let rx = c.width - 30;
    g.textAlign = 'right';
    if (s.timer !== null) {
      g.fillStyle = s.timer < 0 ? '#ff6b6b' : '#ffd23f';
      g.fillText(`เวลา ${fmtTime(s.timer)}`, rx, 205); rx -= 190;
    }
    if (s.resources) {
      g.fillStyle = '#ffd23f';
      g.fillText(`เงิน ${s.resources.money} · วัสดุ ${s.resources.material} · พลังงาน ${s.resources.energy}`, rx, 262);
    } else if (s.bag || s.ppe) {
      const bits = [];
      if (s.bag) bits.push(`${T.bag}: ${s.bag.length ? s.bag.map((id) => ITEMS[id].th).join(' · ') : 'ว่าง'}`);
      if (s.ppe) bits.push(`PPE ${Object.values(s.ppe).filter(Boolean).length}/3`);
      g.fillStyle = '#cfe0ff';
      let t = bits.join('   ');
      while (g.measureText(t).width > c.width - 60 && t.length > 2) t = t.slice(0, -2) + '…';
      g.fillText(t, c.width - 30, 262);
    }
    tex.needsUpdate = true;
  }

  _renderVRToast() {
    const { g, c, tex, m } = this.vrToast;
    const t = this.toast;
    m.visible = !!(ctx.vr && t && this.s.visible);
    if (!t) return;
    const k = KIND[t.kind] || KIND.tip;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = k.bg; rr(g, 0, 0, c.width, c.height, 32); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.22)'; rr(g, 16, 16, 190, 50, 25); g.fill();
    g.fillStyle = '#fff'; g.font = `800 28px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(k.label, 111, 42);
    g.textAlign = 'left'; g.font = `600 34px ${FONT}`; g.textBaseline = 'alphabetic';
    const lines = wrapLines(g, t.text, c.width - 60);
    if (lines.length > 2) { lines.length = 2; lines[1] = lines[1].slice(0, -1) + '…'; }
    lines.forEach((l, i) => g.fillText(l, 30, 108 + i * 46));
    tex.needsUpdate = true;
  }

  // ------------------------------------------------------------------ API
  set(patch) { Object.assign(this.s, patch); this._dirty = true; }
  check(i, done = true) { if (this.s.checklist[i]) { this.s.checklist[i].done = done; this._dirty = true; } }

  /** ADVICE: immediate coaching, on screen, in the headset, and spoken. */
  coach(text, kind = 'tip', { speak = true, sec = null } = {}) {
    this.toast = { text, kind };
    this.toastUntil = performance.now() + (sec ?? Math.max(4, text.length * 0.09)) * 1000;
    this.adviceFlash = 2.5;
    const k = KIND[kind] || KIND.tip;
    this.dom.toast.classList.remove('hidden');
    this.dom.toast.style.background = k.bg;
    this.dom.who.textContent = `${k.label} · 5.ADVICE`;
    this.dom.msg.textContent = text;
    this._renderVRToast();
    this._dirty = true;
    if (speak) ctx.audio?.voice(text, 'coach');
  }
  clearToast() { this.toast = null; this.dom.toast.classList.add('hidden'); this._renderVRToast(); }

  setVR(on) {
    this.vr.m.visible = on && this.s.visible;
    this._dirty = true;
    this._renderVRToast();
  }

  fade(to, sec = 0.25) {
    return new Promise((res) => {
      this.fader.visible = true;
      this._fade = { from: this.fader.material.opacity, to, t: 0, sec, res };
    });
  }

  update(dt) {
    // PPE seen from the inside (VR; the desktop uses the CSS frame) and the comfort vignette
    const body = document.body.classList;
    this.gogglesFx.visible = ctx.vr && body.contains('goggles');
    this.helmetFx.visible = ctx.vr && body.contains('helmet');
    const L = ctx.loco;
    const want = ctx.vr && L && (L.moving || L.turnFlash > 0) ? 0.85 : 0;
    const v = this.vignette.material;
    v.opacity += (want - v.opacity) * Math.min(1, dt * (want ? 10 : 4));
    this.vignette.visible = v.opacity > 0.01;
    if (this._fade) {
      const f = this._fade;
      f.t += dt;
      const k = clamp(f.t / f.sec, 0, 1);
      this.fader.material.opacity = f.from + (f.to - f.from) * k;
      if (k >= 1) { this._fade = null; if (f.to === 0) this.fader.visible = false; f.res(); }
    }
    if (this.adviceFlash > 0) {
      const before = Math.floor(this.adviceFlash * 4);
      this.adviceFlash -= dt;
      if (Math.floor(this.adviceFlash * 4) !== before || this.adviceFlash <= 0) this._dirty = true;
    }
    if (this.toast && performance.now() > this.toastUntil) this.clearToast();
    if (this._dirty) {
      this._dirty = false;
      this._renderDom();
      if (ctx.vr) this._renderVR();
    }
    // in the headset the view-locked card sits low in the view — exactly where the hands work — so it
    // steps aside while a hands-on task (its own panel) is running
    this.vr.m.visible = ctx.vr && this.s.visible && !ctx.interaction?.capture;
  }
}
