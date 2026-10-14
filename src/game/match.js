// Match simulation: two fighters, rounds, timer, KO handling. Pure and deterministic: given the
// same per-tick inputs it always produces the same result, regardless of how often it is rendered.
import { TUNING } from '../config/tuning.js';
import { STAGE_CENTER } from '../config/constants.js';
import { Fighter } from '../fighter/fighter.js';
import { buildFighterDef } from '../data/fighters.js';
import { resolvePushboxes, enforceSeparation } from '../physics/world.js';
import { resolveExchange } from '../combat/hitResolver.js';
import { emptyRaw } from '../input/inputBuffer.js';

const START_GAP = 170;
const INTRO_TICKS = 110;
const KO_SLOW_TICKS = 70;

export class Match {
  /**
   * opts: { p1, p2 (fighter ids), roundsToWin, roundTime (seconds, 0 = infinite), training }
   */
  constructor(opts = {}) {
    this.opts = { roundsToWin: 2, roundTime: TUNING.roundTimeSeconds, training: false, ...opts };
    const d1 = buildFighterDef(this.opts.p1 || 'brick');
    const d2 = buildFighterDef(this.opts.p2 || 'jax');
    this.fighters = [
      new Fighter(d1, 0, STAGE_CENTER - START_GAP, 1),
      new Fighter(d2, 1, STAGE_CENTER + START_GAP, -1),
    ];
    this.events = [];
    for (const f of this.fighters) f.emit = (e) => this.events.push(e);
    this.restart();
  }

  restart() {
    this.wins = [0, 0];
    this.round = 0;
    this.winner = null;
    this.frame = 0;
    this.startRound();
  }

  startRound() {
    this.round++;
    this.phase = 'intro';
    this.phaseTick = 0;
    this.slow = 0;
    this.timer = this.opts.roundTime > 0 ? this.opts.roundTime * 60 : Infinity;
    this.roundResult = null;
    this.posed = false;
    const [a, b] = this.fighters;
    a.reset(STAGE_CENTER - START_GAP, 1);
    b.reset(STAGE_CENTER + START_GAP, -1);
    for (const f of this.fighters) f.setState('intro', {}, 'neutral', { blend: 0 });
    this.events.push({ type: 'roundIntro', round: this.round });
  }

  get timeLeft() {
    return this.timer === Infinity ? Infinity : Math.ceil(this.timer / 60);
  }

  /** Advances one simulation tick. inputs: [raw1, raw2]. Returns events produced this tick. */
  tick(inputs = [emptyRaw(), emptyRaw()]) {
    this.events = [];
    for (const f of this.fighters) f.emit = (e) => this.events.push(e);
    this.frame++;
    this.phaseTick++;
    const fighting = this.phase === 'fight';
    const raws = fighting ? inputs : [emptyRaw(), emptyRaw()];

    if (this.phase === 'intro') {
      if (this.phaseTick === 40) this.events.push({ type: 'announce', text: `ROUND ${this.round}` });
      if (this.phaseTick >= INTRO_TICKS) {
        this.phase = 'fight';
        this.phaseTick = 0;
        this.events.push({ type: 'announce', text: 'FIGHT!' });
        for (const f of this.fighters) f.setState('idle', {}, 'idle', { blend: 8 });
      }
    }

    // KO slow motion: the world advances every other tick for a moment.
    const skip = this.slow > 0 && this.slow-- % 2 === 1;
    if (!skip) this.step(raws);
    else for (const f of this.fighters) f.snapshot();

    if (this.phase === 'fight') this.updateFight();
    else if (this.phase === 'ko' || this.phase === 'timeup') this.updateRoundEnd();
    else if (this.phase === 'result' && this.phaseTick >= 150) this.nextRound();
    return this.events;
  }

  step(raws) {
    const [a, b] = this.fighters;
    a.snapshot();
    b.snapshot();
    a.pushInput(raws[0]);
    b.pushInput(raws[1]);
    const movedA = a.update(b);
    const movedB = b.update(a);
    resolvePushboxes(a.body, b.body, a.facing);
    enforceSeparation(a.body, b.body);
    for (const [f, o] of [[a, b], [b, a]]) {
      if (f.canTurn && f.body.onGround) {
        const want = Math.sign(o.body.x - f.body.x);
        if (want !== 0 && want !== f.facing) {
          f.facing = want;
          this.events.push({ type: 'turn', who: f.index });
        }
      }
    }
    // Frozen (hitstop) fighters keep their pose but their volumes follow any position change.
    a.updatePose(movedA);
    b.updatePose(movedB);
    const ev = resolveExchange(a, b);
    for (const e of ev) this.events.push(e);
  }

  updateFight() {
    const [a, b] = this.fighters;
    if (this.opts.training) {
      // Training: nobody dies, health refills once a combo is over.
      for (const f of this.fighters) {
        if (f.health <= 0) f.health = 1;
        if (f.actionable && f.stateFrame > 50 && f.health < f.maxHealth) f.health = f.maxHealth;
      }
      if (a.state === 'ko') a.setState('juggle', { knockdown: true }, 'airHit');
      if (b.state === 'ko') b.setState('juggle', { knockdown: true }, 'airHit');
      return;
    }
    this.timer--;
    const koA = a.health <= 0, koB = b.health <= 0;
    if (koA || koB) {
      this.phase = 'ko';
      this.phaseTick = 0;
      this.slow = KO_SLOW_TICKS;
      this.roundResult = koA && koB ? 'draw' : koA ? 1 : 0;
      this.events.push({ type: 'ko', winner: this.roundResult, double: koA && koB });
      this.events.push({ type: 'announce', text: koA && koB ? 'DOUBLE K.O.' : 'K.O.' });
      return;
    }
    if (this.timer <= 0) {
      this.phase = 'timeup';
      this.phaseTick = 0;
      const ra = a.health / a.maxHealth, rb = b.health / b.maxHealth;
      this.roundResult = Math.abs(ra - rb) < 1e-6 ? 'draw' : ra > rb ? 0 : 1;
      this.events.push({ type: 'announce', text: 'TIME' });
    }
  }

  /** Waits for the action to settle after KO / time-out, then plays victory poses. */
  updateRoundEnd() {
    const settled = this.fighters.every((f) =>
      ['idle', 'crouch', 'walkF', 'walkB', 'guardHigh', 'guardLow', 'run', 'ko', 'knockdown', 'getup', 'land', 'victory', 'defeat', 'dizzy'].includes(f.state) &&
      f.body.onGround && f.hitstop === 0 && (f.state !== 'ko' || f.sd.landed));
    if (!this.posed && (settled || this.phaseTick > 240) && this.phaseTick > 50) {
      this.posed = true;
      const res = this.roundResult;
      if (res !== 'draw') {
        const w = this.fighters[res], l = this.fighters[1 - res];
        this.wins[res]++;
        if (w.state !== 'ko') w.setState('victory', {}, 'victory', { blend: 10, params: { variant: w.def.look.victory || 0 } });
        if (l.state !== 'ko') l.setState('defeat', {}, 'defeat', { blend: 10 });
      } else {
        for (const f of this.fighters) if (f.state !== 'ko') f.setState('defeat', {}, 'defeat', { blend: 10 });
      }
      this.events.push({ type: 'roundEnd', result: res, wins: this.wins.slice() });
      const need = this.opts.roundsToWin;
      if (this.wins[0] >= need || this.wins[1] >= need) {
        this.winner = this.wins[0] >= need ? 0 : 1;
        this.events.push({ type: 'matchEnd', winner: this.winner });
      } else if (res === 'draw' && this.round >= 9) {
        this.winner = 'draw';
        this.events.push({ type: 'matchEnd', winner: 'draw' });
      }
      this.phase = 'result';
      this.phaseTick = 0;
    }
  }

  nextRound() {
    if (this.winner !== null) {
      this.phase = 'over';
      return;
    }
    this.posed = false;
    this.startRound();
  }
}
