// Builds collision volumes from the skeleton every tick.
//   Hurtboxes: capsules on head / torso / limbs (where the fighter can be hit)
//   Hitboxes:  capsules attached to joints listed in the move data, only during active frames
// Volumes are in world space. They depend on the simulated pose, never on rendering.

const swapSide = (name) => name.replace(/F$/, '#').replace(/B$/, 'F').replace(/#$/, 'B');

function w(fx, fy, facing, p) {
  return { x: fx + p.x * facing, y: fy + p.y };
}

export function buildHurtboxes(fighter) {
  const { j } = fighter.skel;
  const pr = fighter.props;
  const { x, y } = fighter.body;
  const f = fighter.facing;
  const W = (p) => w(x, y, f, p);
  const cap = (a, b, r, part, name) => ({ a: W(j[a]), b: W(j[b]), r, part, name });
  const head = W(j.head);
  const boxes = [
    { a: head, b: head, r: pr.headR * 1.08, part: 'head', name: 'head' },
    cap('pelvis', 'neck', pr.chestW * 0.78, 'torso', 'torso'),
    cap('shoulderF', 'elbowF', pr.rUpperArm[0], 'limb', 'upperArmF'),
    cap('elbowF', 'handF', pr.rForeArm[0], 'limb', 'foreArmF'),
    cap('shoulderB', 'elbowB', pr.rUpperArm[0], 'limb', 'upperArmB'),
    cap('elbowB', 'handB', pr.rForeArm[0], 'limb', 'foreArmB'),
    cap('hipF', 'kneeF', pr.rThigh[0] * 0.9, 'limb', 'thighF'),
    cap('kneeF', 'ankleF', pr.rShin[0], 'limb', 'shinF'),
    cap('hipB', 'kneeB', pr.rThigh[0] * 0.9, 'limb', 'thighB'),
    cap('kneeB', 'ankleB', pr.rShin[0], 'limb', 'shinB'),
  ];
  return boxes;
}

/** Hitboxes of the current move on its current frame (empty outside the active window). */
export function buildHitboxes(fighter) {
  const mv = fighter.move;
  if (!mv) return [];
  const m = mv.def;
  const f = mv.frame;
  if (f <= m.startup || f > m.startup + m.active) return [];
  const { j } = fighter.skel;
  const { x, y } = fighter.body;
  const W = (p) => w(x, y, fighter.facing, p);
  const local = f - m.startup; // 1..active
  const out = [];
  for (const hb of m.hitboxes) {
    if (hb.from && local < hb.from) continue;
    if (hb.to && local > hb.to) continue;
    const an = fighter.stance === 1 ? swapSide(hb.a) : hb.a;
    const bn = fighter.stance === 1 ? swapSide(hb.b || hb.a) : hb.b || hb.a;
    out.push({ a: W(j[an]), b: W(j[bn]), r: hb.r * (fighter.props.posScale ** 0.5) });
  }
  return out;
}
