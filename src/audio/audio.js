// Audio: procedurally synthesised sound effects (WebAudio) + the fight music track.
// Reacts to simulation events; never influences the simulation.
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

  onEvent(e) {
    if (!this.ctx || !this.enabled) return;
    switch (e.type) {
      case 'hit': {
        const heavy = e.strength !== 'light';
        this.tone(heavy ? 0.22 : 0.12, { freq: heavy ? 150 : 220, to: 40, gain: heavy ? 0.7 : 0.45 });
        this.noise(heavy ? 0.18 : 0.1, { freq: heavy ? 900 : 1600, q: 0.7, gain: heavy ? 0.7 : 0.45, sweep: 0.4 });
        if (e.counter) this.tone(0.25, { freq: 1200, to: 1800, type: 'triangle', gain: 0.12 });
        break;
      }
      case 'block':
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
      case 'projectile':
        this.tone(0.25, { freq: e.kind === 'coin' ? 1400 : 300, to: e.kind === 'coin' ? 2200 : 160, type: e.kind === 'coin' ? 'triangle' : 'sawtooth', gain: 0.15 });
        break;
      case 'teleport':
        this.tone(0.3, { freq: 200, to: 1600, type: 'sine', gain: 0.2 });
        break;
      case 'announce':
        this.tone(0.35, { freq: 220, to: 440, type: 'sawtooth', gain: 0.08 });
        break;
      default:
    }
  }
}
