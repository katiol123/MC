// Colour utilities with a small cache (render-only).
const cache = new Map();

export function hexToRgb(hex) {
  let c = cache.get(hex);
  if (c) return c;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const n = parseInt(h, 16);
  c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  cache.set(hex, c);
  return c;
}

const toHex = (r, g, b) =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

/** Mixes two colours (t = 0 -> a, 1 -> b). */
export function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
export const lighten = (c, t) => mix(c, '#ffffff', t);
export const darken = (c, t) => mix(c, '#000000', t);
export function rgba(c, a) {
  const [r, g, b] = hexToRgb(c);
  return `rgba(${r},${g},${b},${a})`;
}
/** Slight hue shift toward a target (used for cool shadows / warm lights). */
export const shadeToward = (c, target, t) => mix(c, target, t);
