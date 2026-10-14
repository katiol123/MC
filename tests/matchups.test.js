// Every-fighter-vs-every-fighter hit checks: body sizes differ a lot (Bruno vs Roxy), so a move
// tuned on one matchup can sail over a short opponent or fall short of a narrow one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fightingMatch, run, raw, place } from './helpers.js';
import { ROSTER } from '../src/data/fighters.js';

const SEQ = {
  chp: [{ down: true, hp: true }],
  s2: [{ right: true }, { down: true }, { down: true, right: true, hp: true }],
  su: [{ down: true }, { down: true, right: true }, { right: true }, { down: true }, { down: true, right: true }, { right: true, hp: true }],
};
const scripted = (seq, from = 0, p2 = () => raw()) => (i) => [raw((i >= from && seq[Math.floor((i - from) / 2)]) || {}), p2(i)];
const hitsBy0 = (ev, filter = () => true) => ev.filter((e) => e.type === 'hit' && e.who === 0 && filter(e)).length;

test('uppercuts (↓+HP and Skybreaker) connect for every fighter on every opponent, point blank to mid range', () => {
  const miss = [];
  for (const move of ['chp', 's2']) {
    for (const a of ROSTER) {
      for (const d of ROSTER) {
        for (const gap of [0, 20, 40]) {
          const m = fightingMatch({ p1: a.id, p2: d.id });
          const [f, o] = m.fighters;
          place(m, 900, 900 + f.body.pushW + o.body.pushW + gap);
          if (!hitsBy0(run(m, 70, scripted(SEQ[move])))) miss.push(`${move} ${a.id}->${d.id} gap ${gap}`);
        }
      }
    }
  }
  assert.deepEqual(miss, []);
});

test('uppercuts work as anti-airs against every jumping opponent', () => {
  const miss = [];
  for (const move of ['chp', 's2']) {
    for (const a of ROSTER) {
      for (const d of ROSTER) {
        let ok = false;
        for (let delay = 0; delay <= 30 && !ok; delay += 2) {
          const m = fightingMatch({ p1: a.id, p2: d.id });
          place(m, 900, 1080);
          ok = hitsBy0(run(m, 90, scripted(SEQ[move], delay, (i) => raw(i < 3 ? { up: true, left: true } : {})))) > 0;
        }
        if (!ok) miss.push(`${move} ${a.id} vs jumping ${d.id}`);
      }
    }
  }
  assert.deepEqual(miss, []);
});

test('every super lands every one of its hits on every opponent', () => {
  const miss = [];
  for (const a of ROSTER) {
    for (const d of ROSTER) {
      const m = fightingMatch({ p1: a.id, p2: d.id });
      place(m, 800, 880);
      m.fighters[0].meter = 100;
      const hits = hitsBy0(run(m, 300, scripted(SEQ.su)), (e) => e.super);
      const steps = m.fighters[0].def.moves.su.steps.filter((s) => s.spec).length;
      if (hits !== steps) miss.push(`${a.id}->${d.id} ${hits}/${steps}`);
    }
  }
  assert.deepEqual(miss, []);
});
