import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fightingMatch, run, raw, place } from './helpers.js';
import { STAGE } from '../src/config/constants.js';
import { lowestPoint } from '../src/anim/skeleton.js';
import { AIController } from '../src/ai/aiController.js';

test('jump: leaves the ground, lands again, never below the floor', () => {
  const m = fightingMatch();
  const f = m.fighters[0];
  let maxY = 0, airborne = 0;
  run(m, 90, (i) => {
    if (f.body.y < -1e-9) assert.fail(`fell through floor: ${f.body.y}`);
    maxY = Math.max(maxY, f.body.y);
    if (!f.body.onGround) airborne++;
    return [raw({ up: i < 3 }), raw()];
  });
  assert.ok(maxY > 100, `jump apex ${maxY}`);
  assert.ok(airborne > 25 && airborne < 50, `airtime ${airborne}`);
  assert.equal(f.body.y, 0);
  assert.ok(['idle', 'land'].includes(f.state), f.state);
});

test('jump: repeated jumps are stable (same apex and airtime)', () => {
  const m = fightingMatch();
  const f = m.fighters[0];
  const results = [];
  for (let k = 0; k < 4; k++) {
    let apex = 0, air = 0;
    run(m, 70, (i) => {
      apex = Math.max(apex, f.body.y);
      if (!f.body.onGround) air++;
      return [raw({ up: i < 2 }), raw()];
    });
    results.push([apex.toFixed(3), air]);
  }
  for (const r of results) assert.deepEqual(r, results[0]);
});

test('no body part sinks below the floor in any state (AI vs AI, all fighters)', () => {
  const ids = ['brick', 'rattigan', 'smiles', 'jax', 'vellaro', 'roxy', 'bruno', 'jaguar'];
  for (let k = 0; k < ids.length; k++) {
    const m = fightingMatch({ p1: ids[k], p2: ids[(k + 3) % ids.length] });
    const ai = [new AIController(0, { level: 'hard', seed: k }), new AIController(1, { level: 'hard', seed: 50 + k })];
    for (let t = 0; t < 1500; t++) {
      m.tick([ai[0].input(m), ai[1].input(m)]);
      for (const f of m.fighters) {
        assert.ok(f.body.y >= 0, 'body below floor');
        const low = lowestPoint(f.skel) + f.body.y;
        assert.ok(low >= -0.5, `${f.def.id} ${f.state} part below floor: ${low}`);
      }
    }
  }
});

test('pushboxes: walking into each other never interpenetrates', () => {
  const m = fightingMatch();
  place(m, 900, 1000);
  const [a, b] = m.fighters;
  run(m, 120, () => {
    return [raw({ right: true }), raw({ left: true })];
  });
  const minGap = a.body.pushW + b.body.pushW;
  assert.ok(Math.abs(a.body.x - b.body.x) >= minGap - 1e-6, `gap ${Math.abs(a.body.x - b.body.x)} < ${minGap}`);
});

test('pushboxes: a faster/heavier walker pushes the other back, both stay separated every tick', () => {
  const m = fightingMatch({ p1: 'brick', p2: 'roxy' });
  place(m, 900, 980);
  const [a, b] = m.fighters;
  run(m, 200, () => {
    const gap = Math.abs(a.body.x - b.body.x);
    assert.ok(gap >= a.body.pushW + b.body.pushW - 1e-6);
    return [raw({ right: true }), raw()];
  });
  assert.ok(b.body.x > 980, 'opponent was pushed');
});

test('walls: fighters cannot leave the stage nor get stuck when pushed into the corner', () => {
  const m = fightingMatch();
  place(m, STAGE.left + 120, STAGE.left + 200);
  const [a, b] = m.fighters;
  run(m, 200, () => [raw({ left: true }), raw({ left: true })]);
  assert.ok(a.body.x >= STAGE.left + a.body.pushW - 1e-6);
  assert.ok(b.body.x - a.body.x >= a.body.pushW + b.body.pushW - 1e-6, 'separated in the corner');
  // the cornered fighter can still walk out once the other leaves
  run(m, 60, () => [raw({ right: true }), raw({ right: true })]);
  assert.ok(a.body.x > STAGE.left + a.body.pushW + 30, 'walked out of the corner');
});

test('cross-up: jumping over a cornered opponent ends on the other side, no overlap', () => {
  const m = fightingMatch();
  place(m, STAGE.left + 260, STAGE.left + 60);
  const [a, b] = m.fighters;
  // a faces left toward b in the corner; jump forward over him
  run(m, 70, (i) => [raw({ up: i < 2, left: i < 2 }), raw()]);
  run(m, 20);
  const gap = Math.abs(a.body.x - b.body.x);
  assert.ok(gap >= a.body.pushW + b.body.pushW - 1e-6, `overlap after landing: ${gap}`);
  assert.ok(a.body.x >= STAGE.left + a.body.pushW - 1e-6 && b.body.x >= STAGE.left + b.body.pushW - 1e-6);
});

test('separation limit keeps both fighters on camera', () => {
  const m = fightingMatch();
  const [a, b] = m.fighters;
  run(m, 400, () => [raw({ left: true }), raw({ right: true })]);
  assert.ok(Math.abs(a.body.x - b.body.x) <= 860 + 1e-6);
});
