// Path builders for procedural body geometry. All functions only build paths (no fill/stroke) so
// the same geometry can be used for the outline pass, the colour pass and the shading pass.

/**
 * Tapered limb segment from a (radius ra) to b (radius rb) with smooth bezier sides. `bulgeP` / `bulgeN`
 * add muscle volume on the +normal / -normal side (e.g. biceps vs triceps, calf vs shin).
 */
export function limbPath(ctx, a, b, ra, rb, bulgeP = 0, bulgeN = 0, bulgeAt = 0.38) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 0.0001;
  const ux = dx / L, uy = dy / L;
  const nx = -uy, ny = ux;
  const k1 = bulgeAt * 0.8, k2 = Math.min(0.92, bulgeAt + 0.3);
  const angN = Math.atan2(ny, nx);
  ctx.moveTo(a.x + nx * ra, a.y + ny * ra);
  ctx.bezierCurveTo(
    a.x + ux * L * k1 + nx * (ra + bulgeP), a.y + uy * L * k1 + ny * (ra + bulgeP),
    a.x + ux * L * k2 + nx * (rb + bulgeP * 0.7), a.y + uy * L * k2 + ny * (rb + bulgeP * 0.7),
    b.x + nx * rb, b.y + ny * rb,
  );
  ctx.arc(b.x, b.y, rb, angN, angN - Math.PI, true);
  ctx.bezierCurveTo(
    a.x + ux * L * k2 - nx * (rb + bulgeN * 0.7), a.y + uy * L * k2 - ny * (rb + bulgeN * 0.7),
    a.x + ux * L * k1 - nx * (ra + bulgeN), a.y + uy * L * k1 - ny * (ra + bulgeN),
    a.x - nx * ra, a.y - ny * ra,
  );
  ctx.arc(a.x, a.y, ra, angN + Math.PI, angN, true);
  ctx.closePath();
}

/** Smooth closed curve through points (Catmull-Rom converted to cubic beziers). */
export function smoothClosed(ctx, pts, tension = 0.5) {
  const n = pts.length;
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const t = tension / 3;
    ctx.bezierCurveTo(
      p1.x + (p2.x - p0.x) * t, p1.y + (p2.y - p0.y) * t,
      p2.x - (p3.x - p1.x) * t, p2.y - (p3.y - p1.y) * t,
      p2.x, p2.y,
    );
  }
  ctx.closePath();
}

/** Smooth open curve through points. */
export function smoothOpen(ctx, pts, tension = 0.5, moveTo = true) {
  const n = pts.length;
  if (moveTo) ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    const t = tension / 3;
    ctx.bezierCurveTo(
      p1.x + (p2.x - p0.x) * t, p1.y + (p2.y - p0.y) * t,
      p2.x - (p3.x - p1.x) * t, p2.y - (p3.y - p1.y) * t,
      p2.x, p2.y,
    );
  }
}

/** Rounded box along a bone (used for fists, shoes, plates). Width across, from a to b. */
export function boxAlong(ctx, a, b, wa, wb, round = 0.5) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 0.0001;
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const pts = [
    { x: a.x + nx * wa, y: a.y + ny * wa },
    { x: b.x + nx * wb, y: b.y + ny * wb },
    { x: b.x - nx * wb, y: b.y - ny * wb },
    { x: a.x - nx * wa, y: a.y - ny * wa },
  ];
  const r = Math.min(wa, wb) * round;
  ctx.moveTo((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
  for (let i = 1; i <= 4; i++) {
    const p = pts[i % 4], q = pts[(i + 1) % 4];
    ctx.arcTo(p.x, p.y, q.x, q.y, r);
  }
  ctx.closePath();
}

/** Point along a->b at fraction t, offset by `side` along the normal. */
export function along(a, b, t, side = 0) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 0.0001;
  return { x: a.x + dx * t - (dy / L) * side, y: a.y + dy * t + (dx / L) * side };
}
