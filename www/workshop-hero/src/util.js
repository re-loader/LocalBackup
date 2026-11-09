// เครื่องมือช่วยทั่วไป: ตัดคำภาษาไทย วาดกรอบมุมมน คณิตศาสตร์ และ Flow ที่ยกเลิกได้

const wordSeg = typeof Intl !== 'undefined' && Intl.Segmenter
  ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
const graphemeSeg = typeof Intl !== 'undefined' && Intl.Segmenter
  ? new Intl.Segmenter('th', { granularity: 'grapheme' }) : null;

export function segmentWords(text) {
  if (wordSeg) return Array.from(wordSeg.segment(text), (s) => s.segment);
  return text.split(/(\s+)/);
}
function segmentGraphemes(text) {
  if (graphemeSeg) return Array.from(graphemeSeg.segment(text), (s) => s.segment);
  return Array.from(text);
}

/** Thai has no spaces between words — wrap on word segments, then graphemes. */
export function wrapLines(g, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    const emit = () => { const t = line.trimEnd(); if (t) out.push(t); line = ''; };
    for (const part of segmentWords(para)) {
      const test = line + part;
      if (line && g.measureText(test).width > maxW) {
        emit();
        line = /^\s+$/.test(part) ? '' : part;
        if (g.measureText(line).width > maxW) {
          let piece = '';
          for (const gr of segmentGraphemes(line)) {
            if (piece && g.measureText(piece + gr).width > maxW) { out.push(piece); piece = gr; } else piece += gr;
          }
          line = piece;
        }
      } else line = test;
    }
    emit();
  }
  return out;
}

/** Draws wrapped text; returns the y below the last line. */
export function drawWrapped(g, text, x, y, maxW, lh, maxLines = 99) {
  const lines = wrapLines(g, text, maxW);
  lines.slice(0, maxLines).forEach((l, i) => g.fillText(l, x, y + i * lh));
  return y + Math.min(lines.length, maxLines) * lh;
}

export function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

export function shuffle(a) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

export class Cancelled extends Error {
  constructor() { super('cancelled'); this.name = 'Cancelled'; }
}

/**
 * Cancellable awaits for the scripted level flow. Each wait registers a
 * cleanup, so restarting a level mid-task removes its panels and listeners
 * instead of leaving them orphaned in the scene.
 */
export class Flow {
  constructor() {
    this.pending = new Set();
    this.timers = new Set();
    this.time = 0;
  }

  wrap(executor) {
    return new Promise((resolve, reject) => {
      const entry = { reject, cleanup: null, settled: false };
      this.pending.add(entry);
      const settle = (fn) => (v) => {
        if (entry.settled) return;
        entry.settled = true;
        this.pending.delete(entry);
        try { entry.cleanup?.(); } catch (e) { console.error(e); }
        fn(v);
      };
      try {
        entry.cleanup = executor(settle(resolve), settle(reject)) || null;
      } catch (e) { settle(reject)(e); }
    });
  }

  /** Waits in game time (paused with the frame loop). */
  wait(sec) {
    return this.wrap((res) => {
      const t = { at: this.time + sec, res };
      this.timers.add(t);
      return () => this.timers.delete(t);
    });
  }

  update(dt) {
    this.time += dt;
    for (const t of [...this.timers]) if (this.time >= t.at) t.res();
  }

  cancel() {
    const all = [...this.pending];
    this.pending.clear();
    for (const e of all) {
      if (e.settled) continue;
      e.settled = true;
      try { e.cleanup?.(); } catch (err) { console.error(err); }
      e.reject(new Cancelled());
    }
    this.timers.clear();
  }
}
