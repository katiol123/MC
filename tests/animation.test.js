import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProportions, computeSkeleton, resolvePose, solveLegIK, JOINT_LIMITS, emptyPose } from '../src/anim/skeleton.js';
import { STANCE, CROUCH } from '../src/anim/poses.js';
import { ROSTER, buildFighterDef } from '../src/data/fighters.js';
import { Fighter } from '../src/fighter/fighter.js';
import { fightingMatch } from './helpers.js';
import { AIController } from '../src/ai/aiController.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('IK plants the feet exactly on their targets', () => {
  for (const r of ROSTER) {
    const pr = buildProportions(r.body);
    for (const raw of [STANCE, CROUCH]) {
      const pose = resolvePose(raw, pr);
      const sk = computeSkeleton(pose, pr);
      assert.ok(Math.abs(sk.j.ankleF.x - pose.ff[0]) < 0.5 && Math.abs(sk.j.ankleF.y - pose.ff[1]) < 0.5, `${r.id} front foot`);
      assert.ok(Math.abs(sk.j.ankleB.x - pose.bf[0]) < 0.5 && Math.abs(sk.j.ankleB.y - pose.bf[1]) < 0.5, `${r.id} back foot`);
    }
  }
});

test('IK knees always bend forward (no inverted knees) and limits hold', () => {
  const pr = buildProportions({});
  for (let x = -60; x <= 60; x += 10) {
    const pose = emptyPose();
    pose.y = 110;
    const out = solveLegIK(pose, pr, 1, [x, 8], 0);
    assert.ok(out[1] >= 0, 'knee bends the anatomical way');
  }
});

test('forward kinematics preserves bone lengths for arbitrary poses', () => {
  const pr = buildProportions({ height: 1.1, arms: 1.05 });
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 200; i++) {
    const p = emptyPose();
    p.rot = rnd() * 360; p.lean = rnd() * 60 - 20;
    for (const k of ['fa', 'ba', 'fl', 'bl']) p[k] = [rnd() * 200 - 50, rnd() * 150, rnd() * 40 - 20];
    const { j } = computeSkeleton(p, pr);
    for (const s of ['F', 'B']) {
      assert.ok(Math.abs(dist(j['shoulder' + s], j['elbow' + s]) - pr.upperArm) < 1e-6);
      assert.ok(Math.abs(dist(j['elbow' + s], j['wrist' + s]) - pr.foreArm) < 1e-6);
      assert.ok(Math.abs(dist(j['hip' + s], j['knee' + s]) - pr.thigh) < 1e-6);
      assert.ok(Math.abs(dist(j['knee' + s], j['ankle' + s]) - pr.shin) < 1e-6);
    }
  }
});

test('every attack animation respects joint limits and has no pose teleports', () => {
  for (const r of ROSTER) {
    const def = buildFighterDef(r.id);
    for (const id of Object.keys(def.moves)) {
      const f = new Fighter(def, 0, 1000, 1);
      const mv = def.moves[id];
      if (mv.stance === 'air') {
        // air attacks start from the jump pose
        f.body.onGround = false;
        f.body.y = 120;
        f.anim.play('jump', { blend: 0 });
        for (let k = 0; k < 10; k++) f.updatePose();
      }
      f.startMove(mv);
      let prev = null;
      const total = mv.startup + mv.active + mv.recovery;
      for (let t = 0; t < total; t++) {
        f.move.frame++;
        f.updatePose();
        const p = f.anim.pose;
        for (const k of ['fa', 'ba']) {
          assert.ok(p[k][1] >= JOINT_LIMITS.el[0] - 1e-9 && p[k][1] <= JOINT_LIMITS.el[1] + 1e-9, `${r.id} ${id} elbow`);
        }
        for (const k of ['fl', 'bl']) {
          assert.ok(p[k][1] >= JOINT_LIMITS.knee[0] - 1e-9 && p[k][1] <= JOINT_LIMITS.knee[1] + 1e-9, `${r.id} ${id} knee`);
        }
        if (prev) {
          for (const j in f.skel.j) {
            const d = dist(prev[j], f.skel.j[j]);
            // striking extremities may move fast (a jab covers its reach in ~3 frames, an uppercut sweeps
            // ~200px of arc in 5): limit 70px/tick. Torso/head joints (which also travel with whole-body
            // rotations such as somersaults and juggles) must stay under 50px/tick.
            const limit = /^(hand|wrist|toe|heel|ankle|elbow|knee)/.test(j) ? 75 : 50;
            assert.ok(d < limit, `${r.id} ${id} frame ${f.move.frame}: joint ${j} jumped ${d.toFixed(1)}px`);
          }
        }
        prev = Object.fromEntries(Object.entries(f.skel.j).map(([k, v]) => [k, { ...v }]));
      }
    }
  }
});

/** Joint positions relative to the pelvis with the whole-body rotation removed (pose "shape"). */
function shape(f) {
  const r = (-f.anim.pose.rot * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const p = f.skel.j.pelvis;
  const out = {};
  for (const [n, v] of Object.entries(f.skel.j)) {
    const x = v.x - p.x, y = v.y - p.y;
    out[n] = { x: x * c - y * s, y: x * s + y * c };
  }
  return out;
}

test('no pose teleports across state transitions during real fights', () => {
  // Whole-body motion (somersaults, juggle spins, getting up) is checked separately as pelvis
  // travel and rotation speed; the body *shape* must change smoothly.
  for (let k = 0; k < 4; k++) {
    const m = fightingMatch({ p1: ROSTER[k * 2].id, p2: ROSTER[k * 2 + 1].id });
    const ai = [new AIController(0, { level: 'hard', seed: 70 + k }), new AIController(1, { level: 'hard', seed: 80 + k })];
    let prev = [null, null];
    for (let t = 0; t < 1800; t++) {
      const round = m.round;
      m.tick([ai[0].input(m), ai[1].input(m)]);
      if (m.round !== round || (m.phase === 'intro' && m.phaseTick < 3)) prev = [null, null]; // new round: fighters are reset
      m.fighters.forEach((f, i) => {
        const cur = { shape: shape(f), pelvis: { ...f.skel.j.pelvis }, rot: f.anim.pose.rot, facing: f.facing };
        if (prev[i] && prev[i].facing === f.facing) {
          for (const n in cur.shape) {
            const d = dist(prev[i].shape[n], cur.shape[n]);
            const limit = /^(hand|wrist|toe|heel|ankle|elbow|knee)/.test(n) ? 75 : 40;
            assert.ok(d < limit, `${f.def.id} ${f.state} joint ${n} jumped ${d.toFixed(1)}px`);
          }
          assert.ok(dist(prev[i].pelvis, cur.pelvis) < 40, `${f.def.id} ${f.state} pelvis jumped`);
          const dr = Math.abs((((cur.rot - prev[i].rot) % 360) + 540) % 360 - 180);
          assert.ok(dr <= 60, `${f.def.id} ${f.state} rotated ${dr.toFixed(0)} deg in one tick`);
        }
        prev[i] = cur;
      });
    }
  }
});

test('feet stay planted while walking (no foot sliding during stance phase)', () => {
  const def = buildFighterDef('brick');
  const m = fightingMatch();
  const f = m.fighters[0];
  f.body.x = 800;
  let lastWorld = null, planted = 0, slid = 0;
  for (let t = 0; t < 120; t++) {
    m.tick([{ up: false, down: false, left: false, right: true, lp: false, hp: false, lk: false, hk: false, stance: false }, { up: false, down: false, left: false, right: false, lp: false, hp: false, lk: false, hk: false, stance: false }]);
    if (f.state !== 'walkF' || t < 20) { lastWorld = null; continue; }
    const wx = f.body.x + f.skel.j.ankleB.x * f.facing;
    const onGround = Math.abs(f.skel.j.ankleB.y - f.props.ankleH) < 0.05;
    if (lastWorld !== null && onGround) {
      planted++;
      if (Math.abs(wx - lastWorld) > 0.75) slid++;
    }
    lastWorld = onGround ? wx : null;
  }
  void def;
  assert.ok(planted > 20, `planted samples ${planted}`);
  assert.ok(slid / planted < 0.1, `foot slid on ${slid}/${planted} planted frames`);
});

test('layer order: a far limb is never drawn over the matching near limb (any attack, any stance)', async () => {
  const { ATTACK_POSES } = await import('../src/anim/attackPoses.js');
  const { FighterPainter } = await import('../src/render/fighterPainter.js');
  const def = buildFighterDef('jax');
  const painter = new FighterPainter(def);
  // Record the order in which limb groups are painted with a stub context.
  const order = [];
  const ctx = new Proxy({}, {
    get: (t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}),
    set: () => true,
  });
  for (const [name, fn] of [['drawArm', 'arm'], ['drawLeg', 'leg']]) {
    const orig = painter[name].bind(painter);
    painter[name] = (c, pass, J, A, side) => { if (pass === 'fill') order.push(fn + side); return orig(c, pass, J, A, side); };
  }
  const f = new Fighter(def, 0, 1000, 1);
  const SWAP = { fa: 'ba', ba: 'fa', fl: 'bl', bl: 'fl' };
  for (const [anim, ap] of Object.entries(ATTACK_POSES)) {
    for (const stance of [0, 1]) {
      let layers = ap.layers || null;
      if (layers && stance === 1) layers = Object.fromEntries(Object.entries(layers).map(([k, v]) => [SWAP[k], v]));
      order.length = 0;
      painter.draw(ctx, f.skel, { layers });
      assert.ok(order.indexOf('armB') < order.indexOf('armF'), `${anim} stance ${stance}: far arm over near arm`);
      assert.ok(order.indexOf('legB') < order.indexOf('legF'), `${anim} stance ${stance}: far leg over near leg`);
    }
  }
});
