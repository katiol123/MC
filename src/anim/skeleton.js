// Skeleton definition, forward kinematics, two-bone IK and joint limits.
//
// Conventions (local "fighter space"): x points the way the fighter faces, y points up, origin is the
// point on the floor under the pelvis. Bone angles are degrees, counter-clockwise positive.
//   - Limbs rest pointing DOWN: shoulder 0 = arm hanging, +90 = arm straight forward, 180 = arm up.
//   - Knees bend backwards: shin abs = thigh abs - knee. Elbows bend forwards: forearm = upper + elbow.
//   - `lean` > 0 tilts the spine forward, `rot` rotates the whole body (positive = falling backward).
// This module is pure math: it is used by the simulation (hurt/hit boxes) and by the renderer.

import { DEG, clamp, dirDown, dirUp, dirFwd, lerp, lerpAngle } from '../core/math.js';

export const BASE_PROPORTIONS = {
  headR: 19.5,
  neck: 12,
  torso: 80,
  waistFrac: 0.42,
  shoulderDrop: 10,
  shoulderSpread: 5,
  hipDrop: 9,
  hipSpread: 3,
  upperArm: 46,
  foreArm: 41,
  hand: 13,
  thigh: 60,
  shin: 56,
  foot: 27,
  heel: 7,
  ankleH: 8,
  // radii, used for rendering volumes and hurtboxes
  rUpperArm: [10.5, 8],
  rForeArm: [8, 6.5],
  rHand: 7.5,
  rThigh: [15, 10],
  rShin: [10.5, 7],
  rNeck: 7.5,
  chestW: 29,
  waistW: 21,
  hipW: 24,
};

/** Base leg length the authored poses were designed for. */
const BASE_LEG = BASE_PROPORTIONS.thigh + BASE_PROPORTIONS.shin;

/**
 * Builds concrete proportions for a fighter from multipliers in its definition.
 * body: { height, bulk, arms, legs, head, torso, shoulders }
 */
export function buildProportions(body = {}) {
  const h = body.height ?? 1;
  const bulk = body.bulk ?? 1;
  const arms = (body.arms ?? 1) * h;
  const legs = (body.legs ?? 1) * h;
  const torso = (body.torso ?? 1) * h;
  const head = body.head ?? 1;
  const sh = body.shoulders ?? 1;
  const B = BASE_PROPORTIONS;
  const sc = (pair, k) => [pair[0] * k, pair[1] * k];
  const p = {
    headR: B.headR * head * Math.sqrt(h),
    neck: B.neck * torso,
    torso: B.torso * torso,
    waistFrac: B.waistFrac,
    shoulderDrop: B.shoulderDrop * torso,
    shoulderSpread: B.shoulderSpread * sh,
    hipDrop: B.hipDrop * legs,
    hipSpread: B.hipSpread,
    upperArm: B.upperArm * arms,
    foreArm: B.foreArm * arms,
    hand: B.hand * Math.sqrt(arms) * (body.hands ?? 1),
    thigh: B.thigh * legs,
    shin: B.shin * legs,
    foot: B.foot * Math.sqrt(legs),
    heel: B.heel,
    ankleH: B.ankleH,
    rUpperArm: sc(B.rUpperArm, bulk * (body.armBulk ?? 1)),
    rForeArm: sc(B.rForeArm, bulk * (body.armBulk ?? 1)),
    rHand: B.rHand * bulk * (body.hands ?? 1),
    rThigh: sc(B.rThigh, bulk * (body.legBulk ?? 1)),
    rShin: sc(B.rShin, bulk * (body.legBulk ?? 1)),
    rNeck: B.rNeck * bulk,
    chestW: B.chestW * bulk * sh,
    waistW: B.waistW * bulk * (body.waist ?? 1),
    hipW: B.hipW * bulk * (body.hips ?? 1),
  };
  /** Scale applied to authored positional values (pelvis height, feet targets). */
  p.posScale = (p.thigh + p.shin) / BASE_LEG;
  p.standHeight = p.thigh + p.shin + p.ankleH + p.hipDrop + p.torso + p.neck + p.headR * 2;
  return p;
}

// --- joint limits -------------------------------------------------------------------------------
export const JOINT_LIMITS = {
  sh: [-110, 215],
  el: [0, 158],
  wr: [-70, 70],
  hip: [-75, 150],
  knee: [0, 162],
  ankle: [-70, 75],
  lean: [-60, 80],
  chest: [-35, 40],
  neck: [-30, 35],
  head: [-35, 35],
};

export const POSE_KEYS = ['x', 'y', 'rot', 'lean', 'chest', 'neck', 'head'];
export const LIMBS = ['fa', 'ba', 'fl', 'bl'];

/** Default (neutral) pose fields so partial poses can be merged safely. */
export function emptyPose() {
  return {
    x: 0, y: 112, rot: 0, lean: 0, chest: 0, neck: 0, head: 0,
    fa: [20, 30, 0], ba: [15, 30, 0], fl: [10, 10, 0], bl: [-10, 10, 0],
    ff: null, bf: null,
  };
}

export function clonePose(p) {
  return {
    x: p.x, y: p.y, rot: p.rot, lean: p.lean, chest: p.chest, neck: p.neck, head: p.head,
    fa: p.fa.slice(), ba: p.ba.slice(), fl: p.fl.slice(), bl: p.bl.slice(),
    ff: p.ff ? p.ff.slice() : null, bf: p.bf ? p.bf.slice() : null,
  };
}

/** Returns pelvis tilt (absolute) used for the hips: the pelvis follows part of the spine lean. */
const pelvisAngle = (pose) => pose.rot - pose.lean * 0.3;

/** Hip joint position (local) for a leg. side = +1 front, -1 back. */
function hipJoint(pose, props, side) {
  const ap = pelvisAngle(pose);
  const d = dirDown(ap);
  const f = dirFwd(ap);
  return {
    x: pose.x + d.x * props.hipDrop + f.x * props.hipSpread * side,
    y: pose.y + d.y * props.hipDrop + f.y * props.hipSpread * side,
  };
}

/**
 * Two-bone IK for a leg: finds thigh/knee angles placing the ankle on `target` (local coords) with
 * the knee bending forward. Writes [hip, knee, ankle] (relative angles) into `out`.
 */
export function solveLegIK(pose, props, side, target, footRot = 0, out = [0, 0, 0]) {
  const hip = hipJoint(pose, props, side);
  const L1 = props.thigh, L2 = props.shin;
  let dx = target[0] - hip.x, dy = target[1] - hip.y;
  let d = Math.hypot(dx, dy);
  const maxD = (L1 + L2) * 0.9995, minD = Math.abs(L1 - L2) + 1;
  d = clamp(d, minD, maxD);
  const theta = Math.atan2(dx, -dy) / DEG; // angle of hip->target from "down"
  const cosA = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
  const cosB = clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1);
  const alpha = Math.acos(cosA) / DEG;
  const beta = Math.acos(cosB) / DEG;
  const hipAbs = theta + alpha;
  const knee = 180 - beta;
  const shinAbs = hipAbs - knee;
  out[0] = hipAbs - pelvisAngle(pose);
  out[1] = knee;
  out[2] = footRot - shinAbs; // keep the foot at footRot in absolute space (0 = flat)
  return out;
}

/** Applies anatomical limits in place. */
export function applyLimits(pose) {
  const L = JOINT_LIMITS;
  pose.lean = clamp(pose.lean, L.lean[0], L.lean[1]);
  pose.chest = clamp(pose.chest, L.chest[0], L.chest[1]);
  pose.neck = clamp(pose.neck, L.neck[0], L.neck[1]);
  pose.head = clamp(pose.head, L.head[0], L.head[1]);
  for (const k of ['fa', 'ba']) {
    const a = pose[k];
    a[0] = clamp(a[0], L.sh[0], L.sh[1]);
    a[1] = clamp(a[1], L.el[0], L.el[1]);
    a[2] = clamp(a[2], L.wr[0], L.wr[1]);
  }
  for (const k of ['fl', 'bl']) {
    const a = pose[k];
    a[0] = clamp(a[0], L.hip[0], L.hip[1]);
    a[1] = clamp(a[1], L.knee[0], L.knee[1]);
    a[2] = clamp(a[2], L.ankle[0], L.ankle[1]);
  }
  return pose;
}

/**
 * Converts an authored (base-proportion) pose into a fighter-specific pose: scales positional values,
 * solves leg IK where foot targets are given, and clamps joints. Output keeps `ff`/`bf` (scaled) so
 * two IK poses can later be blended in target space (keeps feet planted during blends).
 */
export function resolvePose(raw, props, out = emptyPose()) {
  const s = props.posScale;
  out.x = (raw.x ?? 0) * s;
  out.y = (raw.y ?? 112) * s;
  out.rot = raw.rot ?? 0;
  out.lean = raw.lean ?? 0;
  out.chest = raw.chest ?? 0;
  out.neck = raw.neck ?? 0;
  out.head = raw.head ?? 0;
  for (const k of LIMBS) {
    const src = raw[k] || [0, 0, 0];
    out[k][0] = src[0]; out[k][1] = src[1]; out[k][2] = src[2] ?? 0;
  }
  // Authored foot targets use y = 8 for "sole on the floor"; map that to this fighter's ankle height.
  const fy = (y) => (y - BASE_PROPORTIONS.ankleH) * s + props.ankleH;
  out.ff = raw.ff ? [raw.ff[0] * s, fy(raw.ff[1]), raw.ff[2] ?? 0] : null;
  out.bf = raw.bf ? [raw.bf[0] * s, fy(raw.bf[1]), raw.bf[2] ?? 0] : null;
  return finalizePose(out, props);
}

/** Solves IK for legs that carry foot targets, then clamps. */
export function finalizePose(pose, props) {
  if (pose.ff) solveLegIK(pose, props, 1, pose.ff, pose.ff[2], pose.fl);
  if (pose.bf) solveLegIK(pose, props, -1, pose.bf, pose.bf[2], pose.bl);
  return applyLimits(pose);
}

/** Blends two resolved poses. Feet that are IK-driven in both poses are blended in target space. */
export function blendPoses(a, b, t, props, out = emptyPose()) {
  out.x = lerp(a.x, b.x, t);
  out.y = lerp(a.y, b.y, t);
  out.rot = lerpAngle(a.rot, b.rot, t);
  out.lean = lerp(a.lean, b.lean, t);
  out.chest = lerp(a.chest, b.chest, t);
  out.neck = lerp(a.neck, b.neck, t);
  out.head = lerp(a.head, b.head, t);
  for (const k of LIMBS) {
    for (let i = 0; i < 3; i++) out[k][i] = lerp(a[k][i], b[k][i], t);
  }
  out.ff = a.ff && b.ff ? [lerp(a.ff[0], b.ff[0], t), lerp(a.ff[1], b.ff[1], t), lerp(a.ff[2], b.ff[2], t)] : null;
  out.bf = a.bf && b.bf ? [lerp(a.bf[0], b.bf[0], t), lerp(a.bf[1], b.bf[1], t), lerp(a.bf[2], b.bf[2], t)] : null;
  return finalizePose(out, props);
}

/** Mirrors lead/rear limbs (stance switch). */
export function swapStance(pose) {
  [pose.fa, pose.ba] = [pose.ba, pose.fa];
  [pose.fl, pose.bl] = [pose.bl, pose.fl];
  [pose.ff, pose.bf] = [pose.bf, pose.ff];
  return pose;
}

const add = (p, d, len) => ({ x: p.x + d.x * len, y: p.y + d.y * len });

/**
 * Forward kinematics. Returns joint positions (local fighter space) and absolute segment angles.
 */
export function computeSkeleton(pose, props) {
  const j = {};
  const a = {};
  const P = { x: pose.x, y: pose.y };
  j.pelvis = P;
  a.pelvis = pelvisAngle(pose);
  a.spine = pose.rot - pose.lean;
  a.chest = a.spine - pose.chest;
  a.neck = a.chest - pose.neck * 0.6;
  a.head = a.neck - pose.head;

  j.waist = add(P, dirUp(a.spine), props.torso * props.waistFrac);
  j.neck = add(j.waist, dirUp(a.chest), props.torso * (1 - props.waistFrac));
  j.headBase = add(j.neck, dirUp(a.neck), props.neck);
  j.head = add(j.headBase, dirUp(a.head), props.headR * 0.95);

  // Shoulders sit slightly below the neck base, spread along the chest's forward axis for depth.
  const chestDown = dirDown(a.chest);
  const chestFwd = dirFwd(a.chest);
  const shoulderBase = add(j.neck, chestDown, props.shoulderDrop);
  j.shoulderF = add(shoulderBase, chestFwd, props.shoulderSpread);
  j.shoulderB = add(shoulderBase, chestFwd, -props.shoulderSpread);

  for (const [k, side] of [['fa', 'F'], ['ba', 'B']]) {
    const [sh, el, wr] = pose[k];
    const ua = a.chest + sh;
    const fa = ua + el;
    const ha = fa + wr;
    a['upperArm' + side] = ua;
    a['foreArm' + side] = fa;
    a['hand' + side] = ha;
    j['elbow' + side] = add(j['shoulder' + side], dirDown(ua), props.upperArm);
    j['wrist' + side] = add(j['elbow' + side], dirDown(fa), props.foreArm);
    j['hand' + side] = add(j['wrist' + side], dirDown(ha), props.hand);
  }

  for (const [k, side, s] of [['fl', 'F', 1], ['bl', 'B', -1]]) {
    const [hip, knee, ankle] = pose[k];
    const hipJ = hipJoint(pose, props, s);
    const th = a.pelvis + hip;
    const sn = th - knee;
    const ft = sn + ankle;
    a['thigh' + side] = th;
    a['shin' + side] = sn;
    a['foot' + side] = ft;
    j['hip' + side] = hipJ;
    j['knee' + side] = add(hipJ, dirDown(th), props.thigh);
    j['ankle' + side] = add(j['knee' + side], dirDown(sn), props.shin);
    const fd = dirFwd(ft);
    // Toe/heel sit on the sole plane, which is ankleH below the ankle along the shin's "down".
    const sole = add(j['ankle' + side], dirDown(ft), props.ankleH);
    j['toe' + side] = add(sole, fd, props.foot - props.heel);
    j['heel' + side] = add(sole, fd, -props.heel);
  }
  return { j, a };
}

/** Lowest point of the body (used to keep lying / landing poses out of the floor). */
export function lowestPoint(skel) {
  let min = Infinity;
  for (const k in skel.j) {
    const y = skel.j[k].y;
    if (y < min) min = y;
  }
  return min;
}

/** Segment masses (fractions of body mass) for the centre-of-gravity estimate. */
const SEGMENT_MASS = [
  ['head', 'headBase', 0.08],
  ['pelvis', 'waist', 0.25],
  ['waist', 'neck', 0.25],
  ['shoulderF', 'elbowF', 0.028], ['elbowF', 'handF', 0.022],
  ['shoulderB', 'elbowB', 0.028], ['elbowB', 'handB', 0.022],
  ['hipF', 'kneeF', 0.1], ['kneeF', 'ankleF', 0.045], ['ankleF', 'toeF', 0.015],
  ['hipB', 'kneeB', 0.1], ['kneeB', 'ankleB', 0.045], ['ankleB', 'toeB', 0.015],
];

export function centerOfGravity(skel) {
  let x = 0, y = 0, m = 0;
  for (const [p, q, w] of SEGMENT_MASS) {
    const A = skel.j[p], B = skel.j[q];
    x += (A.x + B.x) * 0.5 * w;
    y += (A.y + B.y) * 0.5 * w;
    m += w;
  }
  return { x: x / m, y: y / m };
}

/** Converts a local-space point to world space. */
export const toWorld = (pt, fx, fy, facing) => ({ x: fx + pt.x * facing, y: fy + pt.y });
