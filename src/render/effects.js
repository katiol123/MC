// Procedural combat effects: hit sparks, impact rings, block shields, dust, attack trails,
// floating labels and camera shake. All in world space; driven by simulation events.
import { rgba } from './color.js';
import { drawGlow } from './fire.js';
import { spawnProp, stepProp, drawProp } from './props.js';

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
    if (fighters) this.fighters = fighters;
    switch (e.type) {
      case 'hit': {
        const heavy = e.strength !== 'light';
        const n = heavy ? 18 : 10;
        const color = e.fire ? '#ffb040' : e.counter ? '#ffd23f' : '#ffffff';
        if (e.fire) this.fireBurst(e.x, e.y, heavy ? 16 : 10, e.dir);
        if (e.heal > 0) {
          // life flows from the target back to the attacker
          const a = fighters?.[e.who];
          if (a) {
            for (let i = 0; i < 8; i++) this.parts.push({ kind: 'mote', x: e.x + (this.rnd() - 0.5) * 30, y: e.y + (this.rnd() - 0.5) * 30, tx: a.body.x, ty: a.body.y + 130, life: 26 + i * 2, max: 26 + i * 2, w: this.rnd() });
            this.labels.push({ text: `+${e.heal}`, x: a.body.x, y: a.body.y + 250, life: 40, color: '#5ff0b8' });
          }
        }
        if (e.pull) {
          // Talon Pull: a taut line from the hooking hand to the victim while they are reeled in
          this.parts.push({ kind: 'tether', who: e.who, target: e.target, x: e.x, y: e.y, life: 36, max: 36 });
          this.labels.push({ text: 'HOOKED!', x: e.x, y: e.y + 70, life: 45, color: '#3fe6d0' });
        }
        if (e.claw) this.parts.push({ kind: 'claw', x: e.x, y: e.y, dir: e.dir, life: 16, max: 16, flip: this.rnd() < 0.5 });
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
        if (e.fire) this.fireBurst(e.x, e.y, 6, 0);
        if (e.guardBreak) {
          // the guard shatters into shards
          for (let i = 0; i < 16; i++) {
            const a = this.rnd() * Math.PI * 2, sp = 4 + this.rnd() * 6;
            this.parts.push({ kind: 'spark', x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 2, life: 22, max: 22, color: '#7fe8ff', w: 3 });
          }
          this.labels.push({ text: 'GUARD BREAK!', x: e.x, y: e.y + 70, life: 55, color: '#ffd23f' });
          this.shake = Math.max(this.shake, 7);
        }
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
          this.parts.push({ kind: 'spark', x: e.x, y: e.y, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, life: 10, max: 10, color: e.kind === 'coin' ? '#ffd23f' : e.kind === 'flame' ? '#ff9a30' : '#3fe6d0', w: 2 });
        }
        break;
      case 'fx': {
        // generic one-shot effects requested by fatality scenes
        const n = e.n ?? 10;
        if (e.kind === 'dust') {
          for (let i = 0; i < n; i++) {
            const sgn = this.rnd() < 0.5 ? -1 : 1;
            this.parts.push({ kind: 'dust', x: e.x + sgn * this.rnd() * (e.spread ?? 30), y: (e.y ?? 4) + this.rnd() * 20, vx: sgn * (1 + this.rnd() * 4), vy: this.rnd() * 2.5, r: 8 + this.rnd() * 14, life: 40, max: 40 });
          }
        } else if (e.kind === 'sparks' || e.kind === 'shards') {
          for (let i = 0; i < n; i++) {
            const a = this.rnd() * Math.PI * 2, sp = 3 + this.rnd() * (e.speed ?? 7);
            this.parts.push({ kind: 'spark', x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + (e.kind === 'shards' ? 3 : 0), life: 18 + this.rnd() * 10, max: 28, color: e.color || '#ffffff', w: e.kind === 'shards' ? 4 : 2.5 });
          }
        } else if (e.kind === 'embers') {
          for (let i = 0; i < n; i++) this.ember(e.x + (this.rnd() - 0.5) * (e.spread ?? 40), e.y + this.rnd() * (e.h ?? 20), (this.rnd() - 0.5));
        } else if (e.kind === 'smoke') {
          for (let i = 0; i < n; i++) this.parts.push({ kind: 'smoke', x: e.x + (this.rnd() - 0.5) * (e.spread ?? 30), y: e.y + this.rnd() * 10, vx: (this.rnd() - 0.5) * 0.8, vy: 1 + this.rnd() * 1.5, r: 8 + this.rnd() * 8, life: 50, max: 50 });
        } else if (e.kind === 'ring') {
          this.parts.push({ kind: 'ring', x: e.x, y: e.y, r: e.r ?? 10, vr: e.vr ?? 9, life: e.life ?? 18, max: e.life ?? 18, color: e.color || '#ffffff' });
        } else if (e.kind === 'burst') {
          this.parts.push({ kind: 'burst', x: e.x, y: e.y, r: e.r ?? 40, life: 8, max: 8, color: '#ffffff', dir: 1 });
        } else if (e.kind === 'flash') {
          this.flash = Math.max(this.flash, e.amount ?? 0.4);
        } else if (e.kind === 'shake') {
          this.shake = Math.max(this.shake, e.amount ?? 8);
        } else if (e.kind === 'label') {
          this.labels.push({ text: e.text, x: e.x, y: e.y, life: e.life ?? 60, color: e.color || '#ffffff' });
        } else if (e.kind === 'prop') {
          this.parts.push(spawnProp(e.prop, e.x, e.y, e.dir ?? 1, { vx: e.vx, vy: e.vy, spin: e.spin }, e.look || {}));
        } else if (e.kind === 'drops') {
          for (let i = 0; i < n; i++) {
            const a = Math.PI / 2 + (this.rnd() - 0.5) * (e.cone ?? 1.4), sp = 4 + this.rnd() * (e.speed ?? 8);
            this.parts.push({ kind: 'sweat', x: e.x + (this.rnd() - 0.5) * 20, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 40, max: 40, color: e.color });
          }
        }
        break;
      }
      case 'critical': {
        // battered: the fighter's signature item flies off with a pop
        const f = fighters?.[e.who];
        const dmg = f?.def.damaged;
        if (!f) break;
        this.parts.push({ kind: 'ring', x: e.x, y: e.y, r: 8, vr: 7, life: 14, max: 14, color: '#ffffff' });
        this.parts.push({ kind: 'burst', x: e.x, y: e.y, r: 26, life: 6, max: 6, color: '#ffffff', dir: e.facing });
        this.shake = Math.max(this.shake, 5);
        for (const pr of dmg?.props || []) {
          const from = pr.from === 'chest' ? { x: e.x - e.facing * 14, y: e.y - 70 } : pr.from === 'mouth' ? { x: e.x + e.facing * 16, y: e.y - 10 } : { x: e.x, y: e.y + 18 };
          this.parts.push(spawnProp(pr.type, from.x, from.y, e.facing, pr, f.def.look));
        }
        break;
      }
      case 'roundIntro':
        this.parts = this.parts.filter((p) => p.kind !== 'prop');
        break;
      case 'armor':
        // the charge shrugs the hit off: amber flash ring + label
        this.parts.push({ kind: 'ring', x: e.x, y: e.y, r: 10, vr: 8, life: 14, max: 14, color: '#ffb347' });
        this.parts.push({ kind: 'shield', x: e.x, y: e.y, life: 12, max: 12, dir: 1 });
        this.labels.push({ text: 'ARMOR', x: e.x, y: e.y + 60, life: 45, color: '#ffb347' });
        this.shake = Math.max(this.shake, 4);
        break;
      case 'burn':
        // burn tick: a puff of embers off the burning body
        for (let i = 0; i < 4; i++) this.ember(e.x + (this.rnd() - 0.5) * 50, e.y + (this.rnd() - 0.5) * 80, 0);
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

  /** Embers: glowing specks that float up and flicker out. */
  ember(x, y, dir) {
    this.parts.push({ kind: 'ember', x, y, vx: dir * 2 + (this.rnd() - 0.5) * 3, vy: 1.5 + this.rnd() * 3, life: 26 + this.rnd() * 20, max: 46, r: 2 + this.rnd() * 2.5 });
  }

  fireBurst(x, y, n, dir) {
    for (let i = 0; i < n; i++) this.ember(x, y, dir);
    this.parts.push({ kind: 'fireball', x, y, r: 16, life: 12, max: 12 });
  }

  tick(fighters) {
    // battered fighters sweat; an overheated Cinder smokes
    for (const f of fighters || []) {
      if (f.focus > 0 && this.rnd() < 0.3) {
        // Focus: golden motes rising around the body
        this.parts.push({ kind: 'ember', x: f.body.x + (this.rnd() - 0.5) * 90, y: f.body.y + this.rnd() * 160, vx: 0, vy: 1.2 + this.rnd(), life: 30, max: 46, r: 1.6 + this.rnd() * 1.5 });
      }
      if (!f.critical || f.state === 'ko') continue;
      this.clock = (this.clock || 0) + 1;
      const head = f.skel.j.head, hx = f.body.x + f.facing * head.x, hy = f.body.y + head.y;
      if (this.rnd() < 0.035) this.parts.push({ kind: 'sweat', x: hx + (this.rnd() - 0.3) * 20 * f.facing, y: hy + 6, vx: -f.facing * (0.5 + this.rnd()), vy: 1.5, life: 34, max: 34 });
      if (f.def.damaged?.look?.smoke && this.rnd() < 0.25) this.parts.push({ kind: 'smoke', x: hx + (this.rnd() - 0.5) * 22, y: hy + 16, vx: (this.rnd() - 0.5) * 0.6, vy: 1.2 + this.rnd(), r: 5 + this.rnd() * 4, life: 40, max: 40 });
    }
    for (const p of this.parts) {
      p.life--;
      if (p.kind === 'spark') { p.x += p.vx; p.y += p.vy; p.vx *= 0.86; p.vy = p.vy * 0.86 - 0.3; }
      else if (p.kind === 'ring') p.r += p.vr *= 0.82;
      else if (p.kind === 'dust') { p.x += p.vx; p.y += p.vy; p.vx *= 0.92; p.r += 0.4; }
      else if (p.kind === 'ember') { p.x += p.vx + Math.sin(p.life * 0.4) * 0.6; p.y += p.vy; p.vx *= 0.95; p.vy = p.vy * 0.97 + 0.08; }
      else if (p.kind === 'fireball') p.r += 3.5;
      else if (p.kind === 'prop') stepProp(p);
      else if (p.kind === 'sweat') { p.x += p.vx; p.y += p.vy; p.vy -= 0.35; }
      else if (p.kind === 'smoke') { p.x += p.vx + Math.sin(p.life * 0.2) * 0.4; p.y += p.vy; p.r += 0.35; }
      else if (p.kind === 'mote') { const k = 0.12 + (1 - p.life / p.max) * 0.2; p.x += (p.tx - p.x) * k + Math.sin(p.life * 0.5 + p.w * 6) * 3; p.y += (p.ty - p.y) * k; }
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
      } else if (p.kind === 'tether' && this.fighters) {
        const a = this.fighters[p.who], d = this.fighters[p.target];
        const hand = a.skel.j[a.stance === 1 ? 'handB' : 'handF'];
        const h = cam.toScreen(a.body.x + a.facing * hand.x, a.body.y + hand.y);
        const t = cam.toScreen(d.body.x, d.body.y + 135 * d.props.posScale);
        const sag = 14 * cam.zoom * (1 - k);
        const mx = (h.x + t.x) / 2, my = (h.y + t.y) / 2 + sag;
        for (const [w, c, al] of [[7, '#0c0610', 0.8], [3.5, '#3fe6d0', 1], [1.2, '#e8fffb', 1]]) {
          ctx.strokeStyle = rgba(c, al * Math.min(1, k * 2));
          ctx.lineWidth = w * cam.zoom;
          ctx.beginPath();
          ctx.moveTo(h.x, h.y);
          ctx.quadraticCurveTo(mx, my, t.x, t.y);
          ctx.stroke();
        }
        // the talon hooked into the victim
        const ang = Math.atan2(t.y - my, t.x - mx);
        ctx.fillStyle = rgba('#3fe6d0', Math.min(1, k * 2));
        ctx.beginPath();
        for (const s2 of [-1, 1]) {
          ctx.moveTo(t.x, t.y);
          ctx.lineTo(t.x - Math.cos(ang + s2 * 0.6) * 16 * cam.zoom, t.y - Math.sin(ang + s2 * 0.6) * 16 * cam.zoom);
          ctx.lineTo(t.x - Math.cos(ang) * 8 * cam.zoom, t.y - Math.sin(ang) * 8 * cam.zoom);
        }
        ctx.fill();
        // speed streaks behind the victim
        ctx.strokeStyle = rgba('#ffffff', 0.5 * k);
        ctx.lineWidth = 2;
        const dir = Math.sign(t.x - h.x) || 1;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(t.x + dir * 30 * cam.zoom, t.y + i * 22 * cam.zoom);
          ctx.lineTo(t.x + dir * (60 + 20 * (1 - k)) * cam.zoom, t.y + i * 22 * cam.zoom);
          ctx.stroke();
        }
      } else if (p.kind === 'prop') {
        drawProp(ctx, p, s, cam.zoom);
      } else if (p.kind === 'sweat') {
        ctx.fillStyle = rgba(p.color || '#bfefff', 0.85 * Math.min(1, k * 2));
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, 2.6 * cam.zoom, 4 * cam.zoom, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'smoke') {
        ctx.fillStyle = rgba('#6a6470', 0.5 * k);
        ctx.beginPath();
        ctx.arc(s.x, s.y, p.r * cam.zoom, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'mote') {
        const prev = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, s.x, s.y, 9 * cam.zoom, 0.8 * Math.min(1, k * 2), '95,240,184');
        ctx.globalCompositeOperation = prev;
      } else if (p.kind === 'claw') {
        // three parallel claw slashes that draw in, then fade
        const draw = Math.min(1, (p.max - p.life) / 4);
        const L = 46 * cam.zoom, ang = (p.flip ? -1 : 1) * 0.9;
        ctx.lineCap = 'round';
        for (let i = -1; i <= 1; i++) {
          const ox = Math.cos(ang + Math.PI / 2) * i * 11 * cam.zoom, oy = Math.sin(ang + Math.PI / 2) * i * 11 * cam.zoom;
          const x0 = s.x + ox - Math.cos(ang) * L / 2, y0 = s.y + oy - Math.sin(ang) * L / 2;
          ctx.strokeStyle = rgba('#ffffff', Math.min(1, k * 1.4));
          ctx.lineWidth = 5 * cam.zoom * k + 1;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x0 + Math.cos(ang) * L * draw, y0 + Math.sin(ang) * L * draw);
          ctx.stroke();
          ctx.strokeStyle = rgba('#ff4fd8', 0.7 * k);
          ctx.lineWidth = 2 * cam.zoom;
          ctx.stroke();
        }
      } else if (p.kind === 'ember') {
        const hot = k > 0.6 ? '#ffe08a' : k > 0.3 ? '#ff9a30' : '#d8401c';
        ctx.fillStyle = rgba(hot, Math.min(1, k * 1.6) * (0.75 + 0.25 * Math.sin(p.life * 1.7)));
        ctx.beginPath();
        ctx.arc(s.x, s.y, p.r * cam.zoom * (0.5 + k * 0.5), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'fireball') {
        const prev = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, s.x, s.y, p.r * cam.zoom * 1.6, 0.7 * k);
        ctx.globalCompositeOperation = prev;
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
        h.push({ x: hb.b.x, y: hb.b.y, life: 8, strength: f.hitSpec.strength, fire: !!f.hitSpec.fire });
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
        ctx.strokeStyle = rgba(h[k].fire ? '#ff7a1a' : rim[i], (h[k].fire ? 0.7 : 0.45) * t * Math.min(1, h[k].life / 4));
        ctx.lineWidth = w;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.strokeStyle = rgba(h[k].fire ? '#ffe08a' : '#ffffff', 0.5 * t * Math.min(1, h[k].life / 4));
        ctx.lineWidth = w * 0.35;
        ctx.stroke();
      }
    });
  }
}
