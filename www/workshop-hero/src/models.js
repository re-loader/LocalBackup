import * as THREE from 'three';
import { woodTex } from './textures.js';

// โมเดลทั้งหมดสร้างจากรูปทรงพื้นฐาน — เครื่องมือ วัสดุ PPE เฟอร์นิเจอร์ และตัวละคร
// เครื่องมือทุกชิ้นวางด้ามที่จุดกำเนิด และชี้ไปทาง -Z (ไปข้างหน้าจากมือ)

const mats = new Map();
export function mat(color, { rough = 0.7, metal = 0, emissive = null, ei = 1, map = null, transparent = false, opacity = 1, side = THREE.FrontSide } = {}) {
  const key = [color, rough, metal, emissive, ei, map?.uuid, transparent, opacity, side].join('|');
  if (!mats.has(key)) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, map, transparent, opacity, side });
    if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = ei; }
    mats.set(key, m);
  }
  return mats.get(key);
}
export const M = {
  steel: () => mat('#b9c2cc', { rough: 0.35, metal: 0.8 }),
  dark: () => mat('#2b3138', { rough: 0.6, metal: 0.3 }),
  black: () => mat('#16191d', { rough: 0.8 }),
  white: () => mat('#f4f4f2', { rough: 0.6 }),
  wood: () => mat('#ffffff', { rough: 0.75, map: woodTex('#c8935a', 1) }),
  woodDark: () => mat('#ffffff', { rough: 0.75, map: woodTex('#8a5a33', 1) }),
};

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
/** Cylinder lying along Z (from z0 to z1). */
function rodZ(r, z0, z1, material, parent, x = 0, y = 0, seg = 12) {
  const m = cyl(r, r, Math.abs(z1 - z0), material, x, y, (z0 + z1) / 2, parent, seg);
  m.rotation.x = Math.PI / 2;
  return m;
}

// ======================================================================
// เครื่องมือ
// ======================================================================
const TOOL_BUILDERS = {
  hammer(g) {
    rodZ(0.014, 0.02, -0.2, mat('#d23b2a', { rough: 0.5 }), g);
    rodZ(0.011, -0.2, -0.3, M.wood(), g);
    const head = box(0.11, 0.032, 0.032, M.steel(), -0.015, 0, -0.31, g);
    const face = cyl(0.019, 0.019, 0.03, M.steel(), 0.055, 0, -0.31, g);
    face.rotation.z = Math.PI / 2;
    const claw = box(0.07, 0.012, 0.028, M.steel(), -0.085, 0.012, -0.31, g);
    claw.rotation.z = 0.35;
    return head;
  },
  screwdriver(g) {
    rodZ(0.017, 0.02, -0.1, mat('#f2b705', { rough: 0.45 }), g, 0, 0, 8);
    rodZ(0.012, -0.03, -0.07, mat('#1c1c1c'), g, 0, 0, 8);
    rodZ(0.0045, -0.1, -0.23, M.steel(), g);
    box(0.012, 0.003, 0.02, M.steel(), 0, 0, -0.235, g);
  },
  wrench(g) {
    box(0.024, 0.007, 0.2, M.steel(), 0, 0, -0.1, g);
    for (const [z, r] of [[0.01, 0.022], [-0.215, 0.026]]) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.008, 6, 14, Math.PI * 1.45), M.steel());
      t.rotation.x = Math.PI / 2; t.rotation.z = Math.PI * 0.77;
      t.position.set(0, 0, z + (z < 0 ? -0.01 : 0.01));
      g.add(t);
    }
  },
  adjwrench(g) {
    box(0.026, 0.012, 0.16, mat('#c8343a', { rough: 0.5 }), 0, 0, -0.06, g);
    box(0.022, 0.009, 0.08, M.steel(), 0, 0, -0.17, g);
    box(0.06, 0.016, 0.04, M.steel(), 0.012, 0, -0.225, g);
    box(0.016, 0.016, 0.03, M.steel(), 0.035, 0, -0.255, g);
    cyl(0.008, 0.008, 0.02, M.dark(), -0.005, 0, -0.2, g, 10).rotation.z = Math.PI / 2;
  },
  saw(g) {
    box(0.03, 0.09, 0.11, mat('#f2b705', { rough: 0.45 }), 0, -0.02, -0.03, g);
    box(0.002, 0.075, 0.36, M.steel(), 0, -0.035, -0.26, g);
    box(0.003, 0.012, 0.36, mat('#8d969e', { rough: 0.4, metal: 0.8 }), 0, -0.075, -0.26, g);
  },
  tape(g) {
    const c = cyl(0.04, 0.04, 0.034, mat('#f2c500', { rough: 0.4 }), 0, 0, -0.04, g, 20);
    c.rotation.z = Math.PI / 2;
    box(0.036, 0.02, 0.03, mat('#1c1c1c'), 0, -0.03, -0.04, g);
    box(0.02, 0.002, 0.07, mat('#ffe066', { rough: 0.3, metal: 0.4 }), 0, -0.035, -0.1, g);
    box(0.022, 0.012, 0.003, M.steel(), 0, -0.03, -0.135, g);
  },
  pliers(g) {
    for (const s of [-1, 1]) {
      const h = box(0.016, 0.012, 0.13, mat(s < 0 ? '#d23b2a' : '#2a64c8', { rough: 0.5 }), s * 0.014, 0, -0.04, g);
      h.rotation.y = s * 0.12;
    }
    cyl(0.012, 0.012, 0.02, M.steel(), 0, 0, -0.115, g, 10);
    for (const s of [-1, 1]) {
      const j = box(0.01, 0.01, 0.07, M.steel(), s * 0.005, 0, -0.15, g);
      j.rotation.y = -s * 0.08;
    }
  },
  drill(g) {
    const blue = mat('#1f6fd1', { rough: 0.45 });
    box(0.045, 0.12, 0.05, blue, 0, -0.04, 0.0, g);           // grip
    box(0.06, 0.03, 0.06, mat('#1c1c1c'), 0, -0.11, 0.0, g);  // battery
    box(0.05, 0.065, 0.17, blue, 0, 0.045, -0.06, g);         // body
    rodZ(0.017, -0.145, -0.19, mat('#1c1c1c'), g, 0, 0.045);  // chuck
    rodZ(0.0035, -0.19, -0.26, M.steel(), g, 0, 0.045);       // bit
    box(0.012, 0.022, 0.012, mat('#f2b705'), 0, 0.0, -0.032, g); // trigger
  },
  caulk(g) {
    box(0.03, 0.1, 0.04, mat('#d23b2a', { rough: 0.5 }), 0, -0.035, 0, g);
    rodZ(0.024, -0.02, -0.25, M.white(), g, 0, 0.035);
    rodZ(0.006, -0.25, -0.3, M.white(), g, 0, 0.035, 8);
    box(0.012, 0.012, 0.25, M.steel(), 0, 0.0, -0.13, g);
  },
};

const ITEM_BUILDERS = {
  bulb(g, lit = false) {
    const glass = new THREE.MeshStandardMaterial({ color: '#fffbe8', roughness: 0.2, transparent: true, opacity: 0.85, emissive: '#ffe9a8', emissiveIntensity: lit ? 2.2 : 0.05 });
    sph(0.035, glass, 0, 0, -0.06, g);
    cyl(0.018, 0.022, 0.03, glass, 0, 0, -0.03, g).rotation.x = Math.PI / 2;
    rodZ(0.014, 0.0, -0.025, M.steel(), g);
    g.userData.glass = glass;
  },
  washer(g) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.01, 10, 20), mat('#222', { rough: 0.9 }));
    t.rotation.x = Math.PI / 2; t.position.z = -0.03; g.add(t);
  },
  teflon(g) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.012, 8, 20), M.white());
    t.position.z = -0.03; g.add(t);
  },
  pvc(g) { rodZ(0.03, 0.05, -0.45, mat('#e9eef5', { rough: 0.4 }), g, 0, 0, 18); rodZ(0.034, -0.4, -0.48, mat('#2f6fc4', { rough: 0.4 }), g); },
  wood(g) { box(0.12, 0.025, 0.55, M.wood(), 0, 0, -0.25, g); },
  nails(g) {
    box(0.1, 0.06, 0.07, mat('#d9c08a'), 0, 0, -0.04, g);
    for (let i = 0; i < 6; i++) cyl(0.002, 0.002, 0.05, M.steel(), -0.03 + (i % 3) * 0.03, 0.05, -0.03 - (i > 2 ? 0.02 : 0), g, 5);
  },
  screws(g) {
    box(0.1, 0.06, 0.07, mat('#9fc3e8'), 0, 0, -0.04, g);
    for (let i = 0; i < 6; i++) cyl(0.005, 0.002, 0.03, M.steel(), -0.03 + (i % 3) * 0.03, 0.04, -0.03 - (i > 2 ? 0.02 : 0), g, 6);
  },
  helmet(g) {
    const yel = mat('#ffc21a', { rough: 0.45 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), yel);
    g.add(dome);
    const brim = cyl(0.15, 0.15, 0.012, yel, 0.0, 0.0, -0.02, g, 24);
    brim.scale.set(1, 1, 1.15);
    box(0.02, 0.03, 0.24, yel, 0, 0.12, 0, g);
  },
  gloves(g) {
    const navy = mat('#1c2533', { rough: 0.85 });
    for (const s of [-1, 1]) {
      const p = sph(0.045, navy, s * 0.06, 0, -0.05, g, 12); p.scale.set(1, 0.55, 1.5);
      const t = sph(0.018, navy, s * 0.06 + s * 0.04, 0, -0.03, g, 8); t.scale.set(1, 0.8, 1.6);
      cyl(0.04, 0.042, 0.04, mat('#f2b705'), s * 0.06, 0, 0.03, g, 12).rotation.x = Math.PI / 2;
    }
  },
  goggles(g) {
    const frame = mat('#1c2533', { rough: 0.6 });
    const lens = new THREE.MeshStandardMaterial({ color: '#9fd8ff', roughness: 0.1, transparent: true, opacity: 0.55 });
    box(0.17, 0.06, 0.03, frame, 0, 0, 0, g);
    box(0.15, 0.045, 0.01, lens, 0, 0, -0.018, g);
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.006, 6, 20, Math.PI), mat('#2a64c8'));
    strap.rotation.x = Math.PI / 2; strap.position.z = 0.01; g.add(strap);
  },
};

/** Builds a tool / material / PPE model. Returns a Group (handle at origin, pointing -Z). */
export function makeItem(id, opts = {}) {
  const g = new THREE.Group();
  g.name = id;
  const b = TOOL_BUILDERS[id] || ITEM_BUILDERS[id];
  if (b) b(g, opts.lit);
  else box(0.06, 0.06, 0.06, mat('#888'), 0, 0, 0, g);
  g.userData.itemId = id;
  return g;
}

// ======================================================================
// เฟอร์นิเจอร์
// ======================================================================
export function schoolDesk() {
  const g = new THREE.Group();
  box(0.62, 0.03, 0.46, M.wood(), 0, 0.72, 0, g);
  box(0.56, 0.12, 0.4, mat('#5c6b78', { rough: 0.6, metal: 0.3 }), 0, 0.64, 0, g).scale.set(1, 0.15, 1);
  for (const x of [-0.27, 0.27]) for (const z of [-0.19, 0.19]) cyl(0.014, 0.014, 0.71, mat('#4b5965', { metal: 0.5, rough: 0.5 }), x, 0.355, z, g, 8);
  return g;
}

/** School chair. Returns { group, bolts[] } — bolts are the repair points. */
export function schoolChair({ bolts = false } = {}) {
  const g = new THREE.Group();
  const frame = mat('#4b5965', { metal: 0.5, rough: 0.5 });
  const seat = box(0.42, 0.025, 0.4, M.wood(), 0, 0.44, 0, g);
  box(0.42, 0.24, 0.022, M.wood(), 0, 0.72, 0.19, g);
  for (const x of [-0.19, 0.19]) {
    cyl(0.012, 0.012, 0.44, frame, x, 0.22, -0.17, g, 8);
    cyl(0.012, 0.012, 0.86, frame, x, 0.43, 0.17, g, 8);
  }
  box(0.4, 0.02, 0.02, frame, 0, 0.42, -0.17, g);
  box(0.4, 0.02, 0.02, frame, 0, 0.42, 0.17, g);
  const pts = [];
  if (bolts) {
    const hex = mat('#d7dde3', { metal: 0.85, rough: 0.3 });
    // 2 hex bolts through the side rails (wrench), 2 slotted screws on the seat (screwdriver)
    for (const [x, y, z, kind] of [[-0.2, 0.42, -0.17, 'hex'], [0.2, 0.42, 0.17, 'hex'], [-0.15, 0.457, 0.12, 'screw'], [0.15, 0.457, -0.12, 'screw']]) {
      const p = new THREE.Group();
      p.position.set(x, y, z);
      if (kind === 'hex') {
        const h = cyl(0.016, 0.016, 0.014, hex, 0, 0, 0, p, 6);
        h.rotation.z = Math.PI / 2;
        p.position.x += Math.sign(x) * 0.012;
      } else {
        cyl(0.011, 0.011, 0.005, hex, 0, 0, 0, p, 14);
        box(0.018, 0.006, 0.003, mat('#555'), 0, 0.002, 0, p);
        box(0.003, 0.006, 0.018, mat('#555'), 0, 0.002, 0, p);
      }
      p.userData.kind = kind;
      g.add(p);
      pts.push(p);
    }
  }
  return { group: g, bolts: pts, seat };
}

export function teacherDesk() {
  const g = new THREE.Group();
  box(1.4, 0.04, 0.7, M.woodDark(), 0, 0.76, 0, g);
  box(0.4, 0.72, 0.66, M.woodDark(), -0.48, 0.37, 0, g);
  for (let i = 0; i < 3; i++) box(0.36, 0.2, 0.01, mat('#a87449'), -0.48, 0.16 + i * 0.23, -0.335, g);
  box(0.04, 0.72, 0.66, M.woodDark(), 0.68, 0.37, 0, g);
  box(1.3, 0.5, 0.02, M.woodDark(), 0, 0.5, 0.31, g);
  // papers, cup, pen holder
  box(0.3, 0.01, 0.22, M.white(), 0.1, 0.785, -0.05, g).rotation.y = 0.2;
  box(0.28, 0.01, 0.2, mat('#fff7d6'), 0.12, 0.795, -0.04, g).rotation.y = -0.1;
  cyl(0.04, 0.035, 0.1, mat('#e2564a'), 0.5, 0.83, 0.1, g, 12);
  cyl(0.035, 0.035, 0.11, mat('#355c9b'), -0.4, 0.835, 0.15, g, 10);
  return g;
}

export function bookshelf(w = 1.2, h = 1.9, d = 0.35, rows = 4) {
  const g = new THREE.Group();
  const wd = M.woodDark();
  box(w, 0.03, d, wd, 0, h, 0, g);
  box(0.03, h, d, wd, -w / 2, h / 2, 0, g);
  box(0.03, h, d, wd, w / 2, h / 2, 0, g);
  box(w, h, 0.02, mat('#6b4428'), 0, h / 2, d / 2 - 0.01, g);
  const cols = ['#c0392b', '#2e86c1', '#f1c40f', '#27ae60', '#8e44ad', '#e67e22', '#1abc9c', '#ecf0f1', '#34495e'];
  for (let r = 0; r < rows; r++) {
    const y = 0.05 + r * (h / rows);
    box(w, 0.025, d, wd, 0, y, 0, g);
    let x = -w / 2 + 0.05;
    while (x < w / 2 - 0.12) {
      const bw = 0.03 + Math.random() * 0.04, bh = 0.2 + Math.random() * 0.12;
      if (Math.random() < 0.85) box(bw, bh, d * 0.8, mat(cols[(Math.random() * cols.length) | 0]), x + bw / 2, y + bh / 2 + 0.013, 0, g);
      x += bw + 0.004;
    }
  }
  return g;
}

export function workbench(w = 2, d = 0.8) {
  const g = new THREE.Group();
  box(w, 0.07, d, mat('#ffffff', { map: woodTex('#b98352', 6), rough: 0.8 }), 0, 0.86, 0, g);
  const leg = mat('#3b4a5a', { metal: 0.4, rough: 0.5 });
  for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) for (const z of [-d / 2 + 0.06, d / 2 - 0.06]) box(0.06, 0.83, 0.06, leg, x, 0.415, z, g);
  box(w - 0.1, 0.03, d - 0.1, mat('#8a6a48'), 0, 0.2, 0, g);
  return g;
}

/** Bench vise for the workshop look. */
export function vise() {
  const g = new THREE.Group();
  const blue = mat('#2f5fa8', { metal: 0.4, rough: 0.5 });
  box(0.16, 0.08, 0.12, blue, 0, 0.04, 0, g);
  box(0.16, 0.1, 0.04, blue, 0, 0.12, -0.05, g);
  box(0.16, 0.1, 0.04, blue, 0, 0.12, 0.08, g);
  rodZ(0.008, 0.1, 0.25, M.steel(), g, 0, 0.1);
  return g;
}

export function toolChest() {
  const g = new THREE.Group();
  const red = mat('#d0343a', { rough: 0.45, metal: 0.3 });
  box(0.9, 0.9, 0.5, red, 0, 0.45 + 0.08, 0, g);
  for (let i = 0; i < 5; i++) {
    box(0.84, 0.13, 0.01, mat('#b52a30', { rough: 0.45, metal: 0.3 }), 0, 0.2 + i * 0.16, -0.255, g);
    box(0.4, 0.02, 0.02, M.steel(), 0, 0.24 + i * 0.16, -0.27, g);
  }
  for (const x of [-0.38, 0.38]) for (const z of [-0.2, 0.2]) sph(0.04, M.black(), x, 0.04, z, g, 8);
  return g;
}

export function cabinet(w = 0.9, h = 1.8, d = 0.45, color = '#d6dde4') {
  const g = new THREE.Group();
  const m = mat(color, { rough: 0.5, metal: 0.3 });
  box(w, h, d, m, 0, h / 2, 0, g);
  box(0.005, h - 0.1, 0.01, mat('#8f99a3'), 0, h / 2, -d / 2 - 0.005, g);
  for (const x of [-0.05, 0.05]) box(0.015, 0.15, 0.02, M.steel(), x, h * 0.55, -d / 2 - 0.015, g);
  return g;
}

export function plant() {
  const g = new THREE.Group();
  cyl(0.14, 0.11, 0.28, mat('#c06a3e'), 0, 0.14, 0, g, 14);
  for (let i = 0; i < 7; i++) sph(0.14 + Math.random() * 0.06, mat(['#3d9b48', '#2f8a3d', '#58b257'][i % 3]), (Math.random() - 0.5) * 0.25, 0.45 + Math.random() * 0.35, (Math.random() - 0.5) * 0.25, g, 10);
  return g;
}

export function whiteboard(w = 2.4, h = 1.2, tex = null) {
  const g = new THREE.Group();
  box(w + 0.08, h + 0.08, 0.04, mat('#c5ccd3', { metal: 0.6, rough: 0.4 }), 0, 0, 0, g);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35, map: tex }));
  face.position.z = -0.021; face.rotation.y = Math.PI;
  g.add(face);
  box(w * 0.6, 0.03, 0.08, mat('#c5ccd3', { metal: 0.6, rough: 0.4 }), 0, -h / 2 - 0.05, -0.04, g);
  g.userData.face = face;
  return g;
}

export function ladder() {
  const g = new THREE.Group();
  const al = mat('#c7cdd3', { metal: 0.7, rough: 0.35 });
  for (const s of [-1, 1]) {
    const f = box(0.04, 1.2, 0.03, al, s * 0.22, 0.58, -0.2, g); f.rotation.x = 0.17;
    const b = box(0.04, 1.2, 0.03, al, s * 0.22, 0.58, 0.2, g); b.rotation.x = -0.17;
  }
  for (let i = 0; i < 3; i++) box(0.46, 0.03, 0.12, mat('#f2b705', { rough: 0.6 }), 0, 0.3 + i * 0.32, -0.15 + i * 0.05, g);
  box(0.5, 0.04, 0.28, mat('#f2b705', { rough: 0.6 }), 0, 1.18, 0, g);
  return g;
}

export function toolBag() {
  const g = new THREE.Group();
  const navy = mat('#1d3060', { rough: 0.85 });
  box(0.56, 0.24, 0.28, navy, 0, 0.12, 0, g);
  box(0.56, 0.03, 0.28, mat('#f2b705', { rough: 0.6 }), 0, 0.245, 0, g);
  const h = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.014, 8, 16, Math.PI), M.black());
  h.position.y = 0.26; g.add(h);
  return g;
}

/** Wall-mounted light switch. Returns { group, toggle } (toggle mesh flips). */
export function lightSwitch() {
  const g = new THREE.Group();
  box(0.09, 0.13, 0.015, M.white(), 0, 0, 0, g);
  const t = box(0.03, 0.05, 0.02, mat('#e9e9e9'), 0, 0, -0.015, g);
  return { group: g, toggle: t };
}

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
