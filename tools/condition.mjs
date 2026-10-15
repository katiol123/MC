// Condition calibration: mirror matches (same fighter both sides) where only stamina / morale
// differ. Prints the win rate of side A for each scenario.
//   node tools/condition.mjs [gamesPerFighter=40]
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const self = fileURLToPath(import.meta.url);
const SCEN = {
  'stamina 100 vs 75': [{ stamina: 100, morale: 75 }, { stamina: 75, morale: 75 }],
  'stamina 75 vs 50': [{ stamina: 75, morale: 75 }, { stamina: 50, morale: 75 }],
  'stamina 75 vs 25': [{ stamina: 75, morale: 75 }, { stamina: 25, morale: 75 }],
  'stamina 100 vs 0': [{ stamina: 100, morale: 75 }, { stamina: 0, morale: 75 }],
  'morale 100 vs 75': [{ stamina: 75, morale: 100 }, { stamina: 75, morale: 75 }],
  'morale 75 vs 50': [{ stamina: 75, morale: 75 }, { stamina: 75, morale: 50 }],
  'morale 75 vs 25': [{ stamina: 75, morale: 75 }, { stamina: 75, morale: 25 }],
  'morale 100 vs 0': [{ stamina: 75, morale: 100 }, { stamina: 75, morale: 0 }],
};

async function play(games) {
  const { Match } = await import('../src/game/match.js');
  const { AIController } = await import('../src/ai/aiController.js');
  const { conditionOverrides } = await import('../src/tournament/condition.js');
  return games.map((g) => {
    const [ca, cb] = SCEN[g.scen];
    const o = [conditionOverrides(g.f, {}, ca), conditionOverrides(g.f, {}, cb)];
    if (g.side) o.reverse();
    const m = new Match({ p1: g.f, p2: g.f, o1: o[0], o2: o[1], roundsToWin: 2 });
    const ai = [new AIController(0, { level: 'normal', seed: g.seed }), new AIController(1, { level: 'normal', seed: g.seed * 7 + 3 })];
    for (const a of ai) a.fatalityChoice = false;
    let t = 0;
    while (m.phase !== 'over' && t++ < 60 * 60 * 8) m.tick([ai[0].input(m), ai[1].input(m)]);
    const aSide = g.side ? 1 : 0;
    return { scen: g.scen, w: m.winner === aSide ? 1 : m.winner === 1 - aSide ? 0 : 0.5 };
  });
}

if (process.argv[2] === '--worker') {
  process.on('message', async (j) => { process.send(await play(j)); process.exit(0); });
} else {
  const n = Number(process.argv[2] || 40);
  const only = process.argv[3];
  const fighters = ['brick', 'roxy', 'jax', 'bruno', 'tao', 'hawk', 'goro', 'sobby'];
  const list = [];
  for (const scen of Object.keys(SCEN)) {
    if (only && !scen.startsWith(only)) continue;
    for (const f of fighters) for (let i = 0; i < n / fighters.length * 8 / 8; i++) list.push({ scen, f, side: i % 2, seed: 900 + i * 31 + f.length });
  }
  const k = Math.min(os.cpus().length, 4);
  const chunks = Array.from({ length: k }, (_, i) => list.filter((_, j) => j % k === i));
  const t0 = Date.now();
  const res = (await Promise.all(chunks.map((g) => new Promise((r) => { const w = fork(self, ['--worker']); w.on('message', r); w.send(g); })))).flat();
  for (const scen of Object.keys(SCEN)) {
    const rs = res.filter((r) => r.scen === scen);
    if (!rs.length) continue;
    const wr = rs.reduce((a, r) => a + r.w, 0) / rs.length;
    console.log(`${scen.padEnd(20)} A wins ${(wr * 100).toFixed(1)}%  ±${(100 * Math.sqrt(0.25 / rs.length)).toFixed(1)}  (n=${rs.length})`);
  }
  console.log(`${res.length} matches in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
