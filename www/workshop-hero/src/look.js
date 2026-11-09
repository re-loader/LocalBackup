import * as THREE from 'three';

// ความสมจริงของภาพ: แสงสะท้อน (environment map) โทนแสงแบบภาพยนตร์ เงาจากแสงแดดทางหน้าต่าง
// ลำแสงพร้อมฝุ่นลอย มุมห้องที่มืดลง (AO ปลอม) และเงาใต้ตัวละคร — ทั้งหมดสร้างในโค้ด ไม่มีไฟล์ HDR

/** Marks a material as UI / unlit artwork: skip tone mapping so text and signs keep their exact colours. */
export function unlit(m) {
  if (Array.isArray(m)) m.forEach(unlit); else if (m) m.toneMapped = false;
  return m;
}

/** A small HDR "room" rendered into a PMREM: ceiling strips + a bright window, for PBR reflections. */
function envScene() {
  const s = new THREE.Scene();
  const shell = new THREE.Mesh(new THREE.BoxGeometry(12, 5, 12), new THREE.MeshBasicMaterial({ color: '#b3ada2', side: THREE.BackSide }));
  shell.position.y = 2.5; s.add(shell);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshBasicMaterial({ color: '#7d7064' }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.01; s.add(floor);
  const panel = (w, h, x, y, z, rx, ry, k, col = '#ffffff') => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.rotation.set(rx, ry, 0); s.add(m);
  };
  for (const x of [-3, 0, 3]) for (const z of [-2.5, 2.5]) panel(1.4, 0.4, x, 4.95, z, Math.PI / 2, 0, 7, '#fff6e8');
  panel(4.5, 2.2, -5.95, 2.2, 0, 0, Math.PI / 2, 9, '#d8ecff');      // window: cool daylight
  panel(3.0, 1.6, 0, 2.2, 5.95, 0, Math.PI, 3, '#ffe9cc');           // warm bounce from the far wall
  return s;
}

export function setupLook(renderer, scene) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;          // refreshed at ~15 Hz from the frame loop
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(envScene(), 0.035);
  scene.environment = rt.texture;
  scene.environmentIntensity = 0.5;
  pmrem.dispose();
}

/** Points the window "sun" for a room and fits its shadow camera to the room. */
export function aimSun(sun, { dir, half = 6, center = [0, 0] }) {
  const d = new THREE.Vector3(...dir).normalize();          // direction the light travels (into the room, downward)
  sun.target.position.set(center[0], 0.8, center[1]);
  sun.position.copy(sun.target.position).addScaledVector(d, -14);
  const c = sun.shadow.camera;
  c.left = -half; c.right = half; c.top = half; c.bottom = -half; c.near = 2; c.far = 30;
  c.updateProjectionMatrix();
  sun.target.updateMatrixWorld();
}

const canvasCache = new Map();
function gradTex(key, draw, w = 128, h = 128) {
  if (canvasCache.has(key)) return canvasCache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  canvasCache.set(key, t);
  return t;
}

/** Soft dark gradient used for fake ambient occlusion along floor/wall joins. */
const aoMat = () => new THREE.MeshBasicMaterial({
  map: gradTex('ao', (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(0,0,0,0.42)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, 8, 128),
  transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false,
});
let aoShared = null;

/** Darkens where walls meet the floor (a floor band and a wall band per wall). */
export function addCornerAO(group, w, d) {
  aoShared ||= aoMat();
  const strip = (len, depth) => new THREE.PlaneGeometry(len, depth);
  const walls = [
    { len: w, pos: [0, 0, -d / 2], rot: 0 }, { len: w, pos: [0, 0, d / 2], rot: Math.PI },
    { len: d, pos: [-w / 2, 0, 0], rot: Math.PI / 2 }, { len: d, pos: [w / 2, 0, 0], rot: -Math.PI / 2 },
  ];
  for (const W of walls) {
    const holder = new THREE.Group();
    holder.position.set(...W.pos); holder.rotation.y = W.rot;
    // floor band: gradient runs away from the wall (+z in the wall frame)
    const f = new THREE.Mesh(strip(W.len, 0.45), aoShared);
    f.rotation.x = -Math.PI / 2; f.position.set(0, 0.003, 0.225);
    holder.add(f);
    // wall band: darkest at the floor, fading upward
    const v = new THREE.Mesh(strip(W.len, 0.35), aoShared);
    v.rotation.z = Math.PI; v.position.set(0, 0.175, 0.004);
    holder.add(v);
    group.add(holder);
  }
}

/** Round soft shadow under a character or prop (works even when shadow maps are off). */
export function blobShadow(radius = 0.32, opacity = 0.38) {
  const tex = gradTex('blob', (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, toneMapped: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.006;
  m.renderOrder = 1;
  return m;
}

/**
 * Volumetric-looking sunbeam through a window: the window rectangle swept along the light,
 * drawn additively and fading with distance, plus dust motes drifting inside it.
 * `corners` = 4 world points of the window (in order), `dir` = light direction, `len` = beam length.
 */
export function sunbeam(corners, dir, len = 3.2, { motes = 110, strength = 0.16 } = {}) {
  const d = new THREE.Vector3(...dir).normalize().multiplyScalar(len);
  const P = corners.map((c) => new THREE.Vector3(...c));
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < 4; i++) {
    const a = P[i], b = P[(i + 1) % 4];
    const base = pos.length / 3;
    for (const [p, u, v] of [[a, 0, 0], [b, 1, 0], [b.clone().add(d), 1, 1], [a.clone().add(d), 0, 1]]) { pos.push(p.x, p.y, p.z); uv.push(u, v); }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const tex = gradTex('beam', (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,244,214,1)'); gr.addColorStop(0.55, 'rgba(255,240,205,0.35)'); gr.addColorStop(1, 'rgba(255,236,200,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const side = g.createLinearGradient(0, 0, w, 0);
    side.addColorStop(0, 'rgba(0,0,0,1)'); side.addColorStop(0.2, 'rgba(0,0,0,0)'); side.addColorStop(0.8, 'rgba(0,0,0,0)'); side.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = side; g.fillRect(0, 0, w, h);
  }, 64, 128);
  const beamMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: strength, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geo, beamMat));

  // dust motes
  const n = motes;
  const base = new Float32Array(n * 3), cur = new Float32Array(n * 3), phase = new Float32Array(n);
  const e1 = P[1].clone().sub(P[0]), e2 = P[3].clone().sub(P[0]);
  for (let i = 0; i < n; i++) {
    const p = P[0].clone().addScaledVector(e1, Math.random()).addScaledVector(e2, Math.random()).addScaledVector(d, 0.05 + Math.random() * 0.8);
    base.set([p.x, p.y, p.z], i * 3); phase[i] = Math.random() * 100;
  }
  cur.set(base);
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(cur, 3));
  const dot = gradTex('mote', (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,250,235,1)'); gr.addColorStop(1, 'rgba(255,250,235,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, 32, 32);
  const pts = new THREE.Points(pg, new THREE.PointsMaterial({ map: dot, size: 0.014, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  group.add(pts);
  let t = 0;
  group.userData.update = (dt) => {
    t += dt;
    for (let i = 0; i < n; i++) {
      const k = i * 3, ph = phase[i];
      cur[k] = base[k] + Math.sin(t * 0.13 + ph) * 0.06;
      cur[k + 1] = base[k + 1] + Math.sin(t * 0.09 + ph * 1.3) * 0.08;
      cur[k + 2] = base[k + 2] + Math.cos(t * 0.11 + ph * 0.7) * 0.06;
    }
    pg.attributes.position.needsUpdate = true;
  };
  return group;
}

/** Sets shadow flags on everything solid; signs, UI and transparent effects neither cast nor receive. */
export function shadowify(root, { cast = true, receive = true } = {}) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    const solid = m && (m.isMeshStandardMaterial || m.isMeshLambertMaterial) && !m.transparent;
    o.castShadow = cast && solid;
    o.receiveShadow = receive && !!m && (m.isMeshStandardMaterial || m.isMeshLambertMaterial);
  });
}
