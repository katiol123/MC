// Cinematic direction layered over every fatality: letterbox bars, an opening credit, subtitles,
// slow motion, hit-stop freezes, impact frames, speed lines, camera punches, colour grades,
// spotlights and god rays. Each scene gets a short list of beats keyed to its own script ticks, so
// the scripts in fatalities.js stay untouched and the beats can be tuned on their own.
//   point beats (fire once when the script reaches `at`):
//     slow: n, rate      the next n script ticks each last `rate` frames (2 = half speed)
//     freeze: n          hold the picture n frames (hit-stop)
//     impact: n, color   n frames of a high-contrast impact frame (black silhouettes on colour)
//     lines: n, focus    n frames of radial speed lines around 'A' | 'V' | 'mid'
//     punch: k           camera zoom kick (decays)
//     caption: text      subtitle in the bottom letterbox bar (typewriter)
//   range beats (active while from <= t < to):
//     grade: color, a    colour grade over the whole frame (multiply)
//     spot: 'A' | 'V'    spotlight on a fighter, the rest of the frame darkens
//     rays: color        god rays falling from above the scene
// Everything here is presentation: frames added by slow motion and freezes are pure holds, the
// script itself still runs tick by tick and stays deterministic.

export const CINEMA = {
  bruno: [
    { at: 4, caption: "Tonight's special..." },
    { at: 26, impact: 2, color: '#ffe08a', freeze: 4, punch: 0.12 },
    { at: 92, slow: 22, rate: 2, lines: 40, focus: 'V' },
    { at: 136, freeze: 4, punch: 0.1 },
    { from: 150, to: 240, grade: '#ffb27a', a: 0.35 },
    { from: 196, to: 244, spot: 'A' },
    { at: 200, caption: '...served piping hot.' },
  ],
  cinder: [
    { at: 4, caption: 'Some like it hot.' },
    { at: 52, impact: 3, color: '#ff7a1a', freeze: 4, punch: 0.15, lines: 30, focus: 'V' },
    { from: 52, to: 130, grade: '#ff6a3a', a: 0.4 },
    { from: 140, to: 180, spot: 'V' },
    { at: 180, slow: 32, rate: 2 },
    { at: 190, caption: 'Well done. Very well done.' },
  ],
  hawk: [
    { at: 4, caption: 'Patience is the whole of fishing.' },
    { at: 22, freeze: 4, punch: 0.1, lines: 16, focus: 'A' },
    { at: 110, lines: 60, focus: 'A' },
    { from: 56, to: 170, grade: '#8fc6ff', a: 0.25 },
    { at: 170, slow: 20, rate: 2, punch: 0.12 },
    { at: 216, caption: '...and that is the one that got away.' },
  ],
  grizz: [
    { at: 4, caption: 'Everybody needs a hug.' },
    { at: 52, punch: 0.1 },
    { from: 52, to: 112, grade: '#ff9ad0', a: 0.3 },
    { from: 60, to: 112, spot: 'V' },
    { at: 104, freeze: 4 },
    { from: 176, to: 290, grade: '#5f78ff', a: 0.45 },
    { at: 196, caption: 'Shhh... hibernation season.' },
  ],
  tao: [
    { at: 4, caption: 'Ten thousand repetitions...' },
    { from: 76, to: 124, spot: 'A' },
    { at: 100, slow: 22, rate: 3 },
    { at: 122, impact: 3, color: '#ffffff', freeze: 8, punch: 0.2, lines: 36, focus: 'V' },
    { at: 128, caption: '...for one inch.' },
    { at: 150, punch: 0.1 },
  ],
  rattigan: [
    { at: 4, caption: 'Nothing up my sleeve...' },
    { at: 21, punch: 0.05 }, { at: 45, punch: 0.05 }, { at: 61, punch: 0.05 }, { at: 81, punch: 0.05 },
    { from: 96, to: 134, spot: 'A' },
    { at: 116, freeze: 4, punch: 0.08 },
    { from: 150, to: 280, grade: '#d9b27a', a: 0.45 },
    { at: 160, caption: 'Crime pays. In cash.' },
  ],
  jaguar: [
    { at: 4, caption: 'The sun demands a sacrifice.' },
    { from: 14, to: 80, rays: '#ffd23f' },
    { from: 14, to: 80, grade: '#ffcf6a', a: 0.3 },
    { at: 70, impact: 2, color: '#ffd23f', freeze: 4, punch: 0.1 },
    { at: 122, punch: 0.1 },
    { at: 150, impact: 3, color: '#ff8a3a', freeze: 6, lines: 40, focus: 'A', punch: 0.15 },
    { at: 226, punch: 0.12 },
    { at: 270, caption: 'The sun is pleased.' },
  ],
  brick: [
    { at: 4, caption: 'Round and round he goes...' },
    { at: 24, punch: 0.08 },
    { at: 86, lines: 64, focus: 'A' },
    { at: 150, slow: 20, rate: 2 },
    { at: 196, impact: 3, color: '#ffffff', freeze: 6, punch: 0.15 },
    { at: 202, caption: '...and where he stops - BONG.' },
  ],
  smiles: [
    { at: 4, caption: 'Keep your head up, friend.' },
    { at: 186, slow: 26, rate: 2, lines: 30, focus: 'A' },
    { at: 214, impact: 3, color: '#ffd23f', freeze: 6, punch: 0.15 },
    { from: 222, to: 290, spot: 'A' },
    { at: 230, caption: 'Laughter is the best medicine.' },
  ],
  jax: [
    { at: 4, caption: 'One more song for the crowd!' },
    { from: 20, to: 56, spot: 'V' },
    { at: 44, slow: 12, rate: 2 },
    { at: 56, impact: 3, color: '#ff4fd8', freeze: 6, punch: 0.18, lines: 24, focus: 'V' },
    { from: 72, to: 220, grade: '#ff4fd8', a: 0.25 },
    { at: 236, freeze: 6, punch: 0.1 },
    { at: 240, caption: 'Mic drop.' },
  ],
  vellaro: [
    { at: 4, caption: 'Nothing personal. Just business.' },
    { from: 0, to: 290, grade: '#cdb89a', a: 0.4 },
    { from: 14, to: 46, spot: 'A' },
    { at: 98, freeze: 6, punch: 0.08 },
    { at: 150, impact: 2, color: '#e8e0d0', freeze: 4, punch: 0.12 },
    { at: 182, punch: 0.1 },
    { at: 200, caption: 'He sleeps with the fishes now.' },
  ],
  roxy: [
    { at: 4, caption: "Let's give 'em a show!" },
    { from: 30, to: 214, grade: '#ff6fe0', a: 0.22 },
    { at: 51, impact: 2, color: '#ffd23f', freeze: 4, punch: 0.1 },
    { at: 104, slow: 16, rate: 2 },
    { at: 134, impact: 3, color: '#ff3fd0', freeze: 8, punch: 0.2, lines: 36, focus: 'mid' },
    { at: 218, caption: 'Thank you, goodnight!' },
  ],
  goro: [
    { at: 4, caption: 'The mountain does not move...' },
    { at: 30, punch: 0.1 }, { at: 62, punch: 0.1 },
    { at: 100, slow: 20, rate: 2, lines: 30, focus: 'V' },
    { at: 124, impact: 3, color: '#ffd23f', freeze: 8, punch: 0.2 },
    { at: 134, caption: '...the mountain falls on you.' },
  ],
  sobby: [
    { at: 4, caption: 'Every clown has a sad story...' },
    { at: 64, freeze: 3, punch: 0.08 }, { at: 100, freeze: 3, punch: 0.1 }, { at: 136, freeze: 4, punch: 0.12 },
    { at: 168, freeze: 6 },
    { from: 230, to: 290, spot: 'A' },
    { from: 230, to: 290, grade: '#7fa8ff', a: 0.4 },
    { at: 240, caption: 'This one ends with a mallet.' },
  ],
  snapper: [
    { at: 4, caption: 'Snack time in the swamp.' },
    { from: 0, to: 300, grade: '#a8d98a', a: 0.22 },
    { from: 100, to: 176, spot: 'A' },
    { at: 150, slow: 24, rate: 2 },
    { at: 176, impact: 3, color: '#3fe6d0', freeze: 6, punch: 0.15 },
    { at: 254, caption: 'Pardon me.' },
  ],
  chuy: [
    { at: 4, caption: '¡Fiesta time!' },
    { from: 0, to: 300, grade: '#ffc27a', a: 0.22 },
    { at: 100, punch: 0.06 }, { at: 134, punch: 0.06 },
    { at: 156, slow: 16, rate: 2 },
    { at: 172, impact: 3, color: '#ffd23f', freeze: 8, punch: 0.2, lines: 40, focus: 'V' },
    { at: 186, caption: '¡Dulces para todos!' },
  ],
};

/** Frames a scene's direction adds on top of its script duration (slow motion, freezes). */
export function extraFrames(id) {
  let n = 0;
  for (const b of CINEMA[id] || []) {
    if (b.slow) n += b.slow * ((b.rate || 2) - 1);
    n += (b.freeze || 0) + (b.impact || 0);
  }
  return n;
}

const LETTERBOX = 62;

/** Per-frame cinematic state owned by the director. */
export class Cinema {
  constructor(id) {
    this.beats = CINEMA[id] || [];
    this.hold = 0;
    this.slow = 0;
    this.rate = 2;
    this.impact = 0;
    this.impactColor = '#fff';
    this.lines = 0;
    this.linesMax = 1;
    this.focus = 'mid';
    this.punch = 0;
    this.caption = null; // { text, age, life }
    this.frame = 0;
  }

  /** Runs once per frame (also on held frames): visual timers. */
  frameTick() {
    this.frame++;
    if (this.impact > 0) this.impact--;
    if (this.lines > 0) this.lines--;
    this.punch *= 0.88;
    if (this.caption && ++this.caption.age > this.caption.life) this.caption = null;
  }

  /** Runs after each script tick: fires that tick's point beats and schedules the holds. */
  scriptTick(t) {
    for (const b of this.beats) {
      if (b.at !== t) continue;
      if (b.slow) { this.slow = b.slow; this.rate = b.rate || 2; }
      if (b.freeze) this.hold += b.freeze;
      if (b.impact) { this.impact = b.impact; this.impactColor = b.color || '#ffffff'; this.hold += b.impact; }
      if (b.lines) { this.lines = this.linesMax = b.lines; this.focus = b.focus || 'mid'; }
      if (b.punch) this.punch = Math.max(this.punch, b.punch);
      if (b.caption) this.caption = { text: b.caption, age: 0, life: Math.max(110, b.caption.length * 4 + 60) };
    }
    if (this.slow > 0) { this.slow--; this.hold += this.rate - 1; }
  }

  /** Range beats active at script tick t. */
  range(t, key) {
    for (const b of this.beats) if (b[key] && t >= b.from && t < b.to) return b;
    return null;
  }

  // --- drawing (screen space) --------------------------------------------------------------------
  /** Grade, spotlight, rays, speed lines and the impact frame: drawn over the scene. */
  drawScene(ctx, d, cam, W, H, redrawFighters) {
    const t = d.t;
    const pos = (who) => {
      const f = who === 'A' ? d.A : who === 'V' ? d.V : null;
      const x = f ? f.body.x : (d.A.body.x + d.V.body.x) / 2;
      const y = f ? f.body.y + 120 * f.props.posScale : 120;
      return cam.toScreen(x, y);
    };
    const rays = this.range(t, 'rays');
    if (rays) {
      const c = pos('mid');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 7; i++) {
        const sway = Math.sin(this.frame * 0.02 + i * 1.7) * 30;
        const x = c.x + (i - 3) * 90 + sway;
        const g = ctx.createLinearGradient(x, 0, x, H);
        g.addColorStop(0, hexA(rays.rays, 0.32));
        g.addColorStop(1, hexA(rays.rays, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x - 18, 0);
        ctx.lineTo(x + 18, 0);
        ctx.lineTo(x + 80 + (i - 3) * 30, H);
        ctx.lineTo(x - 80 + (i - 3) * 30, H);
        ctx.fill();
      }
      ctx.restore();
    }
    const grade = this.range(t, 'grade');
    if (grade) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = grade.a ?? 0.35;
      ctx.fillStyle = grade.grade;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    const spot = this.range(t, 'spot');
    if (spot) {
      const c = pos(spot.spot), z = cam.zoom;
      const g = ctx.createRadialGradient(c.x, c.y, 120 * z, c.x, c.y, 380 * z);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(4,0,6,0.62)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.lines > 0) {
      const c = pos(this.focus), k = this.lines / this.linesMax;
      ctx.save();
      ctx.globalAlpha = 0.55 * Math.min(1, k * 3);
      ctx.fillStyle = '#ffffff';
      const n = 56, R0 = 210 * cam.zoom, R1 = Math.hypot(W, H);
      for (let i = 0; i < n; i++) {
        // deterministic shimmer: lines flicker frame to frame like hand-drawn ones
        const h = Math.sin(i * 12.9898 + this.frame * 7.233) * 43758.5453;
        const r = h - Math.floor(h);
        if (r < 0.25) continue;
        const a = (i / n) * Math.PI * 2 + r * 0.05, w = 0.004 + r * 0.01, r0 = R0 * (1 + r * 0.6);
        ctx.beginPath();
        ctx.moveTo(c.x + Math.cos(a) * r0, c.y + Math.sin(a) * r0);
        ctx.lineTo(c.x + Math.cos(a - w) * R1, c.y + Math.sin(a - w) * R1);
        ctx.lineTo(c.x + Math.cos(a + w) * R1, c.y + Math.sin(a + w) * R1);
        ctx.fill();
      }
      ctx.restore();
    }
    if (this.impact > 0) {
      // impact frame: the world flashes to one colour, fighters become ink silhouettes
      ctx.fillStyle = this.impactColor;
      ctx.fillRect(0, 0, W, H);
      redrawFighters('#12040c');
    }
  }

  /** Vignette, letterbox bars, the opening credit and subtitles: drawn over everything. */
  drawFrame(ctx, d, W, H, k, live) {
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, `rgba(0,0,0,${0.55 * k})`);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
    const bar = Math.round(LETTERBOX * k);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, bar);
    ctx.fillRect(0, H - bar, W, bar);
    if (k < 0.99 || !live) return;
    const t = d.t;
    // opening credit, like the first card of a film
    if (t < 100) {
      const a = Math.min(1, t / 14) * Math.min(1, (100 - t) / 18);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#e8dcc4';
      ctx.font = 'italic 500 15px Georgia, "Times New Roman", serif';
      spaced(ctx, `${d.A.def.name}  in`, W / 2, bar / 2 - 9, 3);
      ctx.font = '700 19px Georgia, "Times New Roman", serif';
      ctx.fillStyle = '#ffd23f';
      spaced(ctx, `“${d.name}”`, W / 2, bar / 2 + 12, 6);
      ctx.restore();
    }
    const c = this.caption;
    if (c) {
      const shown = c.text.slice(0, Math.floor(c.age * 0.9));
      const a = Math.min(1, (c.life - c.age) / 16);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'italic 600 22px Georgia, "Times New Roman", serif';
      ctx.fillStyle = '#f2e6d0';
      ctx.fillText(shown, W / 2, H - bar / 2);
      ctx.restore();
    }
  }
}

function spaced(ctx, text, x, y, sp) {
  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + sp * (chars.length - 1);
  let cx = x - total / 2;
  ctx.textAlign = 'left';
  chars.forEach((ch, i) => { ctx.fillText(ch, cx, y); cx += widths[i] + sp; });
  ctx.textAlign = 'center';
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
