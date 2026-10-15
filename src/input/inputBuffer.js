// Per-player input history. Raw device state is converted to fighter-relative directions
// ("numpad notation": 6 = forward, 4 = back, 2 = down, 8 = up, 3 = down-forward ...) using the
// fighter's facing on that tick. Button presses are edge-detected and stay buffered for a few frames
// until a game action consumes them, so a held button never repeats an attack by itself.
import { TUNING } from '../config/tuning.js';

export const BUTTONS = ['lp', 'hp', 'lk', 'hk', 'stance', 'taunt'];
const HISTORY = 40;

export const emptyRaw = () => ({ up: false, down: false, left: false, right: false, lp: false, hp: false, lk: false, hk: false, stance: false, taunt: false });

export function toNumpad(raw, facing) {
  const fwd = facing > 0 ? raw.right : raw.left;
  const back = facing > 0 ? raw.left : raw.right;
  const h = fwd && !back ? 1 : back && !fwd ? -1 : 0;
  const v = raw.up && !raw.down ? 1 : raw.down && !raw.up ? -1 : 0;
  return 5 + h + v * 3;
}

export class InputBuffer {
  constructor() {
    this.tick = 0;
    this.hist = []; // newest last: {dir, press: {btn: bool}, held: {btn: bool}}
    this.prevHeld = {};
    this.holdFrames = {};
    this.consumed = {}; // btn -> tick of last consumed press
    for (const b of BUTTONS) {
      this.prevHeld[b] = false;
      this.holdFrames[b] = 0;
      this.consumed[b] = -1;
    }
  }

  push(raw, facing, frozen = false) {
    this.tick++;
    const entry = { tick: this.tick, frozen, dir: toNumpad(raw, facing), press: {}, release: {}, held: {} };
    for (const b of BUTTONS) {
      const h = !!raw[b];
      entry.held[b] = h;
      entry.press[b] = h && !this.prevHeld[b];
      entry.release[b] = !h && this.prevHeld[b];
      this.holdFrames[b] = h ? this.holdFrames[b] + 1 : 0;
      this.prevHeld[b] = h;
    }
    this.hist.push(entry);
    if (this.hist.length > HISTORY) this.hist.shift();
  }

  get current() {
    return this.hist[this.hist.length - 1] || { dir: 5, press: {}, held: {}, release: {} };
  }
  get dir() {
    return this.current.dir;
  }
  get forward() { const d = this.dir; return d === 6 || d === 3 || d === 9; }
  get back() { const d = this.dir; return d === 4 || d === 1 || d === 7; }
  get down() { const d = this.dir; return d <= 3; }
  get up() { const d = this.dir; return d >= 7; }

  held(btn) {
    return !!this.current.held[btn];
  }
  heldFrames(btn) {
    return this.holdFrames[btn];
  }
  released(btn) {
    return !!this.current.release[btn];
  }

  /** Tick of the newest unconsumed press of `btn` within the buffer window, or -1. */
  pressedTick(btn, window = TUNING.inputBufferFrames) {
    let age = 0;
    for (let i = this.hist.length - 1; i >= 0; i--) {
      const e = this.hist[i];
      if (age >= window) break;
      if (e.press[btn] && e.tick > this.consumed[btn]) return e.tick;
      if (!e.frozen) age++;
    }
    return -1;
  }
  pressed(btn, window) {
    return this.pressedTick(btn, window) >= 0;
  }
  /** True if the button went down exactly on this tick (not buffered). */
  justPressed(btn) {
    return !!this.current.press[btn];
  }
  consume(btn) {
    this.consumed[btn] = this.tick;
  }
  consumeAll() {
    for (const b of BUTTONS) this.consumed[b] = this.tick;
  }

  /**
   * Checks for a motion like "236" finishing no earlier than `endTick - slack`. Directions must
   * appear in order within `window` frames; the last direction may be held on the press tick.
   */
  motion(seq, endTick = this.tick, window = TUNING.motionWindow) {
    window = window ?? TUNING.motionWindow;
    const digits = seq.split('').map(Number);
    let idx = digits.length - 1;
    for (let i = this.hist.length - 1; i >= 0 && idx >= 0; i--) {
      const e = this.hist[i];
      if (e.tick > endTick + 1) continue; // allow the final direction one frame late
      if (endTick - e.tick > window) break;
      if (e.dir === digits[idx]) idx--;
    }
    return idx < 0;
  }

  /**
   * Double tap of a direction (6 = forward dash, 4 = back dash) finishing on this tick. The stick
   * must return to neutral between the taps, so motions like 236236 (which pass 6 -> 2 -> 6) never
   * trigger a dash.
   */
  doubleTap(d, window = TUNING.dashWindow) {
    const n = this.hist.length;
    if (n < 3) return false;
    const cur = this.hist[n - 1], prev = this.hist[n - 2];
    if (!(cur.dir === d && prev.dir !== d)) return false;
    let sawNeutral = false;
    for (let i = n - 2; i >= 0; i--) {
      const e = this.hist[i];
      if (cur.tick - e.tick > window) return false;
      if (e.dir === 5) sawNeutral = true;
      else if (e.dir === d && sawNeutral) {
        if (this.lastDashTick && e.tick <= this.lastDashTick) return false; // first tap already used
        this.lastDashTick = cur.tick;
        return true;
      } else return false;
    }
    return false;
  }
}
