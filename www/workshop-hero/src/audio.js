
// เสียงทั้งหมดสังเคราะห์ด้วย Web Audio — ไม่มีไฟล์เสียง จึงเล่นออฟไลน์ได้
// ความสมจริง: เสียงมีทิศทาง 3 มิติ (HRTF) ตามตำแหน่งต้นเสียง · เสียงก้องตามขนาดห้อง ·
// เสียงบรรยากาศประจำห้อง (พัดลม ไฟฟลูออเรสเซนต์ นกนอกหน้าต่าง นาฬิกา) · เสียงฝีเท้า
// และเสียงพูดภาษาไทยจาก VAJA (NECTEC) เท่านั้น — ไฟล์ที่สร้างไว้แล้ว ไม่ใช้เสียงของเบราว์เซอร์

const ROOMS = {
  hub: { decay: 0.7, wet: 0.16, window: [-3.4, 1.8, 1.4], floor: 'wood' },
  workshop: { decay: 1.35, wet: 0.24, window: [-4.9, 1.9, 0.5], floor: 'concrete' },
  classroom: { decay: 0.95, wet: 0.2, window: [-3.9, 1.8, 0.0], floor: 'tile' },
  restroom: { decay: 1.9, wet: 0.34, window: [-2.4, 2.1, -0.2], floor: 'tile' },
};

export class Sound {
  constructor() {
    this.ctx = null;
    this.musicOn = true;
    this.voiceOn = true;
    this.musicLevel = 0.055;
    this._musicTimer = null;
    this._noise = null;
    this._thVoice = null;
    this._bed = null;
    this.room = null;
    this._pendingRoom = null;
    this.voiceMap = null;            // "role|text" → file, from voice/manifest.json (tools/build-voice.mjs)
    this._byRole = {};
    this._buffers = new Map();
    this._playing = {};
    this._voiceToken = {};
    this._endAt = {};               // role → AudioContext time its current line ends
    this.missing = new Set();       // lines asked for with no VAJA recording (see tools/build-voice.mjs)
  }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = 0.9; this.master.connect(c.destination);
    // sfx → dry + reverb send; ambience has its own (wetter) send
    this.sfx = c.createGain(); this.sfx.gain.value = 0.8; this.sfx.connect(this.master);
    this.amb = c.createGain(); this.amb.gain.value = 1; this.amb.connect(this.master);
    this.verb = c.createConvolver();
    this.verbOut = c.createGain(); this.verbOut.gain.value = 1;
    this.verb.connect(this.verbOut); this.verbOut.connect(this.master);
    this.verbSend = c.createGain(); this.verbSend.gain.value = 0.2;
    this.sfx.connect(this.verbSend); this.verbSend.connect(this.verb);
    this.ambSend = c.createGain(); this.ambSend.gain.value = 0.3;
    this.amb.connect(this.ambSend); this.ambSend.connect(this.verb);
    this.mus = c.createGain(); this.mus.gain.value = 0.0; this.mus.connect(this.master);
    this.voiceBus = c.createGain(); this.voiceBus.gain.value = 1.0; this.voiceBus.connect(this.master);
    const len = c.sampleRate * 2;
    this._noise = c.createBuffer(1, len, c.sampleRate);
    const d = this._noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.verb.buffer = this._ir(1.0);
    if (this.musicOn) this.startMusic();
    if (this._pendingRoom) this.setRoom(this._pendingRoom);
  }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }

  // ------------------------------------------------------------ space
  /** Keeps the Web Audio listener on the player's head (call every frame). */
  listen(m) {
    if (!this.ctx) return;
    const L = this.ctx.listener, e = m.elements;
    const fx = -e[8], fy = -e[9], fz = -e[10], ux = e[4], uy = e[5], uz = e[6];
    if (L.positionX) {
      const t = this.t;
      L.positionX.setTargetAtTime(e[12], t, 0.02); L.positionY.setTargetAtTime(e[13], t, 0.02); L.positionZ.setTargetAtTime(e[14], t, 0.02);
      L.forwardX.setTargetAtTime(fx, t, 0.02); L.forwardY.setTargetAtTime(fy, t, 0.02); L.forwardZ.setTargetAtTime(fz, t, 0.02);
      L.upX.setTargetAtTime(ux, t, 0.02); L.upY.setTargetAtTime(uy, t, 0.02); L.upZ.setTargetAtTime(uz, t, 0.02);
    } else {
      L.setPosition(e[12], e[13], e[14]);
      L.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  /** Output node for a sound: a 3D panner at `pos` (THREE.Vector3 / [x,y,z]) or the plain bus. */
  _out(pos, bus = this.sfx, life = 4) {
    if (!pos || !this.ctx) return bus;
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
    p.refDistance = 0.7; p.maxDistance = 25; p.rolloffFactor = 1.1;
    const [x, y, z] = Array.isArray(pos) ? pos : [pos.x, pos.y, pos.z];
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
    p.connect(bus);
    if (life) setTimeout(() => { try { p.disconnect(); } catch { /* gone */ } }, life * 1000);
    return p;
  }

  /** Room impulse response: decaying stereo noise, darker as it tails off. */
  _ir(decay) {
    const c = this.ctx, sr = c.sampleRate, len = Math.max(1, Math.floor(sr * decay));
    const b = c.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const k = i / len;
        const a = 0.35 + 0.6 * k;           // one-pole low-pass that closes over time
        lp = lp * a + (Math.random() * 2 - 1) * (1 - a);
        d[i] = lp * Math.pow(1 - k, 2.2) * (i < sr * 0.004 ? 0 : 1);
      }
    }
    return b;
  }

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

  _noiseBurst(dur, { at = 0, gain = 0.3, filter = 'bandpass', freq = 2000, q = 1, slideTo = null, out = null, attack = 0.01 } = {}) {
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
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(out || this.sfx);
    s.start(t0, Math.random() * 1.5); s.stop(t0 + dur + 0.05);
  }

  // ------------------------------------------------------------ UI
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
  whoosh() { this._noiseBurst(0.35, { gain: 0.1, filter: 'bandpass', freq: 400, q: 0.8, slideTo: 2400 }); }
  star(i) { this._tone(880 * Math.pow(1.26, i), 0.35, { type: 'triangle', gain: 0.2 }); }
  fanfare() {
    const n = [523, 659, 784, 1047];
    n.forEach((f, i) => this._tone(f, 0.22, { type: 'square', gain: 0.07, at: i * 0.12 }));
    n.forEach((f) => this._tone(f, 1.1, { type: 'triangle', gain: 0.1, at: 0.5 }));
    this._tone(1568, 1.0, { gain: 0.08, at: 0.5 });
  }

  // ------------------------------------------------------------ work sounds (positional)
  /** "แก๊กๆ" — ratchet clicks while tightening. */
  ratchet(n = 5, pos = null) {
    const out = this._out(pos);
    for (let i = 0; i < n; i++) this._noiseBurst(0.035, { at: i * 0.06, gain: 0.35, freq: 3200, q: 6, out });
  }
  /** A single ratchet tick (VR twisting: one per ~25° of wrist roll). */
  tick(pos = null, gain = 0.3) { this._noiseBurst(0.03, { gain, freq: 3400, q: 7, out: this._out(pos) }); }
  drill(dur = 0.6, pos = null) {
    if (!this.ctx) return;
    const out = this._out(pos, this.sfx, dur + 1);
    const t0 = this.t;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), lfo = this.ctx.createOscillator(), lg = this.ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(90, t0); o.frequency.exponentialRampToValueAtTime(210, t0 + 0.15);
    lfo.frequency.value = 38; lg.gain.value = 12; lfo.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.08, t0 + 0.05);
    g.gain.setValueAtTime(0.08, t0 + dur - 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
    o.connect(f); f.connect(g); g.connect(out);
    o.start(t0); lfo.start(t0); o.stop(t0 + dur + 0.05); lfo.stop(t0 + dur + 0.05);
  }
  saw(pos = null) {
    const out = this._out(pos);
    this._noiseBurst(0.22, { gain: 0.25, freq: 1800, q: 2, slideTo: 3600, out });
    this._noiseBurst(0.22, { at: 0.25, gain: 0.25, freq: 3600, q: 2, slideTo: 1800, out });
  }
  /** One saw stroke (VR): direction sets the pitch sweep. */
  sawStroke(pos = null, push = true) {
    this._noiseBurst(0.2, { gain: 0.24, freq: push ? 1800 : 3400, q: 2, slideTo: push ? 3400 : 1800, out: this._out(pos) });
  }
  spray(pos = null) { this._noiseBurst(1.4, { gain: 0.3, filter: 'lowpass', freq: 5000, slideTo: 1200, out: this._out(pos) }); }
  drip(pos = null) {
    const out = this._out(pos);
    this._tone(1300, 0.09, { gain: 0.14, slide: 500, out });
    this._tone(2600, 0.05, { gain: 0.04, slide: 1400, out, at: 0.01 });
  }
  switchClick(pos = null) { this._noiseBurst(0.03, { gain: 0.4, freq: 2500, q: 3, out: this._out(pos) }); }
  thump(pos = null, gain = 0.35) {
    const out = this._out(pos);
    this._tone(120, 0.18, { type: 'sine', gain, slide: 60, out });
    this._noiseBurst(0.06, { gain: gain * 0.5, freq: 900, q: 1, out });
  }
  /** Footstep on the current room's floor. */
  step() {
    const fl = ROOMS[this.room]?.floor || 'concrete';
    const v = 0.7 + Math.random() * 0.3;
    if (fl === 'wood') { this._tone(95, 0.09, { gain: 0.09 * v, slide: 70 }); this._noiseBurst(0.05, { gain: 0.05 * v, freq: 700, q: 1 }); }
    else if (fl === 'tile') { this._noiseBurst(0.04, { gain: 0.07 * v, freq: 2600, q: 2 }); this._tone(160, 0.05, { gain: 0.05 * v }); }
    else this._noiseBurst(0.07, { gain: 0.08 * v, freq: 1600, q: 0.7 });
  }
  clockTick(pos) { this._noiseBurst(0.012, { gain: 0.08, freq: 4200, q: 8, out: this._out(pos, this.amb, 1) }); }

  // ------------------------------------------------------------ rooms & ambience
  /** Switches the room acoustics and its ambience bed (cross-fades). */
  setRoom(name) {
    if (!this.ctx) { this._pendingRoom = name; return; }
    if (this.room === name && this._bed) return;
    this.room = name;
    const R = ROOMS[name] || ROOMS.workshop;
    this.verb.buffer = this._ir(R.decay);
    this.verbSend.gain.setTargetAtTime(R.wet, this.t, 0.2);
    this._startBed(name, R);
  }

  _startBed(name, R) {
    const c = this.ctx, t = this.t;
    if (this._bed) {
      const old = this._bed;
      old.gain.gain.setTargetAtTime(0, t, 0.4);
      clearTimeout(old.birdTimer);
      setTimeout(() => old.nodes.forEach((n) => { try { n.stop?.(); n.disconnect(); } catch { /* done */ } }), 2500);
    }
    const bed = { gain: c.createGain(), nodes: [], birdTimer: null };
    bed.gain.gain.value = 0; bed.gain.connect(this.amb);
    bed.gain.gain.setTargetAtTime(1, t, 0.6);
    const noise = (type, freq, q, gain, lfoRate = 0, lfoDepth = 0) => {
      const s = c.createBufferSource(); s.buffer = this._noise; s.loop = true;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain(); g.gain.value = gain;
      s.connect(f); f.connect(g); g.connect(bed.gain);
      if (lfoRate) {
        const l = c.createOscillator(), lg = c.createGain();
        l.frequency.value = lfoRate; lg.gain.value = gain * lfoDepth;
        l.connect(lg); lg.connect(g.gain); l.start(); bed.nodes.push(l, lg);
      }
      s.start(0, Math.random()); bed.nodes.push(s, f, g);
    };
    const hum = (freq, gain) => {
      const o = c.createOscillator(); o.frequency.value = freq;
      const g = c.createGain(); g.gain.value = gain;
      o.connect(g); g.connect(bed.gain); o.start(); bed.nodes.push(o, g);
    };
    if (name === 'workshop') {
      hum(100, 0.006); hum(200, 0.003);                 // fluorescent ballast
      noise('lowpass', 380, 0.7, 0.045);                // ventilation / room tone
      noise('bandpass', 320, 0.8, 0.03, 2.6, 0.35);     // ceiling fans
      noise('bandpass', 650, 1.4, 0.008, 0.13, 0.8);    // distant school, rising and falling
    } else if (name === 'classroom') {
      noise('lowpass', 300, 0.7, 0.03);
      noise('bandpass', 300, 0.8, 0.045, 3.1, 0.4);     // two fans overhead
      noise('bandpass', 700, 1.2, 0.012, 0.09, 0.9);    // kids outside
    } else if (name === 'restroom') {
      noise('lowpass', 220, 0.6, 0.03);
      noise('highpass', 4200, 0.7, 0.004);              // pipe hiss
    } else {
      hum(60, 0.004);
      noise('lowpass', 240, 0.6, 0.035);                // air conditioner
    }
    // birds outside the window, placed in 3D
    const chirp = () => {
      if (this._bed !== bed) return;
      const out = this._out(R.window, bed.gain, 2);
      const base = 2400 + Math.random() * 1800;
      const n = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) this._tone(base * (0.9 + Math.random() * 0.25), 0.07, { gain: 0.03, at: i * 0.11, slide: base * 1.35, out });
      bed.birdTimer = setTimeout(chirp, 2500 + Math.random() * 6000);
    };
    if (name !== 'restroom') bed.birdTimer = setTimeout(chirp, 1500);
    this._bed = bed;
  }

  // ------------------------------------------------------------ music (title loop, low under play)
  startMusic() {
    if (!this.ctx || this._musicTimer) return;
    this.mus.gain.setTargetAtTime(this.musicLevel, this.t, 0.6);
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
  /** Title screen: full; during play: quiet, so the room can be heard. */
  setMusicLevel(v) { this.musicLevel = v; if (this.mus && this._musicTimer) this.mus.gain.setTargetAtTime(v, this.t, 0.8); }
  duck(on) { if (this.mus && this._musicTimer) this.mus.gain.setTargetAtTime(on ? this.musicLevel * 0.35 : this.musicLevel, this.t, 0.25); }

  // ------------------------------------------------------------ recorded Thai voices (VAJA)
  async loadVoices() {
    try {
      const r = await fetch('voice/manifest.json', { cache: 'no-cache' });
      if (r.ok) this.voiceMap = await r.json();
    } catch { this.voiceMap = null; }
    this._byRole = {};
    for (const k of Object.keys(this.voiceMap || {})) {
      const i = k.indexOf('|');
      (this._byRole[k.slice(0, i)] ||= []).push(k.slice(i + 1));
    }
    for (const r of Object.keys(this._byRole)) this._byRole[r].sort((a, b) => b.length - a.length);
    return Object.keys(this.voiceMap || {}).length;
  }

  /** Clip files for a line: an exact recording, or the line stitched from recorded sentences. */
  _clips(text, role) {
    const map = this.voiceMap;
    if (!map) return null;
    const t = text.trim();
    if (map[`${role}|${t}`]) return [map[`${role}|${t}`]];
    // stitch from recorded sentences, longest first, backtracking if a choice leads nowhere;
    // separators the screen uses (— · → : quotes) are not spoken and may sit between pieces
    const lines = this._byRole[role] || [];
    const SEP = /^[\s—·→:,()"'-]+/;
    const solve = (rest, depth) => {
      rest = rest.replace(SEP, '');
      if (!rest) return [];
      if (depth > 24) return null;
      for (const l of lines) {
        if (!rest.startsWith(l)) continue;
        const tail = solve(rest.slice(l.length), depth + 1);
        if (tail) return [map[`${role}|${l}`], ...tail];
      }
      return null;
    };
    const out = solve(t, 0);
    return out && out.length ? out : null;
  }

  _buffer(file) {
    if (!this._buffers.has(file)) {
      this._buffers.set(file, fetch(`voice/${file}`).then((r) => {
        if (!r.ok) throw new Error(`voice ${r.status}`);
        return r.arrayBuffer();
      }).then((b) => this.ctx.decodeAudioData(b)));
    }
    return this._buffers.get(file);
  }

  /**
   * Says a line in a character's recorded voice: teacher / friend from their head in 3D
   * (with the room's echo), the coach close and dry like a radio in your ear.
   * Falls back to the browser's Thai voice (desktop) — the headset's is silent.
   * Resolves with the spoken duration in seconds (0 when nothing was played).
   */
  async voice(text, role = 'coach', pos = null) {
    if (!this.voiceOn || !text) return 0;
    const files = this._clips(text, role);
    if (!files || !this.ctx) {
      // VAJA is the only voice: a line with no recording stays silent (its text is on screen) and is logged
      if (this.voiceMap && !this.missing.has(`${role}|${text}`)) { this.missing.add(`${role}|${text}`); console.warn(`[voice] no VAJA recording for ${role}: ${text}`); }
      return 0;
    }
    const token = (this._voiceToken[role] = (this._voiceToken[role] || 0) + 1);
    for (const s of this._playing[role] || []) { try { s.stop(); } catch { /* ended */ } }
    this._playing[role] = [];
    this._endAt[role] = 0;
    let bufs;
    try { bufs = await Promise.all(files.map((f) => this._buffer(f))); } catch { return 0; }
    if (token !== this._voiceToken[role]) return 0;           // superseded while loading
    const out = pos ? this._out(pos, this.sfx, 40) : this.voiceBus;
    // one person talks at a time: wait for anyone else still speaking (a role interrupts only itself)
    let t = this.t + 0.03;
    for (const [r, end] of Object.entries(this._endAt)) if (r !== role && end > t) t = end + 0.25;
    const srcs = [];
    for (const b of bufs) {
      const s = this.ctx.createBufferSource();
      s.buffer = b; s.connect(out); s.start(t);
      srcs.push(s);
      t += b.duration + 0.06;
    }
    this._playing[role] = srcs;
    this._endAt[role] = t;
    const dur = t - this.t;
    this.duck(true);
    clearTimeout(this._duckT);
    this._duckT = setTimeout(() => this.duck(false), dur * 1000);
    return dur;
  }
  stopVoices() {
    this._endAt = {};
    for (const r of Object.keys(this._playing)) {
      this._voiceToken[r] = (this._voiceToken[r] || 0) + 1;
      for (const s of this._playing[r]) { try { s.stop(); } catch { /* ended */ } }
      this._playing[r] = [];
    }
  }

}
