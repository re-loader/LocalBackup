import * as THREE from 'three';
import { blobShadow } from './look.js';

// ตัวละครจากภาพออกแบบ (tools/gen-actors.py สร้างด้วย OpenAI image edit โดยใช้บอร์ดเป็นภาพอ้างอิง)
// แสดงเป็นภาพตัดขอบที่หันหน้าหาผู้เล่นเสมอ — ได้แสงและเงาของห้อง เงาเป็นรูปทรงตัวละครจริง
// ไม่มีไฟล์ → ใช้ตัวละคร 3 มิติแบบเดิม

let manifest = {};
const loader = new THREE.TextureLoader();
const cache = new Map();

export async function loadActorManifest() {
  try {
    const r = await fetch('assets/actors/manifest.json', { cache: 'no-cache' });
    if (r.ok) manifest = await r.json();
  } catch { /* drawn characters */ }
  return Object.keys(manifest);
}
export const hasActor = (...names) => names.every((n) => manifest[n]);

function sprite(name) {
  if (!cache.has(name)) {
    const m = manifest[name];
    const t = loader.load(`assets/actors/${m.file}`);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    cache.set(name, { tex: t, aspect: m.w / m.h });
  }
  return cache.get(name);
}

/** A flat, unlit picture of a character for UI moments (title, results) — drawn over the world. */
export function portrait(name, height) {
  if (!manifest[name]) return null;
  const s = sprite(name);
  const geo = new THREE.PlaneGeometry(height * s.aspect, height);
  geo.translate(0, height / 2, 0);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: s.tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  m.renderOrder = 901;
  return m;
}

/**
 * A character that stands in the room. API matches the drawn characters (models.js makeCharacter):
 * root, head, talk(), wave(), point(), lookAt(), update() — plus `mood` to pick a pose.
 *   poses: { idle, talk?, wave?, worried?, ...any } → sprite names from the manifest
 */
export class Actor {
  constructor({ poses, height = 1.6 }) {
    this.poses = poses;
    this.height = height;
    Object.values(poses).forEach((n) => sprite(n));      // preload every pose: no blank frame on the first switch
    this.root = new THREE.Group();
    this.body = new THREE.Group();          // turned toward the viewer every frame
    this.root.add(this.body);
    this.root.add(blobShadow(0.3, 0.34));
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0, 0.5, 0);                // feet on the ground
    const first = sprite(poses.idle);
    this.mat = new THREE.MeshStandardMaterial({ map: first.tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.92, metalness: 0 });
    this.mat.emissive = new THREE.Color('#ffffff');
    this.mat.emissiveMap = first.tex;
    this.mat.emissiveIntensity = 0.18;     // a little self-light keeps flat artwork readable in shade
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.castShadow = true;
    // the shadow is the character's silhouette, not a rectangle
    this.mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: first.tex, alphaTest: 0.5 });
    this.body.add(this.mesh);
    this.head = new THREE.Object3D();
    this.head.position.y = height * 0.9;
    this.root.add(this.head);
    this.arms = [new THREE.Group(), new THREE.Group()];    // compatibility with drawn characters
    this.arms.forEach((a) => { a.userData.hand = new THREE.Group(); a.add(a.userData.hand); });
    this.mood = 'idle';
    this.state = { t: Math.random() * 10, talk: 0, wave: 0, point: 0, target: null, yaw: 0 };
    this.root.userData.character = this;
    this.setPose('idle');
  }

  setPose(key) {
    const name = this.poses[key] || this.poses.idle;
    if (this._pose === name) return;
    this._pose = name;
    const s = sprite(name);
    this.mat.map = s.tex; this.mat.emissiveMap = s.tex;
    this.mesh.customDepthMaterial.map = s.tex;
    this.mesh.scale.set(this.height * s.aspect, this.height, 1);
  }

  talk(sec = 2) { this.state.talk = sec; }
  wave(sec = 1.6) { this.state.wave = sec; }
  point(sec = 2) { this.state.point = sec; }
  lookAt(worldPos) { (this.state.target ||= new THREE.Vector3()).copy(worldPos); }

  update(dt, cam = null) {
    const st = this.state;
    st.t += dt;
    st.talk = Math.max(0, st.talk - dt);
    st.wave = Math.max(0, st.wave - dt);
    st.point = Math.max(0, st.point - dt);
    // pose: a wave beats talking, talking beats the mood (worried, drilling…), the mood beats idle
    // (holdMood: a mood that stays while talking — worried teacher, Phum busy drilling)
    const key = st.wave > 0 && this.poses.wave ? 'wave'
      : this.holdMood ? this.mood
        : (st.talk > 0 || st.point > 0) && this.poses.talk ? 'talk'
          : this.mood;
    this.setPose(key);
    // breathe; a small lively bounce while speaking
    const breathe = 1 + Math.sin(st.t * 2.1) * 0.006;
    const speak = st.talk > 0 ? Math.abs(Math.sin(st.t * 9)) * 0.012 : 0;
    this.body.scale.set(1, breathe + speak, 1);
    // turn toward the viewer (yaw only, eased)
    const target = cam || st.target;
    if (target) {
      const p = new THREE.Vector3(); this.root.getWorldPosition(p);
      const want = Math.atan2(target.x - p.x, target.z - p.z);
      const parentYaw = new THREE.Euler().setFromQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
      let d = want - parentYaw - this.body.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.body.rotation.y += d * Math.min(1, dt * 6);
    }
  }
}
