// Turns authored move data into runtime form. Sequence moves (multi-hit specials and supers) are
// lists of steps; each step reuses an existing attack animation and gets its own hit window and
// hit spec. Frame data (startup/active/recovery) is derived so all generic code keeps working.
import { MOVES } from './moves.js';

/** Default hitboxes per animation, taken from the base move that uses that animation. */
const ANIM_HITBOXES = {};
for (const m of Object.values(MOVES)) if (m.hitboxes?.length && !ANIM_HITBOXES[m.anim]) ANIM_HITBOXES[m.anim] = m.hitboxes;
ANIM_HITBOXES.chop = [{ a: 'elbowF', b: 'handF', r: 15 }, { a: 'elbowB', b: 'handB', r: 15 }];

const SPEC_DEFAULTS = {
  damage: 40, stun: 0, hitstun: 30, blockstun: 16, hitstop: 6, height: 'mid', reaction: 'light',
  push: { hit: 1.4, block: 2.6 }, launch: { vx: 3, vy: 6 }, juggle: 0, strength: 'heavy',
};

export function compileMove(id, m) {
  const move = { id, ...m };
  if (move.super) {
    move.cost = move.cost ?? 100;
  }
  if (!move.steps) return move;
  let t = 0;
  let firstHit = Infinity, lastHit = 0;
  move.steps = move.steps.map((s, i) => {
    const len = s.len + (i === m.steps.length - 1 ? m.recoveryAfter || 12 : 0);
    const st = { ...s, len, start: t + 1, end: t + len };
    if (s.hit && s.hitAt) {
      st.hitFrom = t + s.hitAt;
      st.hitTo = st.hitFrom + (s.hitLen || 2) - 1;
      firstHit = Math.min(firstHit, st.hitFrom);
      lastHit = Math.max(lastHit, st.hitTo);
      st.spec = {
        ...SPEC_DEFAULTS,
        priority: move.priority ?? 4,
        isSpecial: true,
        ...s.hit,
        id: `${id}#${i}`,
        anim: s.anim,
        hitboxes: s.hit.hitboxes || ANIM_HITBOXES[s.anim] || [],
        // sequences have their own fixed hit count: exempt from repeat/juggle limits
        comboExempt: true,
        juggleIgnore: true,
        super: !!move.super,
        chip: move.super || move.chip,
      };
    }
    t += len;
    return st;
  });
  move.startup = firstHit === Infinity ? t : firstHit - 1;
  move.active = firstHit === Infinity ? 0 : lastHit - move.startup;
  move.recovery = t - (move.startup + move.active);
  move.hitboxes = [];
  if (move.super && !move.invuln) move.invuln = [{ from: 1, to: move.startup, parts: ['all'] }];
  return move;
}
