// Full tournament simulations (headless) to balance the condition economy.
//   node tools/tourney.mjs [tournaments=4] [policy=auto|none|flat]   (flat: everyone always at 75 = no condition effect)
// Prints per-round averages of stamina / morale / fame, purchases, fatality rate, and how much
// condition explains the results.
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const self = fileURLToPath(import.meta.url);

async function runOne({ seed, policy }) {
  const T = await import('../src/tournament/tournament.js');
  const t = T.createTournament({ seed });
  if (policy === 'none') for (const id of t.ids) t.fighters[id].auto = false;
  const perRound = [];
  let fat = 0, finishes = 0, condWins = 0, condGames = 0;
  t.rounds.forEach((round, ri) => {
    for (const m of round) {
      const [ca, cb] = [m.a, m.b].map((id) => t.fighters[id].stamina + t.fighters[id].morale);
      const r = new T.MatchRunner(t, m);
      r.finish();
      const res = r.record();
      if (policy === 'flat') for (const id of t.ids) Object.assign(t.fighters[id], { stamina: 75, morale: 75 }); // condition switched off
      if (res.winner !== 'draw' && Math.abs(ca - cb) >= 30) { condGames++; if ((res.winner === 0) === (ca > cb)) condWins++; }
      if (res.sides.some((s) => s.fatality)) fat++;
      finishes++;
    }
    const fs = t.ids.map((id) => t.fighters[id]);
    const avg = (k) => fs.reduce((a, f) => a + f[k], 0) / fs.length;
    const buys = Object.values(t.camp[ri] || {}).flat().length;
    perRound.push({ st: avg('stamina'), mo: avg('morale'), fame: avg('fame'), spent: avg('spentFame'), buys, minSt: Math.min(...fs.map((f) => f.stamina)), minMo: Math.min(...fs.map((f) => f.morale)) });
  });
  const ranks = Object.fromEntries(T.standings(t).map((r, i) => [r.id, i + 1]));
  return { perRound, fat, finishes, condWins, condGames, ranks };
}

if (process.argv[2] === '--worker') {
  process.on('message', async (j) => { process.send(await runOne(j)); process.exit(0); });
} else {
  const n = Number(process.argv[2] || 4), policy = process.argv[3] || 'auto';
  const t0 = Date.now();
  const k = Math.min(os.cpus().length, n);
  const out = [];
  for (let i = 0; i < n; i += k) {
    const batch = Array.from({ length: Math.min(k, n - i) }, (_, j) => ({ seed: 1000 + i + j, policy }));
    out.push(...await Promise.all(batch.map((job) => new Promise((r) => { const w = fork(self, ['--worker']); w.on('message', r); w.send(job); }))));
  }
  console.log(`policy ${policy}, ${n} tournaments`);
  console.log('round  stamina(min)  morale(min)   fame  spent  buys');
  for (let r = 0; r < out[0].perRound.length; r++) {
    const a = (key) => out.reduce((s, o) => s + o.perRound[r][key], 0) / out.length;
    console.log(`${String(r + 1).padStart(5)}  ${a('st').toFixed(0).padStart(5)} (${a('minSt').toFixed(0).padStart(3)})   ${a('mo').toFixed(0).padStart(5)} (${a('minMo').toFixed(0).padStart(3)})  ${a('fame').toFixed(0).padStart(5)}  ${a('spent').toFixed(0).padStart(5)}  ${a('buys').toFixed(1).padStart(4)}`);
  }
  const fat = out.reduce((s, o) => s + o.fat, 0), fin = out.reduce((s, o) => s + o.finishes, 0);
  const cw = out.reduce((s, o) => s + o.condWins, 0), cg = out.reduce((s, o) => s + o.condGames, 0);
  const ids = Object.keys(out[0].ranks);
  const avgRank = ids.map((id) => [id, out.reduce((s, o) => s + o.ranks[id], 0) / out.length]).sort((a, b) => a[1] - b[1]);
  console.log('avg final place: ' + avgRank.map(([id, r]) => `${id} ${r.toFixed(1)}`).join(', '));
  console.log(`fatality rate ${(100 * fat / fin).toFixed(0)}%   better condition (≥30 pts) wins ${(100 * cw / Math.max(1, cg)).toFixed(0)}% of ${cg} matches   ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
