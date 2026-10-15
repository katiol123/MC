// Fighter = state machine + physical body + animation player + collision volumes.
// The state machine decides what the fighter is doing (from buffered input), sets target
// velocities on the body and starts animation clips. Collision volumes are rebuilt from the
// simulated skeleton after movement each tick.
import { TUNING } from '../config/tuning.js';
import { Body } from '../physics/body.js';
import { InputBuffer } from '../input/inputBuffer.js';
import { Animator } from '../anim/animator.js';
import { computeSkeleton, centerOfGravity, clonePose, lowestPoint } from '../anim/skeleton.js';
import { buildHurtboxes, buildHitboxes } from '../combat/boxes.js';
import { SPECIAL_ORDER } from '../data/moves.js';
import { sequenceStep } from '../anim/clips.js';
import { STAGE } from '../config/constants.js';

export const ACTIONABLE = new Set(['idle', 'walkF', 'walkB', 'crouch', 'guardHigh', 'guardLow', 'run']);
const BLOCKABLE = new Set(['idle', 'walkF', 'walkB', 'crouch', 'guardHigh', 'guardLow', 'blockstun', 'land']);
const CAN_TURN = new Set(['idle', 'walkF', 'walkB', 'crouch', 'guardHigh', 'guardLow', 'land', 'intro']);
const NORMAL_ORDER = ['hk', 'hp', 'lk', 'lp'];

export class Fighter {
  constructor(def, index, x, facing) {
    this.def = def;
    this.props = def.props;
    this.stats = def.stats;
    this.index = index;
    this.body = new Body({ x, mass: def.stats.mass, pushW: def.stats.pushW });
    this.facing = facing;
    this.stance = 0; // 0 = orthodox, 1 = switched (lead/rear limbs mirrored)
    this.input = new InputBuffer();
    this.anim = new Animator(this.props);
    this.maxHealth = def.stats.health;
    // MOBILITY also means agility: quicker landings and wake-ups (1 = roster average)
    this.agility = def.stats.agility ?? 1;
    this.meter = 0; // super meter (0..100), kept between rounds
    this.emit = () => {};
    this.spawnProjectile = null; // set by the match
    this.projectileOut = false;
    this.reset(x, facing);
  }

  reset(x, facing) {
    this.body.x = this.body.prevX = x;
    this.body.y = this.body.prevY = 0;
    this.body.vx = this.body.vy = 0;
    this.body.onGround = true;
    this.body.gravityScale = 1;
    this.facing = facing;
    this.stance = 0;
    this.health = this.maxHealth;
    this.stun = 0;
    this.sinceHit = 0;
    this.hitstop = 0;
    this.superLock = 0; // after a super, meter cannot grow for a while (anti-spam)
    this.throwProtect = 0;
    this.burn = 0; // ticks left on fire
    this.pulled = null; // being reeled in by a pull
    this.focus = 0; // ticks of Focus left (+damage)
    this.finishable = false; // losing this round loses the match: a lethal hit leaves them dazed (FINISH HIM)
    this.fatalityReady = false; // winner during the finish window: 236236 + K performs the fatality
    this.scriptPose = null; // fatality cutscene: pose set by the director
    this.fx = null; // fatality cutscene: render-only effects (tint, scale, alpha...)
    this.critical = false; // battered look + heavy breathing (health below TUNING.criticalHealth)
    this.move = null;
    this.combo = { hits: 0, damage: 0, juggle: 0, moves: {} }; // combo being taken
    this.chainLen = 0;
    this.walkDist = 0;
    this.airDir = 0;
    this.airAttackUsed = false;
    this.dizzyPending = false;
    this.lastHit = null; // debug: last hit attempt result
    this.hitLog = [];
    this.flash = 0;
    this.state = 'idle';
    this.stateFrame = 0;
    this.sd = {};
    this.anim.play('idle', { blend: 0 });
    this.updatePose();
    this.snapshot();
  }

  // --- helpers -------------------------------------------------------------------------------
  get grounded() {
    return this.body.onGround;
  }
  get crouching() {
    return this.state === 'crouch' || this.state === 'guardLow' || (this.state === 'blockstun' && this.sd.low) ||
      (this.state === 'hitstun' && this.sd.crouch) || (this.state === 'attack' && this.move?.def.stance === 'crouch');
  }
  get actionable() {
    return ACTIONABLE.has(this.state);
  }
  get canTurn() {
    return CAN_TURN.has(this.state);
  }
  isAttackingActive() {
    return this.state === 'attack' && this.move && this.move.frame <= this.move.def.startup + this.move.def.active;
  }
  movePhase() {
    if (!this.move) return null;
    const m = this.move.def, f = this.move.frame;
    return f <= m.startup ? 'startup' : f <= m.startup + m.active ? 'active' : 'recovery';
  }
  /** Is the player holding away from a world x position (uses raw input so cross-ups block correctly). */
  holdingAwayFrom(x) {
    const raw = this.input.lastRaw;
    if (!raw) return false;
    return x > this.body.x ? raw.left && !raw.right : raw.right && !raw.left;
  }
  holdingDown() {
    return this.input.down;
  }

  setState(name, data = {}, clip = null, clipOpts = {}) {
    this.state = name;
    this.stateFrame = 0;
    this.sd = data;
    if (clip) this.anim.play(clip, clipOpts);
    if (ACTIONABLE.has(name)) this.resetComboTaken();
  }

  resetComboTaken() {
    if (this.combo.hits > 0) this.emit({ type: 'comboEnd', who: this.index, hits: this.combo.hits, damage: this.combo.damage });
    this.combo = { hits: 0, damage: 0, juggle: 0, moves: {} };
    this.body.gravityScale = 1;
  }

  /** Snapshot for render interpolation (taken before each simulation tick). */
  snapshot() {
    this.prev = { x: this.body.x, y: this.body.y, pose: clonePose(this.anim.pose), facing: this.facing };
  }

  pushInput(raw) {
    // frames spent in hitstop do not age buffered presses (lets players buffer cancels during hitstop)
    this.input.push(raw, this.facing, this.hitstop > 0);
    this.input.lastRaw = raw;
  }

  // --- main update ---------------------------------------------------------------------------
  /** Adds super meter unless the post-super cooldown is running. */
  gainMeter(n) {
    if (this.superLock > 0 || !(n > 0)) return;
    this.meter = Math.min(TUNING.superCost, this.meter + n);
  }

  update(opp) {
    if (this.flash > 0) this.flash--;
    if (this.state === 'scripted') {
      // fatality cutscene: the director drives position and pose
      this.stateFrame++;
      return false;
    }
    if (this.superLock > 0) this.superLock--;
    if (this.state === 'thrown') {
      // position is driven by the thrower (see resolveThrows); no own physics
      this.stateFrame++;
      return true;
    }
    if (this.hitstop > 0) {
      this.hitstop--;
      return false;
    }
    this.stateFrame++;
    if (this.throwProtect > 0) this.throwProtect--;
    if (this.focus > 0) this.focus--;
    // the stun meter only recovers after a pause in the punishment
    this.sinceHit++;
    if (this.sinceHit > TUNING.stunRecoverDelay && this.state !== 'dizzy') this.stun = Math.max(0, this.stun - TUNING.stunDecayPerTick);
    this.think(opp);
    const sliding = ['hitstun', 'blockstun', 'stagger', 'knockdown', 'ko', 'dizzy', 'getup', 'victory', 'defeat', 'dazed'].includes(this.state);
    if (this.pulled) {
      // hooked (Old Hawk's Talon Pull): reeled in to just in front of the puller
      const p = this.pulled, target = opp.body.x + opp.facing * (opp.body.pushW + this.body.pushW + p.gap);
      const k = Math.min(1, ++p.t / p.ticks);
      this.body.x += (target - this.body.x) * (0.08 + 0.4 * k * k);
      this.body.vx = 0;
      if (p.t >= p.ticks || this.state !== 'hitstun') this.pulled = null;
    }
    this.body.integrate({ friction: sliding });
    if (this.body.justLanded) this.onLand();
    return true;
  }

  think(opp) {
    const s = this.state;
    const b = this.body;
    const inp = this.input;
    switch (s) {
      case 'intro':
      case 'victory':
      case 'defeat':
      case 'dazed':
        b.steer(0, 1);
        return;
      case 'idle':
      case 'walkF':
      case 'walkB':
      case 'crouch':
      case 'guardHigh':
      case 'guardLow':
      case 'run':
        return this.groundControl(opp);
      case 'land':
        b.steer(0, 1.2);
        if (this.stateFrame >= this.sd.duration) return this.groundControl(opp, true);
        if (!this.sd.locked && this.stateFrame > 2) return this.groundControl(opp, true);
        return;
      case 'prejump':
        b.steer(0, 1);
        if (this.stateFrame >= TUNING.prejumpFrames) this.launchJump();
        return;
      case 'jump':
        if (!this.airAttackUsed && this.tryAttack(opp, 'air')) return;
        return;
      case 'dashF': {
        const d = this.sd.duration;
        const t = this.stateFrame / d;
        b.vx = this.facing * this.stats.dash * Math.max(0, 1 - t * t);
        if (this.stateFrame > 6 && this.tryAttack(opp, 'ground')) return;
        if (this.stateFrame >= d) {
          if (inp.forward) return this.setState('run', {}, 'run', { blend: 6 });
          return this.setState('idle', {}, 'idle', { blend: 6 });
        }
        return;
      }
      case 'dashB': {
        const d = this.sd.duration;
        const t = this.stateFrame / d;
        b.vx = -this.facing * this.stats.dash * 0.85 * Math.max(0, 1 - t);
        if (this.stateFrame >= d) this.setState('idle', {}, 'idle', { blend: 6 });
        return;
      }
      case 'attack':
        return this.updateAttack(opp);
      case 'throwing':
        b.steer(0, 1.2);
        if (this.stateFrame >= this.sd.def.duration) this.recoverToNeutral();
        return;
      case 'hitstun':
      case 'blockstun':
      case 'stagger':
        if (this.stateFrame >= this.sd.duration) {
          this.recoverToNeutral();
        }
        return;
      case 'juggle':
      case 'ko':
        return; // ballistic; landing handled in onLand
      case 'knockdown':
        if (this.stateFrame >= this.sd.duration) {
          const gu = Math.round(TUNING.getupFrames / this.agility);
          this.setState('getup', { duration: gu }, 'getup', { blend: 4, params: { duration: gu } });
        }
        return;
      case 'getup':
        if (this.stateFrame >= this.sd.duration) this.recoverToNeutral();
        return;
      case 'dizzy':
        if (this.stateFrame >= this.sd.duration) {
          this.stun = 0;
          this.recoverToNeutral();
        }
        return;
      default:
        return;
    }
  }

  recoverToNeutral() {
    // a full stun meter makes the fighter dizzy as soon as they are back on their feet
    // (after hitstun, a stagger, or getting up from the knockdown the combo ended with)
    if (this.dizzyPending && ['hitstun', 'stagger', 'getup', 'land'].includes(this.state) && this.health > 0) {
      this.dizzyPending = false;
      this.emit({ type: 'dizzy', who: this.index });
      return this.setState('dizzy', { duration: TUNING.dizzyFrames }, 'dizzy', { blend: 8 });
    }
    // a few frames of throw immunity after being hit, blocking or waking up (no unavoidable throws)
    if (['hitstun', 'blockstun', 'stagger', 'getup', 'dizzy', 'land'].includes(this.state)) this.throwProtect = 6;
    if (this.input.down) this.setState('crouch', {}, 'crouch', { blend: 6 });
    else this.setState('idle', {}, 'idle', { blend: 7 });
  }

  /** Free movement on the ground: attacks, jumps, dashes, crouch, walk, block. */
  groundControl(opp, fromLanding = false) {
    const inp = this.input;
    const b = this.body;
    if (this.tryAttack(opp, 'ground')) return;
    if (inp.pressed('stance')) {
      inp.consume('stance');
      this.stance ^= 1;
      this.emit({ type: 'stance', who: this.index, stance: this.stance });
    }
    const threat = opp && opp.threatens(this);
    const awayFromOpp = opp ? this.holdingAwayFrom(opp.body.x) : inp.back;
    if (inp.up) {
      const dir = inp.dir === 9 ? 1 : inp.dir === 7 ? -1 : 0;
      this.setState('prejump', { dir, fromRun: this.state === 'run' }, 'prejump', { blend: 2 });
      return;
    }
    if (this.state !== 'run' && inp.doubleTap(6)) {
      this.emit({ type: 'dash', who: this.index, dir: 1 });
      return this.setState('dashF', { duration: 16 }, 'dashF', { blend: 3, params: { duration: 16 } });
    }
    if (inp.doubleTap(4)) {
      this.emit({ type: 'dash', who: this.index, dir: -1 });
      return this.setState('dashB', { duration: 18 }, 'dashB', { blend: 3, params: { duration: 18 } });
    }
    let next;
    if (inp.down) next = awayFromOpp && threat ? 'guardLow' : 'crouch';
    else if (this.state === 'run' && inp.forward) next = 'run';
    else if (inp.back) next = awayFromOpp && threat ? 'guardHigh' : 'walkB';
    else if (inp.forward) next = 'walkF';
    else next = 'idle';

    if (next !== this.state || fromLanding) {
      const clip = { idle: 'idle', crouch: 'crouch', walkF: 'walk', walkB: 'walk', run: 'run', guardHigh: 'guardHigh', guardLow: 'guardLow' }[next];
      const sameClip = clip === 'walk' && (this.state === 'walkF' || this.state === 'walkB');
      this.setState(next, {}, sameClip ? null : clip, { blend: next === 'crouch' || this.state === 'crouch' ? 5 : 7 });
    }
    const st = this.stats;
    switch (next) {
      case 'walkF': b.steer(this.facing * st.walkF, 0.9); break;
      case 'walkB': b.steer(-this.facing * st.walkB, 0.9); break;
      case 'run': b.steer(this.facing * st.run, 1.2); break;
      default: b.steer(0, this.state === 'run' ? 0.5 : 1.1);
    }
  }

  /** Whether this fighter's current action should make the opponent raise a guard. */
  threatens(other) {
    if (this.state !== 'attack' || !this.move) return false;
    const m = this.move.def;
    if (this.move.frame > m.startup + m.active) return false;
    return Math.abs(this.body.x - other.body.x) < 330;
  }

  launchJump() {
    const dir = this.sd.dir;
    const run = this.sd.fromRun ? 1.35 : 1;
    this.body.launch(this.stats.jumpVY);
    this.body.vx = dir * this.facing * this.stats.jumpVX * run;
    this.airDir = dir;
    this.airAttackUsed = false;
    this.emit({ type: 'jump', who: this.index });
    this.setState('jump', {}, 'jump', { blend: 6 });
  }

  // --- attacks -------------------------------------------------------------------------------
  /**
   * Looks for a buffered attack input. mode: 'ground' | 'air' | 'cancel'. In cancel mode only the
   * current move's chain list / special cancels are allowed.
   */
  tryAttack(opp, mode) {
    const inp = this.input;
    const moves = this.def.moves;
    const cur = mode === 'cancel' ? this.move.def : null;
    const air = mode === 'air' || (mode === 'cancel' && !this.body.onGround);
    if (this.fatalityReady && !air && !cur) {
      // FATALITY: the super motion with a kick (↓↘→↓↘→ + K), close to the dazed opponent
      for (const btn of ['lk', 'hk']) {
        const t = inp.pressedTick(btn);
        if (t >= 0 && inp.motion('236236', t, TUNING.superMotionWindow)) {
          inp.consume(btn);
          this.emit({ type: 'fatalityRequest', who: this.index });
          return true;
        }
      }
    }
    if (!air && (!cur || cur.special)) {
      for (const id of SPECIAL_ORDER) {
        const m = moves[id];
        if (!m?.input) continue;
        if (m.super && this.meter < (m.cost ?? TUNING.superCost)) continue;
        if (m.projectile && this.projectileOut) continue; // one projectile on screen at a time
        for (const btn of m.input.buttons) {
          const t = inp.pressedTick(btn);
          if (t >= 0 && inp.motion(m.input.motion, t, m.input.motion.length > 3 ? TUNING.superMotionWindow : undefined)) {
            inp.consume(btn);
            this.startMove(m, false, !!cur);
            return true;
          }
        }
      }
    }
    // Throw: light punch + light kick together, standing on the ground.
    if (!air && !cur && !inp.down && moves.throw && inp.pressed('lp', 3) && inp.pressed('lk', 3)) {
      inp.consume('lp');
      inp.consume('lk');
      this.startMove(moves.throw);
      return true;
    }
    if (cur && this.chainLen >= TUNING.maxChainLength) return false;
    const stance = air ? 'air' : inp.down ? 'crouch' : 'stand';
    for (const btn of NORMAL_ORDER) {
      if (!inp.pressed(btn)) continue;
      const m = Object.values(moves).find((mv) => mv.stance === stance && (Array.isArray(mv.button) ? mv.button.includes(btn) : mv.button === btn));
      if (!m) continue;
      if (cur && !(cur.chain || []).includes(m.id)) continue;
      inp.consume(btn);
      this.startMove(m, !!cur);
      return true;
    }
    return false;
  }

  startMove(m, isChain = false, isCancel = isChain) {
    this.chainLen = isChain ? this.chainLen + 1 : 0;
    // frame 1 is the tick the button was pressed on (frame data counts from the press)
    this.move = { def: m, frame: 1, hitIds: new Set(), hits: 0, contact: null, step: null };
    if (m.stance === 'air') this.airAttackUsed = true;
    if (m.super) {
      this.meter -= m.cost ?? TUNING.superCost;
      this.superLock = TUNING.superCooldown;
      this.emit({ type: 'superStart', who: this.index, name: m.name });
      if (m.focus) this.focus = m.focus;
    }
    // Cross-fade into the move: short for fast normals, longer when the body must change posture
    // (cancels, stand -> crouch) so no limb snaps across the screen in a single frame.
    const fromStance = this.crouching ? 'crouch' : this.body.onGround ? 'stand' : 'air';
    const postureChange = fromStance !== m.stance && m.stance !== 'air';
    const blend = isCancel ? Math.max(4, Math.round(m.startup * 0.5)) : m.stance === 'air' ? 5 : postureChange ? Math.min(6, m.startup - 1) : 3;
    this.setState('attack', {}, 'attack', { blend, params: { move: m } });
    this.emit({ type: 'attackStart', who: this.index, move: m.id, special: !!m.isSpecial });
  }

  updateAttack(opp) {
    const mv = this.move;
    const m = mv.def;
    const b = this.body;
    mv.frame++;
    const total = m.startup + m.active + m.recovery;
    // Kara-throw: light punch/kick followed 1-2 frames later by the other button becomes a throw.
    if (mv.frame <= 3 && ['lp', 'lk'].includes(m.id) && this.def.moves.throw && this.input.pressed('lp', 3) && this.input.pressed('lk', 3)) {
      this.input.consume('lp');
      this.input.consume('lk');
      this.startMove(this.def.moves.throw);
      return;
    }
    if (m.steps) {
      const st = sequenceStep(m, mv.frame);
      if (st !== mv.step) {
        mv.step = st;
        mv.hitIds.clear(); // each step of a sequence may hit once
        mv.hits = 0;
        if (st.teleport && opp) this.teleportBehind(opp);
      }
    }
    if (m.projectile && mv.frame === m.projectile.at && this.spawnProjectile) this.spawnProjectile(this, m.projectile);
    // Scripted forward motion (lunges) – otherwise decelerate on the ground.
    let moving = false;
    if (m.motion) {
      for (const seg of m.motion) {
        if (mv.frame >= seg.from && mv.frame <= seg.to) {
          b.vx = seg.vx * this.facing;
          moving = true;
        }
      }
    }
    if (m.air && mv.frame === m.air.at) {
      b.launch(m.air.vy);
      b.vx = m.air.vx * this.facing;
    }
    if (!moving && mv.step?.vx && b.onGround) {
      b.vx = mv.step.vx * this.facing;
      moving = true;
    }
    if (!moving && b.onGround && !(m.air && mv.frame >= m.air.at)) b.steer(0, 0.8);
    if (mv.frame === m.startup + 1) this.emit({ type: 'swing', who: this.index, move: m.id, strength: m.strength });
    if (mv.frame === m.startup + m.active + 1 && !mv.contact) {
      const hb = this.hitboxes[0];
      if (m.hitboxes?.length) this.emit({ type: 'whiff', who: this.index, move: m.id, strength: m.strength, x: hb ? hb.b.x : this.body.x, y: hb ? hb.b.y : 150, dir: this.facing });
      if (m.isSpecial && !m.super) this.gainMeter(TUNING.meterOnSpecialWhiff);
    }

    // Cancels: only after the move made contact, inside the cancel window.
    if (mv.contact && (m.chain?.length || m.special) && mv.frame <= m.startup + m.active + (m.cancelWindow || 0)) {
      if (this.tryAttack(opp, 'cancel')) return;
    }

    if (m.stance === 'air') {
      if (mv.frame >= total) {
        this.move = null;
        this.setState('jump', {}, 'jump', { blend: 6 });
      }
      return;
    }
    if (mv.frame >= total) {
      if (!b.onGround) {
        mv.frame = total; // keep falling in the final pose until landing
        return;
      }
      this.move = null;
      this.recoverToNeutral();
    }
  }

  /** Vanish and reappear behind the opponent (used by sequence steps with `teleport`). */
  teleportBehind(opp) {
    const from = this.body.x;
    const side = Math.sign(opp.body.x - this.body.x) || this.facing;
    const lo = STAGE.left + this.body.pushW, hi = STAGE.right - this.body.pushW;
    let x = opp.body.x + side * (opp.body.pushW + this.body.pushW + 6);
    if (x < lo || x > hi) x = opp.body.x - side * (opp.body.pushW + this.body.pushW + 6); // cornered: stay in front
    this.body.x = this.body.prevX = Math.min(hi, Math.max(lo, x));
    this.facing = Math.sign(opp.body.x - this.body.x) || this.facing;
    this.emit({ type: 'teleport', who: this.index, from, to: this.body.x });
  }

  onLand() {
    const s = this.state;
    this.emit({ type: 'land', who: this.index, x: this.body.x, heavy: s === 'juggle' || s === 'ko' });
    if (s === 'jump') {
      const ld = Math.max(1, Math.round(TUNING.landingFrames / this.agility));
      this.setState('land', { duration: ld }, 'land', { blend: 4, params: { duration: ld } });
    } else if (s === 'attack') {
      const m = this.move.def;
      const lock = Math.round((m.landRecovery || TUNING.airAttackLandingFrames) / this.agility);
      this.move = null;
      this.setState('land', { duration: lock, locked: true }, 'land', { blend: 5, params: { duration: lock } });
    } else if (s === 'juggle') {
      if (this.sd.knockdown) {
        this.body.vx *= 0.3;
        this.setState('knockdown', { duration: Math.round(TUNING.knockdownFrames / this.agility) }, 'knockdown', { blend: 6 });
      } else {
        this.setState('land', { duration: 10, locked: true }, 'land', { blend: 9, params: { duration: 10 } });
      }
    } else if (s === 'ko') {
      this.body.vx *= 0.3;
      this.sd.landed = true;
      this.anim.play('knockdown', { blend: 6 });
    }
  }

  // --- being hit -----------------------------------------------------------------------------
  /** Parts of the hurtbox that are intangible this tick. Returns 'all', a Set of parts, or null. */
  invulnerability() {
    if (this.state === 'knockdown' || this.state === 'getup' || this.state === 'intro' || this.state === 'victory') return 'all';
    if (this.state === 'ko' || this.state === 'thrown' || this.state === 'throwing') return 'all';
    if (this.state === 'dashB' && this.stateFrame <= Math.round(5 * this.agility)) return 'all'; // agile back dashes slip out longer
    if (this.state === 'attack' && this.move?.def.invuln) {
      const parts = new Set();
      for (const iv of this.move.def.invuln) {
        if (this.move.frame >= iv.from && this.move.frame <= iv.to) {
          if (iv.parts.includes('all')) return 'all';
          iv.parts.forEach((p) => parts.add(p));
        }
      }
      return parts.size ? parts : null;
    }
    return null;
  }

  /** Can this fighter block an attack of the given height coming from `attacker`? */
  canBlock(attacker, height) {
    if (!this.body.onGround) return { ok: false, why: 'airborne' };
    if (!BLOCKABLE.has(this.state)) return { ok: false, why: `state ${this.state}` };
    if (this.state === 'land' && this.sd.locked) return { ok: false, why: 'landing recovery' };
    if (!this.holdingAwayFrom(attacker.body.x)) return { ok: false, why: 'not holding back' };
    const low = this.input.down;
    if (height === 'low' && !low) return { ok: false, why: 'low hit standing guard' };
    if (height === 'overhead' && low) return { ok: false, why: 'overhead hit crouching guard' };
    return { ok: true, low };
  }

  receiveBlock(att, m, hitstop) {
    const dir = Math.sign(this.body.x - att.body.x) || att.facing;
    const low = this.input.down;
    this.move = null;
    this.hitstop = hitstop;
    this.body.vx = dir * m.push.block;
    const dur = Math.max(2, Math.round(m.blockstun / this.agility)); // agile fighters recover from blocking sooner
    this.setState('blockstun', { duration: dur, low }, low ? 'blockLow' : 'blockHigh', { blend: 3, params: { duration: dur } });
    if (m.isSpecial || m.chip) this.health = Math.max(this.health - Math.round(m.damage * TUNING.chipDamage), 0);
  }

  receiveHit(att, m, { damage, hitstun, part, hitstop, counter, reaction = m.reaction }) {
    const dir = Math.sign(this.body.x - att.body.x) || att.facing;
    const wasAir = !this.body.onGround || this.state === 'juggle';
    const wasCrouch = this.crouching;
    this.move = null;
    this.hitstop = hitstop;
    this.flash = 6;
    this.health = Math.max(0, this.health - damage);
    this.stun += m.stun * (counter ? 1.25 : 1);
    this.sinceHit = 0;
    if (this.state === 'dizzy') this.stun = 0;
    else if (this.stun >= this.stats.stunMax) this.dizzyPending = true;

    const b = this.body;
    const L = m.launch || { vx: 3, vy: 6 };
    if (this.health <= 0 && this.finishable && this.state !== 'dazed') {
      // deciding round: the loser is left standing, dazed - FINISH HIM!
      this.health = 0;
      this.finishable = false;
      b.vx = (dir * Math.min(m.push.hit, 3)) / b.mass;
      this.dizzyPending = false;
      this.setState('dazed', {}, 'dizzy', { blend: 10 });
      this.emit({ type: 'dazed', who: this.index });
      return;
    }
    if (this.health <= 0) {
      b.onGround = false;
      b.vy = Math.max(L.vy, 9);
      b.vx = dir * Math.max(L.vx, 4) / b.mass;
      this.dizzyPending = false;
      this.setState('ko', {}, 'airHit', { blend: 8, params: { launch: true, rot0: this.anim.pose.rot } });
      return;
    }
    const airborneReaction = ['knockback', 'launch', 'knockdown'].includes(reaction);
    if (wasAir || airborneReaction) {
      // Juggle physics: launch strength scales with mass; repeated juggles fall faster.
      this.combo.juggle += m.juggle ?? 1;
      b.gravityScale = 1 + this.combo.juggle * TUNING.juggleGravityPerHit;
      const vy = wasAir && !airborneReaction ? 6.5 : L.vy;
      b.onGround = false;
      b.vy = vy / Math.sqrt(b.mass);
      b.vx = (dir * (L.vx || m.push.hit)) / b.mass;
      // Launchers and sweeps always knock down; heavy hits knock down airborne opponents;
      // light air hits and grounded knockback let the defender land on their feet.
      const knockdown = m.reaction === 'launch' || m.reaction === 'knockdown' || (wasAir && m.strength !== 'light');
      this.setState('juggle', { knockdown }, 'airHit', { blend: 8, params: { launch: reaction === 'launch', rot0: this.anim.pose.rot } });
      return;
    }
    b.vx = (dir * m.push.hit) / b.mass;
    if (reaction === 'stagger') {
      this.setState('stagger', { duration: hitstun + 10 }, 'stagger', { blend: 7, params: { duration: hitstun + 10 } });
      return;
    }
    const clip = wasCrouch ? 'hitCrouch' : part === 'head' || (m.hitLevel !== 'low' && part !== 'limb') ? 'hitHigh' : 'hitLow';
    const finalClip = part === 'torso' && m.hitLevel === 'low' && !wasCrouch ? 'hitLow' : clip;
    this.setState('hitstun', { duration: hitstun, crouch: wasCrouch }, finalClip, { blend: 6, params: { duration: hitstun } });
  }

  // --- pose / collision ----------------------------------------------------------------------
  animContext() {
    return {
      walkDist: this.walkDist,
      vy: this.body.vy,
      vx: this.body.vx,
      jumpVY: this.stats.jumpVY,
      airDir: this.airDir,
      moveFrame: this.move ? this.move.frame : 0,
      stance: this.stance,
      throwRot: this.state === 'thrown' ? this.sd.rot : 0,
      tired: this.critical,
    };
  }

  /** Samples the animation, runs FK, keeps the body out of the floor, rebuilds hurt/hitboxes. */
  updatePose(advance = true) {
    // Walk cycles are driven by the distance actually travelled (after pushbox/wall corrections),
    // so planted feet never slide over the floor.
    if (advance && (this.state === 'walkF' || this.state === 'walkB' || this.state === 'run')) {
      this.walkDist += (this.body.x - this.body.prevX) * this.facing;
    }
    if (this.state === 'scripted' && this.scriptPose) this.anim.pose = this.scriptPose;
    else if (advance) this.anim.update(this.animContext());
    let skel = computeSkeleton(this.anim.pose, this.props);
    const low = lowestPoint(skel) + this.body.y;
    if (low < 0 && this.state !== 'scripted') {
      // Never let any body part sink below the floor (lying poses, landings, deep crouches).
      this.anim.pose.y -= low;
      skel = computeSkeleton(this.anim.pose, this.props);
    }
    this.skel = skel;
    this.cog = centerOfGravity(skel);
    this.hurtboxes = buildHurtboxes(this);
    this.hitboxes = buildHitboxes(this);
    // Pushbox height follows posture.
    const crouchLike = this.crouching || this.state === 'knockdown' || this.state === 'getup' || (this.state === 'ko' && this.body.onGround);
    this.body.pushH = (crouchLike ? 120 : this.body.onGround ? 190 : 150) * this.props.posScale;
  }
}
