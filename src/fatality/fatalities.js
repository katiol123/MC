// One fatality per fighter. Comic, not gory: everything is procedural like the rest of the game.
// Scripts are written once against the shared skeleton and work on every victim (see director.js).
//   d.A / d.V   attacker / victim        d.dir   +1 when the victim is to the attacker's right
//   d.fx(dx)    world x in front of the attacker's start      d.vx  victim's standing spot
//   d.keys(f, t, [[tick, pose], ...]) / d.pose(f, a, b, k)    poses (raw, from poses.js)
//   f.fx = { hidden, alpha, sx, sy, tint, tintColor, look, fire, prop, stars, clipFloor, noShadow }
import * as K from '../anim/poses.js';
import { ATTACK_POSES as AP } from '../anim/attackPoses.js';
import { ease, clamp } from '../core/math.js';
import { drawFlame, drawGlow } from '../render/fire.js';
import { rgba, darken, lighten } from '../render/color.js';

import { VIEW } from '../config/constants.js';

const P = K.P;
const VIEW_W = VIEW.width;
const OUT = '#140c10';
const TAU = Math.PI * 2;

// --- shared poses -----------------------------------------------------------------------------
const STAND = K.STANCE;
const HOLD_UP = P(STAND, { y: 120, lean: -10, chest: -12, fa: [172, 40, 0], ba: [170, 46, 0], ff: [30, 8, 0], bf: [-34, 8, 0] });
const LIMP_AIR = P(K.AIR_TUMBLE, { neck: -20, head: -18, fa: [150, 30, 0], ba: [170, 25, 0], fl: [30, 20, 0], bl: [10, 15, 0] });
const FLAIL_A = P(K.AIR_HIT, { fa: [150, 60, 0], ba: [40, 90, 0], fl: [70, 90, 0], bl: [10, 40, 0] });
const FLAIL_B = P(K.AIR_HIT, { fa: [40, 90, 0], ba: [160, 50, 0], fl: [20, 40, 0], bl: [75, 95, 0] });
const LOOK_UP = P(STAND, { y: 110, lean: -16, chest: -10, neck: -24, head: -30, fa: [20, 30, 0], ba: [14, 30, 0], ff: [22, 8, 0], bf: [-24, 8, 0] });
const SHRUG = P(STAND, { y: 116, lean: -2, fa: [60, 140, 0], ba: [62, 140, 0], ff: [20, 8, 0], bf: [-22, 8, 0] });
const FLEX = K.VICTORY[3];
const BOW = K.VICTORY[2];
const ARMS_CROSSED = K.VICTORY[1];
const FIST_UP = K.VICTORY[0];
const daze = (d, f, t) => d.pose(f, K.DIZZY[0], K.DIZZY[1], 0.5 - 0.5 * Math.cos((t / 34) * TAU));
const wobble = (t, a = 1) => Math.sin(t * 0.5) * a;
const flail = (d, f, t, speed = 0.35) => d.pose(f, FLAIL_A, FLAIL_B, 0.5 + 0.5 * Math.sin(t * speed));
/** Upside-down flailing (raw pose for d.pose). */
const flailPose = (t) => spin(Math.sin(t * 0.5) > 0 ? FLAIL_A : FLAIL_B, 180);

/** Rotation of a whole airborne body, in degrees, around its pelvis. */
function spin(raw, deg) {
  const p = P(raw);
  p.rot = (p.rot || 0) + deg;
  return p;
}

// --- shared drawing helpers (screen space) -----------------------------------------------------
const S = (cam, x, y) => cam.toScreen(x, y);
function ink(ctx, fill, w = 3) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = w;
  ctx.strokeStyle = OUT;
  ctx.stroke();
}
function star(ctx, x, y, r, k, color = '#fff6c8') {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(k * 2);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU, rr = i % 2 ? r * 0.25 : r;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}
function bubbleText(ctx, text, x, y, size, color, a = 1, rot = -0.08) {
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.font = `900 ${Math.round(size)}px "Arial Black", Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.lineWidth = Math.max(3, size / 6);
  ctx.strokeStyle = OUT;
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}
const T = (d, alpha) => Math.max(0, d.t - 1 + alpha);

// ================================================================================================
export const FATALITIES = {
  // --- CHEF BRUNO: Bon Appétit -----------------------------------------------------------------
  bruno: {
    name: 'BON APPÉTIT',
    duration: 270,
    run(d, t) {
      const { A, V, s } = d;
      const potX = d.fx(-130);
      s.potX = potX;
      s.potY = d.num(t, [[0, 700], [26, 0, ease.inQuad], [32, 14], [38, 0]]);
      if (t === 26) { d.sfx('clang'); d.fxEvent('shake', { amount: 10 }); d.fxEvent('dust', { x: potX, y: 4, n: 16, spread: 70 }); }
      // Bruno: look up at the pot, grab, lift, flip the victim over his head into the pot
      d.keys(A, t, [[0, STAND], [24, P(LOOK_UP, { fa: [60, 120, 0], ba: [60, 120, 0] })], [40, STAND], [52, AP.grab.contact], [70, HOLD_UP],
        [92, P(HOLD_UP, { lean: -24, chest: -20, fa: [200, 30, 0], ba: [196, 34, 0] })], [104, STAND],
        [120, AP.panSwing.windup], [128, AP.panSwing.contact], [140, AP.panSwing.windup], [148, AP.panSwing.contact], [170, STAND],
        [196, P(STAND, { fa: [150, 150, 0], neck: 10, head: 14 })], [214, P(STAND, { fa: [100, 20, 0], head: -10 })], [240, ARMS_CROSSED]]);
      A.fx.prop = t >= 112 && t < 176 ? { type: 'pan', hand: 'F' } : null;
      if (t === 128 || t === 148) { d.sfx('clang'); d.fxEvent('sparks', { x: potX, y: 132, n: 10, color: '#ffe08a' }); }
      if (t === 214) { d.sfx('kiss'); d.fxEvent('label', { text: 'MAGNIFIQUE!', x: d.ax, y: 300, color: '#ffd23f', life: 70 }); }
      // victim: dazed, grabbed, carried overhead, tossed in an arc, sinks into the pot
      if (t < 52) { d.at(V, d.vx); daze(d, V, t); }
      else if (t < 70) { const k = d.span(t, 52, 70); d.at(V, d.vx + (d.fx(10) - d.vx) * k, 150 * k); d.pose(V, K.HIT_HIGH, spin(LIMP_AIR, 90), k); }
      else if (t < 92) { d.at(V, d.fx(10 - 40 * d.span(t, 70, 92)), 150 + 30 * d.span(t, 70, 92)); d.pose(V, spin(LIMP_AIR, 90 + 60 * d.span(t, 70, 92))); }
      else if (t < 118) {
        const k = d.span(t, 92, 118, ease.linear);
        d.at(V, d.fx(-30) + (potX - d.fx(-30)) * k, 150 + 70 * Math.sin(k * Math.PI) - 70 * k);
        d.pose(V, spin(LIMP_AIR, 150 + 40 * k)); // head-first dive into the stew
      } else { d.at(V, potX, d.num(t, [[118, 80], [130, -60]])); d.pose(V, spin(LIMP_AIR, 190)); }
      // after the toss Bruno turns to his pot
      A.facing = t >= 100 ? -d.dir : d.dir;
      if (t === 120) { d.sfx('splash'); d.fxEvent('drops', { x: potX, y: 120, n: 22, color: '#ffb066' }); }
      V.fx.hidden = t >= 130;
      V.fx.noShadow = t >= 92;
      V.fx.clipFloor = t >= 110; // whatever is inside the pot must not poke out under it
      s.lidY = d.num(t, [[0, 900], [124, 900], [136, 0, ease.inQuad], [140, 8], [144, 0]]);
      if (t === 136) d.sfx('clang');
      s.rattle = t > 150 && t < 236 ? Math.sin(t * 1.3) * 3 : 0;
      if (t > 150 && t % 6 === 0) d.fxEvent('smoke', { x: potX, y: 150, n: 2, spread: 40 });
      if (t === 160) d.sfx('steam');
      if (t === 228) { d.sfx('boing'); d.fxEvent('prop', { prop: 'boot', x: potX, y: 160, dir: -d.dir, vx: 3, vy: 12, spin: 0.3, look: V.def.look }); }
      d.order = [d.who, 1 - d.who];
    },
    draw(ctx, d, cam, layer) {
      const { s } = d;
      if (s.potX === undefined) return;
      const z = cam.zoom, c = S(cam, s.potX + s.rattle, s.potY);
      const w = 92 * z, h = 120 * z;
      if (layer === 'back') {
        // inside of the pot: dark rim + bubbling stew
        ctx.beginPath();
        ctx.ellipse(c.x, c.y - h, w, 18 * z, 0, 0, TAU);
        ink(ctx, '#2a1e22');
        ctx.beginPath();
        ctx.ellipse(c.x, c.y - h + 4 * z, w * 0.86, 13 * z, 0, 0, TAU);
        ctx.fillStyle = '#d07a2a';
        ctx.fill();
        return;
      }
      // pot body (front of the fighters)
      ctx.beginPath();
      ctx.moveTo(c.x - w, c.y - h);
      ctx.lineTo(c.x - w * 0.92, c.y - 10 * z);
      ctx.quadraticCurveTo(c.x, c.y + 8 * z, c.x + w * 0.92, c.y - 10 * z);
      ctx.lineTo(c.x + w, c.y - h);
      ctx.quadraticCurveTo(c.x, c.y - h + 20 * z, c.x - w, c.y - h);
      ink(ctx, '#5a5d68', 3.5);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(c.x - w * 0.7, c.y - h + 14 * z, 12 * z, h - 34 * z);
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(c.x + sx * (w + 8 * z), c.y - h + 26 * z, 12 * z, 8 * z, 0, 0, TAU);
        ctx.lineWidth = 6 * z;
        ctx.strokeStyle = OUT;
        ctx.stroke();
      }
      // lid
      if (s.lidY < 800) {
        const l = S(cam, s.potX + s.rattle, s.potY + 120 + s.lidY + Math.abs(s.rattle) * 2);
        ctx.beginPath();
        ctx.ellipse(l.x, l.y, w * 1.02, 16 * z, 0, Math.PI, TAU);
        ctx.lineTo(l.x + w * 1.02, l.y + 4 * z);
        ctx.lineTo(l.x - w * 1.02, l.y + 4 * z);
        ink(ctx, '#6c707c');
        ctx.beginPath();
        ctx.ellipse(l.x, l.y - 16 * z, 14 * z, 7 * z, 0, 0, TAU);
        ink(ctx, '#2a2630');
      }
    },
  },

  // --- CINDER: Well Done -------------------------------------------------------------------------
  cinder: {
    name: 'WELL DONE',
    duration: 260,
    run(d, t) {
      const { A, V, s } = d;
      d.keys(A, t, [[0, STAND], [24, FLEX], [44, FLEX], [52, P(STAND, { y: 96, lean: 24, fa: [70, 100, 0], ba: [-30, 30, 0], ff: [40, 8, 0], bf: [-40, 8, 0] })],
        [120, P(STAND, { y: 104, lean: 12, fa: [120, 30, 0], ba: [110, 40, 0] })], [150, STAND], [180, P(STAND, { fa: [140, 150, 0], head: 10, neck: 8 })], [230, ARMS_CROSSED]]);
      A.fx.fire = t > 10 && t < 140;
      if (t === 52) { d.sfx('fire'); d.fxEvent('shake', { amount: 12 }); }
      s.pillar = d.num(t, [[0, 0], [52, 0], [62, 1, ease.outQuad], [112, 1], [128, 0]]);
      if (t > 52 && t < 120 && t % 3 === 0) d.fxEvent('embers', { x: d.vx, y: 40, n: 3, spread: 70, h: 200 });
      // victim: dazed, lifted and flailing in the flames, charred, eyes blink, crumbles to ash
      V.fx.tintColor = '#1a0f0f';
      V.fx.tint = d.num(t, [[0, 0], [60, 0], [110, 1]]);
      if (t < 56) { d.at(V, d.vx); daze(d, V, t); }
      else if (t < 116) { d.at(V, d.vx, 30 + 10 * Math.sin(t * 0.3)); flail(d, V, t, 0.6); }
      else if (t < 128) { d.at(V, d.vx, d.num(t, [[116, 30], [128, 0]])); d.pose(V, STAND); }
      else d.pose(V, P(STAND, { y: 110, neck: -4, head: -6, fa: [10, 10, 0], ba: [8, 10, 0] }));
      if (t > 116 && t % 7 === 0 && t < 190) d.fxEvent('smoke', { x: d.vx, y: 230, n: 1, spread: 20 });
      s.blink = t > 140 && t < 178 && !(t > 158 && t < 163);
      s.eye = d.joint(V, 'head');
      // crumble from the top down
      const crumble = d.span(t, 180, 220);
      V.fx.sy = 1 - 0.85 * crumble;
      V.fx.alpha = 1 - crumble;
      if (t === 180) d.sfx('crumble');
      if (t >= 180 && t < 220 && t % 3 === 0) d.fxEvent('dust', { x: d.vx, y: 10 + 150 * (1 - crumble), n: 3, spread: 30 });
      s.ash = d.span(t, 184, 226);
      if (t === 236) d.fxEvent('label', { text: 'TOAST.', x: d.vx, y: 140, color: '#ff9a30' });
    },
    draw(ctx, d, cam, layer, alpha, now) {
      const { s } = d;
      const z = cam.zoom, tt = now / 1000;
      if (layer === 'back' && s.pillar > 0) {
        const base = S(cam, d.vx, 0);
        const H = 420 * s.pillar * z;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, base.x, base.y - H / 2, H * 0.6, 0.55 * s.pillar);
        ctx.restore();
        for (let i = 0; i < 9; i++) drawFlame(ctx, base.x + (i - 4) * 14 * z, base.y, 22 * z * s.pillar, H * (0.6 + 0.4 * Math.sin(i * 1.7 + tt * 3)), tt, i, -1);
      }
      if (layer === 'front') {
        if (s.pillar > 0.05) {
          const base = S(cam, d.vx, 0);
          for (let i = 0; i < 5; i++) drawFlame(ctx, base.x + (i - 2) * 22 * z, base.y, 16 * z * s.pillar, 160 * z * s.pillar * (0.7 + 0.3 * Math.sin(i * 2 + tt * 4)), tt, i + 9, -1);
        }
        if (s.blink && s.eye) {
          const e = S(cam, s.eye.x, s.eye.y);
          ctx.fillStyle = '#ffffff';
          for (const ox of [4, 13]) { ctx.beginPath(); ctx.ellipse(e.x - d.dir * -ox * z * 0.6 + d.dir * 4 * z, e.y + 2 * z, 3 * z, 4 * z, 0, 0, TAU); ctx.fill(); }
        }
        if (s.ash > 0) {
          const b = S(cam, d.vx, 0);
          ctx.beginPath();
          ctx.ellipse(b.x, b.y, 48 * z * s.ash, 16 * z * s.ash, 0, Math.PI, TAU);
          ink(ctx, '#4a4448', 2);
          ctx.fillStyle = 'rgba(255,140,40,0.5)';
          for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(b.x + (i - 1.5) * 14 * z, b.y - 6 * z, 2.2 * z, 0, TAU); ctx.fill(); }
        }
      }
    },
  },

  // --- OLD HAWK: Gone Fishing -------------------------------------------------------------------
  hawk: {
    name: 'GONE FISHING',
    duration: 270,
    run(d, t) {
      const { A, V, s } = d;
      const swing = P(STAND, { y: 114, lean: -8, chest: -8, fa: [178, 10, 0], ba: [40, 110, 0], ff: [26, 8, 0], bf: [-28, 8, 0] });
      d.keys(A, t, [[0, STAND], [14, AP.lunge.windup], [22, AP.lunge.contact], [40, P(STAND, { fa: [120, 60, 0] })], [56, swing], [160, swing],
        [170, P(swing, { lean: 14, fa: [120, 10, 0] })], [196, P(STAND, { fa: [150, 140, 0], neck: -14, head: -24, lean: -6 })], [236, P(STAND, { fa: [150, 140, 0], neck: -14, head: -24 })], [260, BOW]]);
      if (t === 22) d.sfx('whoosh');
      // line from the hand to the victim (drawn while it is taut)
      s.line = t >= 18 && t < 172;
      s.hand = d.joint(A, 'handF');
      const hx = s.hand.x, hy = s.hand.y;
      if (t < 30) { d.at(V, d.vx); daze(d, V, t); }
      else if (t < 56) {
        const k = d.span(t, 30, 56);
        d.at(V, d.vx + (hx - d.dir * 60 - d.vx) * k, 180 * k);
        d.pose(V, K.HIT_HIGH, spin(FLAIL_A, 60), k);
      } else if (t < 170) {
        // whirled overhead on the line, faster and faster
        const k = d.span(t, 56, 170, ease.inQuad);
        const ang = 2.6 * TAU * k;
        const R = 130 * V.props.posScale;
        d.at(V, hx + Math.cos(ang) * R * d.dir, hy - 100 + Math.sin(ang) * R * 0.5);
        d.pose(V, spin(FLAIL_A, -ang * 57.3 * d.dir), spin(FLAIL_B, -ang * 57.3 * d.dir), 0.5 + 0.5 * Math.sin(t * 0.5));
        if (Math.floor(ang / TAU) !== Math.floor((ang - 0.4) / TAU)) d.sfx('whoosh');
      } else {
        // released: flies over the horizon, getting smaller
        const k = d.span(t, 170, 214, ease.outQuad);
        d.at(V, V.body.x + d.dir * 16 * (1 - k * 0.6), V.body.y + 14 * (1 - k * 0.5));
        V.fx.sx = V.fx.sy = 1 - 0.85 * k;
        d.pose(V, spin(LIMP_AIR, t * 20));
      }
      if (t === 170) { s.relX = V.body.x; d.sfx('whoosh'); }
      V.fx.noShadow = t > 40;
      V.fx.hidden = t >= 214;
      if (t === 214) { s.twinkle = { x: V.body.x, y: V.body.y + 60, t }; d.sfx('ding'); }
    },
    draw(ctx, d, cam, layer, alpha) {
      const { s, V } = d;
      if (layer !== 'front') return;
      const z = cam.zoom;
      if (s.line && s.hand) {
        const a = S(cam, s.hand.x, s.hand.y), b = S(cam, V.body.x, V.body.y + 130 * V.props.posScale);
        for (const [w, c] of [[6, OUT], [3, '#3fe6d0'], [1.2, '#e8fffb']]) {
          ctx.strokeStyle = c;
          ctx.lineWidth = w * z;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      if (s.twinkle) {
        const k = (d.t - s.twinkle.t + alpha) / 40;
        if (k < 1.4) {
          const p = S(cam, s.twinkle.x, Math.min(s.twinkle.y, 600));
          const size = 34 * z * Math.min(1, k * 4) * (k > 1 ? Math.max(0, 1 - (k - 1) / 0.4) : 1);
          star(ctx, clamp(p.x, 90, 1190), Math.max(70, p.y), size + 3, k);
        }
      }
    },
  },

  // --- GRIZZ: Hibernation -----------------------------------------------------------------------
  grizz: {
    name: 'HIBERNATION',
    duration: 290,
    run(d, t) {
      const { A, V, s } = d;
      const open = P(STAND, { y: 116, lean: -4, fa: [110, 10, 0], ba: [104, 14, 0] });
      const hug = P(STAND, { y: 112, lean: 8, chest: 6, fa: [84, 110, 0], ba: [80, 116, 0], ff: [30, 8, 0], bf: [-32, 8, 0] });
      const shh = P(STAND, { y: 116, lean: 6, neck: 6, head: 6, fa: [120, 160, 0], ff: [18, 8, 0], bf: [-20, 8, 0] });
      d.keys(A, t, [[0, STAND], [20, open], [40, open], [52, hug], [110, hug], [126, P(STAND, { y: 80, lean: 40, fa: [60, 20, 0], ba: [56, 24, 0], ff: [34, 8, 0], bf: [-30, 8, 0] })],
        [150, STAND], [170, shh], [230, shh], [250, P(STAND, { fa: [100, 140, 0] })], [280, FLEX]]);
      // victim is hugged (lifted, squeezed), goes limp, laid down and tucked in
      if (t < 52) { d.at(V, d.vx + (d.fx(d.gap - 18) - d.vx) * d.span(t, 30, 52)); daze(d, V, t); }
      else if (t < 112) {
        d.at(V, d.fx(d.gap - 18), 14 + 4 * Math.sin(t * 0.4));
        d.pose(V, P(K.HIT_HIGH, { fa: [150, 60, 0], ba: [160, 40, 0] }), P(K.DIZZY[0], { neck: -30, head: -30, fa: [10, 10, 0], ba: [6, 10, 0] }), d.span(t, 60, 104));
        V.fx.sx = 1 - 0.1 * Math.abs(Math.sin(t * 0.25));
        if (t % 16 === 0) d.sfx('squeeze');
      } else if (t < 140) {
        const k = d.span(t, 112, 140);
        d.at(V, d.fx(d.gap - 10), 14 * (1 - k));
        V.fx.sx = 1;
        d.pose(V, P(K.DIZZY[0], { neck: -30, head: -30 }), K.LYING, k);
      } else { d.at(V, d.fx(d.gap - 10)); d.pose(V, P(K.LYING, { neck: -6, head: -4, fa: [30, 40, 0], ba: [40, 40, 0] })); }
      if (t === 60) d.fxEvent('label', { text: '♥', x: d.fx(d.gap / 2), y: 260, color: '#ff4fd8', life: 50 });
      s.blanket = d.span(t, 150, 178, ease.outQuad);
      s.vx = V.body.x;
      if (t === 178) d.sfx('pop');
      if (t >= 190 && (t - 190) % 34 === 0) d.sfx('snore');
      s.zzz = t >= 186 ? t - 186 : -1;
      if (t === 254) d.fxEvent('label', { text: 'SWEET DREAMS', x: d.vx, y: 200, color: '#3fe6d0', life: 60 });
    },
    draw(ctx, d, cam, layer, alpha, now) {
      const { s } = d;
      if (layer !== 'front' || !s.blanket) return;
      const z = cam.zoom, dir = d.dir;
      const drop = (1 - s.blanket) * 160;
      const c = S(cam, s.vx - dir * 14, 26 + drop);
      const w = 92 * z, h = 30 * z;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate((1 - s.blanket) * 0.4);
      ctx.beginPath();
      ctx.moveTo(-w, h * 0.3);
      ctx.quadraticCurveTo(-w * 0.9, -h * 1.2, 0, -h);
      ctx.quadraticCurveTo(w * 0.9, -h * 1.1, w, h * 0.3);
      ctx.closePath();
      ink(ctx, '#d4318f');
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = 'rgba(63,210,194,0.8)';
      ctx.lineWidth = 5 * z;
      for (let i = -4; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(i * 22 * z, -h * 1.4); ctx.lineTo(i * 22 * z + 6 * z, h); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      for (let j = 0; j < 2; j++) { ctx.beginPath(); ctx.moveTo(-w, -h * 0.4 + j * 16 * z); ctx.lineTo(w, -h * 0.4 + j * 16 * z); ctx.stroke(); }
      ctx.restore();
      ctx.restore();
      // pillow under the head
      const pl = S(cam, s.vx + dir * 62, 18 + drop);
      ctx.beginPath();
      ctx.ellipse(pl.x, pl.y, 26 * z, 12 * z, 0, 0, TAU);
      ink(ctx, '#f4f1ea', 2.5);
      if (s.zzz >= 0) {
        const tt = s.zzz + alpha;
        for (let i = 0; i < 3; i++) {
          const k = ((tt / 60 + i / 3) % 1);
          const p = S(cam, s.vx + dir * (70 + k * 30), 60 + k * 140);
          bubbleText(ctx, 'Z', p.x + Math.sin(k * 6) * 8 * z, p.y, (16 + 18 * k) * z, '#e8f6ff', 1 - k);
        }
      }
    },
  },

  // --- TAO: One Inch -----------------------------------------------------------------------------
  tao: {
    name: 'ONE INCH',
    duration: 250,
    run(d, t) {
      const { A, V, s } = d;
      const touch = P(STAND, { x: 6, y: 106, lean: 10, chest: 6, fa: [98, 8, 0], ba: [30, 140, 10], ff: [34, 8, 0], bf: [-32, 8, 0] });
      const drive = P(touch, { x: 12, lean: 18, chest: 14, fa: [100, 2, 0] });
      d.keys(A, t, [[0, STAND], [20, BOW], [56, BOW], [76, STAND], [96, touch], [118, touch], [122, drive], [170, drive], [196, STAND], [226, BOW]]);
      d.camZoom = d.num(t, [[0, 1.34], [96, 1.5], [118, 1.6], [124, 1.3]]);
      if (t === 106) d.sfx('heartbeat');
      if (t === 114) d.sfx('heartbeat');
      if (t === 122) {
        d.sfx('boom');
        d.fxEvent('flash', { amount: 0.7 });
        d.fxEvent('shake', { amount: 16 });
        for (let i = 0; i < 4; i++) d.fxEvent('ring', { x: d.vx - d.dir * 20, y: 140, r: 10 + i * 12, vr: 10 + i * 3, life: 24, color: i % 2 ? '#ffd23f' : '#ffffff' });
      }
      if (t < 122) { d.at(V, d.vx); if (t < 96) daze(d, V, t); else d.pose(V, P(STAND, { y: 112, neck: -6, head: -10, fa: [20, 20, 0], ba: [16, 20, 0] })); }
      else {
        // launched: a blur across the screen and gone
        const k = t - 122;
        d.at(V, d.vx + d.dir * k * 34, Math.min(60, k * 6));
        d.pose(V, spin(K.AIR_HIT, -k * 18 * d.dir));
        if (k % 2 === 0 && k < 30) d.fxEvent('dust', { x: V.body.x - d.dir * 40, y: 4, n: 2, spread: 10 });
      }
      V.fx.hidden = t > 160;
      if (t === 150) { d.sfx('crash'); d.fxEvent('label', { text: 'CRASH!', x: d.fx(d.gap + 330), y: 240, color: '#ffffff', life: 60 }); d.fxEvent('dust', { x: d.fx(d.gap + 420), y: 4, n: 20, spread: 60 }); }
      s.leaf = t >= 170 ? t - 170 : -1;
    },
    draw(ctx, d, cam, layer, alpha) {
      const { s } = d;
      if (layer !== 'front' || s.leaf < 0) return;
      const tt = s.leaf + alpha, z = cam.zoom;
      const p = S(cam, d.fx(d.gap * 0.5) + Math.sin(tt * 0.08) * 40, Math.max(6, 330 - tt * 4));
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.sin(tt * 0.08) * 0.8 + (p.y > S(cam, 0, 10).y - 2 ? 0 : 0));
      ctx.beginPath();
      ctx.ellipse(0, 0, 13 * z, 6 * z, 0, 0, TAU);
      ink(ctx, '#7aa83a', 2);
      ctx.beginPath(); ctx.moveTo(-13 * z, 0); ctx.lineTo(13 * z, 0); ctx.strokeStyle = 'rgba(20,12,16,0.6)'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.restore();
    },
  },

  // --- SIR RATTIGAN: Pickpocket -----------------------------------------------------------------
  rattigan: {
    name: 'PICKPOCKET',
    duration: 280,
    run(d, t) {
      const { A, V, s } = d;
      const behind = d.fx(d.gap * 2 + 10);
      const show = P(STAND, { y: 118, lean: -4, fa: [150, 60, 0], ba: [40, 120, 0] });
      const count = P(STAND, { y: 116, fa: [80, 110, 0], ba: [70, 120, 0], neck: 10, head: 16 });
      // zip behind the victim and back, twice
      const pos = [[0, d.ax], [20, d.ax], [21, behind], [44, behind], [45, d.ax], [60, d.ax], [61, behind], [80, behind], [81, d.ax]];
      let x = d.ax;
      for (const [tt, px] of pos) if (t >= tt) x = px;
      d.at(A, x);
      A.facing = x === behind ? -d.dir : d.dir;
      for (const tt of [21, 45, 61, 81]) if (t === tt) { d.sfx('zap'); d.fxEvent('sparks', { x: x, y: 130, n: 14, color: '#c27bff' }); }
      d.keys(A, t, [[0, STAND], [16, AP.flick.windup], [20, STAND], [30, AP.grab.contact], [44, STAND], [64, AP.grab.contact], [80, STAND], [96, show], [130, show], [150, count], [250, count], [270, FIST_UP]]);
      s.wallet = t >= 92;
      s.hand = d.joint(A, 'handF');
      if (t === 100) { d.sfx('cash'); d.fxEvent('label', { text: 'LOOKING FOR THIS?', x: d.ax, y: 300, color: '#ff3fd0', life: 70 }); }
      if (t > 150 && t < 250 && t % 14 === 0) { d.sfx('cash'); d.fxEvent('prop', { prop: 'bill', x: s.hand.x, y: s.hand.y, dir: d.dir, vx: 1.5, vy: 6, spin: 0.2 }); }
      // victim: spins around confused; the trousers drop; covers up and waddles away
      V.fx.look = t >= 112 ? { pants: { type: 'shorts', color: '#f4eef8' } } : null;
      s.pants = t >= 112 ? V.def.look.pants?.color || '#333' : null;
      if (t < 112) {
        d.at(V, d.vx);
        V.facing = (t > 22 && t < 46) || (t > 62 && t < 82) ? d.dir : -d.dir;
        daze(d, V, t);
      } else if (t < 160) {
        V.facing = -d.dir;
        d.pose(V, P(STAND, { y: 104, lean: 22, chest: 10, neck: -10, head: -14, fa: [6, 150, 0], ba: [4, 150, 0], ff: [8, 8, 0], bf: [-8, 8, 0] }));
        if (t === 116) { d.sfx('boing'); d.fxEvent('label', { text: '!', x: d.vx, y: 270, color: '#ffffff', life: 30 }); }
      } else {
        // waddle away (tiny steps, knees together), leaving the trousers on the floor
        V.facing = d.dir;
        const k = t - 160;
        d.at(V, d.vx + d.dir * k * 4.2);
        const step = Math.sin(k * 0.6);
        d.pose(V, P(STAND, { y: 104 + Math.abs(step) * 3, lean: 18, neck: -8, head: -10, fa: [6, 150, 0], ba: [4, 150, 0], ff: [8 + step * 8, 8, 0], bf: [-8 - step * 8, 8, 0] }));
      }
      s.pantsX = d.vx;
    },
    draw(ctx, d, cam, layer) {
      const { s } = d;
      if (layer !== 'front') return;
      const z = cam.zoom;
      if (s.pants) {
        // crumpled trousers left on the floor
        const p = S(cam, s.pantsX, 0);
        ctx.beginPath();
        ctx.moveTo(p.x - 34 * z, p.y);
        ctx.quadraticCurveTo(p.x - 30 * z, p.y - 22 * z, p.x - 6 * z, p.y - 14 * z);
        ctx.quadraticCurveTo(p.x + 10 * z, p.y - 26 * z, p.x + 34 * z, p.y - 6 * z);
        ctx.lineTo(p.x + 30 * z, p.y);
        ctx.closePath();
        ink(ctx, s.pants, 2.5);
      }
      if (s.wallet && s.hand) {
        const h = S(cam, s.hand.x, s.hand.y + 10);
        ctx.save();
        ctx.translate(h.x, h.y);
        ctx.rotate(-0.2);
        ctx.beginPath();
        ctx.rect(-14 * z, -10 * z, 28 * z, 20 * z);
        ink(ctx, '#6a3e22', 2.5);
        ctx.fillStyle = '#7fd36a';
        ctx.fillRect(-10 * z, -16 * z, 18 * z, 7 * z);
        ctx.restore();
      }
    },
  },

  // --- OZ JAGUAR: Skyfall -----------------------------------------------------------------------
  jaguar: {
    name: 'SKYFALL',
    duration: 260,
    run(d, t) {
      const { A, V, s } = d;
      const top = P(STAND, { y: 120, lean: -6, fa: [178, 20, 0], ba: [40, 110, 0] });
      if (t < 30) { d.at(A, d.ax); d.keys(A, t, [[0, STAND], [20, K.PREJUMP], [30, K.AIR_RISE]]); }
      else if (t < 50) { d.at(A, d.ax, (t - 30) * 40); d.pose(A, K.AIR_RISE); }
      else if (t < 110) { d.at(A, d.vx, 1600); d.pose(A, AP.pounce?.contact || K.AIR_FALL); }
      else if (t < 122) { const k = d.span(t, 110, 122, ease.inQuad); d.at(A, d.vx, 1400 * (1 - k) + 30); d.pose(A, spin(AP.pounce?.contact || K.AIR_FALL, 60 * d.dir)); }
      else if (t < 200) { d.at(A, d.vx, 22); d.keys(A, t, [[122, K.LAND], [150, top], [200, top]]); }
      else { const k = d.span(t, 200, 222); d.at(A, d.vx - d.dir * 90 * k, 22 * (1 - k) + 40 * Math.sin(k * Math.PI)); d.keys(A, t, [[200, K.AIR_RISE], [222, K.LAND], [250, FLEX]]); }
      if (t === 20) d.sfx('whoosh');
      A.fx.noShadow = t > 34 && t < 118;
      // the shadow on the floor grows while he is up there
      s.shadow = t > 60 && t < 122 ? d.span(t, 60, 120, ease.inQuad) : 0;
      if (t < 122) {
        d.at(V, d.vx);
        if (t < 60) daze(d, V, t);
        else d.pose(V, LOOK_UP, P(LOOK_UP, { head: -40, neck: -30 }), d.span(t, 60, 100));
        if (t === 96) d.fxEvent('label', { text: '?', x: d.vx, y: 290, color: '#ffffff', life: 30 });
      } else {
        // pancake
        d.at(V, d.vx);
        d.pose(V, STAND);
        V.fx.sy = 0.12;
        V.fx.sx = 1.5;
      }
      if (t === 122) { d.sfx('boom'); d.fxEvent('shake', { amount: 18 }); d.fxEvent('dust', { x: d.vx, y: 4, n: 34, spread: 120 }); }
      if (t === 160) { d.sfx('pop'); d.fxEvent('label', { text: 'FLAT.', x: d.vx, y: 120, color: '#ffd23f', life: 60 }); }
    },
    draw(ctx, d, cam, layer) {
      const { s } = d;
      if (layer !== 'back' || !s.shadow) return;
      const p = S(cam, d.vx, 0), z = cam.zoom;
      ctx.fillStyle = `rgba(4,0,10,${0.25 + 0.45 * s.shadow})`;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 2, (20 + 90 * s.shadow) * z, (5 + 14 * s.shadow) * z, 0, 0, TAU);
      ctx.fill();
    },
  },

  // --- BRICK: Giant Swing -----------------------------------------------------------------------
  brick: {
    name: 'GIANT SWING',
    duration: 270,
    run(d, t) {
      const { A, V, s } = d;
      const heave = P(STAND, { y: 104, lean: -16, chest: -10, fa: [96, 10, 0], ba: [92, 14, 0], ff: [34, 8, 0], bf: [-34, 8, 0] });
      d.keys(A, t, [[0, STAND], [20, FLEX], [36, FLEX], [52, AP.grab.contact], [64, heave], [150, heave], [160, P(heave, { lean: 10, fa: [130, 10, 0] })], [190, STAND], [230, FLEX]]);
      if (t === 24) d.fxEvent('label', { text: 'HUP!', x: d.ax, y: 280, color: '#ffd23f', life: 40 });
      if (t < 52) { d.at(V, d.vx); daze(d, V, t); V.fx.sx = V.fx.sy = 1; }
      else if (t < 64) { const k = d.span(t, 52, 64); d.at(V, d.vx, 40 * k); d.pose(V, K.HIT_HIGH, spin(FLAIL_A, 90), k); }
      else if (t < 156) {
        // giant swing: the victim circles around Brick (depth by scale), Brick spins with it
        const k = d.span(t, 64, 156, ease.inQuad);
        const ang = 3 * TAU * k;
        const R = 120;
        const depth = Math.sin(ang);
        d.at(V, d.ax + Math.cos(ang) * R * d.dir, 90 + 10 * depth);
        V.fx.sx = V.fx.sy = 1 - 0.18 * depth;
        d.order = depth > 0 ? [1 - d.who, d.who] : [d.who, 1 - d.who];
        A.facing = Math.cos(ang) >= 0 ? d.dir : -d.dir;
        V.facing = -A.facing;
        d.pose(V, spin(FLAIL_A, 90), spin(FLAIL_B, 90), 0.5 + 0.5 * Math.sin(t * 0.5));
        if (Math.floor(ang / Math.PI) !== Math.floor((ang - 0.25) / Math.PI)) d.sfx('whoosh');
      } else if (t < 196) {
        // thrown into the containers in the background
        A.facing = d.dir;
        const k = d.span(t, 156, 196, ease.outQuad);
        d.at(V, d.ax + d.dir * (120 + 260 * k), 90 + 160 * Math.sin(k * Math.PI * 0.8));
        V.fx.sx = V.fx.sy = 1 - 0.62 * k;
        d.pose(V, spin(FLAIL_A, 90 + 400 * k));
        d.order = [1 - d.who, d.who];
      } else {
        // splat on the container wall, then slide down out of sight
        const k = d.span(t, 200, 250, ease.inQuad);
        d.at(V, d.ax + d.dir * 380, 190 - 160 * k);
        V.fx.sx = V.fx.sy = 0.38;
        d.pose(V, P(STAND, { fa: [160, 10, 0], ba: [170, 10, 0], ff: [30, 30, 0], bf: [-30, 30, 0] }));
        V.fx.alpha = 1 - d.span(t, 236, 252);
      }
      V.fx.noShadow = t > 60;
      if (t === 196) { d.sfx('clang'); d.fxEvent('shake', { amount: 10 }); d.fxEvent('label', { text: 'BONG!', x: d.ax + d.dir * 380, y: 330, color: '#ffffff', life: 50 }); }
    },
  },

  // --- SMILES: Keepy-Uppy ------------------------------------------------------------------------
  smiles: {
    name: 'KEEPY-UPPY',
    duration: 290,
    run(d, t) {
      const { A, V, s } = d;
      const kick = AP.frontKick.contact, ready = STAND;
      const laugh = P(STAND, { y: 114, lean: -18, chest: -14, neck: -20, head: -26, fa: [40, 130, 0], ba: [30, 130, 0] });
      // kicks at 30, 70, 110, 150 (each higher), bicycle kick at 196
      const kicks = [30, 70, 110, 150];
      let pose = ready;
      for (const kt of kicks) if (t >= kt - 8 && t < kt + 10) pose = t < kt ? AP.frontKick.windup : kick;
      if (t >= 186 && t < 212) pose = t < 196 ? K.AIR_RISE : spin(AP.roundhouse.contact, -40);
      if (t >= 222) pose = laugh;
      d.pose(A, pose);
      d.at(A, d.ax, t >= 186 && t < 212 ? 60 * Math.sin(d.span(t, 186, 212) * Math.PI) : 0);
      if (t >= 222 && t % 24 === 0) d.sfx('laugh');
      // victim: juggled straight up above Smiles's foot
      const juggleX = d.fx(70);
      if (t < 30) { d.at(V, d.vx + (juggleX - d.vx) * d.span(t, 0, 30)); daze(d, V, t); }
      else if (t < 196) {
        let k0 = 30, h = 120;
        for (let i = 0; i < kicks.length; i++) if (t >= kicks[i]) { k0 = kicks[i]; h = 120 + i * 60; }
        const nxt = kicks.find((kt) => kt > t) ?? 196;
        const u = (t - k0) / (nxt - k0);
        d.at(V, juggleX, 40 + h * 4 * u * (1 - u));
        d.pose(V, spin(LIMP_AIR, (t - 30) * 9));
        if (kicks.includes(t)) { d.sfx('boing'); d.fxEvent('ring', { x: juggleX, y: 70, r: 6, vr: 6, life: 12 }); }
      } else if (t < 214) {
        // the bicycle kick drives the victim head-first into the boards
        const k = d.span(t, 196, 214, ease.inQuad);
        d.at(V, juggleX + d.dir * 60 * k, 120 * (1 - k) - 90 * k);
        d.pose(V, spin(STAND, 180));
      } else {
        // stuck head-first in the floor, legs kicking
        d.at(V, juggleX + d.dir * 60, -96);
        const kk = Math.sin(t * 0.5);
        d.pose(V, spin(P(STAND, { fl: [20 + kk * 30, 20, 0], bl: [-20 - kk * 30, 30, 0], ff: null, bf: null, fa: [170, 10, 0], ba: [175, 10, 0] }), 180));
      }
      V.fx.clipFloor = t >= 204;
      V.fx.noShadow = t > 30;
      s.hole = t >= 214 ? juggleX + d.dir * 60 : null;
      if (t === 214) { d.sfx('crash'); d.fxEvent('shake', { amount: 12 }); d.fxEvent('dust', { x: s.hole, y: 4, n: 26, spread: 60 }); d.fxEvent('shards', { x: s.hole, y: 6, n: 14, color: '#8a6a4a' }); }
    },
    draw(ctx, d, cam, layer) {
      const { s } = d;
      if (layer !== 'back' || s.hole == null) return;
      const p = S(cam, s.hole, 0), z = cam.zoom;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 40 * z, 9 * z, 0, 0, TAU);
      ink(ctx, '#0a0608', 2.5);
      ctx.strokeStyle = '#8a6a4a';
      ctx.lineWidth = 4 * z;
      for (const a of [-0.9, -0.3, 0.4, 1.0]) { ctx.beginPath(); ctx.moveTo(p.x + Math.cos(a) * 40 * z, p.y); ctx.lineTo(p.x + Math.cos(a) * 58 * z, p.y - 6 * z); ctx.stroke(); }
    },
  },

  // --- JAX: Encore -------------------------------------------------------------------------------
  jax: {
    name: 'ENCORE',
    duration: 280,
    run(d, t) {
      const { A, V, s } = d;
      const point = P(STAND, { y: 118, lean: -6, fa: [170, 10, 0], neck: -16, head: -22 });
      const guitarA = P(STAND, { y: 106, lean: -14, chest: -10, fa: [70, 120, 0], ba: [50, 70, 0], ff: [34, 8, 0], bf: [-30, 8, 0] });
      const guitarB = P(guitarA, { ba: [40, 90, 0], lean: -20, head: -18 });
      if (t < 60) d.keys(A, t, [[0, STAND], [20, point], [60, point]]);
      else if (t < 220) d.pose(A, guitarA, guitarB, 0.5 + 0.5 * Math.sin(t * 0.5));
      else d.keys(A, t, [[220, guitarA], [236, P(STAND, { fa: [150, 30, 0], ba: [40, 120, 0] })], [270, FIST_UP]]);
      if (t === 236) { d.sfx('thud'); d.fxEvent('prop', { prop: 'mic', x: d.joint(A, 'handF').x, y: d.joint(A, 'handF').y, dir: d.dir, vx: 0.5, vy: 3, spin: 0.15 }); }
      // the speaker stack falls from the sky onto the victim
      s.spY = d.num(t, [[0, 900], [36, 900], [56, 0, ease.inQuad], [60, 16], [64, 0]]);
      s.vx = d.vx;
      if (t === 56) { d.sfx('boom'); d.fxEvent('shake', { amount: 16 }); d.fxEvent('dust', { x: d.vx, y: 4, n: 30, spread: 90 }); }
      if (t < 56) { d.at(V, d.vx); if (t < 40) daze(d, V, t); else d.pose(V, LOOK_UP); }
      else { d.at(V, d.vx); d.pose(V, STAND); V.fx.hidden = true; }
      // music: the stack thumps to the beat, notes fly, the victim's shoes twitch along
      s.beat = t > 70 && t < 222 ? Math.max(0, Math.sin(t * 0.5)) : 0;
      if (t === 72) d.sfx('chord');
      if (t > 72 && t < 220 && t % 25 === 0) { d.sfx('chord'); d.fxEvent('ring', { x: d.vx, y: 120, r: 30, vr: 8, life: 18, color: '#3fe6d0' }); }
      if (t > 72 && t < 220 && t % 8 === 0) d.fxEvent('label', { text: t % 16 ? '♪' : '♫', x: d.vx + (((t * 37) % 100) - 50), y: 240, color: t % 16 ? '#ff4fd8' : '#3fe6d0', life: 40 });
      s.shoes = t >= 56 ? V.def.look.shoes?.color || '#222' : null;
      s.twitch = Math.sin(t * 0.5);
    },
    draw(ctx, d, cam, layer) {
      const { s } = d;
      if (layer !== 'front' || s.spY === undefined || s.spY > 850) return;
      const z = cam.zoom;
      const b = S(cam, s.vx, s.spY);
      const w = 70 * z, h = 150 * z, bump = s.beat * 4 * z;
      if (s.shoes) {
        for (const sx of [-1, 1]) {
          ctx.save();
          ctx.translate(b.x + sx * (w + 12 * z), b.y - 6 * z);
          ctx.rotate(sx * (0.3 + 0.25 * s.twitch));
          ctx.beginPath();
          ctx.ellipse(0, 0, 16 * z, 7 * z, 0, 0, TAU);
          ink(ctx, s.shoes, 2.5);
          ctx.restore();
        }
      }
      ctx.beginPath();
      ctx.rect(b.x - w - bump, b.y - h - bump * 2, (w + bump) * 2, h + bump * 2);
      ink(ctx, '#1d1a22', 3.5);
      for (const [cy, r] of [[0.3, 0.42], [0.72, 0.36]]) {
        const cx = b.x, yy = b.y - h * (1 - cy);
        ctx.beginPath(); ctx.arc(cx, yy, w * r + bump, 0, TAU); ink(ctx, '#3a3640', 2);
        ctx.beginPath(); ctx.arc(cx, yy, w * r * 0.45 + bump * 0.6, 0, TAU); ctx.fillStyle = '#ff4fd8'; ctx.fill();
      }
      ctx.fillStyle = '#e8e2d6';
      ctx.font = `900 ${Math.round(12 * z)}px "Arial Black", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('JAX', b.x, b.y - h + 16 * z);
    },
  },

  // --- DON VELLARO: Cement Shoes ----------------------------------------------------------------
  vellaro: {
    name: 'CEMENT SHOES',
    duration: 290,
    run(d, t) {
      const { A, V, s } = d;
      const snap = P(STAND, { y: 118, lean: -4, fa: [130, 120, 0] });
      const tap = P(STAND, { x: 8, y: 116, lean: 8, fa: [96, 10, 0], ba: [40, 130, 0] });
      d.keys(A, t, [[0, STAND], [16, snap], [30, snap], [44, STAND], [60, P(STAND, { fa: [140, 160, 0], neck: -6 })], [76, STAND], [90, tap], [100, tap], [112, STAND],
        [200, STAND], [216, P(STAND, { x: 10, lean: 20, fa: [90, 30, 0] })], [236, STAND], [266, ARMS_CROSSED]]);
      if (t === 24) d.sfx('snap');
      if (t === 98) { d.sfx('pop'); d.fxEvent('label', { text: 'tap.', x: d.vx, y: 260, color: '#ffffff', life: 30 }); }
      // cement sets around the feet
      s.cement = d.span(t, 24, 44, ease.outQuad);
      s.vx = d.vx;
      if (t === 30) d.sfx('crumble');
      // tipping over like a tree around the feet
      const fall = d.span(t, 100, 150, ease.inQuad);
      const ang = fall * 90;
      const hp = 112 * V.props.posScale;
      if (t < 150) {
        d.at(V, d.vx + Math.sin(fall * Math.PI / 2) * hp * d.dir, 0 + (Math.cos(fall * Math.PI / 2) - 1) * hp);
        if (t < 100) daze(d, V, t);
        else d.pose(V, spin(P(STAND, { ff: null, bf: null, fl: [4, 2, 0], bl: [-4, 2, 0], fa: [10, 10, 0], ba: [8, 10, 0] }), ang));
      }
      // ...through the pier boards, splash
      if (t >= 150) {
        const k = d.span(t, 150, 176, ease.inQuad);
        d.at(V, d.vx + hp * d.dir, -hp - 260 * k);
        d.pose(V, spin(P(STAND, { ff: null, bf: null, fl: [4, 2, 0], bl: [-4, 2, 0], fa: [170, 10, 0], ba: [168, 10, 0] }), 90));
        V.fx.clipFloor = true;
      }
      s.hole = t >= 150;
      s.holeX = d.vx + hp * 0.5 * d.dir;
      if (t === 150) { d.sfx('crash'); d.fxEvent('shake', { amount: 12 }); d.fxEvent('shards', { x: s.holeX, y: 6, n: 18, color: '#8a6a4a' }); }
      if (t === 182) { d.sfx('splash'); d.fxEvent('drops', { x: s.holeX, y: 4, n: 40, speed: 12, cone: 0.9, color: '#7fd0ff' }); }
      V.fx.noShadow = t >= 100;
      s.rose = t >= 222 ? t - 222 : -1;
    },
    draw(ctx, d, cam, layer, alpha) {
      const { s } = d;
      const z = cam.zoom;
      if (layer === 'back' && s.hole) {
        const p = S(cam, s.holeX, 0);
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 110 * z, 12 * z, 0, 0, TAU);
        ink(ctx, '#06040a', 2.5);
        ctx.fillStyle = 'rgba(80,160,220,0.5)';
        ctx.beginPath(); ctx.ellipse(p.x, p.y + 4 * z, 90 * z, 6 * z, 0, 0, TAU); ctx.fill();
      }
      if (layer === 'front') {
        if (s.cement > 0 && !(s.hole && d.t > 152)) {
          const V = d.V;
          // the block stays on the victim's feet (it tips with them)
          const ang = d.t >= 100 ? Math.min(1, (d.t - 100) / 50) ** 2 * (Math.PI / 2) * d.dir : 0;
          const p = S(cam, s.vx, 0);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(ang);
          const h = 46 * z * s.cement, w = 44 * z;
          ctx.beginPath();
          ctx.rect(-w, -h, w * 2, h);
          ink(ctx, '#8d8a86', 3);
          ctx.fillStyle = 'rgba(0,0,0,0.15)';
          for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(-w + ((i * 23) % (w * 2 / z)) * z, -h * ((i * 0.37) % 1), 2.5 * z, 0, TAU); ctx.fill(); }
          ctx.restore();
          void V;
        }
        if (s.rose >= 0) {
          const k = Math.min(1, (s.rose + alpha) / 40);
          const p = S(cam, s.holeX, 220 * (1 - k));
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(k * 2);
          ctx.strokeStyle = '#2f8a3a'; ctx.lineWidth = 3 * z;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 26 * z); ctx.stroke();
          ctx.beginPath(); ctx.arc(0, 0, 7 * z, 0, TAU); ink(ctx, '#c4203a', 2);
          ctx.restore();
        }
      }
    },
  },

  // --- ROXY: Encore Flip ------------------------------------------------------------------------
  // a backflip kick launches the victim; while they hang in the air she corkscrews over them, lands
  // a bicycle kick from behind and sends them out of the screen (and into the sky: *ping*)
  roxy: {
    name: 'ENCORE FLIP',
    duration: 290,
    run(d, t) {
      const { A, V, s } = d;
      const dir = d.dir;
      const xKick = d.vx - dir * Math.max(104, d.gap * 0.85); // where the first kick is thrown from
      // where she comes down behind the floating victim: right under their head, so the bicycle kick
      // connects whatever the victim's size (measured when she takes off)
      if (t === 92) { const h = d.joint(V, 'head'); s.tgt = { x: h.x + dir * 58, y: Math.max(90, h.y - 200) }; }
      const xBehind = s.tgt ? s.tgt.x : d.vx + dir * 125;
      const yBehind = s.tgt ? s.tgt.y : 140;
      // --- poses ---
      const point = P(STAND, { y: 116, lean: -6, chest: -8, neck: -8, head: -10, fa: [96, 4, 0], ba: [30, 140, 10] });
      const kickUp = P(K.ROOT || STAND, { x: 0, y: 100, lean: -12, chest: -10, neck: 8, head: 10, fa: [-50, 30, 0], ba: [-70, 24, 0], fl: [104, 2, 30], bl: [26, 70, 10], ff: null, bf: null });
      const tuck = K.AIR_TUCK;
      const reach = P(K.AIR_RISE, { lean: -6, chest: -10, neck: -10, head: -12, fa: [175, 10, 0], ba: [170, 14, 0], fl: [10, 6, 10], bl: [-6, 10, 10] });
      // the signature shape of the corkscrew: wide open "star" at the top, arms and legs split
      const star = P(K.AIR_FALL, { lean: 0, chest: -6, neck: -6, head: -8, fa: [140, 6, 0], ba: [-130, 6, 0], fl: [62, 2, 20], bl: [-58, 2, 20] });
      const ready = P(K.AIR_FALL, { lean: 10, chest: 6, neck: -14, head: -18, fa: [70, 60, 0], ba: [40, 80, 0], fl: [70, 100, 10], bl: [30, 70, 10] });
      const bicycle = P(K.AIR_FALL, { lean: -14, chest: -10, neck: 16, head: 16, fa: [-60, 20, 0], ba: [-90, 20, 0], fl: [96, 2, 30], bl: [40, 90, 10] });
      const horns = P(STAND, { y: 116, lean: -10, neck: -12, head: -16, fa: [170, 30, 0], ba: [40, 120, 0] });

      // ================= Roxy =================
      let rot = 0;
      A.facing = dir;
      A.fx.sx = 1;
      if (t < 30) {
        d.at(A, d.ax);
        d.keys(A, t, [[0, STAND], [10, point], [30, point]]);
      } else if (t < 44) {
        // two quick steps in, then load up
        const k = d.span(t, 30, 40);
        d.at(A, d.ax + (xKick - d.ax) * k, 6 * Math.abs(Math.sin(k * Math.PI * 2)));
        d.keys(A, t, [[30, point], [36, STAND], [44, K.PREJUMP]]);
      } else if (t < 78) {
        // FLIP KICK: the leg whips up through the chin, the body keeps rotating into a full backflip
        const k = d.span(t, 46, 76, (x) => x);
        d.at(A, xKick - dir * 22 * k, t < 46 ? 0 : 120 * Math.sin(k * Math.PI));
        d.keys(A, t, [[44, K.PREJUMP], [50, kickUp], [55, kickUp], [62, tuck], [70, tuck], [76, K.AIR_FALL], [78, K.LAND]]);
        rot = d.num(t, [[46, 0], [51, 34, ease.outQuad], [56, 80], [70, 320], [76, 360]]);
      } else if (t < 92) {
        d.at(A, xKick - dir * 22);
        d.keys(A, t, [[78, K.LAND], [84, LOOK_UP], [88, K.PREJUMP], [92, K.PREJUMP]]);
      } else if (t < 128) {
        // CORKSCREW: a high forward somersault over the floating victim with a half twist,
        // opening into a split "star" at the top and landing behind them facing back
        const k = d.span(t, 92, 128, (x) => x);
        const x0 = xKick - dir * 22;
        const top = yBehind + 300;
        const y = k < 0.55 ? top * Math.sin((k / 0.55) * Math.PI / 2) : top - (top - yBehind) * ((k - 0.55) / 0.45) ** 2;
        d.at(A, x0 + (xBehind - x0) * ease.inOutSine(clamp(k / 0.72, 0, 1)), y); // over first, then drop down
        d.keys(A, t, [[92, K.PREJUMP], [96, reach], [102, tuck], [108, tuck], [113, star], [117, star], [122, tuck], [128, ready]]);
        rot = -720 * ease.inOutSine(k);
        const tw = clamp((k - 0.4) / 0.3, 0, 1); // half twist across the top
        A.fx.sx = Math.max(0.12, Math.abs(Math.cos(tw * Math.PI)));
        A.facing = tw < 0.5 ? dir : -dir;
      } else if (t < 162) {
        // BICYCLE KICK from behind, then the rest of the backflip down to the floor
        A.facing = -dir;
        const k = d.span(t, 128, 158, ease.inQuad);
        d.at(A, xBehind + dir * 26 * d.span(t, 128, 158), Math.max(0, yBehind * (1 - k) + 40 * Math.sin(d.span(t, 128, 140) * Math.PI)));
        d.keys(A, t, [[128, ready], [133, bicycle], [138, bicycle], [146, tuck], [154, K.AIR_FALL], [158, K.LAND], [162, K.LAND]]);
        rot = d.num(t, [[128, 0], [134, 62, ease.outQuad], [140, 150], [154, 340], [158, 360]]);
      } else {
        // stands up, turns to where the victim went, rock horns
        d.at(A, xBehind + dir * 26);
        A.facing = t < 176 ? -dir : dir;
        d.keys(A, t, [[162, K.LAND], [170, STAND], [176, K.TURN], [182, STAND], [196, horns], [290, horns]]);
      }
      if (rot) A.scriptPose.rot = (A.scriptPose.rot || 0) + rot;

      // ================= victim =================
      V.fx.stars = t > 60 && t < 134;
      if (t < 51) {
        d.at(V, d.vx);
        daze(d, V, t);
      } else if (t < 134) {
        // launched by the first kick, then hangs face-up in the air
        const k = d.span(t, 51, 92, ease.outCubic);
        const bob = t > 92 ? Math.sin((t - 92) * 0.12) * 6 : 0;
        d.at(V, d.vx + dir * 14 * k, 230 * k + bob);
        const r = d.num(t, [[51, 0], [60, 40, ease.outQuad], [92, 92], [134, 104]]);
        d.pose(V, spin(t < 60 ? K.AIR_HIT : LIMP_AIR, r));
        s.hang = { x: V.body.x, y: V.body.y };
      } else {
        // the bicycle kick: gone over her head, out of the screen and into the sky
        const k = t - 134;
        d.at(V, s.hang.x + dir * k * 30, s.hang.y + k * 13 - k * k * 0.04);
        d.pose(V, spin(FLAIL_A, 104 + k * 34));
      }
      V.facing = -dir;
      V.fx.hidden = t > 166;

      // ================= impacts & effects =================
      if (t === 46 || t === 96) d.sfx('whoosh');
      if (t === 51) {
        d.sfx('boom');
        d.fxEvent('flash', { amount: 0.45 });
        d.fxEvent('shake', { amount: 12 });
        const h = d.joint(V, 'head');
        d.fxEvent('burst', { x: h.x, y: h.y, r: 46 });
        d.fxEvent('sparks', { x: h.x, y: h.y, n: 16, color: '#ff3fd0' });
        d.fxEvent('label', { text: 'WHAM!', x: h.x - dir * 30, y: h.y + 60, color: '#ffd23f', life: 50 });
      }
      if (t === 113) d.fxEvent('label', { text: '★', x: A.body.x, y: A.body.y + 230, color: '#ff3fd0', life: 30 });
      if (t === 134) {
        d.sfx('crash');
        d.sfx('chord');
        d.fxEvent('flash', { amount: 0.7 });
        d.fxEvent('shake', { amount: 18 });
        const h = d.joint(V, 'neck');
        d.fxEvent('burst', { x: h.x, y: h.y, r: 60 });
        for (let i = 0; i < 3; i++) d.fxEvent('ring', { x: h.x, y: h.y, r: 10 + i * 14, vr: 9 + i * 3, life: 22, color: i % 2 ? '#ff3fd0' : '#ffffff' });
        d.fxEvent('sparks', { x: h.x, y: h.y, n: 24, speed: 10, color: '#ffd23f' });
        d.fxEvent('label', { text: 'KA-BOOM!', x: h.x + dir * 40, y: h.y + 70, color: '#ff3fd0', life: 60 });
      }
      if (t === 158) { d.sfx('thud'); d.fxEvent('dust', { x: A.body.x, y: 4, n: 12, spread: 40 }); }
      if (t === 192) d.sfx('ding');
      if (t === 214) d.fxEvent('label', { text: 'ENCORE!', x: A.body.x, y: 300, color: '#ff3fd0', life: 70 });

      // motion trails: the kicking foot during both kicks, the hips during the corkscrew
      s.trail = s.trail || [];
      const tracking = (t >= 47 && t <= 62) || (t >= 129 && t <= 146) ? 'toeF' : t >= 94 && t <= 130 ? 'pelvis' : null;
      if (tracking) s.trail.push({ ...d.joint(A, tracking), t, j: tracking, w: tracking === 'toeF' ? 1 : 1.6 });
      s.trail = s.trail.filter((p) => t - p.t < 10);
      s.rim = A.def.look.rim;
      s.ping = t >= 186 && t < 214 ? t - 186 : -1;

      // camera: wider and higher while the victim is in the air
      const cx = (d.ax + d.vx + dir * 125) / 2;
      d.camX = cx + (xBehind + dir * 26 - cx) * d.span(t, 160, 200);
      d.camZoom = d.num(t, [[0, 1.34], [44, 1.3], [60, 1.06], [150, 1.06], [190, 1.2]]);
      d.camY = d.num(t, [[0, 0], [44, 0], [60, 70], [150, 70], [190, 0]]);
    },
    draw(ctx, d, cam, layer, alpha) {
      const { s } = d;
      if (layer !== 'front') return;
      const z = cam.zoom;
      // neon trail ribbon
      const tr = s.trail || [];
      if (tr.length > 1) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 1; i < tr.length; i++) {
          if (tr[i].t - tr[i - 1].t > 1 || tr[i].j !== tr[i - 1].j) continue;
          const a = S(cam, tr[i - 1].x, tr[i - 1].y), b = S(cam, tr[i].x, tr[i].y);
          const k = i / tr.length;
          ctx.strokeStyle = rgba(s.rim || '#ff3fd0', 0.55 * k);
          ctx.lineWidth = (6 + 16 * k) * z * tr[i].w;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          ctx.strokeStyle = `rgba(255,255,255,${0.6 * k})`;
          ctx.lineWidth = (2 + 5 * k) * z * tr[i].w;
          ctx.stroke();
        }
        ctx.restore();
      }
      // the victim twinkles out in the sky, cartoon style
      if (s.ping >= 0) {
        const tt = s.ping + alpha;
        const x = d.dir > 0 ? VIEW_W - 150 : 150, y = 110;
        const k = Math.sin(Math.min(1, tt / 28) * Math.PI);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        star(ctx, x, y, 34 * k, tt * 0.05, '#ffffff');
        star(ctx, x, y, 18 * k, -tt * 0.08, '#ffd23f');
        ctx.restore();
      }
    },
  },

  // --- GORO: Sumo Squash ------------------------------------------------------------------------
  // two thunderous shiko stomps, a leap, and he sits on the victim: flat as a pancake, the paper-thin
  // victim then flutters away on the sea breeze
  goro: {
    name: 'SUMO SQUASH',
    duration: 300,
    run(d, t) {
      const { A, V, s } = d;
      const shikoF = P(STAND, { y: 92, lean: 14, chest: 6, fa: [40, 30, 0], ba: [30, 34, 0], fl: [118, 70, 10], ff: null, bf: [-34, 8, 0] });
      const shikoB = P(STAND, { y: 92, lean: 14, chest: 6, fa: [40, 30, 0], ba: [30, 34, 0], bl: [118, 70, 10], bf: null, ff: [32, 8, 0] });
      const squat = P(STAND, { y: 70, lean: 18, chest: 8, fa: [50, 40, 0], ba: [40, 44, 0], ff: [42, 8, 0], bf: [-44, 8, 0] });
      const sit = P(STAND, { y: 34, lean: -14, chest: -6, neck: 6, head: 4, fa: [70, 40, 0], ba: [50, 50, 0], ff: null, bf: null, fl: [86, 8, 0], bl: [80, 12, 0] });
      const fan = P(sit, { fa: [150, 120, 0] });
      // Goro: stomp, stomp, squat, leap over, land seated on the victim, enjoy it, stand up, bow
      d.keys(A, t, [[0, STAND], [12, shikoF], [26, shikoF], [30, squat], [44, shikoB], [58, shikoB], [62, squat], [80, K.PREJUMP],
        [92, K.AIR_RISE], [112, K.AIR_TUCK], [124, sit], [150, sit], [160, fan], [176, sit], [196, sit], [212, STAND], [250, BOW], [300, BOW]]);
      const xSit = d.vx - d.dir * 10;
      if (t < 90) d.at(A, d.ax);
      else if (t < 124) { const k = d.span(t, 90, 124, ease.linear); d.at(A, d.ax + (xSit - d.ax) * k, 300 * Math.sin(k * Math.PI) * (1 - k * 0.35) + 4 * k); }
      else if (t < 200) d.at(A, xSit + Math.sin(t * 0.4) * (t > 130 && t < 150 ? 3 : 0), 4);
      else d.at(A, xSit - d.dir * 70 * d.span(t, 200, 216), 0);
      for (const st of [30, 62]) {
        if (t === st) { d.sfx('boom'); d.fxEvent('shake', { amount: 12 }); d.fxEvent('dust', { x: A.body.x, y: 4, n: 18, spread: 80 }); d.fxEvent('label', { text: 'DOSUN!', x: d.ax, y: 260, color: '#ffd23f', life: 36 }); }
      }
      if (t === 92) d.sfx('whoosh');
      // victim: hops on each stomp, looks up at the falling mountain, gets flattened
      if (t < 124) {
        const hop = Math.max(0, Math.sin(d.span(t, 30, 44, ease.linear) * Math.PI)) * 30 + Math.max(0, Math.sin(d.span(t, 62, 78, ease.linear) * Math.PI)) * 40;
        d.at(V, d.vx, hop);
        if (t < 96) daze(d, V, t); else d.pose(V, LOOK_UP, P(LOOK_UP, { fa: [150, 30, 0], ba: [160, 30, 0] }), d.span(t, 96, 110));
        V.fx.sy = 1;
      } else {
        d.at(V, d.vx + (t > 214 ? d.dir * (t - 214) * 2.2 + Math.sin(t * 0.09) * 30 : 0), t > 214 ? (t - 214) * 2.4 : 0);
        d.pose(V, K.LYING);
        const flat = d.num(t, [[124, 0.6, ease.outQuad], [128, 0.26]]);
        V.fx.sy = flat;
        V.fx.sx = d.num(t, [[124, 1], [128, 1.35]]);
        V.fx.noShadow = t > 214;
        V.fx.rot = t > 214 ? Math.sin(t * 0.12) * 0.4 : 0;
      }
      if (t === 124) {
        d.sfx('crash'); d.sfx('boom');
        d.fxEvent('shake', { amount: 18 });
        d.fxEvent('flash', { amount: 0.4 });
        d.fxEvent('dust', { x: d.vx, y: 4, n: 30, spread: 110 });
        d.fxEvent('label', { text: 'SQUISH!', x: d.vx, y: 230, color: '#ff3fd0', life: 60 });
      }
      if (t === 214) { d.sfx('whoosh'); d.fxEvent('label', { text: 'fwip...', x: d.vx, y: 120, color: '#ffffff', life: 50 }); }
      V.fx.hidden = t > 296;
      d.order = t >= 120 && t < 212 ? [1 - d.who, d.who] : [d.who, 1 - d.who];
      d.camZoom = d.num(t, [[0, 1.34], [90, 1.15], [124, 1.3], [214, 1.3], [260, 1.1]]);
      d.camY = d.num(t, [[0, 0], [90, 60], [124, 0], [214, 0], [270, 90]]);
    },
  },

  // --- SOBBY: The Last Laugh --------------------------------------------------------------------
  // a giant wooden mallet drives the victim into the pier like a nail; a flower for the grave and a
  // fountain of tears
  sobby: {
    name: 'THE LAST LAUGH',
    duration: 290,
    run(d, t) {
      const { A, V, s } = d;
      const sob = P(STAND, { y: 110, lean: 16, chest: 10, neck: 14, head: 16, fa: [110, 150, 0], ba: [100, 150, 0] });
      const sob2 = P(sob, { y: 108, chest: 13, head: 20 });
      const keys = [[0, STAND], [10, sob], [16, sob2], [22, sob], [28, sob2], [40, STAND], [52, AP.hammer.windup]];
      for (const h of [64, 100, 136, 168]) keys.push([h - 2, AP.hammer.windup], [h, P(AP.hammer.contact, { fl: null, bl: null, ff: [30, 8, 0], bf: [-30, 8, 0], y: 100 })], [h + 14, AP.hammer.windup]);
      keys.push([196, STAND], [210, P(STAND, { lean: 30, chest: 20, fa: [80, 30, 0] })], [222, STAND], [236, sob], [244, sob2], [252, sob], [260, sob2], [268, sob], [290, sob2]);
      d.keys(A, t, keys);
      d.at(A, d.ax);
      s.mallet = t >= 46 && t < 196;
      s.hand = d.joint(A, 'handF');
      s.handB = d.joint(A, 'handB');
      s.elbow = d.joint(A, 'elbowF');
      // the victim is hammered in: each bonk sinks them deeper
      const hp = 130 * V.props.posScale;
      const depth = d.num(t, [[0, 0], [64, 0], [66, hp * 0.3, ease.outQuad], [100, hp * 0.3], [102, hp * 0.62, ease.outQuad], [136, hp * 0.62], [138, hp * 0.92, ease.outQuad], [168, hp * 0.92], [172, hp * 1.6, ease.outQuad]]);
      d.at(V, d.vx, -depth);
      V.fx.clipFloor = true;
      V.fx.noShadow = t > 64;
      V.fx.stars = t > 66 && t < 172;
      if (t < 64) daze(d, V, t); else d.pose(V, P(STAND, { fa: [10, 10, 0], ba: [6, 10, 0], neck: -6, head: -10 }));
      V.fx.hidden = t > 176;
      for (const h of [64, 100, 136]) {
        if (t === h) {
          d.sfx('clang'); d.sfx('boing');
          d.fxEvent('shake', { amount: 12 });
          d.fxEvent('label', { text: 'BONK!', x: d.vx, y: 280 - (h - 64) * 0.8, color: '#ffd23f', life: 40 });
          d.fxEvent('dust', { x: d.vx, y: 4, n: 14, spread: 60 });
          d.fxEvent('shards', { x: d.vx, y: 6, n: 8, color: '#5a3a2a' });
        }
      }
      if (t === 168) { d.sfx('pop'); d.fxEvent('label', { text: 'tok.', x: d.vx, y: 110, color: '#ffffff', life: 40 }); }
      if (t === 210) d.sfx('ding');
      s.flower = t >= 210;
      s.fx = d.vx;
      if ((t > 4 && t < 34) || t > 234) {
        // tears squirting sideways from both eyes
        if (t % 3 === 0) {
          const h = d.joint(A, 'head');
          d.fxEvent('drops', { x: h.x + d.dir * 10, y: h.y, n: t > 234 ? 4 : 2, color: '#9ad8ff', cone: 2.4, speed: 6 });
        }
      }
      if (t === 236) { d.sfx('laugh'); d.fxEvent('label', { text: 'WAAAAH!', x: d.ax, y: 320, color: '#9ad8ff', life: 60 }); }
      d.camZoom = d.num(t, [[0, 1.34], [60, 1.3], [180, 1.45], [230, 1.3]]);
    },
    draw(ctx, d, cam, layer) {
      const { s } = d;
      if (layer !== 'front') return;
      const z = cam.zoom;
      if (s.mallet && s.hand) {
        // giant wooden mallet held in both hands
        const h = S(cam, s.hand.x, s.hand.y), e = S(cam, s.elbow.x, s.elbow.y);
        const ang = Math.atan2(h.y - e.y, h.x - e.x);
        ctx.save();
        ctx.translate(h.x, h.y);
        ctx.rotate(ang);
        ctx.beginPath(); ctx.rect(-10 * z, -4 * z, 74 * z, 8 * z); ink(ctx, '#8a5a2a', 2);
        ctx.beginPath(); ctx.rect(64 * z, -26 * z, 36 * z, 52 * z); ink(ctx, '#b07a3a', 3);
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(68 * z, -22 * z, 6 * z, 44 * z);
        ctx.strokeStyle = 'rgba(20,12,16,0.5)';
        ctx.lineWidth = 1.5;
        for (const y of [-14, 0, 14]) { ctx.beginPath(); ctx.moveTo(66 * z, y * z); ctx.lineTo(98 * z, y * z); ctx.stroke(); }
        ctx.restore();
      }
      if (s.flower) {
        const p = S(cam, s.fx, 0);
        ctx.strokeStyle = '#2f8a3a'; ctx.lineWidth = 3 * z;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(p.x + 4 * z, p.y - 16 * z, p.x, p.y - 30 * z); ctx.stroke();
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU;
          ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * 6 * z, p.y - 30 * z + Math.sin(a) * 6 * z, 5 * z, 0, TAU); ink(ctx, '#ff5fbf', 1.5);
        }
        ctx.beginPath(); ctx.arc(p.x, p.y - 30 * z, 4 * z, 0, TAU); ink(ctx, '#ffd23f', 1.5);
      }
    },
  },

  // --- SNAPPER: Swamp Snack ---------------------------------------------------------------------
  // lifts the victim, swallows them whole, a wriggling belly, a burp and a shoe
  snapper: {
    name: 'SWAMP SNACK',
    duration: 300,
    run(d, t) {
      const { A, V, s } = d;
      const rub = P(STAND, { y: 114, lean: 6, fa: [70, 110, 0], ba: [60, 120, 0] });
      const rub2 = P(rub, { fa: [62, 118, 0], ba: [68, 112, 0] });
      const tilt = P(HOLD_UP, { neck: -26, head: -34, lean: -16, chest: -18 });
      const pat = P(STAND, { y: 112, lean: -8, chest: -8, fa: [40, 100, 0], ba: [40, 110, 0] });
      d.keys(A, t, [[0, STAND], [10, rub], [16, rub2], [22, rub], [28, rub2], [40, STAND], [54, AP.grab.contact], [76, HOLD_UP], [100, tilt],
        [180, tilt], [196, P(STAND, { neck: -10 })], [216, pat], [228, P(pat, { fa: [46, 90, 0] })], [240, pat], [262, P(STAND, { neck: -20, head: -24, lean: -12 })], [300, FLEX]]);
      d.at(A, d.ax);
      A.fx.face = t >= 90 && t < 182 ? 'shout' : t >= 182 && t < 200 ? null : t > 262 ? 'happy' : null;
      A.fx.bite = t >= 182 && t < 200; // chomp chomp
      const mouth = () => { const h = d.joint(A, 'head'); return { x: h.x + d.dir * 34, y: h.y + 10 }; };
      // the victim's head is steered to a point relative to the open mouth
      const m = mouth(), hv = d.joint(V, 'head');
      const offX = hv.x - V.body.x, offY = hv.y - V.body.y;
      if (t < 54) { d.at(V, d.vx); daze(d, V, t); }
      else if (t < 100) {
        // grabbed and swung up overhead, upside down, head ending just above the jaws
        const k = d.span(t, 54, 100);
        const tx = m.x - offX, ty = m.y + 70 - offY;
        d.at(V, d.vx + (tx - d.vx) * k, Math.max(0, ty) * k);
        d.pose(V, spin(LIMP_AIR, 180 * k));
      } else if (t < 176) {
        // lowered head first into the open jaws, kicking
        const k = d.span(t, 110, 176, ease.inQuad);
        d.at(V, m.x - offX + Math.sin(t * 0.8) * (t > 130 ? 3 : 0), m.y + 70 - 150 * k - offY);
        d.pose(V, t > 120 ? flailPose(t) : spin(LIMP_AIR, 180));
        V.fx.sx = 1 - 0.3 * k;
        V.fx.sy = 1 - 0.3 * k;
      }
      V.fx.hidden = t >= 176;
      V.fx.noShadow = t >= 60;
      // the victim disappears behind the croc's head: drawn first
      d.order = [1 - d.who, d.who];
      if (t === 110) d.sfx('heartbeat');
      if (t === 176) { d.sfx('pop'); d.fxEvent('label', { text: 'GULP!', x: d.ax, y: 300, color: '#3fe6d0', life: 50 }); }
      if (t === 184 || t === 192) d.sfx('snap');
      s.belly = t >= 196 && t < 262 ? d.span(t, 196, 206) * (1 - d.span(t, 248, 262)) : 0;
      s.wiggle = Math.sin(t * 0.7) * 6;
      s.pelvis = d.joint(A, 'pelvis');
      s.neck = d.joint(A, 'neck');
      s.coat = A.def.look.top?.color || '#c8a878';
      if (t === 250) {
        d.sfx('boing');
        d.fxEvent('label', { text: 'BURRRP!', x: d.ax + d.dir * 40, y: 330, color: '#ffd23f', life: 60 });
        const m = mouth();
        d.fxEvent('prop', { prop: 'boot', x: m.x, y: m.y, dir: d.dir, vx: 5, vy: 9, spin: 0.35, look: V.def.look });
        d.fxEvent('smoke', { x: m.x, y: m.y, n: 6, spread: 20 });
      }
      d.camZoom = d.num(t, [[0, 1.34], [100, 1.25], [176, 1.45], [262, 1.3]]);
      d.camY = d.num(t, [[0, 0], [60, 60], [176, 30], [200, 0]]);
    },
    draw(ctx, d, cam, layer) {
      const { s } = d;
      if (layer !== 'front' || !s.belly) return;
      // the swallowed victim struggling inside the belly
      const z = cam.zoom;
      const c = { x: s.pelvis.x * 0.45 + s.neck.x * 0.55 + d.dir * 22, y: s.pelvis.y * 0.55 + s.neck.y * 0.45 };
      const p = S(cam, c.x, c.y);
      const r = 30 * z * s.belly;
      ctx.beginPath();
      ctx.ellipse(p.x + s.wiggle * z * 0.5, p.y, r * 1.1 + Math.abs(s.wiggle) * z * 0.3, r * (1 + s.wiggle * 0.02), 0, 0, TAU);
      ink(ctx, s.coat, 3);
      ctx.beginPath();
      ctx.ellipse(p.x + s.wiggle * z * 0.5 - 8 * z, p.y - 8 * z, r * 0.3, r * 0.2, -0.5, 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fill();
      // a fist print pushing out
      if (s.wiggle > 3) {
        ctx.beginPath();
        ctx.arc(p.x + r * 0.6, p.y - r * 0.2, 7 * z, 0, TAU);
        ink(ctx, s.coat, 2);
      }
    },
  },

  // --- CHUY: Piñata ------------------------------------------------------------------------------
  // the victim is strung up as a piñata; Chuy swings blindfolded, misses twice, then the guitar
  // connects and it rains candy
  chuy: {
    name: 'PIÑATA',
    duration: 300,
    run(d, t) {
      const { A, V, s } = d;
      const strum = P(STAND, { y: 114, lean: 4, fa: [40, 100, 0], ba: [70, 60, 0] });
      const strum2 = P(strum, { ba: [60, 80, 0] });
      const keys = [[0, STAND], [8, strum], [12, strum2], [16, strum], [20, strum2], [24, strum], [28, strum2], [40, STAND], [58, P(STAND, { fa: [160, 150, 0], ba: [150, 150, 0], neck: 6 })], [70, STAND]];
      for (const h of [100, 134, 172]) keys.push([h - 14, AP.panSwing.windup], [h, AP.panSwing.contact], [h + 10, AP.panSwing.contact]);
      keys.push([196, STAND], [214, P(STAND, { fa: [160, 150, 0], ba: [150, 150, 0] })], [228, STAND], [250, FIST_UP], [300, FIST_UP]);
      d.keys(A, t, keys);
      // blind swings wander off target
      const wander = t >= 80 && t < 180 ? d.num(t, [[80, 0], [100, -60], [118, 30], [134, 60], [152, -20], [172, 0]]) : 0;
      d.at(A, d.ax + d.dir * wander);
      A.fx.prop = t >= 80 && t < 173 ? { type: 'guitar', hand: 'F' } : null;
      A.fx.look = t >= 172 ? { guitar: null } : null;
      s.blind = t >= 62 && t < 214;
      s.head = d.joint(A, 'head');
      s.dirA = A.facing;
      if (t % 6 === 0 && t < 30) d.fxEvent('label', { text: '♪', x: d.ax + d.dir * 40, y: 200 + (t % 12) * 3, color: '#ffd23f', life: 30 });
      if (t === 10) d.sfx('chord');
      // victim: hoisted up by the feet on a rope, swinging, dressed as a piñata
      const hang = d.span(t, 30, 60);
      const swing = Math.sin(t * 0.08) * 16 * hang + (t > 172 ? 0 : 0);
      d.at(V, d.vx + swing, 40 + 150 * hang);
      if (t < 30) daze(d, V, t);
      else d.pose(V, spin(LIMP_AIR, 180 * hang));
      V.fx.tint = 0.45 * hang;
      V.fx.tintColor = '#ff8ad8';
      V.fx.noShadow = t > 40;
      V.fx.hidden = t >= 172;
      s.rope = t >= 26 && t < 172;
      s.foot = d.joint(V, 'ankleF');
      s.vp = ['neck', 'waist', 'pelvis', 'kneeF', 'elbowF', 'head'].map((j) => d.joint(V, j));
      s.paper = hang > 0.5 && t < 172;
      for (const h of [100, 134]) {
        if (t === h) { d.sfx('whoosh'); d.fxEvent('label', { text: 'MISS!', x: A.body.x + d.dir * 80, y: 220, color: '#ffffff', life: 30 }); }
      }
      if (t === 172) {
        d.sfx('crash'); d.sfx('twang'); d.sfx('boom');
        d.fxEvent('shake', { amount: 16 });
        d.fxEvent('flash', { amount: 0.5 });
        const c = d.joint(V, 'waist');
        for (const color of ['#ff3fd0', '#3fe6d0', '#ffd23f', '#ff8a3a', '#7fd36a', '#ffffff']) d.fxEvent('shards', { x: c.x, y: c.y, n: 12, color, speed: 11 });
        d.fxEvent('label', { text: '¡OLÉ!', x: c.x, y: c.y + 90, color: '#ffd23f', life: 70 });
      }
      // candy rain afterwards
      if (t > 176 && t < 250 && t % 4 === 0) {
        const x = d.vx + Math.sin(t * 1.7) * 80;
        d.fxEvent('shards', { x, y: 420, n: 2, color: ['#ff3fd0', '#3fe6d0', '#ffd23f', '#7fd36a'][t % 4], speed: 3 });
      }
      if (t === 250) d.sfx('chord');
      d.camZoom = d.num(t, [[0, 1.34], [60, 1.22], [172, 1.32], [250, 1.25]]);
      d.camY = d.num(t, [[0, 0], [40, 50], [250, 30]]);
    },
    draw(ctx, d, cam, layer) {
      const { s } = d;
      const z = cam.zoom;
      if (layer === 'back' && s.rope && s.foot) {
        const a = S(cam, s.foot.x, s.foot.y), b = S(cam, s.foot.x, s.foot.y + 600);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.lineWidth = 3 * z; ctx.strokeStyle = '#c9a26a'; ctx.stroke();
      }
      if (layer !== 'front') return;
      if (s.paper && s.vp) {
        // crepe-paper frills over the victim
        const cols = ['#ff3fd0', '#3fe6d0', '#ffd23f', '#ff8a3a', '#7fd36a'];
        s.vp.forEach((j, i) => {
          const p = S(cam, j.x, j.y);
          ctx.beginPath();
          for (let k = 0; k <= 8; k++) {
            const x = p.x - 22 * z + k * 5.5 * z, y = p.y + (k % 2 ? -6 : 6) * z;
            if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.lineWidth = 7 * z;
          ctx.strokeStyle = cols[i % cols.length];
          ctx.stroke();
        });
      }
      if (s.blind && s.head) {
        // blindfold
        const h = S(cam, s.head.x, s.head.y + 4);
        ctx.beginPath();
        ctx.rect(h.x - 18 * z, h.y - 5 * z, 36 * z, 9 * z);
        ink(ctx, '#1a1414', 2);
        ctx.beginPath();
        ctx.moveTo(h.x - s.dirA * 16 * z, h.y);
        ctx.lineTo(h.x - s.dirA * 32 * z, h.y + 10 * z);
        ctx.lineWidth = 4 * z; ctx.strokeStyle = '#1a1414'; ctx.stroke();
      }
    },
  },
};
