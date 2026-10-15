// Attribute calibration: mirror matches between the same fighter with one attribute set high vs
// low (everything else equal), on several fighters and both sides. Reports the share of rounds and
// matches won by the high side, so attribute ranges can be tuned to give equal value per bar step.
//   node tools/calibrate.mjs '{"attrs":{"health":[850,1150]},"fighters":["brick","roxy"],"games":20}'
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const self = fileURLToPath(import.meta.url);

async function play(job) {
  const { Match } = await import('../src/game/match.js');
  const { AIController } = await import('../src/ai/aiController.js');
  const res = [];
  for (const g of job.games) {
    const hiSide = g.side;
    const o = [{ attrs: g.lo }, { attrs: g.lo }];
    o[hiSide] = { attrs: g.hi };
    const m = new Match({ p1: g.fighter, p2: g.fighter, o1: o[0], o2: o[1], roundsToWin: 2 });
    const ai = [new AIController(0, { level: g.level, seed: g.seed }), new AIController(1, { level: g.level, seed: g.seed * 7 + 3 })];
    for (const a of ai) a.fatalityChoice = false;
    let t = 0;
    while (m.phase !== 'over' && t++ < 60 * 60 * 8) m.tick([ai[0].input(m), ai[1].input(m)]);
    res.push({ attr: g.attr, fighter: g.fighter, roundsHi: m.wins[hiSide], roundsLo: m.wins[1 - hiSide], hiWon: m.winner === hiSide ? 1 : m.winner === 1 - hiSide ? 0 : 0.5 });
  }
  return res;
}

if (process.argv[2] === '--worker') {
  process.on('message', async (job) => { process.send(await play(job)); process.exit(0); });
} else {
  const cfg = JSON.parse(process.argv[2] || '{}');
  const fighters = cfg.fighters || ['brick', 'roxy', 'jax', 'bruno', 'tao', 'hawk'];
  const games = cfg.games || 12;
  const level = cfg.level || 'normal';
  // every other attribute at the middle of its range, so only the tested one differs
  const { attrsFromProfile } = await import('../src/data/attributes.js');
  const base = { ...attrsFromProfile({}), ...(cfg.base || {}) };
  const list = [];
  for (const [attr, [lo, hi]] of Object.entries(cfg.attrs)) {
    for (const fighter of fighters) {
      for (let i = 0; i < games; i++) {
        list.push({ attr, fighter, side: i % 2, seed: 1000 + i * 37 + fighter.length * 11, level,
          lo: { ...base, [attr]: lo }, hi: { ...base, [attr]: hi } });
      }
    }
  }
  const n = Math.min(os.cpus().length, 4);
  const chunks = Array.from({ length: n }, (_, i) => list.filter((_, j) => j % n === i));
  const t0 = Date.now();
  const parts = await Promise.all(chunks.map((games) => new Promise((resolve, reject) => {
    const w = fork(self, ['--worker']);
    w.on('message', resolve);
    w.on('error', reject);
    w.send({ games });
  })));
  const all = parts.flat();
  const out = {};
  for (const r of all) {
    const o = (out[r.attr] ||= { rh: 0, rl: 0, mw: 0, n: 0, by: {} });
    o.rh += r.roundsHi; o.rl += r.roundsLo; o.mw += r.hiWon; o.n++;
    const b = (o.by[r.fighter] ||= { mw: 0, n: 0 });
    b.mw += r.hiWon; b.n++;
  }
  for (const [attr, o] of Object.entries(out)) {
    const rw = o.rh / (o.rh + o.rl), mw = o.mw / o.n;
    const se = Math.sqrt((mw * (1 - mw)) / o.n);
    const by = Object.entries(o.by).map(([f, b]) => `${f} ${(b.mw / b.n).toFixed(2)}`).join('  ');
    console.log(`${attr.padEnd(11)} rounds ${(rw * 100).toFixed(1)}%  matches ${(mw * 100).toFixed(1)}% ±${(se * 100).toFixed(1)}  (n=${o.n})   ${by}`);
  }
  console.log(`${all.length} matches in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
