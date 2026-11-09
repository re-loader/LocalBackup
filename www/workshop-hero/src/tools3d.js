import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, M } from './models.js';
import { photo, toTex } from './textures.js';
import { FONT } from './strings.js';
import { ctx } from './ctx.js';

// เครื่องมือช่างแบบสมจริง: รูปทรงจากโปรไฟล์จริง (กลึง / รีดขึ้นรูปพร้อมลบมุม) วัสดุเหล็กชุบโครเมียม พลาสติก ยาง
// แกนเดียวกับของเดิม: ด้ามที่จุดกำเนิด ปลายเครื่องมือชี้ไป −Z, ด้านบน +Y
// ชิ้นแบน (ประแจ คีม ค้อน) วาดโครงร่างบนระนาบ X–S แล้วรีดหนาตามแกน Y
// ชิ้นมองด้านข้าง (สว่าน เลื่อย ตลับเมตร ปืนซิลิโคน) วาดบนระนาบ S–Y แล้วรีดกว้างตามแกน X
// s = ระยะจากด้ามไปทางปลายเครื่องมือ (เป็นบวก) → z = −s
//
// userData.parts: จุดชี้ส่วนประกอบ (ใช้ตอนหยิบขึ้นมาดู) · userData.hang: จุดแขวนบนแผงเครื่องมือ
// ชิ้นที่หมุนได้ (หัวจับดอกสว่าน) อยู่ในกลุ่มชื่อ 'spin'

const V2 = THREE.Vector2;

// ---------------------------------------------------------------- materials
const brushed = (rep) => photo('brushed-steel', { repeat: [rep, rep] });
// bare metal is only as bright as what it reflects: tool steel gets the room's environment at full strength
// (the scene-wide intensity is kept low for painted walls and furniture)
function shiny(m, k = 1.5) {
  if (!m.userData.shiny && ctx.scene?.environment) { m.envMap = ctx.scene.environment; m.envMapIntensity = k; m.userData.shiny = true; m.needsUpdate = true; }
  return m;
}
const TM = {
  chrome: () => shiny(mat('#f4f7fa', { rough: 0.12, metal: 1 }), 1.7),
  satin: () => { const p = brushed(14); return shiny(mat('#e2e6ea', { rough: 0.36, metal: 0.92, map: p, bump: p, bs: 0.04 }), 1.9); },
  forged: () => shiny(mat('#a2aab2', { rough: 0.36, metal: 0.95 }), 1.5),
  oxide: () => shiny(mat('#30353b', { rough: 0.4, metal: 0.9 }), 1.4),
  gold: () => shiny(mat('#d4a648', { rough: 0.28, metal: 1 }), 1.6),
  blade: () => { const p = brushed(9); return shiny(mat('#e9edf1', { rough: 0.42, metal: 0.85, map: p, bump: p, bs: 0.03 }), 2.1); },
  brass: () => shiny(mat('#d0aa52', { rough: 0.3, metal: 1 }), 1.5),
  plastic: (c) => mat(c, { rough: 0.36 }),
  rubber: (c = '#202326') => mat(c, { rough: 0.9 }),
  paint: (c) => mat(c, { rough: 0.42, metal: 0.5 }),   // painted steel (picks up the powder-coat photo)
};

// ---------------------------------------------------------------- geometry helpers
function add(geo, material, parent) {
  const m = new THREE.Mesh(geo, material);
  parent.add(m);
  return m;
}
const bevel = (b, seg = 2) => ({ bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: seg });

/** Flat part: outline in (x across, s toward the tip), thickness t along Y centred on y. */
function flat(shape, t, material, parent, { y = 0, b = 0.0012, curve = 12 } = {}) {
  b = Math.min(b, t * 0.45);
  const d = Math.max(1e-4, t - 2 * b);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d, curveSegments: curve, ...bevel(b) });
  geo.translate(0, 0, -d / 2);
  geo.rotateX(-Math.PI / 2);          // (x, s, z) → (x, z, −s)
  geo.translate(0, y, 0);
  return add(geo, material, parent);
}
/** Side-profile part: outline in (s toward the tip, y up), width w along X centred on x. */
function side(shape, w, material, parent, { x = 0, b = 0.002, curve = 12 } = {}) {
  b = Math.min(b, w * 0.45);
  const d = Math.max(1e-4, w - 2 * b);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d, curveSegments: curve, ...bevel(b) });
  geo.translate(0, 0, -d / 2);
  geo.rotateY(Math.PI / 2);           // (s, y, z) → (z, y, −s)
  geo.translate(x, 0, 0);
  return add(geo, material, parent);
}
function lathe(profile, seg, shape) {
  const geo = new THREE.LatheGeometry(profile.map(([h, r]) => new V2(Math.max(r, 0), h)), seg);
  if (shape) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), h = p.getY(i);
      const k = shape(Math.atan2(x, z), h);
      p.setX(i, x * k); p.setZ(i, z * k);
    }
    geo.computeVertexNormals();
  }
  return geo;
}
/** Turned part along the tool: profile [[s, r], …] with s increasing toward the tip. */
function turned(profile, material, parent, { x = 0, y = 0, seg = 24, shape = null } = {}) {
  const geo = lathe(profile, seg, shape);
  geo.rotateX(-Math.PI / 2);          // axis Y → −Z
  geo.translate(x, y, 0);
  return add(geo, material, parent);
}
/** Turned part across the tool, along +X (hammer face). */
function turnedX(profile, material, parent, { y = 0, z = 0, seg = 24 } = {}) {
  const geo = lathe(profile, seg);
  geo.rotateZ(-Math.PI / 2);          // axis Y → +X
  geo.translate(0, y, z);
  return add(geo, material, parent);
}
/** Cylinder across the tool (bolts, switches, badges). */
function rodX(r, len, material, parent, y, z, seg = 18) {
  const geo = new THREE.CylinderGeometry(r, r, len, seg);
  geo.rotateZ(Math.PI / 2);
  geo.translate(0, y, z);
  return add(geo, material, parent);
}
function rbox(w, h, d, material, parent, x, y, z, r = 0.003) {
  const geo = new RoundedBox(w, h, d, r);
  geo.translate(x, y, z);
  return add(geo, material, parent);
}
/** Small rounded box (same algorithm as models.RoundedBoxGeometry, kept local to avoid a cycle at load). */
class RoundedBox extends THREE.BoxGeometry {
  constructor(w, h, d, radius) {
    super(1, 1, 1, 3, 3, 3);
    radius = Math.min(w / 2, h / 2, d / 2, radius);
    const pos = this.attributes.position, nor = this.attributes.normal;
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    const inner = new THREE.Vector3(w, h, d).divideScalar(2).subScalar(radius);
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      n.set(p.x - Math.sign(p.x) / 6, p.y - Math.sign(p.y) / 6, p.z - Math.sign(p.z) / 6).normalize();
      pos.setXYZ(i, inner.x * Math.sign(p.x) + n.x * radius, inner.y * Math.sign(p.y) + n.y * radius, inner.z * Math.sign(p.z) + n.z * radius);
      nor.setXYZ(i, n.x, n.y, n.z);
    }
  }
}
function roundRect(x0, y0, x1, y1, r) {
  const s = new THREE.Shape();
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0); s.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x1, y1 - r); s.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2, false);
  s.lineTo(x0 + r, y1); s.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x0, y0 + r); s.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}
/** Curved strip of changing width along a 2D curve (plier handles). */
function strip(curve, w0, w1, t0 = 0, t1 = 1, n = 20) {
  const L = [], R = [];
  for (let i = 0; i <= n; i++) {
    const t = t0 + (t1 - t0) * (i / n);
    const p = curve.getPoint(t), d = curve.getTangent(t);
    const w = (w0 + (w1 - w0) * (i / n)) / 2;
    L.push(new V2(p.x - d.y * w, p.y + d.x * w));
    R.push(new V2(p.x + d.y * w, p.y - d.x * w));
  }
  return new THREE.Shape([...L, ...R.reverse()]);
}
const mirrorX = (shape) => new THREE.Shape(shape.getPoints(16).map((p) => new V2(-p.x, p.y)).reverse());

// ---------------------------------------------------------------- printed / stamped decals
const decals = new Map();
function decalMat(key, w, h, draw, { rough = 0.55, metal = 0 } = {}) {
  if (!decals.has(key)) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    decals.set(key, new THREE.MeshStandardMaterial({
      map: toTex(c, { aniso: 8 }), transparent: true, roughness: rough, metalness: metal,
      polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false,
    }));
  }
  return decals.get(key);
}
/** Decal lying on a +Y face (text runs across X, reads toward the tip). */
function decalTop(material, w, l, parent, x, y, z, rot = 0) {
  const geo = new THREE.PlaneGeometry(w, l);
  geo.rotateZ(rot); geo.rotateX(-Math.PI / 2); geo.translate(x, y, z);
  return add(geo, material, parent);
}
/** Decal on a ±X face (text runs along the tool). */
function decalSide(material, l, h, parent, x, y, z) {
  const geo = new THREE.PlaneGeometry(l, h);
  geo.rotateY(x > 0 ? Math.PI / 2 : -Math.PI / 2);
  geo.translate(x, y, z);
  return add(geo, material, parent);
}
const stamp = (text, px = 54) => decalMat(`stamp:${text}`, 256, 96, (g, W, H) => {
  g.font = `800 ${px}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillText(text, W / 2 + 2, H / 2 + 2);
  g.fillStyle = 'rgba(38,42,48,0.9)'; g.fillText(text, W / 2, H / 2);
}, { rough: 0.6, metal: 0.6 });

// ---------------------------------------------------------------- merge into one mesh per material
const zeroUV = (n) => new THREE.BufferAttribute(new Float32Array(n * 2), 2);
function bake(g) {
  const byMat = new Map();
  for (const m of [...g.children]) {
    if (!m.isMesh) continue;
    m.updateMatrix();
    const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    geo.applyMatrix4(m.matrix);
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute('uv', zeroUV(geo.attributes.position.count));
    geo.clearGroups();
    if (!byMat.has(m.material)) byMat.set(m.material, []);
    byMat.get(m.material).push(geo);
    g.remove(m); m.geometry.dispose();
  }
  for (const [material, geos] of byMat) {
    const mesh = new THREE.Mesh(mergeGeometries(geos, false), material);
    mesh.castShadow = !material.transparent; mesh.receiveShadow = true;
    g.add(mesh);
    geos.forEach((x) => x.dispose());
  }
}

// ======================================================================
const BUILD = {
  /** ค้อนหงอน 16 oz — ด้ามไม้ หน้าค้อนกลึง หงอนผ่าสองแฉก */
  hammer(g) {
    const handle = turned([[0, 0], [0.002, 0.0125], [0.008, 0.0165], [0.03, 0.0156], [0.12, 0.0136], [0.22, 0.0119], [0.27, 0.0114], [0.3, 0.0118], [0.312, 0]], M.wood(), g, { seg: 20 });
    handle.scale.y = 0.72;                                                   // oval section, long axis along the head
    rbox(0.038, 0.027, 0.044, TM.satin(), g, 0, 0, -0.3, 0.007);             // eye
    turnedX([[0.016, 0], [0.016, 0.0118], [0.03, 0.0104], [0.042, 0.0107], [0.05, 0.0128], [0.058, 0.0146], [0.0625, 0.0147], [0.0626, 0]], TM.satin(), g, { z: -0.3 });
    turnedX([[0.062, 0], [0.062, 0.0147], [0.0638, 0.0138], [0.0647, 0.009], [0.065, 0]], TM.chrome(), g, { z: -0.3 }); // polished striking face
    const claw = new THREE.Shape();
    claw.moveTo(-0.016, 0.318);
    claw.quadraticCurveTo(-0.056, 0.318, -0.078, 0.297);
    claw.quadraticCurveTo(-0.088, 0.285, -0.091, 0.268);
    claw.lineTo(-0.087, 0.266);
    claw.quadraticCurveTo(-0.075, 0.283, -0.05, 0.29);
    claw.quadraticCurveTo(-0.03, 0.293, -0.016, 0.283);
    claw.closePath();
    for (const y of [-0.0063, 0.0063]) flat(claw, 0.0085, TM.satin(), g, { y, b: 0.0016 });   // split claw
    g.userData.parts = { face: [0.066, 0, -0.3], claw: [-0.09, 0, -0.268], handle: [0, 0, -0.12] };
    g.userData.hang = [[0.024, 0, -0.27], [-0.024, 0, -0.27]];
  },

  /** ไขควงปากแฉก #2 — ด้ามพลาสติกมีร่องกันลื่น ก้านโครเมียม ปลายรมดำ */
  screwdriver(g) {
    const flutes = (a, h) => (h > 0.012 && h < 0.086 ? 1 - 0.085 * Math.pow(Math.max(0, Math.cos(a * 6)), 2) : 1);
    turned([[0, 0], [0.003, 0.011], [0.008, 0.0155], [0.02, 0.0172], [0.05, 0.0168], [0.075, 0.0158], [0.086, 0.014], [0.0862, 0]], TM.plastic('#f2b705'), g, { seg: 48, shape: flutes });
    turned([[0.085, 0], [0.085, 0.0142], [0.09, 0.012], [0.097, 0.0088], [0.1, 0.006], [0.101, 0]], TM.rubber(), g, { seg: 28 });
    turned([[0.098, 0], [0.098, 0.0032], [0.215, 0.0032], [0.2152, 0]], TM.chrome(), g, { seg: 16 });
    const cross = (a, h) => (h > 0.217 ? 0.42 + 0.58 * Math.pow(Math.abs(Math.cos(2 * a)), 3) : 1);
    turned([[0.214, 0], [0.214, 0.0033], [0.222, 0.003], [0.229, 0.0017], [0.233, 0.0004], [0.2335, 0]], TM.oxide(), g, { seg: 32, shape: cross });
    g.userData.parts = { tip: [0, 0, -0.233], shaft: [0, 0, -0.16], handle: [0, 0, -0.05] };
    g.userData.hang = [[0.014, 0, -0.105], [-0.014, 0, -0.105]];
  },

  /** ประแจปากตายสองข้าง เบอร์ 12 × 13 — เหล็กโครมวาเนเดียม ปากเอียง 15° */
  wrench(g) {
    const head = (cs, size, dir) => {
      const R = 0.0105 + size * 0.0008, hw = size / 2000, c = 0.003;
      const ut = Math.sqrt(R * R - hw * hw), a0 = Math.atan2(hw, ut);
      const p = new THREE.Path();
      p.moveTo(ut, hw);
      p.absarc(0, 0, R, a0, Math.PI * 2 - a0, false);
      p.lineTo(c, -hw);
      p.absarc(c, 0, hw, -Math.PI / 2, Math.PI / 2, true);
      p.lineTo(ut, hw);
      const phi = THREE.MathUtils.degToRad(15) * dir;
      const eu = new V2(Math.sin(phi) * dir, Math.cos(phi) * dir), ev = new V2(Math.cos(phi), -Math.sin(phi));
      return new THREE.Shape(p.getPoints(18).map((q) => new V2(eu.x * q.x + ev.x * q.y, cs + eu.y * q.x + ev.y * q.y)));
    };
    flat(head(0.205, 13, 1), 0.0074, TM.chrome(), g, { b: 0.0014 });
    flat(head(-0.004, 12, -1), 0.0072, TM.chrome(), g, { b: 0.0014 });
    const sh = new THREE.Shape();
    sh.moveTo(-0.0068, 0.008); sh.quadraticCurveTo(-0.005, 0.1, -0.0068, 0.192);
    sh.lineTo(0.0068, 0.192); sh.quadraticCurveTo(0.005, 0.1, 0.0068, 0.008); sh.closePath();
    flat(sh, 0.0056, TM.satin(), g, { b: 0.0013 });
    decalTop(stamp('13'), 0.0095, 0.0036, g, 0, 0.00285, -0.168);
    decalTop(stamp('12'), 0.0095, 0.0036, g, 0, 0.00285, -0.034, Math.PI);
    decalTop(stamp('CR-V', 46), 0.03, 0.0045, g, 0, 0.00285, -0.1, Math.PI / 2);
    g.userData.parts = { jaw13: [0.006, 0, -0.223], jaw12: [-0.006, 0, 0.017], shank: [0, 0, -0.1] };
    g.userData.hang = [[0.013, 0, -0.18], [-0.013, 0, -0.18]];
  },

  /** ประแจเลื่อน 8 นิ้ว — ปากตาย ปากเลื่อน เฟืองตัวหนอน ด้ามหุ้มยาง */
  adjwrench(g) {
    const hdl = new THREE.Shape();
    hdl.moveTo(0.012, 0.012); hdl.lineTo(0.0095, 0.15); hdl.lineTo(-0.0095, 0.15); hdl.lineTo(-0.012, 0.012);
    hdl.absarc(0, 0.012, 0.012, Math.PI, Math.PI * 2, false);
    const hole = new THREE.Path(); hole.absarc(0, 0.012, 0.0045, 0, Math.PI * 2, true); hdl.holes.push(hole);
    flat(hdl, 0.0075, TM.chrome(), g, { b: 0.0016 });
    const grip = new THREE.Shape();
    grip.moveTo(0.0128, 0.026); grip.lineTo(0.0112, 0.116); grip.lineTo(-0.0112, 0.116); grip.lineTo(-0.0128, 0.026); grip.closePath();
    flat(grip, 0.0108, TM.plastic('#c8343a'), g, { b: 0.0032 });
    const hd = new THREE.Shape();
    hd.moveTo(0.0095, 0.14); hd.lineTo(0.0125, 0.185); hd.lineTo(0.009, 0.2); hd.lineTo(0.011, 0.222);
    hd.lineTo(0.041, 0.226); hd.quadraticCurveTo(0.047, 0.232, 0.04, 0.238);
    hd.quadraticCurveTo(0.018, 0.247, -0.004, 0.24); hd.quadraticCurveTo(-0.022, 0.232, -0.022, 0.205);
    hd.quadraticCurveTo(-0.02, 0.17, -0.0095, 0.14); hd.closePath();
    flat(hd, 0.0094, TM.chrome(), g, { b: 0.0018 });
    const mj = new THREE.Shape();
    mj.moveTo(0.008, 0.17); mj.lineTo(0.012, 0.204); mj.lineTo(0.038, 0.207);
    mj.quadraticCurveTo(0.043, 0.203, 0.038, 0.197); mj.quadraticCurveTo(0.024, 0.19, 0.018, 0.172); mj.closePath();
    flat(mj, 0.0088, TM.satin(), g, { b: 0.0016 });
    const prof = [[0.171, 0]];
    for (let i = 0; i <= 30; i++) prof.push([0.172 + i * 0.0008, 0.0062]);
    prof.push([0.197, 0]);
    turned(prof, TM.forged(), g, { x: -0.004, seg: 24, shape: (a, h) => 1 + 0.13 * Math.sin(h * Math.PI * 2 / 0.0018 + a) });
    decalTop(stamp('8"  200mm', 40), 0.017, 0.0045, g, 0, 0.0038, -0.128);
    g.userData.parts = { fixed: [0.044, 0, -0.234], movable: [0.04, 0, -0.202], worm: [-0.004, 0.007, -0.184], handle: [0, 0, -0.07] };
    g.userData.hang = [[0.016, 0, -0.135], [-0.016, 0, -0.135]];
  },

  /** เลื่อยลันดา — ใบเหล็กปลายเรียว ฟันเลื่อยจริง มือจับแบบปิดมีรูสอดมือ */
  saw(g) {
    const bl = new THREE.Shape();
    bl.moveTo(0.085, 0.022); bl.lineTo(0.465, -0.046); bl.lineTo(0.468, -0.084);
    const pitch = 0.0042;
    for (let s = 0.462; s > 0.1; s -= pitch) { bl.lineTo(s, -0.0838); bl.lineTo(s - pitch * 0.62, -0.0868); }
    bl.lineTo(0.09, -0.0835); bl.closePath();
    side(bl, 0.0011, TM.blade(), g, { b: 0, curve: 4 });
    const hd = new THREE.Shape();
    hd.moveTo(0.112, 0.03);
    hd.quadraticCurveTo(0.07, 0.05, 0.03, 0.04);
    hd.quadraticCurveTo(-0.012, 0.03, -0.028, -0.01);
    hd.quadraticCurveTo(-0.04, -0.06, -0.03, -0.105);
    hd.quadraticCurveTo(-0.01, -0.122, 0.03, -0.112);
    hd.quadraticCurveTo(0.07, -0.1, 0.1, -0.094);
    hd.lineTo(0.118, -0.06);
    hd.quadraticCurveTo(0.122, 0, 0.112, 0.03);
    const hole = new THREE.Path(); hole.absellipse(0.032, -0.042, 0.026, 0.024, 0, Math.PI * 2, true); hd.holes.push(hole);
    side(hd, 0.026, TM.plastic('#f2b705'), g, { b: 0.0055 });
    const rb = new THREE.Shape();
    rb.moveTo(0.004, -0.022); rb.quadraticCurveTo(-0.012, 0.012, -0.029, -0.012);
    rb.quadraticCurveTo(-0.039, -0.06, -0.029, -0.101); rb.quadraticCurveTo(-0.006, -0.112, 0.006, -0.066); rb.closePath();
    side(rb, 0.0272, TM.rubber(), g, { b: 0.0055 });
    for (const [y, s] of [[-0.004, 0.1], [-0.064, 0.104]]) rodX(0.0055, 0.0285, TM.brass(), g, y, -s);
    g.userData.parts = { teeth: [0, -0.09, -0.3], blade: [0, -0.03, -0.3], handle: [0, -0.045, 0.0] };
    g.userData.hang = [[0, -0.03, -0.032]];
  },

  /** ตลับเมตร 5 ม. — ตัวตลับหุ้มยาง ใบเทปพิมพ์สเกล ขอเกี่ยวปลายเทป ปุ่มล็อก */
  tape(g) {
    side(roundRect(0.0, -0.038, 0.074, 0.036, 0.016), 0.034, TM.plastic('#f2c500'), g, { b: 0.005 });
    side(roundRect(0.009, -0.029, 0.065, 0.027, 0.011), 0.0356, TM.rubber('#1d2024'), g, { b: 0.0012 });
    rodX(0.0092, 0.0372, TM.chrome(), g, -0.001, -0.037, 28);
    rbox(0.012, 0.008, 0.02, TM.plastic('#d23b2a'), g, 0, 0.0375, -0.052, 0.003);
    rbox(0.0016, 0.052, 0.014, TM.chrome(), g, 0.0186, 0.0, -0.03, 0.0008);   // belt clip
    rbox(0.019, 0.0008, 0.062, mat('#f5cf1a', { rough: 0.35, metal: 0.15 }), g, 0, -0.0342, -0.101, 0.0003);
    const scale = decalMat('tape-scale', 128, 418, (c, W, H) => {
      c.fillStyle = '#f7d21c'; c.fillRect(0, 0, W, H);
      const px = H / 62;                                   // 62 mm visible; 0 at the hook end (top)
      c.fillStyle = '#16181b';
      for (let mm = 0; mm <= 62; mm++) {
        const y = mm * px, len = mm % 10 === 0 ? 46 : mm % 5 === 0 ? 30 : 18;
        c.fillRect(0, y - 1, len, 2.4); c.fillRect(W - len, y - 1, len, 2.4);
      }
      c.font = `800 34px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (let cm = 1; cm <= 6; cm++) { c.fillStyle = cm === 5 ? '#d0232b' : '#16181b'; c.fillText(String(cm), W / 2, cm * 10 * px); }
    }, { rough: 0.4 });
    decalTop(scale, 0.0186, 0.062, g, 0, -0.0337, -0.101, Math.PI);
    rbox(0.021, 0.0095, 0.0013, TM.brass(), g, 0, -0.0385, -0.1325, 0.0004);   // hook
    rbox(0.0195, 0.0012, 0.006, TM.brass(), g, 0, -0.0336, -0.1295, 0.0004);
    g.userData.parts = { case: [0, 0.0, -0.037], blade: [0, -0.034, -0.106], hook: [0, -0.039, -0.133], lock: [0, 0.039, -0.052] };
    g.userData.hang = [[0, -0.042, -0.037]];
  },

  /** คีมปากจระเข้ — สองซีกไขว้กันที่จุดหมุน ปากคีมมีคมตัด ด้ามหุ้มยาง */
  pliers(g) {
    const metal = TM.satin();
    const curve = new THREE.QuadraticBezierCurve(new V2(0.021, 0.004), new V2(0.027, 0.06), new V2(0.006, 0.108));
    const jaw = new THREE.Shape([new V2(0.0005, 0.11), new V2(0.0005, 0.163), new V2(-0.0035, 0.1665), new V2(-0.0072, 0.163), new V2(-0.0105, 0.15), new V2(-0.0125, 0.132), new V2(-0.0118, 0.11)]);
    const disc = new THREE.Shape(); disc.absarc(0, 0.115, 0.0125, 0, Math.PI * 2, false);
    const handle = strip(curve, 0.013, 0.0105);
    const grip = strip(curve, 0.0175, 0.0145, 0, 0.74);
    for (const [k, y, color] of [[1, 0.0024, '#c8343a'], [-1, -0.0024, '#2a5fc8']]) {
      const H = k > 0 ? handle : mirrorX(handle), J = k > 0 ? jaw : mirrorX(jaw), Gp = k > 0 ? grip : mirrorX(grip);
      flat(H, 0.0062, metal, g, { y, b: 0.0013 });
      flat(J, 0.0062, metal, g, { y, b: 0.0013 });
      flat(disc, 0.0062, metal, g, { y, b: 0.0013 });
      flat(Gp, 0.011, TM.plastic(color), g, { y, b: 0.0048 });
    }
    const rivet = new THREE.CylinderGeometry(0.0046, 0.0046, 0.0132, 18); rivet.translate(0, 0, -0.115); add(rivet, TM.chrome(), g);
    g.userData.parts = { jaws: [0, 0, -0.158], cutter: [0, 0, -0.13], pivot: [0, 0.007, -0.115], grips: [0.026, 0, -0.04] };
    g.userData.hang = [[0.013, 0, -0.098], [-0.013, 0, -0.098]];
  },

  /** สว่านไร้สาย 18V — ตัวเครื่องพลาสติกหุ้มยาง แบตเตอรี่ ไกสวิตช์ ปุ่มกลับทิศ หัวจับดอกไม่ใช้จำปา */
  drill(g) {
    const body = new THREE.Shape();
    body.moveTo(-0.02, -0.08);
    body.quadraticCurveTo(-0.026, -0.02, -0.027, 0.02);
    body.quadraticCurveTo(-0.04, 0.045, -0.026, 0.072);
    body.quadraticCurveTo(-0.012, 0.085, 0.02, 0.083);
    body.lineTo(0.096, 0.078);
    body.quadraticCurveTo(0.112, 0.077, 0.113, 0.062);
    body.lineTo(0.113, 0.032);
    body.quadraticCurveTo(0.112, 0.018, 0.098, 0.017);
    body.lineTo(0.046, 0.017);
    body.quadraticCurveTo(0.03, 0.013, 0.027, -0.008);
    body.lineTo(0.02, -0.08);
    body.closePath();
    side(body, 0.05, TM.plastic('#1f6fd1'), g, { b: 0.008, curve: 10 });
    const ov = new THREE.Shape();
    ov.moveTo(-0.02, -0.08); ov.quadraticCurveTo(-0.026, -0.02, -0.027, 0.02);
    ov.quadraticCurveTo(-0.035, 0.04, -0.03, 0.055); ov.lineTo(-0.012, 0.05);
    ov.quadraticCurveTo(-0.004, 0.0, -0.002, -0.08); ov.closePath();
    side(ov, 0.0515, TM.rubber(), g, { b: 0.008, curve: 10 });
    for (let i = 0; i < 4; i++) rbox(0.0516, 0.0026, 0.016, TM.rubber('#0e1012'), g, 0, 0.058 + i * 0.006, 0.005 - i * 0.0015, 0.001);   // vents
    rbox(0.064, 0.036, 0.108, TM.plastic('#1e2125'), g, 0, -0.104, -0.006, 0.009);   // battery
    rbox(0.0645, 0.006, 0.109, TM.plastic('#1f6fd1'), g, 0, -0.088, -0.006, 0.002);
    rbox(0.014, 0.03, 0.013, TM.plastic('#16181b'), g, 0, -0.01, -0.037, 0.005);   // trigger
    rodX(0.0048, 0.06, TM.plastic('#d23b2a'), g, 0.006, -0.02);                               // forward / reverse
    const clutch = (a) => 1 + 0.04 * Math.pow(Math.max(0, Math.cos(a * 24)), 2);
    turned([[0.112, 0], [0.112, 0.0255], [0.124, 0.0262], [0.13, 0.024], [0.131, 0]], TM.plastic('#2a2d31'), g, { y: 0.047, seg: 48, shape: clutch });
    const lbl = decalMat('drill-18v', 256, 96, (c, W, H) => {
      c.fillStyle = '#f2b705'; c.font = `900 64px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('18V', W / 2, H / 2 + 2);
    }, { rough: 0.4 });
    decalSide(lbl, 0.045, 0.017, g, 0.0325, -0.104, -0.006);
    decalSide(lbl, 0.045, 0.017, g, -0.0325, -0.104, -0.006);
    // the chuck and bit spin as one part
    const spin = new THREE.Group(); spin.name = 'spin'; spin.position.set(0, 0.047, 0); g.add(spin);
    const grooves = (a, h) => (h < 0.162 ? 1 - 0.07 * Math.pow(Math.max(0, Math.cos(a * 20)), 4) : 1);
    turned([[0.13, 0], [0.13, 0.021], [0.136, 0.0215], [0.161, 0.0205], [0.165, 0.018], [0.169, 0.0135], [0.17, 0]], TM.plastic('#1a1c1f'), spin, { seg: 60, shape: grooves });
    turned([[0.168, 0], [0.168, 0.0128], [0.176, 0.0096], [0.182, 0.0068], [0.1835, 0]], TM.chrome(), spin, { seg: 32 });
    const bit = [[0.18, 0]];
    for (let i = 0; i <= 28; i++) bit.push([0.181 + i * 0.002, 0.0032]);
    bit.push([0.24, 0.0026], [0.2445, 0.0006], [0.245, 0]);
    turned(bit, TM.gold(), spin, { seg: 16, shape: (a, h) => 0.66 + 0.34 * Math.abs(Math.cos(a - h * 230)) });
    bake(spin);
    g.userData.parts = { chuck: [0, 0.047, -0.15], bit: [0, 0.047, -0.228], trigger: [0, -0.012, -0.04], switch: [0.031, 0.006, -0.02], battery: [0, -0.104, -0.01] };
    g.userData.hang = [[0, 0.006, -0.075], [0, -0.126, -0.01]];
  },

  /** ปืนยิงซิลิโคน — รางเหล็กพ่นสี หลอดซิลิโคนพิมพ์ฉลาก หัวฉีดตัดเฉียง ก้านดัน */
  caulk(g) {
    const red = TM.paint('#e8463c');
    const cradle = new THREE.CylinderGeometry(0.0272, 0.0272, 0.206, 28, 1, true, Math.PI / 2, Math.PI);
    cradle.rotateX(-Math.PI / 2); cradle.translate(0, 0.035, -0.129);
    add(cradle, mat('#e8463c', { rough: 0.42, metal: 0.5, side: THREE.DoubleSide }), g);
    for (const s of [0.026, 0.232]) turned([[s - 0.0015, 0], [s - 0.0015, 0.0292], [s + 0.0015, 0.0292], [s + 0.0015, 0]], red, g, { y: 0.035, seg: 28 });
    turned([[0.034, 0], [0.034, 0.0236], [0.229, 0.0236], [0.232, 0.02], [0.236, 0.012], [0.246, 0.0115], [0.2462, 0]], TM.plastic('#f3f4f1'), g, { y: 0.035, seg: 32 });
    const label = decalMat('caulk-label', 512, 256, (c, W, H) => {
      c.fillStyle = '#1f5fae'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#ffffff'; c.fillRect(0, H * 0.62, W, H * 0.1);
      c.font = `800 64px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('ซิลิโคน', W * 0.25, H * 0.38); c.fillText('ซิลิโคน', W * 0.75, H * 0.38);
      c.font = `600 30px ${FONT}`; c.fillText('กันน้ำ · ใส', W * 0.25, H * 0.84); c.fillText('กันน้ำ · ใส', W * 0.75, H * 0.84);
    }, { rough: 0.45 });
    label.transparent = false; label.depthWrite = true;
    const band = new THREE.CylinderGeometry(0.02375, 0.02375, 0.13, 32, 1, true);
    band.rotateX(-Math.PI / 2); band.translate(0, 0.035, -0.13);
    add(band, label, g);
    turned([[0.244, 0], [0.244, 0.0072], [0.258, 0.0068], [0.3, 0.0022], [0.305, 0.0016], [0.3052, 0]], mat('#f4f4ef', { rough: 0.3, transparent: true, opacity: 0.88 }), g, { y: 0.035, seg: 20 });
    turned([[-0.08, 0], [-0.08, 0.0036], [0.034, 0.0036], [0.0342, 0]], TM.chrome(), g, { y: 0.035, seg: 12 });
    turned([[0.032, 0], [0.032, 0.021], [0.0345, 0.021], [0.0346, 0]], TM.chrome(), g, { y: 0.035, seg: 24 });
    const ring = new THREE.TorusGeometry(0.011, 0.0028, 8, 20); ring.rotateY(Math.PI / 2); ring.translate(0, 0.035, 0.091);
    add(ring, TM.chrome(), g);
    const gr = new THREE.Shape();
    gr.moveTo(0.002, 0.012); gr.lineTo(0.03, 0.012); gr.quadraticCurveTo(0.033, -0.04, 0.026, -0.095);
    gr.quadraticCurveTo(0.012, -0.104, -0.002, -0.096); gr.quadraticCurveTo(-0.007, -0.04, 0.002, 0.012);
    side(gr, 0.024, TM.plastic('#d8322c'), g, { b: 0.004 });
    const tr = new THREE.Shape();
    tr.moveTo(0.034, 0.014); tr.lineTo(0.046, 0.014); tr.quadraticCurveTo(0.052, -0.04, 0.066, -0.086);
    tr.quadraticCurveTo(0.058, -0.095, 0.05, -0.088); tr.quadraticCurveTo(0.038, -0.04, 0.034, 0.014);
    side(tr, 0.016, TM.plastic('#d8322c'), g, { b: 0.003 });
    g.userData.parts = { cartridge: [0, 0.06, -0.13], nozzle: [0, 0.035, -0.3], trigger: [0, -0.05, -0.058], rod: [0, 0.035, 0.065] };
    g.userData.hang = [[0, 0.004, -0.17], [0, 0.004, -0.07]];
  },
};

const templates = new Map();
export const hasTool3d = (id) => id in BUILD;
/** Realistic tool model (cached template, cloned — geometry and materials are shared). */
export function buildTool(id) {
  if (!templates.has(id)) {
    const g = new THREE.Group();
    g.name = id;
    BUILD[id](g);
    bake(g);
    g.userData.itemId = id;
    templates.set(id, g);
  }
  return templates.get(id).clone();
}
