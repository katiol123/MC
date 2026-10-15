import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fightingMatch, run, raw, place } from './helpers.js';
import { TAUNTS, TAUNT_FRAMES, TAUNT_METER } from '../src/data/taunts.js';
import { ROSTER } from '../src/data/fighters.js';
import { showboatChance } from '../src/ai/aiController.js';
import { TUNING } from '../src/config/tuning.js';

const dizzy = (f) => f.setState('dizzy', { duration: TUNING.dizzyFrames }, 'dizzy', { blend: 0 });

test('every fighter has a 1.5 s showboat', () => {
  assert.equal(TAUNT_FRAMES, 90);
  for (const f of ROSTER) {
    const t = TAUNTS[f.id];
    assert.ok(t, f.id);
    assert.ok(t.keys[t.keys.length - 1][0] <= TAUNT_FRAMES, `${f.id} keys fit`);
  }
});

test('showboat only works on a dizzy opponent; completed it pays meter', () => {
  const m = fightingMatch();
  place(m, 800, 1000);
  const [a, b] = m.fighters;
  run(m, 2, (i) => [raw({ taunt: i === 0 }), raw()]);
  assert.notEqual(a.state, 'taunt', 'no showboat to a fighter who is not dizzy');
  run(m, 20);
  dizzy(b);
  b.sd.duration = 400; // keep the rival out of it
  const meter = a.meter;
  const ev = run(m, TAUNT_FRAMES + 4, (i) => [raw({ taunt: i === 0 }), raw()]);
  assert.ok(ev.some((e) => e.type === 'taunt' && e.who === 0));
  assert.ok(ev.some((e) => e.type === 'tauntDone' && e.who === 0));
  assert.equal(a.meter, Math.min(100, meter + TAUNT_METER));
  assert.equal(a.state, 'idle');
});

test('a hit during the showboat is a counter hit and humbles the show-off', () => {
  const m = fightingMatch();
  place(m, 800, 900);
  const [a, b] = m.fighters;
  dizzy(b);
  run(m, 3, (i) => [raw({ taunt: i === 0 }), raw()]);
  assert.equal(a.state, 'taunt');
  b.setState('idle', {}, 'idle', { blend: 0 }); // the rival wakes up early
  const ev = run(m, 40, (i) => [raw(), raw({ hp: i === 0 })]);
  const hit = ev.find((e) => e.type === 'hit' && e.target === 0);
  assert.ok(hit, 'rival lands the hit');
  assert.ok(hit.counter, 'counter hit');
  assert.ok(ev.some((e) => e.type === 'tauntBroken' && e.who === 0));
  assert.ok(!ev.some((e) => e.type === 'tauntDone'));
});

test('showboat chance grows with the health lead and morale, cunning lowers it', () => {
  const m = fightingMatch();
  const [a, b] = m.fighters;
  const at = (hpA, hpB, morale, ai = {}) => {
    a.health = a.maxHealth * hpA; b.health = b.maxHealth * hpB;
    a.def = { ...a.def, cond: { morale, stamina: 75 }, ai: { ...a.def.ai, ...ai } };
    return showboatChance(a, b);
  };
  assert.ok(at(1, 0.3, 75) > at(0.5, 0.5, 75));
  assert.ok(at(0.8, 0.5, 95) > at(0.8, 0.5, 40));
  assert.ok(at(0.8, 0.5, 75, { cunning: 0.9 }) < at(0.8, 0.5, 75, { cunning: 0.1 }));
  assert.ok(at(0.8, 0.5, 75, { aggression: 0.9 }) > at(0.8, 0.5, 75, { aggression: 0.1 }));
});
