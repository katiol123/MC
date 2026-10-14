// Limb inertia: a damped angular spring per joint that lags behind sudden accelerations of the
// animated pose and overshoots after a strike stops (follow-through), then settles.
// It is evaluated once per simulation tick and only offsets the *rendered* pose, so collision
// volumes always follow the authoritative animation (fair, readable hitboxes).
import { clamp } from '../core/math.js';

const JOINTS = [
  // [limb key, index, inertia, stiffness, damping, max offset (deg)]
  ['fa', 0, 0.35, 0.32, 0.38, 10], ['fa', 1, 0.45, 0.3, 0.36, 14],
  ['ba', 0, 0.35, 0.32, 0.38, 10], ['ba', 1, 0.45, 0.3, 0.36, 14],
  ['fl', 1, 0.3, 0.35, 0.4, 8], ['bl', 1, 0.3, 0.35, 0.4, 8],
];
const SCALARS = [['head', 0.5, 0.25, 0.32, 9], ['chest', 0.25, 0.3, 0.4, 5]];

export class LimbInertia {
  constructor() {
    this.state = new Map();
  }

  /** Feed the pose of the current tick. */
  tick(pose) {
    const upd = (key, target, inertia, k, c, max) => {
      let s = this.state.get(key);
      if (!s) {
        s = { a1: target, a2: target, o: 0, v: 0 };
        this.state.set(key, s);
      }
      const accel = clamp(target - 2 * s.a1 + s.a2, -60, 60);
      s.v += -k * s.o - c * s.v - accel * inertia;
      s.o = clamp(s.o + s.v, -max, max);
      s.a2 = s.a1;
      s.a1 = target;
    };
    for (const [limb, i, inertia, k, c, max] of JOINTS) upd(limb + i, pose[limb][i], inertia, k, c, max);
    for (const [key, inertia, k, c, max] of SCALARS) upd(key, pose[key], inertia, k, c, max);
  }

  /** Returns a copy of `pose` with the inertial offsets applied. */
  apply(pose) {
    for (const [limb, i] of JOINTS) {
      const s = this.state.get(limb + i);
      if (s) pose[limb][i] += s.o;
    }
    for (const [key] of SCALARS) {
      const s = this.state.get(key);
      if (s) pose[key] += s.o;
    }
    pose.fa[1] = Math.max(0, pose.fa[1]);
    pose.ba[1] = Math.max(0, pose.ba[1]);
    pose.fl[1] = Math.max(0, pose.fl[1]);
    pose.bl[1] = Math.max(0, pose.bl[1]);
    return pose;
  }

  reset() {
    this.state.clear();
  }
}
