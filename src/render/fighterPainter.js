// Procedural fighter painter. Draws a fighter from its skeleton (joint positions in local fighter
// space, y up, x forward). Every body part is built from code: tapered muscular limb meshes,
// a contoured torso, a sculpted head, clothing layers, cel shading with rim light and outlines.
//
// Each body group is drawn in two passes: an expanded dark silhouette (outline) and the colour pass on
// top, so joints inside a group are seamless while groups stay readable against each other.
import { limbPath, smoothClosed, smoothOpen, boxAlong, along } from './shapes.js';
import { mix, lighten, darken, rgba } from './color.js';
import { dirUp, dirFwd, DEG } from '../core/math.js';
import { PAN_COCK, GUITAR_COCK, SPRING_REACH } from '../data/signatures.js';
import { drawFireFist } from './fire.js';

// Key light in WORLD space (upper left of the stage, unit vector pointing toward the light). The
// painter works in mirrored fighter-local space, so draw() flips x with the fighter's facing: both
// fighters are lit from the same side and the rim light (the sunset behind them) sits opposite.
const LIGHT_WORLD = { x: -0.46, y: 0.89 };
const SHADOW_TINT = '#2a1440';
const SHADOW_RGB = '30,10,46';
const TAPER = 9; // width of the band where a limb's outline fades out over the body at a joint

const fwdOf = (u) => ({ x: u.y, y: -u.x });
const P = (o, d, k) => ({ x: o.x + d.x * k, y: o.y + d.y * k });
const P2 = (o, d1, k1, d2, k2) => ({ x: o.x + d1.x * k1 + d2.x * k2, y: o.y + d1.y * k1 + d2.y * k2 });

/** Look overrides: nested objects merge, null removes an item (a knocked-off hat, mask...). */
function mergeLook(base, over) {
  const out = { ...base };
  for (const k in over) {
    const v = over[k];
    if (v === null) delete out[k];
    else out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' ? mergeLook(base[k], v) : v;
  }
  return out;
}

export class FighterPainter {
  constructor(def) {
    this.def = def;
    this.look = def.look;
    this.lookBase = def.look;
    this.lookHurt = mergeLook(def.look, def.damaged?.look || {});
    this.pr = def.props;
    this.ow = 3.1; // outline half-width (local units)
    this.matCache = new Map();
  }

  /** Material colours, optionally tinted (hit flash). */
  mat(base, tint = 0) {
    const tc = this.tintColor || '#ffffff';
    const key = base + '|' + tint + '|' + tc;
    let m = this.matCache.get(key);
    if (!m) {
      const b = tint ? mix(base, tc, tint) : base;
      m = { base: b, light: lighten(b, 0.18), dark: darken(mix(b, SHADOW_TINT, 0.3), 0.18), rim: mix(b, this.look.rim || '#ff4fd8', 0.7) };
      this.matCache.set(key, m);
    }
    return m;
  }

  // --- low level helpers -------------------------------------------------------------------
  outlineFill(ctx) {
    ctx.fillStyle = this.outline;
    ctx.fill();
    ctx.lineWidth = this.ow * 2;
    ctx.strokeStyle = this.outline;
    ctx.stroke();
  }

  /** Cel-shading overlay across a segment: highlight on the lit side, hard shadow band, rim light. */
  shadeSeg(ctx, a, b, r) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const L = Math.hypot(dx, dy) || 1;
    let nx = -dy / L, ny = dx / L;
    if (nx * this.L.x + ny * this.L.y < 0) { nx = -nx; ny = -ny; }
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const g = ctx.createLinearGradient(mx + nx * r, my + ny * r, mx - nx * r, my - ny * r);
    this.shadeStops(g);
    ctx.fillStyle = g;
    ctx.fill();
  }

  shadeStops(g) {
    const rim = this.rimC;
    g.addColorStop(0, 'rgba(255,255,255,0.28)');
    g.addColorStop(0.22, 'rgba(255,255,255,0.06)');
    g.addColorStop(0.5, 'rgba(40,16,64,0)');
    g.addColorStop(0.58, 'rgba(40,16,64,0.30)');
    g.addColorStop(0.84, 'rgba(40,16,64,0.36)');
    g.addColorStop(0.9, rgba(rim, 0.35));
    g.addColorStop(1, rgba(rim, 0.7));
  }

  /** Shading overlay for an arbitrary shape whose main axis runs from `a` (lit side) to `b`. */
  shadeAcross(ctx, a, b) {
    // `a` must be the side facing the light: callers pass front -> back, flip when lit from behind
    if ((a.x - b.x) * this.L.x + (a.y - b.y) * this.L.y < 0) [a, b] = [b, a];
    const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    this.shadeStops(g);
    ctx.fillStyle = g;
    ctx.fill();
  }

  seg(ctx, pass, a, b, ra, rb, color, bp = 0, bn = 0, at = 0.38) {
    ctx.beginPath();
    limbPath(ctx, a, b, ra, rb, bp, bn, at);
    if (pass === 'outline') return this.outlineFill(ctx);
    ctx.fillStyle = color;
    ctx.fill();
    this.shadeSeg(ctx, a, b, Math.max(ra, rb) + Math.max(bp, bn));
  }

  line(ctx, pts, width, color, alpha = 1) {
    ctx.beginPath();
    smoothOpen(ctx, pts);
    ctx.lineWidth = width;
    ctx.strokeStyle = alpha < 1 ? rgba(color, alpha) : color;
    ctx.stroke();
  }

  /** Soft dark blob (cast shadow / ambient occlusion) at p, radius r. */
  softShadow(ctx, p, r, a = 0.35) {
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    g.addColorStop(0, `rgba(${SHADOW_RGB},${a})`);
    g.addColorStop(0.55, `rgba(${SHADOW_RGB},${a * 0.6})`);
    g.addColorStop(1, `rgba(${SHADOW_RGB},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
  }

  /** Shadow a limb (a->b->c, radii) casts on the shape currently clipped, away from the light. */
  castLimb(ctx, pts, radii, dist = 7, a = 0.26) {
    const ox = -this.L.x * dist, oy = -this.L.y * dist;
    ctx.beginPath();
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = { x: pts[i].x + ox, y: pts[i].y + oy }, q = { x: pts[i + 1].x + ox, y: pts[i + 1].y + oy };
      limbPath(ctx, p, q, radii[i], radii[i + 1]);
    }
    ctx.fillStyle = `rgba(${SHADOW_RGB},${a})`;
    ctx.fill();
  }

  /**
   * Fabric creases at a bending joint j (limb a -> j -> b, half-width r): a fan of short folds on the
   * inside of the bend, more and deeper the more the joint is bent. They follow the bones every frame.
   */
  folds(ctx, a, j, b, r, base) {
    const ux = j.x - a.x, uy = j.y - a.y, vx = b.x - j.x, vy = b.y - j.y;
    const lu = Math.hypot(ux, uy) || 1, lv = Math.hypot(vx, vy) || 1;
    const u = { x: ux / lu, y: uy / lu }, v = { x: vx / lv, y: vy / lv };
    const cross = u.x * v.y - u.y * v.x;
    const bend = Math.acos(Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y)));
    if (bend < 0.22) return;
    const sg = cross >= 0 ? 1 : -1;
    // average axis and the inner-side normal
    let ax = u.x + v.x, ay = u.y + v.y;
    const la = Math.hypot(ax, ay) || 1;
    ax /= la; ay /= la;
    const nx = -ay * sg, ny = ax * sg;
    const n = Math.min(3, 1 + Math.round(bend * 1.6));
    const k = Math.min(1, bend / 1.2);
    const dark = rgba(this.outline, 0.16 + 0.24 * k), light = rgba(lighten(base, 0.35), 0.3 * k);
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * r * 0.55;
      const len = r * (0.45 + 0.35 * k) * (1 - Math.abs(i - (n - 1) / 2) * 0.3);
      const s0 = { x: j.x + ax * off + nx * r * 0.98, y: j.y + ay * off + ny * r * 0.98 };
      const s1 = { x: s0.x - nx * len + ax * off * 0.5, y: s0.y - ny * len + ay * off * 0.5 };
      const c = { x: (s0.x + s1.x) / 2 + ax * r * 0.18, y: (s0.y + s1.y) / 2 + ay * r * 0.18 };
      ctx.beginPath();
      ctx.moveTo(s0.x, s0.y);
      ctx.quadraticCurveTo(c.x, c.y, s1.x, s1.y);
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = dark;
      ctx.stroke();
      // a thin lit ridge next to each crease gives the cloth relief
      ctx.beginPath();
      ctx.moveTo(s0.x + ax * 1.6, s0.y + ay * 1.6);
      ctx.quadraticCurveTo(c.x + ax * 1.6, c.y + ay * 1.6, s1.x + ax * 1.2, s1.y + ay * 1.2);
      ctx.lineWidth = 1;
      ctx.strokeStyle = light;
      ctx.stroke();
    }
  }

  /** Worn, lighter patch (knees, elbows) on the outside of a joint. */
  wear(ctx, a, j, b, r, base) {
    const p = along(a, j, 1);
    const ux = j.x - a.x, uy = j.y - a.y, vx = b.x - j.x, vy = b.y - j.y;
    const cross = ux * vy - uy * vx;
    const sg = cross >= 0 ? -1 : 1; // outside of the bend
    const q = along(a, j, 1, sg * r * 0.45);
    void p;
    ctx.save();
    ctx.translate(q.x, q.y);
    ctx.rotate(Math.atan2(uy, ux));
    ctx.scale(1, 0.6);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.6);
    g.addColorStop(0, rgba(lighten(base, 0.3), 0.16));
    g.addColorStop(1, rgba(lighten(base, 0.3), 0));
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, 2 * r, 2 * r);
    ctx.restore();
  }

  /** Stitched seam running along a limb. */
  seam(ctx, pts, base) {
    ctx.save();
    ctx.setLineDash([2.2, 2.6]);
    this.line(ctx, pts, 0.8, lighten(base, 0.28), 0.3);
    ctx.setLineDash([]);
    this.line(ctx, pts.map((p) => ({ x: p.x - 1, y: p.y - 0.6 })), 0.7, this.outline, 0.16);
    ctx.restore();
  }

  // --- main entry ------------------------------------------------------------------------------
  /**
   * opts: { layers, tint (0..1 white flash), chains: {name: [points local]}, time, blink }
   */
  draw(ctx, skel, opts = {}) {
    this.look = opts.critical ? this.lookHurt : this.lookBase;
    if (opts.lookOverride) {
      // fatality gags (pants dropped...): cached merge of the current look with the override
      if (this.ovSrc !== opts.lookOverride || this.ovBase !== this.look) {
        this.ovSrc = opts.lookOverride;
        this.ovBase = this.look;
        this.ovLook = mergeLook(this.look, opts.lookOverride);
      }
      this.look = this.ovLook;
    }
    this.tintColor = opts.tintColor || '#ffffff';
    const lk = this.look;
    const fc = opts.facing < 0 ? -1 : 1;
    this.L = { x: LIGHT_WORLD.x * fc, y: LIGHT_WORLD.y };
    // rim light: the fighter's neon accent mixed with the arena's back light
    this.rimC = opts.envRim ? mix(lk.rim || '#ff4fd8', opts.envRim, 0.5) : lk.rim || '#ff4fd8';
    this.outline = opts.tint ? mix(lk.outline || '#141014', this.tintColor, opts.tint * (opts.tintColor ? 0.8 : 0.4)) : lk.outline || '#141014';
    this.tint = opts.tint || 0;
    this.battered = !!opts.critical;
    this.prop = opts.prop || null;
    this.fire = !!opts.fire;
    this.claws = !!opts.claws;
    this.clawMarks = opts.clawMarks || 0;
    this.biting = !!opts.bite;
    this.springExt = opts.springExt || 0;
    this.marks = opts.marks || {};
    this.flurry = !!opts.flurry;
    this.time = (opts.now || 0) / 1000;
    const t = this.tint;
    this.skin = this.mat(lk.skin, t);
    const layers = opts.layers || {};
    const J = skel.j, A = skel.a;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const groups = [];
    const push = (z, fn, pre = null) => groups.push({ z, fn, pre });
    // Back-most secondary elements.
    push(0, (p) => this.drawChains(ctx, p, opts.chains, 'back', J, A));
    push(0.5, (p) => this.drawBackGuitar(ctx, p, J, A));
    // Seamless joints: limbs and body are separate outlined groups, so where a limb meets the body
    // the outline of whichever is drawn on top would cut across the joint. Around each shoulder and
    // hip (a circle at the joint):
    //  - a limb drawn OVER the body (near arm, near leg) draws that part of its outline before the
    //    body's fill, which then hides it wherever the body is;
    //  - a body part drawn OVER a limb (torso over the far arm, pelvis over the far leg) gets that
    //    part of the limb repainted between its outline and fill, which hides the body's outline.
    // Where the limb sticks out past the body the silhouette outline stays.
    const pr = this.pr;
    const shR = (pr.rUpperArm[0] + 2.2) * 1.9, hipR = pr.rThigh[0] * 1.5 + 2;
    const sF = { ...J.shoulderF, r: shR }, sB = { ...J.shoulderB, r: shR };
    const hF = { ...J.hipF, r: hipR }, hB = { ...J.hipB, r: hipR };
    push(1, (p) => this.drawArm(ctx, p, J, A, 'B'));
    push(2, (p) => this.drawLeg(ctx, p, J, A, 'B'));
    push(3, (p) => this.drawCoatSkirt(ctx, p, J, A, 'back', opts.chains));
    push(4, (p) => this.drawPelvis(ctx, p, J, A), () => {
      this.clipped(ctx, hB, true, () => this.drawLeg(ctx, 'fill', J, A, 'B'));
      this.clipped(ctx, { ...hF, r: hF.r + TAPER }, true, () => this.drawLeg(ctx, 'outline', J, A, 'F'));
    });
    push(5, (p) => (p === 'outline' ? this.taperedOutline(ctx, hF, () => this.drawLeg(ctx, p, J, A, 'F')) : this.drawLeg(ctx, p, J, A, 'F')));
    push(6, (p) => this.drawTorso(ctx, p, J, A), () => {
      this.clipped(ctx, sB, true, () => this.drawArm(ctx, 'fill', J, A, 'B'));
      // below the belt the torso is the trousers' seat: no line where the legs come out of it
      // (far leg first, then the near leg over both areas so their overlap keeps the right order)
      const lB = { ...hB, r: hB.r * 1.5 }, lF = { ...hF, r: hF.r * 1.5 };
      this.clipped(ctx, lB, true, () => this.drawLeg(ctx, 'fill', J, A, 'B'));
      this.clipped(ctx, lB, true, () => this.drawLeg(ctx, 'outline', J, A, 'F'));
      for (const c of [lB, lF]) this.clipped(ctx, c, true, () => this.drawLeg(ctx, 'fill', J, A, 'F'));
      this.clipped(ctx, { ...sF, r: sF.r + TAPER }, true, () => this.drawArm(ctx, 'outline', J, A, 'F'));
    });
    push(6.5, (p) => this.drawCoatSkirt(ctx, p, J, A, 'front', opts.chains));
    push(7, (p) => this.drawHead(ctx, p, J, A, opts));
    push(7.5, (p) => this.drawChains(ctx, p, opts.chains, 'front', J, A));
    push(8, (p) => (p === 'outline' ? this.taperedOutline(ctx, sF, () => this.drawArm(ctx, p, J, A, 'F')) : this.drawArm(ctx, p, J, A, 'F')));
    // Fixed depth order: far arm < far leg < torso < near leg < near arm. Attack animations do not
    // re-layer limbs: switching layers mid-move makes a limb "pop" over the body for a frame and
    // makes the far (left) limb read as the near (right) one.
    void layers;
    groups.sort((a, b) => a.z - b.z);
    for (const g of groups) {
      g.fn('outline');
      g.pre?.();
      g.fn('fill');
    }
  }

  /**
   * Outline pass of a limb drawn over the body, outside joint circle c. Across a band just outside
   * the circle the outline gets thinner toward the joint, so over the body it tapers off instead of
   * ending in a hard cut (the full-width part inside the band was drawn before the body's fill).
   */
  taperedOutline(ctx, c, fn) {
    const ow = this.ow;
    this.clipped(ctx, { ...c, r: c.r + TAPER }, false, fn);
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      const r0 = c.r + (TAPER * i) / steps, r1 = c.r + (TAPER * (i + 1)) / steps;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(c.x + r1, c.y);
      ctx.arc(c.x, c.y, r1, 0, Math.PI * 2);
      ctx.moveTo(c.x + r0, c.y);
      ctx.arc(c.x, c.y, r0, 0, Math.PI * 2);
      ctx.clip('evenodd');
      this.ow = ow * ((i + 1) / (steps + 1));
      fn();
      ctx.restore();
    }
    this.ow = ow;
  }

  /** Runs fn clipped inside (or outside) circle c = { x, y, r }. */
  clipped(ctx, c, inside, fn) {
    ctx.save();
    ctx.beginPath();
    if (!inside) ctx.rect(c.x - 4000, c.y - 4000, 8000, 8000);
    ctx.moveTo(c.x + c.r, c.y);
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.clip(inside ? 'nonzero' : 'evenodd');
    fn();
    ctx.restore();
  }

  // --- limbs -----------------------------------------------------------------------------------
  drawArm(ctx, pass, J, A, side) {
    const lk = this.look, pr = this.pr, t = this.tint;
    const back = side === 'B';
    const depth = back ? 0.16 : 0;
    const S = J['shoulder' + side], E = J['elbow' + side], Wr = J['wrist' + side], H = J['hand' + side];
    const top = lk.top || {};
    const shortCut = top.sleeves === 'short';
    const fullSleeve = !shortCut && ['trench', 'jacket', 'longcoat', 'bodysuit', 'chefcoat', 'opencoat', 'onesie', 'gi', 'tunic'].includes(top.type);
    const shortSleeve = shortCut || ['tee', 'henley'].includes(top.type);
    const sleeveC = this.mat(darken(top.color || lk.skin, depth), t).base;
    const skin = this.mat(darken(lk.skin, depth), t).base;
    const muscle = (this.def.body.bulk || 1) * (this.def.body.armBulk || 1);
    const [ru0, ru1] = pr.rUpperArm, [rf0, rf1] = pr.rForeArm;
    const sleeveBoost = fullSleeve ? 2.2 : 0;

    // Shoulder mass (deltoid) + upper arm + forearm
    const upperC = fullSleeve ? sleeveC : skin;
    // biceps peaks mid-arm and stays modest: a big rounded bulge over the chest reads as a bust
    this.seg(ctx, pass, S, E, ru0 + sleeveBoost, ru1 + sleeveBoost * 0.8, upperC, 1.7 * muscle, 1.4 * muscle, 0.5);
    if (pass === 'fill' && shortSleeve) {
      // short sleeve over the deltoid
      const sEnd = along(S, E, 0.5);
      ctx.beginPath();
      limbPath(ctx, S, sEnd, ru0 + 2.2, ru0 + 2.0, 0.8 * muscle, 0.8);
      ctx.fillStyle = sleeveC;
      ctx.fill();
      this.shadeSeg(ctx, S, sEnd, ru0 + 3);
      this.line(ctx, [along(S, E, 0.5, ru0 + 2.4), along(S, E, 0.52, 0), along(S, E, 0.5, -(ru0 + 2.4))], 1.6, this.outline, 0.9);
    }
    if (pass === 'fill' && !fullSleeve && !shortSleeve && muscle > 0.95) {
      // biceps / deltoid separation line
      this.line(ctx, [along(S, E, 0.22, ru0 * 0.2), along(S, E, 0.45, ru0 * 0.75), along(S, E, 0.7, ru0 * 0.6)], 1.3, this.outline, 0.45);
    }
    const gl = lk.gloves || { type: 'none' };
    const foreC = fullSleeve ? sleeveC : gl.type === 'gauntlet' ? this.mat(darken(gl.color, depth), t).base : skin;
    this.seg(ctx, pass, E, Wr, rf0 + sleeveBoost * 0.8, rf1 + sleeveBoost * 0.6, foreC, 2.2 * muscle, 1.4 * muscle, 0.22);
    if (pass === 'fill' && fullSleeve) {
      this.folds(ctx, S, E, Wr, rf0 + sleeveBoost * 0.8 + 1.5, sleeveC);
      this.wear(ctx, S, E, Wr, rf0 + 2, sleeveC);
      this.seam(ctx, [along(S, E, 0.12, -(ru0 + 1.5)), along(S, E, 0.6, -(ru1 + 1.6)), along(E, Wr, 0.15, -(rf0 + 1.2)), along(E, Wr, 0.75, -(rf1 + 1))], sleeveC);
    } else if (pass === 'fill' && !shortSleeve) {
      // bare arm: a skin crease on the inside of the elbow
      this.folds(ctx, S, E, Wr, rf0 * 0.8, skin);
    }
    if (pass === 'fill' && fullSleeve) {
      // cuff
      const c0 = along(E, Wr, 0.8), c1 = along(E, Wr, 1.0);
      ctx.beginPath();
      limbPath(ctx, c0, c1, rf1 + 2.4, rf1 + 2.4);
      ctx.fillStyle = this.mat(darken(top.color2 || top.color, depth + 0.1), t).base;
      ctx.fill();
    }
    if (pass === 'fill' && this.marks.char) {
      // Cinder's super: sleeve ends burnt
      if (fullSleeve) this.charCuff(ctx, E, Wr, rf0 + 2.4, rf1 + 2.6, 0.97, 13, back ? 3 : 4);
      else if (shortSleeve) this.charCuff(ctx, S, along(S, E, 0.5), ru0 + 2.2, ru0 + 2.0, 0.95, 8, back ? 5 : 6);
    }
    if (pass === 'fill' && gl.type === 'gauntlet') {
      for (const k of [0.3, 0.55, 0.8]) this.line(ctx, [along(E, Wr, k, rf0 + 1), along(E, Wr, k + 0.03, -(rf0 + 1))], 1.4, this.outline, 0.7);
    }
    if (pass === 'fill' && (gl.type === 'wraps')) {
      const w0 = along(E, Wr, 0.62), w1 = Wr;
      ctx.beginPath();
      limbPath(ctx, w0, w1, rf1 + 1.2, rf1 + 1.2);
      ctx.fillStyle = this.mat(gl.color, t).base;
      ctx.fill();
      for (const k of [0.7, 0.8, 0.9]) this.line(ctx, [along(E, Wr, k, rf1 + 1), along(E, Wr, k + 0.04, -(rf1 + 1))], 0.9, this.outline, 0.4);
    }
    if (this.prop?.type === 'pan' && this.prop.hand === side) this.drawPan(ctx, pass, E, H, depth);
    if (this.prop?.type === 'guitar' && this.prop.hand === side) this.drawGuitar(ctx, pass, E, H, depth);
    if (this.prop?.type === 'glove' && this.prop.hand === side) this.drawSpringGlove(ctx, pass, E, H);
    this.drawFist(ctx, pass, Wr, H, side, depth);
    // flurry afterimages: translucent fists trailing ahead of the real one (Tao's barrages)
    if (this.flurry && pass === 'fill') {
      const dx = H.x - E.x, dy = H.y - E.y, l = Math.hypot(dx, dy) || 1;
      ctx.save();
      for (const [k, off, a] of [[16, 9, 0.35], [30, -7, 0.22], [44, 12, 0.12]]) {
        const cx = H.x + (dx / l) * k - (dy / l) * off, cy = H.y + (dy / l) * k + (dx / l) * off;
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(cx, cy, this.pr.rHand * 1.15, 0, Math.PI * 2);
        ctx.fillStyle = this.mat(this.look.skin, 0).light;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
      ctx.restore();
    }
    // flaming fists (Cinder's specials / super only; normal attacks stay clean)
    if (this.fire && pass === 'fill') {
      const c = along(Wr, H, 0.7);
      drawFireFist(ctx, c.x, c.y, this.pr.rHand * 2.5, this.time, side === 'F' ? 0 : 5);
    }
    // Armour pauldron on the lead shoulder.
    if ((top.type === 'armor' || top.type === 'punkvest') && !back) this.drawPauldron(ctx, pass, S, E, A['upperArm' + side]);
  }

  /** Cast-iron frying pan gripped in the fist: handle along the hand, round pan beyond it. */
  drawPan(ctx, pass, E, H, depth) {
    const t = this.tint;
    // handle follows the forearm with a slight wrist cock (same geometry as the pan hitbox)
    const a0 = Math.atan2(H.y - E.y, H.x - E.x) + PAN_COCK;
    const dx = Math.cos(a0), dy = Math.sin(a0);
    const at = (k, n = 0) => ({ x: H.x + dx * k - dy * n, y: H.y + dy * k + dx * n });
    const ang = Math.atan2(dy, dx);
    const c = at(44);
    const iron = this.mat(darken('#3a3b44', depth), t).base;
    const handleC = this.mat(darken('#4a2c1a', depth), t).base;
    if (pass === 'outline') {
      ctx.beginPath();
      limbPath(ctx, at(-8), at(26), 5.5, 5);
      this.outlineFill(ctx);
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, 22, 19, ang, 0, Math.PI * 2);
      return this.outlineFill(ctx);
    }
    // wooden handle with a steel collar
    ctx.beginPath();
    limbPath(ctx, at(-8), at(26), 3.6, 3.2);
    ctx.fillStyle = handleC;
    ctx.fill();
    this.line(ctx, [at(-6, 1.4), at(14, 1.4)], 1, rgba('#ffffff', 0.25), 1);
    ctx.beginPath();
    limbPath(ctx, at(16), at(26), 3.8, 4.4);
    ctx.fillStyle = iron;
    ctx.fill();
    // pan body: outer rim, darker cooking surface, rim highlight
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, 22, 19, ang, 0, Math.PI * 2);
    ctx.fillStyle = iron;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(c.x + dx * 1.5, c.y + dy * 1.5, 17, 14.5, ang, 0, Math.PI * 2);
    ctx.fillStyle = this.mat(darken('#22232a', depth), t).base;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = rgba(this.outline, 0.7);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, 20, 17, ang, Math.PI * 0.15, Math.PI * 0.85);
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = rgba('#c9cbd6', 0.75);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(c.x - dx * 3, c.y - dy * 3, 7, 3.5, ang + 0.6, 0, Math.PI * 2);
    ctx.fillStyle = rgba('#ffffff', 0.12);
    ctx.fill();
  }

  /** Chuy's guitar swung by the neck (same geometry as the GUITAR hitbox). */
  drawGuitar(ctx, pass, E, H, depth) {
    const g = this.look.guitar || { color: '#2fb8a8', dark: '#1a6a64', neck: '#3a2418', head: '#e2b440' };
    const a0 = Math.atan2(H.y - E.y, H.x - E.x) + GUITAR_COCK;
    const dx = Math.cos(a0), dy = Math.sin(a0);
    const at = (k, n = 0) => ({ x: H.x + dx * k - dy * n, y: H.y + dy * k + dx * n });
    this.guitarShape(ctx, pass, at, Math.atan2(dy, dx), g, depth);
  }

  /** Guitar drawn along a local axis: `at(k, n)` maps distance along the neck / across it. */
  guitarShape(ctx, pass, at, ang, g, depth = 0) {
    const t = this.tint;
    const body = () => {
      ctx.beginPath();
      const c1 = at(52), c2 = at(76, 2);
      ctx.ellipse(c1.x, c1.y, 15, 17, ang, 0, Math.PI * 2);
      ctx.moveTo(c2.x + 20, c2.y);
      ctx.ellipse(c2.x, c2.y, 21, 22, ang, 0, Math.PI * 2);
    };
    if (pass === 'outline') {
      ctx.beginPath();
      limbPath(ctx, at(-14), at(44), 4.2, 4.2);
      this.outlineFill(ctx);
      body();
      return this.outlineFill(ctx);
    }
    // neck + head
    ctx.beginPath();
    limbPath(ctx, at(-6), at(44), 3.2, 3.2);
    ctx.fillStyle = this.mat(darken(g.neck, depth), t).base;
    ctx.fill();
    ctx.beginPath();
    limbPath(ctx, at(-16), at(-5), 4.4, 3.6);
    ctx.fillStyle = this.mat(darken(g.head, depth), t).base;
    ctx.fill();
    // body
    body();
    ctx.fillStyle = this.mat(darken(g.color, depth), t).base;
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = rgba(this.outline, 0.6);
    ctx.stroke();
    const hole = at(56);
    ctx.beginPath();
    ctx.arc(hole.x, hole.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = this.mat(darken(g.dark, depth), t).base;
    ctx.fill();
    const br = at(82);
    ctx.beginPath();
    limbPath(ctx, at(80, -6), at(80, 6), 2, 2);
    ctx.fillStyle = this.mat(g.neck, t).base;
    ctx.fill();
    void br;
    // strings
    for (const n of [-1.6, 0, 1.6]) this.line(ctx, [at(-10, n * 0.6), at(80, n)], 0.6, '#e8e8f0', 0.8);
  }

  /** Sobby's boxing glove on a spring: springExt (0..1) shoots it out past the fist. */
  drawSpringGlove(ctx, pass, E, H) {
    const a0 = Math.atan2(H.y - E.y, H.x - E.x);
    const dx = Math.cos(a0), dy = Math.sin(a0);
    const L = SPRING_REACH * this.springExt;
    const c = { x: H.x + dx * (L + 6), y: H.y + dy * (L + 6) };
    if (pass === 'outline') {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 15, 0, Math.PI * 2);
      return this.outlineFill(ctx);
    }
    if (L > 2) {
      // coiled spring
      ctx.beginPath();
      const n = 9;
      for (let i = 0; i <= n * 4; i++) {
        const k = i / (n * 4), w = Math.sin(k * n * Math.PI * 2) * 6;
        const x = H.x + dx * L * k - dy * w, y = H.y + dy * L * k + dx * w;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = this.outline;
      ctx.stroke();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = '#c9cbd6';
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(c.x, c.y, 15, 0, Math.PI * 2);
    ctx.fillStyle = this.mat('#e8203a', this.tint).base;
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = this.outline;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(c.x - dx * 4 + dy * 5, c.y - dy * 4 - dx * 5, 6, 4, a0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fill();
  }

  /** Chuy's guitar slung on his back (hidden while it is in his hands). */
  drawBackGuitar(ctx, pass, J, A) {
    const g = this.look.guitar;
    if (!g || this.prop?.type === 'guitar') return;
    const F = this.torsoFrame(J, A);
    const base = P2(F.W, F.fS, -F.ww * 1.1, F.uS, -6);
    const top = P2(F.N, F.fC, -F.cw * 0.9, F.uC, 34);
    const ang = Math.atan2(top.y - base.y, top.x - base.x) + Math.PI;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const at = (k, n = 0) => ({ x: top.x + dx * (k + 16) - dy * n, y: top.y + dy * (k + 16) + dx * n });
    this.guitarShape(ctx, pass, at, ang, g, 0.15);
  }

  drawFist(ctx, pass, Wr, H, side, depth) {
    const lk = this.look, pr = this.pr, t = this.tint;
    const gl = lk.gloves || { type: 'none' };
    const w = pr.rHand * 1.05;
    const tip = along(Wr, H, 1.12);
    ctx.beginPath();
    boxAlong(ctx, along(Wr, H, -0.05), tip, w * 0.9, w * 1.05, 0.75);
    if (pass === 'outline') return this.outlineFill(ctx);
    const skin = this.mat(darken(lk.species === 'weasel' ? lk.skin : lk.skin, depth), t).base;
    const gloveC = this.mat(darken(gl.color || lk.skin, depth), t).base;
    const full = gl.type === 'gloves' || gl.type === 'gauntlet' || gl.type === 'paws';
    ctx.fillStyle = full ? gloveC : skin;
    ctx.fill();
    this.shadeSeg(ctx, Wr, tip, w * 1.1);
    if (gl.type === 'fingerless') {
      ctx.beginPath();
      boxAlong(ctx, along(Wr, H, -0.05), along(Wr, H, 0.62), w * 0.95, w * 1.08, 0.5);
      ctx.fillStyle = gloveC;
      ctx.fill();
      this.shadeSeg(ctx, Wr, along(Wr, H, 0.62), w * 1.1);
    } else if (gl.type === 'wraps') {
      ctx.beginPath();
      boxAlong(ctx, along(Wr, H, 0.0), along(Wr, H, 0.7), w * 0.95, w * 1.08, 0.5);
      ctx.fillStyle = this.mat(gl.color, t).base;
      ctx.fill();
      this.line(ctx, [along(Wr, H, 0.25, w), along(Wr, H, 0.45, -w)], 0.9, this.outline, 0.35);
    }
    if (gl.type === 'paws') {
      // onesie paw: claws over the knuckles, longer and brighter while the super rages
      const len = this.claws ? 1.0 : 0.45;
      for (const k of [-0.6, 0, 0.6]) {
        const a = along(Wr, H, 1.0, w * k), b = along(Wr, H, 1.12 + len * 0.5, w * k * 1.15);
        this.line(ctx, [a, b], this.claws ? 2.6 : 2, this.mat(gl.claws, t).base);
      }
    }
    // knuckles + thumb
    this.line(ctx, [along(Wr, H, 0.78, w * 0.9), along(Wr, H, 0.82, 0), along(Wr, H, 0.78, -w * 0.9)], 1.2, this.outline, 0.55);
    const th = along(Wr, H, 0.55, w * 0.85);
    ctx.beginPath();
    ctx.ellipse(th.x, th.y, w * 0.45, w * 0.32, Math.atan2(H.y - Wr.y, H.x - Wr.x), 0, Math.PI * 2);
    ctx.fillStyle = full ? darken(gloveC, 0.1) : darken(skin, 0.08);
    ctx.fill();
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = rgba(this.outline, 0.6);
    ctx.stroke();
  }

  drawPauldron(ctx, pass, S, E, ang) {
    const t = this.tint, top = this.look.top;
    const c = along(S, E, 0.12);
    const r = this.pr.rUpperArm[0] * 1.9;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, r, r * 0.78, (ang + 90) * DEG, 0, Math.PI * 2);
    if (pass === 'outline') return this.outlineFill(ctx);
    ctx.fillStyle = this.mat(top.color, t).base;
    ctx.fill();
    this.shadeAcross(ctx, { x: c.x + r * 0.5, y: c.y + r }, { x: c.x - r * 0.5, y: c.y - r });
    if (top.spikes) {
      const a0 = (ang + 90) * DEG;
      for (const k of [-0.75, -0.25, 0.25, 0.75]) {
        const bx = c.x + Math.cos(a0) * r * k * 0.9, by = c.y + Math.sin(a0) * r * k * 0.9;
        const nx = Math.cos(a0 + Math.PI / 2), ny = Math.sin(a0 + Math.PI / 2);
        const dir = ny > 0 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(bx - Math.cos(a0) * 3.5, by - Math.sin(a0) * 3.5);
        ctx.lineTo(bx + nx * dir * r * 0.95, by + ny * dir * r * 0.95);
        ctx.lineTo(bx + Math.cos(a0) * 3.5, by + Math.sin(a0) * 3.5);
        ctx.closePath();
        ctx.fillStyle = this.mat(top.spikes, t).base;
        ctx.fill();
        ctx.lineWidth = 1.3;
        ctx.strokeStyle = this.outline;
        ctx.stroke();
      }
      return;
    }
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, r * 0.7, r * 0.5, (ang + 90) * DEG, Math.PI * 1.05, Math.PI * 1.95);
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = this.mat(top.trim || '#c27b2c', t).base;
    ctx.stroke();
    for (const k of [-0.5, 0, 0.5]) {
      ctx.beginPath();
      ctx.arc(c.x + Math.cos((ang + 90) * DEG) * r * 0.75 * k, c.y + Math.sin((ang + 90) * DEG) * r * 0.75 * k, 1.6, 0, Math.PI * 2);
      ctx.fillStyle = '#d9d2c4';
      ctx.fill();
    }
  }

  drawLeg(ctx, pass, J, A, side) {
    const lk = this.look, pr = this.pr, t = this.tint;
    const back = side === 'B';
    const depth = back ? 0.16 : 0;
    const Hp = J['hip' + side], K = J['knee' + side], An = J['ankle' + side];
    const pants = lk.pants || { type: 'pants', color: '#333' };
    const legBulk = (this.def.body.bulk || 1) * (this.def.body.legBulk || 1);
    const pantsC = this.mat(darken(pants.color, depth), t).base;
    const skin = this.mat(darken(lk.skin, depth), t).base;
    const loose = pants.type === 'cargo' || pants.type === 'pants';
    const extra = loose ? 2.6 : 0;
    const [rt0, rt1] = pr.rThigh, [rs0, rs1] = pr.rShin;
    const thighC = pants.type === 'shorts' ? skin : pantsC;
    this.seg(ctx, pass, Hp, K, rt0 + extra, rt1 + extra, thighC, 3 * legBulk, 2.2 * legBulk, 0.36);
    if (pass === 'fill' && pants.type === 'shorts') {
      const e = along(Hp, K, 0.5);
      ctx.beginPath();
      limbPath(ctx, Hp, e, rt0 + 2.5, rt0 + 1.5, 2, 2);
      ctx.fillStyle = pantsC;
      ctx.fill();
      this.shadeSeg(ctx, Hp, e, rt0 + 3);
      if (pants.color2) this.line(ctx, [along(Hp, K, 0.46, rt0 + 1.5), along(Hp, K, 0.48, -(rt0 + 1.5))], 2.4, this.mat(pants.color2, t).base);
    }
    const shoes = lk.shoes || { type: 'shoes' };
    const shinC = pants.type === 'shorts' ? skin : pantsC;
    this.seg(ctx, pass, K, An, rs0 + extra * 0.8, rs1 + extra * (loose ? 1.2 : 0.4), shinC, 1.4 * legBulk, 3.2 * legBulk, 0.3);
    if (pass === 'fill') {
      if (pants.type !== 'shorts') {
        // creases behind the knee, a worn knee, and the side seam; all ride on the bones
        this.folds(ctx, Hp, K, An, rt1 + extra, pantsC);
        if (loose) this.wear(ctx, Hp, K, An, rt1 + extra, pantsC);
        this.seam(ctx, [along(Hp, K, 0.06, -rt0 * 0.18), along(Hp, K, 0.55, -rt1 * 0.2), along(K, An, 0.1, -rs0 * 0.2), along(K, An, 0.6, -rs1 * 0.2)], pantsC);
        if (loose) {
          // fabric bunching above the ankle
          for (const k of [0.78, 0.86]) this.line(ctx, [along(K, An, k, rs1 + extra), along(K, An, k + 0.04, 0), along(K, An, k + 0.02, -(rs1 + extra))], 1.1, this.outline, 0.3);
        }
      }
      if (loose) {
        if (pants.type === 'cargo') {
          ctx.beginPath();
          boxAlong(ctx, along(Hp, K, 0.42, 1), along(Hp, K, 0.72, 1), rt0 * 0.55, rt1 * 0.6, 0.3);
          ctx.fillStyle = darken(pantsC, 0.12);
          ctx.fill();
          ctx.lineWidth = 1.1;
          ctx.strokeStyle = rgba(this.outline, 0.5);
          ctx.stroke();
        }
      } else if (pants.type === 'shorts' || pants.type === 'tights') {
        this.line(ctx, [along(K, An, 0.15, -rs0 * 0.6), along(K, An, 0.38, -rs0 * 1.1), along(K, An, 0.6, -rs0 * 0.7)], 1.2, this.outline, 0.4);
      }
      if (pants.type === 'tights' && pants.color2) {
        ctx.beginPath();
        limbPath(ctx, along(Hp, K, 0.85), along(K, An, 0.15), rt1 + 1, rs0 + 1);
        ctx.fillStyle = this.mat(darken(pants.color2, depth), t).base;
        ctx.fill();
      }
      if (this.marks.char && pants.type !== 'shorts') this.charCuff(ctx, K, An, rs0 + extra * 0.8, rs1 + extra * (loose ? 1.2 : 0.4), 0.92, 12, back ? 7 : 8);
      else if (this.marks.char) this.charCuff(ctx, Hp, along(Hp, K, 0.5), rt0 + 2.5, rt0 + 1.5, 0.95, 9, back ? 7 : 8);
      if (shoes.type === 'boots') {
        const b0 = along(K, An, 0.55);
        ctx.beginPath();
        limbPath(ctx, b0, An, rs1 + 3.2, rs1 + 3.6, 1, 1);
        ctx.fillStyle = this.mat(darken(shoes.color, depth), t).base;
        ctx.fill();
        this.shadeSeg(ctx, b0, An, rs1 + 4);
        this.line(ctx, [along(K, An, 0.56, rs1 + 3.2), along(K, An, 0.58, -(rs1 + 3.2))], 1.6, this.outline, 0.8);
      } else if (shoes.type === 'wrapped') {
        const b0 = along(K, An, 0.72);
        ctx.beginPath();
        limbPath(ctx, b0, An, rs1 + 1.2, rs1 + 1.6);
        ctx.fillStyle = this.mat(shoes.color, t).base;
        ctx.fill();
      }
    }
    this.drawFoot(ctx, pass, J, A, side, depth);
  }

  drawFoot(ctx, pass, J, A, side, depth) {
    const lk = this.look, pr = this.pr, t = this.tint;
    const shoes = lk.shoes || { type: 'shoes', color: '#222' };
    const An = J['ankle' + side], Hl = J['heel' + side], Tt = J['toe' + side];
    const fa = A['foot' + side];
    const up = dirUp(fa), fw = dirFwd(fa);
    const h = pr.ankleH;
    const boots = shoes.type === 'boots';
    const pts = [
      P(Hl, up, 1),
      P(P(Tt, fw, 2), up, 1.5),
      P2(Tt, up, h * 0.95, fw, -1),
      P2(An, fw, pr.foot * 0.35, up, h * 0.55),
      P2(An, fw, 4, up, h * (boots ? 1.4 : 0.9)),
      P2(An, fw, -pr.rShin[1] - 1, up, h * (boots ? 1.3 : 0.8)),
      P2(Hl, up, h * 0.8, fw, -2.5),
    ];
    ctx.beginPath();
    smoothClosed(ctx, pts, 0.35);
    if (shoes.big) {
      // clown shoes: a big round toe bulb
      const toe = P2(Tt, fw, 7, up, h * 0.55);
      ctx.moveTo(toe.x + 11, toe.y);
      ctx.ellipse(toe.x, toe.y, 11, h * 0.95, Math.atan2(fw.y, fw.x), 0, Math.PI * 2);
    }
    if (pass === 'outline') return this.outlineFill(ctx);
    const bare = shoes.type === 'wrapped';
    ctx.fillStyle = bare ? this.mat(darken(lk.skin, depth), t).base : this.mat(darken(shoes.color, depth), t).base;
    ctx.fill();
    this.shadeAcross(ctx, P(An, up, h * 1.4), P(Hl, up, -2));
    if (bare) {
      ctx.beginPath();
      smoothClosed(ctx, [P2(An, fw, -5, up, h * 0.9), P2(An, fw, pr.foot * 0.45, up, h * 0.5), P2(An, fw, pr.foot * 0.45, up, -h * 0.1), P2(An, fw, -5, up, 0)], 0.3);
      ctx.fillStyle = this.mat(shoes.color, t).base;
      ctx.fill();
      return;
    }
    // sole
    ctx.beginPath();
    smoothOpen(ctx, [P2(Hl, up, 1.5, fw, -2), P2(Hl, fw, pr.foot * 0.5, up, 0.8), P2(Tt, up, 1.8, fw, 1.5)]);
    ctx.lineWidth = 3.4;
    ctx.strokeStyle = this.mat(shoes.sole || darken(shoes.color, 0.5), t).base;
    ctx.stroke();
    if (shoes.type === 'sneakers') {
      this.line(ctx, [P2(An, fw, 1, up, h * 0.6), P2(An, fw, pr.foot * 0.45, up, h * 0.35)], 1.2, this.outline, 0.5);
      ctx.beginPath();
      ctx.arc(P2(An, fw, 2, up, h * 0.2).x, P2(An, fw, 2, up, h * 0.2).y, 2.6, 0, Math.PI * 2);
      ctx.fillStyle = this.mat(shoes.sole || '#888', t).base;
      ctx.fill();
    }
  }

  // --- torso -----------------------------------------------------------------------------------
  torsoFrame(J, A) {
    const pr = this.pr;
    const uS = dirUp(A.spine), uC = dirUp(A.chest), uP = dirUp(A.pelvis);
    const fS = fwdOf(uS), fC = fwdOf(uC), fP = fwdOf(uP);
    const N = J.neck, W = J.waist, Pv = J.pelvis;
    const up = Math.hypot(N.x - W.x, N.y - W.y);
    return { uS, uC, uP, fS, fC, fP, N, W, Pv, up, cw: pr.chestW, ww: pr.waistW, hw: pr.hipW };
  }

  torsoPoints(F) {
    const { uS, uC, uP, fS, fC, fP, N, W, Pv, up, cw, ww, hw } = F;
    if (this.look.female) {
      return [
        P2(N, fC, this.pr.rNeck * 1.2, uC, -1),
        P2(N, uC, -up * 0.16, fC, cw * 0.82),
        P2(N, uC, -up * 0.5, fC, cw * 1.02),
        P2(W, uS, 2, fS, ww * 0.92),
        P2(Pv, uP, -2, fP, hw * 0.9),
        P2(Pv, uP, -this.pr.hipDrop - 8, fP, 2),
        P2(Pv, uP, -4, fP, -hw * 0.9),
        P2(W, fS, -ww * 0.86, uS, 0),
        P2(N, uC, -up * 0.5, fC, -cw * 0.9),
        P2(N, uC, -up * 0.08, fC, -cw * 0.78),
        P2(N, fC, -this.pr.rNeck * 1.1, uC, 3),
      ];
    }
    // Male profile: broad flat pectorals high on the ribcage, then an almost straight abdomen
    // (no round bulge followed by a deep waist cut, which reads as a bust in side view).
    const belly = Math.max(ww, cw * 0.84);
    return [
      P2(N, fC, this.pr.rNeck * 1.2, uC, -1),
      P2(N, uC, -up * 0.1, fC, cw * 0.88),
      P2(N, uC, -up * 0.36, fC, cw * 0.94),
      P2(N, uC, -up * 0.62, fC, belly * 0.95),
      P2(W, uS, -4, fS, belly * 0.9),
      P2(Pv, uP, -2, fP, hw * 0.9),
      P2(Pv, uP, -this.pr.hipDrop - 8, fP, 2),
      P2(Pv, uP, -4, fP, -hw * 0.9),
      P2(W, fS, -ww * 0.86, uS, 0),
      P2(N, uC, -up * 0.5, fC, -cw * 0.9),
      P2(N, uC, -up * 0.08, fC, -cw * 0.78),
      P2(N, fC, -this.pr.rNeck * 1.1, uC, 3),
    ];
  }

  drawPelvis(ctx, pass, J, A) {
    // Hips / seat in trouser colour, under the front leg.
    const F = this.torsoFrame(J, A);
    const pants = this.look.pants || { color: '#333' };
    const pts = [
      P2(F.Pv, F.uP, 8, F.fP, F.hw * 0.8),
      P2(F.Pv, F.uP, -this.pr.hipDrop - 10, F.fP, F.hw * 0.3),
      P2(F.Pv, F.uP, -this.pr.hipDrop - 4, F.fP, -F.hw * 0.8),
      P2(F.Pv, F.uP, 8, F.fP, -F.hw * 0.92),
    ];
    ctx.beginPath();
    smoothClosed(ctx, pts, 0.6);
    if (pass === 'outline') return this.outlineFill(ctx);
    ctx.fillStyle = this.mat(pants.color, this.tint).base;
    ctx.fill();
    this.shadeAcross(ctx, P(F.Pv, F.fP, F.hw), P(F.Pv, F.fP, -F.hw));
  }

  drawTorso(ctx, pass, J, A) {
    const lk = this.look, t = this.tint;
    const top = lk.top || { type: 'bare' };
    const F = this.torsoFrame(J, A);
    const pts = this.torsoPoints(F);
    // Neck (part of the torso group so the outline wraps both).
    ctx.beginPath();
    limbPath(ctx, F.N, J.headBase, this.pr.rNeck * 1.15, this.pr.rNeck, 1, 1);
    if (pass === 'outline') this.outlineFill(ctx);
    else {
      ctx.fillStyle = this.skin.base;
      ctx.fill();
      this.shadeSeg(ctx, F.N, J.headBase, this.pr.rNeck * 1.2);
      // the head shades the neck under the jaw
      ctx.save();
      ctx.clip();
      const R = this.pr.headR;
      this.softShadow(ctx, { x: J.head.x - this.L.x * R * 0.35, y: J.head.y - R * 0.85 }, R * 1.05, 0.5);
      ctx.restore();
    }
    if (top.type === 'longcoat' && top.collar) this.drawCollarBack(ctx, pass, F, J);
    ctx.beginPath();
    smoothClosed(ctx, pts, 0.55);
    if (pass === 'outline') return this.outlineFill(ctx);

    const skinTop = ['bare', 'sportstop', 'punkvest', 'opencoat'].includes(top.type);
    const baseC = skinTop ? this.skin.base : this.mat(top.type === 'jacket' ? top.inner : top.type === 'longcoat' ? top.inner : top.color, t).base;
    ctx.fillStyle = baseC;
    ctx.fill();
    ctx.save();
    ctx.clip();
    this.drawTopDetails(ctx, F, J, top);
    if (!skinTop) this.drawDrape(ctx, F, J, A, baseC);
    if (this.clawMarks) this.drawClawMarks(ctx, F);
    if (this.marks.soles) this.drawBootPrints(ctx, F, this.marks.soles, baseC);
    if (this.marks.char) {
      // the shirt's hem burnt to a ragged edge just above the belt
      const { W, uS, fS, ww } = F;
      this.charBand(ctx, P2(W, uS, -3, fS, ww * 1.4), P2(W, uS, -3, fS, -ww * 1.4), uS, 16, 1);
    }
    this.drawBelt(ctx, F);
    // cast shadows: the head on the upper chest, the near arm across the body
    const R = this.pr.headR;
    this.softShadow(ctx, { x: J.headBase.x - this.L.x * R * 0.6, y: J.headBase.y - R * 0.7 }, R * 1.25, 0.32);
    const [ru0, ru1] = this.pr.rUpperArm, [rf0, rf1] = this.pr.rForeArm;
    this.castLimb(ctx, [J.shoulderF, J.elbowF, J.wristF, J.handF], [ru0 + 2, ru1 + 1, rf1 + 1, this.pr.rHand], 8, 0.24);
    // global torso shading: lit front/top, shadow on the back with rim light
    ctx.beginPath();
    smoothClosed(ctx, pts, 0.55);
    this.shadeAcross(ctx, P2(F.W, F.fS, F.cw * 1.1, F.uS, 10), P2(F.W, F.fS, -F.cw * 1.05, F.uS, -6));
    ctx.restore();
    if (lk.chain) this.drawChainLock(ctx, F, lk.chain);
    if (this.marks.collar) this.drawCrookedCollar(ctx, F, top);
  }

  /** Heavy chain around the neck with a padlock hanging on the chest (Snapper). */
  drawChainLock(ctx, F, ch) {
    const { N, uC, fC, up, cw } = F;
    const t = this.tint;
    const lock = P2(N, fC, cw * 0.5, uC, -up * 0.55);
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const k = i / 10;
      const a = P2(N, fC, -cw * 0.3 + k * cw * 0.8, uC, -2 - Math.sin(k * Math.PI) * up * 0.55);
      pts.push(a);
    }
    const c = this.mat(ch.color, t).base;
    for (let i = 0; i < pts.length; i++) {
      ctx.beginPath();
      ctx.ellipse(pts[i].x, pts[i].y, 3.2, 2.2, i % 2 ? 0.6 : -0.6, 0, Math.PI * 2);
      ctx.lineWidth = 3.4;
      ctx.strokeStyle = this.outline;
      ctx.stroke();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = c;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(lock.x, lock.y + 5, 4.5, Math.PI * 0.1, Math.PI * 0.9, true);
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = c;
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(lock.x - 7, lock.y - 9, 14, 12);
    ctx.fillStyle = this.mat(ch.lock, t).base;
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = this.outline;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(lock.x, lock.y - 2, 1.8, 0, Math.PI * 2);
    ctx.fillStyle = this.outline;
    ctx.fill();
  }

  /**
   * Burnt edge (Cinder's super): a ragged charred band along the edge a->b, eaten `depth` into the
   * cloth in direction `inn`, with glowing ember rims and a couple of burn holes.
   */
  charBand(ctx, a, b, inn, depth, seed) {
    const n = 12;
    const h = (i) => Math.abs(Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453) % 1;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const k = i / n, d = depth * (i % 2 ? 0.25 + 0.35 * h(i) : 0.6 + 0.4 * h(i + 17));
      pts.push({ x: a.x + (b.x - a.x) * k + inn.x * d, y: a.y + (b.y - a.y) * k + inn.y * d });
    }
    ctx.beginPath();
    ctx.moveTo(a.x - inn.x * 4, a.y - inn.y * 4);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.lineTo(b.x - inn.x * 4, b.y - inn.y * 4);
    ctx.closePath();
    ctx.fillStyle = 'rgba(24,16,14,0.88)';
    ctx.fill();
    // soot fading into the cloth above the burnt edge
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    for (let i = n; i >= 0; i--) ctx.lineTo(pts[i].x + inn.x * depth * 0.7, pts[i].y + inn.y * depth * 0.7);
    ctx.closePath();
    ctx.fillStyle = 'rgba(30,20,18,0.28)';
    ctx.fill();
    // glowing ember rim
    const glow = 0.45 + 0.25 * Math.sin(this.time * 5 + seed);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = `rgba(255,120,40,${glow})`;
    ctx.stroke();
    // burn holes
    for (const k of [0.3, 0.7]) {
      const c = { x: a.x + (b.x - a.x) * k + inn.x * depth * 1.25, y: a.y + (b.y - a.y) * k + inn.y * depth * 1.25 };
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, 2.6, 1.8, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(20,12,12,0.85)';
      ctx.fill();
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = `rgba(255,140,50,${glow})`;
      ctx.stroke();
    }
  }

  /** Charred end of a sleeve / trouser leg: clipped to the limb a->b (radii r0, r1), edge at t. */
  charCuff(ctx, a, b, r0, r1, t, depth, seed) {
    ctx.save();
    ctx.beginPath();
    limbPath(ctx, a, b, r0, r1);
    ctx.clip();
    const r = r0 + (r1 - r0) * t + 2;
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const inn = { x: (a.x - b.x) / L, y: (a.y - b.y) / L };
    this.charBand(ctx, along(a, b, t, r), along(a, b, t, -r), inn, depth, seed);
    ctx.restore();
  }

  /** Dusty boot-sole prints on the torso (Roxy's super), one per kick that landed (up to three). */
  drawBootPrints(ctx, F, n, cloth) {
    // dusty prints: dark on light cloth, pale dust on dark cloth
    const v = parseInt(cloth.slice(1, 3), 16) * 0.3 + parseInt(cloth.slice(3, 5), 16) * 0.59 + parseInt(cloth.slice(5, 7), 16) * 0.11;
    const ink = v > 110 ? 'rgba(40,28,34,0.45)' : 'rgba(214,200,190,0.42)';
    const groove = v > 110 ? 'rgba(255,255,255,0.13)' : 'rgba(20,12,16,0.3)';
    const { W, uS, fS, up, cw } = F;
    const spots = [
      { c: P2(W, uS, up * 0.55, fS, cw * 0.25), a: 0.5 },
      { c: P2(W, uS, up * 0.25, fS, -cw * 0.15), a: -0.6 },
      { c: P2(W, uS, up * 0.8, fS, -cw * 0.3), a: 1.4 },
    ];
    const len = cw * 0.62, wid = len * 0.38;
    for (let i = 0; i < Math.min(3, n); i++) {
      const s = spots[i], ca = Math.cos(s.a), sa = Math.sin(s.a);
      const u = { x: uS.x * ca - uS.y * sa, y: uS.x * sa + uS.y * ca }; // toe direction
      const v = { x: -u.y, y: u.x };
      const at = (x, y) => ({ x: s.c.x + u.x * y * len + v.x * x * wid, y: s.c.y + u.y * y * len + v.y * x * wid });
      // ball of the foot + toe
      ctx.beginPath();
      smoothClosed(ctx, [at(-0.45, 0.05), at(-0.5, 0.35), at(-0.25, 0.5), at(0.2, 0.5), at(0.5, 0.32), at(0.42, 0.02), at(0.0, -0.06)], 0.45);
      ctx.fillStyle = ink;
      ctx.fill();
      // heel
      ctx.beginPath();
      smoothClosed(ctx, [at(-0.38, -0.22), at(0.36, -0.22), at(0.34, -0.5), at(-0.36, -0.5)], 0.3);
      ctx.fill();
      // tread grooves
      ctx.lineWidth = 1;
      ctx.strokeStyle = groove;
      for (const y of [0.12, 0.24, 0.36, -0.3, -0.42]) {
        ctx.beginPath();
        const p = at(-0.42, y), q = at(0.42, y + 0.03);
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
      }
    }
  }

  /** Vellaro's super grabs the collar: it ends up crooked, one wing flipped up, the other twisted. */
  drawCrookedCollar(ctx, F, top) {
    const { N, uC, fC } = F;
    const rn = this.pr.rNeck;
    // the collar in the outfit's accent colour so it reads against the body
    const c = this.mat(top.color2 || lighten(top.color || '#d8d0c0', 0.25), this.tint);
    const wing = (pts) => {
      ctx.beginPath();
      smoothClosed(ctx, pts, 0.25);
      ctx.fillStyle = c.base;
      ctx.fill();
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = this.outline;
      ctx.stroke();
    };
    // band around the neck, pulled askew
    ctx.beginPath();
    ctx.moveTo(P2(N, fC, -rn * 1.15, uC, 6).x, P2(N, fC, -rn * 1.15, uC, 6).y);
    ctx.quadraticCurveTo(P2(N, fC, 0, uC, 2).x, P2(N, fC, 0, uC, 2).y, P2(N, fC, rn * 1.25, uC, -5).x, P2(N, fC, rn * 1.25, uC, -5).y);
    ctx.lineWidth = 6.5;
    ctx.strokeStyle = this.outline;
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.strokeStyle = c.base;
    ctx.stroke();
    // front wing flipped up against the jaw, back wing twisted down
    wing([P2(N, fC, rn * 0.5, uC, -5), P2(N, fC, rn * 2.6, uC, 9), P2(N, fC, rn * 1.7, uC, -4), P2(N, fC, rn * 1.5, uC, -12)]);
    wing([P2(N, fC, -rn * 0.4, uC, 3), P2(N, fC, -rn * 0.1, uC, -19), P2(N, fC, -rn * 2.0, uC, -13), P2(N, fC, -rn * 1.4, uC, 2)]);
    // crumple lines
    this.line(ctx, [P2(N, fC, rn * 0.9, uC, -1), P2(N, fC, rn * 1.6, uC, 2)], 1, this.outline, 0.45);
    this.line(ctx, [P2(N, fC, -rn * 0.6, uC, -4), P2(N, fC, -rn * 1.1, uC, -9)], 1, this.outline, 0.45);
  }

  /**
   * Claw scratches across the torso (Grizz's super): sets of three parallel red slashes, one set per
   * claw hit (up to three), alternating diagonals like the paws that made them. Torso-relative, so
   * they move with the body; the torso is clipped, so they never spill past it.
   */
  drawClawMarks(ctx, F) {
    const { W, uS, fS, up, cw } = F;
    const sets = [
      { c: P2(W, uS, up * 0.55, fS, cw * 0.15), d: { u: -0.75, f: 0.66 }, len: 1.0 },
      { c: P2(W, uS, up * 0.38, fS, cw * 0.05), d: { u: -0.7, f: -0.72 }, len: 0.9 },
      { c: P2(W, uS, up * 0.2, fS, cw * 0.35), d: { u: -0.82, f: 0.58 }, len: 0.75 },
    ];
    for (let i = 0; i < Math.min(3, this.clawMarks); i++) {
      const s = sets[i];
      const dx = uS.x * s.d.u + fS.x * s.d.f, dy = uS.y * s.d.u + fS.y * s.d.f;
      const nx = -dy, ny = dx; // across the slash: spacing between the three claws
      const half = cw * 0.75 * s.len;
      for (let k = -1; k <= 1; k++) {
        const o = k * cw * 0.2, l = half * (1 - Math.abs(k) * 0.15);
        const sh = k * cw * 0.06; // the middle claw reaches a little further
        const a = { x: s.c.x + nx * o - dx * (l - sh), y: s.c.y + ny * o - dy * (l - sh) };
        const b = { x: s.c.x + nx * o + dx * (l + sh), y: s.c.y + ny * o + dy * (l + sh) };
        this.scratch(ctx, a, b, 3.2);
      }
    }
  }

  /** One tapered slash from a to b: dark red edge, red cut, a pale highlight along it. */
  scratch(ctx, a, b, w) {
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    const lens = (ww) => {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo((a.x + b.x) / 2 + nx * ww, (a.y + b.y) / 2 + ny * ww, b.x, b.y);
      ctx.quadraticCurveTo((a.x + b.x) / 2 - nx * ww, (a.y + b.y) / 2 - ny * ww, a.x, a.y);
    };
    lens(w + 1.4);
    ctx.fillStyle = 'rgba(70,6,18,0.75)';
    ctx.fill();
    lens(w);
    ctx.fillStyle = '#d0203a';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(a.x + dx * 0.2 + nx * w * 0.35, a.y + dy * 0.2 + ny * w * 0.35);
    ctx.lineTo(a.x + dx * 0.7 + nx * w * 0.35, a.y + dy * 0.7 + ny * w * 0.35);
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = 'rgba(255,170,180,0.7)';
    ctx.stroke();
  }

  /** Shirt / jacket drape: folds from the armpit and creases on the inside of the waist bend. */
  drawDrape(ctx, F, J, A, baseC) {
    const { N, W, Pv, uC, fC, uS, fS, up, cw, ww } = F;
    // one soft fold from the armpit toward the waist; it sways a little with breathing
    const dark = rgba(this.outline, 0.13), light = rgba(lighten(baseC, 0.3), 0.18);
    const sway = Math.sin(this.time * 1.7) * 1.2;
    const pts = [P2(N, uC, -up * 0.36, fC, -cw * 0.1), P2(N, uC, -up * 0.6, fC, cw * 0.02 + sway), P2(W, uS, 2, fS, ww * 0.12)];
    this.line(ctx, pts, 1.3, dark);
    this.line(ctx, pts.map((p) => ({ x: p.x + 1.6, y: p.y + 0.4 })), 1, light);
    void A; void J; void Pv;
  }

  drawBelt(ctx, F) {
    const lk = this.look, t = this.tint;
    const pants = lk.pants || { color: '#333' };
    const { Pv, W, uS, fS, fP, uP, ww, hw } = F;
    // trousers from the belt line down
    const bl = { x: (Pv.x * 0.7 + W.x * 0.3), y: (Pv.y * 0.7 + W.y * 0.3) };
    const hasCoat = ['trench', 'longcoat'].includes(lk.top?.type);
    ctx.beginPath();
    ctx.moveTo(bl.x + fS.x * 80, bl.y + fS.y * 80);
    ctx.lineTo(bl.x - fS.x * 80, bl.y - fS.y * 80);
    ctx.lineTo(bl.x - fS.x * 80 - uS.x * 120, bl.y - fS.y * 80 - uS.y * 120);
    ctx.lineTo(bl.x + fS.x * 80 - uS.x * 120, bl.y + fS.y * 80 - uS.y * 120);
    ctx.closePath();
    if (!hasCoat) {
      ctx.fillStyle = this.mat(pants.color, t).base;
      ctx.fill();
    }
    if (lk.belt && !hasCoat) {
      const w = (ww + hw) / 2 + 4;
      ctx.beginPath();
      boxAlong(ctx, P(bl, fS, -w), P(bl, fS, w), 4.2, 4.2, 0.2);
      ctx.fillStyle = this.mat(lk.belt.color, t).base;
      ctx.fill();
      const bk = P(bl, fS, w * 0.82);
      ctx.beginPath();
      boxAlong(ctx, P(bk, fS, -5), P(bk, fS, 3), 5.2, 5.2, 0.3);
      ctx.fillStyle = this.mat(lk.belt.buckle || '#aaa', t).base;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = this.outline;
      ctx.stroke();
    }
    if (['sportstop', 'bare', 'punkvest', 'opencoat'].includes(lk.top?.type)) {
      // abs
      const a0 = P2(W, fS, ww * 0.55, uS, 8);
      for (let i = 0; i < 3; i++) this.line(ctx, [P2(a0, uS, -i * 9, fS, -5), P2(a0, uS, -i * 9 - 2, fS, 2)], 1.2, this.outline, 0.35);
      this.line(ctx, [P2(W, fS, ww * 0.6, uS, 22), P2(W, fS, ww * 0.65, uS, -18)], 1.1, this.outline, 0.3);
    }
  }

  drawTopDetails(ctx, F, J, top) {
    const t = this.tint;
    const { N, W, Pv, uC, fC, uS, fS, up, cw, ww } = F;
    const outl = this.outline;
    const chest = P2(N, uC, -up * 0.42, fC, cw * 0.55);
    switch (top.type) {
      case 'onesie': {
        // bear onesie: cream belly panel, magenta collar, snap buttons, a little bear patch
        ctx.beginPath();
        smoothClosed(ctx, [P2(N, fC, cw * 0.15, uC, -up * 0.35), P2(N, fC, cw * 0.95, uC, -up * 0.42), P2(W, fS, ww * 0.9, uS, -4),
          P2(Pv, fS, ww * 0.7, uS, 4), P2(Pv, fS, -ww * 0.3, uS, 6), P2(W, fS, -ww * 0.2, uS, 10)], 0.4);
        ctx.fillStyle = this.mat(top.belly, t).base;
        ctx.fill();
        ctx.beginPath();
        smoothClosed(ctx, [P2(N, fC, cw * 0.05, uC, 6), P2(N, fC, cw * 0.75, uC, 2), P2(N, fC, cw * 0.55, uC, -up * 0.3), P2(N, fC, cw * 0.2, uC, -4)], 0.35);
        ctx.fillStyle = this.mat(top.color2, t).base;
        ctx.fill();
        for (let i = 0; i < 3; i++) {
          const b = P2(N, fC, cw * 0.62, uC, -up * (0.12 + i * 0.09));
          ctx.beginPath();
          ctx.arc(b.x, b.y, 1.8, 0, Math.PI * 2);
          ctx.fillStyle = '#e8e2d4';
          ctx.fill();
        }
        const pt = P2(N, fC, cw * 0.55, uC, -up * 0.55);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = this.mat(top.patch, t).base;
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = outl;
        ctx.stroke();
        break;
      }
      case 'tee': {
        // crew neckline
        ctx.beginPath();
        ctx.ellipse(N.x + fC.x * 6, N.y + fC.y * 6, this.pr.rNeck * 1.5, this.pr.rNeck * 1.1, Math.atan2(fC.y, fC.x), 0, Math.PI * 2);
        ctx.fillStyle = this.skin.base;
        ctx.fill();
        this.line(ctx, [P2(N, fC, 16, uC, -2), P2(N, fC, 6, uC, -9), P2(N, fC, -4, uC, -6)], 1.6, outl, 0.8);
        // emblem
        ctx.beginPath();
        ctx.arc(chest.x, chest.y, cw * 0.42, 0, Math.PI * 2);
        ctx.fillStyle = this.mat(top.emblem, t).base;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(chest.x, chest.y, cw * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = this.mat(top.color, t).base;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(chest.x - cw * 0.2, chest.y - cw * 0.2); ctx.lineTo(chest.x + cw * 0.2, chest.y + cw * 0.2);
        ctx.moveTo(chest.x - cw * 0.2, chest.y + cw * 0.2); ctx.lineTo(chest.x + cw * 0.2, chest.y - cw * 0.2);
        ctx.lineWidth = 3;
        ctx.strokeStyle = this.mat(top.emblem, t).base;
        ctx.stroke();
        // harness strap with a metal ring
        if (top.straps) {
          const s0 = P2(N, fC, cw * 0.7, uC, -4), s1 = P2(W, fS, ww * 0.2, uS, 6);
          this.line(ctx, [s0, P2(N, uC, -up * 0.45, fC, cw * 0.1), s1], 5, this.mat(top.straps, t).base);
          const ring = P2(N, uC, -up * 0.45, fC, cw * 0.1);
          ctx.beginPath();
          ctx.arc(ring.x, ring.y, 5, 0, Math.PI * 2);
          ctx.lineWidth = 2.4;
          ctx.strokeStyle = '#9a9aa2';
          ctx.stroke();
        }
        // fabric fold
        this.line(ctx, [P2(W, fS, ww * 0.2, uS, 14), P2(W, fS, -ww * 0.3, uS, 4)], 1.2, outl, 0.35);
        break;
      }
      case 'henley': {
        this.line(ctx, [P2(N, fC, cw * 0.62, uC, -3), P2(N, fC, cw * 0.66, uC, -up * 0.45)], 1.6, outl, 0.6);
        if (top.open) {
          // buttons popped: the placket hangs open
          ctx.beginPath();
          ctx.moveTo(P2(N, fC, cw * 0.4, uC, -2).x, P2(N, fC, cw * 0.4, uC, -2).y);
          const a = P2(N, fC, cw * 0.95, uC, -2), b = P2(N, fC, cw * 0.68, uC, -up * 0.42);
          ctx.lineTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.closePath();
          ctx.fillStyle = this.skin.base;
          ctx.fill();
          this.line(ctx, [P2(N, fC, cw * 0.4, uC, -2), b, a], 1.4, outl, 0.7);
        }
        for (let i = 0; i < (top.open ? 0 : 3); i++) {
          const b = P2(N, fC, cw * 0.7, uC, -6 - i * 7);
          ctx.beginPath();
          ctx.arc(b.x, b.y, 1.9, 0, Math.PI * 2);
          ctx.fillStyle = this.mat(top.buttons, t).base;
          ctx.fill();
        }
        this.line(ctx, [P2(N, fC, 14, uC, -1), P2(N, fC, 6, uC, -7), P2(N, fC, -4, uC, -4)], 1.4, outl, 0.6);
        this.line(ctx, [P2(W, fS, ww * 0.4, uS, 18), P2(W, fS, -ww * 0.1, uS, 6)], 1.1, outl, 0.3);
        this.line(ctx, [P2(N, fC, -cw * 0.2, uC, -up * 0.3), P2(W, fS, -ww * 0.4, uS, 10)], 1.1, outl, 0.25);
        break;
      }
      case 'jacket': {
        // jacket panels: everything behind the open front
        ctx.beginPath();
        smoothClosed(ctx, [
          P2(N, fC, cw * 0.35, uC, 4), P2(N, fC, cw * 0.42, uC, -up * 0.5), P2(W, fS, ww * 0.45, uS, -2),
          P2(Pv, fS, ww * 0.5, uS, -6), P2(Pv, fS, -ww * 1.6, uS, -8), P2(N, fC, -cw * 1.6, uC, 4),
        ], 0.3);
        ctx.fillStyle = this.mat(top.color, t).base;
        ctx.fill();
        // magenta collar lining
        ctx.beginPath();
        smoothClosed(ctx, [P2(N, fC, cw * 0.15, uC, 8), P2(N, fC, cw * 0.62, uC, -2), P2(N, fC, cw * 0.48, uC, -up * 0.28), P2(N, fC, cw * 0.3, uC, -4)], 0.3);
        ctx.fillStyle = this.mat(top.color2, t).base;
        ctx.fill();
        this.line(ctx, [P2(N, fC, cw * 0.36, uC, 2), P2(N, fC, cw * 0.43, uC, -up * 0.5), P2(W, fS, ww * 0.45, uS, -2)], 1.5, outl, 0.8);
        // patches
        (top.patches || []).forEach((c, i) => {
          const p = P2(N, uC, -up * (0.38 + i * 0.22), fC, -cw * (0.1 + 0.18 * (i % 2)));
          ctx.beginPath();
          ctx.arc(p.x, p.y, 5.5 - i * 0.6, 0, Math.PI * 2);
          ctx.fillStyle = this.mat(c, t).base;
          ctx.fill();
          ctx.lineWidth = 1.2;
          ctx.strokeStyle = outl;
          ctx.stroke();
        });
        // pendant on a thin cord over the shirt
        if (top.pendant) {
          const cord = [P2(N, fC, 2, uC, -2), P2(N, fC, cw * 0.32, uC, -up * 0.36), P2(N, fC, cw * 0.62, uC, -3)];
          this.line(ctx, cord, 1.4, outl, 0.8);
          const pd = cord[1];
          ctx.beginPath();
          ctx.arc(pd.x, pd.y - 4, 5, 0, Math.PI * 2);
          ctx.fillStyle = this.mat(top.pendant, t).base;
          ctx.fill();
          ctx.lineWidth = 1.3;
          ctx.strokeStyle = outl;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(pd.x, pd.y - 4, 2.2, 0, Math.PI * 2);
          ctx.fillStyle = this.mat(top.color2, t).base;
          ctx.fill();
        }
        if (this.look.tie) this.drawTie(ctx, F, this.look.tie);
        if (this.look.guitar) {
          // guitar strap across the chest
          this.line(ctx, [P2(N, fC, -cw * 0.6, uC, -2), P2(N, fC, cw * 0.1, uC, -up * 0.5), P2(W, fS, ww * 0.85, uS, 4)], 5, outl);
          this.line(ctx, [P2(N, fC, -cw * 0.6, uC, -2), P2(N, fC, cw * 0.1, uC, -up * 0.5), P2(W, fS, ww * 0.85, uS, 4)], 3, this.mat(top.color2, t).base);
        }
        if (top.patches?.length === 3 && this.look.guitar) {
          // charro embroidery: gold scrolls along the jacket front
          for (let i = 0; i < 3; i++) {
            const a = P2(N, uC, -up * (0.25 + i * 0.22), fC, cw * 0.2), b = P2(N, uC, -up * (0.33 + i * 0.22), fC, -cw * 0.35);
            this.line(ctx, [a, P2(a, uC, 5, fC, -cw * 0.2), b], 1.6, this.mat(top.color2, t).base, 0.9);
          }
        }
        // studs
        const st = P2(N, fC, cw * 0.4, uC, -up * 0.16);
        ctx.beginPath();
        ctx.arc(st.x, st.y, 2.4, 0, Math.PI * 2);
        ctx.fillStyle = '#cfcfd6';
        ctx.fill();
        break;
      }
      case 'tunic': {
        // mandarin-collar tunic: stand-up collar band, a front seam with knot buttons, a cross-over flap
        this.line(ctx, [P2(N, fC, -cw * 0.55, uC, 2), P2(N, fC, cw * 0.15, uC, 6), P2(N, fC, cw * 0.75, uC, 1)], 7, outl);
        this.line(ctx, [P2(N, fC, -cw * 0.55, uC, 2), P2(N, fC, cw * 0.15, uC, 6), P2(N, fC, cw * 0.75, uC, 1)], 4.5, this.mat(top.color2, t).base);
        this.line(ctx, [P2(N, fC, cw * 0.55, uC, -2), P2(N, fC, cw * 0.8, uC, -up * 0.35), P2(W, fS, ww * 0.75, uS, 0)], 1.6, outl, 0.8);
        for (let i = 0; i < 4; i++) {
          const b = P2(N, uC, -up * (0.15 + i * 0.2), fC, cw * (0.66 + i * 0.04));
          this.line(ctx, [P2(b, fC, -4, uC, 0), P2(b, fC, 4, uC, 0)], 2.4, this.mat(top.trim, t).base);
        }
        break;
      }
      case 'trench': {
        // waistcoat strip + buttons, tie, wide lapels
        ctx.beginPath();
        smoothClosed(ctx, [P2(N, fC, cw * 0.5, uC, 2), P2(N, fC, cw * 1.0, uC, -up * 0.5), P2(W, fS, ww * 1.0, uS, -4), P2(W, fS, ww * 0.2, uS, -8), P2(N, fC, cw * 0.1, uC, -up * 0.3)], 0.3);
        ctx.fillStyle = this.mat(top.vest, t).base;
        ctx.fill();
        for (let i = 0; i < 3; i++) {
          const b = P2(N, uC, -up * (0.45 + i * 0.18), fC, cw * 0.78);
          ctx.beginPath();
          ctx.arc(b.x, b.y, 2.1, 0, Math.PI * 2);
          ctx.fillStyle = this.mat(top.buttons, t).base;
          ctx.fill();
        }
        this.drawTie(ctx, F, this.look.tie);
        // coat back panel
        ctx.beginPath();
        smoothClosed(ctx, [P2(N, fC, cw * 0.1, uC, 8), P2(N, fC, cw * 0.2, uC, -up * 0.6), P2(Pv, fS, ww * 0.2, uS, -10), P2(Pv, fS, -ww * 1.8, uS, -10), P2(N, fC, -cw * 1.6, uC, 6)], 0.3);
        ctx.fillStyle = this.mat(top.color, t).base;
        ctx.fill();
        // lapel
        ctx.beginPath();
        smoothClosed(ctx, [P2(N, fC, cw * 0.1, uC, 9), P2(N, fC, cw * 0.95, uC, -up * 0.12), P2(N, fC, cw * 0.55, uC, -up * 0.62), P2(N, fC, cw * 0.18, uC, -up * 0.3)], 0.2);
        ctx.fillStyle = this.mat(top.color2, t).base;
        ctx.fill();
        this.line(ctx, [P2(N, fC, cw * 0.2, uC, 6), P2(N, fC, cw * 0.25, uC, -up * 0.6), P2(Pv, fS, ww * 0.25, uS, -8)], 1.6, outl, 0.8);
        if (top.plaid) {
          for (let i = 0; i < 4; i++) {
            this.line(ctx, [P2(N, uC, -up * (0.2 + i * 0.25), fC, -cw * 1.5), P2(N, uC, -up * (0.2 + i * 0.25), fC, cw * 0.15)], 1.3, this.mat(top.plaid, t).base, 0.6);
            this.line(ctx, [P2(N, fC, -cw * (0.2 + i * 0.35), uC, 4), P2(Pv, fS, -ww * (0.2 + i * 0.4), uS, -8)], 1.3, this.mat(top.plaid, t).base, 0.6);
          }
        }
        break;
      }
      case 'longcoat': {
        this.drawTie(ctx, F, this.look.tie);
        ctx.beginPath();
        smoothClosed(ctx, [P2(N, fC, cw * 0.25, uC, 8), P2(N, fC, cw * 0.4, uC, -up * 0.55), P2(Pv, fS, ww * 0.55, uS, -10), P2(Pv, fS, -ww * 1.8, uS, -10), P2(N, fC, -cw * 1.6, uC, 6)], 0.3);
        ctx.fillStyle = this.mat(top.color, t).base;
        ctx.fill();
        // front lapel (magenta)
        ctx.beginPath();
        smoothClosed(ctx, [P2(N, fC, cw * 0.25, uC, 10), P2(N, fC, cw * 1.05, uC, -up * 0.05), P2(N, fC, cw * 0.48, uC, -up * 0.58), P2(N, fC, cw * 0.32, uC, -up * 0.25)], 0.2);
        ctx.fillStyle = this.mat(top.color2, t).base;
        ctx.fill();
        this.line(ctx, [P2(N, fC, cw * 0.4, uC, -up * 0.55), P2(Pv, fS, ww * 0.55, uS, -10)], 1.6, outl, 0.8);
        const b = P2(N, uC, -up * 0.8, fC, cw * 0.5);
        ctx.beginPath();
        ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#e2b440';
        ctx.fill();
        break;
      }
      case 'sportstop': {
        ctx.beginPath();
        smoothClosed(ctx, [P2(N, fC, cw * 0.5, uC, -4), P2(N, fC, cw * 1.1, uC, -up * 0.42), P2(N, fC, cw * 0.9, uC, -up * 0.66), P2(N, fC, -cw * 1.2, uC, -up * 0.66), P2(N, fC, -cw * 1.1, uC, -2)], 0.3);
        ctx.fillStyle = this.mat(top.color, t).base;
        ctx.fill();
        this.line(ctx, [P2(N, fC, cw * 0.95, uC, -up * 0.62), P2(N, fC, -cw * 1.1, uC, -up * 0.62)], 2.4, this.mat(top.color2, t).base);
        break;
      }
      case 'armor': {
        ctx.beginPath();
        smoothClosed(ctx, [P2(N, fC, cw * 0.3, uC, -2), P2(N, fC, cw * 1.08, uC, -up * 0.3), P2(W, fS, ww * 1.0, uS, 4), P2(W, fS, -ww * 0.2, uS, -2), P2(N, fC, -cw * 0.5, uC, -up * 0.3)], 0.35);
        const g = ctx.createLinearGradient(chest.x + 20, chest.y + 20, chest.x - 30, chest.y - 30);
        g.addColorStop(0, this.mat(lighten(top.color, 0.35), t).base);
        g.addColorStop(0.5, this.mat(top.color, t).base);
        g.addColorStop(1, this.mat(top.color2, t).base);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = this.mat(top.trim, t).base;
        ctx.stroke();
        for (let i = 0; i < 4; i++) {
          const r = P2(N, uC, -up * (0.15 + i * 0.22), fC, cw * 0.95 - i * 2);
          ctx.beginPath();
          ctx.arc(r.x, r.y, 1.8, 0, Math.PI * 2);
          ctx.fillStyle = '#d6cfc0';
          ctx.fill();
        }
        this.line(ctx, [P2(N, uC, -up * 0.55, fC, cw * 0.9), P2(N, uC, -up * 0.6, fC, -cw * 0.3)], 1.6, outl, 0.6);
        break;
      }
      case 'bodysuit': {
        this.line(ctx, [P2(N, fC, cw * 0.6, uC, -4), P2(N, fC, cw * 0.8, uC, -up * 0.5), P2(W, fS, ww * 0.7, uS, -6)], 2, this.mat(top.trim, t).base, 0.9);
        ctx.beginPath();
        smoothClosed(ctx, [P2(N, fC, -cw * 0.2, uC, -2), P2(N, fC, cw * 0.4, uC, -up * 0.3), P2(N, fC, -cw * 0.1, uC, -up * 0.6), P2(N, fC, -cw * 0.9, uC, -up * 0.3)], 0.4);
        ctx.fillStyle = this.mat(top.color2, t).base;
        ctx.fill();
        break;
      }
      case 'punkvest': {
        // plaid crop top
        ctx.beginPath();
        smoothClosed(ctx, [P2(N, fC, cw * 0.4, uC, -3), P2(N, fC, cw * 1.12, uC, -up * 0.42), P2(N, fC, cw * 0.95, uC, -up * 0.72), P2(N, fC, -cw * 1.2, uC, -up * 0.72), P2(N, fC, -cw * 1.1, uC, -2)], 0.3);
        ctx.fillStyle = this.mat(top.color2, t).base;
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = rgba(this.mat(top.plaid, t).base, 0.8);
        for (let i = -4; i <= 4; i++) {
          ctx.beginPath();
          ctx.moveTo(N.x + fC.x * i * 8 - uC.x * 80, N.y + fC.y * i * 8 - uC.y * 80);
          ctx.lineTo(N.x + fC.x * (i * 8 + 50) + uC.x * 10, N.y + fC.y * (i * 8 + 50) + uC.y * 10);
          ctx.moveTo(N.x + fC.x * i * 8 - uC.x * 80, N.y + fC.y * i * 8 - uC.y * 80);
          ctx.lineTo(N.x + fC.x * (i * 8 - 50) + uC.x * 10, N.y + fC.y * (i * 8 - 50) + uC.y * 10);
        }
        ctx.stroke();
        ctx.restore();
        // leather vest panels
        ctx.beginPath();
        smoothClosed(ctx, [P2(N, fC, cw * 0.15, uC, 6), P2(N, fC, cw * 0.55, uC, -up * 0.75), P2(N, fC, -cw * 1.3, uC, -up * 0.75), P2(N, fC, -cw * 1.3, uC, 6)], 0.3);
        ctx.fillStyle = this.mat(top.color, t).base;
        ctx.fill();
        // choker + ring
        this.line(ctx, [P2(N, fC, -6, uC, 6), P2(N, fC, 9, uC, 4)], 3.5, this.mat(top.color, t).base);
        break;
      }
      case 'opencoat': {
        // open vest over bare chest + medallion
        ctx.beginPath();
        smoothClosed(ctx, [P2(N, fC, cw * 0.3, uC, 6), P2(N, fC, cw * 0.35, uC, -up * 0.6), P2(Pv, fS, ww * 0.35, uS, -10), P2(Pv, fS, -ww * 1.8, uS, -10), P2(N, fC, -cw * 1.6, uC, 6)], 0.3);
        ctx.fillStyle = this.mat(top.color, t).base;
        ctx.fill();
        this.line(ctx, [P2(N, fC, cw * 0.33, uC, 4), P2(N, fC, cw * 0.38, uC, -up * 0.6), P2(Pv, fS, ww * 0.37, uS, -10)], 3, this.mat(top.color2, t).base);
        if (top.pattern) {
          // stepped diamonds woven into the coat
          for (const [a, b] of [[-0.5, 0.3], [-1.0, 0.45], [-0.6, 0.62], [-1.2, 0.75]]) {
            const c = P2(N, fC, cw * a, uC, -up * b);
            ctx.beginPath();
            ctx.moveTo(c.x, c.y + 6); ctx.lineTo(c.x + 5, c.y); ctx.lineTo(c.x, c.y - 6); ctx.lineTo(c.x - 5, c.y);
            ctx.fillStyle = this.mat(top.pattern, t).base;
            ctx.fill();
          }
        }
        if (top.fringe) {
          // leather fringe hanging off the front edge and the hem
          const fr = this.mat(darken(top.color, 0.12), t).base;
          for (let i = 0; i <= 6; i++) {
            const p = P2(N, fC, cw * (0.36 + i * 0.002), uC, -up * (0.2 + i * 0.07));
            this.line(ctx, [p, { x: p.x + fC.x * 7 - uC.x * 5, y: p.y + fC.y * 7 - uC.y * 5 }], 2, fr);
          }
          for (let i = 0; i <= 7; i++) {
            const p = P2(Pv, fS, ww * (0.3 - i * 0.28), uS, -10);
            this.line(ctx, [p, { x: p.x - uS.x * 9, y: p.y - uS.y * 9 }], 2, fr);
          }
        }
        if (top.beads) {
          // bead necklace above the medallion
          for (let i = 0; i < 7; i++) {
            const b = P2(N, fC, cw * (0.05 + i * 0.14), uC, -4 - Math.sin((i / 6) * Math.PI) * up * 0.22);
            ctx.beginPath();
            ctx.arc(b.x, b.y, 2.6, 0, Math.PI * 2);
            ctx.fillStyle = this.mat(i % 2 ? top.beads : top.medallion, t).base;
            ctx.fill();
          }
        }
        const chain = [P2(N, fC, -2, uC, -2), P2(N, fC, cw * 0.55, uC, -up * 0.42), P2(N, fC, cw * 0.95, uC, -2)];
        this.line(ctx, chain, 2, this.mat(top.medallion, t).base);
        const md = chain[1];
        ctx.beginPath();
        ctx.ellipse(md.x, md.y - 5, 6, 7.5, 0, 0, Math.PI * 2);
        ctx.fillStyle = this.mat(top.medallion, t).base;
        ctx.fill();
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = this.outline;
        ctx.stroke();
        this.line(ctx, [P2(N, fC, cw * 0.9, uC, -up * 0.55), P2(N, fC, cw * 0.2, uC, -up * 0.6)], 1.3, outl, 0.4);
        break;
      }
      case 'gi': {
        // kung-fu jacket: crossed collar, frog closures, a yin-yang emblem; falls open when battered
        if (top.open) {
          ctx.beginPath();
          smoothClosed(ctx, [P2(N, fC, cw * 0.2, uC, -2), P2(N, fC, cw * 0.95, uC, -2), P2(W, fS, ww * 0.85, uS, 6), P2(W, fS, ww * 0.35, uS, 4)], 0.3);
          ctx.fillStyle = this.skin.base;
          ctx.fill();
          this.line(ctx, [P2(N, fC, cw * 0.55, uC, -up * 0.3), P2(N, fC, cw * 0.65, uC, -up * 0.6)], 1.2, outl, 0.35); // abs line
        }
        this.line(ctx, [P2(N, fC, cw * 0.1, uC, 3), P2(N, fC, cw * 0.72, uC, -up * 0.35), P2(W, fS, ww * 0.7, uS, top.open ? 8 : 2)], 3.2, this.mat(top.color2, t).base);
        this.line(ctx, [P2(N, fC, cw * 0.1, uC, 3), P2(N, fC, cw * 0.72, uC, -up * 0.35), P2(W, fS, ww * 0.7, uS, top.open ? 8 : 2)], 1.2, outl, 0.7);
        if (!top.open) {
          for (let i = 0; i < 3; i++) {
            const c = P2(N, fC, cw * 0.95, uC, -up * (0.62 + i * 0.13));
            this.line(ctx, [{ x: c.x - 6, y: c.y }, { x: c.x + 6, y: c.y }], 2.2, this.mat(top.knots, t).base);
            ctx.beginPath();
            ctx.arc(c.x + 6, c.y, 2.2, 0, Math.PI * 2);
            ctx.fillStyle = this.mat(top.knots, t).base;
            ctx.fill();
          }
        }
        // yin-yang on the chest
        const yy = P2(N, fC, cw * 0.55, uC, -up * 0.6), r = 6.5;
        ctx.beginPath(); ctx.arc(yy.x, yy.y, r, 0, Math.PI * 2);
        ctx.fillStyle = this.mat(top.emblem, t).base; ctx.fill();
        ctx.lineWidth = 1.2; ctx.strokeStyle = outl; ctx.stroke();
        ctx.beginPath();
        ctx.arc(yy.x, yy.y, r, Math.PI / 2, -Math.PI / 2);
        ctx.arc(yy.x, yy.y - r / 2, r / 2, Math.PI / 2, -Math.PI / 2, true);
        ctx.arc(yy.x, yy.y + r / 2, r / 2, -Math.PI / 2, Math.PI / 2);
        ctx.fillStyle = this.mat(top.emblem2, t).base; ctx.fill();
        break;
      }
      case 'chefcoat': {
        // double-breasted buttons, magenta collar, neckerchief
        for (let i = 0; i < 4; i++) {
          for (const off of [0.42, 0.78]) {
            const b = P2(N, uC, -up * (0.25 + i * 0.2), fC, cw * off);
            ctx.beginPath();
            ctx.arc(b.x, b.y, 2.1, 0, Math.PI * 2);
            ctx.fillStyle = this.mat(top.buttons, t).base;
            ctx.fill();
          }
        }
        this.line(ctx, [P2(N, fC, cw * 0.98, uC, -6), P2(N, fC, cw * 0.62, uC, -up * 0.3), P2(W, fS, ww * 0.9, uS, -4)], 1.4, outl, 0.6);
        this.line(ctx, [P2(N, fC, -cw * 0.3, uC, 2), P2(N, fC, cw * 0.95, uC, 0)], 6, this.mat(top.color2, t).base);
        ctx.beginPath();
        smoothClosed(ctx, [P2(N, fC, cw * 0.3, uC, -2), P2(N, fC, cw * 0.95, uC, -3), P2(N, fC, cw * 0.62, uC, -up * 0.28)], 0.2);
        ctx.fillStyle = this.mat(top.kerchief, t).base;
        ctx.fill();
        this.line(ctx, [P2(W, fS, -ww * 0.2, uS, 18), P2(W, fS, ww * 0.3, uS, 6)], 1.2, outl, 0.3);
        break;
      }
      default:
        // bare chest: pecs
        this.line(ctx, [P2(N, fC, cw * 0.9, uC, -up * 0.55), P2(N, fC, cw * 0.2, uC, -up * 0.6), P2(N, fC, -cw * 0.1, uC, -up * 0.45)], 1.4, outl, 0.4);
    }
  }

  drawTie(ctx, F, tie) {
    if (!tie) return;
    const { N, uC, fC, up, cw } = F;
    const t = this.tint;
    if (tie.bow) {
      // big floppy bow tie with a plaid check
      const k = P2(N, fC, cw * 0.62, uC, -4);
      const wing = (sx) => [k, P2(k, fC, cw * 0.12, uC, sx * 14), P2(k, fC, -cw * 0.12, uC, sx * 17), P2(k, fC, -cw * 0.02, uC, sx * 4)];
      for (const sx of [1, -1]) {
        ctx.beginPath();
        smoothClosed(ctx, wing(sx), 0.35);
        ctx.fillStyle = this.mat(tie.color, t).base;
        ctx.fill();
        ctx.save();
        ctx.clip();
        for (let i = -3; i <= 3; i++) {
          this.line(ctx, [P2(k, uC, sx * 30, fC, i * 4), P2(k, uC, -sx * 2, fC, i * 4)], 1.2, this.mat(tie.check || darken(tie.color, 0.3), t).base, 0.7);
        }
        ctx.restore();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = this.outline;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(k.x, k.y, 4.2, 0, Math.PI * 2);
      ctx.fillStyle = this.mat(darken(tie.color, 0.15), t).base;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.stroke();
      return;
    }
    const knot = P2(N, fC, cw * 0.62, uC, -3);
    const pts = [knot, P2(N, fC, cw * 0.78, uC, -up * 0.35), P2(N, fC, cw * 0.86, uC, -up * 0.75), P2(N, fC, cw * 0.66, uC, -up * 0.82), P2(N, fC, cw * 0.55, uC, -up * 0.3)];
    ctx.beginPath();
    smoothClosed(ctx, pts, 0.25);
    ctx.fillStyle = this.mat(tie.color, t).base;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = this.outline;
    ctx.stroke();
    if (tie.dots) {
      for (let i = 0; i < 3; i++) {
        const d = P2(N, fC, cw * (0.68 + (i % 2) * 0.1), uC, -up * (0.3 + i * 0.17));
        ctx.beginPath();
        ctx.arc(d.x, d.y, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = this.mat(tie.dots, t).base;
        ctx.fill();
      }
    }
  }

  drawCollarBack(ctx, pass, F, J) {
    const { N, uC, fC } = F;
    const top = this.look.top;
    const r = this.pr.headR;
    const pts = [
      P2(N, fC, -r * 0.2, uC, -6),
      P2(N, fC, -r * 1.25, uC, r * 1.6),
      P2(N, fC, -r * 0.55, uC, r * 0.8),
      P2(N, fC, r * 0.35, uC, r * 1.5),
      P2(N, fC, r * 0.5, uC, -4),
    ];
    ctx.beginPath();
    smoothClosed(ctx, pts, 0.15);
    if (pass === 'outline') return this.outlineFill(ctx);
    ctx.fillStyle = this.mat(top.color2, this.tint).base;
    ctx.fill();
    this.shadeAcross(ctx, P2(N, fC, r, uC, r), P2(N, fC, -r, uC, 0));
  }

  drawCoatSkirt(ctx, pass, J, A, which, chains) {
    const top = this.look.top || {};
    if (!['trench', 'longcoat'].includes(top.type)) return;
    const F = this.torsoFrame(J, A);
    const len = top.type === 'trench' ? 1.0 : 0.72;
    const t = this.tint;
    const thighL = this.pr.thigh * len;
    if (which === 'back') {
      // back panel follows the rear thigh and a cloth chain
      const tail = chains?.coat;
      const end = tail ? tail[tail.length - 1] : P(J.kneeB, dirUp(A.thighB), 0);
      const pts = [
        P2(F.Pv, F.fP, -F.hw * 1.15, F.uP, 10),
        P2(F.Pv, F.fP, F.hw * 0.4, F.uP, 6),
        along(J.hipB, J.kneeB, len * 0.95, -14),
        end,
        tail ? tail[Math.floor(tail.length / 2)] : along(J.hipB, J.kneeB, 0.5, 20),
      ];
      ctx.beginPath();
      smoothClosed(ctx, pts, 0.35);
      if (pass === 'outline') return this.outlineFill(ctx);
      ctx.fillStyle = this.mat(darken(top.color, 0.18), t).base;
      ctx.fill();
      this.shadeAcross(ctx, P(F.Pv, F.fP, F.hw), P(end, F.fP, -10));
      return;
    }
    // front panel hangs over the lead thigh
    const k = along(J.hipF, J.kneeF, Math.min(1, len * 1.02));
    const pts = [
      P2(F.Pv, F.fP, -F.hw * 0.9, F.uP, 12),
      P2(F.W, F.fS, F.ww * 0.9, F.uS, -4),
      P2(J.hipF, F.fP, 14, F.uP, -thighL * 0.4),
      P(k, F.fP, 10),
      P(k, F.fP, -10),
      P2(F.Pv, F.fP, -F.hw * 0.9, F.uP, -thighL * 0.4),
    ];
    ctx.beginPath();
    smoothClosed(ctx, pts, 0.35);
    if (pass === 'outline') return this.outlineFill(ctx);
    ctx.fillStyle = this.mat(top.color, t).base;
    ctx.fill();
    this.shadeAcross(ctx, P2(F.Pv, F.fP, F.hw * 1.3, F.uP, 10), P2(F.Pv, F.fP, -F.hw * 1.2, F.uP, -20));
    this.line(ctx, [P2(F.W, F.fS, F.ww * 0.7, F.uS, -4), P(k, F.fP, 2)], 1.4, this.outline, 0.5);
  }

  // --- secondary chains (hair, tails, scarves) ---------------------------------------------------
  drawChains(ctx, pass, chains, layer, J, A) {
    if (!chains) return;
    const lk = this.look, t = this.tint;
    const specs = [];
    if (chains.ponytail && layer === 'back') specs.push([chains.ponytail, 7, 3, lk.hair.color, lk.hair.streak]);
    if (chains.tail && layer === 'back') specs.push([chains.tail, 7, 2.5, lk.tail, lk.fur2]);
    if (chains.scarf && layer === 'back') specs.push([chains.scarf, 6, 4, lk.scarf]);
    if (chains.dreads && layer === 'back') for (const d of chains.dreads) specs.push([d, 3.4, 2.6, lk.dreads.color, lk.dreads.beads]);
    if (chains.dreadsFront && layer === 'front') for (const d of chains.dreadsFront) specs.push([d, 3.2, 2.4, lk.dreads.color, lk.dreads.beads]);
    for (const [pts, r0, r1, color, accent] of specs) {
      ctx.beginPath();
      // ribbon around the chain, tapering
      const left = [], right = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
        const r = r0 + (r1 - r0) * (i / (pts.length - 1)) + (i === 1 ? 1.5 : 0);
        left.push({ x: pts[i].x - (dy / L) * r, y: pts[i].y + (dx / L) * r });
        right.push({ x: pts[i].x + (dy / L) * r, y: pts[i].y - (dx / L) * r });
      }
      smoothClosed(ctx, left.concat(right.reverse()), 0.4);
      if (pass === 'outline') { this.outlineFill(ctx); continue; }
      ctx.fillStyle = this.mat(color, t).base;
      ctx.fill();
      this.shadeAcross(ctx, { x: pts[0].x, y: pts[0].y + 10 }, { x: pts[0].x, y: pts[0].y - 10 });
      if (accent) this.line(ctx, pts.slice(0, -1), 2, this.mat(accent, t).base, 0.8);
    }
  }

  // --- head ----------------------------------------------------------------------------------------
  drawHead(ctx, pass, J, A, opts) {
    const lk = this.look, t = this.tint;
    const R = this.pr.headR;
    const H = J.head;
    ctx.save();
    ctx.translate(H.x, H.y);
    ctx.rotate(A.head * DEG);
    // light direction in head space
    const ca = Math.cos(-A.head * DEG), sa = Math.sin(-A.head * DEG);
    this.Lh = { x: this.L.x * ca - this.L.y * sa, y: this.L.x * sa + this.L.y * ca };
    const weasel = lk.species === 'weasel';
    const masked = !!lk.mask;
    // Back-of-head items (hat brim back half, collars) are drawn with the head.
    if (lk.hair?.style === 'pompadour' || lk.hair?.style === 'swept' || lk.hair?.style === 'spiky') this.drawHairBack(ctx, pass, R);
    if (lk.hat?.type === 'sombrero') this.drawSombrero(ctx, pass, R, 'back');
    if (lk.hood) {
      ctx.beginPath();
      smoothClosed(ctx, [{ x: 0.75 * R, y: 1.25 * R }, { x: -0.2 * R, y: 1.45 * R }, { x: -1.3 * R, y: 0.6 * R }, { x: -1.4 * R, y: -1.1 * R }, { x: -0.4 * R, y: -1.5 * R }, { x: 0.1 * R, y: -0.4 * R }], 0.4);
      if (pass === 'outline') this.outlineFill(ctx);
      else {
        ctx.fillStyle = this.mat(lk.hood.color, t).base;
        ctx.fill();
        this.shadeAcross(ctx, { x: 0.5 * R, y: R }, { x: -1.3 * R, y: -R });
        this.line(ctx, [{ x: 0.7 * R, y: 1.2 * R }, { x: -0.1 * R, y: 1.32 * R }, { x: -1.1 * R, y: 0.6 * R }], 3, this.mat(lk.hood.lining, t).base);
      }
    }

    // Skull + face as one silhouette: both sub-paths share the same winding so the union fills cleanly.
    const croc = lk.species === 'croc';
    const facePts = croc
      // long flat upper snout, eye bump on top
      ? [{ x: -0.35, y: -0.3 }, { x: 0.5, y: -0.26 }, { x: 1.3, y: -0.22 }, { x: 2.15, y: -0.2 }, { x: 2.38, y: -0.08 }, { x: 2.3, y: 0.1 },
        { x: 1.6, y: 0.2 }, { x: 1.0, y: 0.36 }, { x: 0.85, y: 0.72 }, { x: 0.45, y: 0.86 }, { x: 0.1, y: 0.62 }]
      : weasel
      ? [{ x: 0.0, y: 0.35 }, { x: 0.95, y: 0.18 }, { x: 1.55, y: -0.08 }, { x: 1.66, y: -0.3 }, { x: 1.25, y: -0.55 }, { x: 0.6, y: -0.8 }, { x: -0.1, y: -0.6 }]
      : [{ x: -0.4, y: -0.45 }, { x: 0.15, y: -0.95 }, { x: 0.6, y: -1.0 }, { x: 0.88, y: -0.72 }, { x: 1.0, y: -0.36 }, { x: 1.06, y: -0.12 },
        { x: 1.18, y: 0.04 }, { x: 1.02, y: 0.26 }, { x: 0.96, y: 0.52 }, { x: 0.6, y: 0.85 }, { x: -0.2, y: 0.5 }];
    let area = 0;
    for (let i = 0; i < facePts.length; i++) {
      const p = facePts[i], q = facePts[(i + 1) % facePts.length];
      area += p.x * q.y - q.x * p.y;
    }
    const pts = (area < 0 ? facePts.slice().reverse() : facePts).map((p) => ({ x: p.x * R, y: p.y * R }));
    const head = () => {
      ctx.beginPath();
      if (croc) ctx.ellipse(-0.1 * R, 0.12 * R, 0.92 * R, 0.82 * R, 0, 0, Math.PI * 2);
      else ctx.ellipse(-0.06 * R, 0.08 * R, 0.98 * R, 1.04 * R, 0, 0, Math.PI * 2);
      smoothClosed(ctx, pts, weasel || croc ? 0.5 : 0.45);
    };
    if (croc) this.drawCrocJaw(ctx, pass, R, opts);
    head();
    if (pass === 'outline') {
      this.outlineFill(ctx);
      this.drawEars(ctx, pass, R, weasel);
      ctx.restore();
      return;
    }
    ctx.fillStyle = masked ? this.mat(lk.mask.color, t).base : this.skin.base;
    ctx.fill();
    ctx.save();
    ctx.clip();
    if (weasel) {
      ctx.beginPath();
      smoothClosed(ctx, [{ x: 0.3 * R, y: -0.2 * R }, { x: 1.25 * R, y: -0.28 * R }, { x: 1.35 * R, y: -0.55 * R }, { x: 0.4 * R, y: -0.9 * R }, { x: 0.0, y: -0.5 * R }], 0.5);
      ctx.fillStyle = this.mat(lk.fur2, t).base;
      ctx.fill();
    }
    if (lk.beard) this.drawBeard(ctx, R, lk.beard);
    if (lk.facepaint) {
      // painted band across the eyes
      ctx.beginPath();
      smoothClosed(ctx, [{ x: -0.1 * R, y: 0.02 * R }, { x: 0.6 * R, y: 0.12 * R }, { x: 1.25 * R, y: 0.18 * R }, { x: 1.25 * R, y: -0.12 * R }, { x: 0.6 * R, y: -0.2 * R }, { x: -0.1 * R, y: -0.18 * R }], 0.3);
      ctx.fillStyle = rgba(this.mat(lk.facepaint, t).base, 0.85);
      ctx.fill();
    }
    if (lk.clown) {
      // white greasepaint over the face
      ctx.beginPath();
      ctx.ellipse(0.62 * R, -0.12 * R, 0.78 * R, 0.98 * R, -0.1, 0, Math.PI * 2);
      ctx.fillStyle = this.mat(lk.clown.paint, t).base;
      ctx.fill();
    }
    if (croc) {
      // pale throat and scales
      ctx.beginPath();
      ctx.ellipse(-0.2 * R, -0.55 * R, 0.6 * R, 0.4 * R, 0, 0, Math.PI * 2);
      ctx.fillStyle = this.mat(lk.fur2, t).base;
      ctx.fill();
      for (const [x, y] of [[0.4, 0.45], [0.05, 0.35], [-0.3, 0.55], [-0.55, 0.25], [1.2, 0.1], [1.6, 0.02], [-0.2, -0.05]]) {
        ctx.beginPath();
        ctx.ellipse(x * R, y * R, 0.1 * R, 0.07 * R, 0.2, 0, Math.PI * 2);
        ctx.fillStyle = rgba(darken(lk.skin, 0.25), 0.55);
        ctx.fill();
      }
    }
    this.headShade(ctx, R);
    ctx.restore();
    this.drawEars(ctx, 'fill', R, weasel || croc);
    if (masked) this.drawMask(ctx, R);
    else this.drawFace(ctx, R, opts, weasel);
    if (masked && this.marks.shiner) this.drawShiner(ctx, R, 0.6 * R, 0.17 * R, 0.27 * R);
    if (croc) this.drawCrocUpperTeeth(ctx, R);
    this.drawHair(ctx, R);
    if (this.marks.pie > 0) this.drawPieFace(ctx, R, Math.min(1, this.marks.pie / 30));
    if (this.marks.bump) {
      // Bruno's pan: a cartoon bump on the crown; hats and hoods sit on top of it
      this.drawBump(ctx, R);
      ctx.translate(0, 0.34 * R);
    }
    if (lk.hat?.type === 'sombrero') this.drawSombrero(ctx, 'fill', R, 'front');
    else if (lk.hat) this.drawHat(ctx, R);
    if (lk.hood?.bear) this.drawBearHood(ctx, R);
    ctx.restore();
    if (lk.headphones) this.drawHeadphones(ctx, J, A);
  }

  // --- new heads: crocodile, clown, pie --------------------------------------------------------
  /** How far the crocodile's jaw hangs open for the current expression (radians). */
  jawOpen(opts) {
    const xp = opts.expression;
    if (this.biting) return 0.55 + 0.25 * Math.abs(Math.sin(this.time * 18));
    return { shout: 0.5, attack: 0.32, hurt: 0.3, ko: 0.55, dizzy: 0.22, happy: 0.12, strain: 0.06 }[xp] ?? 0.04;
  }

  /** Lower jaw (with its teeth) hinged under the skull, and the dark mouth between the jaws. */
  drawCrocJaw(ctx, pass, R, opts) {
    const lk = this.look, t = this.tint;
    const th = -this.jawOpen(opts);
    const hx = 0.0, hy = -0.3 * R;
    const rot = (x, y) => {
      const dx = x * R - hx, dy = y * R - hy;
      return { x: hx + dx * Math.cos(th) - dy * Math.sin(th), y: hy + dx * Math.sin(th) + dy * Math.cos(th) };
    };
    const jaw = [rot(-0.35, -0.3), rot(0.5, -0.32), rot(1.4, -0.3), rot(2.12, -0.27), rot(2.18, -0.42), rot(1.5, -0.55), rot(0.6, -0.66), rot(-0.15, -0.8)];
    ctx.beginPath();
    smoothClosed(ctx, jaw, 0.4);
    if (pass === 'outline') return this.outlineFill(ctx);
    // mouth inside (only shows when the jaw drops)
    ctx.save();
    ctx.beginPath();
    smoothClosed(ctx, [{ x: -0.2 * R, y: -0.2 * R }, { x: 2.2 * R, y: -0.2 * R }, rot(2.15, -0.3), rot(-0.2, -0.3)], 0.2);
    ctx.fillStyle = '#5a1020';
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    smoothClosed(ctx, jaw, 0.4);
    ctx.fillStyle = this.skin.base;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.beginPath();
    smoothClosed(ctx, [rot(-0.2, -0.5), rot(1.6, -0.45), rot(1.6, -0.75), rot(-0.2, -0.95)], 0.3);
    ctx.fillStyle = this.mat(lk.fur2, t).base;
    ctx.fill();
    ctx.restore();
    // lower teeth pointing up
    ctx.fillStyle = '#f4efe2';
    ctx.strokeStyle = this.outline;
    ctx.lineWidth = 1;
    for (let x = 0.45; x <= 2.0; x += 0.22) {
      const a = rot(x - 0.06, -0.3), b = rot(x, -0.12), c = rot(x + 0.06, -0.3);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  drawCrocUpperTeeth(ctx, R) {
    ctx.fillStyle = '#f4efe2';
    ctx.strokeStyle = this.outline;
    ctx.lineWidth = 1;
    for (let x = 0.55; x <= 2.15; x += 0.22) {
      const big = Math.abs(x - 1.43) < 0.05 || Math.abs(x - 0.77) < 0.05;
      ctx.beginPath();
      ctx.moveTo((x - 0.06) * R, -0.21 * R);
      ctx.lineTo(x * R, (big ? -0.46 : -0.36) * R);
      ctx.lineTo((x + 0.06) * R, -0.21 * R);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // heavy brow ridge over the eye bump
    this.line(ctx, [{ x: 0.25 * R, y: 0.86 * R }, { x: 0.6 * R, y: 0.9 * R }, { x: 0.95 * R, y: 0.66 * R }], 3, darken(this.look.skin, 0.3));
  }

  /** Clown greasepaint details around the eye: purple diamonds and a painted tear track. */
  drawClownPaint(ctx, R, ex, ey) {
    const c = this.look.clown, t = this.tint;
    ctx.fillStyle = this.mat(c.mouth, t).base;
    for (const [dy, h] of [[0.32, 0.2], [-0.3, 0.26]]) {
      ctx.beginPath();
      ctx.moveTo(ex, ey + dy * R + h * R);
      ctx.lineTo(ex + 0.1 * R, ey + dy * R);
      ctx.lineTo(ex, ey + dy * R - h * 0.4 * R);
      ctx.lineTo(ex - 0.1 * R, ey + dy * R);
      ctx.closePath();
      ctx.fill();
    }
    // painted tear track + a real tear rolling down every couple of seconds
    this.line(ctx, [{ x: ex - 0.02 * R, y: ey - 0.12 * R }, { x: ex + 0.02 * R, y: ey - 0.4 * R }, { x: ex - 0.02 * R, y: ey - 0.62 * R }], 2.2, this.mat(c.tear, t).base, 0.8);
    const k = (this.time * 0.6) % 1;
    if (k < 0.6) {
      const y = ey - 0.15 * R - k * 0.9 * R;
      ctx.beginPath();
      ctx.moveTo(ex, y + 0.09 * R);
      ctx.quadraticCurveTo(ex + 0.06 * R, y - 0.02 * R, ex, y - 0.05 * R);
      ctx.quadraticCurveTo(ex - 0.06 * R, y - 0.02 * R, ex, y + 0.09 * R);
      ctx.fillStyle = rgba('#9ad8ff', 0.9 * (1 - k / 0.6));
      ctx.fill();
    }
  }

  drawClownMouthPaint(ctx, R) {
    const c = this.look.clown;
    ctx.beginPath();
    smoothClosed(ctx, [{ x: 0.3 * R, y: -0.7 * R }, { x: 0.55 * R, y: -0.3 * R }, { x: 1.0 * R, y: -0.28 * R }, { x: 1.18 * R, y: -0.62 * R }, { x: 0.8 * R, y: -0.82 * R }], 0.4);
    ctx.fillStyle = this.mat(c.mouth, this.tint).base;
    ctx.fill();
  }

  drawClownNose(ctx, R) {
    const c = this.look.clown;
    ctx.beginPath();
    ctx.arc(1.14 * R, -0.04 * R, 0.24 * R, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(1.08 * R, 0.04 * R, 0.02 * R, 1.14 * R, -0.04 * R, 0.26 * R);
    g.addColorStop(0, lighten(c.nose, 0.4));
    g.addColorStop(1, c.nose);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = this.outline;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(1.07 * R, 0.07 * R, 0.07 * R, 0.04 * R, -0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fill();
  }

  /** Sobby's cream pie stuck to the face (fades as it slides off). */
  drawPieFace(ctx, R, a) {
    ctx.save();
    ctx.globalAlpha *= a;
    const pts = [];
    for (let i = 0; i < 14; i++) {
      const ang = (i / 14) * Math.PI * 2, r = (0.62 + (i % 2) * 0.12) * R;
      pts.push({ x: 0.75 * R + Math.cos(ang) * r * 0.85, y: -0.05 * R + Math.sin(ang) * r });
    }
    ctx.beginPath();
    smoothClosed(ctx, pts, 0.4);
    ctx.fillStyle = '#fff6e8';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = this.outline;
    ctx.stroke();
    // drips and a cherry
    for (const [x, l] of [[0.5, 0.35], [0.85, 0.5], [1.1, 0.25]]) {
      ctx.beginPath();
      ctx.ellipse(x * R, (-0.6 - l * 0.5) * R, 0.07 * R, l * 0.5 * R, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#fff6e8';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0.8 * R, 0.55 * R, 0.13 * R, 0, Math.PI * 2);
    ctx.fillStyle = '#e8203a';
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /** Sombrero: the back half of the brim is drawn behind the head, the crown and front half over it. */
  drawSombrero(ctx, pass, R, part) {
    const hat = this.look.hat, t = this.tint;
    const c = this.mat(hat.color, t), band = this.mat(hat.band, t).base;
    ctx.save();
    ctx.translate(-0.05 * R, 0.62 * R);
    ctx.rotate(-0.08);
    const brim = (front) => {
      ctx.beginPath();
      ctx.ellipse(0, 0, 2.5 * R, 0.5 * R, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2, front);
      ctx.ellipse(0, 0.06 * R, 2.5 * R, 0.42 * R, 0, front ? Math.PI : Math.PI * 2, front ? 0 : Math.PI, !front);
    };
    if (part === 'back') {
      // back half of the brim (the far side, above the head line)
      ctx.beginPath();
      ctx.ellipse(0, 0, 2.5 * R, 0.5 * R, 0, 0, Math.PI);
      ctx.closePath();
      if (pass === 'outline') this.outlineFill(ctx);
      else {
        ctx.fillStyle = darken(c.base, 0.15);
        ctx.fill();
      }
      ctx.restore();
      return;
    }
    void brim;
    // crown: a tall rounded cone
    ctx.beginPath();
    smoothClosed(ctx, [{ x: -0.85 * R, y: 0.05 * R }, { x: -0.7 * R, y: 0.9 * R }, { x: -0.25 * R, y: 1.55 * R }, { x: 0.3 * R, y: 1.5 * R }, { x: 0.7 * R, y: 0.9 * R }, { x: 0.85 * R, y: 0.05 * R }], 0.4);
    ctx.lineWidth = this.ow * 2;
    ctx.strokeStyle = this.outline;
    ctx.stroke();
    ctx.fillStyle = c.base;
    ctx.fill();
    this.shadeAcross(ctx, { x: 0.8 * R, y: 1.2 * R }, { x: -0.8 * R, y: 0.3 * R });
    // zig-zag band
    ctx.beginPath();
    ctx.moveTo(-0.84 * R, 0.12 * R);
    for (let i = 0; i <= 8; i++) ctx.lineTo((-0.84 + i * 0.21) * R, (i % 2 ? 0.42 : 0.2) * R);
    ctx.lineTo(0.84 * R, 0.12 * R);
    ctx.closePath();
    ctx.fillStyle = band;
    ctx.fill();
    // front half of the brim, with a zig-zag trim along the edge
    ctx.beginPath();
    ctx.ellipse(0, 0, 2.5 * R, 0.5 * R, 0, Math.PI, Math.PI * 2);
    ctx.closePath();
    ctx.lineWidth = this.ow * 2;
    ctx.strokeStyle = this.outline;
    ctx.stroke();
    ctx.fillStyle = c.base;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI;
      const r = i % 2 ? 0.84 : 0.94;
      const p = { x: Math.cos(a) * 2.5 * R * r, y: -Math.sin(a) * 0.5 * R * r };
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.lineWidth = 3;
    ctx.strokeStyle = this.mat(hat.trim, t).base;
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  drawBump(ctx, R) {
    const cx = 0.08 * R, cy = 1.06 * R;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 0.44 * R, 0.4 * R, -0.1, Math.PI * 1.05, Math.PI * 1.95, true);
    ctx.closePath();
    const g = ctx.createRadialGradient(cx, cy + 0.1 * R, 0, cx, cy, 0.46 * R);
    g.addColorStop(0, mix(this.skin.base, '#ff6a7a', 0.45));
    g.addColorStop(1, mix(this.skin.base, '#c84a5a', 0.15));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = this.outline;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx - 0.1 * R, cy + 0.22 * R, 0.1 * R, 0.06 * R, -0.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fill();
  }

  /** Brick's super: a huge black eye, swollen shut for the rest of the round. */
  drawShiner(ctx, R, ex, ey, ew) {
    const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, ew * 1.8);
    g.addColorStop(0, 'rgba(70,24,96,0.95)');
    g.addColorStop(0.6, 'rgba(84,40,120,0.85)');
    g.addColorStop(0.85, 'rgba(58,90,168,0.45)');
    g.addColorStop(1, 'rgba(58,90,168,0)');
    ctx.beginPath();
    ctx.ellipse(ex - 0.02 * R, ey + 0.01 * R, ew * 1.75, ew * 1.35, 0.1, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    // puffy lids pressed together
    ctx.beginPath();
    ctx.ellipse(ex, ey + 0.06 * R, ew * 1.05, ew * 0.55, 0.05, Math.PI, 0, true);
    ctx.fillStyle = 'rgba(110,56,140,0.9)';
    ctx.fill();
    this.line(ctx, [{ x: ex - ew * 1.05, y: ey + 0.06 * R }, { x: ex, y: ey + 0.02 * R }, { x: ex + ew, y: ey + 0.07 * R }], 2.6, this.outline);
    this.line(ctx, [{ x: ex - ew * 0.6, y: ey + 0.2 * R }, { x: ex + ew * 0.4, y: ey + 0.22 * R }], 1.4, 'rgba(255,255,255,0.35)');
  }

  headShade(ctx, R) {
    // soft volumetric head shading: warm key light from the front-top, cool falloff, rim light behind
    const rim = this.rimC, L = this.Lh;
    const hg = ctx.createRadialGradient((0.1 + 0.5 * L.x) * R, 0.5 * L.y * R, 0.05 * R, (0.05 + 0.3 * L.x) * R, 0.1 * L.y * R, 1.55 * R);
    hg.addColorStop(0, 'rgba(255,240,220,0.30)');
    hg.addColorStop(0.35, 'rgba(255,240,220,0.04)');
    hg.addColorStop(0.62, 'rgba(40,16,64,0.06)');
    hg.addColorStop(0.86, 'rgba(40,16,64,0.34)');
    hg.addColorStop(0.93, rgba(rim, 0.45));
    hg.addColorStop(1, rgba(rim, 0.7));
    ctx.fillStyle = hg;
    ctx.fillRect(-2 * R, -2 * R, 4.5 * R, 4 * R);
  }

  /** Bear-onesie hood worn over the head: round ears, brim, a snout with teeth and eyes on top. */
  drawBearHood(ctx, R) {
    const hd = this.look.hood, t = this.tint, outl = this.outline;
    const fur = this.mat(hd.color, t).base;
    const ring = (x, y, r, fill, w = 1.8) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = w;
      ctx.strokeStyle = outl;
      ctx.stroke();
    };
    // ears
    for (const [x, y] of [[-0.75, 1.3], [0.2, 1.55]]) {
      ring(x * R, y * R, 0.36 * R, fur, 2.2);
      ring(x * R, y * R, 0.18 * R, this.mat(hd.lining, t).base, 1);
    }
    // brim: the hood edge framing the forehead
    ctx.beginPath();
    smoothClosed(ctx, [{ x: -1.25 * R, y: 0.1 * R }, { x: -1.0 * R, y: 1.2 * R }, { x: 0.1 * R, y: 1.5 * R }, { x: 1.05 * R, y: 1.05 * R }, { x: 1.2 * R, y: 0.5 * R },
      { x: 0.85 * R, y: 0.45 * R }, { x: 0.1 * R, y: 0.78 * R }, { x: -0.9 * R, y: 0.35 * R }], 0.35);
    ctx.fillStyle = fur;
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = outl;
    ctx.stroke();
    this.shadeAcross(ctx, { x: 0.6 * R, y: 1.4 * R }, { x: -1.2 * R, y: 0.2 * R });
    // teeth along the front of the brim
    ctx.fillStyle = this.mat(hd.teeth, t).base;
    for (const x of [0.32, 0.55, 0.78, 1.0]) {
      ctx.beginPath();
      ctx.moveTo((x - 0.09) * R, (0.62 - x * 0.1) * R);
      ctx.lineTo(x * R, (0.38 - x * 0.1) * R);
      ctx.lineTo((x + 0.09) * R, (0.6 - x * 0.1) * R);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // snout + nose
    ctx.beginPath();
    ctx.ellipse(0.98 * R, 0.98 * R, 0.42 * R, 0.3 * R, -0.25, 0, Math.PI * 2);
    ctx.fillStyle = this.mat(hd.snout, t).base;
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ring(1.3 * R, 1.08 * R, 0.15 * R, this.mat('#3a1830', t).base, 1.4);
    // stitched eye
    ring(0.4 * R, 1.12 * R, 0.17 * R, this.mat('#f4f1ea', t).base, 1.4);
    ring(0.44 * R, 1.1 * R, 0.08 * R, this.mat(hd.eyes, t).base, 0.8);
  }

  drawEars(ctx, pass, R, weasel) {
    const lk = this.look, t = this.tint;
    if (lk.mask || lk.species === 'croc') return;
    if (weasel) {
      for (const [x, y, s] of [[-0.35, 0.9, 1], [0.15, 1.0, 0.85]]) {
        ctx.beginPath();
        ctx.ellipse(x * R, y * R, 0.32 * R * s, 0.36 * R * s, -0.3, 0, Math.PI * 2);
        if (pass === 'outline') { this.outlineFill(ctx); continue; }
        ctx.fillStyle = this.skin.base;
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x * R, y * R, 0.18 * R * s, 0.22 * R * s, -0.3, 0, Math.PI * 2);
        ctx.fillStyle = this.mat('#d97aa8', t).base;
        ctx.fill();
      }
      return;
    }
    ctx.beginPath();
    if (lk.ears === 'pointed') {
      // elf-like ear sweeping up and back
      smoothClosed(ctx, [{ x: -0.04 * R, y: -0.34 * R }, { x: -0.3 * R, y: -0.2 * R }, { x: -0.62 * R, y: 0.42 * R }, { x: -0.2 * R, y: 0.16 * R }, { x: -0.02 * R, y: 0.12 * R }], 0.35);
    } else ctx.ellipse(-0.16 * R, -0.06 * R, 0.2 * R, 0.29 * R, 0.15, 0, Math.PI * 2);
    if (pass === 'outline') return this.outlineFill(ctx);
    ctx.fillStyle = this.skin.base;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-0.14 * R, -0.06 * R, 0.09 * R, 0.16 * R, 0.15, 0, Math.PI * 2);
    ctx.fillStyle = darken(this.skin.base, 0.25);
    ctx.fill();
    if (lk.earrings) {
      ctx.beginPath();
      ctx.arc(-0.12 * R, lk.hoops ? -0.5 * R : -0.36 * R, lk.hoops ? 0.2 * R : 0.1 * R, 0, Math.PI * 2);
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = this.mat(lk.earrings, t).base;
      ctx.stroke();
    }
  }

  drawBeard(ctx, R, beard) {
    const c = this.mat(beard.color, this.tint).base;
    ctx.beginPath();
    if (beard.style === 'stubble') {
      smoothClosed(ctx, [{ x: -0.3 * R, y: -0.2 * R }, { x: 0.5 * R, y: -0.35 * R }, { x: 1.0 * R, y: -0.3 * R }, { x: 0.8 * R, y: -1.0 * R }, { x: 0.1 * R, y: -0.9 * R }], 0.5);
      ctx.fillStyle = rgba(c, 0.35);
      ctx.fill();
    } else if (beard.style === 'sideburns') {
      smoothClosed(ctx, [{ x: -0.3 * R, y: 0.4 * R }, { x: -0.05 * R, y: 0.42 * R }, { x: 0.05 * R, y: -0.55 * R }, { x: -0.12 * R, y: -0.72 * R }, { x: -0.3 * R, y: -0.4 * R }], 0.4);
      ctx.fillStyle = c;
      ctx.fill();
    } else if (beard.style === 'goatee') {
      smoothClosed(ctx, [{ x: 0.35 * R, y: -0.62 * R }, { x: 0.9 * R, y: -0.6 * R }, { x: 0.82 * R, y: -1.15 * R }, { x: 0.45 * R, y: -1.1 * R }], 0.5);
      ctx.fillStyle = c;
      ctx.fill();
      ctx.beginPath();
      smoothClosed(ctx, [{ x: -0.3 * R, y: -0.25 * R }, { x: 0.6 * R, y: -0.5 * R }, { x: 0.9 * R, y: -0.85 * R }, { x: 0.2 * R, y: -0.95 * R }], 0.5);
      ctx.fillStyle = rgba(c, 0.35);
      ctx.fill();
    } else {
      smoothClosed(ctx, [{ x: -0.32 * R, y: -0.05 * R }, { x: 0.1 * R, y: -0.4 * R }, { x: 0.65 * R, y: -0.45 * R }, { x: 1.0 * R, y: -0.42 * R }, { x: 0.85 * R, y: -1.12 * R }, { x: 0.25 * R, y: -1.05 * R }], 0.5);
      ctx.fillStyle = c;
      ctx.fill();
    }
  }

  drawFace(ctx, R, opts, weasel) {
    const lk = this.look, t = this.tint, outl = this.outline;
    const angry = lk.brows === 'angry' || lk.brows === 'sharp';
    // expression: attack (narrowed eyes, gritted teeth), shout (heavy hits / specials), strain
    // (blocking), hurt (squeezed eyes, grimace), dizzy (spiral eyes), ko (X eyes), happy (victory)
    const xp = opts.expression || null;
    const hurt = xp === 'hurt';
    let lid = typeof opts.blink === 'number' ? opts.blink : opts.blink ? 1 : 0;
    if (xp === 'attack' || xp === 'strain') lid = Math.max(lid, 0.42);
    else if (xp === 'shout') lid = Math.max(lid, 0.22);
    const eyeMode = this.marks.shiner ? 'shiner' : lk.eyesClosed ? 'closed' : hurt ? 'squeeze' : xp === 'ko' ? 'x' : xp === 'dizzy' ? 'spiral' : xp === 'happy' ? 'happy' : lid > 0.85 ? 'closed' : 'open';
    const croc = lk.species === 'croc';
    const ex = croc ? 0.55 * R : weasel ? 0.66 * R : 0.6 * R, ey = croc ? 0.58 * R : weasel ? 0.3 * R : 0.17 * R;
    if (lk.clown) this.drawClownPaint(ctx, R, ex, ey);
    const ew = 0.27 * R;
    // eye socket shadow
    ctx.beginPath();
    ctx.ellipse(ex - 0.02 * R, ey + 0.02 * R, ew * 1.15, ew * 0.75, 0, 0, Math.PI * 2);
    ctx.fillStyle = rgba('#2a1440', 0.16);
    ctx.fill();
    if (this.battered) {
      // black eye and a cut over the brow
      ctx.beginPath();
      ctx.ellipse(ex - 0.02 * R, ey - 0.1 * R, ew * 1.05, ew * 0.62, 0.1, 0, Math.PI * 2);
      ctx.fillStyle = rgba('#5a2a78', 0.45);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(ex, ey - 0.14 * R, ew * 0.7, ew * 0.35, 0.1, 0, Math.PI * 2);
      ctx.fillStyle = rgba('#3a5aa8', 0.3);
      ctx.fill();
      this.line(ctx, [{ x: ex - ew * 0.6, y: ey + 0.42 * R }, { x: ex + ew * 0.1, y: ey + 0.36 * R }], 2, '#b0202a', 0.9);
      this.line(ctx, [{ x: ex - ew * 0.35, y: ey + 0.37 * R }, { x: ex - ew * 0.3, y: ey + 0.3 * R }], 1.4, '#b0202a', 0.8);
    }
    if (eyeMode === 'shiner') {
      this.drawShiner(ctx, R, ex, ey, ew);
    } else if (eyeMode === 'closed') {
      this.line(ctx, [{ x: ex - ew, y: ey + 0.03 * R }, { x: ex, y: ey - 0.07 * R }, { x: ex + ew * 0.9, y: ey + 0.03 * R }], 2.6, outl);
    } else if (eyeMode === 'squeeze') {
      // squeezed shut, pointing at the nose, with pain wrinkles
      this.line(ctx, [{ x: ex - ew, y: ey + 0.15 * R }, { x: ex + ew * 0.8, y: ey + 0.03 * R }, { x: ex - ew, y: ey - 0.09 * R }], 2.6, outl);
      this.line(ctx, [{ x: ex - ew * 1.5, y: ey + 0.2 * R }, { x: ex - ew * 1.25, y: ey + 0.03 * R }], 1.3, outl, 0.5);
      this.line(ctx, [{ x: ex - ew * 1.45, y: ey - 0.16 * R }, { x: ex - ew * 1.2, y: ey - 0.06 * R }], 1.3, outl, 0.5);
    } else if (eyeMode === 'happy') {
      ctx.beginPath();
      ctx.moveTo(ex - ew, ey - 0.02 * R);
      ctx.quadraticCurveTo(ex, ey + 0.2 * R, ex + ew * 0.9, ey);
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = outl;
      ctx.stroke();
    } else if (eyeMode === 'x') {
      this.line(ctx, [{ x: ex - ew * 0.8, y: ey + 0.14 * R }, { x: ex + ew * 0.8, y: ey - 0.1 * R }], 2.4, outl);
      this.line(ctx, [{ x: ex - ew * 0.8, y: ey - 0.1 * R }, { x: ex + ew * 0.8, y: ey + 0.14 * R }], 2.4, outl);
    } else if (eyeMode === 'spiral') {
      ctx.beginPath();
      ctx.ellipse(ex, ey + 0.02 * R, ew * 0.95, ew * 0.7, 0, 0, Math.PI * 2);
      ctx.fillStyle = mix('#f4efe6', '#ffffff', t);
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = outl;
      ctx.stroke();
      ctx.beginPath();
      const spin = this.time * 7;
      for (let a = 0; a < Math.PI * 5; a += 0.3) {
        const rr = (a / (Math.PI * 5)) * ew * 0.62;
        const px = ex + Math.cos(a + spin) * rr, py = ey + 0.02 * R + Math.sin(a + spin) * rr * 0.75;
        if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.lineWidth = 1.4;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(ex - ew, ey + 0.01 * R);
      ctx.quadraticCurveTo(ex - 0.05 * R, ey + 0.2 * R, ex + ew * 0.95, ey + 0.05 * R);
      ctx.quadraticCurveTo(ex, ey - 0.14 * R, ex - ew, ey + 0.01 * R);
      ctx.fillStyle = mix('#f4efe6', '#ffffff', t);
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.beginPath();
      ctx.arc(ex + 0.08 * R, ey + 0.03 * R, 0.13 * R, 0, Math.PI * 2);
      ctx.fillStyle = this.mat(lk.eyes, t).base;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex + 0.11 * R, ey + 0.03 * R, 0.06 * R, 0, Math.PI * 2);
      ctx.fillStyle = '#0d0a0e';
      ctx.fill();
      // the lid comes down over the eye (blinks, narrowed eyes when attacking)
      const yl = ey + 0.13 * R - lid * 0.25 * R;
      if (lid > 0.02) {
        ctx.fillStyle = darken(this.skin.base, 0.08);
        ctx.fillRect(ex - ew * 1.2, yl, ew * 2.4, 0.5 * R);
      }
      ctx.restore();
      // heavy upper lid
      ctx.beginPath();
      if (lid > 0.02) {
        const k = Math.min(1, lid * 1.6);
        ctx.moveTo(ex - ew * 1.05, ey + (yl - ey) * 0.25 * (1 - k) - 0.01 * R);
        ctx.quadraticCurveTo(ex - 0.05 * R, yl + 0.06 * R * (1 - lid), ex + ew * 1.0, Math.min(ey + 0.05 * R, yl + 0.02 * R));
      } else {
        ctx.moveTo(ex - ew * 1.05, ey);
        ctx.quadraticCurveTo(ex - 0.05 * R, ey + 0.21 * R, ex + ew * 1.0, ey + 0.05 * R);
      }
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = outl;
      ctx.stroke();
      if (lid < 0.45) {
        ctx.beginPath();
        ctx.arc(ex + 0.15 * R, ey + 0.08 * R - lid * 0.06 * R, 0.03 * R, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
    }
    // brows
    if (lk.brows !== 'none') {
      const th = lk.brows === 'thick' ? 0.16 * R : 0.1 * R;
      let inner = angry || lk.brows === 'thick' ? -0.12 * R : lk.brows === 'sad' ? 0.12 * R : 0.02 * R;
      let by = 0;
      if (xp === 'attack' || xp === 'strain' || xp === 'shout') { inner = -0.17 * R; by = -0.04 * R; }
      else if (hurt) { inner = 0.12 * R; by = 0.02 * R; }
      else if (xp === 'ko' || xp === 'dizzy') { inner = 0.08 * R; by = 0.06 * R; }
      else if (xp === 'happy') by = 0.06 * R;
      ctx.beginPath();
      smoothClosed(ctx, [
        { x: ex - 0.36 * R, y: ey + 0.28 * R + by }, { x: ex, y: ey + 0.36 * R + by }, { x: ex + 0.36 * R, y: ey + 0.26 * R + inner + by },
        { x: ex + 0.33 * R, y: ey + 0.26 * R + inner - th + by }, { x: ex, y: ey + 0.36 * R - th + by }, { x: ex - 0.36 * R, y: ey + 0.28 * R - th * 0.7 + by },
      ], 0.3);
      ctx.fillStyle = this.mat(croc ? darken(lk.skin, 0.35) : lk.hair?.color || lk.beard?.color || '#222', t).base;
      ctx.fill();
    }
    if (croc) {
      // nostrils on the snout tip; the jaw does the talking
      for (const x of [2.12, 2.24]) {
        ctx.beginPath();
        ctx.ellipse(x * R, 0.08 * R, 0.05 * R, 0.03 * R, 0, 0, Math.PI * 2);
        ctx.fillStyle = outl;
        ctx.fill();
      }
      return;
    }
    if (lk.freckles) {
      for (const [x, y] of [[0.75, -0.08], [0.85, -0.12], [0.68, -0.15], [0.8, -0.2]]) {
        ctx.beginPath();
        ctx.arc(x * R, y * R, 0.025 * R, 0, Math.PI * 2);
        ctx.fillStyle = rgba('#8a4a2a', 0.7);
        ctx.fill();
      }
    }
    if (weasel) {
      // nose, whiskers, fangs
      ctx.beginPath();
      ctx.ellipse(1.55 * R, -0.2 * R, 0.13 * R, 0.1 * R, -0.3, 0, Math.PI * 2);
      ctx.fillStyle = this.mat('#5a2a4a', t).base;
      ctx.fill();
      for (const k of [-0.1, 0.02, 0.14]) this.line(ctx, [{ x: 1.25 * R, y: (-0.3 + k) * R }, { x: 1.9 * R, y: (-0.2 + k * 1.8) * R }], 1, outl, 0.7);
      this.line(ctx, [{ x: 0.7 * R, y: -0.6 * R }, { x: 1.1 * R, y: -0.55 * R }, { x: 1.45 * R, y: -0.42 * R }], 1.8, outl);
      for (const x of [1.0, 1.3]) {
        ctx.beginPath();
        ctx.moveTo(x * R, -0.52 * R);
        ctx.lineTo((x + 0.05) * R, -0.7 * R);
        ctx.lineTo((x + 0.1) * R, -0.5 * R);
        ctx.fillStyle = '#f4efe6';
        ctx.fill();
      }
      return;
    }
    // mouth
    if (lk.clown) this.drawClownMouthPaint(ctx, R);
    const mouth = { hurt: 'grimace', shout: 'shout', attack: 'grit', strain: 'grit', ko: 'slack', dizzy: 'wavy', happy: 'grin' }[xp] || lk.mouth;
    if (mouth === 'shout' || mouth === 'grimace' || mouth === 'slack') {
      // open mouth: dark inside, upper teeth, tongue
      const w = mouth === 'grimace' ? 0.3 : mouth === 'shout' ? 0.23 : 0.2, h = mouth === 'shout' ? 0.21 : mouth === 'slack' ? 0.14 : 0.15;
      const cx = 0.76 * R, cy = -0.5 * R;
      ctx.beginPath();
      if (mouth === 'grimace') {
        smoothClosed(ctx, [{ x: cx - w * R, y: cy + 0.04 * R }, { x: cx, y: cy + h * R }, { x: cx + w * R, y: cy + 0.1 * R }, { x: cx + w * 0.6 * R, y: cy - 0.03 * R }, { x: cx - 0.1 * R, y: cy - h * 0.6 * R }], 0.4);
      } else ctx.ellipse(cx, cy - (mouth === 'slack' ? 0.03 * R : 0), w * R, h * R, -0.15, 0, Math.PI * 2);
      ctx.fillStyle = '#3a0e1a';
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = '#f6f1e6';
      ctx.fillRect(cx - 0.4 * R, cy + h * R * 0.45, 0.8 * R, 0.2 * R);
      if (mouth === 'grimace') ctx.fillRect(cx - 0.4 * R, cy - h * R * 1.1, 0.8 * R, 0.07 * R);
      ctx.beginPath();
      ctx.ellipse(cx - 0.02 * R, cy - h * R * 0.85, w * 0.7 * R, h * 0.5 * R, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#c84a6a';
      ctx.fill();
      ctx.restore();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = outl;
      ctx.stroke();
      if (mouth === 'slack') {
        // tongue hanging out
        ctx.beginPath();
        ctx.ellipse(cx + 0.06 * R, cy - h * R - 0.06 * R, 0.08 * R, 0.11 * R, -0.3, 0, Math.PI * 2);
        ctx.fillStyle = '#d65a7a';
        ctx.fill();
        ctx.lineWidth = 1.3;
        ctx.stroke();
      }
    } else if (mouth === 'grit') {
      // clenched teeth
      ctx.beginPath();
      smoothClosed(ctx, [{ x: 0.5 * R, y: -0.42 * R }, { x: 0.76 * R, y: -0.38 * R }, { x: 1.0 * R, y: -0.4 * R }, { x: 0.98 * R, y: -0.54 * R }, { x: 0.74 * R, y: -0.56 * R }, { x: 0.52 * R, y: -0.53 * R }], 0.35);
      ctx.fillStyle = '#f6f1e6';
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = outl;
      ctx.stroke();
      this.line(ctx, [{ x: 0.53 * R, y: -0.47 * R }, { x: 0.97 * R, y: -0.47 * R }], 0.9, outl, 0.7);
      for (const x of [0.64, 0.76, 0.88]) this.line(ctx, [{ x: x * R, y: -0.4 * R }, { x: x * R, y: -0.54 * R }], 0.8, outl, 0.5);
    } else if (mouth === 'clown') {
      // the painted-on sad grimace: wide, down-turned, all teeth
      ctx.beginPath();
      smoothClosed(ctx, [{ x: 0.42 * R, y: -0.62 * R }, { x: 0.62 * R, y: -0.4 * R }, { x: 0.95 * R, y: -0.38 * R }, { x: 1.08 * R, y: -0.6 * R }, { x: 0.8 * R, y: -0.66 * R }], 0.35);
      ctx.fillStyle = '#3a0e1a';
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = '#f6f1e6';
      ctx.fillRect(0.4 * R, -0.52 * R, 0.7 * R, 0.16 * R);
      ctx.fillRect(0.4 * R, -0.72 * R, 0.7 * R, 0.09 * R);
      for (const x of [0.58, 0.7, 0.82, 0.94]) this.line(ctx, [{ x: x * R, y: -0.36 * R }, { x: x * R, y: -0.52 * R }], 0.8, outl, 0.5);
      ctx.restore();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = outl;
      ctx.stroke();
    } else if (mouth === 'wavy') {
      this.line(ctx, [{ x: 0.55 * R, y: -0.44 * R }, { x: 0.66 * R, y: -0.4 * R }, { x: 0.78 * R, y: -0.48 * R }, { x: 0.9 * R, y: -0.42 * R }, { x: 0.98 * R, y: -0.46 * R }], 1.8, outl);
    } else if (mouth === 'grin' || mouth === 'teeth' || mouth === 'snarl') {
      const wide = mouth === 'grin' ? 1 : 0.8;
      ctx.beginPath();
      ctx.moveTo(0.42 * R, -0.42 * R);
      ctx.quadraticCurveTo(0.75 * R, -0.62 * R * wide, 1.0 * R, -0.36 * R);
      ctx.quadraticCurveTo(0.75 * R, -0.38 * R, 0.42 * R, -0.42 * R);
      ctx.fillStyle = '#f6f1e6';
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = outl;
      ctx.stroke();
      this.line(ctx, [{ x: 0.5 * R, y: -0.44 * R }, { x: 0.96 * R, y: -0.4 * R }], 0.9, outl, 0.6);
      if (lk.toothGap) {
        ctx.fillStyle = '#2a0e16';
        ctx.fillRect(0.66 * R, -0.5 * R, 0.1 * R, 0.08 * R);
      }
      if (mouth === 'grin') this.line(ctx, [{ x: 0.35 * R, y: -0.3 * R }, { x: 0.42 * R, y: -0.42 * R }, { x: 0.4 * R, y: -0.55 * R }], 1.3, outl, 0.7);
    } else if (mouth === 'lips') {
      ctx.beginPath();
      smoothClosed(ctx, [{ x: 0.66 * R, y: -0.42 * R }, { x: 0.86 * R, y: -0.36 * R }, { x: 0.98 * R, y: -0.44 * R }, { x: 0.84 * R, y: -0.54 * R }], 0.4);
      ctx.fillStyle = this.mat(lk.lips || '#8a2a5a', this.tint).base;
      ctx.fill();
    } else if (mouth === 'open') {
      ctx.beginPath();
      ctx.ellipse(0.82 * R, -0.45 * R, 0.13 * R, 0.1 * R, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#3a0e1a';
      ctx.fill();
    } else if (mouth !== 'none') {
      this.line(ctx, [{ x: 0.6 * R, y: -0.45 * R }, { x: 0.95 * R, y: -0.42 * R }], 1.8, outl);
    }
    // nose shading line + cheekbone
    ctx.beginPath();
    ctx.ellipse(1.0 * R, -0.08 * R, 0.07 * R, 0.04 * R, -0.4, 0, Math.PI * 2);
    ctx.fillStyle = rgba(outl, 0.55);
    ctx.fill();
    this.line(ctx, [{ x: 0.86 * R, y: -0.18 * R }, { x: 0.74 * R, y: -0.3 * R }], 1.4, outl, 0.35);
    if (lk.clown) this.drawClownNose(ctx, R, ex, ey);
  }

  drawMask(ctx, R) {
    const lk = this.look, t = this.tint;
    if (lk.mask.style === 'jaguar') return this.drawJaguarMask(ctx, R);
    ctx.beginPath();
    smoothClosed(ctx, [{ x: 0.2 * R, y: 0.32 * R }, { x: 1.05 * R, y: 0.3 * R }, { x: 1.05 * R, y: 0.08 * R }, { x: 0.25 * R, y: 0.1 * R }], 0.3);
    ctx.fillStyle = this.mat(lk.mask.visor, t).base;
    ctx.shadowColor = lk.mask.visor;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
    this.line(ctx, [{ x: 0.3 * R, y: -0.3 * R }, { x: 1.05 * R, y: -0.25 * R }], 1.2, this.outline, 0.6);
    this.line(ctx, [{ x: -0.6 * R, y: 0.6 * R }, { x: 0.0, y: 0.95 * R }], 1.2, this.outline, 0.4);
  }

  drawJaguarMask(ctx, R) {
    const m = this.look.mask, t = this.tint, outl = this.outline;
    // purple markings, glowing eyes, snarling muzzle
    ctx.beginPath();
    smoothClosed(ctx, [{ x: 0.3 * R, y: 0.5 * R }, { x: 0.95 * R, y: 0.35 * R }, { x: 0.9 * R, y: 0.05 * R }, { x: 0.35 * R, y: 0.12 * R }], 0.4);
    ctx.fillStyle = this.mat(m.markings, t).base;
    ctx.fill();
    ctx.beginPath();
    smoothClosed(ctx, [{ x: 0.5 * R, y: 0.3 * R }, { x: 0.85 * R, y: 0.25 * R }, { x: 0.8 * R, y: 0.12 * R }, { x: 0.52 * R, y: 0.16 * R }], 0.4);
    ctx.fillStyle = this.mat(m.visor, t).base;
    ctx.shadowColor = m.visor;
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(0.72 * R, 0.21 * R, 0.04 * R, 0, Math.PI * 2);
    ctx.fillStyle = '#120c10';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(1.1 * R, -0.05 * R, 0.13 * R, 0.09 * R, 0, 0, Math.PI * 2);
    ctx.fillStyle = this.mat(m.markings, t).base;
    ctx.fill();
    this.line(ctx, [{ x: 0.55 * R, y: -0.5 * R }, { x: 0.85 * R, y: -0.42 * R }, { x: 1.08 * R, y: -0.36 * R }], 1.8, outl);
    for (const x of [0.75, 0.95]) {
      ctx.beginPath();
      ctx.moveTo(x * R, -0.43 * R); ctx.lineTo((x + 0.04) * R, -0.58 * R); ctx.lineTo((x + 0.08) * R, -0.41 * R);
      ctx.fillStyle = '#f4efe6';
      ctx.fill();
    }
    for (const k of [-0.1, 0.05]) this.line(ctx, [{ x: 0.95 * R, y: (-0.15 + k) * R }, { x: 1.55 * R, y: (-0.1 + k * 2) * R }], 0.9, outl, 0.7);
    // forehead spots and ears
    for (const [x, y] of [[0.2, 0.75], [0.45, 0.82], [-0.1, 0.6]]) {
      ctx.beginPath();
      ctx.arc(x * R, y * R, 0.07 * R, 0, Math.PI * 2);
      ctx.fillStyle = rgba(this.mat(m.markings, t).base, 0.8);
      ctx.fill();
    }
    for (const [x, s] of [[-0.45, 0.9], [0.25, 1]]) {
      ctx.beginPath();
      ctx.moveTo((x - 0.25) * R, 0.75 * R);
      ctx.lineTo((x + 0.02) * R, 1.45 * R * s);
      ctx.lineTo((x + 0.3) * R, 0.8 * R);
      ctx.closePath();
      ctx.fillStyle = this.mat(m.color, t).base;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = outl;
      ctx.stroke();
    }
  }

  drawHairBack(ctx, pass, R) {
    const hair = this.look.hair;
    ctx.beginPath();
    if (hair.style === 'pompadour') {
      smoothClosed(ctx, [{ x: -0.95 * R, y: 0.0 }, { x: -1.0 * R, y: 0.9 * R }, { x: -0.6 * R, y: 1.7 * R }, { x: 0.2 * R, y: 2.3 * R }, { x: 0.9 * R, y: 2.05 * R }, { x: 0.55 * R, y: 1.5 * R }, { x: 0.85 * R, y: 0.75 * R }, { x: 0.2 * R, y: 0.6 * R }], 0.45);
    } else if (hair.style === 'swept') {
      smoothClosed(ctx, [{ x: -0.85 * R, y: 0.4 * R }, { x: -0.9 * R, y: 1.15 * R }, { x: -0.2 * R, y: 1.55 * R }, { x: 0.8 * R, y: 1.5 * R }, { x: 1.55 * R, y: 1.15 * R }, { x: 0.9 * R, y: 0.95 * R }, { x: 0.6 * R, y: 0.55 * R }], 0.45);
    } else {
      // spiky
      const pts = [{ x: -0.95 * R, y: 0.1 * R }];
      const spikes = [[-1.15, 0.9], [-0.7, 0.85], [-0.75, 1.65], [-0.25, 1.15], [0.0, 1.9], [0.25, 1.15], [0.6, 1.6], [0.62, 0.95], [1.05, 1.15], [0.8, 0.6]];
      for (const [x, y] of spikes) pts.push({ x: x * R, y: y * R });
      pts.push({ x: 0.5 * R, y: 0.45 * R });
      ctx.moveTo(pts[0].x, pts[0].y);
      for (const p of pts) ctx.lineTo(p.x, p.y);
      ctx.closePath();
    }
    if (pass === 'outline') return this.outlineFill(ctx);
    ctx.fillStyle = this.mat(hair.color, this.tint).base;
    ctx.fill();
    this.shadeAcross(ctx, { x: 0.6 * R, y: 2 * R }, { x: -0.8 * R, y: 0.2 * R });
    if (hair.streak) {
      ctx.save();
      ctx.clip();
      ctx.beginPath();
      if (hair.style === 'spiky') {
        ctx.moveTo(-0.1 * R, 0.6 * R); ctx.lineTo(0.0, 1.9 * R); ctx.lineTo(0.25 * R, 1.15 * R); ctx.lineTo(0.3 * R, 0.6 * R);
        ctx.fillStyle = this.mat(hair.streak, this.tint).base;
        ctx.fill();
        if (hair.streak2) {
          ctx.beginPath();
          ctx.moveTo(-0.5 * R, 0.6 * R); ctx.lineTo(-0.75 * R, 1.65 * R); ctx.lineTo(-0.25 * R, 1.15 * R);
          ctx.fillStyle = this.mat(hair.streak2, this.tint).base;
          ctx.fill();
        }
      } else {
        smoothOpen(ctx, [{ x: -0.7 * R, y: 0.6 * R }, { x: -0.3 * R, y: 1.6 * R }, { x: 0.5 * R, y: 2.1 * R }]);
        ctx.lineWidth = 3;
        ctx.strokeStyle = this.mat(hair.streak, this.tint).base;
        ctx.stroke();
      }
      ctx.restore();
    }
    if (hair.root) {
      ctx.save();
      ctx.clip();
      ctx.beginPath();
      ctx.rect(-1.2 * R, 0, 1.0 * R, 1.0 * R);
      ctx.fillStyle = rgba(hair.root, 0.6);
      ctx.fill();
      ctx.restore();
    }
  }

  drawHair(ctx, R) {
    const hair = this.look.hair;
    if (!hair) return;
    const c = this.mat(hair.color, this.tint).base;
    switch (hair.style) {
      case 'bald': {
        ctx.beginPath();
        ctx.ellipse(0.15 * R, 0.72 * R, 0.32 * R, 0.14 * R, -0.4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fill();
        this.line(ctx, [{ x: -0.1 * R, y: 1.08 * R }, { x: 0.05 * R, y: 1.3 * R }, { x: 0.25 * R, y: 1.3 * R }], 1, this.outline, 0.7);
        break;
      }
      case 'spiky':
      case 'swept':
      case 'pompadour': {
        // shaved sides / cap over the skull (hairline sits above the brow)
        this.hairCap(ctx, R);
        ctx.fillStyle = hair.style === 'swept' ? rgba(hair.root || hair.color, 0.75) : c;
        ctx.fill();
        break;
      }
      case 'ponytail': {
        this.hairCap(ctx, R, 1.06);
        ctx.fillStyle = c;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = this.outline;
        ctx.stroke();
        this.line(ctx, [{ x: 0.75 * R, y: 0.6 * R }, { x: 0.95 * R, y: 0.25 * R }, { x: 0.9 * R, y: -0.05 * R }], 3, hair.color);
        if (hair.streak) this.line(ctx, [{ x: -0.6 * R, y: 0.6 * R }, { x: 0.1 * R, y: 1.0 * R }, { x: 0.7 * R, y: 0.7 * R }], 2, this.mat(hair.streak, this.tint).base);
        break;
      }
      case 'short': {
        this.hairCap(ctx, R);
        ctx.fillStyle = c;
        ctx.fill();
        break;
      }
      case 'bun': {
        this.hairCap(ctx, R, 1.06);
        ctx.fillStyle = c;
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(-0.35 * R, 1.25 * R, 0.5 * R, 0.42 * R, -0.3, 0, Math.PI * 2);
        ctx.lineWidth = this.ow * 2;
        ctx.strokeStyle = this.outline;
        ctx.stroke();
        ctx.fillStyle = c;
        ctx.fill();
        this.line(ctx, [{ x: -0.75 * R, y: 1.0 * R }, { x: -0.3 * R, y: 1.6 * R }], 4, this.mat(hair.streak, this.tint).base);
        this.line(ctx, [{ x: 0.6 * R, y: 0.75 * R }, { x: 1.0 * R, y: 0.3 * R }, { x: 0.95 * R, y: -0.3 * R }], 3.5, hair.color);
        this.line(ctx, [{ x: 0.3 * R, y: 0.85 * R }, { x: 0.75 * R, y: 0.5 * R }, { x: 0.8 * R, y: 0.0 }], 2.2, this.mat(hair.streak2 || hair.streak, this.tint).base);
        // shaved, braided side
        for (let i = 0; i < 3; i++) this.line(ctx, [{ x: (-0.55 + i * 0.12) * R, y: 0.15 * R }, { x: (-0.45 + i * 0.12) * R, y: 0.55 * R }], 1, this.outline, 0.6);
        break;
      }
      case 'topknot': {
        // sumo bowl cut: a flat fringe across the forehead, shaved line, topknot on the crown
        ctx.beginPath();
        smoothClosed(ctx, [{ x: 0.94 * R, y: 0.44 * R }, { x: 0.75 * R, y: 1.05 * R }, { x: -0.2 * R, y: 1.22 * R }, { x: -1.04 * R, y: 0.55 * R },
          { x: -1.06 * R, y: -0.15 * R }, { x: -0.72 * R, y: -0.3 * R }, { x: -0.5 * R, y: 0.28 * R }, { x: 0.25 * R, y: 0.42 * R }], 0.35);
        ctx.fillStyle = c;
        ctx.fill();
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = this.outline;
        ctx.stroke();
        if (hair.sheen) this.line(ctx, [{ x: -0.6 * R, y: 0.95 * R }, { x: 0.0 * R, y: 1.12 * R }, { x: 0.55 * R, y: 0.98 * R }], 2.2, this.mat(hair.sheen, this.tint).base, 0.7);
        for (let i = 0; i < 5; i++) this.line(ctx, [{ x: (-0.4 + i * 0.28) * R, y: 1.1 * R }, { x: (-0.35 + i * 0.3) * R, y: 0.5 * R }], 1, this.outline, 0.35);
        if (hair.knot !== false) {
          ctx.beginPath();
          ctx.ellipse(-0.15 * R, 1.32 * R, 0.42 * R, 0.17 * R, 0.15, 0, Math.PI * 2);
          ctx.fillStyle = c;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.stroke();
          this.line(ctx, [{ x: -0.42 * R, y: 1.2 * R }, { x: -0.4 * R, y: 1.44 * R }], 2.4, '#f2efe8');
        } else {
          // the knot came undone: a messy tuft
          for (const [x, a] of [[-0.3, 0.4], [-0.1, 0.1], [0.1, -0.3]]) this.line(ctx, [{ x: x * R, y: 1.15 * R }, { x: (x + Math.sin(a) * 0.4) * R, y: 1.7 * R }], 3, c);
        }
        break;
      }
      case 'crest': {
        ctx.beginPath();
        smoothClosed(ctx, [{ x: -0.7 * R, y: 0.7 * R }, { x: -0.2 * R, y: 1.35 * R }, { x: 0.5 * R, y: 1.25 * R }, { x: 0.6 * R, y: 0.9 * R }], 0.4);
        ctx.fillStyle = c;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = this.outline;
        ctx.stroke();
        break;
      }
      default:
    }
  }

  hairCap(ctx, R, k = 1) {
    ctx.beginPath();
    smoothClosed(ctx, [
      { x: 0.62 * R, y: 0.62 * R }, { x: 0.35 * R, y: 1.06 * R * k }, { x: -0.3 * R, y: 1.12 * R * k }, { x: -0.95 * R, y: 0.6 * R * k },
      { x: -1.02 * R * k, y: -0.05 * R }, { x: -0.62 * R, y: -0.3 * R }, { x: -0.38 * R, y: 0.3 * R }, { x: 0.15 * R, y: 0.62 * R },
    ], 0.45);
  }

  /** Feather headdress: a fan of feathers over the crown, a patterned headband and a gold disc. */
  drawFeathers(ctx, R, hat) {
    const t = this.tint, outl = this.outline;
    const quill = this.mat(hat.color, t).base, tip = this.mat(hat.tip, t).base;
    // back to front so the forward feathers overlap the ones behind
    for (let i = 0; i < 9; i++) {
      if (hat.sparse && i % 2) continue; // half of them knocked out
      const a = (175 - i * 11) * DEG;
      const L = R * (1.9 + 0.4 * Math.sin(i * 1.7));
      const bx = Math.cos(a) * 0.82 * R, by = Math.sin(a) * 0.82 * R + 0.25 * R;
      const mx = bx + Math.cos(a) * L * 0.5, my = by + Math.sin(a) * L * 0.5;
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(0, 0, L * 0.5, 0.24 * R, 0, 0, Math.PI * 2);
      ctx.fillStyle = quill;
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = outl;
      ctx.stroke();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = tip;
      ctx.fillRect(L * 0.12, -R, L, 2 * R);
      ctx.restore();
      this.line(ctx, [{ x: -L * 0.5, y: 0 }, { x: L * 0.42, y: 0 }], 1, outl, 0.5);
      ctx.restore();
    }
    // headband
    ctx.beginPath();
    smoothOpen(ctx, [{ x: -1.0 * R, y: 0.42 * R }, { x: 0.0, y: 0.62 * R }, { x: 0.98 * R, y: 0.56 * R }]);
    ctx.lineWidth = 0.3 * R + 2.5;
    ctx.strokeStyle = outl;
    ctx.stroke();
    ctx.lineWidth = 0.3 * R;
    ctx.strokeStyle = this.mat(hat.band, t).base;
    ctx.stroke();
    for (const x of [-0.6, -0.1, 0.4]) {
      ctx.beginPath();
      const y = 0.55 * R + (x < 0 ? x * 0.12 * R : 0);
      ctx.moveTo(x * R, y - 0.1 * R); ctx.lineTo((x + 0.12) * R, y); ctx.lineTo(x * R, y + 0.1 * R); ctx.lineTo((x - 0.12) * R, y);
      ctx.fillStyle = this.mat(hat.pattern, t).base;
      ctx.fill();
    }
    // gold disc at the temple
    ctx.beginPath();
    ctx.arc(-0.5 * R, 0.5 * R, 0.24 * R, 0, Math.PI * 2);
    ctx.fillStyle = this.mat(hat.disc, t).base;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = outl;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-0.5 * R, 0.5 * R, 0.11 * R, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(outl, 0.6);
    ctx.stroke();
  }

  drawHat(ctx, R) {
    const hat = this.look.hat, t = this.tint;
    const c = this.mat(hat.color, t);
    if (hat.type === 'feathers') return this.drawFeathers(ctx, R, hat);
    if (hat.type === 'cap') {
      // checkered newsboy cap, puffed up and tilted back, goggles on the front
      const crown = [{ x: 1.05 * R, y: 0.55 * R }, { x: 0.8 * R, y: 1.25 * R }, { x: -0.1 * R, y: 1.55 * R }, { x: -1.15 * R, y: 1.2 * R }, { x: -1.2 * R, y: 0.55 * R }, { x: 0.1 * R, y: 0.62 * R }];
      ctx.beginPath();
      smoothClosed(ctx, crown, 0.45);
      ctx.lineWidth = this.ow * 2;
      ctx.strokeStyle = this.outline;
      ctx.stroke();
      ctx.fillStyle = c.base;
      ctx.fill();
      ctx.save();
      ctx.clip();
      const sq = 0.32 * R;
      for (let i = -5; i < 5; i++) for (let j = 1; j < 6; j++) {
        if ((i + j) % 2) continue;
        ctx.save();
        ctx.translate(i * sq, j * sq * 0.9);
        ctx.rotate(0.35);
        ctx.fillStyle = this.mat((i + j * 3) % 4 === 0 ? hat.check2 : hat.check, t).base;
        ctx.fillRect(0, 0, sq, sq * 0.9);
        ctx.restore();
      }
      this.shadeAcross(ctx, { x: 0.8 * R, y: 1.4 * R }, { x: -1 * R, y: 0.6 * R });
      ctx.restore();
      // short visor
      ctx.beginPath();
      smoothClosed(ctx, [{ x: 0.7 * R, y: 0.7 * R }, { x: 1.45 * R, y: 0.6 * R }, { x: 1.5 * R, y: 0.48 * R }, { x: 0.8 * R, y: 0.52 * R }], 0.3);
      ctx.fillStyle = darken(c.base, 0.2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.stroke();
      if (hat.goggles) {
        for (const x of [0.3, 0.72]) {
          ctx.beginPath();
          ctx.arc(x * R, 1.05 * R, 0.24 * R, 0, Math.PI * 2);
          ctx.fillStyle = this.mat(hat.goggles, t).base;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(x * R, 1.05 * R, 0.15 * R, 0, Math.PI * 2);
          ctx.fillStyle = '#2a3a4a';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x * R - 0.05 * R, 1.1 * R, 0.05 * R, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,255,255,0.8)';
          ctx.fill();
        }
      }
      return;
    }
    if (hat.type === 'chef') {
      ctx.beginPath();
      smoothClosed(ctx, [{ x: -0.85 * R, y: 0.55 * R }, { x: -1.15 * R, y: 1.5 * R }, { x: -0.6 * R, y: 2.2 * R }, { x: 0.1 * R, y: 2.05 * R }, { x: 0.7 * R, y: 2.25 * R }, { x: 1.2 * R, y: 1.55 * R }, { x: 0.85 * R, y: 0.6 * R }], 0.45);
      ctx.lineWidth = this.ow * 2;
      ctx.strokeStyle = this.outline;
      ctx.stroke();
      ctx.fillStyle = c.base;
      ctx.fill();
      this.shadeAcross(ctx, { x: 0.9 * R, y: 2 * R }, { x: -1 * R, y: 0.6 * R });
      this.line(ctx, [{ x: -0.3 * R, y: 1.2 * R }, { x: -0.1 * R, y: 1.9 * R }], 1.3, this.outline, 0.4);
      this.line(ctx, [{ x: 0.35 * R, y: 1.2 * R }, { x: 0.5 * R, y: 1.95 * R }], 1.3, this.outline, 0.4);
      ctx.beginPath();
      boxAlong(ctx, { x: -0.88 * R, y: 0.78 * R }, { x: 0.9 * R, y: 0.7 * R }, 0.2 * R, 0.2 * R, 0.4);
      ctx.fillStyle = darken(c.base, 0.06);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.stroke();
      return;
    }
    ctx.save();
    ctx.translate(-0.05 * R, 0.16 * R);
    ctx.rotate(-0.12);
    // crown
    ctx.beginPath();
    boxAlong(ctx, { x: 0, y: 0.7 * R }, { x: 0.05 * R, y: 2.3 * R }, 0.82 * R, 0.9 * R, 0.25);
    ctx.lineWidth = this.ow * 2;
    ctx.strokeStyle = this.outline;
    ctx.stroke();
    ctx.fillStyle = c.base;
    ctx.fill();
    this.shadeAcross(ctx, { x: 0.9 * R, y: 1.5 * R }, { x: -0.9 * R, y: 1.5 * R });
    // band
    ctx.beginPath();
    boxAlong(ctx, { x: 0, y: 0.95 * R }, { x: 0.01 * R, y: 1.3 * R }, 0.84 * R, 0.84 * R, 0.1);
    ctx.fillStyle = this.mat(hat.band, t).base;
    ctx.fill();
    // brim
    ctx.beginPath();
    ctx.ellipse(0.05 * R, 0.72 * R, 1.35 * R, 0.24 * R, 0, 0, Math.PI * 2);
    ctx.lineWidth = this.ow * 2;
    ctx.strokeStyle = this.outline;
    ctx.stroke();
    ctx.fillStyle = darken(c.base, 0.12);
    ctx.fill();
    // goggles on the band
    if (hat.goggles) {
      for (const x of [0.15, 0.62]) {
        ctx.beginPath();
        ctx.arc(x * R, 1.12 * R, 0.27 * R, 0, Math.PI * 2);
        ctx.fillStyle = this.mat(hat.goggles, t).base;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = this.outline;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x * R, 1.12 * R, 0.18 * R, 0, Math.PI * 2);
        const g = ctx.createLinearGradient(x * R - 6, 1.3 * R, x * R + 6, 0.9 * R);
        g.addColorStop(0, '#2a0f3a');
        g.addColorStop(0.5, '#e0399b');
        g.addColorStop(1, '#3fd2c2');
        ctx.fillStyle = g;
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawHeadphones(ctx, J, A) {
    const c = this.mat(this.look.headphones, this.tint).base;
    const N = J.neck;
    const uC = dirUp(A.chest), fC = fwdOf(uC);
    const band = [P2(N, fC, -10, uC, 6), P2(N, fC, 2, uC, -6), P2(N, fC, 14, uC, 2)];
    this.line(ctx, band, 4.5, this.outline);
    this.line(ctx, band, 2.6, '#3fd2c2');
    for (const p of [band[0], band[2]]) {
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 6, 7.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = c;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = this.outline;
      ctx.stroke();
    }
  }
}
