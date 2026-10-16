// Camera: follows the midpoint of the fighters, zooms with their distance, adds impact shake.
import { VIEW, STAGE } from '../config/constants.js';
import { clamp, lerp } from '../core/math.js';

export class Camera {
  constructor() {
    this.x = (STAGE.left + STAGE.right) / 2;
    this.y = 0;
    this.zoom = 1;
    this.sx = 0;
    this.sy = 0;
    this.t = 0;
  }
  update(fighters, alpha, shake = 0, focus = null) {
    this.t++;
    this.kick = focus?.kick || 0; // momentary zoom punch (fatality impacts)
    const xs = fighters.map((f) => lerp(f.prev.x, f.body.x, alpha));
    const ys = focus ? [0, 0] : fighters.map((f) => lerp(f.prev.y, f.body.y, alpha));
    // a fixed framing (fatality scenes) instead of following the fighters
    const mid = focus ? focus.x : (xs[0] + xs[1]) / 2;
    const dist = Math.abs(xs[0] - xs[1]);
    const tz = focus ? focus.zoom : clamp(1.42 - (dist - 160) / 1300, 1.2, 1.42);
    this.zoom = lerp(this.zoom, tz, 0.08);
    const half = VIEW.width / 2 / this.zoom;
    const tx = clamp(mid, STAGE.left + half, STAGE.right - half);
    this.x = lerp(this.x, tx, 0.18);
    const ty = focus ? focus.y || 0 : Math.max(0, Math.max(...ys) - 160) * 0.5;
    this.y = lerp(this.y, ty, 0.1);
    this.sx = shake ? (Math.sin(this.t * 2.3) + Math.sin(this.t * 3.7)) * shake * 0.5 : 0;
    this.sy = shake ? (Math.cos(this.t * 2.9)) * shake * 0.5 : 0;
  }
  snap(fighters) {
    this.update(fighters, 1, 0);
    const xs = fighters.map((f) => f.body.x);
    this.x = (xs[0] + xs[1]) / 2;
  }
  toScreen(x, y) {
    return {
      x: (x - this.x) * this.zoom * (1 + (this.kick || 0)) + VIEW.width / 2 + this.sx,
      y: VIEW.groundY - (y - this.y) * this.zoom * (1 + (this.kick || 0)) + this.sy,
    };
  }
}
