// เสียงทั้งหมดสังเคราะห์ด้วย Web Audio — ไม่มีไฟล์เสียง จึงเล่นออฟไลน์ได้
// รวมถึงเสียงพูดภาษาไทยผ่าน speechSynthesis ถ้าเครื่องมีเสียงภาษาไทย

export class Sound {
  constructor() {
    this.ctx = null;
    this.musicOn = true;
    this.voiceOn = true;
    this._musicTimer = null;
    this._noise = null;
    this._thVoice = null;
  }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain(); this.sfx.gain.value = 0.8; this.sfx.connect(this.master);
    this.mus = this.ctx.createGain(); this.mus.gain.value = 0.0; this.mus.connect(this.master);
    const len = this.ctx.sampleRate;
    this._noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this._noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._pickVoice();
    if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = () => this._pickVoice();
    if (this.musicOn) this.startMusic();
  }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }

  _tone(freq, dur, { type = 'sine', gain = 0.3, at = 0, slide = null, attack = 0.005, out = null } = {}) {
    if (!this.ctx) return;
    const t0 = this.t + at;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(out || this.sfx);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  _noiseBurst(dur, { at = 0, gain = 0.3, filter = 'bandpass', freq = 2000, q = 1, slideTo = null } = {}) {
    if (!this.ctx) return;
    const t0 = this.t + at;
    const s = this.ctx.createBufferSource();
    s.buffer = this._noise;
    s.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = filter; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(this.sfx);
    s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.05);
  }

  click() { this._tone(1400, 0.05, { type: 'square', gain: 0.08, slide: 900 }); }
  hover() { this._tone(2200, 0.03, { type: 'sine', gain: 0.03 }); }
  error() {
    this._tone(240, 0.18, { type: 'sawtooth', gain: 0.12 });
    this._tone(180, 0.26, { type: 'sawtooth', gain: 0.12, at: 0.12 });
  }
  /** "ปิ๊ง!" — bright bell. */
  ping() {
    this._tone(1568, 0.6, { gain: 0.22 });
    this._tone(2349, 0.45, { gain: 0.1 });
    this._tone(3136, 0.3, { gain: 0.05 });
  }
  good() {
    this._tone(784, 0.12, { type: 'triangle', gain: 0.18 });
    this._tone(1175, 0.22, { type: 'triangle', gain: 0.18, at: 0.09 });
  }
  /** "ติ๊ง" — notification chime for a new case. */
  notify() {
    this._tone(988, 0.25, { gain: 0.2 });
    this._tone(1319, 0.5, { gain: 0.2, at: 0.14 });
  }
  /** "แก๊กๆ" — ratchet clicks while tightening. */
  ratchet(n = 5) {
    for (let i = 0; i < n; i++) this._noiseBurst(0.035, { at: i * 0.06, gain: 0.35, freq: 3200, q: 6 });
  }
  drill(dur = 0.6) {
    if (!this.ctx) return;
    const t0 = this.t;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), lfo = this.ctx.createOscillator(), lg = this.ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(90, t0); o.frequency.exponentialRampToValueAtTime(210, t0 + 0.15);
    lfo.frequency.value = 38; lg.gain.value = 12; lfo.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.08, t0 + 0.05);
    g.gain.setValueAtTime(0.08, t0 + dur - 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
    o.connect(f); f.connect(g); g.connect(this.sfx);
    o.start(t0); lfo.start(t0); o.stop(t0 + dur + 0.05); lfo.stop(t0 + dur + 0.05);
  }
  saw() {
    this._noiseBurst(0.22, { gain: 0.25, freq: 1800, q: 2, slideTo: 3600 });
    this._noiseBurst(0.22, { at: 0.25, gain: 0.25, freq: 3600, q: 2, slideTo: 1800 });
  }
  spray() { this._noiseBurst(1.4, { gain: 0.3, filter: 'lowpass', freq: 5000, slideTo: 1200 }); }
  drip() { this._tone(1300, 0.09, { gain: 0.12, slide: 500 }); }
  whoosh() { this._noiseBurst(0.35, { gain: 0.12, filter: 'bandpass', freq: 400, q: 0.8, slideTo: 2400 }); }
  switchClick() { this._noiseBurst(0.03, { gain: 0.4, freq: 2500, q: 3 }); }
  thump() { this._tone(120, 0.18, { type: 'sine', gain: 0.35, slide: 60 }); }
  star(i) { this._tone(880 * Math.pow(1.26, i), 0.35, { type: 'triangle', gain: 0.2 }); }
  fanfare() {
    const n = [523, 659, 784, 1047];
    n.forEach((f, i) => this._tone(f, 0.22, { type: 'square', gain: 0.07, at: i * 0.12 }));
    [523, 659, 784, 1047].forEach((f) => this._tone(f, 1.1, { type: 'triangle', gain: 0.1, at: 0.5 }));
    this._tone(1568, 1.0, { gain: 0.08, at: 0.5 });
  }

  // ---- เพลงประกอบเบาๆ แบบสนุกสนาน (ลูปสั้น สร้างด้วยโค้ด) ----
  startMusic() {
    if (!this.ctx || this._musicTimer) return;
    this.mus.gain.setTargetAtTime(0.055, this.t, 0.6);
    const bpm = 112, beat = 60 / bpm;
    const chords = [[262, 330, 392], [220, 262, 330], [175, 220, 262], [196, 247, 294]];
    const melody = [784, 0, 659, 784, 880, 784, 659, 0, 587, 659, 523, 0, 587, 0, 659, 0,
      784, 0, 880, 784, 659, 0, 523, 587, 659, 0, 587, 523, 494, 0, 523, 0];
    let step = 0;
    let next = this.t + 0.1;
    const tick = () => {
      while (next < this.t + 0.4) {
        const bar = Math.floor(step / 8) % 4;
        const at = next - this.t;
        if (step % 2 === 0) this._tone(chords[bar][0] / 2, beat * 0.9, { type: 'triangle', gain: 0.5, at, out: this.mus });
        if (step % 4 === 2) chords[bar].forEach((f) => this._tone(f, beat * 0.6, { type: 'sine', gain: 0.12, at, out: this.mus }));
        const m = melody[step % melody.length];
        if (m) this._tone(m, beat * 0.45, { type: 'square', gain: 0.08, at, out: this.mus });
        step++;
        next += beat / 2;
      }
    };
    this._musicTimer = setInterval(tick, 100);
    tick();
  }
  stopMusic() {
    if (this._musicTimer) clearInterval(this._musicTimer);
    this._musicTimer = null;
    if (this.mus) this.mus.gain.setTargetAtTime(0, this.t, 0.2);
  }
  setMusic(on) { this.musicOn = on; if (on) this.startMusic(); else this.stopMusic(); }
  duck(on) { if (this.mus && this._musicTimer) this.mus.gain.setTargetAtTime(on ? 0.02 : 0.055, this.t, 0.25); }

  // ---- เสียงพูดภาษาไทย ----
  _pickVoice() {
    const ss = window.speechSynthesis;
    if (!ss) return;
    const vs = ss.getVoices();
    this._thVoice = vs.find((v) => /^th/i.test(v.lang)) || null;
  }
  speak(text) {
    const ss = window.speechSynthesis;
    if (!this.voiceOn || !ss || !this._thVoice) return;
    ss.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[!—•→]/g, ' '));
    u.voice = this._thVoice; u.lang = this._thVoice.lang; u.rate = 1.05; u.pitch = 1.1;
    u.onstart = () => this.duck(true);
    u.onend = () => this.duck(false);
    ss.speak(u);
  }
  get hasThaiVoice() { return !!this._thVoice; }
}
