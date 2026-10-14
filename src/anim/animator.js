// Per-fighter animation player: plays clips, cross-fades between them and applies stance mirroring.
import { CLIPS } from './clips.js';
import { blendPoses, clonePose, emptyPose, resolvePose, swapStance, finalizePose, LIMBS, wrapAngle } from './skeleton.js';
import { STANCE } from './poses.js';
import { ease, clamp } from '../core/math.js';

/** Maximum change per tick (speed control): keeps the body from snapping between key poses. */
const MAX_SPEED = { limb: 46, leg: 34, spine: 9, head: 10, rot: 45, pos: 22 };

const SWAP_LAYER = { fa: 'ba', ba: 'fa', fl: 'bl', bl: 'fl' };

/** Clips in which an exhausted fighter visibly pants. */
const TIRED_CLIPS = new Set(['idle', 'walk', 'guardHigh', 'guardLow', 'crouch']);

export class Animator {
  constructor(props) {
    this.props = props;
    this.clipId = 'idle';
    this.params = {};
    this.frame = 0;
    this.blendFrom = null;
    this.blendLen = 0;
    this.pose = resolvePose(STANCE, props);
    this.layers = null;
  }

  /** Starts a clip. `blend` = cross-fade length in frames from the current pose. */
  play(id, { blend = 5, params = {}, restart = true } = {}) {
    if (!CLIPS[id]) throw new Error(`Unknown clip ${id}`);
    if (!restart && this.clipId === id) {
      this.params = params;
      return;
    }
    this.blendFrom = blend > 0 ? clonePose(this.pose) : null;
    this.snap = blend === 0; // explicit cut (round reset, preview): no speed limiting this frame
    this.blendLen = blend;
    this.clipId = id;
    this.params = params;
    this.frame = 0;
  }

  /** Advances one simulation tick and returns the new pose. ctx: data the clips may read. */
  update(ctx) {
    this.frame++;
    const clip = CLIPS[this.clipId];
    let pose = clip.sample(this.frame, ctx, this.params, this.props);
    let layers = clip.layers ? clip.layers(this.params, ctx) : null;
    if (ctx.stance === 1) {
      swapStance(pose);
      if (layers) {
        const l = {};
        for (const k in layers) l[SWAP_LAYER[k] || k] = layers[k];
        layers = l;
      }
    }
    if (ctx.tired && TIRED_CLIPS.has(this.clipId)) pose = this.heavyBreathing(pose);
    if (this.blendFrom && this.frame < this.blendLen) {
      pose = blendPoses(this.blendFrom, pose, ease.smooth(this.frame / this.blendLen), this.props, emptyPose());
    } else {
      this.blendFrom = null;
    }
    if (!this.snap) this.limitSpeed(this.pose, pose);
    this.snap = false;
    this.layers = layers;
    this.pose = pose;
    return pose;
  }

  /** Exhausted: deep, slow breaths heave the chest and shoulders; head and guard sag. */
  heavyBreathing(pose) {
    this.breath = (this.breath || 0) + 1;
    const s = Math.sin((this.breath / 46) * Math.PI * 2);
    const p = { ...pose, fa: [...pose.fa], ba: [...pose.ba] };
    p.y += -3 + 2.6 * s;
    p.chest += 4 * s;
    p.lean += 5;
    p.neck = (p.neck || 0) - 4;
    p.head = (p.head || 0) - 7 + 2 * s;
    p.fa[0] -= 8 - 4 * s;
    p.ba[0] -= 8 - 4 * s;
    return p;
  }

  /** Clamps joint angular velocity and pelvis speed relative to the previous tick's pose. */
  limitSpeed(prev, pose) {
    const lim = (a, b, m) => a + clamp(b - a, -m, m);
    pose.lean = lim(prev.lean, pose.lean, MAX_SPEED.spine);
    pose.chest = lim(prev.chest, pose.chest, MAX_SPEED.spine);
    pose.neck = lim(prev.neck, pose.neck, MAX_SPEED.head);
    pose.head = lim(prev.head, pose.head, MAX_SPEED.head);
    pose.x = lim(prev.x, pose.x, MAX_SPEED.pos);
    pose.y = lim(prev.y, pose.y, MAX_SPEED.pos);
    const dr = ((((pose.rot - prev.rot) % 360) + 540) % 360) - 180;
    pose.rot = wrapAngle(prev.rot + clamp(dr, -MAX_SPEED.rot, MAX_SPEED.rot));
    // Arms are limited directly; IK legs keep their foot targets (planted feet win over speed).
    for (const k of LIMBS) {
      if ((k === 'fl' && pose.ff) || (k === 'bl' && pose.bf)) continue;
      const max = k === 'fl' || k === 'bl' ? MAX_SPEED.leg : MAX_SPEED.limb;
      for (let i = 0; i < 3; i++) pose[k][i] = lim(prev[k][i], pose[k][i], max);
    }
    finalizePose(pose, this.props);
  }
}
