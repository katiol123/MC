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
    this.emit = () => {};
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
    this.hitstop = 0;
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
  update(opp) {
    if (this.flash > 0) this.flash--;
    if (this.hitstop > 0) {
      this.hitstop--;
      return false;
    }
    this.stateFrame++;
    this.stun = Math.max(0, this.stun - (this.state === 'hitstun' || this.state === 'juggle' ? 0 : TUNING.stunDecayPerTick));
    this.think(opp);
    const sliding = ['hitstun', 'blockstun', 'stagger', 'knockdown', 'ko', 'dizzy', 'getup', 'victory', 'defeat'].includes(this.state);
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
      case 'hitstun':
      case 'blockstun':
      case 'stagger':
        if (this.stateFrame >= this.sd.duration) {
          if (this.dizzyPending && s !== 'blockstun') {
            this.dizzyPending = false;
            this.emit({ type: 'dizzy', who: this.index });
            return this.setState('dizzy', { duration: TUNING.dizzyFrames }, 'dizzy', { blend: 8 });
          }
          this.recoverToNeutral();
        }
        return;
      case 'juggle':
      case 'ko':
        return; // ballistic; landing handled in onLand
      case 'knockdown':
        if (this.stateFrame >= this.sd.duration) {
          this.setState('getup', { duration: TUNING.getupFrames }, 'getup', { blend: 4, params: { duration: TUNING.getupFrames } });
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
    if (!air && (!cur || cur.special)) {
      for (const id of SPECIAL_ORDER) {
        const m = moves[id];
        for (const btn of m.input.buttons) {
          const t = inp.pressedTick(btn);
          if (t >= 0 && inp.motion(m.input.motion, t)) {
            inp.consume(btn);
            this.startMove(m, false, !!cur);
            return true;
          }
        }
      }
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
    this.move = { def: m, frame: 1, hitIds: new Set(), hits: 0, contact: null };
    if (m.stance === 'air') this.airAttackUsed = true;
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
    if (!moving && b.onGround && !(m.air && mv.frame >= m.air.at)) b.steer(0, 0.8);
    if (mv.frame === m.startup + 1) this.emit({ type: 'swing', who: this.index, move: m.id, strength: m.strength });

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

  onLand() {
    const s = this.state;
    this.emit({ type: 'land', who: this.index, x: this.body.x, heavy: s === 'juggle' || s === 'ko' });
    if (s === 'jump') {
      this.setState('land', { duration: TUNING.landingFrames }, 'land', { blend: 2, params: { duration: TUNING.landingFrames } });
    } else if (s === 'attack') {
      const m = this.move.def;
      const lock = m.landRecovery || TUNING.airAttackLandingFrames;
      this.move = null;
      this.setState('land', { duration: lock, locked: true }, 'land', { blend: 2, params: { duration: lock } });
    } else if (s === 'juggle') {
      if (this.sd.knockdown) {
        this.body.vx *= 0.3;
        this.setState('knockdown', { duration: TUNING.knockdownFrames }, 'knockdown', { blend: 6 });
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
    if (this.state === 'ko') return 'all';
    if (this.state === 'dashB' && this.stateFrame <= 5) return 'all';
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
    const dur = m.blockstun;
    this.setState('blockstun', { duration: dur, low }, low ? 'blockLow' : 'blockHigh', { blend: 3, params: { duration: dur } });
    if (m.isSpecial) this.health = Math.max(this.health - Math.round(m.damage * TUNING.chipDamage), 0);
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
    if (this.state === 'dizzy') this.stun = 0;
    else if (this.stun >= this.stats.stunMax) this.dizzyPending = true;

    const b = this.body;
    const L = m.launch || { vx: 3, vy: 6 };
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
      this.dizzyPending = false;
      this.setState('juggle', { knockdown }, 'airHit', { blend: 8, params: { launch: reaction === 'launch', rot0: this.anim.pose.rot } });
      return;
    }
    b.vx = (dir * m.push.hit) / b.mass;
    if (reaction === 'stagger') {
      this.setState('stagger', { duration: hitstun + 10 }, 'stagger', { blend: 3, params: { duration: hitstun + 10 } });
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
    };
  }

  /** Samples the animation, runs FK, keeps the body out of the floor, rebuilds hurt/hitboxes. */
  updatePose(advance = true) {
    // Walk cycles are driven by the distance actually travelled (after pushbox/wall corrections),
    // so planted feet never slide over the floor.
    if (advance && (this.state === 'walkF' || this.state === 'walkB' || this.state === 'run')) {
      this.walkDist += (this.body.x - this.body.prevX) * this.facing;
    }
    if (advance) this.anim.update(this.animContext());
    let skel = computeSkeleton(this.anim.pose, this.props);
    const low = lowestPoint(skel) + this.body.y;
    if (low < 0) {
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
