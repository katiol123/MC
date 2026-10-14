import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FixedStepLoop } from '../src/core/loop.js';
import { Match } from '../src/game/match.js';
import { AIController } from '../src/ai/aiController.js';

test('fixed step: number of ticks does not depend on render rate', () => {
  for (const hz of [30, 50, 60, 75, 120, 144, 240]) {
    const loop = new FixedStepLoop();
    let ticks = 0;
    const frames = Math.round(hz * 2);
    for (let i = 0; i < frames; i++) loop.advance(1000 / hz, () => ticks++);
    assert.ok(Math.abs(ticks - 120) <= 1, `${hz} Hz produced ${ticks} ticks in 2 s`);
  }
});

test('fixed step: alpha stays in [0,1] and a huge frame is clamped', () => {
  const loop = new FixedStepLoop();
  let ticks = 0;
  loop.advance(5000, () => ticks++);
  assert.ok(ticks <= 8, 'spiral of death is prevented');
  for (let i = 0; i < 50; i++) {
    loop.advance(7.3, () => {});
    assert.ok(loop.alpha >= 0 && loop.alpha <= 1);
  }
});

function simulate(hz, seconds = 25) {
  const m = new Match({ p1: 'rattigan', p2: 'bruno', roundsToWin: 2 });
  const ai = [new AIController(0, { level: 'hard', seed: 3 }), new AIController(1, { level: 'normal', seed: 9 })];
  const loop = new FixedStepLoop();
  const frames = Math.round(hz * seconds);
  for (let i = 0; i < frames; i++) loop.advance(1000 / hz, () => m.tick([ai[0].input(m), ai[1].input(m)]));
  return { frame: m.frame, state: m.fighters.map((f) => [f.body.x.toFixed(4), f.body.y.toFixed(4), f.health, f.state]) };
}

test('fixed step: the whole fight is identical at 30, 60 and 144 Hz rendering', () => {
  const a = simulate(30), b = simulate(60), c = simulate(144);
  // compare the simulation at the same tick count
  const n = Math.min(a.frame, b.frame, c.frame);
  const at = (hz) => {
    const m = new Match({ p1: 'rattigan', p2: 'bruno', roundsToWin: 2 });
    const ai = [new AIController(0, { level: 'hard', seed: 3 }), new AIController(1, { level: 'normal', seed: 9 })];
    const loop = new FixedStepLoop();
    while (m.frame < n) loop.advance(1000 / hz, () => { if (m.frame < n) m.tick([ai[0].input(m), ai[1].input(m)]); });
    return JSON.stringify(m.fighters.map((f) => [f.body.x, f.body.y, f.health, f.state, f.stateFrame]));
  };
  const s30 = at(30), s60 = at(60), s144 = at(144);
  assert.equal(s30, s60);
  assert.equal(s60, s144);
});
