import * as THREE from 'three';
import { FONT, ITEMS, GROUPS, TOOL_INFO } from './strings.js';
import { Panel } from './panel.js';
import { makeItem } from './models.js';
import { toTex } from './textures.js';
import { rr, clamp } from './util.js';
import { N } from './narration.js';
import { ctx } from './ctx.js';

// หยิบเครื่องมือจากผนังขึ้นมาดูใกล้ๆ: ชี้ชื่อส่วนประกอบบนตัวเครื่องมือ บอกหน้าที่และข้อควรระวัง (ครูช่างอ่านให้ฟัง)
// จอคอม: ลากเพื่อหมุนดู · แว่น VR: กดไกหรือบีบกริปที่เครื่องมือเพื่อถือหมุนดูเองในมือ กดอีกครั้งเพื่อปล่อย
// ใช้ได้เมื่อไม่มีการเลือกเครื่องมือในภารกิจค้างอยู่ — เริ่มเลือกเมื่อไรก็วางคืนผนังให้อัตโนมัติ

const FLAT = new Set(['hammer', 'screwdriver', 'wrench', 'adjwrench', 'pliers']);
const v = () => new THREE.Vector3();

function labelSprite(text) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = `700 44px ${FONT}`;
  c.width = Math.ceil(g.measureText(text).width + 56); c.height = 76;
  g.font = `700 44px ${FONT}`;
  g.fillStyle = 'rgba(15,30,61,0.92)'; rr(g, 2, 2, c.width - 4, c.height - 4, 30); g.fill();
  g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(30, c.height / 2, 9, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff'; g.textBaseline = 'middle'; g.fillText(text, 48, c.height / 2 + 2);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: toTex(c), depthTest: false, transparent: true, toneMapped: false }));
  const h = 0.022;
  sp.scale.set(h * c.width / c.height, h, 1);
  sp.renderOrder = 960;
  sp.userData.w = h * c.width / c.height;
  return sp;
}

export class ToolInspector {
  constructor() {
    this.ws = ctx.world.scenes.workshop;
    this.cur = null;
    this.hit = new Map();
    const hidden = new THREE.MeshBasicMaterial({ visible: false });
    for (const [id, tool] of Object.entries(this.ws.toolWall)) {
      tool.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(tool);
      const size = box.getSize(v()).addScalar(0.03);
      const hb = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), hidden);
      hb.position.copy(tool.parent.worldToLocal(box.getCenter(v())));
      tool.parent.add(hb);
      ctx.interaction.add(hb, {
        highlight: false,
        label: `หยิบดู ${ITEMS[id].th}`,
        enabled: () => this.can(id),
        onHover: (on) => tool.scale.copy(tool.userData.home.scale).multiplyScalar(on ? 1.07 : 1),
        onSelect: () => this.open(id),
      });
      this.hit.set(id, hb);
    }
    ctx.game.addTicker((dt) => this.update(dt));
  }

  /** A choice of tools is open in a mission (the wall tools are pick targets). */
  _choosing() { return Object.values(this.ws.toolWall).some((o) => ctx.interaction.targets.has(o)); }

  can(id) {
    const t = this.ws.toolWall[id];
    if (this.cur || ctx.interaction.capture || ctx.world.currentName !== 'workshop') return false;
    if (!t.visible || t.position.distanceToSquared(t.userData.home.pos) > 1e-4) return false;   // in the bag, in a hand…
    return !this._choosing();
  }

  open(id) {
    if (this.cur) this.close();
    const tool = this.ws.toolWall[id];
    const info = TOOL_INFO[id];
    tool.visible = false;                                   // it's in your hands now
    tool.scale.copy(tool.userData.home.scale);
    ctx.audio.whoosh();

    // the tool, turned so its working side faces you, centred on a pivot that turns
    const obj = makeItem(id);
    if (FLAT.has(id)) obj.rotation.set(Math.PI / 2, 0, 0); else obj.rotation.set(0, -Math.PI / 2, 0);
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(v());
    obj.position.sub(box.getCenter(v()));
    const spin = new THREE.Group(); spin.add(obj);
    const pivot = new THREE.Group(); pivot.add(spin);
    const reach = Math.max(size.x, size.y);
    const cam = ctx.camera.getWorldPosition(v());
    const fwd = ctx.camera.getWorldDirection(v()); fwd.y = 0; fwd.normalize();
    const right = v().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const dist = clamp(0.32 + reach * 0.75, 0.42, 0.72);
    pivot.position.copy(cam).addScaledVector(fwd, dist).addScaledVector(right, -0.04 - reach * 0.12);
    pivot.position.y = cam.y - 0.07;
    pivot.lookAt(cam.x, pivot.position.y, cam.z);
    ctx.scene.add(pivot);

    // part names with leader lines (kept in a column on the left, updated every frame)
    const parts = Object.entries(info.parts).map(([key, text]) => {
      const sp = labelSprite(text);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([v(), v()]), new THREE.LineBasicMaterial({ color: '#ffd23f', depthTest: false, transparent: true, toneMapped: false }));
      line.renderOrder = 959;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0028, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffd23f', depthTest: false, toneMapped: false }));
      dot.renderOrder = 961;
      ctx.scene.add(sp, line, dot);
      return { key, sp, line, dot, at: new THREE.Vector3(...(obj.userData.parts?.[key] || [0, 0, 0])) };
    });

    // info card on the right (a normal panel shrunk to card size, so its text stays sharp)
    const grp = GROUPS.find((x) => x.id === ITEMS[id].group);
    const p = new Panel({ w: 0.92, h: 0.76, border: grp?.color || '#16306b' });
    p.setContent({
      eyebrow: grp ? `กลุ่ม${grp.th}` : 'เครื่องมือช่าง', title: ITEMS[id].th, accent: grp?.color || '#16306b', bodySize: 30, titleSize: 50,
      list: [{ tag: 'ใช้', text: info.use, color: '#2a64c8' }, { tag: '!', text: info.safety, color: '#e23b3b' }],
      footer: ctx.vr ? 'กดไกหรือบีบกริปที่เครื่องมือ เพื่อถือหมุนดูเอง' : 'ลากเมาส์เพื่อหมุนดูรอบด้าน',
    });
    p.addButton({ id: 'back', label: 'วางคืนที่ผนัง', style: 'primary', x: 0, y: -0.76 / 2 + 0.17, w: 0.5, h: 0.11, onClick: () => this.close() });
    const card = new THREE.Group(); card.add(p.group); card.scale.setScalar(0.38);
    card.position.copy(cam).addScaledVector(fwd, dist + 0.04).addScaledVector(right, 0.15 + reach * 0.22);
    card.position.y = cam.y - 0.06;
    card.lookAt(cam.x, card.position.y, cam.z);
    ctx.scene.add(card);
    p.pop();

    // VR: take it in your own hand (select / squeeze on it), again to let go · desktop: click pauses the turning
    ctx.interaction.add(pivot, {
      highlight: false,
      label: ctx.vr ? 'ถือหมุนดูเอง' : null,
      onSelect: (hit, src) => {
        const c = this.cur;
        if (!c) return;
        if (src?.kind === 'vr' && src.controller) {
          if (c.heldBy) { ctx.scene.attach(pivot); c.heldBy = null; } else { src.controller.grip.attach(pivot); c.heldBy = src.controller; }
          ctx.hands?.pulse(src.controller, 0.5, 40);
        } else c.manual = !c.manual;
      },
    });
    this.cur = { id, tool, obj, spin, pivot, parts, panel: p, card, t: 0, yaw: 0, pitch: 0, manual: false, heldBy: null, size: reach };
    ctx.interaction.dragHook = (dx, dy) => {
      const c = this.cur; if (!c) return;
      c.manual = true; c.yaw += dx * 0.012; c.pitch = clamp(c.pitch + dy * 0.012, -1.3, 1.3);
    };
    ctx.audio.voice(N.tool(id), 'coach');
  }

  close() {
    const c = this.cur;
    if (!c) return;
    this.cur = null;
    ctx.interaction.dragHook = null;
    ctx.interaction.remove(c.pivot);
    c.pivot.parent?.remove(c.pivot);
    for (const q of c.parts) {
      for (const o of [q.sp, q.line, q.dot]) { o.parent?.remove(o); o.geometry?.dispose(); o.material.map?.dispose(); o.material.dispose(); }
    }
    c.panel.dispose(); c.card.parent?.remove(c.card);
    c.tool.visible = true;
    ctx.audio.stopVoices();
    ctx.audio.click();
  }

  update(dt) {
    const c = this.cur;
    if (!c) return;
    const cam = ctx.camera.getWorldPosition(v());
    // a mission choice, a mini-game, another room or walking away puts the tool back
    if (ctx.interaction.capture || this._choosing() || ctx.world.currentName !== 'workshop'
      || (!c.heldBy && c.pivot.position.distanceTo(cam) > 1.8)) { this.close(); return; }
    c.t += dt;
    if (!c.heldBy) {
      if (!c.manual) c.yaw = Math.sin(c.t * 0.55) * 0.95;          // slow turntable, back and forth
      c.spin.rotation.set(c.pitch, c.yaw, 0, 'YXZ');
    }
    // labels: one column to the left of the tool, at the height of each part, with leader lines
    c.pivot.updateMatrixWorld(true);
    const centre = c.pivot.getWorldPosition(v());
    const q = ctx.camera.getWorldQuaternion(new THREE.Quaternion());
    const right = v().set(1, 0, 0).applyQuaternion(q), up = v().set(0, 1, 0).applyQuaternion(q);
    const toCam = v().subVectors(cam, centre).normalize();
    const rows = c.parts.map((p) => {
      const a = c.obj.localToWorld(p.at.clone());
      return { p, a, h: v().subVectors(a, centre).dot(up) };
    }).sort((x, y) => y.h - x.h);
    const colX = -(c.size * 0.55 + 0.035);
    let last = Infinity;
    for (const r of rows) {
      const h = Math.min(r.h, last - 0.03); last = h;
      const w = r.p.sp.userData.w;
      const lp = centre.clone().addScaledVector(right, colX - w / 2).addScaledVector(up, h).addScaledVector(toCam, 0.02);
      r.p.sp.position.copy(lp);
      const end = lp.clone().addScaledVector(right, w / 2);
      const pos = r.p.line.geometry.attributes.position;
      pos.setXYZ(0, r.a.x, r.a.y, r.a.z); pos.setXYZ(1, end.x, end.y, end.z); pos.needsUpdate = true;
      r.p.line.geometry.computeBoundingSphere();
      r.p.dot.position.copy(r.a);
    }
  }
}
