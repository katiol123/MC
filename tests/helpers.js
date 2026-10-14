// Shared helpers for simulation tests: scripted inputs and match stepping.
import { Match } from '../src/game/match.js';
import { emptyRaw } from '../src/input/inputBuffer.js';

export const raw = (o = {}) => ({ ...emptyRaw(), ...o });

/** Creates a match already in the 'fight' phase. */
export function fightingMatch(opts = {}) {
  const m = new Match({ p1: 'brick', p2: 'jax', ...opts });
  let guard = 0;
  while (m.phase !== 'fight' && guard++ < 500) m.tick([raw(), raw()]);
  return m;
}

/** Runs n ticks with constant inputs (or a function (tick) => [r1, r2]). Collects events. */
export function run(m, n, inputs = () => [raw(), raw()]) {
  const events = [];
  for (let i = 0; i < n; i++) {
    const inp = typeof inputs === 'function' ? inputs(i) : inputs;
    for (const e of m.tick(inp)) events.push({ ...e, at: m.frame });
  }
  return events;
}

/** Places fighters at given x positions facing each other, idle. */
export function place(m, x1, x2) {
  const [a, b] = m.fighters;
  a.body.x = a.body.prevX = x1;
  b.body.x = b.body.prevX = x2;
  a.facing = x1 < x2 ? 1 : -1;
  b.facing = -a.facing;
  for (const f of [a, b]) {
    f.setState('idle', {}, 'idle', { blend: 0 });
    f.updatePose();
    f.snapshot();
  }
}

/** Inputs that press a button for one tick at tick 0 (relative directions resolved for facing). */
export function tap(btn, extra = {}) {
  return (i) => [i === 0 ? raw({ [btn]: true, ...extra }) : raw(), raw()];
}
