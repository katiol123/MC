// Interaction between the two fighter bodies: pushbox separation (no interpenetration), wall
// handling and the camera separation limit. Kept separate from the per-body integrator.
import { STAGE, MAX_SEPARATION } from '../config/constants.js';

const clampX = (b, x) => Math.min(STAGE.right - b.pushW, Math.max(STAGE.left + b.pushW, x));

/**
 * Separates two bodies whose pushboxes overlap. Each body is moved half of the overlap; if one is
 * pinned against a wall the other takes the full correction, so nobody ends up inside the other or
 * stuck in the wall. Returns the overlap that was resolved (0 if none).
 */
export function resolvePushboxes(a, b, facingHintA = 1) {
  const pa = a.pushbox(), pb = b.pushbox();
  const vert = pa.y < pb.y + pb.h && pa.y + pa.h > pb.y;
  if (!vert) return 0;
  const overlap = a.pushW + b.pushW - Math.abs(a.x - b.x);
  if (overlap <= 0) return 0;
  // Side decision: current order, falling back to the order before this tick (cross-ups), then facing.
  let dir = Math.sign(a.x - b.x);
  if (dir === 0) dir = Math.sign(a.prevX - b.prevX);
  if (dir === 0) dir = -facingHintA;
  // Airborne bodies landing on a grounded one are pushed more (they are the ones "falling in").
  let shareA = 0.5;
  if (!a.onGround && b.onGround) shareA = 0.75;
  else if (a.onGround && !b.onGround) shareA = 0.25;
  const ax = clampX(a, a.x + dir * overlap * shareA);
  const bx = clampX(b, b.x - dir * overlap * (1 - shareA));
  const movedA = Math.abs(ax - a.x), movedB = Math.abs(bx - b.x);
  a.x = ax;
  b.x = bx;
  const remaining = overlap - movedA - movedB;
  if (remaining > 1e-6) {
    // One side hit a wall: push the other one the rest of the way.
    if (movedA < overlap * shareA - 1e-6) b.x = clampX(b, b.x - dir * remaining);
    else a.x = clampX(a, a.x + dir * remaining);
    // Both against walls (impossible with a wide stage) – last resort: allow overlap.
  }
  a.clampToStage();
  b.clampToStage();
  return overlap;
}

/** Keeps both fighters within the camera's maximum separation. */
export function enforceSeparation(a, b, max = MAX_SEPARATION) {
  const d = Math.abs(a.x - b.x);
  if (d <= max) return;
  const excess = d - max;
  // Pull back whichever moved away more this tick.
  const da = (a.x - a.prevX) * Math.sign(a.x - b.x);
  const db = (b.x - b.prevX) * Math.sign(b.x - a.x);
  const left = a.x < b.x ? a : b;
  const right = left === a ? b : a;
  if (da > db) {
    const s = a === left ? 1 : -1;
    a.x += s * excess;
  } else {
    const s = b === left ? 1 : -1;
    b.x += s * excess;
  }
  if (left.vx < 0) left.vx = 0;
  if (right.vx > 0) right.vx = 0;
  a.clampToStage();
  b.clampToStage();
}
