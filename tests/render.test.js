// Runs the real renderer (HUD, effects, trails, projectiles, super cut-in, debug overlay) against a
// stub canvas during full CPU fights, so a crash in any drawing path fails the test suite.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const stubCtx = new Proxy({}, {
  get: (t, k) => {
    if (k in t) return t[k];
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (k === 'measureText') return () => ({ width: 10 });
    return () => {};
  },
  set: (t, k, v) => { t[k] = v; return true; },
});
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => stubCtx }) };

test('renderer survives every move type in full CPU fights (incl. supers, throws, projectiles)', async () => {
  const { Match } = await import('../src/game/match.js');
  const { AIController } = await import('../src/ai/aiController.js');
  const { FightRenderer } = await import('../src/render/fightRenderer.js');
  const { ROSTER } = await import('../src/data/fighters.js');
  let supers = 0, throws = 0, projectiles = 0;
  for (let k = 0; k < 8; k++) {
    const m = new Match({ p1: ROSTER[k].id, p2: ROSTER[(k + 1) % 8].id, roundsToWin: 1, roundTime: 40 });
    const r = new FightRenderer(m, { arena: k % 2 ? 'night' : 'dusk', portraits: {} });
    const ai = [new AIController(0, { level: 'hard', seed: k }), new AIController(1, { level: 'hard', seed: k + 9 })];
    for (let t = 0; t < 60 * 45 && m.phase !== 'over'; t++) {
      if (t % 300 === 0) for (const f of m.fighters) f.meter = 100; // force supers to show up
      const ev = m.tick([ai[0].input(m), ai[1].input(m)]);
      supers += ev.filter((e) => e.type === 'superStart').length;
      throws += ev.filter((e) => e.type === 'grab').length;
      projectiles += ev.filter((e) => e.type === 'projectile').length;
      r.onTick(ev);
      if (t % 2 === 0) r.render(stubCtx, 0.5, { debug: { enabled: t % 4 === 0, timeScale: 1, paused: false }, now: t * 16 });
    }
  }
  assert.ok(supers > 0 && throws > 0 && projectiles > 0, `exercised supers ${supers}, throws ${throws}, projectiles ${projectiles}`);
});
