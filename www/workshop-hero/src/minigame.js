import * as THREE from 'three';
import { FONT, T } from './strings.js';
import { rr } from './util.js';
import { Panel } from './panel.js';
import { makeItem } from './models.js';
import { ctx } from './ctx.js';

// มินิเกมปฏิบัติงาน: เข็มวิ่งไปมา กดเมื่ออยู่ในโซนสีเขียว (ภาพออกแบบฉากที่ 4)
// ใช้ทั้งการขันน็อต คลายน็อต วัดระยะ และเลื่อยไม้ — ผลลัพธ์คือคุณภาพทักษะ (S) 0..1

const MODES = {
  tighten: { label: 'ความแน่น', done: 'แน่นพอดี!', sound: 'ratchet' },
  hammer: { label: 'ตะปูจมลง', done: 'ตอกแน่นแล้ว!', sound: 'thump' },
  loosen: { label: 'คลายออก', done: 'คลายออกแล้ว!', sound: 'ratchet' },
  measure: { label: 'ตำแหน่งวัด', done: 'วัดได้ 60 ซม.!', sound: 'click' },
  saw: { label: 'รอยตัด', done: 'ตัดเรียบร้อย!', sound: 'saw' },
  drill: { label: 'ความลึก', done: 'เจาะเสร็จ!', sound: 'drill' },
  screw: { label: 'ความแน่น', done: 'ยึดแน่นแล้ว!', sound: 'drill' },
};

// ในแว่น VR งานส่วนใหญ่ใช้ท่าทางจริงแทนการกดตามจังหวะ: บิดข้อมือขัน · เหวี่ยงค้อน · ดัน-ดึงเลื่อย · ถือสว่านให้นิ่ง
// (การวัดระยะยังเป็นการอ่านค่าแบบเดิม) — บนจอคอมพิวเตอร์ใช้แถบจังหวะตามภาพออกแบบ
const GESTURE = { tighten: 'twist', loosen: 'twist', hammer: 'swing', saw: 'stroke', screw: 'hold', drill: 'hold' };

export function runTiming(opts) {
  const g = GESTURE[opts.mode || 'tighten'];
  if (ctx.vr && g && ctx.interaction.pose()) return runGesture({ ...opts, gesture: g });
  return runBar(opts);
}

function runBar({ anchor, title, tool = null, mode = 'tighten', hits = 3, speed = 0.75, green = 0.16, yellow = 0.14, toolDir = null }) {
  const M = MODES[mode] || MODES.tighten;
  return ctx.flow.wrap((resolve) => {
    const panel = new Panel({ w: 0.78, h: 0.36, bg: '#0f1e3d', border: '#ffd23f', radius: 30, interactive: false });
    const cam = new THREE.Vector3(); ctx.camera.getWorldPosition(cam);
    const toCam = cam.clone().sub(anchor); toCam.y = 0; toCam.normalize();
    // same size every time: 1.15 m out along the line to the work point, lifted so the part stays visible below
    const look = anchor.clone().sub(cam).normalize();
    const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(ctx.camera.getWorldQuaternion(new THREE.Quaternion()));
    panel.group.position.copy(cam).addScaledVector(look, 1.15).addScaledVector(camUp, 0.3);
    ctx.scene.add(panel.group);
    panel.group.lookAt(cam);
    panel.pop();

    // the tool, working on the part
    let toolObj = null;
    if (tool) {
      toolObj = makeItem(tool);
      const dir = toolDir ? toolDir.clone().normalize() : toCam.clone().add(new THREE.Vector3(0, 0.6, 0)).normalize();
      toolObj.position.copy(anchor).addScaledVector(dir, 0.03);
      toolObj.lookAt(toolObj.position.clone().add(dir));    // +Z away from the part → the tool's tip (-Z) on it
      ctx.scene.add(toolObj);
    }

    const st = {
      phase: Math.random(), p: 0, center: mode === 'measure' ? 0.6 : 0.5,
      progress: 0, perfect: 0, ok: 0, miss: 0, cool: 0, flash: null, flashT: 0, doneT: -1, spin: 0,
    };
    const g = panel.g;
    const draw = () => {
      const W = panel.W, H = panel.H;
      g.clearRect(0, 0, W, H);
      g.fillStyle = '#ffd23f'; rr(g, 0, 0, W, H, 30); g.fill();
      g.fillStyle = '#0f1e3d'; rr(g, 6, 6, W - 12, H - 12, 26); g.fill();
      g.fillStyle = '#fff'; g.font = `800 34px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(title, 24, 36);
      g.fillStyle = '#ffd23f'; g.font = `600 22px ${FONT}`;
      g.fillText(ctx.vr ? T.pressHint.vr : T.pressHint.desktop, 24, 72);
      // bar
      const bx = 24, by = 98, bw = W - 48, bh = 50;
      g.fillStyle = '#d33a3a'; rr(g, bx, by, bw, bh, 25); g.fill();
      const zc = bx + st.center * bw;
      g.fillStyle = '#f2c230'; g.fillRect(zc - (green / 2 + yellow) * bw, by, (green + yellow * 2) * bw, bh);
      g.fillStyle = '#29c25a'; g.fillRect(zc - (green / 2) * bw, by, green * bw, bh);
      if (mode === 'measure') {
        g.fillStyle = '#fff'; g.font = `600 18px ${FONT}`; g.textAlign = 'center';
        for (let i = 0; i <= 10; i++) { const x = bx + (i / 10) * bw; g.fillRect(x - 1, by + bh - 12, 2, 12); if (i % 2 === 0) g.fillText(`${i * 10}`, x, by + bh + 14); }
      }
      // marker
      const mx = bx + st.p * bw;
      g.fillStyle = '#ffffff'; g.fillRect(mx - 3, by - 10, 6, bh + 20);
      g.beginPath(); g.moveTo(mx - 14, by - 22); g.lineTo(mx + 14, by - 22); g.lineTo(mx, by - 6); g.closePath(); g.fill();
      // progress meter
      const py = 188;
      g.textAlign = 'left'; g.fillStyle = '#cfe0ff'; g.font = `700 24px ${FONT}`;
      g.fillText(M.label, 24, py + 16);
      const pw = bw - 150;
      g.fillStyle = 'rgba(255,255,255,0.15)'; rr(g, 150, py, pw, 30, 15); g.fill();
      const grad = g.createLinearGradient(150, 0, 150 + pw, 0);
      grad.addColorStop(0, '#f2c230'); grad.addColorStop(1, '#29c25a');
      g.fillStyle = grad; rr(g, 150, py, Math.max(30, pw * Math.min(1, st.progress)), 30, 15); g.fill();
      // feedback
      if (st.flash && st.flashT > 0) {
        g.textAlign = 'right'; g.font = `800 36px ${FONT}`;
        g.fillStyle = st.flash.color; g.fillText(st.flash.text, W - 24, 36);
      }
      if (st.doneT >= 0) {
        g.fillStyle = 'rgba(15,30,61,0.85)'; rr(g, 6, 6, W - 12, H - 12, 26); g.fill();
        g.fillStyle = '#29c25a'; g.font = `800 52px ${FONT}`; g.textAlign = 'center';
        g.fillText(M.done, W / 2, H / 2);
      }
      panel.commit();
    };

    const press = () => {
      if (st.cool > 0 || st.doneT >= 0) return;
      st.cool = 0.25;
      const d = Math.abs(st.p - st.center);
      let kind;
      if (d <= green / 2) kind = 'perfect';
      else if (d <= green / 2 + yellow) kind = 'ok';
      else kind = 'miss';
      st[kind]++;
      const A = ctx.audio;
      if (kind === 'miss') {
        A.error();
        st.flash = { text: 'พลาด!', color: '#ff6b6b' };
        if (st.miss === 2 || st.miss === 5) ctx.hud.coach(mode === 'measure' ? 'ค่อยๆ ดู ให้เข็มตรงขีด 60 ซม. ก่อนค่อยกด' : 'ใจเย็นๆ รอให้เข็มเข้าโซนเขียวก่อนค่อยกด', 'tip');
      } else {
        if (M.sound === 'ratchet') A.ratchet(kind === 'perfect' ? 6 : 4, anchor);
        else if (M.sound === 'saw') A.saw(anchor);
        else if (M.sound === 'drill') A.drill(0.45, anchor);
        else if (M.sound === 'thump') A.thump(anchor);
        else A.click();
        if (kind === 'perfect') A.ping();
        st.flash = kind === 'perfect' ? { text: 'เยี่ยม!', color: '#29c25a' } : { text: 'ดี', color: '#f2c230' };
        st.progress += (kind === 'perfect' ? 1 : 0.6) / hits;
        st.spin = 0.35;
        if (mode !== 'measure') st.center = 0.28 + Math.random() * 0.44;
      }
      st.flashT = 0.7;
      const rc = ctx.interaction.rightController;
      if (rc) ctx.hands.pulse(rc, kind === 'miss' ? 0.8 : 0.4, kind === 'miss' ? 120 : 50);
      if (st.progress >= 0.999) { st.doneT = 0.9; A.good(); }
    };

    ctx.interaction.capture = press;
    const off = ctx.game.addTicker((dt) => {
      st.phase += dt * speed;
      const ph = st.phase % 2;
      st.p = ph < 1 ? ph : 2 - ph;
      st.cool -= dt;
      st.flashT -= dt;
      if (toolObj && st.spin > 0) {
        st.spin -= dt;
        if (mode === 'saw') toolObj.translateZ(Math.sin(st.spin * 40) * 0.01);
        else if (mode === 'hammer') toolObj.rotateX(Math.sin(st.spin * 30) * 0.08);
        else toolObj.rotateZ(dt * (mode === 'loosen' ? -14 : 14));
      }
      if (st.doneT >= 0) {
        st.doneT -= dt;
        if (st.doneT < 0) {
          const attempts = st.perfect + st.ok + st.miss;
          resolve({ perfect: st.perfect, ok: st.ok, miss: st.miss, attempts, quality: attempts ? (st.perfect + st.ok * 0.7) / attempts : 1 });
          return;
        }
      }
      draw();
    });
    draw();

    return () => {
      off();
      if (ctx.interaction.capture === press) ctx.interaction.capture = null;
      panel.dispose();
      toolObj?.parent?.remove(toolObj);
    };
  });
}

// =====================================================================
// VR: real motions
// =====================================================================
const TORQUE = { lo: 0.82, hi: 0.97, strip: 1.08 };      // green band and the point where the thread strips
const HINTS = {
  tighten: 'กดไกค้าง แล้วบิดข้อมือเพื่อขัน · ปล่อยไกเมื่อเข็มอยู่ในโซนเขียว',
  loosen: 'กดไกค้าง แล้วบิดข้อมือเพื่อคลายออก (ปล่อยไกแล้วบิดต่อได้)',
  hammer: 'เหวี่ยงมือลงเพื่อตอก — แรงพอดี ไม่ต้องแรงเกิน',
  saw: 'ดันและดึงมือไปมาเหมือนเลื่อยจริง ตามแนวเส้น',
  screw: 'กดไกค้างให้สว่านหมุน ถือมือให้นิ่ง · ปล่อยในโซนเขียว',
  drill: 'กดไกค้างให้สว่านหมุน ถือมือให้นิ่ง',
};

function runGesture({ anchor, title, tool = null, mode = 'tighten', hits = 3, gesture, toolDir = null }) {
  const M = MODES[mode] || MODES.tighten;
  const torque = mode === 'tighten' || mode === 'screw';
  const A = ctx.audio;
  return ctx.flow.wrap((resolve) => {
    const panel = new Panel({ w: 0.78, h: 0.36, bg: '#0f1e3d', border: '#37c2a8', radius: 30, interactive: false });
    const cam = new THREE.Vector3(); ctx.camera.getWorldPosition(cam);
    const toCam = cam.clone().sub(anchor); toCam.y = 0; toCam.normalize();
    const look = anchor.clone().sub(cam).normalize();
    const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(ctx.camera.getWorldQuaternion(new THREE.Quaternion()));
    panel.group.position.copy(cam).addScaledVector(look, 1.15).addScaledVector(camUp, 0.3);
    ctx.scene.add(panel.group);
    panel.group.lookAt(cam);
    panel.pop();
    let toolObj = null;
    if (tool) {
      toolObj = makeItem(tool);
      const dir = toolDir ? toolDir.clone().normalize() : toCam.clone().add(new THREE.Vector3(0, 0.6, 0)).normalize();
      toolObj.position.copy(anchor).addScaledVector(dir, 0.03);
      toolObj.lookAt(toolObj.position.clone().add(dir));
      ctx.scene.add(toolObj);
    }
    const st = {
      progress: 0, held: false, prevQ: null, prevP: null, tickAcc: 0, entered: false, armed: false, peak: 0,
      origin: null, far: 0, farP: null, motorT: 0, shakeWarn: 0, idle: 0, hinted: false,
      perfect: 0, ok: 0, miss: 0, quality: null, msg: null, msgT: 0, doneT: -1,
    };
    const say = (text, color = '#ffd23f', sec = 1.2) => { st.msg = { text, color }; st.msgT = sec; };
    const pulse = (k, ms) => { const c = ctx.interaction.activeController(); if (c) ctx.hands.pulse(c, k, ms); };
    const finish = (quality, text, color) => {
      if (st.doneT >= 0) return;
      st.quality = quality; st.doneText = text; st.doneColor = color;
      st.doneT = 1.0;
      if (quality >= 0.95) { A.ping(); A.good(); } else if (quality >= 0.6) A.good(); else A.error();
    };

    const g = panel.g;
    const draw = () => {
      const W = panel.W, H = panel.H;
      g.clearRect(0, 0, W, H);
      g.fillStyle = '#37c2a8'; rr(g, 0, 0, W, H, 30); g.fill();
      g.fillStyle = '#0f1e3d'; rr(g, 6, 6, W - 12, H - 12, 26); g.fill();
      g.fillStyle = '#fff'; g.font = `800 32px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(title, 24, 36);
      g.fillStyle = '#9ff0dc'; g.font = `600 20px ${FONT}`;
      g.fillText(HINTS[mode] || '', 24, 70);
      // meter
      const bx = 24, by = 96, bw = W - 48, bh = 44;
      const max = torque ? 1.15 : 1;
      const X = (v) => bx + (Math.min(v, max) / max) * bw;
      g.fillStyle = 'rgba(255,255,255,0.12)'; rr(g, bx, by, bw, bh, 22); g.fill();
      if (torque) {
        g.fillStyle = '#29c25a66'; g.fillRect(X(TORQUE.lo), by, X(TORQUE.hi) - X(TORQUE.lo), bh);
        g.fillStyle = '#f2c23055'; g.fillRect(X(TORQUE.hi), by, X(TORQUE.strip) - X(TORQUE.hi), bh);
        g.fillStyle = '#d33a3a55'; g.fillRect(X(TORQUE.strip), by, bx + bw - X(TORQUE.strip), bh);
      }
      const fillCol = !torque ? '#29c25a' : st.progress >= TORQUE.strip ? '#d33a3a' : st.progress > TORQUE.hi ? '#f2c230' : st.progress >= TORQUE.lo ? '#29c25a' : '#7fb3ff';
      g.fillStyle = fillCol; rr(g, bx, by + 8, Math.max(20, X(st.progress) - bx), bh - 16, 14); g.fill();
      if (torque) {
        g.fillStyle = '#fff'; g.font = `600 17px ${FONT}`; g.textAlign = 'center';
        g.fillText('หลวม', (bx + X(TORQUE.lo)) / 2, by + bh + 16);
        g.fillText('พอดี', (X(TORQUE.lo) + X(TORQUE.hi)) / 2, by + bh + 16);
        g.fillText('เกลียวรูด', (X(TORQUE.strip) + bx + bw) / 2, by + bh + 16);
      }
      g.textAlign = 'left'; g.fillStyle = '#cfe0ff'; g.font = `700 22px ${FONT}`;
      g.fillText(`${M.label}  ${Math.round(Math.min(st.progress, max) * 100)}%`, 24, 196);
      if (st.msg && st.msgT > 0) {
        g.textAlign = 'right'; g.font = `800 28px ${FONT}`; g.fillStyle = st.msg.color;
        g.fillText(st.msg.text, W - 24, 196);
      }
      g.textAlign = 'left'; g.fillStyle = '#7f93b5'; g.font = `500 17px ${FONT}`;
      g.fillText('โหมดลงมือจริง (VR)', 24, 236);
      if (st.doneT >= 0) {
        g.fillStyle = 'rgba(15,30,61,0.88)'; rr(g, 6, 6, W - 12, H - 12, 26); g.fill();
        g.fillStyle = st.doneColor || '#29c25a'; g.font = `800 46px ${FONT}`; g.textAlign = 'center';
        g.fillText(st.doneText || M.done, W / 2, H / 2);
      }
      panel.commit();
    };

    const tmpQ = new THREE.Quaternion();
    const step = (dt) => {
      const P = ctx.interaction.pose();
      if (!P || st.doneT >= 0) return;
      const before = st.progress;
      if (gesture === 'twist') {
        if (P.trigger) {
          if (st.prevQ) {
            tmpQ.copy(st.prevQ).invert().multiply(P.quat);
            const ang = 2 * Math.acos(Math.min(1, Math.abs(tmpQ.w)));   // any wrist rotation counts
            if (ang > 0.003 && ang < 0.9) {
              const turns = mode === 'loosen' ? 0.8 : 1.0;
              st.progress += ang / (turns * Math.PI * 2);
              st.tickAcc += ang;
              if (toolObj) toolObj.rotateZ(mode === 'loosen' ? -ang : ang);
            }
          }
          st.prevQ = P.quat.clone(); st.held = true;
          if (st.tickAcc > 0.44) { st.tickAcc = 0; A.tick(anchor); pulse(0.25, 18); }
        } else {
          if (st.held && torque) releaseTorque();
          st.held = false; st.prevQ = null;
        }
        if (mode === 'loosen' && st.progress >= 1) { st.perfect++; finish(1, M.done); }
      } else if (gesture === 'hold') {
        if (P.trigger) {
          st.motorT -= dt;
          if (st.motorT <= 0) { st.motorT = 0.3; A.drill(0.32, anchor); }
          let ang = 0;
          if (st.prevQ) { tmpQ.copy(st.prevQ).invert().multiply(P.quat); ang = 2 * Math.acos(Math.min(1, Math.abs(tmpQ.w))); }
          const steady = ang / Math.max(dt, 0.001) < 1.3;
          st.progress += dt * (steady ? 0.42 : 0.12);
          if (!steady) { st.shakeWarn += dt; if (st.shakeWarn > 0.4) { say('ถือให้นิ่ง!', '#ff8a8a'); st.shakeWarn = 0; } }
          if (toolObj) toolObj.rotateZ(dt * 25);
          st.prevQ = P.quat.clone(); st.held = true;
          if (Math.random() < 0.3) pulse(0.15, 16);
        } else {
          if (st.held && torque) releaseTorque();
          if (st.held && !torque && st.progress >= 1) { st.perfect++; finish(1, M.done); }
          st.held = false; st.prevQ = null;
        }
        if (!torque && st.progress >= 1) { st.perfect++; finish(1, M.done); }
      } else if (gesture === 'swing') {
        if (st.prevP && dt > 0) {
          const vy = (P.pos.y - st.prevP.y) / dt;
          if (!st.armed && vy < -1.3) { st.armed = true; st.peak = 0; }
          if (st.armed) {
            st.peak = Math.max(st.peak, -vy);
            if (vy > -0.25) {
              st.armed = false;
              const hard = st.peak > 4.2;
              if (hard) { st.ok++; say('แรงเกินไป ระวังไม้แตก', '#f2c230'); pulse(1, 90); } else { st.perfect++; say('เยี่ยม!', '#29c25a'); pulse(0.8, 60); }
              st.progress += (hard ? 0.7 : 1) / hits;
              A.thump(anchor, hard ? 0.5 : 0.35);
              if (toolObj) toolObj.rotateX(0.5);
              setTimeout(() => toolObj && toolObj.rotateX(-0.5), 90);
              if (st.progress >= 0.999) finish((st.perfect + st.ok * 0.7) / (st.perfect + st.ok), M.done);
            }
          }
        }
      } else if (gesture === 'stroke') {
        if (!st.origin) { st.origin = P.pos.clone(); st.far = 0; }
        const dist = P.pos.distanceTo(st.origin);
        if (dist > st.far) { st.far = dist; st.farP = P.pos.clone(); }
        else if (st.far > 0.1 && st.far - dist > 0.04) {
          const len = st.far;
          const good = len >= 0.12 && len <= 0.5;
          if (good) st.perfect++; else st.ok++;
          st.progress += 1 / (hits * 2);
          A.sawStroke(anchor, (st.perfect + st.ok) % 2 === 1);
          pulse(0.35, 40);
          if (toolObj) toolObj.translateZ((st.perfect + st.ok) % 2 ? 0.06 : -0.06);
          st.origin = st.farP; st.far = P.pos.distanceTo(st.origin);
          if (!good) say(len > 0.5 ? 'ช้าลงหน่อย' : 'ดึงให้สุดแนว', '#f2c230');
          if (st.progress >= 0.999) finish((st.perfect + st.ok * 0.7) / (st.perfect + st.ok), M.done);
        }
      }
      st.prevP = P.pos.clone();
      // torque feedback while turning
      if (torque && !st.entered && st.progress >= TORQUE.lo) { st.entered = true; say('พอดีแล้ว — ปล่อยไก!', '#29c25a', 2); pulse(0.7, 140); A.good(); }
      if (torque && st.progress >= TORQUE.strip) { st.miss++; finish(0.35, 'เกลียวรูด! แน่นเกินไป', '#ff6b6b'); pulse(1, 250); }
      // coaching if nothing is happening
      st.idle = st.progress > before ? 0 : st.idle + dt;
      if (st.idle > 9 && !st.hinted) { st.hinted = true; ctx.hud.coach(HINTS[mode] || '', 'tip'); }
    };
    function releaseTorque() {
      const p = st.progress;
      if (p >= TORQUE.lo && p <= TORQUE.hi) { st.perfect++; finish(1, M.done); } else if (p > TORQUE.hi && p < TORQUE.strip) { st.ok++; finish(0.7, 'แน่นไปนิด แต่ใช้ได้', '#f2c230'); } else if (p > 0.15) say('ยังหลวม — บิดต่อ', '#7fb3ff');
    }

    ctx.interaction.capture = () => {};          // the trigger is read as a held state, not as clicks
    const off = ctx.game.addTicker((dt) => {
      step(dt);
      st.msgT -= dt;
      if (st.doneT >= 0) {
        st.doneT -= dt;
        if (st.doneT < 0) {
          const attempts = st.perfect + st.ok + st.miss;
          resolve({ perfect: st.perfect, ok: st.ok, miss: st.miss, attempts, quality: st.quality ?? 1, gesture });
          return;
        }
      }
      draw();
    });
    draw();
    return () => {
      off();
      ctx.interaction.capture = null;
      panel.dispose();
      toolObj?.parent?.remove(toolObj);
    };
  });
}
