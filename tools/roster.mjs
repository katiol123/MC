// Round robin of the whole roster (CPU vs CPU, every pairing, both sides): per-fighter win rate
// next to the sum of its attribute bars. Used to balance the roster after attribute calibration.
//   node tools/roster.mjs [gamesPerSidePerPair=4] [level=normal]
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const self = fileURLToPath(import.meta.url);

async function play(games) {
  const { Match } = await import('../src/game/match.js');
  const { AIController } = await import('../src/ai/aiController.js');
  return games.map((g) => {
    const m = new Match({ p1: g.a, p2: g.b, roundsToWin: 2 });
    const ai = [new AIController(0, { level: g.level, seed: g.seed }), new AIController(1, { level: g.level, seed: g.seed * 7 + 3 })];
    for (const a of ai) a.fatalityChoice = false;
    let t = 0;
    while (m.phase !== 'over' && t++ < 60 * 60 * 8) m.tick([ai[0].input(m), ai[1].input(m)]);
    return { a: g.a, b: g.b, w: m.winner };
  });
}

if (process.argv[2] === '--worker') {
  process.on('message', async (job) => { process.send(await play(job)); process.exit(0); });
} else {
  const n = Number(process.argv[2] || 4);
  const level = process.argv[3] || 'normal';
  const { ROSTER, buildFighterDef } = await import('../src/data/fighters.js');
  const ids = ROSTER.map((r) => r.id);
  const list = [];
  for (const a of ids) for (const b of ids) if (a !== b) for (let i = 0; i < n; i++) list.push({ a, b, level, seed: 500 + i * 31 + a.length * 7 + b.length * 3 });
  const k = Math.min(os.cpus().length, 4);
  const chunks = Array.from({ length: k }, (_, i) => list.filter((_, j) => j % k === i));
  const t0 = Date.now();
  const res = (await Promise.all(chunks.map((games) => new Promise((resolve) => { const w = fork(self, ['--worker']); w.on('message', resolve); w.send(games); })))).flat();
  const st = Object.fromEntries(ids.map((id) => [id, { w: 0, n: 0 }]));
  for (const r of res) {
    st[r.a].n++; st[r.b].n++;
    if (r.w === 0) st[r.a].w++; else if (r.w === 1) st[r.b].w++; else { st[r.a].w += 0.5; st[r.b].w += 0.5; }
  }
  const rows = ids.map((id) => {
    const p = ROSTER.find((r) => r.id === id).profile || {};
    const sum = Object.values(p).reduce((a, b) => a + b, 0);
    return { id, wr: st[id].w / st[id].n, n: st[id].n, sum };
  }).sort((x, y) => y.wr - x.wr);
  for (const r of rows) console.log(`${r.id.padEnd(9)} win ${(r.wr * 100).toFixed(1)}%  (n=${r.n})   bar sum ${r.sum.toFixed(2)}`);
  const mx = rows.reduce((a, r) => a + r.sum, 0) / rows.length, my = rows.reduce((a, r) => a + r.wr, 0) / rows.length;
  const cov = rows.reduce((a, r) => a + (r.sum - mx) * (r.wr - my), 0), vx = rows.reduce((a, r) => a + (r.sum - mx) ** 2, 0);
  console.log(`slope: ${((cov / vx) * 100).toFixed(1)} win-% per bar point   spread: ${((rows[0].wr - rows.at(-1).wr) * 100).toFixed(1)} pts   ${res.length} matches in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
