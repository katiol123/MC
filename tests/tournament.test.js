import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTournament, allMatches, roundRobin, MatchRunner, standings, awards, roundComplete, setupMatch, AWARD_FAME } from '../src/tournament/tournament.js';

test('round robin: every pair meets exactly once, everyone plays once per round', () => {
  const ids = Array.from({ length: 16 }, (_, i) => `f${i}`);
  const rounds = roundRobin(ids);
  assert.equal(rounds.length, 15);
  const pairs = new Set();
  for (const r of rounds) {
    const seen = new Set(r.flat());
    assert.equal(seen.size, 16);
    for (const [a, b] of r) pairs.add([a, b].sort().join('-'));
  }
  assert.equal(pairs.size, 120);
});

test('tournament matches replay exactly (seed + snapshotted overrides) even after the fighters change', () => {
  const t = createTournament({ seed: 7, ids: ['brick', 'jax', 'roxy', 'tao'] });
  const { m } = allMatches(t)[0];
  const run = new MatchRunner(t, m);
  run.finish();
  run.record();
  const first = m.result;
  // the fighter changes after the match (future level-up / injury): the replay must not
  t.fighters[m.a].overrides = { attrs: { power: 200, speed: 2 } };
  const { match, ai } = setupMatch(t, m);
  let n = 0;
  while (match.phase !== 'over' && n++ < 60 * 60 * 10) match.tick([ai[0].input(match), ai[1].input(match)]);
  assert.deepEqual(match.wins, first.wins);
  assert.equal(match.winner, first.winner);
});

test('results feed the table, spectacle points become fame, completed rounds hand out awards', () => {
  const t = createTournament({ seed: 3, ids: ['brick', 'jax', 'roxy', 'tao'] });
  for (const m of t.rounds[0]) { const r = new MatchRunner(t, m); r.finish(); r.record(); }
  assert.ok(roundComplete(t, 0));
  const table = standings(t);
  assert.equal(table.reduce((a, r) => a + r.played, 0), 4);
  assert.ok(table[0].pts >= table[3].pts);
  const list = t.roundAwards[0];
  assert.equal(list.length, 5);
  assert.deepEqual(list.map((a) => a.key), ['fastest', 'combos', 'longest', 'iron', 'star']);
  // fame = spectacle + award bonuses
  for (const id of t.ids) {
    const earned = allMatches(t).filter((x) => x.m.result).reduce((s, { m }) => s + ([m.a, m.b].includes(id) ? m.result.sides[[m.a, m.b].indexOf(id)].spectacle.total : 0), 0);
    const bonus = list.filter((a) => a.id === id).length * AWARD_FAME;
    assert.equal(t.fighters[id].fame, earned + bonus, id);
  }
  assert.deepEqual(awards(t, 0).map((a) => a.id), list.map((a) => a.id));
});
