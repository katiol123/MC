import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTournament, allMatches, roundRobin, MatchRunner, standings, snapshotOverrides, awards, roundComplete, setupMatch, AWARD_FAME } from '../src/tournament/tournament.js';

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
  // fame = spectacle (with underdog / fired-up bonuses) + award bonuses
  for (const id of t.ids) {
    const earned = allMatches(t).filter((x) => x.m.result).reduce((s, { m }) => s + ([m.a, m.b].includes(id) ? m.result.sides[[m.a, m.b].indexOf(id)].fame : 0), 0);
    const bonus = list.filter((a) => a.id === id).length * AWARD_FAME;
    assert.equal(t.fighters[id].fame + t.fighters[id].spentFame, earned + bonus, id);
  }
  assert.deepEqual(awards(t, 0).map((a) => a.id), list.map((a) => a.id));
});

test('condition: stamina moves the body bars, morale the character bars, both hard below 75', async () => {
  const { conditionOverrides, conditionShift } = await import('../src/tournament/condition.js');
  const { buildFighterDef } = await import('../src/data/fighters.js');
  const fresh = buildFighterDef('brick', conditionOverrides('brick', {}, { stamina: 75, morale: 75 }));
  const tired = buildFighterDef('brick', conditionOverrides('brick', {}, { stamina: 20, morale: 75 }));
  const down = buildFighterDef('brick', conditionOverrides('brick', {}, { stamina: 75, morale: 20 }));
  assert.ok(tired.attrs.power < fresh.attrs.power && tired.attrs.health < fresh.attrs.health && tired.attrs.speed > fresh.attrs.speed);
  assert.equal(tired.attrs.reaction, fresh.attrs.reaction);
  assert.ok(down.attrs.reaction < fresh.attrs.reaction && down.attrs.combo < fresh.attrs.combo);
  assert.equal(down.attrs.power, fresh.attrs.power);
  assert.ok(conditionShift(0) <= -1 && conditionShift(75) === 0 && conditionShift(100) > 0);
  // toughness never becomes a negative stun meter
  assert.ok(buildFighterDef('jax', conditionOverrides('jax', {}, { stamina: 0, morale: 0 })).stats.stunMax > 50);
});

test('condition: matches drain stamina, results move morale, fame buys recovery, fatality odds follow condition', async () => {
  const { buy, fatalityChance, SHOP } = await import('../src/tournament/condition.js');
  const t = createTournament({ seed: 5, ids: ['brick', 'jax', 'roxy', 'tao'] });
  const m = t.rounds[0][0];
  const r = new MatchRunner(t, m);
  r.finish();
  const res = r.record();
  const [ca, cb] = res.condition;
  assert.ok(ca.stamina[1] < ca.stamina[0] && cb.stamina[1] < cb.stamina[0]);
  const w = res.winner, wc = res.condition[w], lc = res.condition[1 - w];
  assert.ok(wc.morale[1] > wc.morale[0] && lc.morale[1] < lc.morale[0]);
  const f = t.fighters[m.a];
  f.fame = 1000;
  const st = f.stamina;
  assert.ok(buy(t, m.a, 'rest'));
  assert.equal(f.fame, 1000 - SHOP.find((x) => x.id === 'rest').cost);
  assert.equal(f.stamina, Math.min(100, st + 25));
  f.fame = 0;
  assert.ok(!buy(t, m.a, 'physio'));
  const fake = (morale, stamina, hp) => ({ wins: [2, 1], fighters: [{ def: { cond: { morale, stamina } }, health: hp, maxHealth: 1000 }, {}] });
  assert.ok(fatalityChance(fake(100, 100, 900), 0) > fatalityChance(fake(20, 20, 900), 0) + 0.3);
  assert.ok(fatalityChance(fake(70, 70, 950), 0) > fatalityChance(fake(70, 70, 50), 0));
});

test('injuries: rolled in the fight (deterministic), permanent damage + timed debuff, one per kind, treatable', async () => {
  const I = await import('../src/tournament/injuries.js');
  const t = createTournament({ seed: 1, ids: ['roxy', 'bruno'] });
  for (const id of t.ids) t.fighters[id].stamina = 20;
  const m = allMatches(t)[0].m;
  const play = () => {
    const { match, ai } = setupMatch(t, m);
    const evs = [];
    while (match.phase !== 'over') evs.push(...match.tick([ai[0].input(match), ai[1].input(match)]).filter((e) => e.type === 'injury'));
    return evs;
  };
  const a = play(), b = play();
  assert.ok(a.length >= 1, 'an injury happens with seed 1 and tired fighters');
  assert.deepEqual(a, b, 'same seed, same injuries');
  const r = new MatchRunner(t, m);
  r.finish();
  const res = r.record();
  const i = res.injuries.findIndex(Boolean);
  const id = [m.a, m.b][i], f = t.fighters[id], inj = res.injuries[i];
  assert.ok(res.sides[1 - i].spectacle.items.some((x) => x.key === 'injury'), 'spectacle bonus for the attacker');
  assert.equal(f.injuries[0].kind, inj.kind);
  assert.ok(Object.values(f.perm).every((v) => v < 0), 'permanent damage');
  // second injury of the same kind replaces, a different kind stacks
  I.addInjury(t, id, inj.kind);
  assert.equal(f.injuries.filter((x) => x.kind === inj.kind).length, 1);
  const other = I.INJURY_KINDS.find((k) => k !== inj.kind);
  I.addInjury(t, id, other);
  assert.equal(f.injuries.length, 2);
  // treatment shortens by one round; debuffs end when the counter runs out
  f.fame = 1000;
  const g = f.injuries.find((x) => x.kind === other).games;
  assert.ok(I.treatInjury(t, id, other));
  assert.equal(f.injuries.find((x) => x.kind === other)?.games ?? 0, g - 1);
  for (let k = 0; k < 5; k++) I.tickInjuries(f);
  assert.equal(f.injuries.length, 0);
});

test('upgrades: any attribute, rising price, raise the bars the fighter fights with', async () => {
  const I = await import('../src/tournament/injuries.js');
  const { buildFighterDef } = await import('../src/data/fighters.js');
  const t = createTournament({ seed: 2, ids: ['brick', 'jax'] });
  const f = t.fighters.brick;
  f.fame = 10000;
  const before = buildFighterDef('brick', snapshotOverrides(t, allMatches(t)[0].m)[allMatches(t)[0].m.a === 'brick' ? 0 : 1]).attrs.power;
  const c1 = I.upgradeCost(f, 'power');
  assert.ok(I.buyUpgrade(t, 'brick', 'power'));
  assert.ok(I.upgradeCost(f, 'power') > c1);
  for (const a of I.ATTR_IDS) assert.ok(I.buyUpgrade(t, 'brick', a), a);
  const after = buildFighterDef('brick', snapshotOverrides(t, allMatches(t)[0].m)[allMatches(t)[0].m.a === 'brick' ? 0 : 1]).attrs.power;
  assert.ok(after > before);
});

test('injury debuffs act in the fight: no dashes with a sprained ankle, weaker meter with a torn shoulder', async () => {
  const { Match } = await import('../src/game/match.js');
  const m = new Match({ p1: 'brick', p2: 'jax', o1: { injuryFx: ['noDash', 'slowMeter'] } });
  const f = m.fighters[0];
  assert.ok(f.injFx.has('noDash'));
  f.gainMeter(20);
  assert.equal(f.meter, 10);
});
