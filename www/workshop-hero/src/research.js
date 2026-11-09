import { LEVELS, TEST, SURVEY, RESEARCH, normalizedGain } from './strings.js';

// การวิเคราะห์ผลตามงานวิจัย (RESEARCH.title) — คำนวณจากข้อมูลที่บันทึกในเครื่อง
// หนึ่งแถวต่อนักเรียนหนึ่งคน (หนึ่งหลักสูตร = ก่อนเรียน → 3 ด่าน → หลังเรียน → ความพึงพอใจ) ผูกกันด้วย courseId
// pure: no three.js / DOM, so Node can check the numbers

const sum = (a) => a.reduce((s, x) => s + x, 0);
export const mean = (a) => (a.length ? sum(a) / a.length : null);
/** Sample standard deviation (n − 1), as SPSS reports it. */
export const sd = (a) => {
  if (a.length < 2) return null;
  const m = mean(a);
  return Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / (a.length - 1));
};

/**
 * Joins the stored records into one row per course.
 * The first pre-test, the first completed attempt of each mission (E1 uses first attempts, so
 * retries don't inflate it), the first post-test and the first survey of each course count.
 */
export function courseRows({ runs = [], tests = [], surveys = [] }) {
  const by = new Map();
  const row = (id) => {
    if (!by.has(id)) by.set(id, { courseId: id, pre: null, post: null, missions: LEVELS.map(() => null), attempts: LEVELS.map(() => 0), survey: null, seconds: 0 });
    return by.get(id);
  };
  for (const t of tests) {
    if (!t.courseId || (t.phase !== 'pre' && t.phase !== 'post')) continue;
    const r = row(t.courseId);
    if (!r[t.phase]) { r[t.phase] = t; r.seconds += t.seconds || 0; }
  }
  for (const run of runs) {
    const i = run.level - 1;
    if (!run.courseId || !(i >= 0 && i < LEVELS.length)) continue;
    const r = row(run.courseId);
    r.attempts[i]++;
    r.seconds += run.seconds || 0;
    if (!r.missions[i]) r.missions[i] = run;
  }
  for (const s of surveys) {
    if (!s.courseId) continue;
    const r = row(s.courseId);
    if (!r.survey) { r.survey = s; r.seconds += s.seconds || 0; }
  }
  const rows = [...by.values()];
  for (const r of rows) {
    const first = r.pre || r.missions.find(Boolean) || r.post || r.survey;
    r.player = (r.pre || r.post || r.missions.find(Boolean) || r.survey)?.player || '';
    r.date = first?.date || null;
    r.mode = first?.mode || null;
    r.max = (r.post || r.pre)?.max ?? TEST.items.length;
    r.processPct = r.missions.every(Boolean) ? (sum(r.missions.map((m) => m.total)) / (300 * LEVELS.length)) * 100 : null;
    r.prePct = r.pre ? (r.pre.score / r.pre.max) * 100 : null;
    r.postPct = r.post ? (r.post.score / r.post.max) * 100 : null;
    r.gain = r.pre && r.post ? normalizedGain(r.pre.score, r.post.score, r.post.max) : null;
    r.complete = !!(r.pre && r.post && r.processPct !== null);
  }
  return rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/** Aspect key → mean of one survey's ratings in that aspect. */
function aspectMeans(ratings) {
  const out = {};
  for (const k of Object.keys(SURVEY.aspects)) {
    const xs = SURVEY.items.map((it, i) => (it.a === k ? ratings[i] : null)).filter(Number.isFinite);
    out[k] = mean(xs);
  }
  return out;
}

/**
 * Class-level indicators for the report: E1/E2 (criterion 80/80), the effectiveness index
 * E.I. = (Σpost − Σpre) / (N·max − Σpre) — the same number as Hake's ⟨g⟩ from class averages —
 * pre/post mean and S.D., and satisfaction x̄ / S.D. per item, per aspect and overall.
 */
export function summarize(rows) {
  const done = rows.filter((r) => r.complete);
  const N = done.length;
  const max = done[0]?.max ?? TEST.items.length;
  const pre = done.map((r) => r.pre.score), post = done.map((r) => r.post.score);
  const E1 = mean(done.map((r) => r.processPct)), E2 = mean(done.map((r) => r.postPct));
  const denom = N * max - sum(pre);
  const EI = N && denom > 0 ? (sum(post) - sum(pre)) / denom : null;
  const gains = done.map((r) => r.gain).filter((g) => g !== null);

  const sheets = rows.filter((r) => r.survey).map((r) => r.survey.ratings);
  const stat = (xs) => ({ n: xs.length, mean: mean(xs), sd: sd(xs) });
  const items = SURVEY.items.map((it, i) => ({ ...it, ...stat(sheets.map((s) => s[i]).filter(Number.isFinite)) }));
  // aspect and overall: x̄ and S.D. over every response in that group (pooled)
  const aspects = Object.entries(SURVEY.aspects).map(([key, name]) => ({
    key, name, ...stat(sheets.flatMap((s) => SURVEY.items.map((it, i) => (it.a === key ? s[i] : null))).filter(Number.isFinite)),
  }));
  const overall = stat(sheets.flat().filter(Number.isFinite));

  return {
    started: rows.length, N, max,
    E1, E2, passE: E1 !== null && E1 >= RESEARCH.e && E2 >= RESEARCH.e,
    EI, passEI: EI !== null && EI >= RESEARCH.ei,
    pre: { mean: mean(pre), sd: sd(pre) }, post: { mean: mean(post), sd: sd(post) },
    gainMean: mean(gains),
    sat: { n: sheets.length, items, aspects, overall },
  };
}

/** One row per course for SPSS / R / Excel (header row + values; caller adds the BOM). */
export function researchCsv(rows) {
  const n = TEST.items.length;
  const range = (k, f) => Array.from({ length: k }, (_, i) => f(i));
  const head = [
    'course_id', 'player', 'start_date', 'mode', 'complete',
    'pre_score', 'post_score', 'test_max', 'pre_pct', 'post_pct', 'gain_hake',
    ...LEVELS.flatMap((_, i) => ['K', 'S', 'A', 'total', 'stars', 'attempts'].map((c) => `m${i + 1}_${c}`)),
    'process_pct',
    ...range(n, (i) => `pre_item${i + 1}`), ...range(n, (i) => `post_item${i + 1}`),
    ...range(SURVEY.items.length, (i) => `sat${i + 1}`), ...Object.keys(SURVEY.aspects).map((k) => `sat_${k}`), 'sat_mean',
    'minutes',
  ];
  const fix = (v, d = 2) => (v === null || v === undefined || Number.isNaN(v) ? '' : Number(v.toFixed(d)));
  const itemCells = (t) => {
    const by = Object.fromEntries((t?.answers || []).map((a) => [a.item, a]));
    return range(n, (i) => (by[i + 1] ? (by[i + 1].correct ? 1 : 0) : ''));
  };
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((r) => {
    const ratings = r.survey?.ratings || [];
    const am = r.survey ? aspectMeans(ratings) : {};
    return [
      r.courseId, r.player, r.date, r.mode, r.complete ? 1 : 0,
      r.pre?.score ?? '', r.post?.score ?? '', r.max, fix(r.prePct), fix(r.postPct), fix(r.gain, 3),
      ...r.missions.flatMap((m, i) => (m ? [m.K, m.S, m.A, m.total, m.stars, r.attempts[i]] : ['', '', '', '', '', r.attempts[i]])),
      fix(r.processPct),
      ...itemCells(r.pre), ...itemCells(r.post),
      ...range(SURVEY.items.length, (i) => ratings[i] ?? ''), ...Object.keys(SURVEY.aspects).map((k) => fix(am[k])),
      r.survey ? fix(mean(ratings.filter(Number.isFinite))) : '',
      fix(r.seconds / 60, 1),
    ].map(q).join(',');
  });
  return [head.join(','), ...lines].join('\n');
}
