import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FONT, ADISAC, GROUPS, ITEMS } from './strings.js';
import { rr, drawWrapped } from './util.js';
import { unlit, addCornerAO, sunbeam, shadowify, aimSun } from './look.js';
import {
  woodTex, concreteTex, tileTex, checkerTex, wallTex, pegboardTex, windowViewTex, signTex, posterTex, toTex, photo,
} from './textures.js';
import {
  mat, M, box, rbox, cyl, sph, makeItem, schoolDesk, schoolChair, teacherDesk, bookshelf, workbench, vise,
  toolChest, cabinet, plant, whiteboard, ladder, toolBag, lightSwitch, makeCharacter,
} from './models.js';
import { Actor, hasActor } from './actors.js';

/** Poses that actually exist on disk (tools/gen-actors.py), keyed for an Actor. */
const posesOf = (map) => Object.fromEntries(Object.entries(map).filter(([, n]) => hasActor(n)));

// ฉากทั้ง 4: ห้องพักครู (hub) · ห้องช่าง · ห้องเรียน ม.2/1 · ห้องน้ำ
// ส่วนที่ไม่ขยับถูกรวม geometry ตามวัสดุ เพื่อลด draw call บนแว่น

export function yawTo(from, to) {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

/** Merges every mesh under `root` into one mesh per material. */
function bakeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const byMat = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mtx = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    geo.applyMatrix4(mtx);
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    geo.morphAttributes = {};
    const key = o.material.uuid;
    if (!byMat.has(key)) byMat.set(key, { mat: o.material, geos: [] });
    byMat.get(key).geos.push(geo);
  });
  while (root.children.length) root.remove(root.children[0]);
  for (const { mat: m, geos } of byMat.values()) {
    const merged = mergeGeometries(geos, false);
    if (merged) {
      const mesh = new THREE.Mesh(merged, m);
      const lit = m.isMeshStandardMaterial;
      mesh.castShadow = lit && !m.transparent && !m.userData.noCast;
      mesh.receiveShadow = lit;
      root.add(mesh);
    }
    geos.forEach((g) => g.dispose());
  }
}

function signMesh(text, w, h, opts = {}) {
  const px = 512;
  const tex = signTex(text, { w: px, h: Math.round(px * h / w), ...opts });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), unlit(new THREE.MeshBasicMaterial({ map: tex, transparent: true })));
}

/** World-space corners of a window (for its sunbeam), read before the static meshes are merged. */
function windowCorners(o) {
  o.updateWorldMatrix(true, false);
  const [w, h] = o.userData.size;
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => o.localToWorld(new THREE.Vector3(x, y, 0.03)).toArray());
}

/** Wall clock showing the real time (repainted once a second while its room is visible). */
function wallClock(r = 0.17) {
  const g = new THREE.Group();
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  const tex = toTex(c, { aniso: 8 });
  const face = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 }));
  face.position.z = 0.013; g.add(face);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.014, 8, 40), mat('#1d2733', { rough: 0.4, metal: 0.3 }));
  rim.position.z = 0.013; g.add(rim);
  cyl(r, r, 0.024, mat('#e9e4da'), 0, 0, 0, g, 32).rotation.x = Math.PI / 2;
  let last = -1;
  g.userData.update = () => {
    const now = new Date();
    const s = now.getSeconds();
    if (s === last) return false;
    last = s;
    const m = now.getMinutes() + s / 60, h = (now.getHours() % 12) + m / 60;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.fillStyle = '#fbfaf6'; x.fillRect(0, 0, 256, 256);
    x.translate(128, 128);
    for (let i = 0; i < 60; i++) {
      x.save(); x.rotate((i / 60) * Math.PI * 2);
      x.fillStyle = '#1d2733'; x.fillRect(-1.5, -118, 3, i % 5 ? 8 : 18); x.restore();
    }
    x.fillStyle = '#1d2733'; x.font = `700 30px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    [[12, 0, -84], [3, 86, 0], [6, 0, 86], [9, -86, 0]].forEach(([n, px, py]) => x.fillText(String(n), px, py));
    const hand = (ang, len, wdt, col) => { x.save(); x.rotate(ang); x.fillStyle = col; x.fillRect(-wdt / 2, -len, wdt, len + 14); x.restore(); };
    hand((h / 12) * Math.PI * 2, 58, 9, '#1d2733');
    hand((m / 60) * Math.PI * 2, 88, 6, '#1d2733');
    hand((s / 60) * Math.PI * 2, 96, 2.5, '#d33a3a');
    x.beginPath(); x.arc(0, 0, 7, 0, Math.PI * 2); x.fillStyle = '#d33a3a'; x.fill();
    x.setTransform(1, 0, 0, 1, 0, 0);
    tex.needsUpdate = true;
    return true;
  };
  g.userData.update();
  return g;
}

/** Ceiling fan (every Thai classroom has one). Spins; casts no shadow (it would flicker at 15 Hz). */
function ceilingFan(parent, x, z, h) {
  const g = new THREE.Group(); g.position.set(x, h, z); parent.add(g);
  const cream = mat('#efeae0', { rough: 0.45 });
  cyl(0.015, 0.015, 0.35, cream, 0, -0.175, 0, g, 8);
  cyl(0.11, 0.13, 0.1, cream, 0, -0.38, 0, g, 20);
  const rot = new THREE.Group(); rot.position.y = -0.42; g.add(rot);
  cyl(0.06, 0.06, 0.04, mat('#c9c2b4', { rough: 0.4 }), 0, 0, 0, rot, 14);
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    const b = box(0.6, 0.012, 0.13, cream, Math.cos(a) * 0.38, 0, Math.sin(a) * 0.38, rot);
    b.rotation.order = 'YXZ'; b.rotation.y = -a; b.rotation.x = 0.14;
  }
  g.userData.rotor = rot;
  return g;
}
function noCast(root) { root.traverse((o) => { if (o.isMesh) o.castShadow = false; }); }

const SUNS = {
  hub: { dir: [0.75, -0.62, -0.08], half: 4.6 },
  workshop: { dir: [0.72, -0.6, -0.18], half: 6.6 },
  classroom: { dir: [0.78, -0.55, 0.06], half: 5.6 },
  restroom: { dir: [0.62, -0.7, 0.2], half: 3.6 },
};

/** Builds floor, ceiling, walls, baseboards. Returns helpers to mount things on walls. */
/** UVs scaled to metres: a texture with repeat = 1/covers then shows at its true size on any surface. */
function metreUV(geo, sx, sy) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
  return geo;
}

/**
 * Room surface: the generated photo when it exists (tinted, its own luminance as bump), else the drawn
 * canvas texture — both set up per metre for the metre UVs of the room shell.
 */
function surface(name, { tint = '#ffffff', rough = 0.85, bs = 1, mirror = true, fallback }) {
  const p = photo(name, { mirror });
  if (p) {
    const m = new THREE.MeshStandardMaterial({ color: tint, map: p, roughness: rough, bumpMap: p, bumpScale: bs });
    m.userData.photo = name;
    return m;
  }
  return fallback();
}

function room(parent, { w, d, h, floor, wall, ceil = '#f7f7f4', base = '#6b4a2b' }) {
  const g = new THREE.Group();
  parent.add(g);
  const fl = new THREE.Mesh(metreUV(new THREE.PlaneGeometry(w, d), w, d), floor);
  fl.rotation.x = -Math.PI / 2; g.add(fl);
  // walls and ceiling don't block the window sun (the windows aren't real holes) — only furniture casts
  wall.userData.noCast = true;
  // a ceiling under lit fluorescent panels is never this dark in real life: a little bounce light
  const cp = photo('ceiling-tiles');
  const ceilMat = cp
    ? new THREE.MeshStandardMaterial({ color: '#ffffff', map: cp, roughness: 0.95, emissive: '#efe9dc', emissiveIntensity: 0.32, emissiveMap: cp })
    : mat(ceil, { rough: 0.95, emissive: '#efe9dc', ei: 0.32 });
  ceilMat.userData.noCast = true;
  const ce = new THREE.Mesh(metreUV(new THREE.PlaneGeometry(w, d), w, d), ceilMat);
  ce.rotation.x = Math.PI / 2; ce.position.y = h; g.add(ce);
  const walls = {
    front: { pos: [0, 0, -d / 2], rot: 0, len: w },
    back: { pos: [0, 0, d / 2], rot: Math.PI, len: w },
    left: { pos: [-w / 2, 0, 0], rot: Math.PI / 2, len: d },
    right: { pos: [w / 2, 0, 0], rot: -Math.PI / 2, len: d },
  };
  for (const k of Object.keys(walls)) {
    const W = walls[k];
    const m = new THREE.Mesh(metreUV(new THREE.PlaneGeometry(W.len, h), W.len, h), wall);
    m.position.set(W.pos[0], h / 2, W.pos[2]); m.rotation.y = W.rot; g.add(m);
    const b = box(W.len, 0.1, 0.02, mat(base), 0, 0.05, 0.01);
    const holder = new THREE.Group();
    holder.position.set(...W.pos); holder.rotation.y = W.rot; holder.add(b); g.add(holder);
  }
  addCornerAO(g, w, d);
  /** Group mounted on a wall: local x along the wall, y up, +z into the room. */
  const onWall = (k, along, y, off = 0) => {
    const W = walls[k];
    const o = new THREE.Group();
    o.position.set(...W.pos); o.rotation.y = W.rot;
    o.translateX(along); o.translateY(y); o.translateZ(off);
    g.add(o);
    return o;
  };
  return { group: g, onWall, w, d, h };
}

function windowAt(R, wallKey, along, y, ww = 1.6, wh = 1.3, curtain = null) {
  const o = R.onWall(wallKey, along, y, 0.004);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), unlit(new THREE.MeshBasicMaterial({ map: photo('window-view', { repeat: [1, 1] }) || windowViewTex() })));
  o.add(glass);
  o.userData.size = [ww, wh];
  const fm = mat('#e9eef2', { rough: 0.5, metal: 0.2 });
  box(ww + 0.1, 0.06, 0.08, fm, 0, wh / 2, 0.03, o);
  box(ww + 0.1, 0.06, 0.14, fm, 0, -wh / 2, 0.05, o);
  box(0.06, wh, 0.08, fm, -ww / 2, 0, 0.03, o);
  box(0.06, wh, 0.08, fm, ww / 2, 0, 0.03, o);
  box(0.04, wh, 0.05, fm, 0, 0, 0.03, o);
  if (curtain) {
    for (const s of [-1, 1]) {
      const c = box(0.3, wh + 0.3, 0.04, mat(curtain, { rough: 0.95 }), s * (ww / 2 + 0.12), 0.05, 0.1, o);
      c.scale.z = 1;
    }
    box(ww + 0.9, 0.04, 0.04, M.steel(), 0, wh / 2 + 0.2, 0.12, o);
  }
  return o;
}

const litPanel = mat('#ffffff', { emissive: '#fffbe8', ei: 1.6, rough: 0.5 });
litPanel.userData.noCast = true;
function ceilingPanel(parent, x, z, h, m = litPanel) {
  const p = box(1.2, 0.04, 0.3, m, x, h - 0.03, z, parent);
  box(1.26, 0.03, 0.36, mat('#d8dde2'), x, h - 0.012, z, parent);
  return p;
}

function doorAt(R, wallKey, along, label, color = '#2f6fc4') {
  const o = R.onWall(wallKey, along, 0, 0.01);
  box(1.0, 2.1, 0.05, mat(color, { rough: 0.55 }), 0, 1.05, 0.025, o);
  box(1.12, 2.18, 0.04, mat('#e9eef2'), 0, 1.09, 0.0, o);
  cyl(0.025, 0.025, 0.14, M.steel(), 0.38, 1.0, 0.08, o, 10).rotation.z = Math.PI / 2;
  const s = signMesh(label, 0.9, 0.2, { bg: '#16306b', size: 52 });
  s.position.set(0, 2.38, 0.03); o.add(s);
  return o;
}

// ---------------------------------------------------------------------
// ADISAC model board (repainted to highlight the current stage)
// ---------------------------------------------------------------------
export function drawAdisacBoard(g, W, H, current = null) {
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#fbfaf5'; rr(g, 0, 0, W, H, 28); g.fill();
  g.fillStyle = '#16306b'; rr(g, 0, 0, W, 120, 28); g.fill(); g.fillRect(0, 60, W, 60);
  g.fillStyle = '#ffd23f'; g.font = `800 64px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(ADISAC.name, W / 2, 62);
  const cw = (W - 80) / 3, ch = (H - 180) / 2;
  ADISAC.stages.forEach((s, i) => {
    const x = 40 + (i % 3) * cw, y = 150 + Math.floor(i / 3) * ch;
    const on = s.key === current;
    g.fillStyle = on ? s.color : '#ffffff';
    g.strokeStyle = s.color; g.lineWidth = on ? 10 : 5;
    rr(g, x + 10, y + 10, cw - 20, ch - 20, 22); g.fill(); g.stroke();
    g.fillStyle = on ? '#ffffff' : s.color;
    g.beginPath(); g.arc(x + 70, y + 70, 38, 0, Math.PI * 2); g.fill();
    g.fillStyle = on ? s.color : '#ffffff';
    g.font = `800 44px ${FONT}`; g.fillText(String(s.n), x + 70, y + 72);
    g.textAlign = 'left';
    g.fillStyle = on ? '#ffffff' : '#1d2733';
    g.font = `800 42px ${FONT}`; g.fillText(s.key, x + 122, y + 56);
    g.font = `600 34px ${FONT}`; g.fillText(s.th, x + 122, y + 100);
    g.font = `500 27px ${FONT}`; g.fillStyle = on ? '#ffffffdd' : '#55606b';
    drawWrapped(g, s.desc, x + 30, y + 150, cw - 60, 34, 2);
    g.textAlign = 'center';
  });
}

function adisacBoardMesh(w = 1.5, h = 1.0) {
  const c = document.createElement('canvas');
  c.width = 1200; c.height = 800;
  const g = c.getContext('2d');
  const tex = toTex(c, { aniso: 16 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), unlit(new THREE.MeshBasicMaterial({ map: tex, transparent: true })));
  let last = undefined;
  const redraw = (key) => {
    if (key === last) return;
    last = key;
    drawAdisacBoard(g, c.width, c.height, key);
    tex.needsUpdate = true;
  };
  redraw(null);
  return { mesh, redraw };
}

function groupsPosterTex() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#fffaf0'; rr(g, 0, 0, 1024, 512, 24); g.fill();
  g.fillStyle = '#d99a0b'; rr(g, 0, 0, 1024, 96, 24); g.fill(); g.fillRect(0, 50, 1024, 46);
  g.fillStyle = '#fff'; g.font = `800 52px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('เครื่องมือช่างพื้นฐาน 7 กลุ่ม', 512, 50);
  const cw = 1024 / 4;
  GROUPS.forEach((gr, i) => {
    const col = i % 4, row = Math.floor(i / 4);
    const x = col * cw + (row ? cw / 2 : 0), y = 120 + row * 190;
    g.fillStyle = gr.color; rr(g, x + 14, y, cw - 28, 170, 18); g.fill();
    g.fillStyle = '#fff'; g.font = `800 34px ${FONT}`;
    g.fillText(gr.th, x + cw / 2, y + 50);
    g.font = `600 30px ${FONT}`; g.fillText(gr.ex, x + cw / 2, y + 110);
  });
  return toTex(c, { aniso: 16 });
}

// ---------------------------------------------------------------------
// The world
// ---------------------------------------------------------------------
export class World {
  constructor(scene) {
    this.scene = scene;
    this.hemi = new THREE.HemisphereLight('#eef6ff', '#c9bba6', 1.0);
    this.sun = new THREE.DirectionalLight('#ffeccc', 2.6);
    this.sun.position.set(-4, 6, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.025;
    scene.add(this.hemi, this.sun, this.sun.target);
    this.shadowDirty = true;
    scene.background = new THREE.Color('#bfe3ff');
    this.scenes = {
      hub: this._hub(),
      workshop: this._workshop(),
      classroom: this._classroom(),
      restroom: this._restroom(),
    };
    for (const s of Object.values(this.scenes)) { s.group.visible = false; scene.add(s.group); }
    this.current = null;
  }

  show(name) {
    for (const [k, s] of Object.entries(this.scenes)) s.group.visible = k === name;
    this.current = this.scenes[name];
    this.currentName = name;
    aimSun(this.sun, SUNS[name]);
    this.applyLighting();
    this.shadowDirty = true;
    this.onShow?.(name);
  }

  applyLighting() {
    const L = this.current?.lighting || { hemi: 1.0, sun: 2.6 };
    this.hemi.intensity = L.hemi;
    this.sun.intensity = L.sun;
  }

  update(dt, camPos) {
    this.current?.update?.(dt, camPos);
  }

  // ===================================================== ห้องพักครู (hub)
  _hub() {
    const group = new THREE.Group();
    const st = new THREE.Group(); group.add(st);
    const R = room(st, {
      w: 7, d: 6, h: 3,
      floor: surface('floor-wood', { rough: 0.45, bs: 0.8, fallback: () => mat('#ffffff', { map: woodTex('#b98352', 8, [0.43, 0.5]), rough: 0.5, bump: woodTex('#b98352', 8, [0.43, 0.5]), bs: 1.2 }) }),
      wall: surface('wall-plaster', { tint: '#f6ead2', rough: 0.92, bs: 0.6, fallback: () => mat('#ffffff', { map: wallTex('#f3e6cc', [0.45, 0.33]), rough: 0.92, bump: wallTex('#f3e6cc', [0.45, 0.33]), bs: 0.6 }) }),
    });
    const hubWin = [windowAt(R, 'left', -1.4, 1.6, 2.0, 1.3, '#a8c66c')].map(windowCorners);
    const sg = signMesh('ห้องพักครู', 1.1, 0.3, { bg: '#ffffff', fg: '#1d2733', border: '#8a5a33', size: 64 });
    R.onWall('front', 0, 2.55, 0.02).add(sg);
    const td = teacherDesk(); td.position.set(0, 0, -1.2); st.add(td);
    const bs1 = bookshelf(1.2, 1.9, 0.35, 4); bs1.position.set(-3.2, 0, -1.3); bs1.rotation.y = Math.PI / 2; st.add(bs1);
    const bs2 = bookshelf(1.0, 1.9, 0.35, 4); bs2.position.set(2.9, 0, -2.75); st.add(bs2);
    const d2 = teacherDesk(); d2.position.set(2.3, 0, 0.6); d2.rotation.y = -Math.PI / 2; st.add(d2);
    const pl = plant(); pl.position.set(-3.0, 0, 2.4); st.add(pl);
    const pl2 = plant(); pl2.position.set(-3.0, 0, -2.6); st.add(pl2);
    // notice board
    const nb = R.onWall('front', 1.7, 1.5, 0.02);
    box(1.2, 0.8, 0.03, mat('#b98352', { rough: 0.95 }), 0, 0, 0, nb);
    for (let i = 0; i < 6; i++) box(0.25, 0.3, 0.005, mat(['#fff7d6', '#ffffff', '#d6f0ff', '#ffe0e0'][i % 4]), -0.4 + (i % 3) * 0.4, 0.17 - Math.floor(i / 3) * 0.36, 0.02, nb).rotation.z = (Math.random() - 0.5) * 0.15;
    // ceiling lights
    for (const x of [-1.5, 1.5]) for (const z of [-1.2, 1.2]) ceilingPanel(st, x, z, 3);
    bakeStatic(st);

    const dyn = new THREE.Group(); group.add(dyn);
    const hubBeams = hubWin.map((c) => sunbeam(c, SUNS.hub.dir, 3.4));
    hubBeams.forEach((b) => dyn.add(b));
    const hubClock = wallClock(0.17);
    const ch = R.onWall('front', 0.95, 2.45, 0.0); dyn.add(ch); ch.add(hubClock);
    // ADISAC board on the back-left wall (dynamic: repainted per stage)
    const board = adisacBoardMesh(1.5, 1.0);
    const bw = R.onWall('front', -1.7, 1.65, 0.02); dyn.add(bw);
    bw.add(board.mesh);
    // the teacher from the design board when her sprites exist, else the drawn 3D character
    const teacher = hasActor('teacher-idle')
      ? new Actor({ height: 1.62, poses: posesOf({ idle: 'teacher-idle', talk: 'teacher-talk', worried: 'teacher-worried', wave: 'teacher-happy' }) })
      : makeCharacter({ skin: '#f3c9a5', hair: '#2b1a12', shirt: '#c9ab74', lower: '#8a7449', bun: true, clipboard: true, scale: 1.05 });
    teacher.root.position.set(-0.45, 0, -1.85);
    teacher.root.rotation.y = Math.PI;
    dyn.add(teacher.root);
    const exit = doorAt(R, 'right', 1.6, 'ไปห้องช่าง', '#2e9b4a');
    R.group.remove(exit); dyn.add(exit);
    shadowify(dyn);
    return {
      group, R, teacher, board, exit,
      bounds: { minX: -3.2, maxX: 3.2, minZ: -0.6, maxZ: 2.7 },
      stations: { start: { pos: new THREE.Vector3(0, 0, 1.2), yaw: 0, pitch: -0.06 } },
      dialogAt: { pos: new THREE.Vector3(0.6, 1.42, -0.75) },
      lighting: { hemi: 0.95, sun: 2.7 },
      clock: hubClock,
      clockPos: () => ch.getWorldPosition(new THREE.Vector3()),
      update(dt, cam) {
        teacher.lookAt(cam); teacher.update(dt);
        hubBeams.forEach((b) => b.userData.update(dt));
        if (hubClock.userData.update()) this.onTick?.();
      },
    };
  }

  // ===================================================== ห้องช่าง
  _workshop() {
    const group = new THREE.Group();
    const st = new THREE.Group(); group.add(st);
    const R = room(st, {
      w: 10, d: 8, h: 3.4,
      floor: surface('floor-concrete', { rough: 0.72, bs: 1.2, fallback: () => mat('#ffffff', { map: concreteTex([0.5, 0.5]), rough: 0.78, bump: concreteTex([0.5, 0.5]), bs: 1.5 }) }),
      wall: surface('wall-block', { tint: '#eef3f6', rough: 0.8, bs: 1.5, mirror: false, fallback: () => mat('#ffffff', { map: wallTex('#dfe8ee', [0.45, 0.3]), rough: 0.92, bump: wallTex('#dfe8ee', [0.45, 0.3]), bs: 0.6 }) }),
      base: '#3b4a5a',
    });
    // safety walkway lines
    for (const x of [-3.7, 3.7]) box(0.08, 0.004, 6.6, mat('#ffc21a'), x, 0.002, 0.3, st);
    const wsWin = [windowAt(R, 'left', -2.0, 1.8, 1.8, 1.2), windowAt(R, 'left', 1.0, 1.8, 1.8, 1.2)].map(windowCorners);
    windowAt(R, 'back', -0.4, 1.8, 1.8, 1.2);
    const s1 = signMesh('ห้องช่าง โรงเรียน', 1.6, 0.34, { bg: '#16306b', fg: '#ffd23f', size: 60, sub: 'School Workshop', subSize: 28 });
    R.onWall('back', 0.6, 2.75, 0.02).add(s1);
    // tool wall
    const tw = R.onWall('front', -2.2, 1.6, 0.02);
    const pegPhoto = photo('pegboard', { repeat: [3.3 / 0.6, 1.35 / 0.6] });
    box(3.3, 1.35, 0.03, pegPhoto ? mat('#ffffff', { map: pegPhoto, rough: 0.9, bump: pegPhoto, bs: 2 }) : mat('#ffffff', { map: pegboardTex([2, 1]), rough: 0.9, bump: pegboardTex([2, 1]), bs: 2 }), 0, 0, 0, tw);
    box(3.4, 0.06, 0.06, mat('#8a5a33'), 0, 0.7, 0.02, tw);
    box(3.4, 0.06, 0.06, mat('#8a5a33'), 0, -0.7, 0.02, tw);
    const ts = signMesh('คลังแสงเครื่องมือ', 1.3, 0.28, { bg: '#d99a0b', fg: '#ffffff', size: 60 });
    ts.position.set(0, 0.93, 0.02); tw.add(ts);
    const wb1 = workbench(3.2, 0.7); wb1.position.set(-2.2, 0, -3.6); st.add(wb1);
    const vs = vise(); vs.position.set(-0.85, 0.895, -3.6); st.add(vs);
    // 7-groups poster
    const gp = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), unlit(new THREE.MeshBasicMaterial({ map: groupsPosterTex() })));
    R.onWall('left', 3.15, 1.75, 0.02).add(gp);
    // whiteboard (quiz)
    const wbd = whiteboard(2.4, 1.2);
    const wbHolder = R.onWall('front', 2.2, 1.65, 0.03);
    wbHolder.add(wbd); wbd.rotation.y = Math.PI;
    const qs = signMesh('กระดานความรู้', 1.0, 0.24, { bg: '#2f9fd0', size: 56 });
    qs.position.set(0, 0.85, 0.01); wbHolder.add(qs);
    // centre bench, side bench
    const wbc = workbench(2.2, 1.0); wbc.position.set(0, 0, -0.6); st.add(wbc);
    const wbs = workbench(1.8, 0.8); wbs.position.set(-2.4, 0, 1.6); st.add(wbs);
    // material rack (right wall, front)
    const rack = new THREE.Group(); rack.position.set(4.55, 0, -2.6); rack.rotation.y = -Math.PI / 2; st.add(rack);
    for (let i = 0; i < 3; i++) box(1.6, 0.04, 0.5, mat('#8a6a48'), 0, 0.35 + i * 0.5, 0, rack);
    for (const x of [-0.78, 0.78]) box(0.05, 1.45, 0.5, mat('#3b4a5a'), x, 0.72, 0, rack);
    const rs = signMesh('ชั้นวัสดุ', 0.7, 0.17, { bg: '#2e9b4a', size: 56 });
    rs.position.set(0, 1.62, 0.26); rack.add(rs);
    // PPE station (right wall, middle)
    const ppeB = new THREE.Group(); ppeB.position.set(4.6, 0, -0.4); ppeB.rotation.y = -Math.PI / 2; st.add(ppeB);
    box(1.4, 0.9, 0.4, mat('#2f6fc4', { rough: 0.5, metal: 0.3 }), 0, 0.45, 0, ppeB);
    box(1.4, 0.04, 0.42, mat('#e9eef2'), 0, 0.92, 0, ppeB);
    const ppePoster = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.96), new THREE.MeshBasicMaterial({
      map: posterTex({ title: 'สวม PPE ทุกครั้ง', body: 'หมวก • ถุงมือ • แว่นตานิรภัย ก่อนเริ่มงานช่าง', accent: '#2f6fc4' }),
    }));
    R.onWall('right', -0.4, 1.75, 0.02).add(ppePoster);
    const ps = signMesh('สถานี PPE', 0.8, 0.18, { bg: '#2f6fc4', size: 56 });
    R.onWall('right', -0.4, 2.4, 0.02).add(ps);
    // safety poster
    const sp = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.82), new THREE.MeshBasicMaterial({
      map: posterTex({ title: 'ความปลอดภัยมาก่อน', body: 'ตรวจเครื่องมือก่อนใช้ ทำงานอย่างระมัดระวัง', accent: '#e23b3b' }),
    }));
    R.onWall('right', 2.3, 1.7, 0.02).add(sp);
    const chest = toolChest(); chest.position.set(-3.9, 0, 3.4); chest.rotation.y = Math.PI; st.add(chest);
    const cab = cabinet(0.9, 1.9, 0.45, '#c9d3dc'); cab.position.set(-4.7, 0, 3.0); cab.rotation.y = Math.PI / 2; st.add(cab);
    for (const x of [-2.5, 0, 2.5]) for (const z of [-2, 1]) ceilingPanel(st, x, z, 3.4);
    bakeStatic(st);
    const wsBeams = wsWin.map((c) => sunbeam(c, SUNS.workshop.dir, 3.8));
    const wsFans = [ceilingFan(group, -1.3, -0.4, 3.4), ceilingFan(group, 1.6, 1.6, 3.4)];
    const wsClock = wallClock(0.16);
    { const h = R.onWall('front', 0.2, 2.25, 0.0); R.group.remove(h); group.add(h); h.add(wsClock); }

    // ---------- dynamic ----------
    const dyn = new THREE.Group(); group.add(dyn);
    // tools on the wall
    const toolSpots = {
      hammer: [-1.35, 0.3], screwdriver: [-0.85, 0.3], wrench: [-0.4, 0.3], adjwrench: [0.05, 0.3],
      saw: [0.6, 0.3], tape: [1.2, 0.35],
      pliers: [-1.25, -0.35], drill: [-0.6, -0.35], caulk: [0.2, -0.35],
    };
    const toolWall = {};
    const twWorld = new THREE.Object3D();
    twWorld.position.set(-2.2, 1.6, -4 + 0.06);
    for (const [id, [x, y]] of Object.entries(toolSpots)) {
      const it = makeItem(id);
      it.rotation.set(Math.PI / 2, 0, 0);         // handle down, head up
      if (id === 'drill' || id === 'tape' || id === 'caulk') it.rotation.set(0, Math.PI / 2, 0);
      it.position.set(twWorld.position.x + x, twWorld.position.y + y + (id === 'drill' || id === 'tape' || id === 'caulk' ? 0 : -0.15), twWorld.position.z + 0.05);
      it.scale.setScalar(1.25);
      dyn.add(it);
      it.userData.home = { pos: it.position.clone(), rot: it.rotation.clone(), scale: it.scale.clone() };
      toolWall[id] = it;
      const lbl = signMesh(ITEMS[id].th, 0.32, 0.07, { bg: '#ffffff', fg: '#1d2733', size: 46, radius: 12 });
      lbl.position.set(twWorld.position.x + x, twWorld.position.y + y - 0.3, twWorld.position.z + 0.02);
      dyn.add(lbl);
    }
    // materials on the rack (world positions computed from the rack transform)
    const matSpots = { wood: [-0.2, 0.89], pvc: [0.55, 0.91], nails: [-0.4, 0.4], screws: [0.0, 0.4], bulb: [0.4, 0.38], washer: [-0.35, 1.39], teflon: [0.1, 1.42] };
    const materials = {};
    for (const [id, [x, y]] of Object.entries(matSpots)) {
      const it = makeItem(id);
      it.position.set(4.55 - 0.02, y, -2.6 + x);
      it.rotation.y = id === 'wood' || id === 'pvc' ? 0 : Math.PI / 2;
      if (id === 'bulb') it.rotation.x = Math.PI / 2;
      dyn.add(it);
      it.userData.home = { pos: it.position.clone(), rot: it.rotation.clone(), scale: it.scale.clone() };
      materials[id] = it;
      const lbl = signMesh(ITEMS[id].th, 0.3, 0.065, { bg: '#ffffff', fg: '#1d2733', size: 44, radius: 12 });
      const shelfY = y < 0.6 ? 0.35 : y < 1.1 ? 0.85 : 1.35;
      lbl.position.set(4.28, shelfY - 0.03, -2.6 + x + (id === 'wood' || id === 'pvc' ? -0.25 : 0));
      lbl.rotation.y = -Math.PI / 2;
      dyn.add(lbl);
    }
    // PPE items
    const ppe = {};
    for (const [id, x] of [['helmet', -0.45], ['gloves', 0.0], ['goggles', 0.45]]) {
      const it = makeItem(id);
      it.position.set(4.6, id === 'helmet' ? 0.95 : 0.97, -0.4 - x);
      it.rotation.y = -Math.PI / 2;
      if (id === 'gloves') it.rotation.y = 0;
      dyn.add(it);
      it.userData.home = { pos: it.position.clone(), rot: it.rotation.clone(), scale: it.scale.clone() };
      ppe[id] = it;
    }
    // tool bag on the centre bench
    const bag = toolBag(); bag.position.set(0.7, 0.895, -0.55); dyn.add(bag);
    const bagLabel = signMesh('กระเป๋าช่าง', 0.42, 0.1, { bg: '#16306b', size: 54 });
    bagLabel.position.set(0.7, 1.32, -0.55); dyn.add(bagLabel);
    bag.userData.label = bagLabel;
    // door to the classroom
    const door = doorAt(R, 'back', -2.9, 'ไปห้องเรียน ม.2/1', '#d99a0b');
    R.group.remove(door); dyn.add(door);
    // friend Phum (level 3), drill + goggles
    const actorFriend = hasActor('friend-idle');
    const friend = actorFriend
      ? new Actor({ height: 1.5, poses: posesOf({ idle: 'friend-idle', talk: 'friend-happy', wave: 'friend-happy', drill: 'friend-drill', drillSafe: 'friend-drill-safe' }) })
      : makeCharacter({ shirt: '#ffffff', lower: '#1d3060', overalls: '#1d3060', hair: '#2a1a10', gloves: '#1c2533', scale: 0.98 });
    friend.root.position.set(-2.4, 0, 2.25);
    dyn.add(friend.root);
    // goggles: a real mesh on the drawn character; on the sprite Phum it only picks the pose
    const fg = actorFriend ? new THREE.Object3D() : makeItem('goggles');
    if (!actorFriend) {
      const fd = makeItem('drill'); fd.scale.setScalar(1.1);
      friend.arms[1].userData.hand.add(fd); fd.rotation.set(-1.4, 0, 0); fd.position.set(0, -0.02, -0.03);
      fg.position.set(0, 0.08, -0.19); fg.scale.setScalar(1.15);
      friend.head.add(fg);
    }
    fg.visible = true;
    // hazards: cord in puddle, saw on bench edge
    const hazards = {};
    const cord = new THREE.Group(); cord.position.set(0.6, 0, 2.0); dyn.add(cord);
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), new THREE.MeshStandardMaterial({ color: '#7fc4ff', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.7 }));
    puddle.rotation.x = -Math.PI / 2; puddle.position.y = 0.004; puddle.scale.set(1.3, 0.8, 1); cord.add(puddle);
    const cordMat = mat('#f2b705', { rough: 0.6 });
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.9, 0.015, -0.4), new THREE.Vector3(-0.3, 0.015, 0.1), new THREE.Vector3(0.2, 0.015, -0.1), new THREE.Vector3(0.9, 0.015, 0.3), new THREE.Vector3(2.0, 0.015, 0.9)]);
    const cordMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.012, 6, false), cordMat); cord.add(cordMesh);
    const plugBox = box(0.16, 0.06, 0.1, mat('#e9e9e9'), 0.0, 0.03, 0.0, cord);
    const plug = box(0.06, 0.04, 0.05, M.black(), -0.1, 0.03, 0.0, cord);
    hazards.cord = cord; cord.userData.puddle = puddle; cord.userData.plug = plug;
    const hzSaw = makeItem('saw'); hzSaw.position.set(-1.55, 0.92, 1.45); hzSaw.rotation.set(0, -Math.PI / 2 - 0.3, Math.PI / 2); dyn.add(hzSaw);
    hzSaw.userData.home = { pos: hzSaw.position.clone(), rot: hzSaw.rotation.clone(), scale: hzSaw.scale.clone() };
    hazards.saw = hzSaw;
    hazards.goggles = friend.root;
    // shelf assembly parts (level 3) on the centre bench
    const shelf = new THREE.Group(); shelf.position.set(-0.35, 0.895, -0.6); dyn.add(shelf);
    const plank = box(0.9, 0.025, 0.28, M.wood(), 0, 0.013, 0, shelf);
    const cutMark = box(0.004, 0.027, 0.28, mat('#d0343a'), 0.15, 0.014, 0, shelf); cutMark.visible = false;
    const offcut = box(0.3, 0.025, 0.28, M.wood(), 0.6, 0.013, 0, shelf); offcut.visible = false;
    const sideL = box(0.025, 0.4, 0.28, M.wood(), -0.3, 0.2, 0, shelf); sideL.visible = false;
    const sideR = box(0.025, 0.4, 0.28, M.wood(), 0.3, 0.2, 0, shelf); sideR.visible = false;
    const books = new THREE.Group(); shelf.add(books); books.visible = false;
    ['#c0392b', '#2e86c1', '#f1c40f', '#27ae60', '#8e44ad'].forEach((c, i) => box(0.05, 0.22, 0.2, mat(c), -0.22 + i * 0.06, 0.53, 0, books));
    const screwPts = [new THREE.Vector3(-0.3, 0.42, 0), new THREE.Vector3(0.3, 0.42, 0)].map((p) => {
      const o = new THREE.Group(); o.position.copy(p); shelf.add(o);
      cyl(0.012, 0.012, 0.01, M.steel(), 0, 0, 0, o, 12).rotation.z = Math.PI / 2;
      o.visible = false; return o;
    });

    wsBeams.forEach((b) => dyn.add(b));
    shadowify(dyn);
    wsFans.forEach(noCast);
    const api = {
      group, R, toolWall, fans: wsFans, materials, ppe, bag, door, friend, friendGoggles: fg, hazards,
      shelf: { root: shelf, plank, cutMark, offcut, sideL, sideR, books, screwPts },
      bounds: { minX: -4.5, maxX: 4.2, minZ: -3.0, maxZ: 3.6 },
      stations: {
        start: { pos: new THREE.Vector3(0, 0, 2.6), yaw: 0, pitch: -0.05 },
        board: { pos: new THREE.Vector3(2.2, 0, -2.5), yaw: 0, pitch: 0.04 },
        wall: { pos: new THREE.Vector3(-2.2, 0, -2.3), yaw: 0, pitch: 0.0 },
        bench: { pos: new THREE.Vector3(0.1, 0, 0.85), yaw: 0, pitch: -0.38 },
        rack: { pos: new THREE.Vector3(3.2, 0, -2.6), yaw: -Math.PI / 2, pitch: -0.25 },
        ppe: { pos: new THREE.Vector3(3.4, 0, -0.4), yaw: -Math.PI / 2, pitch: -0.3 },
        door: { pos: new THREE.Vector3(2.9, 0, 1.9), yaw: Math.PI, pitch: 0.05 },
        hazard: { pos: new THREE.Vector3(-0.3, 0, 0.05), yaw: Math.PI - 0.12, pitch: -0.25 },
        shelf: { pos: new THREE.Vector3(-0.35, 0, 0.35), yaw: 0, pitch: -0.45 },
      },
      lighting: { hemi: 1.05, sun: 2.6 },
      friendBusy: false,
      _t: 0,
      reset() {
        for (const it of [...Object.values(toolWall), ...Object.values(materials), ...Object.values(ppe), hzSaw]) {
          const h = it.userData.home;
          if (it.parent !== dyn) dyn.add(it);
          it.position.copy(h.pos); it.rotation.copy(h.rot); it.scale.copy(h.scale); it.visible = true;
        }
        fg.visible = true;            // safe by default; mission 3 takes them off for Spot the Hazard
        cord.visible = true; puddle.visible = true; plug.position.set(-0.1, 0.03, 0);
        plank.visible = true; plank.scale.x = 1; plank.position.set(0, 0.013, 0);
        cutMark.visible = false; offcut.visible = false; sideL.visible = false; sideR.visible = false; books.visible = false;
        screwPts.forEach((p) => { p.visible = false; });
        friend.root.position.set(-2.4, 0, 2.25); friend.root.rotation.y = 0;
        this.friendBusy = false;
      },
      update(dt, cam) {
        this._t += dt;
        if (actorFriend) {
          friend.mood = this.friendBusy ? (fg.visible ? 'drillSafe' : 'drill') : 'idle';
          friend.holdMood = this.friendBusy;
          friend.lookAt(cam);
          friend.update(dt);
        } else {
          friend.update(dt);
          if (this.friendBusy) friend.arms[1].rotation.x = 1.2 + Math.sin(this._t * 30) * 0.03;
          else friend.lookAt(cam);
        }
        puddle.material.opacity = 0.6 + Math.sin(this._t * 2) * 0.08;
        wsBeams.forEach((b) => b.userData.update(dt));
        wsFans.forEach((f, i) => { f.userData.rotor.rotation.y -= dt * (5.5 + i * 0.6); });
        wsClock.userData.update();
      },
    };
    return api;
  }

  // ===================================================== ห้องเรียน ม.2/1
  _classroom() {
    const group = new THREE.Group();
    const st = new THREE.Group(); group.add(st);
    const R = room(st, {
      w: 8, d: 7, h: 3,
      floor: surface('floor-tile-beige', { rough: 0.32, bs: 1.0, mirror: false, fallback: () => mat('#ffffff', { map: checkerTex('#e8dcc4', '#d9c9aa', [1, 1]), rough: 0.8 }) }),
      wall: surface('wall-plaster', { tint: '#fff3d9', rough: 0.92, bs: 0.6, fallback: () => mat('#ffffff', { map: wallTex('#fdf2d8', [0.53, 0.33]), rough: 0.95 }) }),
    });
    const crWin = [windowAt(R, 'left', -1.4, 1.7, 1.8, 1.3, '#f2a6b4'), windowAt(R, 'left', 1.6, 1.7, 1.8, 1.3, '#f2a6b4')].map(windowCorners);
    const wbTex = (() => {
      const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
      const g = c.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 1024, 512);
      g.fillStyle = '#1d4fa0'; g.font = `800 120px ${FONT}`; g.textAlign = 'center'; g.fillText('ม.2/1', 512, 190);
      g.fillStyle = '#c0392b'; g.font = `600 56px ${FONT}`; g.fillText('วันนี้: ช่วยกันดูแลห้องเรียน', 512, 320);
      g.fillStyle = '#2e7d32'; g.font = `500 44px ${FONT}`; g.fillText('เวรประจำวัน: ช่างน้อย', 512, 410);
      return toTex(c, { aniso: 16 });
    })();
    const wb = whiteboard(2.8, 1.3, wbTex);
    const wbh = R.onWall('front', 0, 1.6, 0.03); wbh.add(wb); wb.rotation.y = Math.PI;
    const td = teacherDesk(); td.position.set(-2.4, 0, -2.4); td.scale.setScalar(0.9); st.add(td);
    const deskPos = [];
    for (const z of [-0.4, 0.9, 2.2]) for (const x of [-2.4, -0.8, 0.8, 2.4]) deskPos.push([x, z]);
    for (const [x, z] of deskPos) {
      const d = schoolDesk(); d.position.set(x, 0, z); st.add(d);
      const c = schoolChair(); c.group.position.set(x, 0, z + 0.5); st.add(c.group);
    }
    const sg = signMesh('ห้อง ม.2/1', 0.9, 0.22, { bg: '#d99a0b', size: 60 });
    R.onWall('back', -2.4, 2.45, 0.02).add(sg);
    const pl = plant(); pl.position.set(3.5, 0, -3.0); st.add(pl);
    const bs = bookshelf(1.2, 1.2, 0.32, 2); bs.position.set(3.75, 0, -1.2); bs.rotation.y = -Math.PI / 2; st.add(bs);
    bakeStatic(st);

    const dyn = new THREE.Group(); group.add(dyn);
    const crBeams = crWin.map((c) => sunbeam(c, SUNS.classroom.dir, 3.6, { strength: 0.2 }));
    crBeams.forEach((b) => dyn.add(b));
    const crFans = [ceilingFan(dyn, -0.4, 0.2, 3), ceilingFan(dyn, 0.2, 2.3, 3)];
    const crClock = wallClock(0.17);
    { const h = R.onWall('front', 0, 2.62, 0.0); R.group.remove(h); dyn.add(h); h.add(crClock); }
    // dynamic ceiling panels (re-created so their emissive can change)
    // the room's lights share one circuit with the broken pendant: dark until the repair
    const lampMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fffbe8', emissiveIntensity: 0, roughness: 0.5 });
    const lamps = [];
    for (const [x, z] of [[-2, -1.2], [2, 0.6], [-2, 2.2], [2, 2.4]]) lamps.push(ceilingPanel(dyn, x, z, 3, lampMat));
    // the broken ceiling bulb (pendant)
    const lamp = new THREE.Group(); lamp.position.set(1.2, 3, -1.9); dyn.add(lamp);
    cyl(0.12, 0.12, 0.04, M.white(), 0, -0.02, 0, lamp, 20);
    cyl(0.006, 0.006, 0.18, M.black(), 0, -0.12, 0, lamp, 6);
    const socket = cyl(0.025, 0.025, 0.06, mat('#e9e9e9'), 0, -0.24, 0, lamp, 12);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.14, 20, 1, true), mat('#ffffff', { rough: 0.5, side: THREE.DoubleSide }));
    shade.position.y = -0.27; lamp.add(shade);
    const oldBulb = makeItem('bulb'); oldBulb.rotation.x = -Math.PI / 2; oldBulb.position.y = -0.27; lamp.add(oldBulb);
    oldBulb.userData.glass.color.set('#9a9a8a'); oldBulb.userData.glass.opacity = 0.9;
    const newBulb = makeItem('bulb'); newBulb.rotation.x = -Math.PI / 2; newBulb.position.y = -0.27; newBulb.visible = false; lamp.add(newBulb);
    // wobbly chair
    const wob = schoolChair({ bolts: true });
    wob.group.position.set(-0.9, 0, -2.3); wob.group.rotation.y = Math.PI + 0.35;
    dyn.add(wob.group);
    // light switch near the door
    const sw = lightSwitch();
    const swh = R.onWall('right', 1.6, 1.3, 0.01); R.group.remove(swh); dyn.add(swh); swh.add(sw.group);
    sw.group.rotation.y = Math.PI;   // the switch model faces -Z; flip into the room
    const swl = signMesh('สวิตช์ไฟ', 0.3, 0.08, { bg: '#ffffff', fg: '#1d2733', size: 44, radius: 10 });
    swl.position.set(0, 0.14, 0.01); swh.add(swl);
    const door = doorAt(R, 'right', 2.6, 'ทางออก', '#2f6fc4');
    R.group.remove(door); dyn.add(door);
    // ladder
    const lad = ladder(); lad.position.set(3.4, 0, 0.2); lad.rotation.y = -Math.PI / 2; dyn.add(lad);
    // classmate น้องฝน waits by the broken chair (sprite only — there is no drawn 3D version of her)
    const fon = hasActor('girl-idle')
      ? new Actor({ height: 1.45, poses: posesOf({ idle: 'girl-idle', talk: 'girl-worried', worried: 'girl-worried', wave: 'girl-happy', happy: 'girl-happy' }) })
      : null;
    if (fon) { fon.root.position.set(-1.55, 0, -1.7); fon.mood = 'worried'; dyn.add(fon.root); }
    lad.userData.home = { pos: lad.position.clone(), rot: lad.rotation.clone() };

    shadowify(dyn);
    crFans.forEach(noCast);
    const api = {
      fans: crFans,
      group, R, chair: wob, lamp, socket, oldBulb, newBulb, switch: sw, switchHolder: swh, ladder: lad, lamps, door, fon,
      bounds: { minX: -3.6, maxX: 3.6, minZ: -3.0, maxZ: 3.2 },
      stations: {
        start: { pos: new THREE.Vector3(0.3, 0, 2.9), yaw: 0.15, pitch: -0.05 },
        chair: { pos: new THREE.Vector3(-0.5, 0, -1.25), yaw: 0.35, pitch: -0.62 },
        switch: { pos: new THREE.Vector3(3.25, 0, 1.6), yaw: -Math.PI / 2, pitch: -0.1 },
        lampFloor: { pos: new THREE.Vector3(1.2, 0, -0.6), yaw: 0, pitch: 0.4 },
        ladder: { pos: new THREE.Vector3(1.2, 0.62, -1.25), yaw: 0, pitch: 0.75 },
      },
      lit: false, wobble: true, switchOn: true,
      lighting: { hemi: 0.3, sun: 1.1 },
      _t: 0,
      setLit(on) {
        this.lit = on;
        lampMat.emissiveIntensity = on ? 1.3 : 0.0;
        newBulb.userData.glass.emissiveIntensity = on && newBulb.visible ? 2.4 : 0.05;
        this.lighting = on ? { hemi: 1.05, sun: 2.6 } : { hemi: 0.3, sun: 1.1 };
      },
      setSwitch(on) {
        this.switchOn = on;
        sw.toggle.rotation.x = on ? -0.35 : 0.35;
      },
      reset() {
        oldBulb.visible = true; newBulb.visible = false;
        oldBulb.position.set(0, -0.27, 0); oldBulb.rotation.set(-Math.PI / 2, 0, 0);
        if (oldBulb.parent !== lamp) lamp.add(oldBulb);
        lad.position.copy(lad.userData.home.pos); lad.rotation.copy(lad.userData.home.rot);
        for (const b of wob.bolts) { b.userData.tight = false; b.rotation.set(0, 0, 0); b.children.forEach((c) => c.material?.emissive?.setHex?.(0)); }
        this.wobble = true;
        this.setSwitch(true);
        this.setLit(false);
        if (fon) { fon.mood = 'worried'; fon.holdMood = false; }
      },
      update(dt, cam) {
        this._t += dt;
        if (fon) { if (cam) fon.lookAt(cam); fon.update(dt); }
        wob.group.rotation.z = this.wobble ? Math.sin(this._t * 7) * 0.035 : 0;
        wob.group.rotation.x = this.wobble ? Math.cos(this._t * 5) * 0.02 : 0;
        crBeams.forEach((b) => b.userData.update(dt));
        crFans.forEach((f, i) => { f.userData.rotor.rotation.y -= dt * (6 + i * 0.7); });
        crClock.userData.update();
      },
    };
    api.setSwitch(true);
    return api;
  }

  // ===================================================== ห้องน้ำ
  _restroom() {
    const group = new THREE.Group();
    const st = new THREE.Group(); group.add(st);
    const R = room(st, {
      w: 5, d: 4.6, h: 3,
      floor: surface('floor-tile-blue', { rough: 0.35, bs: 1.5, mirror: false, fallback: () => mat('#ffffff', { map: tileTex('#9cc7e6', '#7aa6c8', 4, [1, 1.09]), rough: 0.22, bump: tileTex('#9cc7e6', '#7aa6c8', 4, [1, 1.09]), bs: 2.5 }) }),
      wall: surface('wall-tile-white', { rough: 0.12, bs: 1.5, mirror: false, fallback: () => mat('#ffffff', { map: tileTex('#f6f7f8', '#d3d8dc', 4, [1, 1]), rough: 0.16, bump: tileTex('#f6f7f8', '#d3d8dc', 4, [1, 1]), bs: 2.5 }) }),
      base: '#7aa6c8',
    });
    const rrWin = [windowAt(R, 'left', 0.2, 2.1, 1.0, 0.6)].map(windowCorners);
    const sg = signMesh('ห้องน้ำ / อ่างล้างมือ', 1.2, 0.26, { bg: '#2f9fd0', size: 56 });
    R.onWall('back', 0, 2.5, 0.02).add(sg);
    // counter + basins
    const counter = new THREE.Group(); counter.position.set(0, 0, -2.05); st.add(counter);
    rbox(3.6, 0.06, 0.5, mat('#e9eef2', { rough: 0.3 }), 0, 0.85, 0, counter, 0.015);
    for (const x of [-1.75, 1.75]) box(0.06, 0.82, 0.46, mat('#cfd8de'), x, 0.41, 0, counter);
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.9), new THREE.MeshStandardMaterial({ color: '#eef3f6', roughness: 0.04, metalness: 1.0 }));   // real mirror: reflects the environment map
    mirror.position.set(0, 1.65, -2.27);   // 2 cm proud of its frame (coplanar faces z-fight)
    box(3.3, 1.0, 0.02, mat('#b0bcc4', { metal: 0.6, rough: 0.3 }), 0, 1.65, -2.3, st);
    // drain pipes under the basins
    for (const x of [-1.2, 0, 1.2]) cyl(0.025, 0.025, 0.4, mat('#e9eef2'), x, 0.62, -2.1, st, 10);
    // wall water pipe feeding the valves
    box(3.4, 0.04, 0.04, M.steel(), 0, 0.45, -2.27, st);
    const pl = plant(); pl.position.set(2.1, 0, 1.6); pl.scale.setScalar(0.8); st.add(pl);
    for (const z of [-0.6, 1.0]) ceilingPanel(st, 0, z, 3);
    bakeStatic(st);

    const dyn = new THREE.Group(); group.add(dyn);
    dyn.add(mirror);   // kept out of the merge: it gets its own reflection of this room (captureMirror)
    const rrBeams = rrWin.map((c) => sunbeam(c, SUNS.restroom.dir, 2.6, { motes: 50, strength: 0.13 }));
    rrBeams.forEach((b) => dyn.add(b));
    const basins = [];
    const faucets = [];
    for (const x of [-1.2, 0, 1.2]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.12, 24, 1, true), mat('#ffffff', { rough: 0.2, side: THREE.DoubleSide }));
      b.position.set(x, 0.94, -2.0); dyn.add(b); basins.push(b);
      cyl(0.15, 0.15, 0.01, mat('#ffffff', { rough: 0.2 }), x, 0.885, -2.0, dyn, 24);
      const f = new THREE.Group(); f.position.set(x, 0.88, -2.24); dyn.add(f);
      cyl(0.025, 0.03, 0.18, M.steel(), 0, 0.09, 0, f, 14);
      const spout = cyl(0.016, 0.016, 0.18, M.steel(), 0, 0.17, 0.08, f, 12); spout.rotation.x = Math.PI / 2;
      const nozzle = cyl(0.018, 0.014, 0.04, M.steel(), 0, 0.15, 0.17, f, 12);
      const head = new THREE.Group(); head.position.set(0, 0.2, 0); f.add(head);
      cyl(0.03, 0.03, 0.04, M.steel(), 0, 0, 0, head, 6);   // hex nut (faucet head)
      const handle = box(0.12, 0.02, 0.02, mat('#d0343a', { rough: 0.4 }), 0, 0.035, 0, head);
      f.userData = { head, handle, nozzle };
      faucets.push(f);
    }
    const leaky = faucets[1];
    // angle stop valve under the middle basin
    const valve = new THREE.Group(); valve.position.set(0.25, 0.6, -2.05); dyn.add(valve);
    cyl(0.012, 0.012, 0.16, M.steel(), 0, -0.08, -0.12, valve, 8);
    cyl(0.02, 0.02, 0.12, M.steel(), 0, 0, 0, valve, 10).rotation.x = Math.PI / 2;
    const vHandle = new THREE.Group(); vHandle.position.set(0, 0, 0.08); valve.add(vHandle);
    const vk = cyl(0.04, 0.04, 0.02, mat('#2f6fc4', { rough: 0.4 }), 0, 0, 0, vHandle, 6); vk.rotation.x = Math.PI / 2;
    const vlbl = signMesh('วาล์วน้ำ', 0.24, 0.07, { bg: '#2f6fc4', size: 46, radius: 10 });
    vlbl.position.set(0.0, 0.13, 0.05); valve.add(vlbl);
    // drips + spray particles
    const dripMat = new THREE.MeshStandardMaterial({ color: '#8fd3ff', roughness: 0.05, transparent: true, opacity: 0.85 });
    const drops = [];
    for (let i = 0; i < 3; i++) { const d = sph(0.008, dripMat, 0, 0, 0, dyn, 8); d.scale.y = 1.5; drops.push({ m: d, t: i * 0.45 }); }
    const sprayGroup = new THREE.Group(); dyn.add(sprayGroup);
    const sprays = [];
    for (let i = 0; i < 40; i++) { const d = sph(0.01, dripMat, 0, 0, 0, sprayGroup, 6); d.visible = false; sprays.push({ m: d, v: new THREE.Vector3(), life: 0 }); }
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.12, 20), new THREE.MeshStandardMaterial({ color: '#8fd3ff', roughness: 0.05, transparent: true, opacity: 0.6 }));
    puddle.rotation.x = -Math.PI / 2; puddle.position.set(0.25, 0.884, -1.88); dyn.add(puddle);
    const oldWasher = makeItem('washer'); oldWasher.visible = false; dyn.add(oldWasher);

    const nozzleWorld = new THREE.Vector3();
    shadowify(dyn);
    const api = {
      group, R, faucet: leaky, faucets, valve, valveHandle: vHandle, oldWasher, puddle,
      bounds: { minX: -2.2, maxX: 2.2, minZ: -1.3, maxZ: 2.0 },
      stations: {
        start: { pos: new THREE.Vector3(0, 0, 1.3), yaw: 0, pitch: -0.15 },
        sink: { pos: new THREE.Vector3(0.05, 0, -1.1), yaw: 0, pitch: -0.5 },
        valve: { pos: new THREE.Vector3(0.25, 0, -0.75), yaw: 0, pitch: -0.62 },
      },
      lighting: { hemi: 1.05, sun: 2.2 },
      leaking: true, valveOpen: true, flowing: false, _t: 0, _sprayT: 0, _dripSnd: 0,
      onDrip: null,
      reset() {
        this.leaking = true; this.valveOpen = true; this.flowing = false; this._sprayT = 0;
        for (const o of [...dyn.children]) if (o.userData.temp) dyn.remove(o);
        if (leaky.userData.head.parent !== leaky) leaky.add(leaky.userData.head);
        vHandle.rotation.z = 0;
        leaky.userData.head.position.set(0, 0.2, 0); leaky.userData.head.rotation.set(0, 0, 0); leaky.userData.head.visible = true;
        oldWasher.visible = false; puddle.visible = true;
        sprays.forEach((s) => { s.m.visible = false; s.life = 0; });
      },
      /** One-time snapshot of this room into the mirror (a cube camera at the glass) — a real reflection, no per-frame cost. */
      captureMirror(renderer, scene) {
        if (this._mirrorDone) return;
        this._mirrorDone = true;
        const rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
        const cam = new THREE.CubeCamera(0.05, 20, rt);
        cam.position.set(0, 1.55, -2.1);
        mirror.visible = false;
        rrBeams.forEach((b) => { b.visible = false; });   // additive motes would freeze into the glass as specks
        scene.add(cam);
        cam.update(renderer, scene);
        scene.remove(cam);
        mirror.visible = true;
        rrBeams.forEach((b) => { b.visible = true; });
        mirror.material.envMap = rt.texture;
        mirror.material.envMapIntensity = 1.0;
        mirror.material.needsUpdate = true;
      },
      setValve(open) { this.valveOpen = open; vHandle.rotation.z = open ? 0 : Math.PI / 2; },
      spray(sec = 1.5) {
        this._sprayT = sec;
      },
      update(dt) {
        this._t += dt;
        rrBeams.forEach((b) => b.userData.update(dt));
        leaky.userData.nozzle.getWorldPosition(nozzleWorld);
        const dripping = this.leaking && this.valveOpen && leaky.userData.head.visible;
        for (const d of drops) {
          d.t += dt;
          const cycle = this.flowing ? 0.25 : 1.35;
          if (d.t > cycle) { d.t = 0; if (dripping && !this.flowing && this.onDrip) this.onDrip(nozzleWorld); }
          const fall = d.t / 0.35;
          d.m.visible = (dripping || this.flowing) && fall <= 1;
          d.m.position.set(nozzleWorld.x, nozzleWorld.y - 0.02 - Math.min(1, fall) * 0.12, nozzleWorld.z);
        }
        // water spraying out of an opened faucet
        if (this._sprayT > 0) {
          this._sprayT -= dt;
          for (const s of sprays) {
            if (s.life <= 0) {
              s.life = 0.4 + Math.random() * 0.4;
              s.m.position.set(leaky.position.x, leaky.position.y + 0.2, leaky.position.z);
              s.v.set((Math.random() - 0.5) * 1.6, 1.2 + Math.random() * 1.2, 0.6 + Math.random() * 1.2);
            }
          }
        }
        for (const s of sprays) {
          if (s.life > 0) {
            s.life -= dt;
            s.v.y -= 9.8 * dt;
            s.m.position.addScaledVector(s.v, dt);
            s.m.visible = s.life > 0;
          }
        }
      },
    };
    return api;
  }
}
