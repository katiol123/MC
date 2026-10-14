import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../src/game/match.js';
import { AIController } from '../src/ai/aiController.js';
import { ROSTER } from '../src/data/fighters.js';

test('CPU uses its whole toolbox: dashes, runs, jumps, specials, signatures, supers, throws, techs, blocks', () => {
  const seen = {};
  const add = (k) => (seen[k] = (seen[k] || 0) + 1);
  let rounds = 0;
  for (let k = 0; k < 8; k++) {
    const m = new Match({ p1: ROSTER[k].id, p2: ROSTER[(k + 3) % 8].id, roundsToWin: 2 });
    const ai = [new AIController(0, { level: 'normal', seed: k + 1 }), new AIController(1, { level: 'normal', seed: k + 40 })];
    for (let t = 0; t < 60 * 60 * 4 && m.phase !== 'over'; t++) {
      for (const e of m.tick([ai[0].input(m), ai[1].input(m)])) {
        if (e.type === 'dash') add(e.dir === 1 ? 'dash' : 'backdash');
        else if (e.type === 'attackStart') add(`move:${e.move}`);
        else if (e.type === 'roundEnd') rounds++;
        else add(e.type);
      }
      for (const f of m.fighters) if (f.state === 'run') add('run');
    }
  }
  for (const k of ['dash', 'backdash', 'run', 'jump', 'move:s1', 'move:s2', 'move:s3', 'move:s4', 'move:su', 'superStart', 'grab', 'tech', 'block', 'projectile']) {
    assert.ok(seen[k] > 0, `CPU never used: ${k}`);
  }
  // supers stay rare: on average well under two per round for both fighters together
  assert.ok(seen.superStart / rounds < 2, `${seen.superStart} supers in ${rounds} rounds`);
});
