import * as THREE from 'three';
import { T, FONT, LEVELS, STAGE, ADISAC, ITEMS } from './strings.js';
import { Flow, Cancelled, rr, drawWrapped, clamp, easeInOut, shuffle } from './util.js';
import { Panel, Bubble, PX } from './panel.js';
import { drawStar } from './textures.js';
import { runTiming } from './minigame.js';
import { ctx } from './ctx.js';
import { SCRIPTS } from './levels.js';
import { N } from './narration.js';

// แกนของเกม: ลำดับขั้นตาม ADISAC, การให้คะแนน K-S-A, การบันทึกผล (telemetry)
// แต่ละด่านทำงานใน Run ของตัวเอง — เริ่มด่านใหม่กลางทาง Run เดิมถูกยกเลิกทั้งหมด

const STORE = 'workshopHero.runs';

export function loadRuns() {
  try { return JSON.parse(localStorage.getItem(STORE) || '[]'); } catch { return []; }
}
function saveRun(rec) {
  try {
    const all = loadRuns();
    all.push(rec);
    localStorage.setItem(STORE, JSON.stringify(all.slice(-300)));
  } catch { /* storage unavailable: results still shown in-game */ }
}

/** One playthrough of one level (or the title / final screen). */
export class Run {
  constructor(game, levelIndex) {
    this.game = game;
    this.levelIndex = levelIndex;
    this.L = LEVELS[levelIndex] || null;
    this.flow = new Flow();
    this.dead = false;
    this.hints = [];
    this.t0 = performance.now();
    this.K = { ok: 0, n: 0 };
    this.S = { sum: 0, n: 0 };
    this.A = { pen: 0 };
    this.events = [];
    this.flags = {};
    this.timer = null;          // { left, limit }
    this.resources = null;
  }

  check() { if (this.dead) throw new Cancelled(); }
  /** Game time: stops while the page is hidden or the headset is off, unlike the wall clock. */
  get elapsed() { return this.flow.time; }

  // ---------------------------------------------------------------- scoring
  log(type, data = {}) { this.events.push({ t: +this.elapsed.toFixed(1), type, ...data }); }
  k(correct, tag) { this.K.n++; if (correct) this.K.ok++; this.log('K', { tag, correct }); this.refresh(); }
  s(quality, tag) { this.S.n++; this.S.sum += clamp(quality, 0, 1); this.log('S', { tag, q: +quality.toFixed(2) }); this.refresh(); }
  a(points, reason, coachText = null) {
    this.A.pen += points;
    this.log('A', { reason, points });
    if (coachText) ctx.hud.coach(coachText, 'warn');
    this.refresh();
  }
  scores() {
    return {
      K: this.K.n ? (100 * this.K.ok) / this.K.n : 100,
      S: this.S.n ? (100 * this.S.sum) / this.S.n : 100,
      A: Math.max(0, 100 - this.A.pen),
    };
  }
  refresh() { ctx.hud.set({ scores: this.scores() }); }

  // ---------------------------------------------------------------- staging
  begin() {
    const L = this.L;
    ctx.hud.set({
      visible: true, level: L ? { id: L.id, name: L.name, diff: L.diff, color: L.color } : null,
      checklist: L ? L.checklist.map((text) => ({ text, done: false })) : [],
      scores: this.scores(), timer: null, resources: null, bag: null, ppe: null, objective: '',
    });
    this.log('start', { level: L?.id });
    ctx.audio.setMusicLevel(0.02);   // let the room be heard while working
  }
  stage(key) {
    this.check();
    ctx.hud.set({ stage: key });
    ctx.world.scenes.hub.board.redraw(key);
    this.log('stage', { key });
    ctx.audio.good();
    ctx.audio.voice(N.stage(key), 'coach');           // "ขั้นที่ 2 DIVIDE แยกองค์ความรู้"
  }
  objective(text) { ctx.hud.set({ objective: text }); }
  checkItem(i, done = true) { ctx.hud.check(i, done); }
  coach(text, kind = 'tip') { ctx.hud.coach(text, kind); }

  startTimer(limit) { this.timer = { left: limit, limit, warned: false }; ctx.hud.set({ timer: limit }); }
  stopTimer() { const t = this.timer; this.timer = null; ctx.hud.set({ timer: null }); return t; }

  // ---------------------------------------------------------------- movement
  async goTo(scene, station = 'start') {
    this.check();
    await ctx.hud.fade(1, 0.22);
    this.check();
    ctx.world.show(scene);
    ctx.loco.place(ctx.world.current.stations[station]);
    ctx.audio.whoosh();
    await ctx.hud.fade(0, 0.3);
    this.check();
  }
  async moveTo(station) {
    this.check();
    const st = ctx.world.current.stations[station];
    const cam = new THREE.Vector3(); ctx.camera.getWorldPosition(cam);
    if (cam.distanceTo(new THREE.Vector3(st.pos.x, cam.y, st.pos.z)) < 0.35 && !ctx.vr) { ctx.loco.place(st); return; }
    await ctx.hud.fade(1, 0.15);
    this.check();
    ctx.loco.place(st);
    await ctx.hud.fade(0, 0.2);
    this.check();
  }
  wait(sec) { this.check(); return this.flow.wait(sec); }

  // ---------------------------------------------------------------- talk
  say(npc, name, text, { speak = true } = {}) {
    this.check();
    const b = npc.root.userData.bubble;
    const sec = Math.max(4, text.length * 0.085);
    b?.say(name, text, sec);
    npc.talk(Math.min(sec, 4));
    if (speak) {
      const role = name === T.friendName ? 'friend' : 'teacher';
      const mouth = npc.head.getWorldPosition(new THREE.Vector3());
      // lips move for as long as the recording actually lasts
      ctx.audio.voice(text, role, mouth).then((d) => { if (d) { npc.talk(d); b?.say(name, text, Math.max(sec, d + 1)); } });
    }
    this.log('say', { name });
    return sec;
  }

  // ---------------------------------------------------------------- hints
  hint(obj, opts) { const h = ctx.hints.show(obj, opts); this.hints.push(h); return h; }
  unhint(h) { if (!h) return; ctx.hints.hide(h); this.hints = this.hints.filter((x) => x !== h); }
  clearHints() { for (const h of this.hints) ctx.hints.hide(h); this.hints = []; }

  // ---------------------------------------------------------------- placement
  /** Where a pop-up panel goes: in front of the gaze, or at a fixed spot. */
  place(group, at = null, dist = 1.3) {
    ctx.scene.add(group);
    const cam = new THREE.Vector3(); ctx.camera.getWorldPosition(cam);
    if (!at && ctx.world.current?.dialogAt) at = ctx.world.current.dialogAt;
    if (at && at.pos) {
      group.position.copy(at.pos);
      if (at.yaw !== undefined) group.rotation.set(0, at.yaw, 0); else group.lookAt(cam);
      return;
    }
    const dir = new THREE.Vector3(); ctx.camera.getWorldDirection(dir);
    const pitch = clamp(Math.asin(clamp(dir.y, -1, 1)), -0.45, 0.3);
    dir.y = 0; dir.normalize();
    group.position.copy(cam).addScaledVector(dir, dist * Math.cos(pitch));
    group.position.y = cam.y + Math.sin(pitch) * dist - 0.04;
    group.lookAt(cam);
  }

  // ---------------------------------------------------------------- dialogs
  dialog({ eyebrow = null, title = '', body = '', list = null, chips = null, accent = '#16306b', buttons = [{ id: 'ok', label: T.next }], w = 1.3, h = 0.78, at = null, bodySize = 34, titleSize = 46, draw = null, border = null, dist = 1.3, say = null }) {
    this.check();
    return this.flow.wrap((resolve) => {
      const p = new Panel({ w, h, border: border || accent });
      if (draw) draw(p, resolve); else p.setContent({ eyebrow, title, body, list, chips, accent, bodySize, titleSize });
      p.buttonRow(buttons.map((b) => ({ ...b, onClick: () => resolve(b.id ?? b.label) })), { h: 0.12 });
      this.place(p.group, at, dist);
      p.pop();
      ctx.audio.notify();
      if (say) ctx.audio.voice(say === true ? body : say, 'coach');
      return () => p.dispose();
    });
  }

  /** Multiple-choice question; returns true when the first answer was right. */
  quiz({ q, options, answer, why }, { at = null, n = null, of = null, eyebrow = '2.DIVIDE · ความรู้ (K)', tag = 'quiz' } = {}) {
    this.check();
    return this.flow.wrap((resolve) => {
      const h = 0.62 + options.length * 0.15;
      const p = new Panel({ w: 1.5, h, border: '#2f9fd0' });
      p.setContent({ eyebrow, title: n ? `คำถามที่ ${n}/${of}` : 'คำถาม', body: q, accent: '#2f9fd0', bodySize: 38 });
      ctx.audio.voice(q, 'coach');        // the coach reads the question aloud
      let answered = false;
      const btns = options.map((o, i) => p.addButton({
        id: i, label: `${'ABC'[i]}.  ${o}`, style: 'option', align: 'left', size: 34,
        x: 0, y: h / 2 - 0.42 - i * 0.15, w: 1.36, h: 0.12,
        onClick: () => {
          if (answered) return;
          answered = true;
          const ok = i === answer;
          btns[i].setState(ok ? 'correct' : 'wrong');
          if (!ok) btns[answer].setState('correct');
          btns.forEach((b, j) => { if (j !== i && j !== answer) b.setState('disabled'); });
          this.k(ok, tag);
          if (ok) { ctx.audio.ping(); ctx.hud.coach(`ถูกต้อง! ${why}`, 'good'); } else { ctx.audio.error(); ctx.hud.coach(why, 'tip'); }
          p.addButton({ id: 'next', label: T.next, style: 'primary', x: 0.5, y: -h / 2 + 0.11, w: 0.4, h: 0.11, onClick: () => resolve(ok) });
        },
      }));
      this.place(p.group, at);
      p.pop();
      return () => p.dispose();
    });
  }

  /** Waits for the player to select one of `targets` ({ obj, id, label }). */
  pick(targets, { idle = null, until = null } = {}) {
    this.check();
    return this.flow.wrap((resolve) => {
      const offUntil = until ? this.game.addTicker(() => { if (until()) resolve('timeout'); }) : null;
      for (const t of targets) {
        ctx.interaction.add(t.obj, { label: t.label || null, highlight: t.highlight !== false, onSelect: () => resolve(t.id ?? t.obj) });
      }
      let idleT = 0, hinted = [];
      const off = idle ? this.game.addTicker((dt) => {
        idleT += dt;
        if (idleT > idle.sec && !hinted.length) {
          hinted = (idle.objs || []).map((o) => ctx.hints.show(o));
          if (idle.text) ctx.hud.coach(idle.text, 'tip');
        }
      }) : null;
      return () => {
        for (const t of targets) ctx.interaction.remove(t.obj);
        off?.();
        offUntil?.();
        hinted.forEach((h) => ctx.hints.hide(h));
      };
    });
  }

  /**
   * Pick-a-tool panel. Loops until a right one is chosen; the first choice
   * is the knowledge decision that is scored.
   */
  async chooseTool({ title = T.chooseFromBag, options, correct, why = {}, at = null, tag = 'tool', eyebrow = 'ความรู้ (K) · เลือกให้ถูกงาน' }) {
    let first = true;
    ctx.audio.voice(title, 'coach');
    for (;;) {
      this.check();
      const n = options.length;
      const cols = n > 4 ? 3 : n;
      const rows = Math.ceil(n / cols);
      const w = Math.max(1.1, cols * 0.42 + 0.14);
      const h = 0.34 + rows * 0.15;
      const id = await this.flow.wrap((resolve) => {
        const p = new Panel({ w, h, border: '#16306b' });
        const g = p.clear();
        g.fillStyle = '#16306b'; rr(g, 8, 8, p.W - 16, 100, 30); g.fill(); g.fillRect(8, 80, p.W - 16, 28);
        g.fillStyle = '#ffffffcc'; g.font = `700 24px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText(eyebrow, 36, 44);
        g.fillStyle = '#fff'; g.font = `800 38px ${FONT}`; g.fillText(title, 36, 90);
        p.commit();
        options.forEach((o, i) => {
          const c = i % cols, r = Math.floor(i / cols);
          p.addButton({ id: o, label: ITEMS[o].th, style: 'blue', size: 32, x: -w / 2 + 0.07 + 0.21 + c * 0.42, y: h / 2 - 0.27 - r * 0.15, w: 0.38, h: 0.12, onClick: () => resolve(o) });
        });
        this.place(p.group, at, 1.0);
        p.pop();
        return () => p.dispose();
      });
      const ok = correct.includes(id);
      if (first) { this.k(ok, tag); first = false; this.lastFirstTry = ok; }
      if (ok) { ctx.audio.good(); return id; }
      ctx.audio.error();
      const w2 = typeof why === 'string' ? why : (why[id] || why.default || '');
      ctx.hud.coach(`${T.wrongTool} ${w2}`.trim(), 'warn');
    }
  }

  /** The action mini-game; records skill quality. */
  async timing(opts, tag = 'skill') {
    this.check();
    const r = await runTiming({ speed: [0.62, 0.75, 0.95][this.levelIndex] ?? 0.75, green: [0.18, 0.16, 0.12][this.levelIndex] ?? 0.16, ...opts });
    this.s(r.quality, tag);
    this.flags.misses = (this.flags.misses || 0) + r.miss;
    return r;
  }

  /** Visual tween of an object to a world position. */
  fly(obj, toWorld, { sec = 0.6, arc = 0.25, hide = false, scale = null } = {}) {
    // stays in its own parent (so it hides with its room); target given in world space
    obj.parent.updateMatrixWorld(true);
    const to = obj.parent.worldToLocal(toWorld.clone());
    const from = obj.position.clone();
    const s0 = obj.scale.clone();
    let t = 0;
    return new Promise((res) => {
      const off = this.game.addTicker((dt) => {
        t = Math.min(1, t + dt / sec);
        const e = easeInOut(t);
        obj.position.lerpVectors(from, to, e);
        obj.position.y += Math.sin(Math.PI * e) * arc;
        if (scale !== null) obj.scale.copy(s0).multiplyScalar(1 + (scale - 1) * e);
        if (t >= 1) { off(); if (hide) obj.visible = false; res(); }
      });
    });
  }

  // ---------------------------------------------------------------- ADISAC cards
  missionCard() {
    const L = this.L;
    ctx.audio.voice(N.aims(L), 'coach');
    return this.dialog({
      eyebrow: `1.AIM · เป้าหมายการเรียนรู้ · ด่านที่ ${L.id} (${L.diff})`,
      title: L.name, accent: L.color, w: 1.5, h: 1.0, bodySize: 30,
      body: L.story,
      list: L.aims.map((a) => ({ tag: a.k, text: a.text, color: { K: '#2f7fe0', S: '#f2a20c', A: '#22b14c' }[a.k] })),
      buttons: [{ id: 'go', label: T.accept, style: 'primary' }],
    });
  }

  divideCard(extra = null) {
    const L = this.L;
    ctx.audio.voice(N.divide(L), 'coach');
    return this.dialog({
      w: 1.6, h: 0.86,
      buttons: [{ id: 'ok', label: T.understood, style: 'primary' }],
      draw: (p) => {
        const g = p.clear();
        const { W } = p;
        g.fillStyle = STAGE.DIVIDE.color; rr(g, 8, 8, W - 16, 104, 30); g.fill(); g.fillRect(8, 84, W - 16, 28);
        g.fillStyle = '#ffffffcc'; g.font = `700 26px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
        g.fillText('2.DIVIDE · แยกองค์ความรู้ก่อนลงมือ', 36, 46);
        g.fillStyle = '#fff'; g.font = `800 40px ${FONT}`; g.fillText(extra || 'สิ่งที่ต้องรู้ในด่านนี้', 36, 94);
        const cw = (W - 80) / 3;
        L.divide.forEach((d, i) => {
          const x = 30 + i * (cw + 10), y = 140;
          const col = ['#2f7fe0', '#e0902f', '#37c2a8'][i];
          g.fillStyle = col + '22'; rr(g, x, y, cw, 360, 24); g.fill();
          g.fillStyle = col; rr(g, x + 20, y + 20, 90, 54, 27); g.fill();
          g.fillStyle = '#fff'; g.font = `800 32px ${FONT}`; g.textAlign = 'center'; g.fillText(d.chip, x + 65, y + 58);
          g.textAlign = 'left'; g.fillStyle = col; g.font = `800 34px ${FONT}`; g.fillText(d.title, x + 126, y + 58);
          g.fillStyle = '#1d2733'; g.font = `500 29px ${FONT}`;
          drawWrapped(g, d.body, x + 22, y + 120, cw - 44, 40, 6);
        });
        p.commit();
      },
    });
  }

  /** 4.SYNTHESIS — progress measured against the aims, with what was achieved. */
  synthesis(results) {
    const L = this.L;
    results.forEach((ok, i) => this.checkItem(i, ok));
    ctx.audio.voice(N.synthesis(results.filter(Boolean).length, L.checklist.length), 'coach');
    const sc = this.scores();
    return this.dialog({
      eyebrow: '4.SYNTHESIS · ประเมินความก้าวหน้าตามเป้าหมาย', title: 'เงื่อนไขผ่านด่าน', accent: STAGE.SYNTHESIS.color,
      w: 1.4, h: 0.92, bodySize: 32,
      list: [
        ...L.checklist.map((text, i) => ({ tag: String(i + 1), text, done: !!results[i], color: STAGE.SYNTHESIS.color, bold: true })),
        { tag: '∑', text: `K ${Math.round(sc.K)} · S ${Math.round(sc.S)} · A ${Math.round(sc.A)}`, color: '#16306b' },
      ],
      buttons: [{ id: 'ok', label: 'ดูผลการประเมิน →', style: 'primary' }],
    });
  }

  /** 6.CRITERION — star result screen (board scene 6). Saves the run. */
  async criterion() {
    this.check();
    const L = this.L;
    const sc = this.scores();
    const total = Math.round(sc.K) + Math.round(sc.S) + Math.round(sc.A);
    const pct = total / 300;
    const stars = pct >= 0.85 ? 3 : pct >= 0.65 ? 2 : 1;
    const pass = pct >= 0.65;
    const rec = {
      player: this.game.player || '', level: L.id, K: Math.round(sc.K), S: Math.round(sc.S), A: Math.round(sc.A), total, stars, pass,
      seconds: Math.round(this.elapsed), mode: ctx.vr ? 'vr' : 'desktop', date: new Date().toISOString(), events: this.events,
    };
    saveRun(rec);
    this.game.recordResult(this.levelIndex, rec);
    this.log('criterion', { total, stars });
    ctx.audio.fanfare();
    ctx.audio.voice(N.result(pass, stars), 'coach');
    const last = this.levelIndex === LEVELS.length - 1;
    const buttons = pass
      ? [{ id: 'next', label: last ? 'รับเหรียญมาสเตอร์ช่าง →' : T.nextMission, style: 'primary' }, { id: 'retry', label: T.retry, style: 'ghost' }]
      : [{ id: 'retry', label: 'ลองอีกครั้ง', style: 'primary' }, { id: 'next', label: last ? 'ดูสรุปผลทั้งหมด' : 'ไปด่านถัดไป', style: 'ghost' }];
    let starAnim = 0;
    const panelRef = { p: null };
    const offStars = this.game.addTicker((dt) => {
      if (!panelRef.p) return;
      const before = Math.floor(starAnim * 3);
      starAnim = Math.min(stars / 3 + 0.01, starAnim + dt * 0.9);
      const after = Math.floor(starAnim * 3);
      if (after !== before && after <= stars && after > 0) ctx.audio.star(after - 1);
      drawResult(panelRef.p, { L, sc, total, stars: Math.min(stars, Math.floor(starAnim * 3)), pass });
    });
    try {
      return await this.dialog({
        w: 1.4, h: 1.2, border: '#ffc21a', buttons,
        draw: (p) => { panelRef.p = p; drawResult(p, { L, sc, total, stars: 0, pass }); },
      });
    } finally { offStars(); }
  }

  cleanup() {
    this.clearHints();
    ctx.interaction.capture = null;
    ctx.hud.clearToast();
    ctx.hands.release();
    ctx.audio.stopVoices();
    window.speechSynthesis?.cancel();
  }
}

function drawResult(p, { L, sc, total, stars, pass }) {
  const g = p.clear();
  const { W, H } = p;
  // header
  g.fillStyle = '#16306b'; rr(g, 8, 8, W - 16, 230, 30); g.fill(); g.fillRect(8, 200, W - 16, 38);
  for (let i = 0; i < 3; i++) drawStar(g, W / 2 + (i - 1) * 124, i === 1 ? 104 : 116, i === 1 ? 56 : 46, i < stars ? '#ffd23f' : 'rgba(255,255,255,0.18)', i < stars ? '#c78f00' : null);
  g.fillStyle = '#fff'; g.font = `800 50px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.fillText(pass ? T.result.title : T.result.titleRetry, W / 2, 212);
  g.fillStyle = '#ffffffaa'; g.font = `700 24px ${FONT}`; g.textAlign = 'left';
  g.fillText(`ด่านที่ ${L.id} · ${L.name}`, 30, 40);
  g.textAlign = 'right'; g.fillText('6.CRITERION', W - 30, 40);
  // rows
  const rows = [['K', '#2f7fe0'], ['S', '#f2a20c'], ['A', '#22b14c']];
  rows.forEach(([k, col], i) => {
    const y = 262 + i * 92;
    g.fillStyle = col + '22'; rr(g, 30, y, W - 60, 76, 20); g.fill();
    g.fillStyle = col; g.beginPath(); g.arc(76, y + 38, 26, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = `800 30px ${FONT}`; g.textAlign = 'center'; g.fillText(k, 76, y + 49);
    g.textAlign = 'left'; g.fillStyle = '#1d2733'; g.font = `700 32px ${FONT}`;
    g.fillText(`${T.result.rows[k]} :`, 118, y + 50);
    g.fillStyle = col; g.font = `800 32px ${FONT}`;
    g.fillText(T.rating(sc[k]), 560, y + 50);
    g.textAlign = 'right'; g.fillStyle = '#1d2733'; g.font = `800 40px ${FONT}`;
    g.fillText(String(Math.round(sc[k])), W - 56, y + 52);
  });
  // total
  const ty = 552;
  g.fillStyle = '#16306b'; rr(g, 150, ty, W - 300, 76, 38); g.fill();
  g.fillStyle = '#fff'; g.font = `700 32px ${FONT}`; g.textAlign = 'left'; g.fillText(T.result.total, 190, ty + 50);
  g.fillStyle = '#ffd23f'; g.font = `800 46px ${FONT}`; g.textAlign = 'right'; g.fillText(`${total} / 300`, W - 190, ty + 54);
  g.textAlign = 'center'; g.font = `800 40px ${FONT}`;
  g.fillStyle = pass ? '#1f8f3f' : '#c0392b';
  g.fillText(pass ? T.result.praise[Math.min(2, Math.max(0, stars - 1))] : 'สู้ๆ นะ!', W / 2, ty + 128);
  g.font = `600 26px ${FONT}`; g.fillStyle = '#5b6875';
  g.fillText(pass ? T.result.pass : T.result.fail, W / 2, ty + 170);
  p.commit();
}

// =====================================================================
export class Game {
  constructor() {
    this.tickers = new Set();
    this.run = null;
    this.results = {};
    this.player = '';
    try { this.player = localStorage.getItem('workshopHero.player') || ''; } catch { /* ignore */ }
    this._menuBtn = false;
    const hub = ctx.world.scenes.hub, ws = ctx.world.scenes.workshop;
    // the teacher stands rotated 180°, so local +x is the viewer's left — away from the dialog cards
    hub.teacher.root.userData.bubble = new Bubble(hub.teacher.root, { x: 0.42, y: 1.98 });
    ws.friend.root.userData.bubble = new Bubble(ws.friend.root, { y: 1.9 });
  }

  addTicker(fn) { this.tickers.add(fn); return () => this.tickers.delete(fn); }

  recordResult(i, rec) {
    const prev = this.results[i];
    if (!prev || rec.total >= prev.total) this.results[i] = rec;
  }

  stopRun() {
    const r = this.run;
    if (!r) return;
    r.dead = true;
    r.flow.cancel();
    r.cleanup();
    this.run = null;
  }

  newRun(i) {
    this.stopRun();
    const r = new Run(this, i);
    this.run = r;
    ctx.flow = r.flow;
    return r;
  }

  async title() {
    const r = this.newRun(-1);
    ctx.hud.set({ visible: false, stage: null });
    ctx.audio.setMusicLevel(0.055);
    document.body.classList.remove('goggles', 'helmet');
    ctx.hands.setGloves(false);
    ctx.world.scenes.workshop.reset();
    try {
      await r.goTo('workshop', 'start');
      ctx.audio.voice(N.title(), 'coach');
      const choice = await r.dialog({
        w: 1.7, h: 1.12, border: '#16306b', at: { pos: new THREE.Vector3(0, 1.55, 1.15), yaw: undefined },
        buttons: [
          { id: 0, label: `ด่าน 1 · ${LEVELS[0].diff}`, style: 'ghost' },
          { id: 1, label: `ด่าน 2 · ${LEVELS[1].diff}`, style: 'ghost' },
          { id: 2, label: `ด่าน 3 · ${LEVELS[2].diff}`, style: 'ghost' },
        ],
        draw: (p, done) => { drawTitle(p, this.results); p.addButton({ id: 'start', label: T.start, sub: T.startEn, style: 'primary', x: 0, y: -0.112, w: 0.7, h: 0.17, size: 54, onClick: () => done('start') }); },
      });
      this.start(choice === 'start' ? 0 : Number(choice));
    } catch (e) { if (!(e instanceof Cancelled)) console.error(e); }
  }

  async start(i) {
    const r = this.newRun(i);
    let choice;
    try {
      r.begin();
      choice = await SCRIPTS[i](r);
    } catch (e) {
      if (!(e instanceof Cancelled)) console.error(e);
      return;
    }
    if (this.run !== r) return;
    r.cleanup();
    if (choice === 'retry') this.start(i);
    else if (choice === 'menu') this.title();
    else if (i + 1 < LEVELS.length) this.start(i + 1);
    else this.final();
  }

  async final() {
    const r = this.newRun(-1);
    ctx.hud.set({ visible: false });
    const all = LEVELS.map((_, i) => this.results[i]);
    const master = all.every((x) => x && x.pass);
    try {
      await r.goTo('hub', 'start');
      ctx.world.scenes.hub.teacher.wave(3);
      r.say(ctx.world.scenes.hub.teacher, T.teacherName, master ? 'ยินดีด้วย! เธอคือมาสเตอร์ช่างผู้พิทักษ์โรงเรียนตัวจริง' : 'เก่งมากที่มาถึงตรงนี้ ลองฝึกด่านที่ยังไม่ผ่านอีกครั้งนะ');
      if (master) ctx.audio.fanfare();
      ctx.audio.voice(N.final(master), 'coach');
      const choice = await r.dialog({
        w: 1.5, h: 1.15, border: '#ffc21a',
        buttons: [{ id: 'menu', label: T.menu, style: 'primary' }, { id: 'again', label: 'เล่นใหม่ตั้งแต่ด่าน 1', style: 'ghost' }],
        draw: (p) => drawFinal(p, all, master),
      });
      if (choice === 'again') this.start(0); else this.title();
    } catch (e) { if (!(e instanceof Cancelled)) console.error(e); }
  }

  /** Pause menu (desktop button or controller B/Y). */
  async pause() {
    if (this._paused || !this.run || this.run.levelIndex < 0) return;
    this._paused = true;
    const savedCapture = ctx.interaction.capture;
    ctx.interaction.capture = null;
    const p = new Panel({ w: 1.0, h: 0.62, border: '#16306b' });
    p.setContent({ title: 'พักเกม', body: 'เลือกสิ่งที่ต้องการทำ', accent: '#16306b' });
    const done = (what) => {
      p.dispose();
      this._paused = false;
      if (what === 'resume') ctx.interaction.capture = savedCapture;
      else if (what === 'restart') this.start(this.run.levelIndex);
      else if (what === 'menu') this.title();
    };
    p.addButton({ id: 'resume', label: 'เล่นต่อ', style: 'primary', x: 0, y: 0.0, w: 0.8, h: 0.1, onClick: () => done('resume') });
    p.addButton({ id: 'restart', label: 'เริ่มด่านนี้ใหม่', style: 'blue', x: 0, y: -0.12, w: 0.8, h: 0.1, onClick: () => done('restart') });
    p.addButton({ id: 'menu', label: T.menu, style: 'ghost', x: 0, y: -0.24, w: 0.8, h: 0.1, onClick: () => done('menu') });
    this.run.place(p.group, null, 1.1);
    p.group.position.addScaledVector(new THREE.Vector3().subVectors(ctx.camera.getWorldPosition(new THREE.Vector3()), p.group.position).normalize(), 0.15);
    p.pop();
  }

  update(dt) {
    const r = this.run;
    if (r) {
      r.flow.update(dt);
      if (r.timer) {
        r.timer.left -= dt;
        ctx.hud.set({ timer: r.timer.left });
        if (r.timer.left < 0 && !r.timer.warned) { r.timer.warned = true; ctx.hud.coach(T.overTime, 'warn'); }
      }
    }
    for (const f of [...this.tickers]) f(dt);
    for (const b of [ctx.world.scenes.hub.teacher, ctx.world.scenes.workshop.friend]) b.root.userData.bubble?.update();
    // controller menu button (B / Y)
    if (ctx.vr) {
      let pressed = false;
      for (const c of ctx.interaction.controllers) {
        const bt = c.source?.gamepad?.buttons;
        if (bt && ((bt[4] && bt[4].pressed) || (bt[5] && bt[5].pressed))) pressed = true;
      }
      if (pressed && !this._menuBtn) this.pause();
      this._menuBtn = pressed;
    }
  }
}

function drawTitle(p, results) {
  const g = p.clear();
  const { W, H } = p;
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#1d4fa0'); sky.addColorStop(1, '#0f1e3d');
  g.fillStyle = sky; rr(g, 8, 8, W - 16, H - 24, 30); g.fill();
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.font = `900 112px ${FONT}`;
  g.lineWidth = 16; g.strokeStyle = '#0f1e3d'; g.strokeText('The Workshop Hero', W / 2, 150);
  const grad = g.createLinearGradient(0, 60, 0, 160);
  grad.addColorStop(0, '#fff3a0'); grad.addColorStop(1, '#ffb300');
  g.fillStyle = grad; g.fillText('The Workshop Hero', W / 2, 150);
  g.fillStyle = '#ffffff'; g.font = `800 46px ${FONT}`;
  g.fillText(T.tagline, W / 2, 222);
  g.fillStyle = '#cfe0ff'; g.font = `500 28px ${FONT}`;
  drawWrapped(g, T.sub, W / 2, 266, W - 100, 32, 2);
  // ADISAC strip
  const sw = (W - 120) / 6;
  ADISAC.stages.forEach((s, i) => {
    g.fillStyle = s.color; rr(g, 60 + i * sw + 6, 318, sw - 12, 70, 20); g.fill();
    g.fillStyle = '#fff'; g.font = `800 26px ${FONT}`; g.fillText(`${s.n}.${s.key}`, 60 + i * sw + sw / 2, 349);
    g.font = `600 22px ${FONT}`; g.fillText(s.th, 60 + i * sw + sw / 2, 377);
  });
  g.fillStyle = '#ffd23f'; g.font = `700 24px ${FONT}`;
  g.fillText('ออกแบบตามแบบจำลอง ADISAC · วัดผล K-S-A 3 ระดับ', W / 2, 424);
  // best stars per level
  g.font = `600 24px ${FONT}`; g.fillStyle = '#cfe0ff';
  const best = LEVELS.map((L, i) => `ด่าน ${L.id}: ${results[i] ? '★'.repeat(results[i].stars) + '☆'.repeat(3 - results[i].stars) : '—'}`).join('     ');
  g.fillText(best, W / 2, H - 222);
  g.fillText(T.chooseLevel, W / 2, H - 188);
  p.commit();
}

function drawFinal(p, all, master) {
  const g = p.clear();
  const { W, H } = p;
  g.fillStyle = '#fff8e1'; rr(g, 8, 8, W - 16, H - 24, 30); g.fill();
  // badge
  const cx = W / 2, cy = 190;
  g.fillStyle = master ? '#ffc21a' : '#c3cbd3';
  g.beginPath(); g.arc(cx, cy, 120, 0, Math.PI * 2); g.fill();
  g.fillStyle = master ? '#16306b' : '#8a96a3';
  g.beginPath(); g.arc(cx, cy, 96, 0, Math.PI * 2); g.fill();
  drawStar(g, cx, cy - 6, 62, master ? '#ffd23f' : '#d9dee3', master ? '#c78f00' : null);
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.fillStyle = '#16306b'; g.font = `900 52px ${FONT}`;
  g.fillText(T.final.title, cx, 370);
  g.fillStyle = '#1d2733'; g.font = `500 30px ${FONT}`;
  drawWrapped(g, master ? T.final.body : T.final.notYet, cx, 420, W - 140, 40, 2);
  all.forEach((r, i) => {
    const y = 520 + i * 62;
    g.fillStyle = r?.pass ? '#22b14c22' : '#e23b3b18'; rr(g, 120, y - 42, W - 240, 54, 16); g.fill();
    g.textAlign = 'left'; g.fillStyle = '#1d2733'; g.font = `700 28px ${FONT}`;
    g.fillText(`ด่าน ${LEVELS[i].id} ${LEVELS[i].name}`, 150, y - 6);
    g.textAlign = 'right';
    g.fillText(r ? `${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}  K${r.K} S${r.S} A${r.A}  ${r.total}/300` : 'ยังไม่ได้เล่น', W - 150, y - 6);
  });
  g.textAlign = 'center'; g.fillStyle = '#2e7d32'; g.font = `600 24px ${FONT}`;
  g.fillText(T.final.footer, cx, H - 160);
  p.commit();
}
