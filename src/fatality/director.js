// Fatality director: plays a scripted finishing scene. Each fighter has one fatality script
// (src/fatality/fatalities.js) written once against the shared skeleton, so it works on every
// opponent: positions are relative to the attacker, sizes scale with the victim's proportions.
//
// A script is { name, duration, run(d, t), draw?(ctx, d, cam, layer, alpha) }:
//   run  - called every tick (t = 1..duration); sets poses / positions / render fx and emits events
//   draw - optional scene props (a pot, a fire pillar...) drawn behind ('back') or in front
//          ('front') of the fighters, in screen space via cam.toScreen.
// The simulation stays deterministic: scripts only use the tick counter, never Math.random.
import { resolvePose, blendPoses, emptyPose } from '../anim/skeleton.js';
import { clamp, ease } from '../core/math.js';
import { FATALITIES } from './fatalities.js';
import { Cinema } from './cinema.js';

export class FatalityDirector {
  constructor(match, who) {
    this.match = match;
    this.who = who;
    this.A = match.fighters[who];
    this.V = match.fighters[1 - who];
    this.script = FATALITIES[this.A.def.id];
    this.name = this.script.name;
    this.duration = this.script.duration;
    this.t = 0;
    this.dir = Math.sign(this.V.body.x - this.A.body.x) || this.A.facing;
    this.ax = this.A.body.x;
    // the victim is brought to a standard distance so every scene is framed the same way
    this.vx0 = this.V.body.x;
    this.gap = this.A.body.pushW + this.V.body.pushW + 46;
    this.events = [];
    this.s = {}; // per-scene scratch state
    this.cine = new Cinema(this.A.def.id); // slow motion, freezes, letterbox... (cinema.js)
    this.order = [1 - who, who]; // draw order (victim behind by default)
    for (const f of [this.A, this.V]) {
      f.setState('scripted', {});
      f.move = null;
      f.burn = 0;
      f.pulled = null;
      f.body.vx = f.body.vy = 0;
      f.body.onGround = true;
      f.fx = {};
    }
    this.A.facing = this.dir;
    this.V.facing = -this.dir;
    this.A.focus = 0;
  }

  /** Advances one tick; returns true when the scene is over. */
  tick() {
    this.events = [];
    this.cine.frameTick();
    for (const f of [this.A, this.V]) f.snapshot();
    if (this.cine.hold > 0) {
      // slow motion / hit-stop: the picture holds, the script waits
      this.cine.hold--;
      return false;
    }
    if (this.t >= this.duration) return true;
    this.t++;
    this.script.run(this, this.t);
    this.cine.scriptTick(this.t);
    for (const f of [this.A, this.V]) f.updatePose(false);
    return this.t >= this.duration && this.cine.hold === 0;
  }

  // --- helpers for scripts ---------------------------------------------------------------------
  /** World x at distance dx in front of the attacker's start position. */
  fx(dx) { return this.ax + this.dir * dx; }
  /** Where the victim stands in the scene. */
  get vx() { return this.ax + this.dir * this.gap; }

  at(f, x, y = 0) { f.body.x = x; f.body.y = y; }

  /** Sets a fighter's pose from an authored raw pose (or a blend of two). */
  pose(f, raw, raw2 = null, k = 0) {
    const a = resolvePose(raw, f.props, emptyPose());
    f.scriptPose = raw2 ? blendPoses(a, resolvePose(raw2, f.props, emptyPose()), clamp(k, 0, 1), f.props, emptyPose()) : a;
  }

  /** Keyframed pose: keys = [[tick, rawPose, easing?], ...]. */
  keys(f, t, keys) {
    if (t <= keys[0][0]) return this.pose(f, keys[0][1]);
    for (let i = 1; i < keys.length; i++) {
      const [t1, p1, e] = keys[i];
      const [t0, p0] = keys[i - 1];
      if (t <= t1) return this.pose(f, p0, p1, (e || ease.inOutSine)((t - t0) / Math.max(1, t1 - t0)));
    }
    return this.pose(f, keys[keys.length - 1][1]);
  }

  /** Keyframed number: keys = [[tick, value, easing?], ...]. */
  num(t, keys) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1, e] = keys[i];
      const [t0, v0] = keys[i - 1];
      if (t <= t1) return v0 + (v1 - v0) * (e || ease.inOutSine)((t - t0) / Math.max(1, t1 - t0));
    }
    return keys[keys.length - 1][1];
  }

  /** Smooth 0..1 progress between two ticks. */
  span(t, t0, t1, e = ease.inOutSine) { return e(clamp((t - t0) / Math.max(1, t1 - t0), 0, 1)); }

  /** World position of a joint (e.g. 'handF', 'head'). */
  joint(f, name) {
    const j = f.skel.j[name];
    return { x: f.body.x + f.facing * j.x, y: f.body.y + j.y };
  }

  /** Cosmetic event for the renderer / audio (sfx, dust, sparks, labels...). */
  emit(e) { this.events.push(e); }
  sfx(kind) { this.emit({ type: 'sfx', kind }); }
  fxEvent(kind, o = {}) { this.emit({ type: 'fx', kind, ...o }); }
}
