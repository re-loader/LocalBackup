import { loadThaiFont } from './fontscale.js';      // first: canvas lettering in TH SarabunPSK
import * as THREE from 'three';
import { ctx } from './ctx.js';
import { Sound } from './audio.js';
import { World } from './world.js';
import { Interaction, Locomotion, Hands, Hints } from './input.js';
import { HUD } from './hud.js';
import { Panel } from './panel.js';
import { Game, loadRuns, loadTests, loadSurveys } from './game.js';
import { ToolInspector } from './inspect.js';
import { courseRows, summarize, researchCsv } from './research.js';
import { LEVELS, TEST, SURVEY, RESEARCH, normalizedGain } from './strings.js';
import { setupLook } from './look.js';
import { loadPhotoManifest } from './textures.js';
import { loadActorManifest } from './actors.js';

// The Workshop Hero — WebXR · เปิดได้ทั้งแว่น VR (PICO / Quest) และคอมพิวเตอร์ / แท็บเล็ต

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation?.(1);
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.03, 80);
camera.position.set(0, 1.5, 0);
setupLook(renderer, scene);
const rig = new THREE.Group();
rig.add(camera);
scene.add(rig);

Object.assign(ctx, { renderer, scene, camera, rig });
ctx.audio = new Sound();
ctx.audio.loadVoices();
// photographic materials (tools/gen-textures.py) must be known before the rooms are built
await Promise.all([loadPhotoManifest(), loadActorManifest(), loadThaiFont()]);
ctx.world = new World(scene);
ctx.interaction = new Interaction(renderer, camera, scene, rig);
ctx.loco = new Locomotion(rig, camera, ctx.interaction);
ctx.hands = new Hands(camera);
ctx.hints = new Hints(scene);
ctx.hud = new HUD(camera);
ctx.game = new Game();
ctx.inspect = new ToolInspector();     // pick a tool off the workshop wall to look at it

// keep the last station so entering VR mid-game re-centres the player there
const place = ctx.loco.place.bind(ctx.loco);
ctx.loco.place = (st) => { ctx.loco.lastStation = st; place(st); };

ctx.world.scenes.hub.onTick = () => ctx.audio.clockTick(ctx.world.scenes.hub.clockPos());
ctx.world.onShow = (name) => {
  if (name === 'restroom') {
    // fixed geometry; drips/sprays are tiny — a single capture is enough
    const s = ctx.world.scenes.restroom;
    const xr = renderer.xr.enabled; renderer.xr.enabled = false;   // cube capture must not render as XR
    s.captureMirror(renderer, scene);
    renderer.xr.enabled = xr;
  }
  ctx.audio?.setRoom?.(name);
};

// show something behind the overlay
ctx.world.show('workshop');
ctx.loco.place(ctx.world.scenes.workshop.stations.start);

// ------------------------------------------------------------------ loop
const clock = new THREE.Clock();
const camWorld = new THREE.Vector3();
let replaceIn = 0;
let shadowT = 0;
function frame(dt) {
  if (replaceIn > 0 && --replaceIn === 0 && ctx.loco.lastStation) ctx.loco.place(ctx.loco.lastStation);
  ctx.loco.update(dt);
  camera.getWorldPosition(camWorld);
  ctx.audio.listen(camera.matrixWorld);
  ctx.interaction.update(dt);
  ctx.world.update(dt, camWorld);
  ctx.hands.update(dt);
  ctx.hints.update(dt);
  ctx.game.update(dt);
  Panel.updateAll(dt, camWorld);
  ctx.hud.update(dt);
  // the window-sun shadow map refreshes at ~15 Hz (and at once after a room change): plenty for idle NPCs,
  // and it halves the shadow cost on a standalone headset
  shadowT += dt;
  if (shadowT > 0.066 || ctx.world.shadowDirty) { renderer.shadowMap.needsUpdate = true; shadowT = 0; ctx.world.shadowDirty = false; }
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(() => frame(Math.min(0.05, clock.getDelta())));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ------------------------------------------------------------------ overlay / VR
const $ = (id) => document.getElementById(id);
const overlay = $('start');
let started = false;

function begin() {
  ctx.audio.init();
  overlay.classList.add('hidden');
  $('menuBar').classList.remove('hidden');
  if (!started) { started = true; ctx.game.title(); }
}

$('playDesktop').addEventListener('click', begin);

async function enterVR() {
  ctx.audio.init();
  try {
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
    await renderer.xr.setSession(session);
    ctx.vr = true;
    ctx.hud.setVR(true);
    replaceIn = 2;           // after the first XR frame the head pose is known
    begin();
    session.addEventListener('end', () => {
      ctx.vr = false;
      ctx.hud.setVR(false);
      camera.position.set(0, 1.5, 0);
      camera.quaternion.identity();
      if (ctx.loco.lastStation) ctx.loco.place(ctx.loco.lastStation);
    });
  } catch (e) {
    console.error(e);
    $('vrNote').textContent = `เข้าโหมด VR ไม่ได้: ${e.message}`;
  }
}

if (navigator.xr?.isSessionSupported) {
  navigator.xr.isSessionSupported('immersive-vr').then((ok) => {
    const b = $('enterVR');
    if (ok) {
      b.disabled = false;
      b.addEventListener('click', enterVR);
      $('vrNote').textContent = 'พบแว่น VR — กดปุ่มเพื่อเข้าสู่ห้องช่างเสมือนจริง';
      $('vrBtnInGame').classList.remove('hidden');
    } else $('vrNote').textContent = 'อุปกรณ์นี้ไม่รองรับโหมด VR — เล่นบนจอได้ตามปกติ';
  }).catch(() => { $('vrNote').textContent = 'อุปกรณ์นี้ไม่รองรับโหมด VR — เล่นบนจอได้ตามปกติ'; });
} else {
  $('vrNote').textContent = window.isSecureContext
    ? 'เบราว์เซอร์นี้ไม่รองรับ WebXR — เล่นบนจอได้ตามปกติ'
    : 'WebXR ต้องเปิดผ่าน https:// หรือ localhost — เล่นบนจอได้ตามปกติ';
}
$('vrBtnInGame').addEventListener('click', enterVR);

// player name (saved with each result)
const nameInput = $('playerName');
nameInput.value = ctx.game.player;
nameInput.addEventListener('input', () => {
  ctx.game.player = nameInput.value.trim();
  try { localStorage.setItem('workshopHero.player', ctx.game.player); } catch { /* ignore */ }
});

// sound toggles
const musicBtn = $('musicBtn'), voiceBtn = $('voiceBtn');
const paintToggles = () => {
  musicBtn.classList.toggle('off', !ctx.audio.musicOn);
  voiceBtn.classList.toggle('off', !ctx.audio.voiceOn);
};
musicBtn.addEventListener('click', () => { ctx.audio.init(); ctx.audio.setMusic(!ctx.audio.musicOn); paintToggles(); });
voiceBtn.addEventListener('click', () => { ctx.audio.voiceOn = !ctx.audio.voiceOn; if (!ctx.audio.voiceOn) ctx.audio.stopVoices(); paintToggles(); });
$('menuBtn').addEventListener('click', () => {
  if (ctx.game.run && ctx.game.run.levelIndex >= 0) ctx.game.pause();
  else { overlay.classList.remove('hidden'); renderAll(); }
});
$('overlayClose').addEventListener('click', () => { if (started) overlay.classList.add('hidden'); });
paintToggles();

// ------------------------------------------------------------------ results table + CSV
function renderResults() {
  const runs = loadRuns().slice(-12).reverse();
  const box = $('results');
  if (!runs.length) { box.innerHTML = '<p class="fine">ยังไม่มีผลการเล่นบนเครื่องนี้</p>'; return; }
  box.innerHTML = `<table><thead><tr><th>ผู้เล่น</th><th>ด่าน</th><th>K</th><th>S</th><th>A</th><th>รวม</th><th>ดาว</th><th>เวลา</th><th>โหมด</th></tr></thead><tbody>${
    runs.map((r) => `<tr><td>${escapeHtml(r.player || '-')}</td><td>${r.level}</td><td>${r.K}</td><td>${r.S}</td><td>${r.A}</td><td><b>${r.total}</b></td><td>${'★'.repeat(r.stars)}</td><td>${Math.floor(r.seconds / 60)}:${String(r.seconds % 60).padStart(2, '0')}</td><td>${r.mode === 'vr' ? 'VR' : 'จอ'}</td></tr>`).join('')
  }</tbody></table>`;
}
/** Pre/post pairs: same course run (or, failing that, the same player name), latest of each. */
function testPairs() {
  const groups = new Map();
  for (const t of loadTests()) {
    const key = t.courseId || `name:${t.player}`;
    const g = groups.get(key) || { player: t.player, pre: null, post: null, date: t.date };
    g[t.phase] = t; g.player = t.player || g.player; g.date = t.date;
    groups.set(key, g);
  }
  return [...groups.values()];
}
function renderTests() {
  const pairs = testPairs().slice(-15).reverse();
  const box = $('testResults');
  if (!pairs.length) { box.innerHTML = '<p class="fine">ยังไม่มีผลแบบทดสอบ — กด "เริ่มเกม" เพื่อเล่นครบหลักสูตร (มีแบบทดสอบก่อน-หลังเรียน)</p>'; return; }
  box.innerHTML = `<table><thead><tr><th>ผู้เล่น</th><th>ก่อนเรียน</th><th>หลังเรียน</th><th>g (Hake)</th><th>ระดับ</th></tr></thead><tbody>${
    pairs.map((p) => {
      const g = p.pre && p.post ? normalizedGain(p.pre.score, p.post.score, p.post.max) : null;
      const cell = (t) => (t ? `${t.score}/${t.max}` : '—');
      return `<tr><td>${escapeHtml(p.player || '-')}</td><td>${cell(p.pre)}</td><td>${cell(p.post)}</td><td><b>${g === null ? '—' : g.toFixed(2)}</b></td><td>${p.pre && p.post ? TEST.band(g) : '—'}</td></tr>`;
    }).join('')
  }</tbody></table>`;
}

/** Class-level results for the study: E1/E2, E.I., pre/post, satisfaction (this device's data). */
function renderResearch() {
  const box = $('research');
  const rows = courseRows({ runs: loadRuns(), tests: loadTests(), surveys: loadSurveys() });
  const s = summarize(rows);
  const f = (v, d = 2) => (v === null || v === undefined ? '—' : v.toFixed(d));
  const mark = (ok) => (ok ? '<span class="ok">ผ่าน</span>' : '<span class="no">ไม่ผ่าน</span>');
  let html = '';
  if (!s.N) {
    html += `<p class="fine">ยังไม่มีนักเรียนเล่นครบหลักสูตร (กด "เริ่มเกม": ก่อนเรียน → 3 ด่าน → หลังเรียน → ประเมินความพึงพอใจ)${rows.length ? ` · เริ่มแล้ว ${rows.length} คน` : ''}</p>`;
  } else {
    html += `<table><thead><tr><th class="l">ตัวชี้วัด</th><th>ผล</th><th>เกณฑ์</th><th></th></tr></thead><tbody>
      <tr><td class="l">นักเรียนที่เล่นครบหลักสูตร</td><td><b>${s.N}</b> คน</td><td colspan="2">เริ่มทั้งหมด ${s.started} คน</td></tr>
      <tr><td class="l">ประสิทธิภาพ E<sub>1</sub>/E<sub>2</sub> (คะแนนระหว่างเล่น / หลังเรียน)</td><td><b>${f(s.E1)}/${f(s.E2)}</b></td><td>${RESEARCH.e}/${RESEARCH.e}</td><td>${mark(s.passE)}</td></tr>
      <tr><td class="l">ดัชนีประสิทธิผล E.I. (= ⟨g⟩ ของ Hake จากค่าเฉลี่ยห้อง)</td><td><b>${f(s.EI)}</b></td><td>≥ ${RESEARCH.ei.toFixed(2)}</td><td>${mark(s.passEI)}</td></tr>
      <tr><td class="l">คะแนนก่อนเรียน x̄ (S.D.) เต็ม ${s.max}</td><td>${f(s.pre.mean)} (${f(s.pre.sd)})</td><td colspan="2" rowspan="2">ทดสอบ t แบบไม่อิสระ<br>ด้วย CSV งานวิจัย</td></tr>
      <tr><td class="l">คะแนนหลังเรียน x̄ (S.D.) เต็ม ${s.max}</td><td>${f(s.post.mean)} (${f(s.post.sd)})</td></tr>
      <tr><td class="l">normalized gain เฉลี่ยรายคน</td><td>${f(s.gainMean)}</td><td colspan="2">ระดับ${TEST.band(s.gainMean)}</td></tr>
    </tbody></table>`;
  }
  if (s.sat.n) {
    const o = s.sat.overall;
    html += `<table><thead><tr><th class="l">ความพึงพอใจ (n = ${s.sat.n})</th><th>x̄</th><th>S.D.</th><th>ระดับ</th></tr></thead><tbody>${
      s.sat.aspects.map((a) => `<tr class="aspect"><td class="l">${a.name}</td><td>${f(a.mean)}</td><td>${f(a.sd)}</td><td>${SURVEY.level(a.mean)}</td></tr>${
        s.sat.items.map((it, i) => (it.a === a.key ? `<tr><td class="l">${i + 1}. ${escapeHtml(it.text)}</td><td>${f(it.mean)}</td><td>${f(it.sd)}</td><td>${SURVEY.level(it.mean)}</td></tr>` : '')).join('')}`).join('')
    }<tr class="aspect"><td class="l">รวม</td><td><b>${f(o.mean)}</b></td><td>${f(o.sd)}</td><td><b>${SURVEY.level(o.mean)}</b></td></tr></tbody></table>`;
  }
  html += '<p class="note">คำนวณจากข้อมูลในเครื่องนี้เท่านั้น · E<sub>1</sub> ใช้คะแนนรอบแรกของแต่ละด่าน · ถ้าใช้หลายเครื่อง ให้ดาวน์โหลด "CSV งานวิจัย" จากทุกเครื่องมารวมกัน</p>';
  box.innerHTML = html;
}
function renderAll() { renderResearch(); renderResults(); renderTests(); }

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function download(text, name) {
  const blob = new Blob(['\ufeff' + text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
// one row per student (course): pre/post items, mission K-S-A, process %, satisfaction — for SPSS / R / Excel
$('csvResearchBtn').addEventListener('click', () => {
  download(researchCsv(courseRows({ runs: loadRuns(), tests: loadTests(), surveys: loadSurveys() })), 'workshop-hero-research');
});
$('csvBtn').addEventListener('click', () => {
  const runs = loadRuns();
  const head = ['date', 'player', 'level', 'level_name', 'K', 'S', 'A', 'total', 'stars', 'pass', 'seconds', 'mode', 'events_json'];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = runs.map((r) => [r.date, r.player, r.level, LEVELS[r.level - 1]?.name, r.K, r.S, r.A, r.total, r.stars, r.pass, r.seconds, r.mode, JSON.stringify(r.events)].map(q).join(','));
  const blob = new Blob(['﻿' + [head.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `workshop-hero-results-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
// one row per test sitting, one column per item (1/0) and the letter chosen — ready for SPSS / R / Excel
$('csvTestBtn').addEventListener('click', () => {
  const tests = loadTests();
  const n = TEST.items.length;
  const head = ['date', 'player', 'course_id', 'phase', 'score', 'max', 'seconds', 'mode',
    ...Array.from({ length: n }, (_, i) => `item${i + 1}`), ...Array.from({ length: n }, (_, i) => `chosen${i + 1}`)];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = tests.map((t) => {
    const by = Object.fromEntries((t.answers || []).map((a) => [a.item, a]));
    return [t.date, t.player, t.courseId, t.phase, t.score, t.max, t.seconds, t.mode,
      ...Array.from({ length: n }, (_, i) => (by[i + 1] ? (by[i + 1].correct ? 1 : 0) : '')),
      ...Array.from({ length: n }, (_, i) => (by[i + 1] ? 'ABCD'[by[i + 1].chosen] : ''))].map(q).join(',');
  });
  const blob = new Blob(['\ufeff' + [head.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `workshop-hero-prepost-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('clearBtn').addEventListener('click', () => {
  if (!confirm('ลบผลการเล่น ผลแบบทดสอบ และแบบประเมินความพึงพอใจทั้งหมดบนเครื่องนี้?')) return;
  try { for (const k of ['runs', 'tests', 'surveys']) localStorage.removeItem(`workshopHero.${k}`); } catch { /* ignore */ }
  renderAll();
});
$('studyTitle').textContent = RESEARCH.title;
renderAll();

$('loading').classList.add('hidden');
overlay.classList.remove('hidden');

// debugging handle (also handy for teachers: workshop.game.start(1) jumps to level 2)
window.workshop = {
  ctx, game: ctx.game, THREE,
  /** Lists clickable 3D buttons, or presses the one whose label contains `text`. */
  buttons: () => [...ctx.interaction.targets.keys()].filter((o) => o.userData.button).map((o) => o.userData.button.label),
  press(text) {
    for (const [o, h] of ctx.interaction.targets) {
      const b = o.userData.button;
      if (b && String(b.label).includes(text) && h.enabled()) { h.onSelect({ root: o }, { kind: 'debug' }); return true; }
    }
    return false;
  },
  /** Selects a registered 3D object (tool, door, …) by its hover label. */
  pick(text) {
    // an exact label wins (so 'ไขควง' picks the tool, not 'หยิบดู ไขควง'), then any label containing the text
    for (const exact of [true, false]) {
      for (const [o, h] of ctx.interaction.targets) {
        const l = typeof h.label === 'function' ? h.label() : h.label;
        if (!o.userData.button && l && (exact ? l === text : l.includes(text)) && h.enabled()) { h.onSelect({ root: o }, { kind: 'debug' }); return true; }
      }
    }
    return false;
  },
  targets: () => [...ctx.interaction.targets].filter(([o]) => !o.userData.button).map(([, h]) => (typeof h.label === 'function' ? h.label() : h.label)),
  /** Advances the game by hand (for tests while the page is hidden and not animating). */
  step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) frame(dt); },
  state: () => ({ level: ctx.game.run?.levelIndex, stage: ctx.hud.s.stage, objective: ctx.hud.s.objective, scores: ctx.hud.s.scores, scene: ctx.world.currentName, capture: !!ctx.interaction.capture }),
};
