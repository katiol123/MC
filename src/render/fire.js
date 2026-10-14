// Procedural fire: flickering flame tongues and glows, shared by the fighter painter (flaming
// fists), the burn status overlay, fire projectiles and fire hit effects. Purely cosmetic.

const LAYERS = [
  ['rgba(214,48,20,0.85)', 1.0],
  ['rgba(255,128,32,0.9)', 0.72],
  ['rgba(255,214,90,0.95)', 0.42],
];

/**
 * One flame tongue (three nested colour layers) rising from (x, y).
 * up: +1 when +y points up on screen (fighter-local space), -1 in screen space.
 * t: time in seconds; seed decorrelates neighbouring flames.
 */
export function drawFlame(ctx, x, y, w, h, t, seed = 0, up = 1) {
  const flick = 0.82 + 0.18 * Math.sin(t * 17 + seed * 3.1) + 0.08 * Math.sin(t * 29 + seed);
  const sway = Math.sin(t * 9 + seed * 1.7) * w * 0.55;
  for (const [color, k] of LAYERS) {
    const ww = w * k, hh = h * k * flick;
    ctx.beginPath();
    ctx.moveTo(x - ww, y);
    ctx.quadraticCurveTo(x - ww * 1.05, y + up * hh * 0.55, x + sway * k, y + up * hh);
    ctx.quadraticCurveTo(x + ww * 1.05, y + up * hh * 0.5, x + ww, y);
    ctx.arc(x, y, ww, 0, Math.PI, up > 0);
    ctx.fillStyle = color;
    ctx.fill();
  }
}

/** Soft additive glow. */
export function drawGlow(ctx, x, y, r, alpha = 0.55, color = '255,140,40') {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${color},${alpha})`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** A fist wrapped in fire: glow plus a crown of tongues around the knuckles. */
export function drawFireFist(ctx, x, y, size, t, seed = 0, up = 1) {
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, x, y, size * 2.8, 0.6);
  ctx.globalCompositeOperation = prev;
  for (let i = 0; i < 5; i++) {
    const ox = (i - 2) * size * 0.36;
    drawFlame(ctx, x + ox, y - up * size * 0.35, size * (0.52 - Math.abs(i - 2) * 0.07), size * (1.9 - Math.abs(i - 2) * 0.3 + 0.4 * Math.sin(t * 7 + i * 2 + seed)), t, seed + i, up);
  }
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, x, y, size * 0.9, 0.8, '255,230,150');
  ctx.globalCompositeOperation = prev;
}
