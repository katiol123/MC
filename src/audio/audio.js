// Audio: procedurally synthesised sound effects (WebAudio) + the fight music track.
// Reacts to simulation events; never influences the simulation.
/**
 * Recorded sound effects (assets/sfx). They play through <audio> elements, which also work when the
 * game is opened from file://; until a file has loaded (or if it fails) the synthesised sound plays.
 * `gap` = seconds before the same sample may start again (scenes that spam a sound get one take).
 */
const SAMPLES = {
  roar: { src: 'roar.mp3', gain: 0.6, gap: 0.8 },
  sob: { src: 'sobs.mp3', gain: 0.75, gap: 1.2 },
  laugh: { src: 'laugh.mp3', gain: 0.9, gap: 1.2 },
  chord: { src: 'guitar-chord.mp3', gain: 0.9, gap: 0.35 },
  cheer: { src: 'crowd-cheer.mp3', gain: 0.6, gap: 1.0 },
  crowdLaugh: { src: 'crowd-laugh.mp3', gain: 0.95, gap: 1.0 },
  chomp: { src: 'chomp.mp3', gain: 0.9, gap: 0.25 },
  shing: { src: 'knife.mp3', gain: 0.9, gap: 0.3 },
  // fatality scenes (the frying-pan clang and the heartbeat stay synthesised)
  boom: { src: 'boom.mp3', gain: 0.85, gap: 0.3 },
  whoosh: { src: 'whoosh.mp3', gain: 0.55, gap: 0.3 },
  crash: { src: 'crash.mp3', gain: 0.85, gap: 0.3 },
  boing: { src: 'boing.mp3', gain: 0.7, gap: 0.2 },
  thud: { src: 'thud.mp3', gain: 0.85, gap: 0.15 },
  pop: { src: 'pop.mp3', gain: 0.8, gap: 0.15 },
  crumble: { src: 'crumble.mp3', gain: 0.75, gap: 0.5 },
  ding: { src: 'ding.mp3', gain: 0.6, gap: 0.3 },
  splash: { src: 'splash.mp3', gain: 0.8, gap: 0.4 },
  cash: { src: 'cash.mp3', gain: 0.7, gap: 0.2 },
  zap: { src: 'zap.mp3', gain: 0.55, gap: 0.15 },
  twang: { src: 'twang.mp3', gain: 0.8, gap: 0.3 },
  snore: { src: 'snore.mp3', gain: 0.7, gap: 0.5 },
  kiss: { src: 'kiss.mp3', gain: 0.8, gap: 0.3 },
  fire: { src: 'fire.mp3', gain: 0.6, gap: 0.8 },
};

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.musicVolume = 0.55;
    this.sfxVolume = 0.8;
    this.music = null;
    this.noiseBuf = null;
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.sfxVolume;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    this.loadSamples();
    const d = this.noiseBuf.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < len; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (s / 0x7fffffff) * 2 - 1;
    }
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.music) this.music.muted = !on;
  }

  // --- music ----------------------------------------------------------------------------------
  playMusic(src = 'assets/music/steel-tangerines.mp3') {
    if (!this.music) {
      this.music = new Audio(src);
      this.music.loop = true;
    }
    this.music.muted = !this.enabled;
    this.music.volume = this.musicVolume;
    this.music.currentTime = 0;
    const p = this.music.play();
    if (p && p.catch) p.catch(() => {});
    clearInterval(this.fadeTimer);
  }
  fadeMusic(ms = 1500) {
    if (!this.music) return;
    const m = this.music;
    const v0 = m.volume, steps = 20;
    let i = 0;
    clearInterval(this.fadeTimer);
    this.fadeTimer = setInterval(() => {
      i++;
      m.volume = Math.max(0, v0 * (1 - i / steps));
      if (i >= steps) { clearInterval(this.fadeTimer); m.pause(); m.volume = this.musicVolume; }
    }, ms / steps);
  }
  stopMusic() {
    if (this.music) this.music.pause();
  }

  // --- synthesis helpers ----------------------------------------------------------------------
  noise(dur, { freq = 1200, q = 0.8, type = 'bandpass', gain = 0.5, attack = 0.002, sweep = 0 } = {}) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), c.currentTime + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(gain, c.currentTime + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, c.currentTime + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(c.currentTime, Math.random() * 0.5);
    src.stop(c.currentTime + dur + 0.02);
  }
  tone(dur, { freq = 120, to = 50, type = 'sine', gain = 0.5 } = {}) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), c.currentTime + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0008, c.currentTime + dur);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(c.currentTime + dur + 0.02);
  }

  ui(kind = 'move') {
    if (!this.ctx || !this.enabled) return;
    if (kind === 'move') this.tone(0.06, { freq: 880, to: 660, type: 'square', gain: 0.06 });
    else if (kind === 'confirm') { this.tone(0.18, { freq: 300, to: 900, type: 'sawtooth', gain: 0.1 }); this.noise(0.25, { freq: 3000, gain: 0.15, sweep: 0.3 }); }
    else if (kind === 'back') this.tone(0.12, { freq: 500, to: 200, type: 'square', gain: 0.07 });
    else if (kind === 'slam') { this.tone(0.5, { freq: 90, to: 30, gain: 0.6 }); this.noise(0.4, { freq: 600, gain: 0.5, type: 'lowpass' }); }
  }

  loadSamples() {
    if (this.samples || typeof Audio === 'undefined') return;
    this.samples = {};
    for (const [kind, s] of Object.entries(SAMPLES)) {
      const a = new Audio(`assets/sfx/${s.src}`);
      a.preload = 'auto';
      const rec = { el: a, ready: false, last: -1e9, ...s };
      a.addEventListener('canplaythrough', () => { rec.ready = true; }, { once: true });
      a.addEventListener('error', () => { rec.ready = false; }, { once: true });
      this.samples[kind] = rec;
    }
  }

  /** Plays a recorded sample; false when there is none (ready) for this kind. */
  playSample(kind) {
    const s = this.samples?.[kind];
    if (!s?.ready) return false;
    const now = performance.now() / 1000;
    if (now - s.last < s.gap) return true; // still ringing: one take is enough
    s.last = now;
    const a = s.el.cloneNode();
    a.volume = Math.max(0, Math.min(1, s.gain * this.sfxVolume));
    a.play().catch(() => {});
    return true;
  }

  /** Short sound effects used by fatality scenes and showboats (recorded where available). */
  sfx(kind) {
    if (this.playSample(kind)) return;
    switch (kind) {
      case 'clang': this.tone(0.8, { freq: 480, to: 470, type: 'triangle', gain: 0.3 }); this.tone(0.6, { freq: 1290, to: 1270, gain: 0.14 }); this.noise(0.1, { freq: 3000, gain: 0.3 }); break;
      case 'thud': this.tone(0.35, { freq: 90, to: 35, gain: 0.7 }); this.noise(0.2, { freq: 400, gain: 0.4, type: 'lowpass' }); break;
      case 'boom': this.tone(1.0, { freq: 60, to: 25, gain: 0.9 }); this.noise(0.8, { freq: 600, gain: 0.7, type: 'lowpass', sweep: 0.5 }); break;
      case 'whoosh': this.noise(0.3, { freq: 1200, q: 1.2, gain: 0.25, sweep: 0.6, attack: 0.08 }); break;
      case 'crash': this.noise(0.6, { freq: 2200, q: 0.6, gain: 0.55, sweep: 0.4 }); this.tone(0.4, { freq: 140, to: 50, gain: 0.5 }); break;
      case 'splash': this.noise(0.9, { freq: 900, q: 0.5, gain: 0.5, sweep: 0.3, attack: 0.02 }); break;
      case 'fire': this.noise(1.2, { freq: 500, gain: 0.6, type: 'lowpass', sweep: 0.4, attack: 0.1 }); break;
      case 'boing': this.tone(0.5, { freq: 180, to: 520, type: 'triangle', gain: 0.25 }); break;
      case 'pop': this.tone(0.12, { freq: 900, to: 300, type: 'square', gain: 0.12 }); break;
      case 'ding': this.tone(1.2, { freq: 1760, to: 1750, type: 'sine', gain: 0.18 }); this.tone(1, { freq: 2640, to: 2630, type: 'sine', gain: 0.08 }); break;
      case 'twang': this.tone(0.9, { freq: 330, to: 160, type: 'sawtooth', gain: 0.25 }); this.tone(0.7, { freq: 495, to: 240, type: 'sawtooth', gain: 0.12 }); break;
      case 'heartbeat': this.tone(0.18, { freq: 60, to: 40, gain: 0.8 }); break;
      case 'squeeze': this.tone(0.4, { freq: 300, to: 700, type: 'square', gain: 0.08 }); break;
      case 'steam': this.noise(1.4, { freq: 5000, q: 0.8, gain: 0.18, attack: 0.2 }); break;
      case 'snap': this.noise(0.05, { freq: 3500, q: 4, gain: 0.5 }); break;
      case 'crumble': this.noise(1.2, { freq: 700, q: 0.4, gain: 0.35, sweep: 0.2 }); break;
      case 'zap': this.tone(0.25, { freq: 1600, to: 300, type: 'sawtooth', gain: 0.12 }); break;
      case 'cash': this.tone(0.15, { freq: 1800, to: 1800, type: 'square', gain: 0.1 }); this.tone(0.4, { freq: 2400, to: 2400, type: 'triangle', gain: 0.1 }); break;
      case 'chord': for (const f of [110, 138.6, 164.8]) this.tone(1.4, { freq: f, to: f * 0.98, type: 'sawtooth', gain: 0.16 }); this.noise(0.6, { freq: 1500, gain: 0.2 }); break;
      case 'snore': this.tone(0.9, { freq: 90, to: 140, type: 'sawtooth', gain: 0.1 }); break;
      case 'kiss': this.tone(0.1, { freq: 1400, to: 2600, type: 'sine', gain: 0.15 }); break;
      case 'shing': this.noise(0.22, { freq: 4000, q: 3, gain: 0.25, sweep: 1.8, attack: 0.03 }); this.tone(0.3, { freq: 2600, to: 3200, type: 'triangle', gain: 0.05 }); break;
      case 'roar': this.noise(1.1, { freq: 260, q: 0.9, gain: 0.8, sweep: 0.3, attack: 0.08 }); this.tone(1.0, { freq: 95, to: 60, type: 'sawtooth', gain: 0.35 }); break;
      case 'cheer': this.noise(1.8, { freq: 1100, q: 0.4, gain: 0.45, sweep: 0.8, attack: 0.25 }); this.noise(1.2, { freq: 2600, q: 0.8, gain: 0.18, attack: 0.2 }); break;
      case 'sob': this.tone(0.4, { freq: 300, to: 700, type: 'square', gain: 0.08 }); break;
      case 'crowdLaugh': this.sfx('laugh'); break;
      case 'chomp': this.noise(0.05, { freq: 3500, q: 4, gain: 0.5 }); this.tone(0.12, { freq: 160, to: 60, gain: 0.4 }); break;
      case 'boo': this.noise(1.3, { freq: 380, q: 0.6, gain: 0.45, sweep: 0.7, attack: 0.2 }); this.tone(1.1, { freq: 140, to: 110, type: 'sawtooth', gain: 0.1 }); break;
      case 'laugh': for (let i = 0; i < 4; i++) setTimeout(() => this.tone(0.12, { freq: 520 - i * 30, to: 420 - i * 30, type: 'triangle', gain: 0.12 }), i * 140); break;
      default: this.tone(0.2, { freq: 300, to: 200, gain: 0.2 });
    }
  }

  onEvent(e) {
    if (!this.ctx || !this.enabled) return;
    switch (e.type) {
      case 'hit': {
        const heavy = e.strength !== 'light';
        this.tone(heavy ? 0.22 : 0.12, { freq: heavy ? 150 : 220, to: 40, gain: heavy ? 0.7 : 0.45 });
        this.noise(heavy ? 0.18 : 0.1, { freq: heavy ? 900 : 1600, q: 0.7, gain: heavy ? 0.7 : 0.45, sweep: 0.4 });
        if (e.counter) this.tone(0.25, { freq: 1200, to: 1800, type: 'triangle', gain: 0.12 });
        if (e.heal > 0) this.tone(0.3, { freq: 660, to: 1320, type: 'triangle', gain: 0.12 }); // heal chime
        if (e.claw) this.noise(0.14, { freq: 4200, q: 1.5, gain: 0.3, sweep: 0.5 }); // claw rake
        if (e.fire) this.noise(0.4, { freq: 500, gain: 0.45, type: 'lowpass', sweep: 0.6 }); // fire whoomph
        if (e.bite) { this.noise(0.09, { freq: 2400, q: 2, gain: 0.45 }); this.tone(0.12, { freq: 180, to: 90, gain: 0.4 }); } // chomp
        if (e.pie) { this.noise(0.25, { freq: 700, type: 'lowpass', gain: 0.6, sweep: 0.3 }); this.tone(0.2, { freq: 300, to: 120, type: 'sine', gain: 0.3 }); } // splat
        if (e.notes) this.tone(0.25, { freq: [523, 659, 784][Math.floor(Math.random() * 3)], type: 'triangle', gain: 0.18 });
        if (e.prop === 'guitar') {
          // hollow wooden thunk + jangling strings; the finisher smashes the guitar
          this.tone(0.3, { freq: 196, to: 150, type: 'triangle', gain: 0.35 });
          for (const f of [330, 440, 554]) this.tone(0.5, { freq: f, to: f * 0.99, type: 'sawtooth', gain: 0.04 });
          if (e.smash) this.noise(0.4, { freq: 1800, q: 0.6, gain: 0.6, sweep: 0.4 });
        }
        if (e.prop === 'glove') { this.tone(0.35, { freq: 220, to: 660, type: 'sine', gain: 0.3 }); this.tone(0.25, { freq: 120, to: 60, gain: 0.5 }); } // boing + thump
        if (e.prop === 'pan') {
          // cast-iron "BONG": inharmonic partials with a long ring
          this.tone(0.7, { freq: 520, to: 505, type: 'triangle', gain: 0.32 });
          this.tone(0.55, { freq: 1370, to: 1340, type: 'sine', gain: 0.16 });
          this.tone(0.4, { freq: 2290, to: 2240, type: 'sine', gain: 0.08 });
        }
        break;
      }
      case 'injury':
        // bone crack: a sharp click + a dull thud
        this.noise(0.06, { freq: 3800, q: 6, gain: 0.6 });
        this.tone(0.3, { freq: 130, to: 50, gain: 0.55 });
        break;
      case 'block':
        if (e.guardBreak) { this.noise(0.35, { freq: 2600, q: 0.8, gain: 0.5, sweep: 0.5 }); this.tone(0.3, { freq: 220, to: 70, gain: 0.5 }); break; }
        this.noise(0.08, { freq: 3200, q: 3, gain: 0.35 });
        this.tone(0.07, { freq: 700, to: 400, type: 'triangle', gain: 0.15 });
        break;
      case 'swing':
        this.noise(e.strength === 'light' ? 0.09 : 0.16, { freq: e.strength === 'light' ? 2600 : 1500, q: 1.2, gain: 0.12, sweep: 0.5, attack: 0.02 });
        break;
      case 'clash':
        this.tone(0.3, { freq: 1500, to: 900, type: 'triangle', gain: 0.25 });
        this.noise(0.15, { freq: 4000, q: 4, gain: 0.3 });
        break;
      case 'land':
        this.noise(e.heavy ? 0.3 : 0.08, { freq: e.heavy ? 300 : 500, type: 'lowpass', gain: e.heavy ? 0.6 : 0.15 });
        if (e.heavy) this.tone(0.25, { freq: 90, to: 35, gain: 0.5 });
        break;
      case 'jump':
      case 'dash':
        this.noise(0.1, { freq: 900, q: 0.6, gain: 0.1, sweep: 1.8 });
        break;
      case 'ko':
        this.tone(1.2, { freq: 110, to: 30, gain: 0.8 });
        this.noise(0.9, { freq: 400, type: 'lowpass', gain: 0.6 });
        break;
      case 'superStart':
        this.tone(0.6, { freq: 140, to: 900, type: 'sawtooth', gain: 0.18 });
        this.noise(0.7, { freq: 2500, q: 0.6, gain: 0.35, sweep: 0.2 });
        break;
      case 'parry':
        this.tone(0.3, { freq: 1800, to: 2600, type: 'triangle', gain: 0.2 });
        this.noise(0.12, { freq: 5000, q: 5, gain: 0.25 });
        break;
      case 'tech':
        this.noise(0.1, { freq: 2200, q: 2, gain: 0.3 });
        break;
      case 'grab':
        this.noise(0.12, { freq: 700, q: 1, gain: 0.35 });
        break;
      case 'finishHim':
        this.tone(1.2, { freq: 70, to: 40, type: 'sawtooth', gain: 0.35 });
        this.tone(1.2, { freq: 105, to: 60, type: 'sawtooth', gain: 0.2 });
        break;
      case 'fatalityStart':
        this.tone(2.2, { freq: 55, to: 45, gain: 0.6 }); // gong
        this.tone(1.8, { freq: 220, to: 210, type: 'triangle', gain: 0.12 });
        this.noise(1.2, { freq: 300, gain: 0.25, type: 'lowpass' });
        break;
      case 'sfx':
        this.sfx(e.kind);
        break;
      case 'critical':
        this.tone(0.16, { freq: 900, to: 300, type: 'square', gain: 0.12 }); // comic "pop"
        this.noise(0.12, { freq: 2400, q: 1.5, gain: 0.2, sweep: 0.4 });
        break;
      case 'armor':
        this.tone(0.3, { freq: 110, to: 60, gain: 0.6 });
        this.noise(0.12, { freq: 900, q: 2, gain: 0.3 });
        break;
      case 'burn':
        this.noise(0.07, { freq: 2600, q: 2, gain: 0.12 }); // crackle
        break;
      case 'projectile':
        if (e.kind === 'flame') { this.noise(0.5, { freq: 700, gain: 0.5, type: 'lowpass', sweep: 0.5, attack: 0.03 }); break; }
        this.tone(0.25, { freq: e.kind === 'coin' ? 1400 : 300, to: e.kind === 'coin' ? 2200 : 160, type: e.kind === 'coin' ? 'triangle' : 'sawtooth', gain: 0.15 });
        break;
      case 'teleport':
        this.tone(0.3, { freq: 200, to: 1600, type: 'sine', gain: 0.2 });
        break;
      case 'tauntDone':
        this.sfx('cheer');
        break;
      case 'tauntBroken':
        if (!this.playSample('crowdLaugh')) this.sfx('boo');
        break;
      case 'announce':
        this.tone(0.35, { freq: 220, to: 440, type: 'sawtooth', gain: 0.08 });
        break;
      default:
    }
  }
}
