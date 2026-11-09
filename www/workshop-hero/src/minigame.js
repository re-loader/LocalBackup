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

export function runTiming({ anchor, title, tool = null, mode = 'tighten', hits = 3, speed = 0.75, green = 0.16, yellow = 0.14, toolDir = null }) {
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
        if (M.sound === 'ratchet') A.ratchet(kind === 'perfect' ? 6 : 4);
        else if (M.sound === 'saw') A.saw();
        else if (M.sound === 'drill') A.drill(0.45);
        else if (M.sound === 'thump') A.thump();
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
