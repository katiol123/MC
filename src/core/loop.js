import { TICK_MS } from '../config/constants.js';

/**
 * Fixed-timestep accumulator. Rendering may happen at any rate; the simulation always advances in
 * whole 1/60 s ticks. `alpha` (0..1) tells the renderer how far it is between the previous and the
 * current simulation state so it can interpolate.
 */
export class FixedStepLoop {
  constructor({ step = TICK_MS, maxFrameMs = 250, maxStepsPerFrame = 8 } = {}) {
    this.step = step;
    this.maxFrameMs = maxFrameMs;
    this.maxStepsPerFrame = maxStepsPerFrame;
    this.acc = 0;
    this.timeScale = 1; // debug slow motion
    this.paused = false;
    this.pendingSingleSteps = 0;
    this.totalTicks = 0;
  }

  /** Advances by `frameMs` of real time and calls `tick()` for each due simulation step. */
  advance(frameMs, tick) {
    let steps = 0;
    if (this.paused) {
      while (this.pendingSingleSteps > 0) {
        this.pendingSingleSteps--;
        tick();
        this.totalTicks++;
        steps++;
      }
      this.acc = 0;
      return steps;
    }
    this.acc += Math.min(frameMs, this.maxFrameMs) * this.timeScale;
    while (this.acc >= this.step && steps < this.maxStepsPerFrame) {
      tick();
      this.acc -= this.step;
      this.totalTicks++;
      steps++;
    }
    if (steps >= this.maxStepsPerFrame) this.acc = Math.min(this.acc, this.step);
    return steps;
  }

  get alpha() {
    return this.paused ? 1 : Math.min(1, this.acc / this.step);
  }

  stepOnce() {
    this.pendingSingleSteps++;
  }
}
