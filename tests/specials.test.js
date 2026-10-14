import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fightingMatch, run, raw, place } from './helpers.js';
import { ROSTER } from '../src/data/fighters.js';
import { TUNING } from '../src/config/tuning.js';

const S4 = [{ down: true }, { down: true, left: true }, { left: true, hp: true }];
const SU = [{ down: true }, { down: true, right: true }, { right: true }, { down: true }, { down: true, right: true }, { right: true, hp: true }];
const p1seq = (seq, p2 = () => raw()) => (i) => [raw(seq[Math.floor(i / 2)] || {}), p2(i)];

test('throw: LP+LK at close range grabs, cannot be blocked, deals damage and knocks down', () => {
  const m = fightingMatch();
  place(m, 1000, 1075);
  const b = m.fighters[1];
  const ev = run(m, 80, (i) => [raw({ lp: i === 0, lk: i === 0 }), raw({ right: true })]); // P2 holds block
  assert.ok(ev.some((e) => e.type === 'grab'), 'grabbed through a guard');
  assert.ok(ev.some((e) => e.type === 'hit' && e.throw), 'throw released');
  assert.equal(b.health, b.maxHealth - 110);
  assert.ok(['knockdown', 'getup', 'idle'].includes(b.state));
});

test('throw tech: pressing LP+LK right after being grabbed escapes; airborne opponents cannot be thrown', () => {
  let m = fightingMatch();
  place(m, 1000, 1075);
  let ev = run(m, 60, (i) => [raw({ lp: i === 0, lk: i === 0 }), raw({ lp: i === 9, lk: i === 9 })]);
  assert.ok(ev.some((e) => e.type === 'tech'));
  assert.equal(m.fighters[1].health, m.fighters[1].maxHealth);
  m = fightingMatch();
  place(m, 1000, 1075);
  ev = run(m, 60, (i) => [raw({ lp: i === 4, lk: i === 4 }), raw({ up: i < 2 })]);
  assert.ok(!ev.some((e) => e.type === 'grab'), 'jumping opponent is not grabbed');
});

test('command grab (Bruno) cannot be teched', () => {
  const m = fightingMatch({ p1: 'bruno', p2: 'jax' });
  place(m, 1000, 1090);
  const ev = run(m, 90, p1seq(S4, (i) => raw({ lp: i > 6 && i < 30, lk: i > 6 && i < 30 })));
  assert.ok(ev.some((e) => e.type === 'grab'));
  assert.ok(!ev.some((e) => e.type === 'tech'));
  assert.ok(ev.some((e) => e.type === 'hit' && e.throw));
});

test('every fighter has a working signature special that connects in its intended range', () => {
  const range = { brick: 120, rattigan: 400, smiles: 150, jax: 400, roxy: 10, bruno: 10, jaguar: 150 };
  for (const r of ROSTER) {
    if (!(r.id in range)) continue; // vellaro: counter stance, tested separately
    const m = fightingMatch({ p1: r.id, p2: 'jax' });
    place(m, 800, 800 + range[r.id] + m.fighters[0].body.pushW + m.fighters[1].body.pushW);
    const ev = run(m, 100, p1seq(S4));
    assert.equal(ev.find((e) => e.type === 'attackStart')?.move, 's4', `${r.id} started s4`);
    assert.ok(ev.some((e) => e.type === 'hit'), `${r.id} s4 hit`);
  }
});

test('projectiles: one on screen per fighter, blockable, cancel each other', () => {
  // block
  let m = fightingMatch({ p1: 'rattigan', p2: 'jax' });
  place(m, 700, 1200);
  let ev = run(m, 100, p1seq(S4, () => raw({ right: true })));
  assert.ok(ev.some((e) => e.type === 'block' && String(e.move).startsWith('proj:')));
  // only one at a time: a second attempt while the coin flies does not throw another
  m = fightingMatch({ p1: 'rattigan', p2: 'jax' });
  place(m, 300, 1100);
  ev = run(m, 40, p1seq([...S4, {}, {}, ...S4]));
  assert.equal(ev.filter((e) => e.type === 'projectile').length, 1);
  // projectile vs projectile
  m = fightingMatch({ p1: 'rattigan', p2: 'jax' });
  place(m, 700, 1300);
  ev = run(m, 100, (i) => [raw(S4[Math.floor(i / 2)] || {}), raw([{ down: true }, { down: true, right: true }, { right: true, hp: true }][Math.floor(i / 2)] || {})]);
  assert.ok(ev.some((e) => e.type === 'clash'), 'coin and wave cancel out');
  assert.equal(m.fighters[0].health, m.fighters[0].maxHealth);
  assert.equal(m.fighters[1].health, m.fighters[1].maxHealth);
});

test('counter stance (Vellaro) parries mids and punishes, but loses to lows', () => {
  let m = fightingMatch({ p1: 'vellaro', p2: 'jax' });
  place(m, 1000, 1110);
  let ev = run(m, 90, p1seq(S4, (i) => raw({ hp: i === 8 })));
  assert.ok(ev.some((e) => e.type === 'parry'));
  assert.ok(ev.filter((e) => e.type === 'hit' && e.who === 0).length >= 2, 'follow-up combo hits');
  m = fightingMatch({ p1: 'vellaro', p2: 'jax' });
  place(m, 1000, 1110);
  ev = run(m, 90, p1seq(S4, (i) => raw({ down: true, lk: i === 8 })));
  assert.ok(!ev.some((e) => e.type === 'parry'));
  assert.ok(ev.some((e) => e.type === 'hit' && e.who === 1));
});

test('supers: need a full bar, freeze the action, hit with every step for every fighter', () => {
  for (const r of ROSTER) {
    const m = fightingMatch({ p1: r.id, p2: 'brick' });
    place(m, 800, 880);
    const f = m.fighters[0];
    // without meter: the motion gives the normal special instead
    let ev = run(m, 40, p1seq(SU));
    assert.ok(!ev.some((e) => e.type === 'superStart'), `${r.id}: no super without meter`);
    run(m, 120);
    place(m, 800, 880);
    f.meter = 100;
    let froze = 0;
    ev = run(m, 260, (i) => { if (m.freeze) froze++; return p1seq(SU)(i); });
    assert.ok(ev.some((e) => e.type === 'superStart'), `${r.id}: super started`);
    assert.ok(froze >= TUNING.superFreeze - 1, `${r.id}: cinematic freeze`);
    const steps = f.def.moves.su.steps.filter((s) => s.spec).length;
    const hits = ev.filter((e) => e.type === 'hit' && e.who === 0 && e.super).length;
    assert.equal(hits, steps, `${r.id}: ${hits}/${steps} super hits connected`);
    if (r.id === 'bruno') assert.ok(ev.filter((e) => e.type === 'hit' && e.super).every((e) => e.prop === 'pan'), 'Bruno hits with the frying pan');
  }
});

test('anti-spam: a super costs the whole bar and blocks meter gain during the cooldown', () => {
  const m = fightingMatch({ p1: 'jax', p2: 'brick' });
  place(m, 800, 880);
  const f = m.fighters[0];
  f.meter = 100;
  run(m, 200, p1seq(SU));
  assert.equal(f.meter, 0);
  assert.ok(f.superLock > 0);
  // hitting during the cooldown does not refill the bar
  place(m, 800, 880);
  run(m, 30, (i) => [raw({ hp: i === 0 }), raw()]);
  assert.equal(f.meter, 0, 'no meter while the super cooldown runs');
  // a second super attempt right away is impossible
  const ev = run(m, 40, p1seq(SU));
  assert.ok(!ev.some((e) => e.type === 'superStart'));
  // after the cooldown, meter builds again from normal hits
  f.superLock = 0;
  place(m, 800, 880);
  run(m, 30, (i) => [raw({ hp: i === 0 }), raw()]);
  assert.ok(f.meter > 0 && f.meter < 100);
});

test('meter builds from dealing and taking damage, but slowly (about one super per round)', () => {
  const m = fightingMatch({ p1: 'brick', p2: 'jax' });
  place(m, 1000, 1110);
  const [a, b] = m.fighters;
  run(m, 40, (i) => [raw({ hp: i === 0 }), raw()]);
  assert.ok(a.meter > 0 && b.meter > 0);
  // dealing a full health bar of damage is roughly what one super costs
  assert.ok(TUNING.meterOnHit * 1000 >= 80 && TUNING.meterOnHit * 1000 <= 120);
});
