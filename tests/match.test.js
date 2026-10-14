import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROSTER } from '../src/data/fighters.js';
import { fightingMatch, run, raw, place } from './helpers.js';
import { Match } from '../src/game/match.js';
import { AIController } from '../src/ai/aiController.js';

function koRound(m, loser) {
  const f = m.fighters[loser];
  f.health = 1;
  place(m, 1000, 1100);
  const att = 1 - loser;
  if (att === 1) place(m, 1000, 1100);
  run(m, 20, (i) => (att === 0 ? [raw({ lp: i === 0 }), raw()] : [raw(), raw({ lp: i === 0 })]));
  let guard = 0;
  while (m.phase !== 'intro' && m.phase !== 'over' && guard++ < 1200) m.tick([raw(), raw()]);
}

test('KO ends the round, the winner scores, the next round starts fresh', () => {
  const m = fightingMatch();
  koRound(m, 1);
  assert.deepEqual(m.wins, [1, 0]);
  assert.equal(m.round, 2);
  assert.equal(m.phase, 'intro');
  assert.equal(m.fighters[1].health, m.fighters[1].maxHealth);
});

test('the match ends after the configured number of round wins and can be restarted', () => {
  const m = fightingMatch({ roundsToWin: 2 });
  koRound(m, 1);
  while (m.phase !== 'fight') m.tick([raw(), raw()]);
  koRound(m, 1);
  assert.equal(m.phase, 'over');
  assert.equal(m.winner, 0);
  m.restart();
  assert.deepEqual(m.wins, [0, 0]);
  assert.equal(m.round, 1);
  assert.ok(m.fighters.every((f) => f.health === f.maxHealth));
  while (m.phase !== 'fight') m.tick([raw(), raw()]);
  assert.equal(m.phase, 'fight');
});

test('time over: the fighter with more health (relative) wins the round', () => {
  const m = fightingMatch({ roundTime: 3 });
  m.fighters[0].health -= 100;
  let guard = 0, poses = new Set();
  while (m.phase !== 'intro' && m.phase !== 'over' && guard++ < 2000) {
    m.tick([raw(), raw()]);
    poses.add(`${m.fighters[0].state}/${m.fighters[1].state}`);
  }
  assert.deepEqual(m.wins, [0, 1]);
  assert.ok(poses.has('defeat/victory'), 'loser on their feet plays the defeat pose, winner the victory pose');
});

test('AI vs AI plays complete matches to a result for every fighter pairing sample', () => {
  const ids = ROSTER.map((r) => r.id);
  for (let k = 0; k < ids.length; k++) {
    const m = new Match({ p1: ids[k], p2: ids[(k + 5) % ids.length], roundsToWin: 2, roundTime: 60 });
    const ai = [new AIController(0, { level: 'hard', seed: k }), new AIController(1, { level: 'normal', seed: 99 + k })];
    let hits = 0;
    for (let t = 0; t < 60 * 60 * 6 && m.phase !== 'over'; t++) {
      for (const e of m.tick([ai[0].input(m), ai[1].input(m)])) if (e.type === 'hit') hits++;
    }
    assert.equal(m.phase, 'over', `${ids[k]} match finished`);
    assert.ok(hits > 10, `real fighting happened (${hits} hits)`);
  }
});

test('simulation is deterministic for identical inputs', () => {
  const play = () => {
    const m = new Match({ p1: 'vellaro', p2: 'roxy' });
    const ai = [new AIController(0, { seed: 1 }), new AIController(1, { seed: 2 })];
    for (let t = 0; t < 3000; t++) m.tick([ai[0].input(m), ai[1].input(m)]);
    return JSON.stringify(m.fighters.map((f) => [f.body.x, f.body.y, f.health, f.state, f.stun]));
  };
  assert.equal(play(), play());
});

test('training mode never ends the round', () => {
  const m = fightingMatch({ training: true, roundTime: 0 });
  m.fighters[1].health = 5;
  place(m, 1000, 1100);
  run(m, 200, (i) => [raw({ hp: i === 0 }), raw()]);
  assert.equal(m.phase, 'fight');
  assert.ok(m.fighters[1].health > 0);
});

test('low health: once per round the fighter turns battered (event + tired breathing), and recovers next round', () => {
  const m = fightingMatch({ p1: 'bruno', p2: 'rattigan' });
  const b = m.fighters[1];
  b.health = Math.floor(b.maxHealth * 0.25);
  let ev = run(m, 5);
  assert.equal(ev.filter((e) => e.type === 'critical' && e.who === 1).length, 1);
  assert.ok(b.critical && b.animContext().tired);
  ev = run(m, 60);
  assert.ok(!ev.some((e) => e.type === 'critical'), 'only once');
  m.startRound();
  assert.equal(b.critical, false, 'fresh look next round');
});
