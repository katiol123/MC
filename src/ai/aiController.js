// CPU opponent. Produces the same raw input a keyboard would (so it obeys every game rule),
// perceives the opponent with a reaction delay, and plays footsies: spacing, pokes, blocking,
// anti-airs, whiff punishes and short cancel combos executed as input macros (incl. motions).
import { Rng } from '../core/rng.js';
import { emptyRaw } from '../input/inputBuffer.js';

export const AI_LEVELS = {
  easy: { reaction: 24, block: 0.25, antiAir: 0.15, aggression: 0.35, combo: 0.25, punish: 0.3, think: [10, 22] },
  normal: { reaction: 15, block: 0.55, antiAir: 0.45, aggression: 0.5, combo: 0.6, punish: 0.6, think: [6, 14] },
  hard: { reaction: 9, block: 0.82, antiAir: 0.75, aggression: 0.6, combo: 0.9, punish: 0.9, think: [3, 9] },
};

const M = {
  s1: [{ d: 'd', n: 2 }, { d: 'df', n: 2 }, { d: 'f', b: ['lp'], n: 2 }],
  s2: [{ d: 'f', n: 2 }, { d: 'd', n: 2 }, { d: 'df', b: ['hp'], n: 2 }],
  s3: [{ d: 'd', n: 2 }, { d: 'db', n: 2 }, { d: 'b', b: ['hk'], n: 2 }],
};
const press = (b, d = '') => [{ d, b: [b], n: 2 }, { d, n: 1 }];

export class AIController {
  constructor(index, { level = 'normal', seed = 1234 } = {}) {
    this.index = index;
    this.cfg = AI_LEVELS[level] || AI_LEVELS.normal;
    this.rng = new Rng(seed + index * 977);
    this.macro = [];
    this.step = 0;
    this.stepLeft = 0;
    this.cooldown = 0;
    this.memory = [];
    this.hold = null; // { d, n } sustained direction (blocking / walking)
    this.blockedMove = null;
    this.comboPlan = null;
  }

  queue(steps) {
    this.macro = steps.map((s) => ({ ...s }));
    this.step = 0;
    this.stepLeft = this.macro[0]?.n || 0;
    this.hold = null;
  }

  perceive(match) {
    const op = match.fighters[1 - this.index];
    this.memory.push({
      x: op.body.x, y: op.body.y, vy: op.body.vy, vx: op.body.vx, state: op.state,
      phase: op.movePhase(), move: op.move?.def ?? null, airborne: !op.body.onGround,
    });
    if (this.memory.length > 40) this.memory.shift();
    return this.memory[Math.max(0, this.memory.length - 1 - this.cfg.reaction)];
  }

  /** Converts a relative direction ('f','db',...) into raw left/right/up/down for this facing. */
  toRaw(d, buttons, facing) {
    const r = emptyRaw();
    if (d.includes('u')) r.up = true;
    if (d.includes('d')) r.down = true;
    if (d.includes('f')) facing > 0 ? (r.right = true) : (r.left = true);
    if (d.includes('b')) facing > 0 ? (r.left = true) : (r.right = true);
    for (const b of buttons || []) r[b] = true;
    return r;
  }

  input(match) {
    const me = match.fighters[this.index];
    const seen = this.perceive(match);
    if (match.phase !== 'fight') return emptyRaw();
    // Run the current macro.
    if (this.step < this.macro.length) {
      const s = this.macro[this.step];
      const raw = this.toRaw(s.d || '', s.b, me.facing);
      if (--this.stepLeft <= 0) {
        this.step++;
        this.stepLeft = this.macro[this.step]?.n || 0;
      }
      return raw;
    }
    this.decideCombo(me);
    if (this.step < this.macro.length) return this.input(match);
    if (this.cooldown > 0) {
      this.cooldown--;
      if (this.hold && this.hold.n-- > 0) return this.toRaw(this.hold.d, null, me.facing);
      return emptyRaw();
    }
    this.decide(match, me, seen);
    if (this.step < this.macro.length) return this.input(match);
    if (this.hold && this.hold.n-- > 0) return this.toRaw(this.hold.d, null, me.facing);
    return emptyRaw();
  }

  decideCombo(me) {
    // Cancel follow-ups once a move connected.
    const mv = me.move;
    if (!mv || !mv.contact || mv.contact === 'clash' || this.comboPlan === mv) return;
    this.comboPlan = mv;
    if (!this.rng.chance(this.cfg.combo)) return;
    const id = mv.def.id;
    const r = this.rng;
    if (id === 'lp') this.queue(r.chance(0.5) ? press('lp') : r.chance(0.5) ? press('hp') : M.s1);
    else if (id === 'clp') this.queue(r.chance(0.5) ? press('lk', 'd') : press('hp', 'd'));
    else if (id === 'clk') this.queue(r.chance(0.6) ? M.s1 : press('hk', 'd'));
    else if (id === 'lk') this.queue(r.chance(0.5) ? press('hk') : M.s3);
    else if ((id === 'hp' || id === 'chp') && mv.contact === 'hit') this.queue(r.chance(0.5) ? M.s1 : M.s2);
  }

  decide(match, me, op) {
    const cfg = this.cfg, r = this.rng;
    const opF = match.fighters[1 - this.index];
    const dist = Math.abs(op.x - me.body.x);
    this.cooldown = r.int(cfg.think[0], cfg.think[1]);
    if (!me.actionable && me.state !== 'land') return;

    // Defence: block an attack we have "seen" coming.
    if (op.move && (op.phase === 'startup' || op.phase === 'active') && dist < 300) {
      if (this.blockedMove !== op.move && r.chance(cfg.block)) {
        this.blockedMove = op.move;
        const low = op.move.height === 'low' || (op.move.height !== 'overhead' && r.chance(0.3));
        this.hold = { d: low ? 'db' : 'b', n: op.move.startup + op.move.active + 10 };
        this.cooldown = this.hold.n;
        return;
      }
    }
    // Anti-air.
    if (op.airborne && op.state === 'jump' && dist < 230 && op.vy < 4) {
      if (r.chance(cfg.antiAir)) {
        this.queue(r.chance(0.5) ? [{ d: 'd', n: 3 }, ...press('hp', 'd')] : M.s2);
        return;
      }
      this.hold = { d: 'b', n: 20 };
      return;
    }
    // Whiff punish.
    if (op.phase === 'recovery' && dist < 230 && r.chance(cfg.punish)) {
      this.queue(dist < 140 ? press('hp') : M.s1);
      return;
    }
    // Opponent knocked down: approach for pressure.
    if (opF.state === 'knockdown' || opF.state === 'getup') {
      this.hold = { d: dist > 120 ? 'f' : '', n: 12 };
      return;
    }
    const aggr = cfg.aggression;
    if (dist > 330) {
      if (r.chance(0.25 * aggr)) this.queue([{ d: 'f', n: 2 }, { d: '', n: 2 }, { d: 'f', n: 3 }]); // dash
      else if (r.chance(0.08)) this.queue([{ d: 'uf', n: 3 }]);
      else this.hold = { d: 'f', n: r.int(10, 24) };
      return;
    }
    if (dist > 190) {
      const roll = r.next();
      if (roll < 0.22 * aggr + 0.1) this.queue(M.s1);
      else if (roll < 0.35) this.queue(press('hk'));
      else if (roll < 0.45 && r.chance(aggr)) this.queue([{ d: 'uf', n: 3 }, { d: '', n: 14 }, { d: '', b: ['hk'], n: 2 }]);
      else if (roll < 0.75) this.hold = { d: 'f', n: r.int(6, 16) };
      else this.hold = { d: 'b', n: r.int(6, 14) };
      return;
    }
    // Close range.
    const roll = r.next();
    if (roll < 0.25) this.queue(press('lp'));
    else if (roll < 0.42) this.queue(press('lk', 'd'));
    else if (roll < 0.55) this.queue(press('lk'));
    else if (roll < 0.63) this.queue(press('hk', 'd'));
    else if (roll < 0.7) this.queue(M.s3);
    else if (roll < 0.78) this.queue([{ d: 'b', n: 2 }, { d: '', n: 2 }, { d: 'b', n: 3 }]); // back dash
    else this.hold = { d: r.chance(0.5) ? 'db' : 'b', n: r.int(8, 18) };
  }
}
