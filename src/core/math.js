// Small math toolkit shared by simulation, animation and rendering.
// Everything here is pure and allocation-light so it can run in tests (Node) and in the browser.

export const DEG = Math.PI / 180;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
export const approach = (v, target, step) =>
  v < target ? Math.min(v + step, target) : Math.max(v - step, target);

/** Interpolates angles (degrees) along the shortest arc. */
export function lerpAngle(a, b, t) {
  let d = ((b - a) % 360 + 540) % 360 - 180;
  return a + d * t;
}

// --- easing -----------------------------------------------------------------
export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  smooth: (t) => t * t * (3 - 2 * t),
  /** Limb strike: accelerates into contact without a single-frame snap. */
  strike: (t) => 0.5 * t * t + 0.5 * t * t * (3 - 2 * t),
};

// --- vectors (plain {x, y} objects) -----------------------------------------
export const v2 = (x = 0, y = 0) => ({ x, y });
export const vadd = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const vsub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const vscale = (a, s) => ({ x: a.x * s, y: a.y * s });
export const vlen = (a) => Math.hypot(a.x, a.y);
export const vdist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const vlerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const vnorm = (a) => {
  const l = Math.hypot(a.x, a.y) || 1;
  return { x: a.x / l, y: a.y / l };
};
export const vperp = (a) => ({ x: -a.y, y: a.x });
export const vdot = (a, b) => a.x * b.x + a.y * b.y;

// Direction helpers for the skeleton convention (y up, x = "forward").
// Angles are in degrees, counter-clockwise positive.
/** Unit vector of a bone whose rest direction points DOWN, rotated by `deg`. */
export const dirDown = (deg) => ({ x: Math.sin(deg * DEG), y: -Math.cos(deg * DEG) });
/** Unit vector of a bone whose rest direction points UP, rotated by `deg`. */
export const dirUp = (deg) => ({ x: -Math.sin(deg * DEG), y: Math.cos(deg * DEG) });
/** Unit vector of a bone whose rest direction points FORWARD (+x), rotated by `deg`. */
export const dirFwd = (deg) => ({ x: Math.cos(deg * DEG), y: Math.sin(deg * DEG) });

// --- geometry ---------------------------------------------------------------
/** Squared distance between point p and segment ab. */
export function distPointSegSq(p, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  let t = len2 > 0 ? ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2 : 0;
  t = clamp(t, 0, 1);
  const dx = a.x + abx * t - p.x, dy = a.y + aby * t - p.y;
  return dx * dx + dy * dy;
}

function segSegIntersect(p1, p2, p3, p4) {
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y, d2x = p4.x - p3.x, d2y = p4.y - p3.y;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-9) return false;
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / den;
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/** Squared minimum distance between segments ab and cd. */
export function distSegSegSq(a, b, c, d) {
  if (segSegIntersect(a, b, c, d)) return 0;
  return Math.min(
    distPointSegSq(a, c, d),
    distPointSegSq(b, c, d),
    distPointSegSq(c, a, b),
    distPointSegSq(d, a, b),
  );
}

/** Capsule = {a, b, r}; circle is a capsule with a === b. */
export function capsulesOverlap(c1, c2) {
  const r = c1.r + c2.r;
  return distSegSegSq(c1.a, c1.b, c2.a, c2.b) <= r * r;
}

/** Penetration depth of two capsules (positive when overlapping). */
export function capsulePenetration(c1, c2) {
  return c1.r + c2.r - Math.sqrt(distSegSegSq(c1.a, c1.b, c2.a, c2.b));
}

export const aabbOverlap = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
