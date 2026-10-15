// Knocked-off props (low-health look): hats, masks, headphones, a tooth... Each one flies off the
// fighter, tumbles, bounces on the floor and stays there until the round ends. Purely cosmetic.
// Drawn in prop-local space: origin at the prop centre, +y up, units ≈ fighter local units.
import { rgba, darken, lighten } from './color.js';

const OUT = '#140c10';

function shape(ctx, fill, w = 2.2) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = w;
  ctx.strokeStyle = OUT;
  ctx.stroke();
}

const DRAW = {
  tophat(ctx, lk) {
    const h = lk.hat || { color: '#e0399b', band: '#2a2a2a', goggles: '#c99b4a' };
    ctx.beginPath();
    ctx.ellipse(0, -10, 26, 6, 0, 0, Math.PI * 2);
    shape(ctx, h.color);
    ctx.beginPath();
    ctx.rect(-15, -10, 30, 34);
    shape(ctx, h.color);
    ctx.fillStyle = h.band;
    ctx.fillRect(-15, -6, 30, 7);
    ctx.beginPath();
    ctx.ellipse(0, 24, 15, 4, 0, 0, Math.PI * 2);
    shape(ctx, lighten(h.color, 0.15), 1.6);
    for (const x of [-6, 6]) {
      ctx.beginPath();
      ctx.arc(x, 4, 4.5, 0, Math.PI * 2);
      shape(ctx, h.goggles || '#c99b4a', 1.4);
    }
  },
  chefhat(ctx, lk) {
    const h = lk.hat || { color: '#f1ede4', band: '#c9a24a' };
    ctx.beginPath();
    ctx.rect(-16, -14, 32, 12);
    shape(ctx, h.color);
    ctx.fillStyle = h.band;
    ctx.fillRect(-16, -9, 32, 3);
    ctx.beginPath();
    for (const [x, y, r] of [[-12, 4, 11], [0, 10, 13], [12, 4, 11]]) ctx.moveTo(x + r, y), ctx.arc(x, y, r, 0, Math.PI * 2);
    shape(ctx, h.color);
  },
  headphones(ctx, lk) {
    ctx.beginPath();
    ctx.arc(0, -2, 22, 0.15, Math.PI - 0.15);
    ctx.lineWidth = 7;
    ctx.strokeStyle = OUT;
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.strokeStyle = lk.headphones || '#b6a77a';
    ctx.stroke();
    for (const x of [-21, 21]) {
      ctx.beginPath();
      ctx.ellipse(x, -6, 7, 10, 0, 0, Math.PI * 2);
      shape(ctx, '#2a2630');
    }
  },
  mask(ctx, lk) {
    const m = lk.mask || { color: '#c49a3c', markings: '#7a2a8a', visor: '#e6e23a' };
    ctx.beginPath();
    ctx.moveTo(-20, 16); ctx.quadraticCurveTo(0, 30, 20, 16); ctx.lineTo(16, -8); ctx.quadraticCurveTo(0, -24, -16, -8); ctx.closePath();
    shape(ctx, m.color);
    for (const x of [-8, 8]) {
      ctx.beginPath();
      ctx.ellipse(x, 6, 5, 3, 0, 0, Math.PI * 2);
      shape(ctx, m.visor, 1.2);
    }
    ctx.fillStyle = m.markings;
    for (const [x, y] of [[-12, -4], [12, -4], [0, -12], [-4, 18], [5, 17]]) { ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill(); }
    // crack
    ctx.beginPath(); ctx.moveTo(2, 24); ctx.lineTo(-2, 12); ctx.lineTo(4, 4); ctx.lineTo(0, -6);
    ctx.lineWidth = 1.6; ctx.strokeStyle = OUT; ctx.stroke();
  },
  bearhood(ctx, lk) {
    const h = lk.hood || { color: '#7a4a28', lining: '#d4318f', snout: '#c9a27a', teeth: '#f2ead8', eyes: '#4fb8a0' };
    for (const x of [-16, 16]) {
      ctx.beginPath(); ctx.arc(x, 18, 8, 0, Math.PI * 2); shape(ctx, h.color);
      ctx.beginPath(); ctx.arc(x, 18, 4, 0, Math.PI * 2); ctx.fillStyle = h.lining; ctx.fill();
    }
    ctx.beginPath(); ctx.ellipse(0, 0, 24, 20, 0, 0, Math.PI * 2); shape(ctx, h.color);
    ctx.beginPath(); ctx.ellipse(0, -8, 11, 8, 0, 0, Math.PI * 2); shape(ctx, h.snout, 1.6);
    ctx.beginPath(); ctx.arc(0, -4, 3.5, 0, Math.PI * 2); ctx.fillStyle = '#3a1830'; ctx.fill();
    for (const x of [-9, 9]) { ctx.beginPath(); ctx.arc(x, 6, 3.5, 0, Math.PI * 2); shape(ctx, '#f4f1ea', 1.2); ctx.beginPath(); ctx.arc(x, 6, 1.6, 0, Math.PI * 2); ctx.fillStyle = h.eyes; ctx.fill(); }
    ctx.fillStyle = h.teeth;
    for (const x of [-6, 0, 6]) { ctx.beginPath(); ctx.moveTo(x - 2.5, -15); ctx.lineTo(x, -20); ctx.lineTo(x + 2.5, -15); ctx.fill(); }
  },
  feather(ctx, lk) {
    const h = lk.hat || { color: '#e8dcc0', tip: '#d4318f' };
    ctx.beginPath(); ctx.ellipse(0, 0, 22, 5, 0, 0, Math.PI * 2); shape(ctx, h.color, 1.4);
    ctx.save(); ctx.clip(); ctx.fillStyle = h.tip; ctx.fillRect(8, -6, 20, 12); ctx.restore();
    ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(18, 0); ctx.lineWidth = 1; ctx.strokeStyle = rgba(OUT, 0.6); ctx.stroke();
  },
  comb(ctx) {
    ctx.beginPath(); ctx.rect(-14, 0, 28, 5); shape(ctx, '#e2b440', 1.4);
    ctx.lineWidth = 1.6; ctx.strokeStyle = '#e2b440';
    for (let x = -12; x <= 12; x += 3) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, -9); ctx.stroke(); }
  },
  hairtie(ctx, lk) {
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.lineWidth = 7; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.lineWidth = 4.5; ctx.strokeStyle = lk.hair?.streak || '#e0399b'; ctx.stroke();
  },
  belt(ctx, lk) {
    // a martial-arts belt, flapping as it falls
    ctx.beginPath();
    ctx.moveTo(-26, 0);
    for (let x = -26; x <= 26; x += 4) ctx.lineTo(x, Math.sin(x * 0.18) * 4);
    ctx.lineWidth = 9; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.lineWidth = 6; ctx.strokeStyle = lk.belt?.color || '#1a1a1e'; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); shape(ctx, lk.belt?.color || '#1a1a1e', 1.6);
  },
  boot(ctx, lk) {
    ctx.beginPath();
    ctx.moveTo(-8, 14); ctx.lineTo(-8, -4); ctx.quadraticCurveTo(-8, -10, 2, -10); ctx.lineTo(16, -10); ctx.quadraticCurveTo(20, -4, 14, 0); ctx.lineTo(4, 0); ctx.lineTo(4, 14); ctx.closePath();
    shape(ctx, lk.shoes?.color || '#2a2224');
    ctx.fillStyle = lk.shoes?.sole || '#100c0b'; ctx.fillRect(-8, -12, 26, 3);
  },
  bill(ctx) {
    ctx.beginPath(); ctx.rect(-12, -6, 24, 12); shape(ctx, '#7fd36a', 1.4);
    ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, Math.PI * 2); ctx.strokeStyle = '#3a7a2a'; ctx.lineWidth = 1.4; ctx.stroke();
  },
  mic(ctx) {
    ctx.beginPath(); ctx.rect(-3, -18, 6, 20); shape(ctx, '#2a2630', 1.6);
    ctx.beginPath(); ctx.arc(0, 6, 7, 0, Math.PI * 2); shape(ctx, '#b6b6c0', 1.6);
  },
  guitarneck(ctx) {
    ctx.beginPath(); ctx.rect(-30, -3.5, 50, 7); shape(ctx, '#3a2a20', 1.6);
    ctx.beginPath(); ctx.rect(20, -6, 12, 12); shape(ctx, '#2a1e18', 1.6);
    ctx.strokeStyle = '#d8d8e0'; ctx.lineWidth = 0.8;
    for (const y of [-2, 0, 2]) { ctx.beginPath(); ctx.moveTo(-30, y); ctx.lineTo(20, y); ctx.stroke(); }
  },
  cap(ctx, lk) {
    const h = lk.hat || { color: '#e0952e', check: '#2f9a7a' };
    ctx.beginPath();
    ctx.ellipse(0, 4, 24, 13, 0, 0, Math.PI * 2);
    shape(ctx, h.color);
    ctx.fillStyle = h.check || '#2f9a7a';
    for (let i = -2; i <= 2; i++) for (let j = 0; j < 2; j++) if ((i + j) % 2) ctx.fillRect(i * 8 - 3, j * 8 - 3, 7, 7);
    ctx.beginPath();
    ctx.ellipse(18, -6, 12, 4, 0.2, 0, Math.PI * 2);
    shape(ctx, darken(h.color, 0.2), 1.6);
  },
  padlock(ctx, lk) {
    const c = lk.chain || { color: '#b8b8c0', lock: '#9a9aa4' };
    ctx.beginPath(); ctx.arc(0, 6, 6, Math.PI, 0); ctx.lineWidth = 3; ctx.strokeStyle = c.color; ctx.stroke();
    ctx.beginPath(); ctx.rect(-8, -8, 16, 14); shape(ctx, c.lock, 1.8);
    ctx.beginPath(); ctx.arc(0, -1, 2, 0, Math.PI * 2); ctx.fillStyle = OUT; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-14, 10); for (let i = 0; i < 5; i++) ctx.lineTo(-14 - i * 6, 10 + (i % 2) * 4);
    ctx.lineWidth = 3; ctx.strokeStyle = c.color; ctx.stroke();
  },
  sombrero(ctx, lk) {
    const h = lk.hat || { color: '#e8d4a0', band: '#d4318f' };
    ctx.beginPath(); ctx.ellipse(0, 0, 46, 9, 0, 0, Math.PI * 2); shape(ctx, h.color);
    ctx.beginPath(); ctx.moveTo(-16, 2); ctx.quadraticCurveTo(-12, 30, 0, 32); ctx.quadraticCurveTo(12, 30, 16, 2); ctx.closePath(); shape(ctx, h.color);
    ctx.fillStyle = h.band; ctx.fillRect(-15, 3, 30, 6);
  },
  tooth(ctx) {
    ctx.beginPath(); ctx.moveTo(-4, 5); ctx.lineTo(4, 5); ctx.lineTo(3, -2); ctx.lineTo(1, -5); ctx.lineTo(-1, -2); ctx.lineTo(-3, -5); ctx.closePath();
    shape(ctx, '#f6f1e6', 1.4);
  },
  button(ctx, lk) {
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); shape(ctx, lk.top?.buttons || '#8d8576', 1.2);
    ctx.fillStyle = OUT;
    for (const x of [-1.3, 1.3]) { ctx.beginPath(); ctx.arc(x, 0, 0.8, 0, Math.PI * 2); ctx.fill(); }
  },
};

/** Light props flutter down (feathers), heavy ones fall and bounce. */
const FLOAT = { feather: true, belt: true };

export function spawnProp(type, x, y, dir, opt, look) {
  return {
    kind: 'prop', type, look, x, y,
    vx: dir * (opt.vx ?? 2), vy: opt.vy ?? 8, rot: 0, vrot: dir * (opt.spin ?? 0.2),
    life: 600, max: 600, float: !!FLOAT[type], t: Math.random() * 6,
  };
}

export function stepProp(p) {
  p.t += 1;
  if (p.float) {
    // flutter: low gravity, side-to-side sway, rotation follows the sway
    p.vy = Math.max(-1.6, p.vy - 0.12);
    p.vx *= 0.97;
    p.x += p.vx + Math.sin(p.t * 0.12) * 1.6;
    p.rot = Math.sin(p.t * 0.12) * 0.7 + p.vrot * 4;
  } else {
    p.vy -= 0.55;
    p.x += p.vx;
    p.rot += p.vrot;
  }
  p.y += p.vy;
  const floor = p.float ? 3 : 8;
  if (p.y <= floor) {
    p.y = floor;
    if (p.float) { p.vy = 0; p.vx = 0; p.rot = 1.45; p.float = false; p.vrot = 0; }
    else if (Math.abs(p.vy) > 2) { p.vy *= -0.38; p.vx *= 0.6; p.vrot *= -0.5; } // bounce
    else { p.vy = 0; p.vx *= 0.8; p.vrot *= 0.7; p.rot += (Math.round(p.rot / Math.PI) * Math.PI - p.rot) * 0.2; } // settle
  }
}

export function drawProp(ctx, p, s, zoom) {
  const fade = Math.min(1, p.life / 40);
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(s.x, s.y);
  ctx.scale(zoom, -zoom);
  ctx.rotate(p.rot);
  ctx.lineJoin = 'round';
  (DRAW[p.type] || DRAW.tooth)(ctx, p.look || {});
  ctx.restore();
}
