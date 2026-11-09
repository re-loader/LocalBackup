import * as THREE from 'three';
import { woodTex, photo } from './textures.js';
import { blobShadow } from './look.js';
import { buildTool, hasTool3d } from './tools3d.js';
import { buildProp, hasProp3d } from './props3d.js';

// โมเดลทั้งหมดสร้างจากรูปทรงพื้นฐาน — เครื่องมือ วัสดุ PPE เฟอร์นิเจอร์ และตัวละคร
// เครื่องมือทุกชิ้นวางด้ามที่จุดกำเนิด และชี้ไปทาง -Z (ไปข้างหน้าจากมือ)

const mats = new Map();
export function mat(color, { rough = 0.7, metal = 0, emissive = null, ei = 1, map = null, transparent = false, opacity = 1, side = THREE.FrontSide, bump = null, bs = 1 } = {}) {
  // painted metal (desk frames, cabinets, tool chest…) gets the photographed powder-coat when it exists
  if (!map && metal >= 0.2 && metal < 0.85) { const p = photo('steel-painted', { repeat: [1, 1] }); if (p) { map = p; bump = p; bs = 0.35; } }
  const key = [color, rough, metal, emissive, ei, map?.uuid, transparent, opacity, side, bump?.uuid, bs].join('|');
  if (!mats.has(key)) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, map, transparent, opacity, side });
    if (bump) { m.bumpMap = bump; m.bumpScale = bs; }
    if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = ei; }
    mats.set(key, m);
  }
  return mats.get(key);
}
// photographed wood/steel when generated (tools/gen-textures.py), drawn canvas otherwise
const ph = (name, repeat = [1, 1]) => photo(name, { repeat });
export const M = {
  steel: () => { const p = ph('brushed-steel', [0.4, 0.4]); return mat('#d4dbe2', { rough: 0.3, metal: 0.92, map: p, bump: p, bs: 0.15 }); },
  dark: () => mat('#2b3138', { rough: 0.6, metal: 0.3 }),
  black: () => mat('#16191d', { rough: 0.8 }),
  white: () => mat('#f4f4f2', { rough: 0.6 }),
  wood: () => { const p = ph('wood-light'); return p ? mat('#ffffff', { rough: 0.55, map: p, bump: p, bs: 0.5 }) : mat('#ffffff', { rough: 0.75, map: woodTex('#c8935a', 1) }); },
  woodDark: () => { const p = ph('wood-light'); return p ? mat('#9a6740', { rough: 0.55, map: p, bump: p, bs: 0.5 }) : mat('#ffffff', { rough: 0.75, map: woodTex('#8a5a33', 1) }); },
  bench: () => { const p = ph('bench-top'); return p ? mat('#ffffff', { rough: 0.85, map: p, bump: p, bs: 1.2 }) : mat('#ffffff', { map: woodTex('#b98352', 6), rough: 0.8 }); },
};

/** Box with rounded edges (three.js RoundedBoxGeometry algorithm) — real furniture never has razor edges. */
export class RoundedBoxGeometry extends THREE.BoxGeometry {
  constructor(width = 1, height = 1, depth = 1, segments = 1, radius = 0.01) {
    const seg = segments * 2 + 1;
    radius = Math.min(width / 2, height / 2, depth / 2, radius);
    super(1, 1, 1, seg, seg, seg);
    const pos = this.attributes.position, nor = this.attributes.normal;
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    const inner = new THREE.Vector3(width, height, depth).divideScalar(2).subScalar(radius);
    const half = 0.5 / seg;
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      n.set(p.x - Math.sign(p.x) * half, p.y - Math.sign(p.y) * half, p.z - Math.sign(p.z) * half).normalize();
      pos.setXYZ(i, inner.x * Math.sign(p.x) + n.x * radius, inner.y * Math.sign(p.y) + n.y * radius, inner.z * Math.sign(p.z) + n.z * radius);
      nor.setXYZ(i, n.x, n.y, n.z);
    }
  }
}
export function rbox(w, h, d, material, x = 0, y = 0, z = 0, parent = null, r = 0.008) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 1, r), material);
  m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
}

export function box(w, h, d, material, x = 0, y = 0, z = 0, parent = null) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
}
export function cyl(rt, rb, h, material, x = 0, y = 0, z = 0, parent = null, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
}
export function sph(r, material, x = 0, y = 0, z = 0, parent = null, seg = 16) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg * 0.75 | 0)), material);
  m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
}
/** Builds a tool / material / PPE model. Returns a Group (handle at origin, pointing -Z). */
export function makeItem(id, opts = {}) {
  if (hasTool3d(id)) return buildTool(id);           // realistic tools (src/tools3d.js)
  if (hasProp3d(id)) return buildProp(id, opts);     // realistic materials and PPE (src/props3d.js)
  const g = new THREE.Group();                       // unknown id: a grey placeholder cube
  g.name = id;
  box(0.06, 0.06, 0.06, mat('#888'), 0, 0, 0, g);
  g.userData.itemId = id;
  return g;
}

// ======================================================================
// เฟอร์นิเจอร์ — แบบสมจริงอยู่ใน src/props3d.js (ขนาด จุดกำเนิด และ API เดิม)
// ======================================================================
export { schoolDesk, schoolChair, teacherDesk, bookshelf, workbench, vise, toolChest, cabinet, plant, whiteboard, ladder, toolBag, lightSwitch } from './props3d.js';

// ======================================================================
// ตัวละคร (สไตล์ chibi ตามภาพออกแบบ)
// ======================================================================
export function makeCharacter({
  skin = '#f3c9a5', hair = '#3a2416', shirt = '#ffffff', lower = '#1d3060',
  overalls = null, bun = false, scale = 1, gloves = null, clipboard = false,
} = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const skinM = mat(skin, { rough: 0.8 });
  const hairM = mat(hair, { rough: 0.9 });
  const shirtM = mat(shirt, { rough: 0.8 });
  const lowerM = mat(lower, { rough: 0.8 });

  // legs
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.42, 4, 10), lowerM);
    leg.position.set(s * 0.08, 0.3, 0); body.add(leg);
    const shoe = box(0.11, 0.06, 0.18, M.black(), s * 0.08, 0.03, -0.03, body);
    shoe.geometry.translate(0, 0, 0);
  }
  // torso
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.3, 4, 14), shirtM);
  torso.position.y = 0.82; torso.scale.set(1, 1, 0.75); body.add(torso);
  if (overalls) {
    const ov = mat(overalls, { rough: 0.85 });
    const bib = box(0.22, 0.2, 0.02, ov, 0, 0.84, -0.115, body);
    bib.rotation.x = 0.06;
    const hip = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.16, 0.2, 14), ov);
    hip.position.y = 0.63; hip.scale.z = 0.78; body.add(hip);
    for (const s of [-1, 1]) box(0.035, 0.26, 0.02, ov, s * 0.08, 0.98, -0.1, body).rotation.x = 0.15;
    box(0.06, 0.06, 0.01, mat('#f2b705'), 0.06, 0.86, -0.128, body);
  } else {
    const hip = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.17, 0.2, 14), lowerM);
    hip.position.y = 0.63; hip.scale.z = 0.78; body.add(hip);
  }
  // arms (pivot at the shoulder for animation)
  const arms = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.19, 1.0, 0);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.3, 4, 8), shirtM);
    arm.position.y = -0.18; pivot.add(arm);
    const hand = sph(0.055, gloves ? mat(gloves, { rough: 0.85 }) : skinM, 0, -0.38, 0, pivot, 10);
    pivot.rotation.z = s * 0.12;
    pivot.userData.hand = hand;
    body.add(pivot);
    arms.push(pivot);
  }
  if (clipboard) {
    const cb = box(0.2, 0.27, 0.012, mat('#8a5a33'), 0, -0.36, -0.08, arms[0]);
    cb.rotation.x = -0.9;
    box(0.17, 0.22, 0.004, M.white(), 0, 0.0, -0.008, cb);
  }
  // head
  const head = new THREE.Group();
  head.position.y = 1.28;
  body.add(head);
  sph(0.11, skinM, 0, -0.12, 0, head, 10).scale.set(0.5, 0.6, 0.5); // neck
  const face = sph(0.2, skinM, 0, 0.06, 0, head, 24);
  face.scale.set(1, 0.98, 0.95);
  // hair cap + fringe
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.212, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM);
  cap.position.set(0, 0.08, 0.02); cap.rotation.x = 0.16; head.add(cap);
  for (let i = -2; i <= 2; i++) {
    const f = sph(0.055, hairM, i * 0.055, 0.2 - Math.abs(i) * 0.014, -0.15, head, 8);
    f.scale.set(1, 1.05, 0.6);
  }
  if (bun) sph(0.09, hairM, 0, 0.16, 0.19, head, 12);
  // eyes (big anime style), brows, mouth, blush
  const eyeM = mat('#2a1a12', { rough: 0.3 });
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = sph(0.034, eyeM, s * 0.075, 0.05, -0.175, head, 12);
    e.scale.set(0.85, 1.25, 0.5);
    sph(0.011, mat('#ffffff', { emissive: '#ffffff', ei: 0.6 }), s * 0.075 + 0.01, 0.07, -0.19, head, 6);
    box(0.06, 0.012, 0.01, hairM, s * 0.078, 0.12, -0.18, head).rotation.z = s * -0.12;
    const blush = sph(0.025, mat('#f29b9b', { rough: 1 }), s * 0.12, -0.01, -0.165, head, 8);
    blush.scale.set(1.2, 0.6, 0.3);
    eyes.push(e);
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 6, 12, Math.PI), mat('#8a3a2a'));
  mouth.position.set(0, -0.04, -0.185); mouth.rotation.z = Math.PI; head.add(mouth);

  root.add(blobShadow(0.3, 0.32));
  root.scale.setScalar(scale);
  const state = { t: Math.random() * 10, talk: 0, wave: 0, lookYaw: 0, blink: 2 + Math.random() * 3, point: 0 };
  const api = {
    root, head, arms, eyes, mouth,
    talk(sec = 2) { state.talk = sec; },
    wave(sec = 1.6) { state.wave = sec; },
    point(sec = 2) { state.point = sec; },
    lookAt(worldPos) {
      const p = root.worldToLocal(worldPos.clone());
      state.lookYaw = Math.max(-0.9, Math.min(0.9, Math.atan2(-p.x, -p.z)));
    },
    update(dt) {
      state.t += dt;
      body.position.y = Math.sin(state.t * 2.2) * 0.006;
      head.rotation.y += (state.lookYaw - head.rotation.y) * Math.min(1, dt * 4);
      head.rotation.z = Math.sin(state.t * 1.3) * 0.03;
      // blink
      state.blink -= dt;
      const closed = state.blink < 0.12;
      for (const e of eyes) e.scale.y = closed ? 0.2 : 1.25;
      if (state.blink < 0) state.blink = 2.5 + Math.random() * 3;
      // mouth while talking
      if (state.talk > 0) { state.talk -= dt; mouth.scale.y = 0.6 + Math.abs(Math.sin(state.t * 14)) * 1.2; } else mouth.scale.y = 1;
      // right arm: wave / point, left arm idle
      const R = arms[1];
      if (state.wave > 0) {
        state.wave -= dt;
        R.rotation.z = 2.5 + Math.sin(state.t * 10) * 0.35;
        R.rotation.x = 0;
      } else if (state.point > 0) {
        state.point -= dt;
        R.rotation.z += (0.3 - R.rotation.z) * Math.min(1, dt * 6);
        R.rotation.x += (1.4 - R.rotation.x) * Math.min(1, dt * 6);
      } else {
        R.rotation.z += (0.12 + (state.talk > 0 ? Math.sin(state.t * 3) * 0.25 + 0.25 : 0) - R.rotation.z) * Math.min(1, dt * 5);
        R.rotation.x += ((state.talk > 0 ? 0.5 : 0) - R.rotation.x) * Math.min(1, dt * 5);
      }
    },
  };
  root.userData.character = api;
  return api;
}
