import * as THREE from 'three';
import { T, LEVELS, GROUPS, ITEMS, ADVICE, FONT } from './strings.js';
import { shuffle, rr } from './util.js';
import { Panel } from './panel.js';
import { makeItem } from './models.js';
import { ctx } from './ctx.js';

// สคริปต์ของ 3 ด่าน — แต่ละด่านเดินตามแบบจำลอง ADISAC
// 1.AIM → 2.DIVIDE → 3.INTEGRATE → 5.ADVICE → 4.SYNTHESIS → 6.CRITERION
// (ADVICE ทำงานตลอดระหว่างลงมือ: ทุกครั้งที่ครูช่างแนะนำ แถบ ADVICE จะกะพริบ)

const ALL_TOOLS = ['hammer', 'screwdriver', 'wrench', 'adjwrench', 'saw', 'tape', 'pliers', 'drill', 'caulk'];
const wp = (o) => o.getWorldPosition(new THREE.Vector3());

/** A green check that floats on a finished repair point. */
function markDone(obj) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#22b14c'; g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 8; g.beginPath(); g.moveTo(16, 33); g.lineTo(28, 45); g.lineTo(48, 20); g.stroke();
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, toneMapped: false }));
  sp.scale.setScalar(0.05);
  sp.position.set(0, 0.05, 0);
  sp.renderOrder = 990;
  sp.userData.check = true;
  obj.add(sp);
}
function clearMarks(root) {
  const rm = [];
  root.traverse((o) => { if (o.userData.check) rm.push(o); });
  rm.forEach((o) => o.parent.remove(o));
}

function resetPlayerGear() {
  ctx.hands.setGloves(false);
  document.body.classList.remove('goggles', 'helmet');
}

// =====================================================================
// ด่านที่ 1 — ห้องโถงแห่งการเรียนรู้ (Easy · K & A)
// =====================================================================
async function level1(r) {
  const L = LEVELS[0];
  const hub = ctx.world.scenes.hub, ws = ctx.world.scenes.workshop;
  ws.reset(); resetPlayerGear();

  // ---- 1. AIM ----
  await r.goTo('hub');
  r.stage('AIM');
  r.objective('ฟังภารกิจจากครู แล้วกด "รับภารกิจ"');
  hub.teacher.wave();
  r.say(hub.teacher, T.teacherName, L.teacherLine);
  await r.wait(1.0);
  await r.missionCard();

  // ---- 2. DIVIDE ----
  await r.goTo('workshop', 'board');
  r.stage('DIVIDE');
  r.objective('อ่านองค์ความรู้ CK · PK · TK');
  await r.divideCard();
  r.objective('ตอบคำถามบนกระดานความรู้ 3 ข้อ');
  const boardAt = { pos: new THREE.Vector3(2.2, 1.62, -3.86), yaw: 0 };
  let quizOk = 0;
  for (let i = 0; i < L.quiz.length; i++) {
    if (await r.quiz(L.quiz[i], { at: boardAt, n: i + 1, of: L.quiz.length })) quizOk++;
  }
  r.checkItem(0, true);

  // ---- 3. INTEGRATE : จับคู่เครื่องมือ + วัสดุ ภายใต้ทรัพยากรจำกัด ----
  r.stage('INTEGRATE');
  r.resources = { ...L.startResources };
  const showRes = () => ctx.hud.set({ resources: { ...r.resources } });
  showRes();
  const spend = (cost) => {
    for (const [k, v] of Object.entries(cost)) r.resources[k] = Math.max(0, r.resources[k] - v);
    showRes();
  };
  let waste = 0, jobsFirstTry = 0;
  const benchTool = new THREE.Vector3(-0.3, 0.93, -0.5);
  const benchMat = new THREE.Vector3(0.15, 0.93, -0.5);
  for (const [ji, job] of L.jobs.entries()) {
    await r.moveTo('bench');
    r.objective(`${job.title}: ${job.task}`);
    await r.dialog({
      eyebrow: `3.INTEGRATE · ${job.title} จาก 3`, title: job.task, accent: '#37c2a8', h: 0.66,
      body: 'เลือกเครื่องมือจากคลังแสงเครื่องมือ แล้วเลือกวัสดุจากชั้นวัสดุ — หยิบผิดจะเสียทรัพยากรนะ',
      buttons: [{ id: 'go', label: 'เริ่มใบงาน', style: 'primary' }],
    });
    let wrongHere = 0;
    // tool
    await r.moveTo('wall');
    r.objective(`${job.title}: เลือกเครื่องมือสำหรับ "${job.task}"`);
    let tool;
    for (;;) {
      tool = await r.pick(ALL_TOOLS.map((id) => ({ obj: ws.toolWall[id], id, label: ITEMS[id].th })),
        { idle: { sec: 25, text: ADVICE.idle } });
      spend({ energy: L.toolEnergy });
      if (tool === job.tool) { r.k(true, `job${ji + 1}-tool`); ctx.audio.ping(); break; }
      r.k(false, `job${ji + 1}-tool`); waste++; wrongHere++;
      r.a(8, 'waste-tool');
      ctx.audio.error();
      r.coach(`${T.wrongTool} ${job.hint}`, 'warn');
    }
    const toolObj = ws.toolWall[tool];
    await r.fly(toolObj, benchTool, { sec: 0.7 });
    toolObj.rotation.set(0, Math.PI / 2, Math.PI / 2);
    // material
    await r.moveTo('rack');
    r.objective(`${job.title}: เลือกวัสดุสำหรับ "${job.task}"`);
    let m;
    for (;;) {
      m = await r.pick(Object.keys(ws.materials).map((id) => ({ obj: ws.materials[id], id, label: ITEMS[id].th })),
        { idle: { sec: 25, text: ADVICE.idle } });
      spend(ITEMS[m].cost || { money: 10, material: 5 });
      if (m === job.material) { r.k(true, `job${ji + 1}-mat`); ctx.audio.ping(); break; }
      r.k(false, `job${ji + 1}-mat`); waste++; wrongHere++;
      r.a(8, 'waste-material');
      ctx.audio.error();
      r.coach(`${ADVICE.wasted} (${job.hint})`, 'warn');
    }
    const matObj = ws.materials[m];
    await r.fly(matObj, benchMat, { sec: 0.7 });
    if (!wrongHere) jobsFirstTry++;
    // hands-on: a first, gentle go at the timing game
    await r.moveTo('bench');
    r.objective(`${job.title}: ลงมือทำ — กดเมื่อเข็มอยู่ในโซนสีเขียว`);
    const mode = tool === 'hammer' ? 'hammer' : 'tighten';
    await r.timing({ anchor: new THREE.Vector3(-0.05, 0.95, -0.5), title: job.task, tool, mode, hits: 2 }, `job${ji + 1}`);
    r.coach(`${job.title} เสร็จแล้ว! ${ji < 2 ? 'ไปใบงานถัดไป' : 'ครบทุกใบงาน'}`, 'good');
    ws.reset();
  }
  if (Object.values(r.resources).some((v) => v <= 0)) r.a(10, 'resources-out', 'ทรัพยากรบางอย่างหมดเกลี้ยง — ครั้งหน้าคิดก่อนหยิบนะ');
  r.checkItem(1, jobsFirstTry >= 2);
  r.checkItem(2, waste <= 1);

  // ---- 4. SYNTHESIS : ผ่านประตูสู่ห้องเรียน ----
  r.stage('SYNTHESIS');
  await r.moveTo('door');
  r.objective(`เดินผ่านประตู "${L.doorSign}"`);
  const hd = r.hint(ws.door, { offset: 0.1 });
  await r.pick([{ obj: ws.door, id: 'door', label: L.doorSign }]);
  r.unhint(hd);
  await r.synthesis([quizOk >= 2, jobsFirstTry >= 2, waste <= 1]);

  // ---- 6. CRITERION ----
  r.stage('CRITERION');
  ctx.hud.set({ resources: null });
  return r.criterion();
}

// =====================================================================
// ด่านที่ 2 — ห้องเรียน ม.2/1 (Medium · S & K)
// =====================================================================
const WHY_L2 = {
  hammer: 'ค้อนใช้ตอกตะปู งานนี้ไม่มีตะปู',
  saw: 'เลื่อยใช้ตัดไม้ งานนี้ไม่ต้องตัดอะไร',
  pliers: 'คีมใช้จับหรือตัดลวด ไม่เหมาะกับการขันน็อต',
  tape: 'ตลับเมตรใช้วัดขนาด งานนี้ไม่ต้องวัด',
  adjwrench: 'น็อตเก้าอี้เป็นขนาดมาตรฐาน ประแจปากตายจับแน่นกว่าและไม่ทำหัวน็อตรูด',
  caulk: 'ปืนยิงซิลิโคนใช้ยาแนวกันรั่ว ไม่เกี่ยวกับงานนี้',
  default: 'งานนี้ไม่ต้องใช้ชิ้นนี้',
};

async function level2(r) {
  const L = LEVELS[1];
  const hub = ctx.world.scenes.hub, ws = ctx.world.scenes.workshop, cr = ctx.world.scenes.classroom;
  ws.reset(); cr.reset(); clearMarks(cr.chair.group); resetPlayerGear();

  // ---- 1. AIM : เคสด่วนจากครู (ฉากที่ 2) ----
  await r.goTo('hub');
  r.stage('AIM');
  r.objective('รับเคสด่วนจากครู');
  ctx.audio.notify();
  r.say(hub.teacher, T.teacherName, L.teacherLine);
  await r.dialog({
    eyebrow: 'เคสด่วน! · ห้อง ม.2/1', title: 'แย่แล้ว!', body: L.alert, accent: '#e23b3b', border: '#e23b3b', h: 0.62, bodySize: 38,
    buttons: [{ id: 'ok', label: T.accept, style: 'primary' }],
  });
  await r.missionCard();

  // ---- 2. DIVIDE : เครื่องมือช่าง 7 กลุ่ม ----
  await r.goTo('workshop', 'board');
  r.stage('DIVIDE');
  r.objective('ทบทวนเครื่องมือช่างพื้นฐาน 7 กลุ่ม');
  await r.divideCard();
  await groupsLesson(r);

  // ---- 3. INTEGRATE : จัดกระเป๋าช่าง (ฉากที่ 3) + PPE ----
  r.stage('INTEGRATE');
  await r.moveTo('wall');
  const need = [['wrench'], ['screwdriver', 'drill'], ['bulb']];
  const got = [];
  ctx.hud.set({ bag: [] });
  r.objective('จัดกระเป๋าช่าง: เลือก 3 อย่างที่ต้องใช้ซ่อมเก้าอี้และเปลี่ยนหลอดไฟ');
  r.coach('เก้าอี้มีน็อตหัวหกเหลี่ยมกับสกรูหลวม ส่วนไฟเพดานหลอดขาด — คิดก่อนว่าต้องใช้อะไร', 'info');
  let movedToRack = false;
  while (got.length < need.length) {
    const avail = [
      ...ALL_TOOLS.filter((id) => !got.includes(id)).map((id) => ({ obj: ws.toolWall[id], id, label: ITEMS[id].th })),
      ...Object.keys(ws.materials).filter((id) => !got.includes(id)).map((id) => ({ obj: ws.materials[id], id, label: ITEMS[id].th })),
    ];
    const id = await r.pick(avail, { idle: { sec: 30, text: 'น็อต → ประแจ · สกรู → ไขควง · หลอดขาด → หลอดใหม่' } });
    const groupIdx = need.findIndex((alts) => alts.includes(id));
    const satisfied = groupIdx >= 0 && need[groupIdx].some((x) => got.includes(x));
    if (groupIdx >= 0 && !satisfied) {
      r.k(true, `bag-${id}`);
      got.push(id);
      ctx.audio.ping();
      const obj = ws.toolWall[id] || ws.materials[id];
      r.fly(obj, new THREE.Vector3(0.7, 1.05, -0.55), { sec: 0.8, arc: 0.5, hide: true });
      ctx.hud.set({ bag: [...got] });
      r.coach(`ใส่${ITEMS[id].th}ลงกระเป๋าแล้ว (${got.length}/3)`, 'good');
    } else if (satisfied) {
      r.coach('มีเครื่องมือขันสกรูในกระเป๋าแล้ว ไม่ต้องหยิบซ้ำ', 'info');
    } else {
      r.k(false, `bag-${id}`);
      ctx.audio.error();
      r.coach(`${T.wrongTool} ${WHY_L2[id] || WHY_L2.default}`, 'warn');
    }
    const toolsDone = need.slice(0, 2).every((alts) => alts.some((x) => got.includes(x)));
    if (toolsDone && !got.includes('bulb') && !movedToRack) {
      movedToRack = true;
      r.coach('เครื่องมือครบแล้ว ยังขาดวัสดุอีก 1 อย่าง — ดูที่ชั้นวัสดุ', 'tip');
      await r.moveTo('rack');
    }
  }
  ctx.audio.good();
  r.objective('เตรียมความพร้อมด้านความปลอดภัย แล้วไปที่ประตู "ไปห้องเรียน ม.2/1"');
  const ppe = { helmet: false, gloves: false, goggles: false };
  ctx.hud.set({ ppe: { ...ppe } });
  await r.moveTo('door');
  const doorHint = r.hint(ws.door, { offset: 0.1 });
  let warnedPPE = false;
  const ppeHints = [];
  for (;;) {
    const targets = [{ obj: ws.door, id: 'door', label: 'ไปห้องเรียน ม.2/1' }];
    for (const k of Object.keys(ppe)) if (!ppe[k]) targets.push({ obj: ws.ppe[k], id: k, label: `สวม${ITEMS[k].th}` });
    const id = await r.pick(targets);
    if (id === 'door') {
      const missing = Object.keys(ppe).filter((k) => !ppe[k]);
      if (!missing.length) break;
      ctx.audio.error();
      if (!warnedPPE) { r.a(10 * missing.length, 'no-ppe', ADVICE.noPPE); warnedPPE = true; } else r.coach(ADVICE.noPPE, 'warn');
      for (const k of missing) if (!ppeHints.some((h) => h.target === ws.ppe[k])) ppeHints.push(r.hint(ws.ppe[k], { offset: 0.12 }));
      await r.moveTo('ppe');
      continue;
    }
    ppe[id] = true;
    ctx.hud.set({ ppe: { ...ppe } });
    for (const h of ppeHints.filter((h) => h.target === ws.ppe[id])) r.unhint(h);
    const cam = wp(ctx.camera);
    r.fly(ws.ppe[id], cam, { sec: 0.5, arc: 0.1, hide: true });
    ctx.audio.good();
    if (id === 'gloves') ctx.hands.setGloves(true);
    if (id === 'goggles') document.body.classList.add('goggles');
    if (id === 'helmet') document.body.classList.add('helmet');
    r.coach(`สวม${ITEMS[id].th}แล้ว`, 'good');
    if (Object.values(ppe).every(Boolean)) { r.coach('PPE ครบ 3 ชิ้น พร้อมทำงานอย่างปลอดภัย!', 'good'); await r.moveTo('door'); }
  }
  r.unhint(doorHint);
  r.log('ppe', { warned: warnedPPE });

  // ---- 5. ADVICE : ซ่อมจริงในห้องเรียน พร้อมคำแนะนำทันที (ฉากที่ 4) ----
  await r.goTo('classroom', 'start');
  r.stage('ADVICE');
  r.startTimer(L.timeLimit);
  r.coach('ห้องมืดมาก! เริ่มจากจุดไหนก่อนก็ได้ — เก้าอี้ หรือไฟเพดาน', 'info');
  const st = { bolts: 0, chairDone: false, ladderPlaced: false, onLadder: false, oldOut: false, newIn: false, lightDone: false, shock: 0, powerOffFirst: null };
  const objectiveText = () => `ซ่อมเก้าอี้ (น็อต ${st.bolts}/4) · เปลี่ยนหลอดไฟ ${st.lightDone ? '✓' : st.newIn ? '(เปิดสวิตช์ทดสอบ)' : ''}`;
  let switchHint = null;
  while (!st.chairDone || !st.lightDone) {
    r.objective(objectiveText());
    const targets = [];
    if (!st.chairDone) cr.chair.bolts.forEach((b, i) => { if (!b.userData.tight) targets.push({ obj: b, id: `bolt${i}`, label: b.userData.kind === 'hex' ? 'น็อตหัวหกเหลี่ยม' : 'สกรูยึดที่นั่ง' }); });
    if (!st.lightDone) {
      targets.push({ obj: cr.switchHolder, id: 'switch', label: cr.switchOn ? 'สวิตช์ไฟ (เปิดอยู่)' : 'สวิตช์ไฟ (ปิดอยู่)' });
      targets.push({ obj: cr.lamp, id: 'lamp', label: 'หลอดไฟเพดาน', highlight: false });
      if (!st.onLadder) targets.push({ obj: cr.ladder, id: 'ladder', label: st.ladderPlaced ? 'ปีนบันได' : 'บันได' });
    }
    const idleObjs = !st.chairDone ? [cr.chair.group] : !st.ladderPlaced ? [cr.ladder] : [cr.switchHolder];
    const id = await r.pick(targets, { idle: { sec: 30, text: ADVICE.idle, objs: idleObjs } });

    if (id.startsWith('bolt')) {
      const b = cr.chair.bolts[Number(id.slice(4))];
      if (st.onLadder) { st.onLadder = false; }
      await r.moveTo('chair');
      const hex = b.userData.kind === 'hex';
      const correct = (hex ? ['wrench'] : ['screwdriver', 'drill']).filter((x) => got.includes(x));
      const tool = await r.chooseTool({
        title: hex ? 'น็อตหัวหกเหลี่ยม — ใช้อะไรขัน?' : 'สกรูหัวแฉก — ใช้อะไรขัน?', options: got, correct,
        why: { default: hex ? ADVICE.wrongToolFor.hex : ADVICE.wrongToolFor.screw }, tag: `tool-${b.userData.kind}`,
      });
      await r.timing({ anchor: wp(b), title: hex ? 'ขันน็อตขาเก้าอี้' : 'ขันสกรูที่นั่ง', tool, mode: tool === 'drill' ? 'screw' : 'tighten', hits: 3 }, `bolt-${b.userData.kind}`);
      b.userData.tight = true; markDone(b);
      st.bolts++;
      if (st.bolts === 4) {
        st.chairDone = true; cr.wobble = false;
        ctx.audio.ping();
        r.coach('ทดสอบนั่งแล้ว — เก้าอี้มั่นคง ไม่โยกเยกอีก!', 'good');
      }
    } else if (id === 'switch') {
      ctx.audio.switchClick(wp(cr.switchHolder));
      cr.setSwitch(!cr.switchOn);
      if (!cr.switchOn) {
        if (st.powerOffFirst === null) st.powerOffFirst = true;
        if (switchHint) { r.unhint(switchHint); switchHint = null; }
        r.coach(st.newIn ? 'ปิดสวิตช์อยู่ — เปิดอีกครั้งเพื่อทดสอบ' : 'ตัดไฟแล้ว ปลอดภัย พร้อมเปลี่ยนหลอด', st.newIn ? 'info' : 'good');
      } else if (st.newIn) {
        st.lightDone = true;
        if (switchHint) { r.unhint(switchHint); switchHint = null; }
        cr.setLit(true); ctx.world.applyLighting();
        ctx.audio.ping(); ctx.audio.good();
        r.coach('ไฟสว่างแล้ว! ห้องเรียนกลับมาใช้งานได้', 'good');
      } else {
        r.coach('หลอดยังขาดอยู่ เปิดสวิตช์ไปก็ไม่ติด — ปิดไว้ก่อนแล้วเปลี่ยนหลอด', 'tip');
      }
    } else if (id === 'ladder') {
      if (!st.ladderPlaced) {
        ctx.audio.thump(wp(cr.ladder));
        await r.fly(cr.ladder, new THREE.Vector3(1.2, 0, -1.6), { sec: 0.8, arc: 0.3 });
        cr.ladder.rotation.set(0, 0, 0);
        st.ladderPlaced = true;
        r.coach('ตั้งบันไดใต้หลอดไฟอย่างมั่นคงแล้ว ปีนขึ้นไปได้', 'good');
      } else {
        await r.moveTo('ladder');
        st.onLadder = true;
      }
    } else if (id === 'lamp') {
      if (!st.onLadder) { r.coach(st.ladderPlaced ? 'ปีนบันไดก่อน แล้วค่อยแตะหลอดไฟ' : 'หลอดไฟอยู่สูง ต้องใช้บันได', 'tip'); continue; }
      if (cr.switchOn && !st.newIn) {
        st.shock++;
        if (st.powerOffFirst === null) st.powerOffFirst = false;
        ctx.audio.error();
        r.a(15, 'power-on', ADVICE.powerOn);
        if (!switchHint) switchHint = r.hint(cr.switchHolder, { offset: 0.08 });
        continue;
      }
      if (!st.oldOut) {
        await r.timing({ anchor: wp(cr.oldBulb), title: 'หมุนคลายหลอดเก่าออก', mode: 'loosen', hits: 2 }, 'bulb-out');
        st.oldOut = true;
        await r.fly(cr.oldBulb, new THREE.Vector3(1.0, 0.03, -1.1), { sec: 0.6, arc: 0.05, hide: true });
        r.coach('ถอดหลอดเก่าแล้ว — ใส่หลอดใหม่จากกระเป๋าช่าง', 'good');
      } else if (!st.newIn) {
        await r.chooseTool({ title: 'เลือกของจากกระเป๋าช่าง', options: got, correct: ['bulb'], why: { default: ADVICE.wrongToolFor.bulb }, tag: 'bulb' });
        cr.newBulb.visible = true;
        await r.timing({ anchor: wp(cr.newBulb), title: 'หมุนหลอดใหม่เข้าขั้ว', mode: 'tighten', hits: 2 }, 'bulb-in');
        st.newIn = true;
        await r.moveTo('lampFloor');
        st.onLadder = false;
        r.coach('ลงจากบันไดแล้ว เปิดสวิตช์ทดสอบได้เลย', 'info');
        if (!switchHint) switchHint = r.hint(cr.switchHolder, { offset: 0.08 });
      }
    }
  }
  const timer = r.stopTimer();
  const overtime = timer && timer.left < 0;
  if (overtime) r.s(0.5, 'overtime');
  r.objective('ซ่อมครบแล้ว!');

  // ---- 4. SYNTHESIS ----
  r.stage('SYNTHESIS');
  await r.wait(0.8);
  await r.synthesis([true, !overtime, (r.flags.misses || 0) <= 4 && st.shock === 0]);

  // ---- 6. CRITERION ----
  r.stage('CRITERION');
  ctx.hud.set({ bag: null, ppe: null });
  return r.criterion();
}

/** DIVIDE (CK) — the 7 tool groups, tap each to learn its job. */
function groupsLesson(r) {
  r.check();
  return r.flow.wrap((resolve) => {
    const p = new Panel({ w: 1.7, h: 0.92, border: '#d99a0b' });
    p.setContent({ eyebrow: '2.DIVIDE · เนื้อหา (CK)', title: 'เครื่องมือช่างพื้นฐาน 7 กลุ่ม', accent: '#d99a0b', body: 'แตะแต่ละกลุ่มเพื่อดูว่าใช้ทำอะไร แล้วกด "เข้าใจแล้ว"', bodySize: 30 });
    const seen = new Set();
    GROUPS.forEach((gr, i) => {
      const row = i < 4 ? 0 : 1, col = row ? i - 4 : i;
      const n = row ? 3 : 4;
      const x = (col - (n - 1) / 2) * 0.4;
      p.addButton({
        id: gr.id, label: `${i + 1}. ${gr.th.replace('เครื่องมือ', '')}`, sub: gr.ex, style: 'blue', w: 0.37, h: 0.15, x, y: 0.06 - row * 0.18,
        onClick: (b) => { seen.add(gr.id); b.setState('selected'); r.coach(`${gr.th}: ${gr.use} เช่น ${gr.ex}`, 'info'); },
      });
    });
    p.addButton({ id: 'ok', label: T.understood, style: 'primary', x: 0.55, y: -0.37, w: 0.5, h: 0.11, onClick: () => { r.log('groups', { seen: seen.size }); resolve(); } });
    r.place(p.group, { pos: new THREE.Vector3(2.2, 1.62, -3.86), yaw: 0 });
    p.pop();
    return () => p.dispose();
  });
}

// =====================================================================
// ด่านที่ 3 — โรงซ่อมใหญ่ (Hard · K, S & A + Teamwork)
// =====================================================================
async function level3(r) {
  const L = LEVELS[2];
  const hub = ctx.world.scenes.hub, ws = ctx.world.scenes.workshop, rest = ctx.world.scenes.restroom;
  ws.reset(); rest.reset(); clearMarks(ws.shelf.root); resetPlayerGear();
  ctx.hands.setGloves(true); document.body.classList.add('goggles', 'helmet');   // experienced now: geared up from the start

  // ---- 1. AIM ----
  await r.goTo('hub');
  r.stage('AIM');
  r.objective('ฟังภารกิจสุดท้ายจากครู');
  hub.teacher.wave();
  r.say(hub.teacher, T.teacherName, L.teacherLine);
  await r.wait(1.0);
  await r.missionCard();

  // ---- 2. DIVIDE : หลักการซ่อมแซม 5 ขั้นตอน ----
  r.stage('DIVIDE');
  r.objective('อ่านองค์ความรู้ แล้วเรียงหลักการซ่อมแซม 5 ขั้นตอน');
  await r.divideCard();
  await orderSteps(r, L.steps5);

  // ---- 3. INTEGRATE : ซ่อมก๊อกน้ำตาม 5 ขั้นตอน ----
  await r.goTo('restroom', 'start');
  r.stage('INTEGRATE');
  rest.onDrip = (p) => ctx.audio.drip(p);
  r.objective('ขั้นที่ 1 ตรวจสอบความชำรุด: หาจุดที่น้ำรั่ว');
  await r.pick([{ obj: rest.faucet, id: 'f', label: 'ก๊อกน้ำ' }], { idle: { sec: 12, objs: [rest.faucet], text: 'ฟังเสียงน้ำหยด แล้วมองหาก๊อกที่รั่ว' } });
  await r.moveTo('sink');
  r.coach('พบน้ำหยดจากปากก๊อกตลอดเวลา แม้ปิดสุดแล้ว', 'info');
  r.objective('ขั้นที่ 2 วิเคราะห์สาเหตุ');
  await r.quiz(L.cause, { eyebrow: '3.INTEGRATE · ขั้นที่ 2 วิเคราะห์สาเหตุ (K)', tag: 'cause' });
  r.objective('ขั้นที่ 3 วางแผนการทำงาน');
  const planOk = await r.quiz(L.plan, { eyebrow: '3.INTEGRATE · ขั้นที่ 3 วางแผน (K)', tag: 'plan' });

  r.objective('ขั้นที่ 4 ปฏิบัติ: ปิดวาล์ว → คลายหัวก๊อก → เปลี่ยนซีลยาง → ประกอบกลับ');
  const head = rest.faucet.userData.head;
  const headHome = head.position.clone();
  const st = { headOff: false, washerOut: false, washerIn: false, headOn: false, sprayed: 0 };
  let newWasher = null;
  const faucetTool = {
    options: ALL_TOOLS, correct: ['adjwrench'], tag: 'faucet-tool',
    why: { wrench: 'ประแจปากตายอาจไม่พอดีน็อตก๊อก ใช้ประแจเลื่อนที่ปรับขนาดได้', pliers: 'คีมจะทำให้ผิวก๊อกเป็นรอยและน็อตรูด', default: ADVICE.wrongToolFor.faucet },
  };
  while (!st.headOn) {
    const targets = [{ obj: rest.valve, id: 'valve', label: rest.valveOpen ? 'วาล์วน้ำ (เปิดอยู่)' : 'วาล์วน้ำ (ปิดแล้ว)' }, { obj: rest.faucet, id: 'faucet', label: 'หัวก๊อกน้ำ' }];
    if (st.headOff && !st.washerOut) targets.push({ obj: rest.oldWasher, id: 'washer', label: 'ซีลยางเก่า' });
    const id = await r.pick(targets);
    if (id === 'valve') {
      await r.moveTo('valve');
      ctx.audio.switchClick(wp(rest.valve));
      rest.setValve(!rest.valveOpen);
      if (!rest.valveOpen) r.coach('ปิดวาล์วน้ำแล้ว ถอดก๊อกได้อย่างปลอดภัย', 'good');
      else if (st.headOff) { rest.spray(1.2); ctx.audio.spray(wp(rest.faucet)); r.a(10, 'valve-reopened', 'อย่าเพิ่งเปิดวาล์วตอนก๊อกยังถอดอยู่!'); }
      else r.coach('เปิดวาล์วอยู่ — ถ้าจะถอดก๊อกต้องปิดก่อนนะ', 'tip');
      await r.moveTo('sink');
    } else if (id === 'washer') {
      await r.fly(rest.oldWasher, new THREE.Vector3(0.7, 0.9, -1.95), { sec: 0.5, hide: true });
      st.washerOut = true;
      r.coach('เอาซีลยางเก่าที่สึกออกแล้ว — ใส่ซีลยางใหม่', 'good');
    } else if (!st.headOff) {
      if (rest.valveOpen) {
        st.sprayed++;
        rest.spray(1.6); ctx.audio.spray(wp(rest.faucet));
        r.a(15, 'valve-open', ADVICE.valveOpen);
        continue;
      }
      const tool = await r.chooseTool({ title: 'คลายน็อตหัวก๊อกด้วยอะไร?', ...faucetTool });
      await r.timing({ anchor: wp(head), title: 'คลายน็อตหัวก๊อก', tool, mode: 'loosen', hits: 3 }, 'faucet-loosen');
      await r.fly(head, new THREE.Vector3(0.45, 0.92, -2.12), { sec: 0.6, arc: 0.15 });
      rest.oldWasher.position.copy(rest.faucet.position).add(new THREE.Vector3(0, 0.19, 0));
      rest.oldWasher.rotation.set(0, 0, 0);
      rest.oldWasher.visible = true;
      st.headOff = true;
      r.coach('ถอดหัวก๊อกแล้ว — เห็นซีลยางเก่าที่สึกหรอ หยิบออกก่อน', 'info');
    } else if (!st.washerOut) {
      r.coach('หยิบซีลยางเก่าออกก่อน', 'tip');
    } else if (!st.washerIn) {
      await r.chooseTool({
        title: 'ใส่อะไรแทนซีลยางเก่า?', eyebrow: 'ความรู้ (K) · เลือกวัสดุ', options: ['washer', 'teflon', 'screws', 'nails'], correct: ['washer'], tag: 'washer',
        why: { teflon: 'เทปพันเกลียวใช้พันเกลียวท่อ ไม่ได้แทนซีลที่เสื่อม', default: ADVICE.wrongToolFor.washer },
      });
      newWasher = makeItem('washer');
      newWasher.position.copy(rest.faucet.position).add(new THREE.Vector3(0, 0.19, 0));
      rest.faucet.parent.add(newWasher);
      newWasher.userData.temp = true;     // restroom.reset() removes it if the run is abandoned
      st.washerIn = true;
      ctx.audio.good();
      r.coach('ใส่ซีลยางใหม่แล้ว — ประกอบหัวก๊อกกลับ', 'good');
    } else {
      const tool = await r.chooseTool({ title: 'ขันหัวก๊อกกลับด้วยอะไร?', ...faucetTool, tag: 'faucet-tool-2' });
      await r.fly(head, wp(rest.faucet).add(headHome), { sec: 0.5, arc: 0.1 });
      head.position.copy(headHome);
      newWasher?.parent?.remove(newWasher);
      await r.timing({ anchor: wp(head), title: 'ขันหัวก๊อกให้แน่น', tool, mode: 'tighten', hits: 3 }, 'faucet-tighten');
      st.headOn = true;
    }
  }
  if (!rest.valveOpen) {
    r.objective('เปิดวาล์วน้ำกลับ');
    const h = r.hint(rest.valve, { offset: 0.08 });
    while (!rest.valveOpen) {
      await r.pick([{ obj: rest.valve, id: 'valve', label: 'วาล์วน้ำ' }]);
      ctx.audio.switchClick(wp(rest.valve));
      rest.setValve(true);
    }
    r.unhint(h);
  }
  rest.leaking = false;
  r.objective('ขั้นที่ 5 ประเมินผลและทดสอบ: เปิด-ปิดก๊อกน้ำ');
  await r.moveTo('sink');
  await r.pick([{ obj: rest.faucet, id: 'test', label: 'เปิด-ปิดทดสอบ' }]);
  rest.flowing = true; ctx.audio.spray(wp(rest.faucet));
  await r.wait(1.6);
  rest.flowing = false; rest.puddle.visible = false;
  await r.wait(1.2);
  ctx.audio.ping();
  r.coach('ปิดแล้วน้ำไม่หยดอีก — ซ่อมก๊อกสำเร็จ!', 'good');
  r.log('faucet', { sprayed: st.sprayed });
  await r.wait(1.0);

  // ---- 5. ADVICE : Spot the Hazard (ฉากที่ 5) + Teamwork ----
  await r.goTo('workshop', 'hazard');
  r.stage('ADVICE');
  ws.friendBusy = true;
  let drillT = 0;
  const offDrill = r.game.addTicker((dt) => { if (ws.friendBusy && !ws.friendGoggles.visible) { drillT -= dt; if (drillT < 0) { drillT = 3; ctx.audio.drill(1.0, wp(ws.friend.head)); } } });
  r.objective('Spot the Hazard: หาจุดเสี่ยง 3 จุดในห้องช่าง');
  r.coach(ADVICE.hazardHint, 'info');
  r.startTimer(L.hazardTime);
  const found = new Set();
  const fixHazard = async (hz) => {
    if (hz.id === 'goggles') { ws.friendGoggles.visible = true; ws.friendBusy = false; r.say(ws.friend, T.friendName, 'ขอบใจนะ! ลืมสวมแว่นไปเลย'); }
    if (hz.id === 'cord') { ws.hazards.cord.userData.plug.position.set(0.7, 0.03, 0.4); ws.hazards.cord.userData.puddle.visible = false; ctx.audio.switchClick(wp(ws.hazards.cord)); }
    if (hz.id === 'saw') { await r.fly(ws.hazards.saw, new THREE.Vector3(-2.6, 0.93, 1.75), { sec: 0.5 }); ws.hazards.saw.rotation.set(0, 0, Math.PI / 2); }
  };
  const hazardObj = { goggles: ws.friend.root, cord: ws.hazards.cord, saw: ws.hazards.saw };
  while (found.size < L.hazards.length) {
    const remain = L.hazards.filter((h) => !found.has(h.id));
    const id = await r.pick(remain.map((h) => ({ obj: hazardObj[h.id], id: h.id, label: 'จุดเสี่ยง?' })),
      { until: () => !r.timer || r.timer.left <= 0 });
    if (id === 'timeout') break;
    const hz = L.hazards.find((h) => h.id === id);
    ctx.audio.notify();
    await r.dialog({
      eyebrow: `Spot the Hazard · พบแล้ว ${found.size + 1}/${L.hazards.length}`, title: 'จุดเสี่ยงที่ต้องแก้!', accent: '#e23b3b', h: 0.6, bodySize: 38,
      body: `${hz.text} — ช่วยแก้ไขด้วยนะ!`, buttons: [{ id: 'fix', label: hz.fix, style: 'primary' }],
    });
    found.add(id);
    await fixHazard(hz);
    ctx.audio.good();
  }
  r.stopTimer();
  const missed = L.hazards.filter((h) => !found.has(h.id));
  if (missed.length) {
    r.a(15 * missed.length, 'missed-hazard');
    const hs = missed.map((h) => r.hint(hazardObj[h.id], { offset: 0.1 }));
    await r.dialog({
      eyebrow: 'หมดเวลา', title: `ยังเหลือจุดเสี่ยง ${missed.length} จุด`, accent: '#e23b3b', h: 0.7, bodySize: 32,
      body: missed.map((h) => `• ${h.text}`).join('\n'), buttons: [{ id: 'ok', label: 'แก้ไขให้เรียบร้อย', style: 'primary' }],
    });
    for (const h of missed) await fixHazard(h);
    hs.forEach((h) => r.unhint(h));
  } else r.coach('ตาไวมาก! พบจุดเสี่ยงครบทั้ง 3 จุด', 'good');
  offDrill();
  ws.friendBusy = false;

  // teamwork — the shelf
  ws.friend.root.position.set(-0.35, 0, -1.5);
  ws.friend.root.rotation.y = Math.PI;
  await r.moveTo('shelf');
  ws.friend.wave();
  r.say(ws.friend, T.friendName, 'มาช่วยกันทำชั้นวางหนังสือ! เธอวัดและตัดไม้ เดี๋ยวเราช่วยจับไม้ให้');
  const S = ws.shelf;
  const at = (v) => S.root.localToWorld(v.clone());
  r.objective('งานไม้ 1/4: วัดไม้ยาว 60 ซม. แล้วทำเครื่องหมาย');
  await r.chooseTool({ title: 'วัดความยาวไม้ด้วยอะไร?', options: ALL_TOOLS, correct: ['tape'], why: { default: ADVICE.wrongToolFor.measure }, tag: 'measure' });
  await r.timing({ anchor: at(new THREE.Vector3(0.15, 0.03, 0)), title: 'หยุดเข็มที่ 60 ซม.', tool: 'tape', mode: 'measure', hits: 1 }, 'measure');
  S.cutMark.visible = true;
  r.objective('งานไม้ 2/4: ตัดไม้ตามแนวเครื่องหมาย');
  await r.chooseTool({ title: 'ตัดไม้ด้วยอะไร?', options: ALL_TOOLS, correct: ['saw'], why: { default: ADVICE.wrongToolFor.cut }, tag: 'cut' });
  await r.timing({ anchor: at(new THREE.Vector3(0.15, 0.03, 0)), title: 'เลื่อยตามแนวเส้น', tool: 'saw', mode: 'saw', hits: 3 }, 'saw');
  S.cutMark.visible = false;
  S.plank.scale.x = 0.667; S.plank.position.x = -0.15;
  S.offcut.visible = true;
  await r.fly(S.offcut, at(new THREE.Vector3(0.9, -0.85, 0.3)), { sec: 0.6, arc: 0.1, hide: true });
  ctx.audio.thump(at(new THREE.Vector3(0.9, -0.85, 0.3)));

  r.objective('งานไม้ 3/4: ส่งเครื่องมือให้เพื่อน (Teamwork)');
  r.say(ws.friend, T.friendName, 'ส่งเครื่องมือสำหรับเจาะรูนำให้หน่อย จะได้เจาะก่อนขันสกรู ไม้จะไม่แตก');
  await r.chooseTool({ title: 'ภูมิขอเครื่องมือเจาะรูนำ', eyebrow: 'Teamwork · ส่งให้ถูกชิ้น', options: ALL_TOOLS, correct: ['drill'], why: { default: ADVICE.teamAsk }, tag: 'team' });
  const teamOk = r.lastFirstTry;
  if (!teamOk) r.a(5, 'team-wrong-tool');
  ws.friendBusy = true; ctx.audio.drill(1.4, wp(ws.friend.head));
  await r.wait(1.5);
  ws.friendBusy = false;
  S.sideL.visible = true; S.sideR.visible = true;
  S.plank.scale.x = 1; S.plank.position.set(0, 0.413, 0);
  r.say(ws.friend, T.friendName, 'เจาะรูนำเสร็จแล้ว ขันสกรูยึดได้เลย!');

  r.objective('งานไม้ 4/4: ขันสกรูยึดชั้นวาง 2 จุด');
  const fixTool = await r.chooseTool({ title: 'ยึดสกรูด้วยอะไร?', options: ALL_TOOLS, correct: ['screwdriver', 'drill'], why: { default: ADVICE.wrongToolFor.fix }, tag: 'fix' });
  for (const [i, pt] of S.screwPts.entries()) {
    await r.timing({ anchor: wp(pt), title: `ขันสกรูจุดที่ ${i + 1}/2`, tool: fixTool, mode: fixTool === 'drill' ? 'screw' : 'tighten', hits: 2 }, 'shelf-screw');
    pt.visible = true; markDone(pt);
  }
  await r.dialog({
    eyebrow: '3.INTEGRATE · ขั้นที่ 5 ประเมินและทดสอบ', title: 'ทดสอบความแข็งแรง', accent: '#37c2a8', h: 0.56,
    body: 'วางหนังสือบนชั้น เพื่อตรวจว่าชั้นรับน้ำหนักได้', buttons: [{ id: 'test', label: 'วางหนังสือ', style: 'primary' }],
  });
  S.books.visible = true; ctx.audio.thump(wp(S.books)); ctx.audio.ping();
  ws.friend.wave();
  r.say(ws.friend, T.friendName, 'แข็งแรงมาก! ทำงานเป็นทีมกับเธอสนุกจริงๆ');
  await r.wait(1.5);

  // ---- 4. SYNTHESIS ----
  r.stage('SYNTHESIS');
  await r.synthesis([true, planOk && (r.flags.misses || 0) <= 6, found.size === L.hazards.length && teamOk]);

  // ---- 6. CRITERION ----
  r.stage('CRITERION');
  return r.criterion();
}

/** DIVIDE (CK) — put the 5 repair steps in order. */
function orderSteps(r, steps) {
  r.check();
  return r.flow.wrap((resolve) => {
    const p = new Panel({ w: 1.4, h: 1.1, border: '#2f9fd0' });
    p.setContent({ eyebrow: '2.DIVIDE · เนื้อหา (CK)', title: 'หลักการซ่อมแซมเบื้องต้น 5 ขั้นตอน', accent: '#2f9fd0', body: 'แตะขั้นตอนตามลำดับ จากขั้นแรกจนถึงขั้นสุดท้าย', bodySize: 30 });
    let next = 0;
    const penalized = new Set();
    const order = shuffle(steps.map((s, i) => i));
    order.forEach((idx, row) => {
      p.addButton({
        id: idx, label: steps[idx], style: 'option', align: 'left', size: 34, w: 1.2, h: 0.1, x: 0, y: 0.15 - row * 0.12,
        onClick: (b) => {
          if (b.state === 'correct') return;
          if (idx === next) {
            if (!penalized.has(next)) r.k(true, `step${next + 1}`);
            b.setLabel(`${next + 1}.  ${steps[idx]}`);
            b.setState('correct');
            ctx.audio.good();
            next++;
            if (next === steps.length) {
              ctx.audio.ping();
              r.coach('ตรวจสอบ → วิเคราะห์ → วางแผน → ปฏิบัติ → ประเมินและทดสอบ ใช้ได้กับงานซ่อมทุกงาน!', 'good');
              p.addButton({ id: 'go', label: T.next, style: 'primary', x: 0.45, y: -0.48, w: 0.4, h: 0.1, onClick: () => resolve() });
            }
          } else {
            if (!penalized.has(next)) { r.k(false, `step${next + 1}`); penalized.add(next); }
            ctx.audio.error();
            b.setState('wrong');
            setTimeout(() => { if (b.state === 'wrong') b.setState('normal'); }, 500);
            r.coach(`ขั้นที่ ${next + 1} ยังไม่ใช่ข้อนี้ — ${next === 0 ? 'ก่อนจะซ่อมอะไร ต้องดูให้รู้ก่อนว่าเสียตรงไหน' : `ต่อจาก "${steps[next - 1]}" คืออะไร?`}`, 'tip');
          }
        },
      });
    });
    r.place(p.group);
    p.pop();
    return () => p.dispose();
  });
}

export const SCRIPTS = [level1, level2, level3];
