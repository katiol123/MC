// Animation clips. A clip samples a *resolved* pose (fighter proportions applied, IK solved) from a
// frame number and a small context object provided by the fighter (walk distance, vertical speed...).
// Clips never read or write gameplay state: they only describe how the body looks.
import { clamp, ease, lerp } from '../core/math.js';
import { resolvePose, blendPoses, emptyPose } from './skeleton.js';
import * as K from './poses.js';
import { ATTACK_POSES } from './attackPoses.js';

const R = (raw, props) => resolvePose(raw, props, emptyPose());
const mix = (a, b, t, props) => blendPoses(R(a, props), R(b, props), clamp(t, 0, 1), props, emptyPose());

/** Samples a list of [frame, rawPose, easing?] keys. */
function keyed(keys, f, props) {
  if (f <= keys[0][0]) return R(keys[0][1], props);
  for (let i = 1; i < keys.length; i++) {
    const [t1, p1, e] = keys[i];
    const [t0, p0] = keys[i - 1];
    if (f <= t1) {
      const t = (f - t0) / Math.max(1e-6, t1 - t0);
      return mix(p0, p1, (e || ease.inOutSine)(t), props);
    }
  }
  return R(keys[keys.length - 1][1], props);
}

const loopSine = (a, b, period) => (f, ctx, params, props) =>
  mix(a, b, 0.5 - 0.5 * Math.cos((f / period) * Math.PI * 2), props);

// --- locomotion -----------------------------------------------------------------------------------
const WALK_STRIDE = 28;
function walkRaw(dist, props, base) {
  const S = WALK_STRIDE;
  const d = dist / props.posScale;
  const cyc = (((d % S) + S) % S) / S;
  const pF = clamp(cyc / 0.5, 0, 1);
  const pB = clamp((cyc - 0.5) / 0.5, 0, 1);
  const travelled = cyc * S;
  const raw = K.P(base, {
    y: base.y + 1.6 * Math.cos(cyc * Math.PI * 4) - 1,
    x: base.x + 1.5 * Math.sin(cyc * Math.PI * 2),
    chest: base.chest + 2 * Math.sin(cyc * Math.PI * 2),
    fa: [base.fa[0] + 4 * Math.sin(cyc * Math.PI * 2), base.fa[1], 0],
    ba: [base.ba[0] - 4 * Math.sin(cyc * Math.PI * 2), base.ba[1], base.ba[2]],
    ff: [base.ff[0] + S * ease.inOutSine(pF) - travelled, 8 + Math.sin(Math.PI * pF) * 8, Math.sin(Math.PI * pF) * 8],
    bf: [base.bf[0] + S * ease.inOutSine(pB) - travelled, 8 + Math.sin(Math.PI * pB) * 8, -Math.sin(Math.PI * pB) * 10],
  });
  return R(raw, props);
}

function runPose(dist, props) {
  const stride = 150;
  const d = dist / props.posScale;
  const cyc = (((d % stride) + stride) % stride) / stride;
  const n = K.RUN.length;
  const fi = cyc * n;
  const i0 = Math.floor(fi) % n, i1 = (i0 + 1) % n;
  return mix(K.RUN[i0], K.RUN[i1], ease.inOutSine(fi - Math.floor(fi)), props);
}

// --- airborne -------------------------------------------------------------------------------------
function jumpPose(f, ctx, props) {
  const { vy = 0, jumpVY = 16, airDir = 0 } = ctx;
  const prog = clamp((jumpVY - vy) / (2 * jumpVY), 0, 1); // 0 at take-off, 1 at landing height
  if (airDir === 0) return mix(K.AIR_RISE, K.AIR_FALL, ease.inOutSine(prog), props);
  // Flip jump: tuck and rotate a full turn, open up again before landing.
  // the somersault happens on the way up so air attacks near the apex start from an upright body
  const spin = clamp((prog - 0.05) / 0.47, 0, 1);
  const rot = -airDir * 360 * ease.inOutSine(spin);
  let tuckT = prog < 0.12 ? prog / 0.12 : prog > 0.5 ? 1 - (prog - 0.5) / 0.2 : 1;
  tuckT = clamp(tuckT, 0, 1);
  const base = prog < 0.5 ? K.AIR_RISE : K.AIR_FALL;
  const pose = mix(base, K.AIR_TUCK, ease.inOutSine(tuckT), props);
  pose.rot = rot;
  return pose;
}

// --- attacks --------------------------------------------------------------------------------------
const BASES = { stand: K.STANCE, crouch: K.CROUCH, air: K.AIR_FALL };

function attackPose(f, move, props) {
  const ap = ATTACK_POSES[move.anim];
  const base = BASES[ap.base] || K.STANCE;
  const end = BASES[move.endStance || ap.base] || base;
  const S = move.startup, A = move.active, Rc = move.recovery;
  const wu = Math.max(1, Math.round(S * 0.45));
  const contact = ap.contact;
  const extend = ap.extend || contact;
  const follow = ap.follow || extend;
  if (f <= wu) return mix(base, ap.windup, ease.inOutSine(f / wu), props);
  if (f <= S + 1) return mix(ap.windup, contact, ease.strike((f - wu) / Math.max(1, S + 1 - wu)), props);
  if (f <= S + A) return mix(contact, extend, (f - S - 1) / Math.max(1, A - 1), props);
  const r = f - S - A;
  const rf = Math.max(1, Math.round(Rc * 0.35));
  if (r <= rf) return mix(extend, follow, ease.outQuad(r / rf), props);
  return mix(follow, end, ease.inOutSine((r - rf) / Math.max(1, Rc - rf)), props);
}

/** Phases of an attack frame for UI / debugging (kept here because animation and data agree on it). */
export function attackPhase(move, f) {
  if (f <= move.startup) return 'startup';
  if (f <= move.startup + move.active) return 'active';
  return 'recovery';
}

// --- reactions ------------------------------------------------------------------------------------
// The impact itself is the animator's cross-fade from whatever pose the fighter was in (see the
// blend length passed by Fighter.receiveHit), so re-hits never snap back to a neutral pose first.
function reaction(target, back, f, dur, props) {
  const holdEnd = Math.max(5, dur * 0.55);
  if (f <= holdEnd) return R(target, props);
  return mix(target, back, ease.inOutSine((f - holdEnd) / Math.max(1, dur - holdEnd)), props);
}

function airHitPose(f, ctx, params, props) {
  const { vy = 0 } = ctx;
  const launch = !!params.launch;
  const rot0 = params.rot0 || 0;
  const t = clamp(f / 10, 0, 1);
  const pose = mix(K.AIR_HIT, launch ? K.AIR_TUMBLE : K.AIR_HIT, t, props);
  // The body keeps rotating backward from wherever it was when hit (continuous on re-hits),
  // and settles toward a horizontal fall.
  const fall = clamp(-vy / 14, 0, 1);
  const target = launch ? 150 : 25 + 55 * fall;
  const rate = launch ? 6 : 4;
  pose.rot = rot0 + clamp(target - rot0, -rate * f, rate * f);
  return pose;
}

export const CLIPS = {
  idle: { sample: loopSine(K.STANCE, K.STANCE_BREATH, 84) },
  neutral: { sample: (f, c, p, props) => mix(K.NEUTRAL, K.STANCE, ease.inOutSine(clamp(f / 40, 0, 1)), props) },
  crouch: { sample: loopSine(K.CROUCH, K.CROUCH_BREATH, 90) },
  walk: { sample: (f, ctx, p, props) => walkRaw(ctx.walkDist || 0, props, K.STANCE) },
  run: { sample: (f, ctx, p, props) => runPose(ctx.walkDist || 0, props) },
  dashF: { sample: (f, c, p, props) => keyed([[0, K.STANCE], [4, K.DASH_F[0]], [8, K.DASH_F[1]], [p.duration || 16, K.STANCE]], f, props) },
  dashB: { sample: (f, c, p, props) => keyed([[0, K.STANCE], [4, K.DASH_B[0]], [9, K.DASH_B[1]], [p.duration || 18, K.STANCE]], f, props) },
  prejump: { sample: (f, c, p, props) => mix(K.STANCE, K.PREJUMP, ease.outQuad(f / 3), props) },
  jump: { sample: (f, ctx, p, props) => jumpPose(f, ctx, props) },
  land: { sample: (f, c, p, props) => keyed([[0, K.LAND], [2, K.LAND], [p.duration || 4, K.STANCE]], f, props) },
  attack: {
    sample: (f, ctx, p, props) => attackPose(ctx.moveFrame ?? f, p.move, props),
    layers: (p) => ATTACK_POSES[p.move.anim].layers,
  },
  guardHigh: { sample: (f, c, p, props) => mix(K.STANCE, K.BLOCK_HIGH, ease.outQuad(f / 4), props) },
  guardLow: { sample: (f, c, p, props) => mix(K.CROUCH, K.BLOCK_LOW, ease.outQuad(f / 4), props) },
  blockHigh: {
    sample: (f, c, p, props) =>
      keyed([[0, K.BLOCK_HIGH], [2, K.P(K.BLOCK_HIGH, { x: -12, lean: -8, head: 14 })], [Math.max(4, (p.duration || 10) - 2), K.BLOCK_HIGH]], f, props),
  },
  blockLow: {
    sample: (f, c, p, props) =>
      keyed([[0, K.BLOCK_LOW], [2, K.P(K.BLOCK_LOW, { x: -8, lean: 18 })], [Math.max(4, (p.duration || 10) - 2), K.BLOCK_LOW]], f, props),
  },
  hitHigh: { sample: (f, c, p, props) => reaction(K.HIT_HIGH, K.STANCE, f, p.duration || 14, props) },
  hitLow: { sample: (f, c, p, props) => reaction(K.HIT_LOW, K.STANCE, f, p.duration || 14, props) },
  hitCrouch: { sample: (f, c, p, props) => reaction(K.HIT_CROUCH, K.CROUCH, f, p.duration || 14, props) },
  stagger: {
    sample: (f, c, p, props) => {
      const d = p.duration || 30;
      return keyed([[0, K.STAGGER[0]], [5, K.STAGGER[0]], [d * 0.45, K.STAGGER[1]], [d * 0.8, K.STAGGER[2]], [d, K.STANCE]], f, props);
    },
  },
  airHit: { sample: (f, ctx, p, props) => airHitPose(f, ctx, p, props) },
  knockdown: { sample: (f, c, p, props) => keyed([[0, K.LYING_BOUNCE], [5, K.LYING_BOUNCE], [12, K.LYING, ease.outQuad]], f, props) },
  getup: {
    sample: (f, c, p, props) => {
      const d = p.duration || 30;
      return keyed([[0, K.GETUP[0]], [d * 0.4, K.GETUP[1]], [d * 0.72, K.GETUP[2]], [d, K.GETUP[3]]], f, props);
    },
  },
  dizzy: { sample: loopSine(K.DIZZY[0], K.DIZZY[1], 64) },
  victory: {
    sample: (f, c, p, props) => {
      const v = K.VICTORY[(p.variant || 0) % K.VICTORY.length];
      if (f < 24) return mix(K.STANCE, v, ease.outBack(f / 24), props);
      const breath = K.P(v, { y: v.y - 1.5, chest: v.chest + 2 });
      return mix(v, breath, 0.5 - 0.5 * Math.cos(((f - 24) / 80) * Math.PI * 2), props);
    },
  },
  defeat: { sample: (f, c, p, props) => mix(K.STANCE, K.DEFEAT_KNEEL, ease.inOutSine(clamp(f / 40, 0, 1)), props) },
  ko: { sample: (f, c, p, props) => R(K.LYING, props) },
};

