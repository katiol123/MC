// Visual-only secondary motion: verlet chains for hair, dreadlocks, tails and coat tails, plus
// impact squash and turn-around scaling. Updated once per simulation tick (fixed step) so it is
// frame-rate independent, and never fed back into the simulation.
import { dirUp, dirDown, dirFwd, lerp, clamp } from '../core/math.js';

class Chain {
  constructor(n, segLen, opts = {}) {
    this.n = n;
    this.seg = segLen;
    this.gravity = opts.gravity ?? 0.55;
    this.damping = opts.damping ?? 0.9;
    this.bias = opts.bias ?? { x: -0.15, y: 0 }; // local-space drift (x backwards)
    this.stiff = opts.stiff ?? 0.0;
    this.pts = null;
    this.prev = null;
    this.prevFrame = null;
  }
  init(anchor, dir) {
    this.pts = [];
    for (let i = 0; i < this.n; i++) this.pts.push({ x: anchor.x + dir.x * this.seg * i, y: anchor.y + dir.y * this.seg * i });
    this.prev = this.pts.map((p) => ({ ...p }));
    this.prevFrame = this.pts.map((p) => ({ ...p }));
  }
  mirror(cx) {
    for (const arr of [this.pts, this.prev, this.prevFrame]) for (const p of arr) p.x = 2 * cx - p.x;
  }
  step(anchor, restDir, facing) {
    if (!this.pts) this.init(anchor, restDir);
    this.prevFrame = this.pts.map((p) => ({ ...p }));
    const P = this.pts, Q = this.prev;
    P[0].x = anchor.x; P[0].y = anchor.y;
    for (let i = 1; i < this.n; i++) {
      const p = P[i], q = Q[i];
      const vx = (p.x - q.x) * this.damping, vy = (p.y - q.y) * this.damping;
      q.x = p.x; q.y = p.y;
      p.x += vx + this.bias.x * facing;
      p.y += vy - this.gravity + this.bias.y;
      // soft pull toward the rest direction (keeps tails/coats shaped)
      if (this.stiff) {
        const tx = anchor.x + restDir.x * this.seg * i, ty = anchor.y + restDir.y * this.seg * i;
        p.x += (tx - p.x) * this.stiff;
        p.y += (ty - p.y) * this.stiff;
      }
      if (p.y < 1) p.y = 1;
    }
    for (let it = 0; it < 3; it++) {
      for (let i = 1; i < this.n; i++) {
        const a = P[i - 1], b = P[i];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.001;
        const k = (d - this.seg) / d;
        if (i === 1) {
          b.x -= dx * k; b.y -= dy * k;
        } else {
          a.x += dx * k * 0.5; a.y += dy * k * 0.5;
          b.x -= dx * k * 0.5; b.y -= dy * k * 0.5;
        }
      }
      P[0].x = anchor.x; P[0].y = anchor.y;
    }
  }
  /** Interpolated points converted to fighter-local space. */
  local(alpha, fx, fy, facing) {
    return this.pts.map((p, i) => {
      const q = this.prevFrame[i];
      return { x: (lerp(q.x, p.x, alpha) - fx) * facing, y: lerp(q.y, p.y, alpha) - fy };
    });
  }
}

export class SecondaryMotion {
  constructor(def) {
    this.def = def;
    const lk = def.look;
    const pr = def.props;
    this.chains = {};
    if (lk.tail) this.chains.tail = new Chain(7, 10, { gravity: 0.25, bias: { x: -0.35, y: 0.5 }, stiff: 0.06 });
    if (lk.top && ['trench', 'longcoat'].includes(lk.top.type)) {
      const len = lk.top.type === 'trench' ? 1.0 : 0.72;
      this.chains.coat = new Chain(4, (pr.thigh * len) / 3, { gravity: 0.7, bias: { x: -0.2, y: 0 }, stiff: 0.05 });
    }
    if (lk.hair?.style === 'ponytail') this.chains.ponytail = new Chain(6, 9, { gravity: 0.6, bias: { x: -0.25, y: 0 } });
    if (lk.scarf) this.chains.scarf = new Chain(6, 10, { gravity: 0.4, bias: { x: -0.45, y: 0.1 } });
    if (lk.dreads) {
      this.dreads = [0, 1, 2, 3, 4].map((i) => new Chain(5, 8 + (i % 2) * 2, { gravity: 0.7, bias: { x: -0.12, y: 0 } }));
      this.dreadsFront = [0, 1].map(() => new Chain(4, 8, { gravity: 0.7, bias: { x: -0.05, y: 0 } }));
    }
    this.squash = 0;
    this.facingScale = 1;
    this.lastFacing = null;
  }

  /** Called once per simulation tick with the fighter's current state. */
  tick(f) {
    const { x, y } = f.body;
    const facing = f.facing;
    if (this.lastFacing !== null && this.lastFacing !== facing) {
      for (const k in this.chains) this.chains[k].mirror(x);
      for (const c of this.dreads || []) c.mirror(x);
      for (const c of this.dreadsFront || []) c.mirror(x);
      this.facingScale = -this.facingScale; // start of the turn-around squeeze
    }
    this.lastFacing = facing;
    this.facingScale = clamp(this.facingScale + (1 - this.facingScale) * 0.35 + (this.facingScale < 1 ? 0.12 : 0), -1, 1);
    this.squash *= 0.8;

    const { j, a } = f.skel;
    const W = (p) => ({ x: x + p.x * facing, y: y + p.y });
    const Wd = (d) => ({ x: d.x * facing, y: d.y });
    const pr = this.def.props;
    const R = pr.headR;
    if (this.chains.tail) {
      const fP = dirFwd(a.pelvis);
      const base = { x: j.pelvis.x - fP.x * pr.hipW * 0.9, y: j.pelvis.y - fP.y * pr.hipW * 0.9 - 4 };
      this.chains.tail.step(W(base), Wd({ x: -0.8, y: 0.2 }), facing);
    }
    if (this.chains.coat) {
      const fP = dirFwd(a.pelvis), dn = dirDown(a.pelvis);
      const base = { x: j.pelvis.x - fP.x * pr.hipW * 1.0 + dn.x * 4, y: j.pelvis.y - fP.y * pr.hipW + dn.y * 4 };
      this.chains.coat.step(W(base), Wd({ x: -0.3, y: -0.95 }), facing);
    }
    const headAt = (lx, ly) => {
      const u = dirUp(a.head), fw = { x: u.y, y: -u.x };
      return W({ x: j.head.x + fw.x * lx * R + u.x * ly * R, y: j.head.y + fw.y * lx * R + u.y * ly * R });
    };
    if (this.chains.ponytail) this.chains.ponytail.step(headAt(-0.9, 0.5), Wd({ x: -0.6, y: -0.8 }), facing);
    if (this.chains.scarf) this.chains.scarf.step(W(j.neck), Wd({ x: -1, y: 0 }), facing);
    if (this.dreads) {
      this.dreads.forEach((c, i) => c.step(headAt(-0.95 + i * 0.12, 0.7 - i * 0.28), Wd({ x: -0.3, y: -1 }), facing));
      this.dreadsFront.forEach((c, i) => c.step(headAt(0.2 + i * 0.25, 0.8), Wd({ x: 0.1, y: -1 }), facing));
    }
  }

  localChains(alpha, fx, fy, facing) {
    const out = {};
    for (const k in this.chains) if (this.chains[k].pts) out[k] = this.chains[k].local(alpha, fx, fy, facing);
    if (this.dreads && this.dreads[0].pts) {
      out.dreads = this.dreads.map((c) => c.local(alpha, fx, fy, facing));
      out.dreadsFront = this.dreadsFront.map((c) => c.local(alpha, fx, fy, facing));
    }
    return out;
  }
}
