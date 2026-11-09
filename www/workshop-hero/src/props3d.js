import * as THREE from 'three';
import { mat, M } from './models.js';
import { G3 } from './tools3d.js';
import { FONT } from './strings.js';

// วัสดุ อุปกรณ์ป้องกัน (PPE) แบบสมจริง — ขนาดและแกนเดียวกับของเดิม (จุดกำเนิดที่ปลายด้านจับ ชี้ไป −Z)
// วัสดุบางชิ้นใหญ่กว่าของจริงเล็กน้อย (แหวนยาง เทปพันเกลียว) เพื่อให้มองเห็นและชี้เลือกได้ในแว่น VR

const { TM, shiny, add, flat, turned, rbox, decalMat, bake, lathe } = G3;

/** Deterministic random numbers so every build of a template looks the same. */
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
/** Decal on a −Z / +Z / +X … face: plane of size w×h, rotated by the given Euler, at (x, y, z). */
function plate(material, w, h, parent, pos, rot = [0, 0, 0]) {
  const geo = new THREE.PlaneGeometry(w, h);
  geo.rotateX(rot[0]); geo.rotateY(rot[1]); geo.rotateZ(rot[2]);
  geo.translate(...pos);
  return add(geo, material, parent);
}
const label = (key, draw, w = 256, h = 128, rough = 0.6) => decalMat(key, w, h, draw, { rough });
const tube = (pts, r, material, parent, seg = 24) => add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), seg, r, 8, false), material, parent);

// ======================================================================
// วัสดุ
// ======================================================================
const BUILD = {
  /** ไม้ 1×4 นิ้ว ลบมุม ลายไม้ตามความยาว รอยดินสอขีดระยะ */
  wood(g) {
    rbox(0.11, 0.022, 0.55, M.wood(), g, 0, 0, -0.25, 0.003);
    const end = label('wood-end', (c, W, H) => {
      c.fillStyle = '#c99a62'; c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(120,80,40,0.45)'; c.lineWidth = 3;
      for (let r = 20; r < 260; r += 16) { c.beginPath(); c.arc(W * 0.35, H * 1.6, r, 0, Math.PI * 2); c.stroke(); }
    });
    for (const z of [0.0255, -0.5255]) plate(end, 0.104, 0.017, g, [0, 0, z], [0, z > 0 ? 0 : Math.PI, 0]);
    const pencil = label('wood-mark', (c, W, H) => {
      c.strokeStyle = 'rgba(40,40,50,0.75)'; c.lineWidth = 5; c.beginPath(); c.moveTo(W * 0.1, H / 2); c.lineTo(W * 0.9, H / 2); c.stroke();
      c.fillStyle = 'rgba(40,40,50,0.8)'; c.font = `600 54px ${FONT}`; c.fillText('60', W * 0.62, H * 0.42);
    });
    plate(pencil, 0.1, 0.05, g, [0, 0.0112, -0.33], [-Math.PI / 2, 0, 0]);
  },

  /** ท่อ PVC สีฟ้า (ท่อน้ำ) — ท่อกลวง ลบมุมปลาย พิมพ์ชั้นท่อและขนาด */
  pvc(g) {
    const blue = shiny(mat('#2f73c9', { rough: 0.32 }), 1.2);
    const p = [[-0.05, 0.0205], [-0.05, 0.0228], [-0.049, 0.024], [0.449, 0.024], [0.45, 0.0228], [0.45, 0.0205], [-0.05, 0.0205]];
    turned(p, blue, g, { seg: 32 });
    const print = label('pvc-print', (c, W, H) => {
      c.translate(W / 2, H / 2); c.rotate(-Math.PI / 2);
      c.fillStyle = 'rgba(255,255,255,0.92)'; c.font = `700 34px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('PVC  ชั้น 8.5  Ø 1½"  ท่อน้ำดื่ม', 0, 0);
    }, 64, 640);
    const band = new THREE.CylinderGeometry(0.02405, 0.02405, 0.4, 12, 1, true, -0.28, 0.56);
    band.rotateX(-Math.PI / 2); band.translate(0, 0, -0.2);
    add(band, print, g);
  },

  /** กล่องกระดาษใส่ตะปู มีตะปูกองอยู่ข้างใน */
  nails(g) { fastenerBox(g, 'nails'); },
  /** กล่องใส่สกรูหัวแฉก */
  screws(g) { fastenerBox(g, 'screws'); },

  /** แหวนยาง (ซีลยางก๊อกน้ำ) — วางแนวนอน */
  washer(g) {
    const ring = lathe([[-0.003, 0.0075], [-0.0034, 0.012], [-0.003, 0.021], [0, 0.0222], [0.003, 0.021], [0.0034, 0.012], [0.003, 0.0075], [0, 0.0068], [-0.003, 0.0075]], 32);
    ring.translate(0, 0, -0.03);
    add(ring, mat('#1d1f22', { rough: 0.82 }), g);
  },

  /** เทปพันเกลียว (เทปเทฟลอน) บนแกนพลาสติก */
  teflon(g) {
    const roll = lathe([[-0.0065, 0.0125], [-0.0065, 0.0215], [0.0065, 0.0215], [0.0065, 0.0125], [-0.0065, 0.0125]], 40);
    roll.rotateX(Math.PI / 2); roll.translate(0, 0, -0.03);
    add(roll, mat('#f6f6f2', { rough: 0.55 }), g);
    const core = lathe([[-0.007, 0.0095], [-0.007, 0.0127], [0.007, 0.0127], [0.007, 0.0095], [-0.007, 0.0095]], 32);
    core.rotateX(Math.PI / 2); core.translate(0, 0, -0.03);
    add(core, TM.plastic('#f2c500'), g);
    rbox(0.026, 0.0004, 0.0128, mat('#f6f6f2', { rough: 0.55 }), g, 0.011, -0.0216, -0.03, 0.0001);   // loose tape end
  },

  // ====================================================================
  // อุปกรณ์ป้องกันส่วนบุคคล
  // ====================================================================
  /** หมวกนิรภัย — เปลือกโค้งมีสัน ปีกหมวกยื่นด้านหน้า สายรัดในหมวก สติกเกอร์กากบาท */
  helmet(g) {
    const yel = mat('#ffc21a', { rough: 0.32, side: THREE.DoubleSide });
    const shell = lathe([[0, 0.127], [0.03, 0.124], [0.06, 0.112], [0.09, 0.09], [0.11, 0.065], [0.125, 0.035], [0.131, 0]], 40);
    shell.scale(1, 1, 1.12);
    add(shell, yel, g);
    const rib = new THREE.TorusGeometry(0.127, 0.0075, 8, 40, Math.PI);
    rib.rotateY(Math.PI / 2); rib.scale(1, 1.03, 1.12);
    add(rib, yel, g);
    // brim: wide peak at the front (+Z, toward the room on the rack)
    const outer = [], inner = [];
    for (let i = 0; i < 64; i++) {
      const th = (i / 64) * Math.PI * 2, sx = Math.sin(th), cz = Math.cos(th);
      const rs = Math.hypot(0.127 * sx, 0.127 * 1.12 * cz) / Math.hypot(sx, cz);
      const ext = 0.014 + 0.058 * Math.pow(Math.max(0, cz), 3) + 0.012 * Math.pow(Math.max(0, -cz), 2);
      outer.push(new THREE.Vector2(sx * (rs + ext), -cz * (rs + ext)));
      inner.push(new THREE.Vector2(sx * (rs - 0.006), -cz * (rs - 0.006)));
    }
    const brim = new THREE.Shape(outer); brim.holes.push(new THREE.Path(inner.reverse()));
    flat(brim, 0.006, mat('#ffc21a', { rough: 0.32 }), g, { y: 0.002, b: 0.0022 });
    // suspension inside (seen when it is turned over)
    const strap = mat('#33373d', { rough: 0.8 });
    const band = new THREE.TorusGeometry(0.108, 0.004, 6, 40); band.rotateX(Math.PI / 2); band.scale(1, 2.2, 1.12); band.translate(0, 0.03, 0);
    add(band, strap, g);
    for (const a of [0, Math.PI / 2]) {
      const s = new THREE.TorusGeometry(0.095, 0.003, 6, 30, Math.PI); s.rotateY(a); s.scale(1, 0.9, 1.1); s.translate(0, 0.03, 0); add(s, strap, g);
    }
    const sticker = label('helmet-cross', (c, W, H) => {
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(W / 2, H / 2, W * 0.46, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#1f9e4a'; c.fillRect(W * 0.4, H * 0.18, W * 0.2, H * 0.64); c.fillRect(W * 0.18, H * 0.4, W * 0.64, H * 0.2);
    }, 128, 128, 0.4);
    plate(sticker, 0.04, 0.04, g, [0, 0.075, 0.1148], [-0.63, 0, 0]);
  },

  /** ถุงมือผ้าเคลือบยาง 1 คู่ — นิ้วแยก ข้อมือยางยืดสีเหลือง */
  gloves(g) {
    for (const k of [-1, 1]) glove(g, k);
  },

  /** แว่นตานิรภัยแบบครอบตา — เลนส์โค้งใส กรอบนิ่ม ช่องระบายอากาศ สายรัดยางยืด */
  goggles(g) {
    const lens = new THREE.CylinderGeometry(0.095, 0.095, 0.05, 28, 1, true, Math.PI - 1.0, 2.0);
    lens.translate(0, 0, 0.075);
    const lensMat = shiny(new THREE.MeshStandardMaterial({ color: '#d6eeff', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }), 1.6);
    add(lens, lensMat, g);
    const frame = mat('#1f2a38', { rough: 0.5 });
    for (const y of [-0.028, 0.028]) {
      const rim = new THREE.CylinderGeometry(0.0985, 0.0985, 0.009, 28, 1, false, Math.PI - 1.02, 2.04);
      rim.translate(0, y, 0.075); add(rim, frame, g);
    }
    for (const s of [-1, 1]) {
      const a = Math.PI + s * 1.0;
      const x = 0.0985 * Math.sin(a), z = 0.075 + 0.0985 * Math.cos(a);
      const side = new THREE.BoxGeometry(0.012, 0.065, 0.02); side.rotateY(a); side.translate(x, 0, z); add(side, frame, g);
      rbox(0.008, 0.026, 0.016, TM.plastic('#16181b'), g, x * 1.02, 0, z + 0.012, 0.002);       // strap buckle
    }
    for (let i = 0; i < 4; i++) {
      const a = Math.PI - 0.6 + i * 0.4;
      const vent = new THREE.BoxGeometry(0.014, 0.004, 0.008); vent.rotateY(a); vent.translate(0.1 * Math.sin(a), 0.033, 0.075 + 0.1 * Math.cos(a));
      add(vent, mat('#0e1318', { rough: 0.7 }), g);
    }
    const strap = new THREE.TorusGeometry(0.1, 0.0035, 6, 32, Math.PI);
    strap.rotateX(Math.PI / 2); strap.scale(1, 4, 0.9); strap.translate(0, 0, 0.075);
    add(strap, mat('#2a64c8', { rough: 0.85 }), g);
  },
};

/** Open cardboard box of nails or screws with a printed label. */
function fastenerBox(g, kind) {
  const kraft = mat('#c9a46a', { rough: 0.92 });
  const W = 0.1, H = 0.06, D = 0.07, t = 0.003, cz = -0.04;
  rbox(W, t, D, kraft, g, 0, -H / 2 + t / 2, cz, 0.001);
  for (const s of [-1, 1]) {
    rbox(W, H, t, kraft, g, 0, 0, cz + s * (D / 2 - t / 2), 0.001);
    rbox(t, H, D, kraft, g, s * (W / 2 - t / 2), 0, cz, 0.001);
  }
  const lbl = label(`box-${kind}`, (c, Wc, Hc) => {
    c.fillStyle = kind === 'nails' ? '#d84a2b' : '#2a64c8'; c.fillRect(0, 0, Wc, Hc);
    c.fillStyle = '#ffffff'; c.font = `800 66px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(kind === 'nails' ? 'ตะปู 2"' : 'สกรู #8', Wc / 2, Hc * 0.42);
    c.font = `600 30px ${FONT}`; c.fillText(kind === 'nails' ? 'ตะปูตอกไม้ 500 g' : 'หัวแฉก เกลียวปล่อย', Wc / 2, Hc * 0.8);
  }, 256, 128);
  for (const s of [-1, 1]) plate(lbl, 0.084, 0.042, g, [0, -0.002, cz + s * (D / 2 + 0.0004)], [0, s > 0 ? 0 : Math.PI, 0]);
  // fasteners heaped near the rim
  const r = rng(kind === 'nails' ? 7 : 11), steel = TM.forged();
  const parts = [];
  for (let i = 0; i < 16; i++) {
    const p = new THREE.Group();
    if (kind === 'nails') {
      turned([[-0.025, 0], [-0.025, 0.0013], [0.02, 0.0013], [0.025, 0]], steel, p, { seg: 6 });
      turned([[-0.0262, 0], [-0.0262, 0.0032], [-0.025, 0.0032], [-0.025, 0]], steel, p, { seg: 10 });
    } else {
      turned([[-0.016, 0], [-0.016, 0.0042], [-0.0135, 0.0019], [0.012, 0.0019], [0.016, 0]], steel, p, { seg: 10, shape: (a, h) => (h > -0.013 ? 1 + 0.22 * Math.sin(h * Math.PI * 2 / 0.0016 + a) : 1) });
    }
    p.position.set((r() - 0.5) * (W - 0.03), H / 2 - 0.012 - r() * 0.012, cz + (r() - 0.5) * (D - 0.03));
    p.rotation.set((r() - 0.5) * 0.7, r() * Math.PI * 2, (r() - 0.5) * 0.5);
    p.updateMatrix();
    for (const m of p.children) { m.geometry.applyMatrix4(p.matrix); parts.push(m.geometry); }
  }
  add(mergeAll(parts), steel, g);
}
function mergeAll(geos) {
  const out = geos.map((x) => (x.index ? x.toNonIndexed() : x));
  const n = out.reduce((s, x) => s + x.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const x of out) {
    pos.set(x.attributes.position.array, o * 3); nor.set(x.attributes.normal.array, o * 3);
    if (x.attributes.uv) uv.set(x.attributes.uv.array, o * 2);
    o += x.attributes.position.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** One work glove lying palm-down, fingers toward −Z; k = −1 left hand, +1 right hand. */
function glove(g, k) {
  const knit = mat('#2b3550', { rough: 0.95 }), coat = mat('#171b24', { rough: 0.55 }), cuffM = mat('#f2b705', { rough: 0.9 });
  const cx = k * 0.062;
  const capsule = (r, len, x, y, z, ry = 0, sy = 1, material = knit) => {
    const geo = new THREE.CapsuleGeometry(r, len, 4, 10);
    geo.rotateX(Math.PI / 2); geo.scale(1, sy, 1); geo.rotateY(ry); geo.translate(x, y, z);
    return add(geo, material, g);
  };
  capsule(0.036, 0.045, cx, 0, -0.05, 0, 0.42);                                   // palm
  const fingers = [[-0.024, 0.05], [-0.008, 0.058], [0.008, 0.055], [0.023, 0.044]];
  fingers.forEach(([dx, len], i) => {
    const spread = (i - 1.5) * 0.06 * k;
    const x0 = cx + dx * k, z0 = -0.09;
    capsule(0.0095, len, x0 + Math.sin(spread) * (-len / 2), 0.001, z0 - Math.cos(spread) * len / 2, -spread, 0.85);
    capsule(0.0098, len * 0.35, x0 + Math.sin(spread) * (-len * 0.82), 0.0012, z0 - Math.cos(spread) * len * 0.82, -spread, 0.86, coat);   // dipped tip
  });
  const ta = 0.75 * k;
  capsule(0.0115, 0.04, cx + k * 0.046, 0.001, -0.06, ta, 0.85);                   // thumb
  const cuff = lathe(Array.from({ length: 12 }, (_, i) => [i * 0.004, 0.033 + (i === 0 || i === 11 ? -0.001 : 0)]), 36, (a) => 1 + 0.035 * Math.cos(a * 36));
  cuff.rotateX(Math.PI / 2); cuff.scale(1, 0.45, 1); cuff.translate(cx, 0, -0.012);
  add(cuff, cuffM, g);
}

// ======================================================================
/** Points the close-look labels point at (item space; see ITEM_INFO in strings.js for the names). */
const PARTS = {
  wood: { face: [0.03, 0.011, -0.16], mark: [0, 0.0115, -0.33], end: [0, 0, -0.525] },
  pvc: { body: [0.024, 0, -0.08], print: [0, 0.0245, -0.25], end: [0, 0.022, 0.05] },
  nails: { head: [0.01, 0.022, -0.04], shank: [-0.02, 0.016, -0.03], box: [0, -0.002, -0.005] },
  screws: { head: [0.01, 0.02, -0.04], thread: [-0.015, 0.018, -0.05], box: [0, -0.002, -0.005] },
  bulb: { glass: [0, 0.022, -0.09], body: [0, 0.02, -0.042], base: [0, 0.0135, -0.013], tip: [0, 0, 0.0065] },
  washer: { ring: [0.021, 0.003, -0.03], hole: [0, 0, -0.03] },
  teflon: { tape: [0, 0.0215, -0.03], core: [0.011, 0, -0.023], end: [0.022, -0.0218, -0.03] },
  helmet: { shell: [0.075, 0.1, 0.0], brim: [0, 0.003, 0.2], rib: [0, 0.137, -0.01], suspension: [0.05, 0.03, 0.08] },
  gloves: { coating: [0.07, 0.008, -0.15], fingers: [0.055, 0.008, -0.11], cuff: [0.062, 0.015, -0.005] },
  goggles: { lens: [0.03, 0, -0.02], frame: [0.06, 0.028, -0.005], vent: [0, 0.034, -0.024], strap: [0.1, 0, 0.08] },
};

export const hasProp3d = (id) => id in BUILD || id === 'bulb';
const templates = new Map();
/** Realistic material / PPE model. The LED bulb is built fresh each time (its glass is per-lamp state). */
export function buildProp(id, opts = {}) {
  if (id === 'bulb') return bulb(opts.lit);
  if (!templates.has(id)) {
    const g = new THREE.Group();
    g.name = id;
    BUILD[id](g);
    bake(g);
    g.userData.itemId = id;
    g.userData.parts = PARTS[id];
    templates.set(id, g);
  }
  return templates.get(id).clone();
}

/** หลอดไฟ LED ขั้ว E27 — ขั้วเกลียวโลหะ คอพลาสติกระบายความร้อน โดมแก้วฝ้า */
function bulb(lit = false) {
  const g = new THREE.Group();
  g.name = 'bulb';
  const glass = new THREE.MeshStandardMaterial({ color: '#fffbe8', roughness: 0.35, transparent: true, opacity: 0.93, emissive: '#ffe9a8', emissiveIntensity: lit ? 2.2 : 0.05 });
  const thread = (a, h) => (h > 0.002 && h < 0.024 ? 1 + 0.06 * Math.sin(h * Math.PI * 2 / 0.0036 + a) : 1);
  turned([[0.0, 0], [0.0, 0.0128], [0.026, 0.0128], [0.0262, 0]], TM.satin(), g, { seg: 28, shape: thread });
  turned([[-0.006, 0], [-0.006, 0.0042], [-0.0045, 0.0052], [-0.002, 0.0088], [0.0005, 0.0092], [0.0006, 0]], mat('#121417', { rough: 0.3 }), g, { seg: 20 });
  turned([[-0.0068, 0], [-0.0068, 0.0028], [-0.0058, 0.0032], [-0.0057, 0]], TM.brass(), g, { seg: 14 });
  turned([[0.025, 0], [0.025, 0.0145], [0.034, 0.0175], [0.044, 0.0232], [0.05, 0.026], [0.0502, 0]], mat('#f4f4f1', { rough: 0.45 }), g, { seg: 32 });
  const dome = [[0.047, 0]];
  for (let i = 0; i <= 14; i++) { const a = -0.62 + (i / 14) * (Math.PI / 2 + 0.62); dome.push([0.077 + Math.sin(a) * 0.031, Math.cos(a) * 0.0302]); }
  dome[1][1] = 0.0248;
  turned(dome, glass, g, { seg: 36 });
  g.userData.glass = glass;
  g.userData.itemId = 'bulb';
  g.userData.parts = PARTS.bulb;
  return g;
}

// ======================================================================
// เฟอร์นิเจอร์ (ขนาด จุดกำเนิด และ API เดิม — ฉากและภารกิจจึงใช้ต่อได้ทันที)
// ======================================================================
const box3 = (w, h, d, material, parent, x, y, z) => { const geo = new THREE.BoxGeometry(w, h, d); geo.translate(x, y, z); return add(geo, material, parent); };
function rboxR(w, h, d, material, parent, pos, rot = [0, 0, 0], r = 0.004) {
  const m = rbox(w, h, d, material, parent, 0, 0, 0, r);
  m.geometry.rotateX(rot[0]); m.geometry.rotateY(rot[1]); m.geometry.rotateZ(rot[2]); m.geometry.translate(...pos);
  return m;
}
const cylY = (r0, r1, h, material, parent, x, y, z, seg = 16) => { const geo = new THREE.CylinderGeometry(r0, r1, h, seg); geo.translate(x, y, z); return add(geo, material, parent); };
const vlathe = (profile, material, parent, x, y, z, seg = 24, shape = null) => { const geo = lathe(profile, seg, shape); geo.translate(x, y, z); return add(geo, material, parent); };
const frameMat = () => mat('#3f5a7a', { rough: 0.42, metal: 0.5 });     // powder-coated steel tube
const capMat = () => mat('#16181b', { rough: 0.7 });

/** โต๊ะนักเรียน — โครงเหล็กพ่นสี หน้าโต๊ะไม้ ช่องเก็บหนังสือเหล็กแผ่นเปิดด้านผู้นั่ง (+Z) */
export function schoolDesk() {
  const g = new THREE.Group();
  const fr = frameMat();
  rbox(0.62, 0.024, 0.46, M.wood(), g, 0, 0.723, 0, 0.006);
  for (const z of [-0.2, 0.2]) box3(0.58, 0.022, 0.022, fr, g, 0, 0.7, z);
  for (const x of [-0.28, 0.28]) {
    box3(0.022, 0.022, 0.42, fr, g, x, 0.7, 0);
    box3(0.02, 0.02, 0.4, fr, g, x, 0.12, 0);
    for (const z of [-0.2, 0.2]) { box3(0.024, 0.69, 0.024, fr, g, x, 0.345, z); box3(0.027, 0.012, 0.027, capMat(), g, x, 0.006, z); }
  }
  box3(0.56, 0.02, 0.02, fr, g, 0, 0.12, -0.2);
  const sheet = mat('#4d6a8c', { rough: 0.45, metal: 0.5 });
  box3(0.54, 0.004, 0.36, sheet, g, 0, 0.6, -0.02);
  box3(0.54, 0.09, 0.004, sheet, g, 0, 0.645, -0.2);
  for (const x of [-0.27, 0.27]) box3(0.004, 0.09, 0.36, sheet, g, x, 0.645, -0.02);
  return g;
}

/** เก้าอี้นักเรียน — ท่อเหล็กดัดโค้ง ที่นั่งและพนักไม้อัดดัดโค้ง. Returns { group, bolts[], seat } */
export function schoolChair({ bolts = false } = {}) {
  const g = new THREE.Group();
  const fr = frameMat();
  for (const x of [-0.19, 0.19]) {
    tube([[x, 0.0, -0.17], [x, 0.215, -0.17], [x, 0.43, -0.17]], 0.0105, fr, g, 4);
    tube([[x, 0, 0.17], [x, 0.43, 0.17], [x, 0.62, 0.188], [x, 0.86, 0.215]], 0.0105, fr, g, 16);
    tube([[x, 0.42, -0.17], [x, 0.42, 0], [x, 0.42, 0.17]], 0.009, fr, g, 4);
    tube([[x, 0.13, -0.17], [x, 0.13, 0], [x, 0.13, 0.17]], 0.008, fr, g, 4);
    for (const z of [-0.17, 0.17]) cylY(0.0125, 0.0125, 0.014, capMat(), g, x, 0.007, z, 10);
  }
  for (const z of [-0.17, 0.17]) tube([[-0.19, 0.42, z], [0, 0.42, z], [0.19, 0.42, z]], 0.009, fr, g, 4);
  const seat = flat(G3.roundRect(-0.21, -0.2, 0.21, 0.2, 0.035), 0.018, M.wood(), g, { y: 0.444, b: 0.004 });
  const arc = (R) => Array.from({ length: 17 }, (_, i) => { const p = -0.235 + (i / 16) * 0.47; return new THREE.Vector2(R * Math.sin(p), 0.7 - R * Math.cos(p)); });
  const backShape = new THREE.Shape([...arc(0.912), ...arc(0.9).reverse()]);
  flat(backShape, 0.2, M.wood(), g, { y: 0.735, b: 0.003 });
  const pts = [];
  if (bolts) {
    const steel = TM.chrome();
    // 2 hex bolts at the rail joints (wrench), 2 Phillips screws through the seat (screwdriver)
    for (const [x, y, z, kind] of [[-0.2, 0.42, -0.17, 'hex'], [0.2, 0.42, 0.17, 'hex'], [-0.15, 0.457, 0.12, 'screw'], [0.15, 0.457, -0.12, 'screw']]) {
      const p = new THREE.Group();
      p.position.set(x, y, z);
      if (kind === 'hex') {
        p.position.x += Math.sign(x) * 0.012;
        const head = new THREE.CylinderGeometry(0.0125, 0.0125, 0.011, 6); head.rotateZ(Math.PI / 2); add(head, steel, p);
        const washer = new THREE.CylinderGeometry(0.016, 0.016, 0.002, 20); washer.rotateZ(Math.PI / 2); washer.translate(-Math.sign(x) * 0.0065, 0, 0); add(washer, steel, p);
      } else {
        vlathe([[-0.002, 0], [-0.002, 0.0095], [0.0015, 0.009], [0.0035, 0.006], [0.0042, 0]], steel, p, 0, 0, 0, 20);
        for (const r of [0, Math.PI / 2]) rboxR(0.011, 0.0018, 0.0022, mat('#2a2e33', { rough: 0.6 }), p, [0, 0.0038, 0], [0, r, 0], 0.0006);
      }
      p.userData.kind = kind;
      g.add(p);
      pts.push(p);
    }
  }
  bake(g);                                              // one mesh per material; the bolt groups stay separate
  const seatMesh = g.children.find((m) => m.isMesh && m.material === seat.material) || null;
  return { group: g, bolts: pts, seat: seatMesh };
}

/** โต๊ะครู — ตู้ลิ้นชัก 3 ชั้นมีมือจับ แผงบังขา ของบนโต๊ะ (กระดาษ แก้วกาแฟ กล่องปากกา หนังสือ) */
export function teacherDesk() {
  const g = new THREE.Group();
  const wd = M.woodDark(), front = mat('#a87449', { rough: 0.55 });
  rbox(1.4, 0.035, 0.7, wd, g, 0, 0.7625, 0, 0.006);
  rbox(0.4, 0.72, 0.66, wd, g, -0.48, 0.37, 0, 0.004);
  for (let i = 0; i < 3; i++) {
    const y = 0.15 + i * 0.235;
    rbox(0.37, 0.215, 0.018, front, g, -0.48, y, -0.335, 0.004);
    rbox(0.12, 0.011, 0.011, TM.satin(), g, -0.48, y + 0.06, -0.356, 0.004);
    for (const dx of [-0.05, 0.05]) box3(0.007, 0.007, 0.016, TM.satin(), g, -0.48 + dx, y + 0.06, -0.347);
  }
  rbox(0.035, 0.72, 0.66, wd, g, 0.68, 0.37, 0, 0.004);
  rbox(1.3, 0.5, 0.018, wd, g, 0, 0.5, 0.31, 0.004);
  rboxR(0.297, 0.006, 0.21, M.white(), g, [0.1, 0.783, -0.05], [0, 0.2, 0], 0.001);
  rboxR(0.297, 0.005, 0.21, mat('#fff7d6', { rough: 0.8 }), g, [0.12, 0.789, -0.04], [0, -0.1, 0], 0.001);
  // mug with handle
  const mugM = shiny(mat('#e2564a', { rough: 0.22 }), 1.2);
  vlathe([[0, 0], [0, 0.036], [0.004, 0.039], [0.095, 0.04], [0.096, 0.036], [0.092, 0.034], [0.009, 0.034], [0.009, 0]], mugM, g, 0.5, 0.78, 0.1, 28);
  const hnd = new THREE.TorusGeometry(0.024, 0.0055, 8, 16, Math.PI * 1.2); hnd.rotateZ(-Math.PI * 0.6); hnd.translate(0.5 + 0.041, 0.83, 0.1); add(hnd, mugM, g);
  // pen cup with pens
  vlathe([[0, 0], [0, 0.034], [0.105, 0.035], [0.105, 0.031], [0.004, 0.031], [0.004, 0]], mat('#355c9b', { rough: 0.4 }), g, -0.4, 0.78, 0.15, 24);
  const r = rng(3);
  ['#1d2733', '#c0392b', '#2a64c8', '#f2b705'].forEach((c, i) => {
    const pen = new THREE.CylinderGeometry(0.0045, 0.0045, 0.15, 8); pen.rotateZ((r() - 0.5) * 0.35); pen.rotateX((r() - 0.5) * 0.35);
    pen.translate(-0.4 + (i % 2 ? 0.012 : -0.012), 0.78 + 0.1, 0.15 + (i > 1 ? 0.012 : -0.012)); add(pen, TM.plastic(c), g);
  });
  // a stack of books
  ['#2e86c1', '#27ae60', '#c0392b'].forEach((c, i) => {
    rboxR(0.24, 0.03, 0.17, TM.plastic(c), g, [-0.3, 0.795 + i * 0.031, -0.12], [0, 0.15 - i * 0.12, 0], 0.003);
    rboxR(0.232, 0.026, 0.165, mat('#f3efe2', { rough: 0.9 }), g, [-0.3 + 0.005, 0.795 + i * 0.031, -0.12], [0, 0.15 - i * 0.12, 0], 0.001);
  });
  return g;
}

/** ชั้นหนังสือ — หนังสือหนา-บาง สูง-ต่ำ มีแถบสันปก บางเล่มเอียง บางกองวางนอน */
export function bookshelf(w = 1.2, h = 1.9, d = 0.35, rows = 4) {
  const g = new THREE.Group();
  const wd = M.woodDark();
  rbox(w + 0.02, 0.03, d, wd, g, 0, h, 0, 0.004);
  box3(0.03, h, d, wd, g, -w / 2, h / 2, 0);
  box3(0.03, h, d, wd, g, w / 2, h / 2, 0);
  box3(w, h, 0.012, mat('#6b4428'), g, 0, h / 2, d / 2 - 0.006);
  box3(w, 0.06, 0.02, wd, g, 0, 0.03, -d / 2 + 0.01);
  const cols = ['#a93226', '#1f618d', '#b7950b', '#1e8449', '#6c3483', '#ca6f1e', '#117a65', '#5d6d7e', '#283747', '#922b21'];
  const r = rng(Math.round(w * 100 + rows));
  const band = mat('#e8d9a8', { rough: 0.5, metal: 0.2 });
  for (let row = 0; row < rows; row++) {
    const y = 0.06 + row * ((h - 0.06) / rows);
    box3(w, 0.022, d, wd, g, 0, y, 0);
    let x = -w / 2 + 0.035;
    while (x < w / 2 - 0.1) {
      if (r() < 0.12) { x += 0.04 + r() * 0.06; continue; }                    // a gap
      if (r() < 0.12) {                                                       // a few books lying flat
        for (let k = 0; k < 2 + (r() * 3 | 0); k++) box3(0.17, 0.025, d * 0.72, mat(cols[(r() * cols.length) | 0], { rough: 0.6 }), g, x + 0.09, y + 0.024 + k * 0.026, 0.01);
        x += 0.19; continue;
      }
      const bw = 0.018 + r() * 0.035, bh = 0.17 + r() * 0.12, c = cols[(r() * cols.length) | 0];
      const lean = r() < 0.08 ? 0.18 : 0;
      const bk = box3(bw, bh, d * 0.78, mat(c, { rough: 0.6 }), g, 0, 0, 0);
      bk.geometry.translate(0, bh / 2, 0); bk.geometry.rotateZ(-lean); bk.geometry.translate(x + bw / 2 + lean * bh * 0.5, y + 0.011, 0.01);
      if (!lean) for (const by of [0.03, bh - 0.035]) box3(bw + 0.001, 0.006, 0.004, band, g, x + bw / 2, y + 0.011 + by, 0.01 - d * 0.39 - 0.002);
      x += bw + 0.002 + lean * bh;
    }
  }
  return g;
}

/** โต๊ะช่าง — หน้าโต๊ะไม้ประสานหนา ขาเหล็กมีปุ่มปรับระดับ ชั้นวางล่าง */
export function workbench(w = 2, d = 0.8) {
  const g = new THREE.Group();
  rbox(w, 0.07, d, M.bench(), g, 0, 0.86, 0, 0.008);
  const leg = mat('#3b4a5a', { rough: 0.45, metal: 0.5 });
  for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) {
    for (const z of [-d / 2 + 0.06, d / 2 - 0.06]) {
      box3(0.05, 0.8, 0.05, leg, g, x, 0.43, z);
      cylY(0.018, 0.022, 0.03, capMat(), g, x, 0.015, z, 12);
    }
    box3(0.04, 0.05, d - 0.12, leg, g, x, 0.8, 0);
    box3(0.035, 0.035, d - 0.12, leg, g, x, 0.17, 0);
  }
  for (const z of [-d / 2 + 0.06, d / 2 - 0.06]) { box3(w - 0.12, 0.06, 0.035, leg, g, 0, 0.8, z); box3(w - 0.12, 0.035, 0.035, leg, g, 0, 0.17, z); }
  rbox(w - 0.1, 0.022, d - 0.1, M.wood(), g, 0, 0.198, 0, 0.003);
  return g;
}

/** ปากกาจับชิ้นงาน (Bench vise) — ตัวเหล็กหล่อ ฐานหมุน ปากจับมีแผ่นฟัน แกนเกลียวและมือหมุนตัว T */
export function vise() {
  const g = new THREE.Group();
  const blue = mat('#2f5fa8', { rough: 0.45, metal: 0.5 }), jaw = TM.oxide(), steel = TM.chrome();
  vlathe([[0, 0], [0, 0.072], [0.012, 0.072], [0.02, 0.064], [0.026, 0.06], [0.026, 0]], blue, g, 0, 0, 0.0, 28);
  rbox(0.12, 0.06, 0.17, blue, g, 0, 0.06, 0.01, 0.01);
  rbox(0.15, 0.075, 0.042, blue, g, 0, 0.122, -0.05, 0.008);
  rbox(0.06, 0.02, 0.05, blue, g, 0, 0.165, -0.085, 0.004);                  // anvil
  rbox(0.15, 0.075, 0.042, blue, g, 0, 0.122, 0.052, 0.008);
  box3(0.05, 0.034, 0.13, blue, g, 0, 0.1, 0.1);
  for (const z of [-0.0275, 0.0295]) {
    box3(0.13, 0.03, 0.005, jaw, g, 0, 0.145, z);
    for (let i = 0; i < 10; i++) box3(0.13, 0.0012, 0.0014, mat('#15181b', { rough: 0.6 }), g, 0, 0.133 + i * 0.0026, z + Math.sign(z) * -0.0028);
  }
  turned([[-0.205, 0], [-0.205, 0.0085], [-0.07, 0.0085], [-0.07, 0]], steel, g, { y: 0.1, seg: 18, shape: (a, s) => (s < -0.17 ? 1 : 1 + 0.08 * Math.sin(s * 600 + a)) });
  G3.rodX(0.0055, 0.18, steel, g, 0.1, 0.205);
  for (const x of [-0.092, 0.092]) { const b = new THREE.SphereGeometry(0.011, 14, 10); b.translate(x, 0.1, 0.205); add(b, steel, g); }
  return g;
}

/** ตู้เครื่องมือมีล้อ — ลิ้นชัก 5 ชั้น มือจับยาวเต็มบาน แผ่นยางรองด้านบน ล้อเลื่อน มือจับข้าง */
export function toolChest() {
  const g = new THREE.Group();
  const red = mat('#ec4a40', { rough: 0.4, metal: 0.5 }), red2 = mat('#d63a34', { rough: 0.4, metal: 0.5 }), steel = TM.chrome();
  rbox(0.9, 0.86, 0.5, red, g, 0, 0.53, 0, 0.012);
  rbox(0.92, 0.03, 0.52, mat('#1d1f22', { rough: 0.85 }), g, 0, 0.975, 0, 0.006);
  for (let i = 0; i < 5; i++) {
    const y = 0.2 + i * 0.16;
    rbox(0.84, 0.138, 0.012, red2, g, 0, y, -0.256, 0.003);
    rbox(0.6, 0.013, 0.016, steel, g, 0, y + 0.05, -0.27, 0.005);
    box3(0.07, 0.022, 0.002, M.white(), g, -0.33, y + 0.01, -0.2635);       // label slot
  }
  for (const x of [-0.38, 0.38]) for (const z of [-0.2, 0.2]) {
    box3(0.06, 0.008, 0.06, TM.forged(), g, x, 0.098, z);
    rbox(0.03, 0.05, 0.05, TM.forged(), g, x, 0.07, z, 0.004);
    G3.rodX(0.036, 0.026, mat('#1a1c1f', { rough: 0.8 }), g, 0.037, z).geometry.translate(x, 0, 0);
  }
  tube([[0.45, 0.82, -0.16], [0.49, 0.82, -0.16], [0.5, 0.82, 0], [0.49, 0.82, 0.16], [0.45, 0.82, 0.16]], 0.009, steel, g, 20);
  return g;
}

/** ตู้เหล็กเก็บของ 2 บาน — ช่องระบายอากาศ มือจับ กุญแจ ฐานตู้ */
export function cabinet(w = 0.9, h = 1.8, d = 0.45, color = '#d6dde4') {
  const g = new THREE.Group();
  const m = mat(color, { rough: 0.45, metal: 0.5 }), dark = mat('#5b6670', { rough: 0.6, metal: 0.4 });
  rbox(w, h - 0.06, d, m, g, 0, h / 2 + 0.03, 0, 0.012);
  box3(w - 0.04, 0.06, d - 0.04, dark, g, 0, 0.03, 0);
  const dw = (w - 0.03) / 2;
  for (const s of [-1, 1]) {
    rbox(dw, h - 0.16, 0.012, m, g, s * (dw / 2 + 0.005), h / 2 + 0.03, -d / 2 - 0.004, 0.004);
    for (let i = 0; i < 6; i++) box3(dw - 0.14, 0.008, 0.006, dark, g, s * (dw / 2 + 0.005), h - 0.22 - i * 0.03, -d / 2 - 0.011);
    for (let i = 0; i < 4; i++) box3(dw - 0.14, 0.008, 0.006, dark, g, s * (dw / 2 + 0.005), 0.24 + i * 0.03, -d / 2 - 0.011);
    rbox(0.016, 0.16, 0.022, TM.chrome(), g, s * 0.035, h * 0.55, -d / 2 - 0.02, 0.006);
  }
  turned([[-0.004, 0], [-0.004, 0.009], [0.012, 0.009], [0.012, 0]], TM.chrome(), g, { x: 0.035, y: h * 0.55 + 0.11, seg: 16 }).geometry.translate(0, 0, -d / 2 - 0.006);
  return g;
}

/** ต้นลิ้นมังกรในกระถางดินเผา — ใบเรียวยาวลายแถบ ขอบเหลือง */
export function plant() {
  const g = new THREE.Group();
  vlathe([[0, 0], [0, 0.105], [0.012, 0.11], [0.24, 0.135], [0.25, 0.145], [0.272, 0.15], [0.28, 0.146], [0.28, 0.136], [0.268, 0.134], [0.26, 0]], mat('#c06a3e', { rough: 0.85 }), g, 0, 0, 0, 32);
  cylY(0.13, 0.13, 0.01, mat('#3b2a1d', { rough: 1 }), g, 0, 0.255, 0, 24);
  const leafMat = decalMat('snake-leaf', 64, 256, (c, W, H) => {
    c.fillStyle = '#2d6a35'; c.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 22) { c.fillStyle = 'rgba(160,200,140,0.45)'; c.fillRect(0, y, W, 6 + (y % 3)); }
    c.fillStyle = '#d9c24a'; c.fillRect(0, 0, 7, H); c.fillRect(W - 7, 0, 7, H);
  }, { rough: 0.55 });
  leafMat.transparent = false; leafMat.depthWrite = true; leafMat.side = THREE.DoubleSide;
  leafMat.map.wrapS = leafMat.map.wrapT = THREE.RepeatWrapping; leafMat.map.repeat.set(18, 3); leafMat.map.offset.set(0.5, 0);
  const r = rng(5);
  for (let i = 0; i < 9; i++) {
    const L = 0.45 + r() * 0.3, w = 0.045 + r() * 0.015;
    const s = new THREE.Shape();
    s.moveTo(-w * 0.35, 0); s.quadraticCurveTo(-w * 0.62, L * 0.45, 0, L); s.quadraticCurveTo(w * 0.62, L * 0.45, w * 0.35, 0); s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.003, bevelEnabled: false, curveSegments: 8 });
    const a = (i / 9) * Math.PI * 2 + r() * 0.5, tilt = 0.08 + r() * 0.22;
    geo.rotateX(-tilt); geo.rotateY(a); geo.translate(Math.sin(a) * 0.04, 0.25, Math.cos(a) * 0.04);
    add(geo, leafMat, g);
  }
  return g;
}

/** กระดานไวท์บอร์ด — กรอบอะลูมิเนียม รางวางปากกา ปากกาไวท์บอร์ด 3 สี แปรงลบ. userData.face = ผิวกระดาน */
export function whiteboard(w = 2.4, h = 1.2, tex = null) {
  const g = new THREE.Group();
  const alu = shiny(mat('#d5dbe0', { rough: 0.3, metal: 0.9 }), 1.4);
  box3(w, h, 0.012, mat('#8f99a3', { rough: 0.6 }), g, 0, 0, 0.004);
  for (const s of [-1, 1]) {
    rbox(w + 0.06, 0.03, 0.036, alu, g, 0, s * (h / 2 + 0.015), -0.006, 0.006);
    rbox(0.03, h, 0.036, alu, g, s * (w / 2 + 0.015), 0, -0.006, 0.006);
  }
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, map: tex }));
  face.position.z = -0.021 + 0.018; face.rotation.y = Math.PI;
  g.add(face);
  rbox(w * 0.6, 0.012, 0.075, alu, g, 0, -h / 2 - 0.05, -0.045, 0.004);
  rbox(w * 0.6, 0.025, 0.006, alu, g, 0, -h / 2 - 0.04, -0.082, 0.002);
  ['#1d2733', '#c0392b', '#2a64c8'].forEach((c, i) => {
    const x = -w * 0.18 + i * 0.16;
    const body = new THREE.CylinderGeometry(0.009, 0.009, 0.11, 12); body.rotateZ(Math.PI / 2); body.translate(x, -h / 2 - 0.035, -0.05); add(body, mat('#f4f4f2', { rough: 0.4 }), g);
    const cap = new THREE.CylinderGeometry(0.0095, 0.0095, 0.035, 12); cap.rotateZ(Math.PI / 2); cap.translate(x + 0.068, -h / 2 - 0.035, -0.05); add(cap, TM.plastic(c), g);
  });
  rbox(0.13, 0.025, 0.05, mat('#2f3640', { rough: 0.9 }), g, w * 0.22, -h / 2 - 0.03, -0.05, 0.006);
  rbox(0.13, 0.012, 0.05, mat('#dcdcdc', { rough: 1 }), g, w * 0.22, -h / 2 - 0.042, -0.05, 0.003);
  g.userData.face = face;
  return g;
}

/** บันไดทรง A อะลูมิเนียม 3 ขั้น — ขั้นกันลื่น แท่นบนพลาสติก ขาค้ำ ยางรองขา ป้ายเตือน (ขั้นอยู่ด้าน +Z) */
export function ladder() {
  const g = new THREE.Group();
  const al = shiny(mat('#c9d0d6', { rough: 0.35, metal: 0.9 }), 1.4);
  const rail = (x0, z0, x1, y1, z1, w, d) => {
    const dy = y1, dz = z1 - z0, L = Math.hypot(dy, dz);
    rboxR(w, L, d, al, g, [(x0 + x1) / 2, dy / 2, (z0 + z1) / 2], [Math.atan2(dz, dy), 0, 0], 0.004);
    rboxR(w + 0.006, 0.04, d + 0.012, capMat(), g, [x0, 0.02, z0], [Math.atan2(dz, dy), 0, 0], 0.006);   // rubber foot
  };
  for (const s of [-1, 1]) { rail(s * 0.225, 0.27, s * 0.205, 1.17, 0.06, 0.05, 0.022); rail(s * 0.225, -0.3, s * 0.205, 1.15, -0.02, 0.036, 0.02); }
  const zAt = (y) => 0.27 - 0.21 * (y / 1.17);
  for (const y of [0.3, 0.62, 0.94]) {
    const z = zAt(y) - 0.04;
    rbox(0.42, 0.026, 0.095, al, g, 0, y, z, 0.004);
    for (let i = 0; i < 4; i++) box3(0.4, 0.003, 0.006, capMat(), g, 0, y + 0.0135, z - 0.033 + i * 0.022);
  }
  rbox(0.5, 0.05, 0.3, TM.plastic('#e8762b'), g, 0, 1.18, 0.02, 0.012);
  rbox(0.2, 0.012, 0.08, mat('#3a2410', { rough: 0.9 }), g, 0, 1.2, 0.04, 0.004);     // tool slot
  for (const s of [-1, 1]) tube([[s * 0.21, 0.56, 0.17], [s * 0.21, 0.545, 0.0], [s * 0.21, 0.56, -0.17]], 0.005, mat('#3a3f45', { rough: 0.5, metal: 0.6 }), g, 8);
  const warn = label('ladder-warn', (c, W, H) => {
    c.fillStyle = '#ffd23f'; c.fillRect(0, 0, W, H); c.fillStyle = '#1d1f22'; c.fillRect(0, 0, W, 10); c.fillRect(0, H - 10, W, 10);
    c.font = `800 40px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('ห้ามยืนบนแท่นบนสุด', W / 2, H / 2);
  }, 512, 96, 0.5);
  plate(warn, 0.3, 0.0375, g, [0, 1.18, 0.1705], [0, 0, 0]);                       // on the front edge of the top cap
  bake(g);
  return g;
}

/** กระเป๋าช่างผ้าใบปากกว้าง — ฐานยาง กระเป๋าข้างมีด้ามเครื่องมือโผล่ หูหิ้วสองข้างหุ้มยาง */
export function toolBag() {
  const g = new THREE.Group();
  const cloth = mat('#1d3060', { rough: 0.92 }), cloth2 = mat('#16264d', { rough: 0.92 }), trim = mat('#f2b705', { rough: 0.8 }), black = mat('#1a1c1f', { rough: 0.8 });
  rbox(0.56, 0.22, 0.26, cloth, g, 0, 0.12, 0, 0.035);
  rbox(0.57, 0.035, 0.27, black, g, 0, 0.018, 0, 0.012);
  rbox(0.565, 0.026, 0.265, trim, g, 0, 0.236, 0, 0.008);
  box3(0.5, 0.004, 0.2, mat('#090b10', { rough: 1 }), g, 0, 0.2495, 0);
  for (const s of [-1, 1]) {
    rbox(0.42, 0.13, 0.025, cloth2, g, 0, 0.1, s * 0.135, 0.01);
    box3(0.42, 0.012, 0.027, trim, g, 0, 0.166, s * 0.135);
  }
  const r = rng(9);
  ['#f2b705', '#d23b2a', '#2a64c8', '#1d1f22'].forEach((c, i) => {
    const x = -0.15 + i * 0.1;
    const hd = new THREE.CylinderGeometry(0.011, 0.013, 0.08, 10); hd.rotateX((r() - 0.5) * 0.25); hd.translate(x, 0.18, -0.135 + (r() - 0.5) * 0.01);
    add(hd, TM.plastic(c), g);
  });
  for (const z of [-0.06, 0.06]) {
    tube([[-0.13, 0.245, z], [-0.115, 0.33, z], [-0.05, 0.36, z], [0.05, 0.36, z], [0.115, 0.33, z], [0.13, 0.245, z]], 0.0075, black, g, 24);
    tube([[-0.06, 0.358, z], [0, 0.361, z], [0.06, 0.358, z]], 0.013, mat('#2a2d31', { rough: 0.9 }), g, 8);
  }
  bake(g);
  return g;
}

/** สวิตช์ไฟติดผนังแบบกดกระดก (หน้าสวิตช์ด้าน −Z). Returns { group, toggle } — toggle หมุนรอบแกน X */
export function lightSwitch() {
  const g = new THREE.Group();
  rbox(0.078, 0.122, 0.01, mat('#f6f5f1', { rough: 0.4 }), g, 0, 0, 0, 0.004);
  rbox(0.05, 0.075, 0.004, mat('#ebe9e3', { rough: 0.45 }), g, 0, 0, -0.006, 0.002);
  const t = new THREE.Group(); t.position.set(0, 0, -0.012); g.add(t);         // the rocker: turns about X
  rbox(0.038, 0.058, 0.012, mat('#fbfaf6', { rough: 0.35 }), t, 0, 0, 0, 0.004);
  const dot = new THREE.CylinderGeometry(0.003, 0.003, 0.002, 12); dot.rotateX(Math.PI / 2); dot.translate(0, 0.018, -0.0062); add(dot, mat('#ff8a2b', { rough: 0.3, emissive: '#ff6a00', ei: 0.6 }), t);
  for (const y of [-0.05, 0.05]) { const s = new THREE.CylinderGeometry(0.0035, 0.0035, 0.002, 14); s.rotateX(Math.PI / 2); s.translate(0, y, -0.0055); add(s, TM.chrome(), g); }
  bake(g);
  return { group: g, toggle: t };
}

// ======================================================================
// อุปกรณ์ประจำห้อง (พัดลมเพดาน ประตู ปลั๊กพ่วง โคมไฟ อ่างล้างมือ ก๊อกน้ำ วาล์วเปิดปิดน้ำ ท่อน้ำทิ้ง)
// ======================================================================
// fixtures sit in dim corners: a touch of diffuse keeps polished chrome from reading as black
const chromeM = () => shiny(mat('#eef2f5', { rough: 0.18, metal: 0.88 }), 2.0);

/** พัดลมเพดาน — ฝาครอบเพดาน ก้านแขวน ตัวมอเตอร์ ใบพัดโลหะ 3 ใบ. Returns { group, rotor } (rotor หมุนรอบแกน Y) */
export function ceilingFanModel() {
  const g = new THREE.Group();
  const cream = mat('#efeae0', { rough: 0.4 }), bladeM = mat('#ece6da', { rough: 0.5, side: THREE.DoubleSide });
  vlathe([[-0.06, 0], [-0.06, 0.03], [-0.035, 0.062], [-0.008, 0.075], [0, 0.075], [0.0001, 0]], cream, g, 0, 0, 0, 24);
  cylY(0.011, 0.011, 0.3, cream, g, 0, -0.2, 0, 10);
  vlathe([[-0.4, 0], [-0.4, 0.05], [-0.39, 0.1], [-0.37, 0.125], [-0.345, 0.13], [-0.33, 0.12], [-0.32, 0.08], [-0.31, 0.035], [-0.305, 0]], cream, g, 0, 0, 0, 32);
  bake(g);
  const rot = new THREE.Group(); rot.position.y = -0.42; g.add(rot);
  vlathe([[-0.035, 0], [-0.035, 0.03], [-0.02, 0.07], [0.018, 0.085], [0.02, 0]], cream, rot, 0, 0, 0, 28);
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    const s = new THREE.Shape();
    s.moveTo(0.14, -0.045); s.lineTo(0.62, -0.062); s.quadraticCurveTo(0.68, -0.06, 0.685, 0); s.quadraticCurveTo(0.68, 0.06, 0.62, 0.062); s.lineTo(0.14, 0.045); s.closePath();
    const blade = new THREE.ExtrudeGeometry(s, { depth: 0.005, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 1, curveSegments: 8 });
    blade.rotateX(-Math.PI / 2); blade.rotateX(0.14); blade.rotateY(a);
    add(blade, bladeM, rot);
    const iron = new THREE.BoxGeometry(0.11, 0.008, 0.03); iron.translate(0.12, -0.002, 0); iron.rotateY(a); add(iron, chromeM(), rot);
  }
  bake(rot);
  return { group: g, rotor: rot };
}

/** ประตูไม้บานเปิด — วงกบ ลูกฟักบนบาน มือจับก้านโยกพร้อมฝาครอบ แผ่นกันกระแทก บานพับ 3 ตัว (ด้านหน้า +Z) */
export function doorModel(color = '#2f6fc4') {
  const g = new THREE.Group();
  const paint = mat(color, { rough: 0.5 }), trim = mat('#e9eef2', { rough: 0.5 });
  const panel = new THREE.Color(color).multiplyScalar(0.86);
  for (const s of [-1, 1]) rbox(0.07, 2.17, 0.06, trim, g, s * 0.535, 1.085, 0.0, 0.006);
  rbox(1.14, 0.07, 0.06, trim, g, 0, 2.135, 0.0, 0.006);
  rbox(1.0, 2.1, 0.045, paint, g, 0, 1.05, 0.0225, 0.004);
  const pm = mat(`#${panel.getHexString()}`, { rough: 0.5 });
  for (const [y, h] of [[1.52, 0.86], [0.56, 0.7]]) {
    rbox(0.74, h, 0.006, pm, g, 0, y, 0.046, 0.003);
    rbox(0.78, 0.018, 0.01, paint, g, 0, y + h / 2 + 0.009, 0.047, 0.003);
    rbox(0.78, 0.018, 0.01, paint, g, 0, y - h / 2 - 0.009, 0.047, 0.003);
  }
  const ch = chromeM();
  const rose = lathe([[0, 0], [0, 0.028], [0.006, 0.026], [0.009, 0.012], [0.01, 0]], 24); rose.rotateX(Math.PI / 2); rose.translate(0.38, 1.0, 0.045); add(rose, ch, g);
  const neck = new THREE.CylinderGeometry(0.009, 0.009, 0.05, 14); neck.rotateX(Math.PI / 2); neck.translate(0.38, 1.0, 0.07); add(neck, ch, g);
  rboxR(0.13, 0.019, 0.019, ch, g, [0.33, 1.0, 0.093], [0, 0, 0], 0.008);
  rbox(0.03, 0.06, 0.004, ch, g, 0.38, 0.9, 0.047, 0.002);
  rbox(0.9, 0.18, 0.003, TM.satin(), g, 0, 0.11, 0.0465, 0.001);
  for (const y of [0.25, 1.05, 1.85]) rbox(0.016, 0.1, 0.012, ch, g, -0.502, y, 0.03, 0.003);
  bake(g);
  return g;
}

/** ปลั๊กพ่วง 3 ช่องมีสวิตช์ + หัวปลั๊ก. Returns { strip, plug } (plug เลื่อนได้ตอนถอดปลั๊ก) */
export function powerStrip() {
  const strip = new THREE.Group();
  const white = mat('#f3f3f0', { rough: 0.35 });
  rbox(0.24, 0.045, 0.075, white, strip, 0, 0.0225, 0, 0.012);
  const socket = label('socket-th', (c, W, H) => {
    c.fillStyle = '#e6e6e2'; c.beginPath(); c.arc(W / 2, H / 2, W * 0.44, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#1a1c1f';
    c.fillRect(W * 0.3, H * 0.32, W * 0.08, H * 0.3); c.fillRect(W * 0.62, H * 0.32, W * 0.08, H * 0.3);
    c.beginPath(); c.arc(W / 2, H * 0.72, W * 0.07, 0, Math.PI * 2); c.fill();
  }, 128, 128, 0.4);
  for (const x of [-0.07, 0.0, 0.07]) plate(socket, 0.045, 0.045, strip, [x - 0.02, 0.0455, 0], [-Math.PI / 2, 0, 0]);
  rbox(0.02, 0.012, 0.03, mat('#d23b2a', { rough: 0.3, emissive: '#ff2a1a', ei: 0.35 }), strip, 0.095, 0.047, 0, 0.003);
  bake(strip);
  // plug pushed into the left socket from above (blades down); it carries its own cable stub
  const plug = new THREE.Group();
  rbox(0.036, 0.034, 0.03, mat('#1a1c1f', { rough: 0.5 }), plug, 0, 0, 0, 0.008);
  for (const x of [-0.0065, 0.0065]) rbox(0.0022, 0.016, 0.0065, chromeM(), plug, x, -0.025, 0, 0.0006);
  tube([[0, 0.016, 0], [0, 0.04, 0.005], [0.03, 0.02, 0.05], [0.08, -0.045, 0.09]], 0.005, mat('#1a1c1f', { rough: 0.6 }), plug, 16);
  bake(plug);
  return { strip, plug };
}

/** โคมไฟห้อยเพดาน (เติมลงกลุ่ม lamp): ฝาครอบเพดาน สายไฟ ขั้วหลอด E27 โป๊ะโลหะเคลือบขาว. Returns ขั้วหลอด (mesh ที่ y −0.24) */
export function pendantLampParts(lamp) {
  const white = mat('#f4f4f0', { rough: 0.35 });
  vlathe([[-0.045, 0], [-0.045, 0.1], [-0.03, 0.12], [-0.005, 0.125], [0, 0.125], [0.0001, 0]], white, lamp, 0, 0, 0, 32);
  cylY(0.0035, 0.0035, 0.17, mat('#1a1c1f', { rough: 0.5 }), lamp, 0, -0.13, 0, 8);
  const shade = lathe([[-0.345, 0.205], [-0.338, 0.21], [-0.33, 0.2], [-0.29, 0.15], [-0.25, 0.09], [-0.225, 0.045], [-0.215, 0.032]], 40);
  add(shade, mat('#ffffff', { rough: 0.3, side: THREE.DoubleSide }), lamp);
  const ring = new THREE.TorusGeometry(0.205, 0.004, 6, 48); ring.rotateX(Math.PI / 2); ring.translate(0, -0.343, 0); add(ring, mat('#2f5a3e', { rough: 0.35 }), lamp);
  const socket = new THREE.Mesh(lathe([[-0.27, 0], [-0.27, 0.021], [-0.265, 0.024], [-0.235, 0.025], [-0.215, 0.022], [-0.21, 0.012], [-0.209, 0]], 24, (a, h) => (h > -0.255 && h < -0.225 ? 1 + 0.03 * Math.max(0, Math.cos(a * 12)) : 1)), mat('#f0ede4', { rough: 0.4 }));
  socket.geometry.translate(0, 0.24, 0); socket.position.y = -0.24;
  lamp.add(socket);
  return socket;
}

/** อ่างล้างมือเซรามิกวางบนเคาน์เตอร์ ทรงรี มีสะดือท่อน้ำทิ้งโครเมียม — จุดกำเนิดที่ก้นอ่าง */
export function basinModel() {
  const g = new THREE.Group();
  const ceramic = shiny(mat('#fbfbf9', { rough: 0.12, side: THREE.DoubleSide }), 1.3);
  const bowl = lathe([[0.012, 0], [0.012, 0.06], [0.022, 0.12], [0.048, 0.163], [0.082, 0.183], [0.104, 0.188], [0.11, 0.194], [0.107, 0.2], [0.09, 0.198], [0.05, 0.178], [0.02, 0.14], [0.006, 0.1], [0, 0.07], [0.0001, 0]], 48);
  bowl.scale(1, 1, 0.8);
  add(bowl, ceramic, g);
  vlathe([[0.0125, 0], [0.0125, 0.019], [0.0145, 0.017], [0.0146, 0]], chromeM(), g, 0, 0, 0, 24);
  return g;
}

/** ก๊อกน้ำแบบตั้งบนเคาน์เตอร์ (ซีลยางด้านใน) — ฐาน ตัวก๊อก ปากก๊อกโค้ง หัวก๊อก (ฝาครอบหกเหลี่ยม + ด้ามจับสี่แฉก).
 *  Returns { group, head, handle, nozzle } — head อยู่ที่ y 0.2 ถอดออกได้, nozzle (ปลายปากก๊อก) ที่ (0, 0.15, 0.17) */
export function pillarTap() {
  const g = new THREE.Group();
  const ch = chromeM();
  vlathe([[0, 0], [0, 0.032], [0.006, 0.031], [0.01, 0.026], [0.012, 0]], ch, g, 0, 0, 0, 32);
  vlathe([[0.01, 0], [0.01, 0.024], [0.06, 0.021], [0.12, 0.02], [0.17, 0.021], [0.185, 0.02], [0.186, 0]], ch, g, 0, 0, 0, 28);
  tube([[0, 0.16, 0.015], [0, 0.175, 0.07], [0, 0.172, 0.13], [0, 0.158, 0.168]], 0.0115, ch, g, 24);
  const nozzle = new THREE.Mesh(lathe([[-0.02, 0], [-0.02, 0.0118], [0.002, 0.012], [0.003, 0.0105], [0.0032, 0]], 24), ch);
  nozzle.position.set(0, 0.15, 0.17);
  bake(g);
  g.add(nozzle);   // kept on its own: drips start from its world position
  const head = new THREE.Group(); head.position.set(0, 0.2, 0); g.add(head);
  const hex = new THREE.CylinderGeometry(0.019, 0.019, 0.022, 6); hex.translate(0, -0.006, 0); add(hex, ch, head);
  vlathe([[0.005, 0], [0.005, 0.016], [0.02, 0.014], [0.03, 0.008], [0.034, 0]], ch, head, 0, 0, 0, 24);
  const handle = new THREE.Group(); handle.position.y = 0.032; head.add(handle);
  for (let i = 0; i < 4; i++) {
    const arm = lathe([[0, 0], [0, 0.007], [0.045, 0.0055], [0.05, 0.0075], [0.056, 0.006], [0.058, 0]], 14);
    arm.rotateZ(-Math.PI / 2); arm.rotateY((i * Math.PI) / 2 + Math.PI / 4); add(arm, ch, handle);
  }
  vlathe([[0, 0], [0, 0.012], [0.008, 0.011], [0.011, 0]], ch, handle, 0, 0, 0, 20);
  const dot = new THREE.CylinderGeometry(0.008, 0.008, 0.002, 18); dot.translate(0, 0.0115, 0); add(dot, TM.plastic('#2a64c8'), handle);
  return { group: g, head, handle, nozzle };
}

/** วาล์วเปิด-ปิดน้ำใต้อ่าง (สต็อปวาล์ว) + ท่อน้ำดีจากผนัง + สายน้ำดีถักขึ้นไปที่ก๊อก.
 *  Returns { group, handle } — handle หมุนรอบแกน Z (π/2 = ปิด). hose ปลายไปที่ (−0.25, 0.22, −0.19) */
export function angleValve() {
  const g = new THREE.Group();
  const ch = chromeM();
  tube([[0, -0.15, -0.22], [0, -0.05, -0.22], [0, -0.005, -0.2], [0, 0, -0.14], [0, 0, -0.05]], 0.009, ch, g, 20);
  turned([[-0.05, 0], [-0.05, 0.0165], [-0.035, 0.0165], [-0.032, 0.014], [0.03, 0.014], [0.034, 0.0165], [0.05, 0.0165], [0.0502, 0]], ch, g, { seg: 6 });
  turned([[-0.035, 0], [-0.035, 0.016], [0.035, 0.016], [0.0352, 0]], ch, g, { seg: 24 });
  vlathe([[0.012, 0], [0.012, 0.012], [0.03, 0.012], [0.032, 0.0135], [0.045, 0.0135], [0.046, 0]], ch, g, 0, 0, 0, 6);
  const braid = decalMat('braid', 64, 64, (c, W, H) => {
    c.fillStyle = '#9aa3ab'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#e8edf1'; c.lineWidth = 3;
    for (let i = -W; i < W * 2; i += 8) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + W, H); c.stroke(); c.beginPath(); c.moveTo(i + W, 0); c.lineTo(i, H); c.stroke(); }
  }, { rough: 0.35, metal: 0.8 });
  braid.transparent = false; braid.depthWrite = true; braid.map.wrapS = braid.map.wrapT = THREE.RepeatWrapping; braid.map.repeat.set(60, 3);
  shiny(braid, 1.4);
  tube([[0, 0.045, 0], [0, 0.11, 0.005], [-0.08, 0.18, -0.07], [-0.2, 0.205, -0.17], [-0.25, 0.22, -0.19]], 0.0072, braid, g, 40);
  bake(g);
  const handle = new THREE.Group(); handle.position.set(0, 0, 0.08); g.add(handle);
  const stem = new THREE.CylinderGeometry(0.006, 0.006, 0.035, 12); stem.rotateX(Math.PI / 2); stem.translate(0, 0, -0.018); add(stem, ch, handle);
  rboxR(0.05, 0.024, 0.014, ch, handle, [0, 0, 0], [0, 0, 0], 0.01);
  const cap = new THREE.CylinderGeometry(0.008, 0.008, 0.002, 18); cap.rotateX(Math.PI / 2); cap.translate(0, 0, 0.0075); add(cap, TM.plastic('#2a64c8'), handle);
  return { group: g, handle };
}

/** ท่อน้ำทิ้งใต้อ่าง (ท่อพีวีซีขาวคอห่าน) ไหลลงแล้วเข้าผนังด้านหลัง (−Z) */
export function pTrap(parent, x, yTop, z, wallZ) {
  const pvc = mat('#eef0f2', { rough: 0.35 });
  tube([[x, yTop, z], [x, yTop - 0.2, z], [x, yTop - 0.27, z - 0.035], [x, yTop - 0.235, z - 0.08], [x, yTop - 0.2, z - 0.1], [x, yTop - 0.2, wallZ]], 0.018, pvc, parent, 32);
  const nut = new THREE.CylinderGeometry(0.024, 0.024, 0.02, 20); nut.translate(x, yTop - 0.03, z); add(nut, pvc, parent);
}
