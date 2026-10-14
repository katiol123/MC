// Per-fighter animation player: plays clips, cross-fades between them and applies stance mirroring.
import { CLIPS } from './clips.js';
import { blendPoses, clonePose, emptyPose, resolvePose, swapStance } from './skeleton.js';
import { STANCE } from './poses.js';
import { ease } from '../core/math.js';

const SWAP_LAYER = { fa: 'ba', ba: 'fa', fl: 'bl', bl: 'fl' };

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
    let layers = clip.layers ? clip.layers(this.params) : null;
    if (ctx.stance === 1) {
      swapStance(pose);
      if (layers) {
        const l = {};
        for (const k in layers) l[SWAP_LAYER[k] || k] = layers[k];
        layers = l;
      }
    }
    if (this.blendFrom && this.frame < this.blendLen) {
      pose = blendPoses(this.blendFrom, pose, ease.smooth(this.frame / this.blendLen), this.props, emptyPose());
    } else {
      this.blendFrom = null;
    }
    this.layers = layers;
    this.pose = pose;
    return pose;
  }
}
