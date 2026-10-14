// Feature audit: runs CPU vs CPU matches for every pairing and checks that every combat feature
// actually happens in real fights (not just in scripted unit tests). Prints a checklist; exits 1
// when a feature never occurred.   node tools/audit.mjs [matchesPerPair=1]
import { Match } from '../src/game/match.js';
import { AIController } from '../src/ai/aiController.js';
import { ROSTER } from '../src/data/fighters.js';

const perPair = Number(process.argv[2] || 1);
const C = {}; // feature -> count
const inc = (k, n = 1) => { C[k] = (C[k] || 0) + n; };
const per = {}; // fighter -> feature -> count
const pinc = (id, k) => { (per[id] ||= {})[k] = (per[id][k] || 0) + 1; };

let matches = 0, rounds = 0;
const levels = ['easy', 'normal', 'hard'];
for (let rep = 0; rep < perPair; rep++) {
  for (const a of ROSTER) {
    for (const b of ROSTER) {
      if (a.id === b.id && rep > 0) continue;
      const level = levels[(matches + rep) % 3];
      const m = new Match({ p1: a.id, p2: b.id });
      const ai = [new AIController(0, { level, seed: 101 + matches * 7 }), new AIController(1, { level, seed: 202 + matches * 13 })];
      const fs = m.fighters;
      const prevState = fs.map((f) => f.state), prevReason = [null, null], prevHealth = fs.map((f) => f.health);
      for (let t = 0; t < 60 * 60 * 8 && m.phase !== 'over'; t++) {
        const ev = m.tick([ai[0].input(m), ai[1].input(m)]);
        if (m.freeze) inc('super freeze (cinematic)');
        for (const e of ev) {
          inc(`event:${e.type}`);
          const who = e.who !== undefined ? fs[e.who]?.def.id : null;
          if (e.type === 'hit') {
            if (e.counter) inc('hit: counter hit');
            if (e.punish) inc('hit: punish');
            if (e.trade) inc('hit: trade');
            if (e.throw) inc('hit: throw damage');
            if (e.super) inc('hit: super hit');
            if (e.fire) inc('hit: fire hit (Cinder)');
            if (e.prop === 'pan') inc('hit: frying pan (Bruno)');
            if (e.ko) inc('hit: KO blow');
            if (e.combo >= 3) inc('hit: 3+ hit combo');
            if (e.move?.startsWith('proj:')) inc(`hit: projectile ${e.move.slice(5)}`);
            if (e.part === 'head') inc('hit: head hit');
          }
          if (e.type === 'block') inc(e.low ? 'block: low' : 'block: high');
          if (e.type === 'attackStart') pinc(who, e.move);
          if (e.type === 'projectile') inc(`projectile spawned: ${e.kind}`);
          if (e.type === 'dash') inc(e.dir === -1 ? 'dash: back' : 'dash: forward');
          if (e.type === 'announce') inc(`announce: ${e.text.replace(/\d+/, 'N')}`);
          if (e.type === 'ko' && e.double) inc('double KO');
          if (e.type === 'superStart') pinc(who, 'superStart');
        }
        fs.forEach((f, i) => {
          if (f.state !== prevState[i]) { inc(`state:${f.state}`); pinc(f.def.id, `state:${f.state}`); }
          if (f.state === 'blockstun' && f.health < prevHealth[i]) inc('chip damage on block');
          const r = f.lastHit?.reason;
          if (r && r !== prevReason[i]) {
            for (const k of ['juggle limit', 'combo hit cap', 'repeated move limit', 'invulnerable', 'PARRIED', 'THROW TECH', 'throw whiff', 'throw rejected', 'out-prioritised', 'clash']) if (r.includes(k)) inc(`reason: ${k}`);
          }
          prevReason[i] = r; prevState[i] = f.state; prevHealth[i] = f.health;
          if (f.burn > 0) inc('burning (ticks)');
          if (f.stance === 1) inc('stance: switched (ticks)');
          if (f.state === 'run') inc('run (ticks)');
          if (f.combo.juggle >= 2) inc('juggle chain (2+)');
          if (m.projectiles.length >= 2 && m.projectiles[0].owner !== m.projectiles[1].owner) inc('two projectiles on screen');
        });
      }
      matches++;
      rounds += m.round;
    }
  }
}

// ---- checklist ------------------------------------------------------------------------------
const want = [
  ['Movement', ['state:walkF', 'state:walkB', 'state:crouch', 'state:prejump', 'state:jump', 'state:land', 'dash: forward', 'dash: back', 'run (ticks)', 'event:turn']],
  ['Defence', ['block: high', 'block: low', 'state:guardHigh', 'state:guardLow', 'chip damage on block', 'event:parry', 'reason: PARRIED']],
  ['Hits', ['event:hit', 'hit: head hit', 'hit: counter hit', 'hit: punish', 'hit: trade', 'event:clash', 'event:whiff', 'hit: 3+ hit combo', 'event:comboEnd', 'hit: KO blow']],
  ['Reactions', ['state:hitstun', 'state:stagger', 'state:juggle', 'juggle chain (2+)', 'state:knockdown', 'state:getup', 'event:dizzy', 'state:dizzy', 'state:ko', 'state:victory', 'state:defeat']],
  ['Combo protection', ['reason: juggle limit', 'reason: repeated move limit', 'reason: combo hit cap']],
  ['Throws', ['event:grab', 'state:throwing', 'state:thrown', 'hit: throw damage', 'event:tech', 'reason: throw whiff']],
  ['Specials', ['projectile spawned: coin', 'projectile spawned: wave', 'projectile spawned: flame', 'hit: projectile coin', 'hit: projectile wave', 'hit: projectile flame', 'event:projectileEnd', 'event:teleport', 'reason: invulnerable']],
  ['Supers', ['event:superStart', 'super freeze (cinematic)', 'hit: super hit', 'hit: frying pan (Bruno)', 'hit: fire hit (Cinder)', 'burning (ticks)', 'event:burn']],
  ['Misc', ['event:stance', 'stance: switched (ticks)', 'announce: TIME', 'announce: K.O.', 'event:roundEnd', 'event:matchEnd']],
];
// safety nets that well-played CPU fights rarely reach; each has its own unit test
const RARE = { 'reason: combo hit cap': 'tests/combat.test.js', 'announce: TIME': 'tests/match.test.js' };
let missing = 0;
console.log(`${matches} CPU matches, ${rounds} rounds (levels easy/normal/hard)\n`);
for (const [group, keys] of want) {
  console.log(group);
  for (const k of keys) {
    const n = C[k] || 0;
    if (!n && RARE[k]) { console.log(`  ~ ${k.padEnd(34)} 0  (rare safety net, covered by ${RARE[k]})`); continue; }
    if (!n) missing++;
    console.log(`  ${n ? '✔' : '✘'} ${k.padEnd(34)} ${n}`);
  }
}
// per fighter: every move of the moveset and its super must be used
const MOVES = ['lp', 'hp', 'lk', 'hk', 'clp', 'clk', 'chp', 'chk', 'jp', 'jk', 's1', 's2', 's3', 's4', 'su', 'throw'];
console.log('\nPer fighter (attacks started):');
console.log('  ' + 'fighter'.padEnd(10) + MOVES.map((m) => m.padStart(6)).join(''));
for (const r of ROSTER) {
  const row = MOVES.map((mv) => {
    const n = per[r.id]?.[mv] || 0;
    if (!n) missing++;
    return (n ? String(n) : '✘0').padStart(6);
  });
  console.log('  ' + r.id.padEnd(10) + row.join(''));
}
console.log(missing ? `\n${missing} feature(s) never happened` : '\nEvery feature happened in CPU fights');
process.exitCode = missing ? 1 : 0;
