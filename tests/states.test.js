import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fightingMatch, run, raw, place } from './helpers.js';

test('whiffed attack lasts exactly startup + active + recovery frames', () => {
  const m = fightingMatch();
  place(m, 600, 1400);
  const f = m.fighters[0];
  for (const id of ['lp', 'hp', 'lk', 'hk']) {
    place(m, 600, 1400);
    const mv = f.def.moves[id];
    run(m, 1, (i) => [raw({ [mv.button]: true }), raw()]);
    let n = 1;
    while (f.state === 'attack') { run(m, 1); n++; }
    assert.equal(n, mv.startup + mv.active + mv.recovery, `${id}`);
    run(m, 5);
  }
});

test('holding a button does not repeat the attack', () => {
  const m = fightingMatch();
  place(m, 600, 1400);
  const ev = run(m, 90, () => [raw({ lp: true }), raw()]);
  assert.equal(ev.filter((e) => e.type === 'attackStart').length, 1);
});

test('input buffer: a press shortly before recovery ends comes out on the first free frame', () => {
  const m = fightingMatch();
  place(m, 600, 1400);
  const f = m.fighters[0];
  const mv = f.def.moves.lp;
  const total = mv.startup + mv.active + mv.recovery;
  const ev = run(m, 40, (i) => [raw({ lp: i === 0, lk: i === total - 3 }), raw()]);
  const starts = ev.filter((e) => e.type === 'attackStart');
  assert.equal(starts.length, 2);
  assert.equal(starts[1].at - starts[0].at, total, 'buffered kick starts right after the jab');
});

test('motion inputs: 236P, 623P and 214K produce the special moves', () => {
  const cases = [
    ['s1', [{ down: true }, { down: true, right: true }, { right: true, lp: true }]],
    ['s2', [{ right: true }, { down: true }, { down: true, right: true, hp: true }]],
    ['s3', [{ down: true }, { down: true, left: true }, { left: true, hk: true }]],
  ];
  for (const [id, seq] of cases) {
    const m = fightingMatch();
    place(m, 600, 1400);
    const ev = run(m, 12, (i) => [raw(seq[Math.floor(i / 2)] || {}), raw()]);
    const s = ev.find((e) => e.type === 'attackStart');
    assert.ok(s, `${id} started`);
    assert.equal(s.move, id);
  }
});

test('movement states: walk, crouch, jump, land, dash, run, guard', () => {
  const m = fightingMatch();
  place(m, 800, 1300);
  const f = m.fighters[0];
  run(m, 10, () => [raw({ right: true }), raw()]);
  assert.equal(f.state, 'walkF');
  assert.ok(f.body.vx > 0);
  run(m, 10, () => [raw({ left: true }), raw()]);
  assert.equal(f.state, 'walkB');
  run(m, 5, () => [raw({ down: true }), raw()]);
  assert.equal(f.state, 'crouch');
  run(m, 2, () => [raw({ up: true }), raw()]);
  assert.equal(f.state, 'prejump');
  run(m, 8);
  assert.equal(f.state, 'jump');
  let landed = false;
  run(m, 60, () => { if (f.state === 'land') landed = true; return [raw(), raw()]; });
  assert.ok(landed && f.state === 'idle');
  // dash = forward, release, forward
  run(m, 6, (i) => [raw({ right: i === 0 || i >= 2 }), raw()]);
  assert.equal(f.state, 'dashF');
  run(m, 20, () => [raw({ right: true }), raw()]);
  assert.equal(f.state, 'run', 'holding forward after a dash turns into a run');
  run(m, 20);
  assert.equal(f.state, 'idle');
});

test('proximity guard: holding back while the opponent attacks shows a guard, not a walk', () => {
  const m = fightingMatch();
  place(m, 1000, 1150);
  const f = m.fighters[0];
  let guard = false;
  run(m, 14, (i) => { if (f.state === 'guardHigh') guard = true; return [raw({ left: true }), raw({ hk: i === 0 })]; });
  assert.ok(guard);
});

test('stance switch mirrors lead limbs and moves the jab hitbox to the other arm', () => {
  const m = fightingMatch();
  place(m, 1000, 1400);
  const f = m.fighters[0];
  run(m, 3, (i) => [raw({ stance: i === 0 }), raw()]);
  assert.equal(f.stance, 1);
  run(m, 1, () => [raw({ lp: true }), raw()]);
  run(m, f.def.moves.lp.startup);
  assert.ok(f.hitboxes.length > 0);
  const hand = f.skel.j.handB;
  const hb = f.hitboxes[f.hitboxes.length - 1].b;
  assert.ok(Math.abs(hb.x - (f.body.x + hand.x * f.facing)) < 1e-6, 'hitbox follows the (now leading) rear-side arm');
});

test('knockdown -> getup -> idle, invulnerable while down', () => {
  const m = fightingMatch();
  place(m, 1000, 1100);
  const b = m.fighters[1];
  run(m, 30, (i) => [raw({ down: true, hk: i === 1 }), raw()]);
  const seen = new Set();
  run(m, 160, () => { seen.add(b.state); if (b.state === 'knockdown') assert.equal(b.invulnerability(), 'all'); return [raw(), raw()]; });
  for (const s of ['knockdown', 'getup']) assert.ok(seen.has(s), `saw ${s}`);
  assert.equal(b.state, 'idle');
});

test('stun meter: a full dizzy meter puts the defender into the dizzy state after hitstun', () => {
  const m = fightingMatch();
  place(m, 1000, 1100);
  const b = m.fighters[1];
  b.stun = b.stats.stunMax - 1;
  const ev = run(m, 60, (i) => [raw({ hp: i === 0 }), raw()]);
  assert.ok(ev.some((e) => e.type === 'dizzy'), 'dizzy event');
  assert.equal(b.state, 'dizzy');
  run(m, 200);
  assert.notEqual(b.state, 'dizzy', 'recovers from dizzy');
});
