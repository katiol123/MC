// Point-mass body for a fighter: position (feet on the floor at y = 0), velocity, gravity.
// The body is deliberately simple and deterministic: animation decides how the body *looks*,
// states decide the target velocities, this module integrates and enforces floor/walls.
import { TUNING } from '../config/tuning.js';
import { STAGE } from '../config/constants.js';
import { approach } from '../core/math.js';

export class Body {
  constructor({ x = 0, mass = 1, pushW = 28 } = {}) {
    this.x = x;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.mass = mass;
    this.pushW = pushW;
    this.pushH = 190;
    this.onGround = true;
    this.gravityScale = 1;
    this.wall = 0; // -1 touching left wall, +1 touching right wall
    this.justLanded = false;
    this.prevX = x;
    this.prevY = 0;
  }

  /** Accelerates horizontal velocity toward a target (responsive but not instantaneous). */
  steer(targetVx, accel) {
    this.vx = approach(this.vx, targetVx, accel);
  }

  /** Applies an impulse (momentum / mass). */
  impulse(ix, iy) {
    this.vx += ix / this.mass;
    this.vy += iy / this.mass;
    if (iy > 0) this.onGround = false;
  }

  integrate({ friction = false } = {}) {
    this.prevX = this.x;
    this.prevY = this.y;
    this.justLanded = false;
    if (!this.onGround) {
      this.vy -= TUNING.gravity * this.gravityScale;
      this.vx *= TUNING.airDrag;
    } else if (friction) {
      this.vx *= TUNING.groundFriction;
      if (Math.abs(this.vx) < 0.05) this.vx = 0;
    }
    this.x += this.vx;
    this.y += this.vy;
    if (this.y <= 0) {
      if (!this.onGround) this.justLanded = true;
      this.y = 0;
      this.vy = 0;
      this.onGround = true;
    }
    this.clampToStage();
  }

  clampToStage() {
    const lo = STAGE.left + this.pushW, hi = STAGE.right - this.pushW;
    this.wall = 0;
    if (this.x <= lo) {
      this.x = lo;
      if (this.vx < 0) this.vx = 0;
      this.wall = -1;
    } else if (this.x >= hi) {
      this.x = hi;
      if (this.vx > 0) this.vx = 0;
      this.wall = 1;
    }
  }

  launch(vy) {
    this.vy = vy;
    this.onGround = false;
  }

  /** Pushbox in world space: {x, y, w, h} with y the bottom edge. */
  pushbox() {
    return { x: this.x - this.pushW, y: this.y, w: this.pushW * 2, h: this.pushH };
  }
}
