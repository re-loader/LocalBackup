import { T, LEVELS, TEST, ITEMS, TOOL_INFO } from './strings.js';

// สิ่งที่ครูช่างอ่านออกเสียง (VAJA) — ใช้ร่วมกันทั้งตัวเกมและ tools/build-voice.mjs
// แต่ละประโยคประกอบจาก "ชิ้น" ที่บันทึกเสียงไว้แล้ว เกมจึงพูดข้อความยาวได้ด้วยเสียงจริงทั้งหมด
// (pure: imports only strings.js, so Node can load it without three.js)

export const N = {
  /** 1.AIM — the mission's measurable goals, read out with their K/S/A labels */
  aims: (L) => ['เป้าหมายของด่านนี้', ...L.aims.flatMap((a) => [T.scoreLabels[a.k], a.text])].join(' '),
  /** 2.DIVIDE — the CK / PK / TK cards */
  divide: (L) => ['แยกองค์ความรู้ก่อนลงมือ', ...L.divide.flatMap((d) => [d.title, d.body])].join(' '),
  job: (job) => `${job.title} ${job.task}`,
  hazard: (hz) => `${hz.text} ช่วยแก้ไขด้วยนะ!`,
  missed: (list) => [`ยังเหลือจุดเสี่ยง ${list.length} จุด`, ...list.map((h) => h.text)].join(' '),
  /** a tool picked off the wall: name, what it is for, one safety rule */
  tool: (id) => `${ITEMS[id].th} ${TOOL_INFO[id].use} ข้อควรระวัง ${TOOL_INFO[id].safety}`,
};
// Shown but deliberately not spoken (VAJA voices learning content only): ADISAC stage changes,
// SYNTHESIS / CRITERION results, scores and praise, the title and final screens.

/** Every recorded piece the narrations above are stitched from. */
export function narrationPieces() {
  const p = new Set();
  p.add('เป้าหมายของด่านนี้'); p.add('แยกองค์ความรู้ก่อนลงมือ');
  for (const k of ['K', 'S', 'A']) p.add(T.scoreLabels[k]);
  for (const L of LEVELS) {
    for (const a of L.aims) p.add(a.text);
    for (const d of L.divide) { p.add(d.title); p.add(d.body); }
    for (const j of L.jobs || []) p.add(N.job(j));
    for (const h of L.hazards || []) p.add(h.text);
  }
  p.add('ช่วยแก้ไขด้วยนะ!');
  for (let n = 1; n <= 3; n++) p.add(`ยังเหลือจุดเสี่ยง ${n} จุด`);
  for (const it of TEST.items) p.add(it.q);                 // the coach reads each test question
  p.add('ข้อควรระวัง');
  for (const [id, t] of Object.entries(TOOL_INFO)) { p.add(ITEMS[id].th); p.add(t.use); p.add(t.safety); }
  return [...p];
}
