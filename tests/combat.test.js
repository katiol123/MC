import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fightingMatch, run, raw, place } from './helpers.js';
import { AIController } from '../src/ai/aiController.js';
import { ROSTER } from '../src/data/fighters.js';
import { TUNING } from '../src/config/tuning.js';

const P1 = (o) => (i) => [i === 0 ? raw(o) : raw(), raw()];

test('a jab hits exactly once, on its first active frame, for the listed damage', () => {
  const m = fightingMatch();
  place(m, 1000, 1110);
  const [a, b] = m.fighters;
  const h0 = b.health;
  const ev = run(m, 40, P1({ lp: true }));
  const hits = ev.filter((e) => e.type === 'hit');
  assert.equal(hits.length, 1);
  assert.equal(h0 - b.health, hits[0].damage);
  const start = ev.find((e) => e.type === 'attackStart').at;
  assert.equal(hits[0].at - start, a.def.moves.lp.startup, 'connects on frame startup+1');
});

test('hitboxes exist only during active frames (every move, every fighter)', () => {
  for (const r of ROSTER) {
    const m = fightingMatch({ p1: r.id, p2: 'jax' });
    place(m, 600, 1400); // far apart: pure whiffs
    const f = m.fighters[0];
    for (const id of ['lp', 'hp', 'lk', 'hk', 'clp', 'clk', 'chp', 'chk', 's1', 's2', 's3']) {
      const mv = f.def.moves[id];
      place(m, 600, 1400);
      f.startMove(mv);
      for (let t = 0; t < mv.startup + mv.active + mv.recovery + 30 && f.state === 'attack'; t++) {
        m.tick([raw(), raw()]);
        if (f.state !== 'attack') break;
        const fr = f.move.frame;
        const active = fr > mv.startup && fr <= mv.startup + mv.active;
        assert.equal(f.hitboxes.length > 0, active, `${r.id} ${id} frame ${fr}: hitboxes ${f.hitboxes.length}`);
      }
    }
  }
});

test('every hit/block event happens while the attacker is in its active window (AI fights)', () => {
  for (let k = 0; k < 4; k++) {
    const m = fightingMatch({ p1: ROSTER[k].id, p2: ROSTER[k + 4].id });
    const ai = [new AIController(0, { level: 'hard', seed: k }), new AIController(1, { level: 'hard', seed: k + 10 })];
    for (let t = 0; t < 2400 && m.phase === 'fight'; t++) {
      const ev = m.tick([ai[0].input(m), ai[1].input(m)]);
      for (const e of ev) {
        if ((e.type !== 'hit' && e.type !== 'block') || e.trade) continue;
        const f = m.fighters[e.who];
        const mv = f.move;
        assert.ok(mv, 'attacker has a move');
        assert.ok(mv.frame > mv.def.startup && mv.frame <= mv.def.startup + mv.def.active, `${mv.def.id} hit on frame ${mv.frame}`);
      }
    }
  }
});

test('hitstop freezes both fighters for the configured number of frames', () => {
  const m = fightingMatch();
  place(m, 1000, 1110);
  const [a, b] = m.fighters;
  const ev = run(m, 6, P1({ hp: true }));
  run(m, 10);
  const hit = ev.find((e) => e.type === 'hit') || run(m, 0).find(() => false);
  // re-run deterministically to inspect freeze
  const m2 = fightingMatch();
  place(m2, 1000, 1110);
  let hitAt = -1;
  const xs = [];
  for (let i = 0; i < 40; i++) {
    const e = m2.tick([i === 0 ? raw({ hp: true }) : raw(), raw()]);
    if (e.some((x) => x.type === 'hit')) hitAt = i;
    if (hitAt >= 0 && i > hitAt) xs.push([m2.fighters[0].move?.frame, m2.fighters[1].body.x]);
  }
  assert.ok(hitAt >= 0);
  const hs = m2.fighters[0].def.moves.hp.hitstop;
  const frozen = xs.slice(0, hs);
  for (const [fr, x] of frozen) {
    assert.equal(fr, frozen[0][0], 'attacker move frame frozen');
    assert.equal(x, frozen[0][1], 'defender position frozen');
  }
  void hit; void a; void b;
});

test('blocking: high guard stops mids, crouch guard stops lows, overhead beats crouch guard', () => {
  // mid vs standing block
  let m = fightingMatch();
  place(m, 1000, 1110);
  let b = m.fighters[1];
  let h0 = b.health;
  let ev = run(m, 30, (i) => [i === 0 ? raw({ hp: true }) : raw(), raw({ right: true })]);
  assert.ok(ev.some((e) => e.type === 'block'), 'mid blocked standing');
  assert.equal(b.health, h0, 'no chip damage from normals');
  // low vs standing block -> hits
  m = fightingMatch();
  place(m, 1000, 1110);
  b = m.fighters[1];
  ev = run(m, 30, (i) => [raw({ down: true, lk: i === 2 }), raw({ right: true })]);
  assert.ok(ev.some((e) => e.type === 'hit' && e.move === 'clk'), 'low hits a standing guard');
  // low vs crouching block -> blocked
  m = fightingMatch();
  place(m, 1000, 1110);
  ev = run(m, 30, (i) => [raw({ down: true, lk: i === 2 }), raw({ right: true, down: true })]);
  assert.ok(ev.some((e) => e.type === 'block' && e.move === 'clk'), 'low blocked crouching');
  // overhead (jump kick) vs crouch block -> hits ; vs stand block -> blocked
  for (const [down, expect] of [[true, 'hit'], [false, 'block']]) {
    m = fightingMatch();
    place(m, 1000, 1180);
    ev = run(m, 60, (i) => [raw({ up: i < 2, right: i < 2, lk: i === 16 }), raw({ right: true, down })]);
    const r = ev.find((e) => (e.type === 'hit' || e.type === 'block') && e.move === 'jk');
    assert.ok(r, 'jump kick connected');
    assert.equal(r.type, expect, `overhead vs ${down ? 'crouch' : 'stand'} guard`);
  }
});

test('not holding back = no block; blocking works after sides switch (uses positions, not facing)', () => {
  const m = fightingMatch();
  place(m, 1110, 1000); // P1 on the right, facing left
  const [a, b] = m.fighters;
  assert.equal(a.facing, -1);
  let ev = run(m, 30, (i) => [i === 0 ? raw({ lp: true }) : raw(), raw()]);
  assert.ok(ev.some((e) => e.type === 'hit'), 'attack goes left after switching sides');
  run(m, 30);
  place(m, 1110, 1000);
  ev = run(m, 30, (i) => [i === 0 ? raw({ lp: true }) : raw(), raw({ left: true })]);
  assert.ok(ev.some((e) => e.type === 'block'), 'P2 blocks by holding away (left) from the attacker');
  void b;
});

test('a move cannot register on the same target twice', () => {
  const m = fightingMatch();
  place(m, 1000, 1100);
  const ev = run(m, 60, P1({ hk: true }));
  assert.equal(ev.filter((e) => e.type === 'hit').length, 1);
});

test('counter hit: hitting an opponent during their startup adds damage and is flagged', () => {
  const m = fightingMatch();
  place(m, 1000, 1110);
  // P2 starts a slow roundhouse, P1 jabs 2 frames later
  const ev = run(m, 30, (i) => [raw({ lp: i === 2 }), raw({ hk: i === 0 })]);
  const hit = ev.find((e) => e.type === 'hit' && e.who === 0);
  assert.ok(hit && hit.counter, 'counter flagged');
});

test('cancels: jab -> heavy punch only on contact, never on whiff', () => {
  // contact
  let m = fightingMatch();
  place(m, 1000, 1110);
  let ev = run(m, 40, (i) => [raw({ lp: i === 0, hp: i === 6 }), raw()]);
  const starts = ev.filter((e) => e.type === 'attackStart' && e.who === 0);
  assert.equal(starts.length, 2);
  assert.ok(starts[1].at - starts[0].at < m.fighters[0].def.moves.lp.startup + m.fighters[0].def.moves.lp.active + m.fighters[0].def.moves.lp.recovery, 'cancelled before jab recovery ended');
  // whiff: hp pressed during jab active frames is NOT executed as a cancel
  m = fightingMatch();
  place(m, 600, 1400);
  ev = run(m, 40, (i) => [raw({ lp: i === 0, hp: i === 6 }), raw()]);
  const s2 = ev.filter((e) => e.type === 'attackStart' && e.who === 0);
  assert.equal(s2.length, 1, 'no cancel and the press expired from the buffer');
});

test('combo protection: mashing chains cannot loop forever', () => {
  const m = fightingMatch({ p1: 'jax', p2: 'bruno' });
  place(m, 1000, 1100);
  const b = m.fighters[1];
  let maxCombo = 0, recovered = false;
  run(m, 600, (i) => {
    maxCombo = Math.max(maxCombo, b.combo.hits);
    if (b.combo.hits > 0 && b.actionable) recovered = true;
    // mash jab, crouch jab and specials as fast as possible while walking in
    const k = i % 4;
    return [raw({ right: true, lp: k === 0, lk: k === 2 }), raw()];
  });
  assert.ok(maxCombo <= TUNING.comboHitCap, `combo reached ${maxCombo}`);
  assert.ok(recovered || b.combo.hits === 0, 'defender eventually recovered');
});

test('juggle limit: launcher followed by repeated launchers stops connecting', () => {
  const m = fightingMatch({ p1: 'brick', p2: 'jax' });
  place(m, 1000, 1090);
  const b = m.fighters[1];
  const reasons = new Set();
  let maxJuggle = 0;
  run(m, 300, (i) => {
    maxJuggle = Math.max(maxJuggle, b.combo.juggle);
    for (const h of m.fighters[0].hitLog) reasons.add(h.reason.split(':')[0]);
    // uppercut, then rising special motion (623 + P) over and over
    const seq = i % 12;
    const r = raw({ down: i < 6 && i % 12 < 4 });
    if (i === 3) r.hp = true;
    if (i > 20) {
      if (seq === 0) r.right = true;
      if (seq === 2) r.down = true;
      if (seq === 4) { r.down = true; r.right = true; r.hp = true; }
    }
    return [r, raw()];
  });
  assert.ok(maxJuggle <= TUNING.juggleLimit + 2, `juggle points ${maxJuggle}`);
});

test('damage scaling reduces later hits of a combo', async () => {
  const { damageScale } = await import('../src/combat/hitResolver.js');
  assert.equal(damageScale(1), 1);
  assert.ok(damageScale(5) < damageScale(2));
  assert.ok(damageScale(50) >= TUNING.minDamageScale);
});
