// Procedural combat effects: hit sparks, impact rings, block shields, dust, attack trails,
// floating labels and camera shake. All in world space; driven by simulation events.
import { rgba } from './color.js';

export class Effects {
  constructor() {
    this.parts = [];
    this.labels = [];
    this.shake = 0;
    this.flash = 0;
    this.seed = 7;
  }
  rnd() {
    // effects are cosmetic: a tiny LCG keeps them repeatable without touching the sim RNG
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  onEvent(e, fighters) {
    switch (e.type) {
      case 'hit': {
        const heavy = e.strength !== 'light';
        const n = heavy ? 18 : 10;
        const color = e.counter ? '#ffd23f' : '#ffffff';
        for (let i = 0; i < n; i++) {
          const a = this.rnd() * Math.PI * 2;
          const sp = (heavy ? 7 : 4.5) + this.rnd() * 6;
          this.parts.push({ kind: 'spark', x: e.x, y: e.y, vx: Math.cos(a) * sp + e.dir * 2, vy: Math.sin(a) * sp, life: 14 + this.rnd() * 8, max: 22, color, w: heavy ? 3 : 2 });
        }
        this.parts.push({ kind: 'ring', x: e.x, y: e.y, r: 6, vr: heavy ? 7 : 4.5, life: 12, max: 12, color: e.counter ? '#ffd23f' : '#ff4fd8' });
        this.parts.push({ kind: 'burst', x: e.x, y: e.y, r: heavy ? 34 : 20, life: 6, max: 6, color: '#ffffff', dir: e.dir });
        if (heavy) this.shake = Math.max(this.shake, 4 + (e.shake || 0));
        if (e.ko) { this.shake = 14; this.flash = 0.35; }
        if (e.counter) this.labels.push({ text: 'COUNTER', x: e.x, y: e.y + 60, life: 50, color: '#ffd23f' });
        else if (e.punish) this.labels.push({ text: 'PUNISH', x: e.x, y: e.y + 60, life: 45, color: '#3fe6d0' });
        break;
      }
      case 'block': {
        for (let i = 0; i < 8; i++) {
          const a = (this.rnd() - 0.5) * 1.6 + (e.who === 0 ? Math.PI : 0) + Math.PI;
          this.parts.push({ kind: 'spark', x: e.x, y: e.y, vx: Math.cos(a) * 5, vy: Math.sin(a) * 5, life: 10, max: 10, color: '#7fe8ff', w: 2 });
        }
        this.parts.push({ kind: 'shield', x: e.x, y: e.y, life: 12, max: 12, dir: e.x > (fighters?.[e.target]?.body.x ?? e.x) ? 1 : -1 });
        break;
      }
      case 'parry':
        this.parts.push({ kind: 'ring', x: e.x, y: e.y, r: 10, vr: 9, life: 16, max: 16, color: '#7fe8ff' });
        this.parts.push({ kind: 'shield', x: e.x, y: e.y, life: 16, max: 16, dir: 1 });
        this.labels.push({ text: 'PARRY!', x: e.x, y: e.y + 70, life: 55, color: '#7fe8ff' });
        this.shake = Math.max(this.shake, 4);
        break;
      case 'tech':
        this.parts.push({ kind: 'ring', x: e.x, y: e.y, r: 10, vr: 8, life: 14, max: 14, color: '#ffffff' });
        this.labels.push({ text: 'TECH', x: e.x, y: e.y + 60, life: 45, color: '#ffffff' });
        break;
      case 'grab':
        this.parts.push({ kind: 'ring', x: e.x, y: e.y, r: 6, vr: 5, life: 10, max: 10, color: '#ffd23f' });
        break;
      case 'teleport':
        for (const x of [e.from, e.to]) {
          for (let i = 0; i < 14; i++) {
            const a = this.rnd() * Math.PI * 2;
            this.parts.push({ kind: 'spark', x, y: 40 + this.rnd() * 180, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, life: 18, max: 18, color: '#c27bff', w: 2 });
          }
        }
        break;
      case 'projectileEnd':
        for (let i = 0; i < 6; i++) {
          const a = this.rnd() * Math.PI * 2;
          this.parts.push({ kind: 'spark', x: e.x, y: e.y, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, life: 10, max: 10, color: e.kind === 'coin' ? '#ffd23f' : '#3fe6d0', w: 2 });
        }
        break;
      case 'whiff':
        // a faint air-cut arc: readable as a miss, clearly different from hit sparks / block shields
        this.parts.push({ kind: 'whiff', x: e.x, y: e.y, dir: e.dir, life: 10, max: 10, r: e.strength === 'light' ? 16 : 26 });
        break;
      case 'clash':
        this.parts.push({ kind: 'ring', x: e.x, y: e.y, r: 8, vr: 8, life: 14, max: 14, color: '#ffffff' });
        this.shake = Math.max(this.shake, 5);
        this.labels.push({ text: 'CLASH', x: e.x, y: e.y + 50, life: 40, color: '#ffffff' });
        break;
      case 'land':
        for (let i = 0; i < (e.heavy ? 14 : 6); i++) {
          const s = this.rnd() < 0.5 ? -1 : 1;
          this.parts.push({ kind: 'dust', x: e.x + s * this.rnd() * 20, y: 4, vx: s * (1 + this.rnd() * (e.heavy ? 4 : 2)), vy: this.rnd() * 1.5, r: 6 + this.rnd() * 8, life: 30, max: 30 });
        }
        if (e.heavy) this.shake = Math.max(this.shake, 5);
        break;
      case 'dash':
      case 'jump': {
        const f = fighters?.[e.who];
        if (!f) break;
        for (let i = 0; i < 5; i++) this.parts.push({ kind: 'dust', x: f.body.x, y: 4, vx: -f.facing * (e.dir === -1 ? -1 : 1) * (1 + this.rnd() * 2.5), vy: this.rnd(), r: 5 + this.rnd() * 6, life: 24, max: 24 });
        break;
      }
      case 'dizzy': {
        const f = fighters?.[e.who];
        if (f) this.labels.push({ text: 'DIZZY!', x: f.body.x, y: 300, life: 60, color: '#ffd23f' });
        break;
      }
      default:
    }
  }

  tick() {
    for (const p of this.parts) {
      p.life--;
      if (p.kind === 'spark') { p.x += p.vx; p.y += p.vy; p.vx *= 0.86; p.vy = p.vy * 0.86 - 0.3; }
      else if (p.kind === 'ring') p.r += p.vr *= 0.82;
      else if (p.kind === 'dust') { p.x += p.vx; p.y += p.vy; p.vx *= 0.92; p.r += 0.4; }
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const l of this.labels) { l.life--; l.y += 0.8; }
    this.labels = this.labels.filter((l) => l.life > 0);
    this.shake *= 0.82;
    if (this.shake < 0.2) this.shake = 0;
    this.flash *= 0.85;
  }

  draw(ctx, cam) {
    ctx.save();
    for (const p of this.parts) {
      const s = cam.toScreen(p.x, p.y);
      const k = p.life / p.max;
      if (p.kind === 'spark') {
        const e = cam.toScreen(p.x - p.vx * 2.2, p.y - p.vy * 2.2);
        ctx.strokeStyle = rgba(p.color, Math.min(1, k * 1.5));
        ctx.lineWidth = p.w * cam.zoom;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(e.x, e.y);
        ctx.stroke();
      } else if (p.kind === 'ring') {
        ctx.strokeStyle = rgba(p.color, k);
        ctx.lineWidth = 3 * k * cam.zoom + 0.5;
        ctx.beginPath();
        ctx.arc(s.x, s.y, p.r * cam.zoom, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'burst') {
        // short star-shaped flash, small enough not to hide the action
        ctx.fillStyle = rgba('#ffffff', 0.8 * k);
        ctx.beginPath();
        const n = 8;
        for (let i = 0; i <= n * 2; i++) {
          const a = (i / (n * 2)) * Math.PI * 2;
          const r = (i % 2 ? 0.28 : 1) * p.r * cam.zoom * (1.2 - k * 0.4);
          ctx.lineTo(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r);
        }
        ctx.fill();
      } else if (p.kind === 'whiff') {
        ctx.strokeStyle = rgba('#ffffff', 0.35 * k);
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          const r = (p.r + i * 7 + (1 - k) * 10) * cam.zoom;
          const a0 = p.dir > 0 ? -0.7 : Math.PI - 0.7;
          ctx.arc(s.x - p.dir * 10 * cam.zoom, s.y, r, a0, a0 + 1.4);
          ctx.stroke();
        }
      } else if (p.kind === 'shield') {
        ctx.strokeStyle = rgba('#7fe8ff', k);
        ctx.lineWidth = 4 * cam.zoom;
        ctx.beginPath();
        const r = (28 + (1 - k) * 14) * cam.zoom;
        const a0 = p.dir > 0 ? -0.9 : Math.PI - 0.9;
        ctx.arc(s.x, s.y, r, a0, a0 + 1.8);
        ctx.stroke();
        ctx.fillStyle = rgba('#7fe8ff', 0.15 * k);
        ctx.fill();
      } else if (p.kind === 'dust') {
        ctx.fillStyle = rgba('#d8c8e8', 0.28 * k);
        ctx.beginPath();
        ctx.arc(s.x, s.y, p.r * cam.zoom, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.textAlign = 'center';
    for (const l of this.labels) {
      const s = cam.toScreen(l.x, l.y);
      ctx.font = `900 ${Math.round(26 * cam.zoom)}px "Arial Black", Impact, sans-serif`;
      ctx.lineWidth = 6;
      ctx.strokeStyle = rgba('#140a18', Math.min(1, l.life / 20));
      ctx.strokeText(l.text, s.x, s.y);
      ctx.fillStyle = rgba(l.color, Math.min(1, l.life / 20));
      ctx.fillText(l.text, s.x, s.y);
    }
    ctx.restore();
  }
}

/** Motion trails for fast strikes: a fading ribbon behind the striking limb. */
export class Trails {
  constructor() {
    this.hist = [[], []];
  }
  tick(fighters) {
    fighters.forEach((f, i) => {
      const h = this.hist[i];
      if (f.hitstop > 0) return;
      // follow the tip of the strike that is actually active this tick (works for any move type)
      if (f.hitboxes?.length && f.hitSpec) {
        const hb = f.hitboxes[f.hitboxes.length - 1];
        h.push({ x: hb.b.x, y: hb.b.y, life: 8, strength: f.hitSpec.strength });
      }
      for (const p of h) p.life--;
      while (h.length && h[0].life <= 0) h.shift();
      if (h.length > 8) h.shift();
    });
  }
  draw(ctx, cam, rim = ['#ff4fd8', '#3fe6d0']) {
    this.hist.forEach((h, i) => {
      if (h.length < 2) return;
      for (let k = 1; k < h.length; k++) {
        const a = cam.toScreen(h[k - 1].x, h[k - 1].y), b = cam.toScreen(h[k].x, h[k].y);
        const t = k / h.length;
        const w = (h[k].strength === 'light' ? 7 : 12) * t * cam.zoom;
        ctx.strokeStyle = rgba(rim[i], 0.45 * t * Math.min(1, h[k].life / 4));
        ctx.lineWidth = w;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.strokeStyle = rgba('#ffffff', 0.5 * t * Math.min(1, h[k].life / 4));
        ctx.lineWidth = w * 0.35;
        ctx.stroke();
      }
    });
  }
}
