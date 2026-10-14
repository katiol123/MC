// Procedural arena "Pier 9" — a neon harbour at dusk (or night). Several parallax planes:
// sky + sun, distant skyline, harbour cranes, water, container yard with neon signage and
// string lights, a wet plank dock with reflections, and foreground posts/steam.
import { VIEW } from '../config/constants.js';
import { Rng } from '../core/rng.js';
import { rgba, mix } from './color.js';

const PALETTES = {
  dusk: { skyTop: '#1b0f3a', skyMid: '#6b1f6e', skyLow: '#ff7a4a', sun: '#ffcf6a', sun2: '#ff4fa0', city: '#2a1540', city2: '#3a1d52', water: '#2a1648', win: '#ffd27a', neon1: '#ff3fd0', neon2: '#3fe6d0', dock: '#3a2630', dock2: '#2a1b24', fog: '#ff7aa8' },
  night: { skyTop: '#05061a', skyMid: '#14134a', skyLow: '#5a2a8a', sun: '#d8e6ff', sun2: '#7a6aff', city: '#0e0f2a', city2: '#17173a', water: '#0d0f2e', win: '#7fe8ff', neon1: '#ff3fd0', neon2: '#3fe6d0', dock: '#22202e', dock2: '#16151f', fog: '#6a5aff' },
};

export class Arena {
  constructor(variant = 'dusk') {
    this.pal = PALETTES[variant] || PALETTES.dusk;
    this.variant = variant;
    const r = new Rng(91);
    this.buildings = [];
    let x = -600;
    while (x < 3200) {
      const w = r.range(40, 120), h = r.range(90, 280);
      const wins = [];
      for (let wy = 14; wy < h - 10; wy += 16) for (let wx = 8; wx < w - 8; wx += 13) if (r.chance(0.33)) wins.push([wx, wy, r.next()]);
      this.buildings.push({ x, w, h, wins, layer: r.chance(0.5) ? 0 : 1, antenna: r.chance(0.3) });
      x += w + r.range(-10, 18);
    }
    this.cranes = [{ x: 380, h: 210, arm: 200 }, { x: 1250, h: 240, arm: 240 }, { x: 2100, h: 200, arm: 180 }];
    this.containers = [];
    const cols = ['#1f8a86', '#b0306e', '#c49030', '#4a3a7a', '#2a6a9a', '#8a2a3a'];
    for (let cx = -200; cx < 2600; cx += r.range(130, 190)) {
      const stack = r.int(1, 3);
      for (let s = 0; s < stack; s++) this.containers.push({ x: cx + r.range(-10, 10), s, w: r.chance(0.5) ? 120 : 160, c: r.pick(cols) });
    }
    this.lights = [];
    for (let i = 0; i < 60; i++) this.lights.push({ k: i / 60, ph: r.next() * 6 });
    this.motes = [];
    for (let i = 0; i < 40; i++) this.motes.push({ x: r.range(0, VIEW.width), y: r.range(0, VIEW.height), s: r.range(0.3, 1), ph: r.next() * 6 });
    this.t = 0;
  }

  tick() {
    this.t++;
  }

  /** Draws everything behind the fighters. */
  drawBack(ctx, cam) {
    const W = VIEW.width, H = VIEW.height, p = this.pal, t = this.t;
    const gy = VIEW.groundY - (0 - cam.y) * cam.zoom; // screen y of the floor
    const horizon = gy - 150 * cam.zoom;
    // sky
    const g = ctx.createLinearGradient(0, 0, 0, horizon);
    g.addColorStop(0, p.skyTop);
    g.addColorStop(0.6, p.skyMid);
    g.addColorStop(1, p.skyLow);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, horizon + 2);
    // sun with synthwave slices
    const sunX = W * 0.62 - (cam.x - 1000) * 0.04, sunY = horizon - 70;
    const sg = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 220);
    sg.addColorStop(0, rgba(p.sun, 0.5));
    sg.addColorStop(1, rgba(p.sun2, 0));
    ctx.fillStyle = sg;
    ctx.fillRect(sunX - 240, sunY - 240, 480, 480);
    ctx.save();
    ctx.beginPath();
    ctx.arc(sunX, sunY, 95, 0, Math.PI * 2);
    ctx.clip();
    const sg2 = ctx.createLinearGradient(0, sunY - 95, 0, sunY + 95);
    sg2.addColorStop(0, p.sun);
    sg2.addColorStop(1, p.sun2);
    ctx.fillStyle = sg2;
    ctx.fillRect(sunX - 100, sunY - 100, 200, 200);
    ctx.fillStyle = p.skyLow;
    for (let i = 0; i < 7; i++) {
      const yy = sunY + 10 + i * 13 + ((t * 0.2) % 13);
      ctx.fillRect(sunX - 100, yy, 200, 2 + i * 0.8);
    }
    ctx.restore();
    // skyline (two parallax layers)
    for (const layer of [0, 1]) {
      const par = layer === 0 ? 0.12 : 0.22;
      const base = horizon + 4;
      ctx.fillStyle = layer === 0 ? p.city : p.city2;
      for (const b of this.buildings) {
        if (b.layer !== layer) continue;
        const sx = (b.x - cam.x * par) * (0.7 + layer * 0.15) + W * 0.1;
        if (sx > W + 50 || sx + b.w < -50) continue;
        const hh = b.h * (0.6 + layer * 0.25);
        ctx.fillRect(sx, base - hh, b.w * 0.85, hh);
        if (b.antenna) ctx.fillRect(sx + b.w * 0.4, base - hh - 26, 2, 26);
        for (const [wx, wy, ph] of b.wins) {
          const on = Math.sin(t * 0.01 + ph * 40) > -0.85;
          if (!on || wy > hh - 6) continue;
          ctx.fillStyle = rgba(ph < 0.2 ? p.neon1 : ph < 0.35 ? p.neon2 : p.win, layer === 0 ? 0.45 : 0.7);
          ctx.fillRect(sx + wx * 0.85, base - hh + wy, 4, 5);
        }
        ctx.fillStyle = layer === 0 ? p.city : p.city2;
      }
    }
    // cranes
    ctx.strokeStyle = mix(p.city2, '#000000', 0.2);
    ctx.lineWidth = 3;
    for (const c of this.cranes) {
      const sx = (c.x - cam.x * 0.32) * 0.95 + W * 0.15;
      const base = horizon + 10;
      ctx.beginPath();
      ctx.moveTo(sx, base); ctx.lineTo(sx, base - c.h);
      ctx.moveTo(sx + 18, base); ctx.lineTo(sx + 18, base - c.h);
      for (let y = base; y > base - c.h; y -= 22) { ctx.moveTo(sx, y); ctx.lineTo(sx + 18, y - 22); }
      ctx.moveTo(sx - c.arm * 0.35, base - c.h); ctx.lineTo(sx + c.arm, base - c.h);
      ctx.moveTo(sx + 9, base - c.h - 30); ctx.lineTo(sx + c.arm, base - c.h);
      ctx.moveTo(sx + 9, base - c.h - 30); ctx.lineTo(sx - c.arm * 0.35, base - c.h);
      ctx.moveTo(sx + c.arm * 0.7, base - c.h); ctx.lineTo(sx + c.arm * 0.7, base - c.h + 60 + Math.sin(t * 0.02 + c.x) * 6);
      ctx.stroke();
      ctx.fillStyle = Math.floor(t / 40 + c.x) % 2 ? '#ff3030' : '#601010';
      ctx.fillRect(sx + c.arm - 3, base - c.h - 4, 6, 6);
    }
    // water
    const wg = ctx.createLinearGradient(0, horizon, 0, gy - 60 * cam.zoom);
    wg.addColorStop(0, mix(p.water, p.skyLow, 0.35));
    wg.addColorStop(1, p.water);
    ctx.fillStyle = wg;
    ctx.fillRect(0, horizon, W, gy - horizon);
    ctx.fillStyle = rgba(p.sun, 0.35);
    for (let i = 0; i < 22; i++) {
      const yy = horizon + 4 + i * 4.5;
      const w = 120 - i * 3 + Math.sin(t * 0.05 + i) * 18;
      ctx.fillRect(sunX - w / 2 + Math.sin(t * 0.03 + i * 1.7) * 10, yy, w, 1.6);
    }
    // container yard
    const yardBase = gy - 95 * cam.zoom;
    for (const c of this.containers) {
      const xx = (c.x - cam.x) * 0.6 * cam.zoom + W / 2;
      const cw = c.w * 0.6 * cam.zoom, ch = 52 * 0.6 * cam.zoom;
      if (xx > W + 10 || xx + cw < -10) continue;
      const yy = yardBase - (c.s + 1) * ch;
      ctx.fillStyle = mix(c.c, p.city, 0.45);
      ctx.fillRect(xx, yy, cw, ch - 1);
      ctx.fillStyle = rgba('#000000', 0.25);
      for (let k = 4; k < cw - 2; k += 6) ctx.fillRect(xx + k, yy + 2, 2, ch - 5);
      ctx.fillStyle = rgba(p.neon1, 0.12);
      ctx.fillRect(xx, yy, cw, 2);
    }
    // neon sign
    const signX = (900 - cam.x) * 0.6 * cam.zoom + W / 2, signY = yardBase - 120 * cam.zoom;
    const flick = Math.sin(t * 0.7) > -0.92 && !(t % 233 < 6);
    ctx.save();
    ctx.font = `900 ${Math.round(46 * cam.zoom)}px "Arial Black", Impact, sans-serif`;
    ctx.textAlign = 'center';
    ctx.shadowBlur = flick ? 24 : 0;
    ctx.shadowColor = p.neon1;
    ctx.fillStyle = flick ? '#ffd6f4' : rgba(p.neon1, 0.3);
    ctx.fillText('PIER 9', signX, signY);
    ctx.shadowColor = p.neon2;
    ctx.font = `700 ${Math.round(18 * cam.zoom)}px "Arial Black", Impact, sans-serif`;
    ctx.fillStyle = '#d6fffb';
    ctx.fillText('FIGHT  NIGHT', signX, signY + 26 * cam.zoom);
    ctx.restore();
    // string lights
    const lx0 = (200 - cam.x) * 0.8 * cam.zoom + W / 2, lx1 = (1800 - cam.x) * 0.8 * cam.zoom + W / 2;
    const ly = gy - 300 * cam.zoom;
    ctx.strokeStyle = rgba('#1a0f1e', 0.9);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) {
      const k = i / 60;
      const x = lx0 + (lx1 - lx0) * k, y = ly + Math.sin(k * Math.PI * 3) ** 2 * 50 * cam.zoom;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    for (const l of this.lights) {
      const x = lx0 + (lx1 - lx0) * l.k, y = ly + Math.sin(l.k * Math.PI * 3) ** 2 * 50 * cam.zoom + 4;
      const on = 0.6 + 0.4 * Math.sin(t * 0.08 + l.ph);
      const c = l.ph < 2 ? p.neon1 : l.ph < 4 ? p.neon2 : p.win;
      ctx.fillStyle = rgba(c, 0.25 * on);
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgba(c, on);
      ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill();
    }
    // dock floor
    const back = gy - 70 * cam.zoom;
    const fg = ctx.createLinearGradient(0, back, 0, H);
    fg.addColorStop(0, p.dock2);
    fg.addColorStop(0.35, p.dock);
    fg.addColorStop(1, mix(p.dock2, '#000000', 0.4));
    ctx.fillStyle = fg;
    ctx.fillRect(0, back, W, H - back);
    // plank seams (perspective)
    const vpX = W / 2, vpY = back - 500;
    ctx.strokeStyle = rgba('#000000', 0.35);
    ctx.lineWidth = 1.2;
    for (let wx = -3000; wx <= 5000; wx += 70) {
      const sx = (wx - cam.x) * cam.zoom + W / 2;
      const t1 = (back - vpY) / (H - vpY);
      const topX = vpX + (sx - vpX) * t1;
      if (sx < -2000 || sx > W + 2000) continue;
      ctx.beginPath();
      ctx.moveTo(topX, back);
      ctx.lineTo(sx, H);
      ctx.stroke();
    }
    for (const yy of [back + 8, back + 22, back + 44, back + 78, back + 128]) {
      ctx.fillStyle = rgba('#000000', 0.25);
      ctx.fillRect(0, yy, W, 1.5);
    }
    // neon reflections on wet planks
    const rg = ctx.createLinearGradient(0, back, 0, H);
    rg.addColorStop(0, rgba(p.neon1, 0.0));
    rg.addColorStop(0.15, rgba(p.neon1, 0.08));
    rg.addColorStop(1, rgba(p.neon2, 0.03));
    ctx.fillStyle = rg;
    ctx.fillRect(signX - 140 * cam.zoom, back, 280 * cam.zoom, H - back);
    ctx.fillStyle = rgba(p.sun, 0.06);
    ctx.fillRect(sunX - 60, back, 120, H - back);
    // edge railing behind fighters
    ctx.fillStyle = mix(p.dock2, '#000000', 0.3);
    ctx.fillRect(0, back - 6, W, 6);
    for (let wx = -2000; wx < 4000; wx += 220) {
      const sx = (wx - cam.x) * cam.zoom * 0.95 + W / 2;
      if (sx < -30 || sx > W + 30) continue;
      ctx.fillRect(sx - 6, back - 40 * cam.zoom, 12 * cam.zoom, 40 * cam.zoom);
      ctx.fillStyle = rgba(p.neon2, 0.5);
      ctx.fillRect(sx - 5, back - 40 * cam.zoom, 10 * cam.zoom, 2);
      ctx.fillStyle = mix(p.dock2, '#000000', 0.3);
    }
  }

  /** Atmosphere in front of the fighters: foreground posts, drifting motes, fog, vignette. */
  drawFront(ctx, cam) {
    const W = VIEW.width, H = VIEW.height, p = this.pal, t = this.t;
    for (let wx = -2400; wx < 4400; wx += 900) {
      const sx = (wx - cam.x) * cam.zoom * 1.35 + W / 2;
      if (sx < -80 || sx > W + 80) continue;
      ctx.fillStyle = '#0b070d';
      ctx.fillRect(sx - 18, H - 120, 36, 120);
      ctx.beginPath();
      ctx.ellipse(sx, H - 120, 22, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0b070d';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(sx + 18, H - 100);
      ctx.quadraticCurveTo(sx + 450 * cam.zoom, H - 40 + Math.sin(t * 0.02) * 4, sx + 900 * cam.zoom * 1.35 - 18, H - 100);
      ctx.stroke();
    }
    for (const m of this.motes) {
      const x = (m.x - cam.x * 0.4 * m.s + t * 0.3 * m.s) % W;
      const y = (m.y - t * 0.25 * m.s + Math.sin(t * 0.02 + m.ph) * 10 + H) % H;
      ctx.fillStyle = rgba(m.ph < 3 ? p.neon1 : p.win, 0.35 * m.s);
      ctx.beginPath();
      ctx.arc(x < 0 ? x + W : x, y, 1.6 * m.s + 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    const fogY = VIEW.groundY - 40;
    const fg = ctx.createLinearGradient(0, fogY - 80, 0, fogY + 80);
    fg.addColorStop(0, rgba(p.fog, 0));
    fg.addColorStop(0.5, rgba(p.fog, 0.06));
    fg.addColorStop(1, rgba(p.fog, 0));
    ctx.fillStyle = fg;
    ctx.fillRect(0, fogY - 80, W, 160);
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(8,2,14,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }
}
