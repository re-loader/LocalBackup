import { STAGE, T, LEVELS } from './strings.js';

// สิ่งที่ครูช่างอ่านออกเสียง (VAJA) — ใช้ร่วมกันทั้งตัวเกมและ tools/build-voice.mjs
// แต่ละประโยคประกอบจาก "ชิ้น" ที่บันทึกเสียงไว้แล้ว เกมจึงพูดข้อความยาวได้ด้วยเสียงจริงทั้งหมด
// (pure: imports only strings.js, so Node can load it without three.js)

export const N = {
  /** ADISAC step announcement — "ขั้นที่ 2 DIVIDE แยกองค์ความรู้" */
  stage: (key) => `ขั้นที่ ${STAGE[key].n} ${key} ${STAGE[key].th}`,
  /** 1.AIM — the mission's measurable goals, read out with their K/S/A labels */
  aims: (L) => ['เป้าหมายของด่านนี้', ...L.aims.flatMap((a) => [T.scoreLabels[a.k], a.text])].join(' '),
  /** 2.DIVIDE — the CK / PK / TK cards */
  divide: (L) => ['แยกองค์ความรู้ก่อนลงมือ', ...L.divide.flatMap((d) => [d.title, d.body])].join(' '),
  job: (job) => `${job.title} ${job.task}`,
  hazard: (hz) => `${hz.text} ช่วยแก้ไขด้วยนะ!`,
  missed: (list) => [`ยังเหลือจุดเสี่ยง ${list.length} จุด`, ...list.map((h) => h.text)].join(' '),
  /** 4.SYNTHESIS */
  synthesis: (n, of) => `ตรวจสอบเงื่อนไขผ่านด่าน ผ่าน ${n} จาก ${of} ข้อ`,
  /** 6.CRITERION */
  result: (pass, stars) => (pass ? `${T.result.title} ได้ ${stars} ดาว ${T.result.praise[Math.min(2, Math.max(0, stars - 1))]}` : `${T.result.titleRetry} ${T.result.fail}`),
  title: () => `${T.tagline} กดปุ่มเริ่มเกมได้เลย`,
  final: (master) => (master ? `${T.final.title} ${T.final.body}` : T.final.notYet),
};

/** Every recorded piece the narrations above are stitched from. */
export function narrationPieces() {
  const p = new Set();
  for (const k of Object.keys(STAGE)) p.add(N.stage(k));
  p.add('เป้าหมายของด่านนี้'); p.add('แยกองค์ความรู้ก่อนลงมือ');
  for (const k of ['K', 'S', 'A']) p.add(T.scoreLabels[k]);
  for (const L of LEVELS) {
    for (const a of L.aims) p.add(a.text);
    for (const d of L.divide) { p.add(d.title); p.add(d.body); }
    for (const j of L.jobs || []) p.add(N.job(j));
    for (const h of L.hazards || []) p.add(h.text);
    for (let n = 0; n <= L.checklist.length; n++) p.add(`ผ่าน ${n} จาก ${L.checklist.length} ข้อ`);
  }
  p.add('ช่วยแก้ไขด้วยนะ!');
  for (let n = 1; n <= 3; n++) { p.add(`ยังเหลือจุดเสี่ยง ${n} จุด`); p.add(`ได้ ${n} ดาว`); }
  p.add('ตรวจสอบเงื่อนไขผ่านด่าน');
  p.add(T.result.title); p.add(T.result.titleRetry); p.add(T.result.fail);
  T.result.praise.forEach((x) => p.add(x));
  p.add(T.tagline); p.add('กดปุ่มเริ่มเกมได้เลย');
  p.add(T.final.title); p.add(T.final.body); p.add(T.final.notYet);
  return [...p];
}
