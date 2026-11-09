import * as THREE from 'three';
import { FONT, ITEMS } from './strings.js';
import { rr, clamp } from './util.js';
import { toTex, glowTex } from './textures.js';
import { mat, makeItem } from './models.js';
import { ctx } from './ctx.js';

// การโต้ตอบ: ชี้แล้วกด — คอนโทรลเลอร์ VR (ลำแสง + ไก) หรือเมาส์/ทัชบนจอ
// การเดิน: อนาล็อกซ้ายเดิน อนาล็อกขวาหมุนทีละ 30° / WASD + ลากเพื่อมอง

const tmpM = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

function visibleInTree(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

export class Interaction {
  constructor(renderer, camera, scene, rig) {
    this.renderer = renderer; this.camera = camera; this.scene = scene; this.rig = rig;
    this.targets = new Map();
    this.capture = null;
    this.ray = new THREE.Raycaster();
    this.ray.far = 12;
    this.mouse = { ndc: new THREE.Vector2(), inside: false, down: null, dragging: false };
    this.mouseHover = null;
    this.yaw = 0; this.pitch = 0;
    this.keys = new Set();
    this.controllers = [];
    this.onAnyPress = null;
    /** Test hook: { pos: Vector3, quat: Quaternion, trigger: bool } stands in for a tracked controller. */
    this.fakePose = null;
    this._nearT = 0;
    this._box = new THREE.Box3();
    this._label = this._makeLabel();
    scene.add(this._label);
    this._setupMouse();
    this._setupKeys();
    this._setupControllers();
  }

  /** Registers an interactable root. */
  add(obj, h = {}) {
    const handlers = { highlight: true, enabled: () => true, label: null, ...h };
    if (handlers.highlight) {
      obj.traverse((o) => {
        if (o.isMesh && !o.userData._ownMat && o.material?.isMeshStandardMaterial) {
          o.material = o.material.clone();
          o.userData._ownMat = true;
          o.userData._baseEmissive = o.material.emissive.clone();
          o.userData._baseEI = o.material.emissiveIntensity;
        }
      });
    }
    this.targets.set(obj, handlers);
    return obj;
  }
  remove(obj) {
    if (!obj) return;
    if (this.targets.has(obj)) this._setHighlight(obj, false);
    this.targets.delete(obj);
    for (const c of this.controllers) if (c.hovered === obj) c.hovered = null;
    if (this.mouseHover === obj) this.mouseHover = null;
  }

  _setHighlight(obj, on) {
    const h = this.targets.get(obj);
    if (h?.highlight) {
      obj.traverse((o) => {
        if (o.isMesh && o.userData._ownMat) {
          if (on) { o.material.emissive.set('#ffcc33'); o.material.emissiveIntensity = 0.45; } else { o.material.emissive.copy(o.userData._baseEmissive); o.material.emissiveIntensity = o.userData._baseEI; }
        }
      });
    }
    h?.onHover?.(on);
  }

  _rootOf(o) {
    for (let p = o; p; p = p.parent) if (this.targets.has(p)) return p;
    return null;
  }

  _hit(origin, dir) {
    this.ray.set(origin, dir);
    const list = [];
    for (const [o, h] of this.targets) if (visibleInTree(o) && h.enabled()) list.push(o);
    if (!list.length) return null;
    const hits = this.ray.intersectObjects(list, true);
    for (const hit of hits) {
      if (!visibleInTree(hit.object)) continue;
      const root = this._rootOf(hit.object);
      if (root) return { root, point: hit.point, distance: hit.distance };
    }
    return null;
  }

  _press(source, hit) {
    ctx.audio?.init();
    this.onAnyPress?.();
    if (this.capture) { this.capture(source); return; }
    if (hit) this.targets.get(hit.root)?.onSelect?.(hit, source);
  }

  // ---------------- mouse / touch ----------------
  _setupMouse() {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';
    const toNdc = (e) => {
      const r = el.getBoundingClientRect();
      this.mouse.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    el.addEventListener('pointermove', (e) => {
      toNdc(e); this.mouse.inside = true;
      const d = this.mouse.down;
      if (d) {
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (!this.mouse.dragging && Math.hypot(dx, dy) > 6) this.mouse.dragging = true;
        if (this.mouse.dragging) {
          const k = e.pointerType === 'touch' ? 0.006 : 0.0045;
          this.yaw += (e.clientX - d.lx) * k;
          this.pitch = clamp(this.pitch - (e.clientY - d.ly) * k, -1.35, 1.35);
          d.lx = e.clientX; d.ly = e.clientY;
        }
      }
    });
    el.addEventListener('pointerdown', (e) => {
      if (ctx.vr) return;
      toNdc(e);
      this.mouse.down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY };
      this.mouse.dragging = false;
      el.setPointerCapture?.(e.pointerId);
    });
    el.addEventListener('pointerup', (e) => {
      if (ctx.vr) return;
      const wasDrag = this.mouse.dragging;
      this.mouse.down = null; this.mouse.dragging = false;
      if (wasDrag) return;
      toNdc(e);
      this.ray.setFromCamera(this.mouse.ndc, this.camera);
      const hit = this._hit(this.ray.ray.origin.clone(), this.ray.ray.direction.clone());
      this._press({ kind: 'mouse' }, hit);
    });
    el.addEventListener('pointerleave', () => { this.mouse.inside = false; });
  }

  _setupKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      this.keys.add(e.code);
      if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) {
        e.preventDefault();
        if (this.capture) this._press({ kind: 'key' }, null);
        else if (this.mouseHover && e.code === 'Enter') this._press({ kind: 'key' }, { root: this.mouseHover });
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  // ---------------- VR controllers ----------------
  _setupControllers() {
    const xr = this.renderer.xr;
    for (let i = 0; i < 2; i++) {
      const c = xr.getController(i);
      const grip = xr.getControllerGrip(i);
      this.rig.add(c, grip);
      const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
      const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.85, toneMapped: false }));
      line.visible = false;
      c.add(line);
      const reticle = new THREE.Mesh(new THREE.RingGeometry(0.012, 0.02, 20), new THREE.MeshBasicMaterial({ color: '#ffd23f', depthTest: false, transparent: true, toneMapped: false }));
      reticle.renderOrder = 998; reticle.visible = false;
      this.scene.add(reticle);
      const st = { index: i, controller: c, grip, line, reticle, hovered: null, source: null, handedness: null, axes: [0, 0, 0, 0], snapReady: true };
      c.addEventListener('connected', (e) => {
        st.source = e.data; st.handedness = e.data.handedness;
        line.visible = e.data.targetRayMode === 'tracked-pointer';
        ctx.hands?.attach(st);
      });
      c.addEventListener('disconnected', () => {
        st.source = null; line.visible = false; reticle.visible = false;
        if (st.hovered) { this._setHighlight(st.hovered, false); st.hovered = null; }
        ctx.hands?.detach(st);
      });
      c.addEventListener('selectstart', () => {
        // a ray hit wins; otherwise a pull of the trigger with the hand on something grabs it
        const hit = st.lastHit || this._nearest(st);
        this._press({ kind: 'vr', controller: st }, hit);
        ctx.hands?.pulse(st, 0.3, 40);
      });
      // reach out and squeeze the grip on a tool, a PPE item, a switch… — same as selecting it
      c.addEventListener('squeezestart', () => {
        if (this.capture) return;
        const hit = this._nearest(st);
        if (hit) { this._press({ kind: 'vr', controller: st, grab: true }, hit); ctx.hands?.pulse(st, 0.6, 60); }
      });
      this.controllers.push(st);
    }
  }

  get rightController() {
    return this.controllers.find((c) => c.handedness === 'right' && c.source) || this.controllers.find((c) => c.source) || null;
  }

  /** The hand doing the work: whichever trigger is held, else the right hand. */
  activeController() {
    const held = this.controllers.find((c) => c.source?.gamepad?.buttons?.[0]?.pressed);
    return held || this.rightController;
  }

  /** World pose of the working hand + trigger state, for real-motion tasks. */
  pose() {
    if (this.fakePose) return this.fakePose;
    const st = this.activeController();
    if (!st || !st.source) return null;
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion();
    st.grip.getWorldPosition(pos); st.grip.getWorldQuaternion(quat);
    const b = st.source.gamepad?.buttons || [];
    return { pos, quat, trigger: !!b[0]?.pressed, squeeze: !!b[1]?.pressed, st };
  }

  /** Closest interactable within reach of a hand (10 cm of its bounding box). */
  _nearest(st, reach = 0.1) {
    if (!st?.source) return null;
    const p = new THREE.Vector3(); st.grip.getWorldPosition(p);
    let best = null, bestD = reach;
    for (const [o, h] of this.targets) {
      if (o.userData.button || !visibleInTree(o) || !h.enabled()) continue;
      const d = this._box.setFromObject(o).distanceToPoint(p);
      if (d < bestD) { bestD = d; best = o; }
    }
    return best ? { root: best, point: p, distance: bestD } : null;
  }

  // ---------------- hover label ----------------
  _makeLabel() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 96;
    const tex = toTex(c, { aniso: 8 });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, toneMapped: false }));
    sp.scale.set(0.42, 0.079, 1);
    sp.renderOrder = 997;
    sp.visible = false;
    sp.userData = { c, tex, text: null };
    return sp;
  }
  _showLabel(root, point) {
    const h = root && this.targets.get(root);
    const text = h?.label ? (typeof h.label === 'function' ? h.label() : h.label) : null;
    const sp = this._label;
    if (!text) { sp.visible = false; return; }
    if (sp.userData.text !== text) {
      const { c, tex } = sp.userData;
      const g = c.getContext('2d');
      g.clearRect(0, 0, 512, 96);
      g.font = `700 44px ${FONT}`;
      const w = Math.min(500, g.measureText(text).width + 48);
      g.fillStyle = 'rgba(22,48,107,0.92)'; rr(g, (512 - w) / 2, 8, w, 80, 40); g.fill();
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 50);
      tex.needsUpdate = true;
      sp.userData.text = text;
    }
    const box = new THREE.Box3().setFromObject(root);
    sp.position.set(point.x, Math.max(box.max.y + 0.08, point.y + 0.1), point.z);
    sp.visible = true;
  }

  // ---------------- per frame ----------------
  update(dt) {
    let labelShown = false;
    if (ctx.vr) {
      if (this._nearT <= 0) this._nearT = 0.1;
      if (this.mouseHover) { this._setHighlight(this.mouseHover, false); this.mouseHover = null; }
      for (const st of this.controllers) {
        if (!st.source || !st.line.visible) { st.reticle.visible = false; continue; }
        st.controller.updateMatrixWorld(true);
        const origin = new THREE.Vector3().setFromMatrixPosition(st.controller.matrixWorld);
        tmpM.extractRotation(st.controller.matrixWorld);
        const dir = new THREE.Vector3(0, 0, -1).applyMatrix4(tmpM).normalize();
        const hit = this.capture ? null : this._hit(origin, dir);
        st.lastHit = hit;
        // hand-near-object highlight (checked at ~10 Hz: bounding boxes aren't free)
        if (!hit && !this.capture) {
          this._nearT -= dt / 2;
          if (this._nearT <= 0) { st.near = this._nearest(st); }
        } else st.near = null;
        const root = hit?.root || st.near?.root || null;
        if (root !== st.hovered) {
          if (st.hovered && !this.controllers.some((o) => o !== st && o.hovered === st.hovered)) this._setHighlight(st.hovered, false);
          st.hovered = root;
          if (root) { this._setHighlight(root, true); ctx.hands?.pulse(st, 0.1, 15); }
        }
        const len = hit ? hit.distance : 2.5;
        st.line.scale.z = len;
        st.reticle.visible = !!hit;
        if (hit) {
          st.reticle.position.copy(hit.point);
          st.reticle.lookAt(this.camera.getWorldPosition(new THREE.Vector3()));
          if (!labelShown) { this._showLabel(root, hit.point); labelShown = true; }
        }
      }
    } else if (this.mouse.inside && !this.mouse.dragging) {
      this.ray.setFromCamera(this.mouse.ndc, this.camera);
      const hit = this.capture ? null : this._hit(this.ray.ray.origin.clone(), this.ray.ray.direction.clone());
      const root = hit?.root || null;
      if (root !== this.mouseHover) {
        if (this.mouseHover) this._setHighlight(this.mouseHover, false);
        this.mouseHover = root;
        if (root) this._setHighlight(root, true);
        this.renderer.domElement.style.cursor = root ? 'pointer' : 'grab';
      }
      if (hit) { this._showLabel(root, hit.point); labelShown = true; }
    }
    if (!labelShown) this._label.visible = false;
  }
}

/** Movement for both modes, clamped to the current room. */
export class Locomotion {
  constructor(rig, camera, interaction) {
    this.rig = rig; this.camera = camera; this.ix = interaction;
    this.eye = 1.5;
    this.moving = 0;
    this._stride = 0;
    this._last = null;
  }

  /** Puts the player at a station; in VR, offsets for where the head is in the play space. */
  place(st) {
    const { rig, camera } = this;
    rig.rotation.set(0, st.yaw, 0);
    if (ctx.vr) {
      const head = camera.position.clone();
      head.y = 0;
      head.applyAxisAngle(UP, st.yaw);
      rig.position.set(st.pos.x - head.x, st.pos.y, st.pos.z - head.z);
    } else {
      rig.position.copy(st.pos);
      this.ix.yaw = 0;
      this.ix.pitch = st.pitch || 0;
    }
  }

  update(dt) {
    const { rig, camera, ix } = this;
    const move = new THREE.Vector2();
    let turn = 0;
    if (ctx.vr) {
      for (const c of ix.controllers) {
        const gp = c.source?.gamepad;
        if (!gp) continue;
        const ax = gp.axes.length >= 4 ? [gp.axes[2], gp.axes[3]] : [gp.axes[0] || 0, gp.axes[1] || 0];
        if (c.handedness === 'left') { move.set(ax[0], ax[1]); } else {
          if (Math.abs(ax[0]) > 0.7 && c.snapReady) { turn = -Math.sign(ax[0]) * Math.PI / 6; c.snapReady = false; }
          if (Math.abs(ax[0]) < 0.3) c.snapReady = true;
        }
      }
      if (turn) {
        this.turnFlash = 0.3;
        // rotate around the head, not the rig origin
        const head = new THREE.Vector3(); camera.getWorldPosition(head);
        rig.position.sub(head).applyAxisAngle(UP, turn).add(head);
        rig.rotation.y += turn;
        ctx.audio?.whoosh();
      }
    } else {
      // desktop look
      rig.rotation.y -= ix.yaw;   // drag right → look right
      ix.yaw = 0;
      camera.rotation.set(clamp(ix.pitch, -1.35, 1.35), 0, 0);   // pitch > 0 looks up
      const k = ix.keys;
      if (k.has('KeyW') || k.has('ArrowUp')) move.y -= 1;
      if (k.has('KeyS') || k.has('ArrowDown')) move.y += 1;
      if (k.has('KeyA')) move.x -= 1;
      if (k.has('KeyD')) move.x += 1;
      if (k.has('ArrowLeft')) rig.rotation.y += dt * 1.8;
      if (k.has('ArrowRight')) rig.rotation.y -= dt * 1.8;
    }
    this.turnFlash = Math.max(0, (this.turnFlash || 0) - dt);
    const dead = 0.18;
    if (move.length() > dead) {
      const speed = (ix.keys.has('ShiftLeft') ? 2.6 : 1.5) * Math.min(1, move.length());
      const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
      const right = new THREE.Vector3().crossVectors(fwd, UP).normalize();
      const n = move.clone().normalize();
      rig.position.addScaledVector(fwd, -n.y * speed * dt).addScaledVector(right, n.x * speed * dt);
      this.moving = 1;
    } else this.moving = 0;
    // footsteps: one every ~0.65 m of real travel (stick, keys, or walking around the play space)
    const head = new THREE.Vector3(); camera.getWorldPosition(head); head.y = 0;
    if (this._last) {
      const d = head.distanceTo(this._last);
      if (d < 0.5) {                    // ignore teleports
        this._stride += d;
        if (this._stride > 0.65) { this._stride = 0; ctx.audio?.step(); }
      }
    }
    this._last = head;
    const b = ctx.world?.current?.bounds;
    if (b) {
      const head = new THREE.Vector3(); camera.getWorldPosition(head);
      const cx = clamp(head.x, b.minX, b.maxX), cz = clamp(head.z, b.minZ, b.maxZ);
      rig.position.x += cx - head.x; rig.position.z += cz - head.z;
    }
  }
}

/** Gloved hands on the controllers, plus the tool the player is holding. */
export class Hands {
  constructor(camera) {
    this.camera = camera;
    this.gloveMat = mat('#f1c7a1', { rough: 0.8 });
    this.held = null;
    this.heldId = null;
    this.desktopMount = new THREE.Group();
    this.desktopMount.position.set(0.24, -0.22, -0.45);
    this.desktopMount.rotation.set(0.15, 0.25, 0);
    camera.add(this.desktopMount);
    this.models = new Map();
    this.anim = { spin: 0, shake: 0 };
  }
  /** A hand: palm, four two-joint fingers and a thumb that curl with the grip and trigger. */
  _hand() {
    const g = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.026, 0.085), this.gloveMat);
    palm.position.set(0, 0, 0.015); g.add(palm);
    const seg = (len, r) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 3, 8), this.gloveMat); m.rotation.x = Math.PI / 2; m.position.z = -len / 2; return m; };
    const fingers = [];
    [[-0.027, 0.036], [-0.009, 0.042], [0.009, 0.04], [0.027, 0.033]].forEach(([x, len]) => {
      const k1 = new THREE.Group(); k1.position.set(x, 0, -0.028); g.add(k1);
      k1.add(seg(len * 0.55, 0.0085));
      const k2 = new THREE.Group(); k2.position.z = -len * 0.6 - 0.006; k1.add(k2);
      k2.add(seg(len * 0.45, 0.008));
      fingers.push([k1, k2]);
    });
    const t1 = new THREE.Group(); t1.position.set(-0.04, -0.004, 0.012); t1.rotation.y = 0.7; g.add(t1);
    t1.add(seg(0.03, 0.0095));
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.042, 0.045, 14), mat('#1d3060'));
    cuff.rotation.x = Math.PI / 2; cuff.position.z = 0.085; g.add(cuff);
    g.userData.fingers = fingers;
    g.userData.thumb = t1;
    g.userData.curl = 0;
    return g;
  }
  attach(st) {
    if (this.models.has(st)) return;
    const h = this._hand();
    if (st.handedness === 'left') h.scale.x = -1;
    st.grip.add(h);
    this.models.set(st, h);
    if (this.heldId) this.hold(this.heldId);
  }
  detach(st) {
    const h = this.models.get(st);
    if (h) h.parent?.remove(h);
    this.models.delete(st);
  }
  setGloves(on) { this.gloveMat.color.set(on ? '#1c2533' : '#f1c7a1'); }
  pulse(st, intensity = 0.4, ms = 40) {
    try { st.source?.gamepad?.hapticActuators?.[0]?.pulse?.(intensity, ms); } catch { /* not supported */ }
  }

  /** Shows a tool in the right hand (VR) or the lower-right of the view (desktop). */
  hold(id) {
    this.release();
    if (!id) return;
    this.heldId = id;
    const m = makeItem(id);
    m.scale.setScalar(ctx.vr ? 1 : 1.1);
    const rc = ctx.interaction.rightController;
    if (ctx.vr && rc) {
      rc.grip.add(m);
      m.rotation.set(-0.6, 0, 0);
      m.position.set(0, -0.01, 0.0);
    } else {
      this.desktopMount.add(m);
      m.rotation.set(0, 0, 0);
    }
    this.held = m;
  }
  release() {
    if (this.held) this.held.parent?.remove(this.held);
    this.held = null; this.heldId = null;
  }
  spin() { this.anim.spin = 0.35; }
  shake() { this.anim.shake = 0.3; }
  update(dt) {
    // finger curl follows the analog grip/trigger (index ← trigger, the rest ← grip)
    for (const [st, h] of this.models) {
      const b = st.source?.gamepad?.buttons || [];
      const trig = b[0]?.value || 0, grip = b[1]?.value || 0;
      const f = h.userData.fingers;
      f.forEach(([k1, k2], i) => {
        const target = (i === 0 ? trig : grip) * 1.25 + 0.12;
        k1.rotation.x += (-target - k1.rotation.x) * Math.min(1, dt * 18);
        k2.rotation.x = k1.rotation.x * 1.1;
      });
      h.userData.thumb.rotation.x = -Math.max(trig, grip) * 0.6;
    }
    if (!this.held) return;
    if (this.anim.spin > 0) { this.anim.spin -= dt; this.held.rotation.z += dt * 18; }
    if (this.anim.shake > 0) { this.anim.shake -= dt; this.held.position.x = Math.sin(this.anim.shake * 80) * 0.01; } else this.held.position.x = 0;
  }
}

/** Bouncing yellow arrows that point at the next thing to do. */
export class Hints {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.t = 0;
    this.arrowGeo = new THREE.ConeGeometry(0.06, 0.14, 4);
    this.arrowMat = new THREE.MeshBasicMaterial({ color: '#ffd23f', toneMapped: false });
    this.glowMat = new THREE.SpriteMaterial({ map: glowTex('#ffd84a'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  }
  show(target, { offset = 0.25, glow = true } = {}) {
    const g = new THREE.Group();
    const a = new THREE.Mesh(this.arrowGeo, this.arrowMat);
    a.rotation.x = Math.PI; g.add(a);
    if (glow) { const s = new THREE.Sprite(this.glowMat); s.scale.setScalar(0.35); s.position.y = -offset + 0.05; g.add(s); s.userData.glow = true; }
    this.scene.add(g);
    const item = { target, g, offset };
    this.items.push(item);
    return item;
  }
  hide(item) {
    const i = this.items.indexOf(item);
    if (i >= 0) { this.items.splice(i, 1); item.g.parent?.remove(item.g); }
  }
  hideFor(target) { for (const it of [...this.items]) if (it.target === target) this.hide(it); }
  clear() { for (const it of [...this.items]) this.hide(it); }
  update(dt) {
    this.t += dt;
    const box = new THREE.Box3();
    for (const it of this.items) {
      if (!visibleInTree(it.target)) { it.g.visible = false; continue; }
      it.g.visible = true;
      box.setFromObject(it.target);
      const c = box.getCenter(new THREE.Vector3());
      it.g.position.set(c.x, box.max.y + it.offset + Math.sin(this.t * 5) * 0.04, c.z);
      it.g.children[0].rotation.y = this.t * 2;
      const glow = it.g.children[1];
      if (glow) { glow.position.y = c.y - it.g.position.y; glow.material.opacity = 0.55 + Math.sin(this.t * 6) * 0.3; }
    }
  }
}

export { ITEMS };
