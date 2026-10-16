// FINISH HIM / FATALITY: the deciding blow leaves the loser dazed; the winner's fatality plays on
// every opponent and ends the match. Written once per fighter, it must work on every body type.
import { test } from 'node:test';
import { extraFrames } from '../src/fatality/cinema.js';
import assert from 'node:assert/strict';
import { fightingMatch, run, raw, place } from './helpers.js';
import { ROSTER } from '../src/data/fighters.js';
import { FATALITIES } from '../src/fatality/fatalities.js';
import { Match } from '../src/game/match.js';
import { AIController } from '../src/ai/aiController.js';

const SU_K = [{ down: true }, { down: true, right: true }, { right: true }, { down: true }, { down: true, right: true }, { right: true, hk: true }];
const seq = (s) => (i) => [raw(s[Math.floor(i / 2)] || {}), raw()];

/** A match in its deciding round with P2 one hit from losing. */
function decidingMatch(p1, p2) {
  const m = fightingMatch({ p1, p2, roundsToWin: 1 });
  place(m, 900, 990);
  m.fighters[1].health = 1;
  return m;
}

test('every fighter has a fatality script', () => {
  for (const r of ROSTER) assert.ok(FATALITIES[r.id], `${r.id} fatality`);
});

test('the deciding blow leaves the loser dazed: FINISH HIM, then a normal KO if the window runs out', () => {
  const m = decidingMatch('brick', 'roxy');
  let ev = run(m, 40, (i) => [raw({ lp: i === 0 }), raw()]);
  assert.equal(m.fighters[1].state, 'dazed');
  assert.equal(m.phase, 'finish');
  assert.ok(ev.some((e) => e.type === 'announce' && /FINISH HER/.test(e.text)));
  ev = run(m, 400);
  assert.ok(ev.some((e) => e.type === 'matchEnd' && !e.fatality));
});

test('a normal hit during FINISH HIM is a plain KO', () => {
  const m = decidingMatch('jax', 'bruno');
  run(m, 40, (i) => [raw({ lp: i === 0 }), raw()]);
  assert.equal(m.phase, 'finish');
  run(m, 40, (i) => [raw({ hp: i === 0 }), raw()]);
  assert.equal(m.fighters[1].state, 'ko');
  assert.notEqual(m.phase, 'fatality');
});

test('every fatality plays on every opponent and ends the match (nothing breaks)', () => {
  for (const a of ROSTER) {
    for (const v of ROSTER) {
      const m = decidingMatch(a.id, v.id);
      run(m, 40, (i) => [raw({ lp: i === 0 }), raw()]);
      assert.equal(m.phase, 'finish', `${a.id}->${v.id} finish`);
      let ev = run(m, 20, seq(SU_K));
      assert.ok(ev.some((e) => e.type === 'fatalityStart'), `${a.id}->${v.id} fatality started`);
      const dur = FATALITIES[a.id].duration + extraFrames(a.id);
      ev = run(m, dur + 5);
      const end = ev.find((e) => e.type === 'matchEnd');
      assert.ok(end && end.fatality && end.winner === 0, `${a.id}->${v.id} match ended by fatality`);
      for (const f of m.fighters) {
        assert.ok(Number.isFinite(f.body.x) && Number.isFinite(f.body.y), `${a.id}->${v.id} finite positions`);
        for (const j of Object.values(f.skel.j)) assert.ok(Number.isFinite(j.x) && Number.isFinite(j.y), `${a.id}->${v.id} finite skeleton`);
      }
      run(m, 300);
      assert.equal(m.phase, 'over');
    }
  }
});

test('the CPU always performs the fatality when it wins (for now)', () => {
  let done = 0;
  for (let k = 0; k < 4; k++) {
    const m = new Match({ p1: ROSTER[k].id, p2: ROSTER[k + 6].id, roundsToWin: 1 });
    const ai = [new AIController(0, { level: 'hard', seed: k }), new AIController(1, { level: 'normal', seed: 50 + k })];
    let fat = false;
    for (let t = 0; t < 60 * 60 * 4 && m.phase !== 'over'; t++) for (const e of m.tick([ai[0].input(m), ai[1].input(m)])) if (e.type === 'matchEnd' && e.fatality) fat = true;
    assert.equal(m.phase, 'over');
    if (fat) done++;
  }
  assert.equal(done, 4, 'every CPU win ended with a fatality');
});
