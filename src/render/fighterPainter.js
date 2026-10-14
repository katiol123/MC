// Procedural fighter painter. Draws a fighter from its skeleton (joint positions in local fighter
// space, y up, x forward). Every body part is built from code: tapered muscular limb meshes,
// a contoured torso, a sculpted head, clothing layers, cel shading with rim light and outlines.
//
// Each body group is drawn in two passes: an expanded dark silhouette (outline) and the colour pass on
// top, so joints inside a group are seamless while groups stay readable against each other.
import { limbPath, smoothClosed, smoothOpen, boxAlong, along } from './shapes.js';
import { mix, lighten, darken, rgba } from './color.js';
import { dirUp, dirFwd, DEG } from '../core/math.js';
import { PAN_COCK } from '../data/signatures.js';
import { drawFireFist } from './fire.js';

const LIGHT = { x: 0.45, y: 0.89 };
const SHADOW_TINT = '#2a1440';

const fwdOf = (u) => ({ x: u.y, y: -u.x });
const P = (o, d, k) => ({ x: o.x + d.x * k, y: o.y + d.y * k });
const P2 = (o, d1, k1, d2, k2) => ({ x: o.x + d1.x * k1 + d2.x * k2, y: o.y + d1.y * k1 + d2.y * k2 });

export class FighterPainter {
  constructor(def) {
    this.def = def;
    this.look = def.look;
    this.pr = def.props;
    this.ow = 3.1; // outline half-width (local units)
    this.matCache = new Map();
  }

  /** Material colours, optionally tinted (hit flash). */
  mat(base, tint = 0) {
    const key = base + '|' + tint;
    let m = this.matCache.get(key);
    if (!m) {
      const b = tint ? mix(base, '#ffffff', tint) : base;
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
    if (nx * LIGHT.x + ny * LIGHT.y < 0) { nx = -nx; ny = -ny; }
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const g = ctx.createLinearGradient(mx + nx * r, my + ny * r, mx - nx * r, my - ny * r);
    this.shadeStops(g);
    ctx.fillStyle = g;
    ctx.fill();
  }

  shadeStops(g) {
    const rim = this.look.rim || '#ff4fd8';
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

  // --- main entry ------------------------------------------------------------------------------
  /**
   * opts: { layers, tint (0..1 white flash), chains: {name: [points local]}, time, blink }
   */
  draw(ctx, skel, opts = {}) {
    const lk = this.look;
    this.outline = opts.tint ? mix(lk.outline || '#141014', '#ffffff', opts.tint * 0.4) : lk.outline || '#141014';
    this.tint = opts.tint || 0;
    this.prop = opts.prop || null;
    this.fire = !!opts.fire;
    this.claws = !!opts.claws;
    this.time = (opts.now || 0) / 1000;
    const t = this.tint;
    this.skin = this.mat(lk.skin, t);
    const layers = opts.layers || {};
    const J = skel.j, A = skel.a;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const groups = [];
    const push = (z, fn) => groups.push({ z, fn });
    // Back-most secondary elements.
    push(0, (p) => this.drawChains(ctx, p, opts.chains, 'back', J, A));
    push(1, (p) => this.drawArm(ctx, p, J, A, 'B'));
    push(2, (p) => this.drawLeg(ctx, p, J, A, 'B'));
    push(3, (p) => this.drawCoatSkirt(ctx, p, J, A, 'back', opts.chains));
    push(4, (p) => this.drawPelvis(ctx, p, J, A));
    push(5, (p) => this.drawLeg(ctx, p, J, A, 'F'));
    push(6, (p) => this.drawTorso(ctx, p, J, A));
    push(6.5, (p) => this.drawCoatSkirt(ctx, p, J, A, 'front', opts.chains));
    push(7, (p) => this.drawHead(ctx, p, J, A, opts));
    push(7.5, (p) => this.drawChains(ctx, p, opts.chains, 'front', J, A));
    push(8, (p) => this.drawArm(ctx, p, J, A, 'F'));
    // Fixed depth order: far arm < far leg < torso < near leg < near arm. Attack animations do not
    // re-layer limbs: switching layers mid-move makes a limb "pop" over the body for a frame and
    // makes the far (left) limb read as the near (right) one.
    void layers;
    groups.sort((a, b) => a.z - b.z);
    for (const g of groups) {
      g.fn('outline');
      g.fn('fill');
    }
  }

  // --- limbs -----------------------------------------------------------------------------------
  drawArm(ctx, pass, J, A, side) {
    const lk = this.look, pr = this.pr, t = this.tint;
    const back = side === 'B';
    const depth = back ? 0.16 : 0;
    const S = J['shoulder' + side], E = J['elbow' + side], Wr = J['wrist' + side], H = J['hand' + side];
    const top = lk.top || {};
    const shortCut = top.sleeves === 'short';
    const fullSleeve = !shortCut && ['trench', 'jacket', 'longcoat', 'bodysuit', 'chefcoat', 'opencoat', 'onesie'].includes(top.type);
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
      // cuff
      const c0 = along(E, Wr, 0.8), c1 = along(E, Wr, 1.0);
      ctx.beginPath();
      limbPath(ctx, c0, c1, rf1 + 2.4, rf1 + 2.4);
      ctx.fillStyle = this.mat(darken(top.color2 || top.color, depth + 0.1), t).base;
      ctx.fill();
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
    this.drawFist(ctx, pass, Wr, H, side, depth);
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
      if (loose) {
        // fabric folds at the knee / cargo pocket
        this.line(ctx, [along(Hp, K, 0.9, rt1 + 2), along(Hp, K, 1.05, 0), along(K, An, 0.12, -(rs0 + 1))], 1.3, this.outline, 0.4);
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
    this.drawBelt(ctx, F);
    // global torso shading: lit front/top, shadow on the back with rim light
    ctx.beginPath();
    smoothClosed(ctx, pts, 0.55);
    this.shadeAcross(ctx, P2(F.W, F.fS, F.cw * 1.1, F.uS, 10), P2(F.W, F.fS, -F.cw * 1.05, F.uS, -6));
    ctx.restore();
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
        for (let i = 0; i < 3; i++) {
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
        // studs
        const st = P2(N, fC, cw * 0.4, uC, -up * 0.16);
        ctx.beginPath();
        ctx.arc(st.x, st.y, 2.4, 0, Math.PI * 2);
        ctx.fillStyle = '#cfcfd6';
        ctx.fill();
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
    const weasel = lk.species === 'weasel';
    const masked = !!lk.mask;
    // Back-of-head items (hat brim back half, collars) are drawn with the head.
    if (lk.hair?.style === 'pompadour' || lk.hair?.style === 'swept' || lk.hair?.style === 'spiky') this.drawHairBack(ctx, pass, R);
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
    const facePts = weasel
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
      ctx.ellipse(-0.06 * R, 0.08 * R, 0.98 * R, 1.04 * R, 0, 0, Math.PI * 2);
      smoothClosed(ctx, pts, weasel ? 0.5 : 0.45);
    };
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
    this.headShade(ctx, R);
    ctx.restore();
    this.drawEars(ctx, 'fill', R, weasel);
    if (masked) this.drawMask(ctx, R);
    else this.drawFace(ctx, R, opts, weasel);
    this.drawHair(ctx, R);
    if (lk.hat) this.drawHat(ctx, R);
    if (lk.hood?.bear) this.drawBearHood(ctx, R);
    ctx.restore();
    if (lk.headphones) this.drawHeadphones(ctx, J, A);
  }

  headShade(ctx, R) {
    // soft volumetric head shading: warm key light from the front-top, cool falloff, rim light behind
    const rim = this.look.rim || '#ff4fd8';
    const hg = ctx.createRadialGradient(0.55 * R, 0.45 * R, 0.05 * R, 0.25 * R, 0.1 * R, 1.55 * R);
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
    if (lk.mask) return;
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
    const hurt = opts.expression === 'hurt';
    const ex = weasel ? 0.66 * R : 0.6 * R, ey = weasel ? 0.3 * R : 0.17 * R;
    const ew = 0.27 * R;
    // eye socket shadow
    ctx.beginPath();
    ctx.ellipse(ex - 0.02 * R, ey + 0.02 * R, ew * 1.15, ew * 0.75, 0, 0, Math.PI * 2);
    ctx.fillStyle = rgba('#2a1440', 0.16);
    ctx.fill();
    const closed = lk.eyesClosed || opts.blink || hurt;
    if (closed) {
      this.line(ctx, [{ x: ex - ew, y: ey + 0.03 * R }, { x: ex, y: ey - 0.07 * R }, { x: ex + ew * 0.9, y: ey + 0.03 * R }], 2.6, outl);
      if (hurt) this.line(ctx, [{ x: ex - ew * 0.6, y: ey + 0.12 * R }, { x: ex + ew * 0.7, y: ey + 0.02 * R }], 1.6, outl);
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
      ctx.restore();
      // heavy upper lid
      ctx.beginPath();
      ctx.moveTo(ex - ew * 1.05, ey);
      ctx.quadraticCurveTo(ex - 0.05 * R, ey + 0.21 * R, ex + ew * 1.0, ey + 0.05 * R);
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = outl;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ex + 0.15 * R, ey + 0.08 * R, 0.03 * R, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
    // brows
    if (lk.brows !== 'none') {
      const th = lk.brows === 'thick' ? 0.16 * R : 0.1 * R;
      const inner = angry || lk.brows === 'thick' ? -0.12 * R : 0.02 * R;
      ctx.beginPath();
      smoothClosed(ctx, [
        { x: ex - 0.36 * R, y: ey + 0.28 * R }, { x: ex, y: ey + 0.36 * R }, { x: ex + 0.36 * R, y: ey + 0.26 * R + inner },
        { x: ex + 0.33 * R, y: ey + 0.26 * R + inner - th }, { x: ex, y: ey + 0.36 * R - th }, { x: ex - 0.36 * R, y: ey + 0.28 * R - th * 0.7 },
      ], 0.3);
      ctx.fillStyle = this.mat(lk.hair?.color || lk.beard?.color || '#222', t).base;
      ctx.fill();
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
    const mouth = hurt ? 'open' : lk.mouth;
    if (mouth === 'grin' || mouth === 'teeth' || mouth === 'snarl') {
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

  drawHat(ctx, R) {
    const hat = this.look.hat, t = this.tint;
    const c = this.mat(hat.color, t);
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
