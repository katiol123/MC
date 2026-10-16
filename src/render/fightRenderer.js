// Draws a running Match: arena, fighters (interpolated between simulation ticks), effects, HUD and
// the debug overlay. Reads simulation state, never writes it.
import { VIEW } from '../config/constants.js';
import { lerp } from '../core/math.js';
import { blendPoses, computeSkeleton, emptyPose, clonePose } from '../anim/skeleton.js';
import { drawFlame, drawGlow } from './fire.js';
import { TALON_REACH } from '../data/signatures.js';
import { rangeAt } from '../data/taunts.js';
import { ATTACK_POSES } from '../anim/attackPoses.js';
import { FighterPainter } from './fighterPainter.js';
import { SecondaryMotion } from './secondary.js';
import { Effects, Trails } from './effects.js';
import { Camera } from './camera.js';
import { Arena } from './arena.js';
import { drawHud } from './hud.js';
import { drawDebug } from './debugDraw.js';
import { rgba, mix } from './color.js';

/** Sobby's spring glove: shoots out on the steps whose hitbox reaches past the fist. */
function springExtension(mv, f) {
  if (!mv || f.state !== 'attack' || mv.def.prop?.type !== 'glove' || !mv.step) return 0;
  const st = mv.step;
  if (!st.hit?.hitboxes?.some((h) => h.ext)) return 0;
  const local = mv.frame - st.start + 1, hit = st.hitAt || 6;
  if (local < hit - 3) return 0;
  if (local <= hit + 6) return Math.min(1, (local - hit + 3) / 3);
  return Math.max(0, 1 - (local - hit - 6) / 4);
}

/** Facial expression for the fighter's current state. */
function faceFor(f) {
  switch (f.state) {
    case 'attack': case 'throwing': {
      const d = f.move?.def;
      return d && (d.strength === 'heavy' || d.isSpecial || d.super || d.type === 'throw') ? 'shout' : 'attack';
    }
    case 'blockstun': return 'strain';
    case 'hitstun': case 'juggle': case 'stagger': case 'knockdown': case 'thrown': case 'defeat': return 'hurt';
    case 'dizzy': case 'dazed': return 'dizzy';
    case 'ko': return 'ko';
    case 'victory': return 'happy';
    case 'taunt': return rangeAt(f.sd.def?.face, f.stateFrame) || 'happy';
    default: return null;
  }
}

/** Natural blinking: irregular intervals (2.4-5 s), a quick close-open; returns lid closure 0..1. */
function blinkAt(t, seed) {
  const period = 3.2;
  const n = Math.floor(t / period);
  const h = Math.abs(Math.sin(n * 12.9898 + seed * 78.233) * 43758.5453) % 1;
  const at = n * period + h * (period - 0.3);
  const dt = t - at;
  if (dt < 0 || dt > 0.16) {
    // occasional double blink
    const dt2 = dt - 0.22;
    if (h > 0.8 && dt2 >= 0 && dt2 < 0.16) return 1 - Math.abs(dt2 - 0.08) / 0.08;
    return 0;
  }
  return Math.min(1, 1.6 * (1 - Math.abs(dt - 0.08) / 0.08));
}

/** Where Focus qi rises from (skeleton joints). */
const FOCUS_JOINTS = ['head', 'shoulderF', 'shoulderB', 'elbowF', 'elbowB', 'handF', 'handB', 'waist', 'hipF', 'kneeF', 'kneeB', 'ankleF', 'ankleB'];

export class FightRenderer {
  constructor(match, { arena = 'dusk', portraits = {}, hud = true } = {}) {
    this.match = match;
    this.showHud = hud;
    this.painters = match.fighters.map((f) => new FighterPainter(f.def));
    this.secondary = match.fighters.map((f) => new SecondaryMotion(f.def));
    this.effects = new Effects();
    this.effects.painters = this.painters; // knocked-off items are drawn by their owner's painter
    this.trails = new Trails();
    this.cam = new Camera();
    this.cam.snap(match.fighters);
    this.arena = new Arena(arena);
    // back light on the fighters: the colour of the low sky / sun behind them
    this.envRim = mix(this.arena.pal.sun, this.arena.pal.skyLow, 0.55);
    this.portraits = portraits;
    this.hud = { trail: match.fighters.map((f) => f.health), announce: null, combo: [null, null] };
    this.drawOrder = [0, 1];
  }

  /** Consume the events of one simulation tick and advance visual-only state by one tick. */
  onTick(events) {
    const fs = this.match.fighters;
    for (const e of events) {
      this.effects.onEvent(e, fs);
      if (e.type === 'hit') {
        this.secondary[e.target].squash = e.strength === 'light' ? 0.5 : 1;
        this.hud.combo[e.who] = { hits: e.combo, life: 90, damage: (this.hud.combo[e.who]?.damage || 0) * (e.combo > 1 ? 1 : 0) + e.damage };
        // the attacker is drawn on top
        this.drawOrder = [e.target, e.who];
      }
      if (e.type === 'announce') this.hud.announce = { text: e.text, t: 0, style: e.style, sub: e.sub };
      if (e.type === 'roundIntro') this.hud.trail = fs.map((f) => f.maxHealth);
    }
    fs.forEach((f, i) => {
      this.secondary[i].tick(f);
      this.hud.trail[i] = f.health < this.hud.trail[i] ? (f.hitstop > 0 || f.state === 'hitstun' || f.state === 'juggle' ? this.hud.trail[i] : this.hud.trail[i] - 6) : f.health;
      const c = this.hud.combo[i];
      if (c && --c.life <= 0) this.hud.combo[i] = null;
    });
    for (const f of fs) if (f.state === 'attack' && f.move?.frame === 1) this.drawOrder = [1 - f.index, f.index];
    this.trails.tick(fs);
    this.effects.tick(fs);
    this.arena.tick();
    if (this.hud.announce) this.hud.announce.t++;
  }

  render(ctx, alpha, { debug = null, now = 0 } = {}) {
    const fs = this.match.fighters;
    const fat = this.match.fatality;
    this.cam.update(fs, alpha, this.effects.shake, fat ? { x: fat.camX ?? (fat.ax + fat.vx) / 2, y: fat.camY || 0, zoom: fat.camZoom || 1.34, kick: fat.cine.punch } : null);
    ctx.save();
    this.arena.drawBack(ctx, this.cam);
    if (fat) {
      // the world dims around the finishing scene
      const k = Math.min(1, fat.t / 20) * (this.match.phase === 'fatality' ? 1 : 0.8);
      ctx.fillStyle = `rgba(16,0,8,${0.5 * k})`;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      fat.script.draw?.(ctx, fat, this.cam, 'back', alpha, now);
    }
    if (this.match.freeze) {
      // super flash: darken the stage behind the fighters
      const k = Math.min(1, (this.match.freeze.total - this.match.freeze.ticks) / 6);
      ctx.fillStyle = `rgba(10,2,20,${0.62 * k})`;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }
    for (const f of fs) this.drawShadow(ctx, f, alpha);
    for (const i of fat ? fat.order : this.drawOrder) this.drawFighter(ctx, fs[i], i, alpha, now);
    if (fat) fat.script.draw?.(ctx, fat, this.cam, 'front', alpha, now);
    this.trails.draw(ctx, this.cam, fs.map((f) => f.def.look.rim));
    this.drawProjectiles(ctx, now);
    this.effects.draw(ctx, this.cam);
    this.arena.drawFront(ctx, this.cam);
    if (this.effects.flash > 0.02) {
      ctx.fillStyle = rgba('#ffffff', this.effects.flash);
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }
    if (fat) {
      // cinematic direction: grade, spotlight, rays, speed lines, impact frames (fatality/cinema.js)
      fat.cine.drawScene(ctx, fat, this.cam, VIEW.width, VIEW.height, (color) => {
        for (const i of fat.order) {
          const f = fs[i], fx = f.fx || (f.fx = {});
          const keep = [fx.tint, fx.tintColor];
          fx.tint = 1; fx.tintColor = color;
          this.drawFighter(ctx, f, i, alpha, now);
          [fx.tint, fx.tintColor] = keep;
        }
      });
    }
    ctx.restore();
    // the HUD steps aside while a fatality plays (letterboxed); it returns for the FATALITY title
    if (this.showHud && this.match.phase !== 'fatality') drawHud(ctx, this.match, this.hud, this.portraits);
    if (this.match.freeze) this.drawSuperCutIn(ctx, this.match.freeze);
    if (fat) fat.cine.drawFrame(ctx, fat, VIEW.width, VIEW.height, Math.min(1, fat.t / 18), this.match.phase === 'fatality');
    if (debug?.enabled) drawDebug(ctx, this.match, this.cam, debug);
  }

  interpolated(f, alpha) {
    const sameFacing = f.prev.facing === f.facing;
    let pose = sameFacing ? blendPoses(f.prev.pose, f.anim.pose, alpha, f.props, emptyPose()) : clonePose(f.anim.pose);
    pose = this.secondary[f.index].inertia.apply(pose);
    return {
      x: lerp(f.prev.x, f.body.x, alpha),
      y: lerp(f.prev.y, f.body.y, alpha),
      skel: computeSkeleton(pose, f.props),
    };
  }

  drawShadow(ctx, f, alpha) {
    if (f.fx?.hidden || f.fx?.noShadow) return;
    const x = lerp(f.prev.x, f.body.x, alpha), y = lerp(f.prev.y, f.body.y, alpha);
    const s = this.cam.toScreen(x, 0);
    const k = Math.max(0.35, 1 - y / 300);
    const lying = f.state === 'knockdown' || (f.state === 'ko' && f.body.onGround);
    const w = (lying ? 95 : 52) * k * this.cam.zoom * f.props.posScale;
    ctx.fillStyle = `rgba(6,2,12,${0.5 * k})`;
    ctx.beginPath();
    ctx.ellipse(s.x + (lying ? -f.facing * 20 : 0), s.y + 2, w, 10 * k * this.cam.zoom, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawFighter(ctx, f, i, alpha, now) {
    const { x, y, skel } = this.interpolated(f, alpha);
    const sec = this.secondary[i];
    const s = this.cam.toScreen(x, y);
    let jitter = 0;
    if (f.hitstop > 0 && f.flash > 0) jitter = (f.hitstop % 2 ? 1 : -1) * 3;
    let spin = 1;
    const mv = f.move;
    if (mv && ATTACK_POSES[mv.def.anim]?.spin && mv.frame <= mv.def.startup) {
      spin = Math.cos(Math.PI * 2 * Math.min(1, (mv.frame + alpha) / (mv.def.startup + 1)));
      if (Math.abs(spin) < 0.12) spin = 0.12 * Math.sign(spin || 1);
    }
    const z = this.cam.zoom;
    const sq = sec.squash;
    const fx = f.fx || {};
    if (fx.hidden) return;
    if (f.focus > 0) this.drawFocusAura(ctx, f, skel, now, z, s, 'back');
    ctx.save();
    if (fx.alpha !== undefined) ctx.globalAlpha = Math.max(0, Math.min(1, fx.alpha));
    if (fx.clipFloor) {
      // sinking through the floor: only what is above the boards is drawn
      ctx.beginPath();
      ctx.rect(0, 0, VIEW.width, this.cam.toScreen(0, 0).y);
      ctx.clip();
    }
    ctx.translate(s.x + jitter, s.y);
    if (fx.rot) ctx.rotate(fx.rot);
    if (fx.sx !== undefined || fx.sy !== undefined) ctx.scale(fx.sx ?? 1, fx.sy ?? 1);
    ctx.scale(z * f.facing * sec.facingScale * spin * (1 + 0.05 * sq), -z * (1 - 0.04 * sq));
    const expression = fx.face || faceFor(f);
    const blink = blinkAt(now / 1000 + i * 1.37, i);
    // held prop (Bruno's frying pan during his super); stance mirroring swaps the hand like hitboxes
    const taunt = f.state === 'taunt' ? f.sd.def : null;
    const prop = fx.prop || (taunt && rangeAt(taunt.prop, f.stateFrame)) || (mv?.def.prop && f.state === 'attack'
      ? { type: mv.def.prop.type, hand: f.stance === 1 ? (mv.def.prop.hand === 'F' ? 'B' : 'F') : mv.def.prop.hand }
      : null);
    // flaming fists only on fire moves (specials / super), never on normal attacks
    const fire = !!(mv?.def.fire && f.state === 'attack') || !!fx.fire || !!(taunt && rangeAt(taunt.fire, f.stateFrame));
    const claws = !!(mv?.def.claws && f.state === 'attack');
    const flurry = !!(mv?.def.flurry && f.state === 'attack') || !!(taunt && rangeAt(taunt.flurry, f.stateFrame));
    this.painters[i].draw(ctx, skel, {
      prop,
      fire,
      claws,
      flurry,
      critical: f.critical,
      clawMarks: f.clawMarks || 0,
      marks: f.marks,
      bite: !!(mv?.def.bite && f.state === 'attack') || !!fx.bite || !!(taunt && rangeAt(taunt.bite, f.stateFrame)),
      springExt: springExtension(mv, f),
      now,
      layers: f.anim.layers,
      tint: fx.tint ? fx.tint : f.flash > 0 ? 0.6 * (f.flash / 6) : 0,
      tintColor: fx.tint ? fx.tintColor : null,
      lookOverride: fx.look || null,
      chains: sec.localChains(alpha, x, y, f.facing),
      expression,
      blink,
      facing: f.facing * sec.facingScale * spin * (fx.sx ?? 1),
      envRim: this.envRim,
    });
    if (f.burn > 0) this.drawBurning(ctx, f, skel, now);
    if (mv?.def.pull && f.state === 'attack') this.drawTalon(ctx, f, skel, alpha);
    ctx.restore();
    if (f.focus > 0) this.drawFocusAura(ctx, f, skel, now, z, s, 'front');
    if (f.state === 'dizzy' || f.state === 'dazed' || fx.stars) this.drawDizzyStars(ctx, f, skel, x, y, now);
  }

  /** Focus (Tao's super buff): a pulsing golden aura behind the fighter (screen space). */
  drawFocusAura(ctx, f, skel, now, z, s, layer) {
    // Focus = qi: a faint golden warmth along the body, small flame-like tongues licking up from the
    // joints and sparks of qi drifting off every limb. All anchored to the skeleton, so it stands,
    // bends and lies down with the fighter; the qi itself always rises (like heat).
    const t = now / 1000, fade = Math.min(1, f.focus / 60), ps = f.props.posScale;
    const J = skel.j;
    const P = (j) => ({ x: s.x + j.x * z * f.facing, y: s.y - j.y * z });
    const pts = FOCUS_JOINTS.map((n) => P(J[n]));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (layer === 'front') return this.drawFocusSparks(ctx, pts, t, fade, z, ps), ctx.restore();
    // warmth: soft glows on the trunk and head
    for (const [n, r] of [['waist', 62], ['neck', 54], ['head', 40]]) drawGlow(ctx, P(J[n]).x, P(J[n]).y, r * z * ps, 0.07 * fade, '255,200,90');
    // tongues of qi: a slim teardrop per joint, flickering and leaning with a slow sway
    pts.forEach((p, k) => {
      const ph = t * 7 + k * 1.9;
      const h = (26 + 12 * Math.sin(ph) + 7 * Math.sin(ph * 2.3)) * z * ps, w = 7 * z * ps;
      const lean = Math.sin(t * 2 + k) * 0.25;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(lean);
      const g = ctx.createLinearGradient(0, 0, 0, -h);
      g.addColorStop(0, `rgba(255,214,110,${0.3 * fade})`);
      g.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-w, 0);
      ctx.quadraticCurveTo(-w * 0.8, -h * 0.55, 0, -h);
      ctx.quadraticCurveTo(w * 0.8, -h * 0.55, w, 0);
      ctx.quadraticCurveTo(0, w * 0.9, -w, 0);
      ctx.fill();
      ctx.restore();
    });
    ctx.restore();
  }

  /** Focus sparks in front of the body: each is born on a joint, drifts up and sideways, swells and fades. */
  drawFocusSparks(ctx, pts, t, fade, z, ps) {
    for (let i = 0; i < 22; i++) {
      const life = (t * (0.55 + (i % 5) * 0.08) + i * 0.137) % 1;
      const p = pts[(i * 7) % pts.length];
      const x = p.x + Math.sin(i * 12.9 + life * 5) * 10 * z + (i % 2 ? 1 : -1) * life * 8 * z;
      const y = p.y - life * 46 * z * ps;
      const a = Math.sin(life * Math.PI) * 0.75 * fade;
      const r = (1.2 + 1.6 * Math.sin(life * Math.PI)) * z;
      ctx.fillStyle = `rgba(255,226,140,${a})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,210,90,${a * 0.25})`;
      ctx.beginPath();
      ctx.arc(x, y, r * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Old Hawk's thrown talon: a hook on a line shooting out of his lead hand during the strike. */
  drawTalon(ctx, f, skel, alpha) {
    const m = f.move.def, fr = f.move.frame + alpha;
    const out = Math.min(1, Math.max(0, (fr - (m.startup - 3)) / 4));
    const back = Math.min(1, Math.max(0, (fr - (m.startup + m.active)) / 6));
    const k = out * (1 - back);
    if (k <= 0 || f.move.contact === 'hit') return; // on a hit the reel-in tether takes over
    const side = f.stance === 1 ? 'B' : 'F';
    const H = skel.j['hand' + side], E = skel.j['elbow' + side];
    const ang = Math.atan2(H.y - E.y, H.x - E.x);
    const L = TALON_REACH * k;
    const tx = H.x + Math.cos(ang) * L, ty = H.y + Math.sin(ang) * L;
    ctx.lineCap = 'round';
    for (const [w, c] of [[5, '#0c0610'], [2.4, '#3fe6d0'], [0.9, '#e8fffb']]) {
      ctx.strokeStyle = c;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(H.x, H.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }
    // the talon: three curved hooks
    ctx.strokeStyle = '#3fe6d0';
    ctx.lineWidth = 3;
    for (const s of [-0.7, 0, 0.7]) {
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.quadraticCurveTo(tx + Math.cos(ang + s) * 14, ty + Math.sin(ang + s) * 14, tx + Math.cos(ang + s * 2.2) * 10 - Math.cos(ang) * 4, ty + Math.sin(ang + s * 2.2) * 10 - Math.sin(ang) * 4);
      ctx.stroke();
    }
  }

  /** Burn status: flames licking up from the body (fighter-local space, +y up). */
  drawBurning(ctx, f, skel, now) {
    const t = now / 1000, J = skel.j;
    const fade = Math.min(1, f.burn / 60);
    ctx.save();
    ctx.globalAlpha = 0.9 * fade;
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, (J.pelvis.x + J.neck.x) / 2, (J.pelvis.y + J.neck.y) / 2, 90, 0.28);
    ctx.globalCompositeOperation = prev;
    const spots = [['neck', 12, 34], ['shoulderB', 10, 28], ['pelvis', 13, 34], ['kneeF', 9, 26], ['elbowF', 9, 24], ['head', 10, 30], ['kneeB', 8, 22], ['shoulderF', 10, 28]];
    spots.forEach(([j, w, h], k) => {
      const p = J[j];
      if (!p) return;
      drawFlame(ctx, p.x + Math.sin(t * 3 + k) * 4, p.y, w, h * (0.8 + 0.3 * Math.sin(t * 5 + k * 1.3)), t, k * 2.3);
    });
    ctx.restore();
  }

  drawProjectiles(ctx, now) {
    for (const p of this.match.projectiles || []) {
      const s = this.cam.toScreen(p.x, p.y);
      const z = this.cam.zoom;
      ctx.save();
      ctx.translate(s.x, s.y);
      if (p.kind === 'flame') {
        // roiling fire burst: glow + a ring of tongues streaming backwards
        const t = now / 1000, dir = Math.sign(p.vx) || 1;
        const grow = Math.min(1, p.age / 6) * (1 - Math.max(0, p.age - p.life + 8) / 12);
        const R = p.r * z * (0.7 + 0.3 * grow);
        const prev = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, 0, 0, R * 2.2, 0.6);
        ctx.globalCompositeOperation = prev;
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2 + t * 4;
          drawFlame(ctx, Math.cos(a) * R * 0.45 - dir * 6 * z, Math.sin(a) * R * 0.45, R * 0.42, R * 1.1, t, i * 1.9, -1);
        }
        drawGlow(ctx, 0, 0, R * 0.7, 0.9, '255,236,170');
      } else if (p.kind === 'coin') {
        // spinning gold coin with a glint trail
        for (let i = 1; i <= 4; i++) {
          ctx.fillStyle = `rgba(255,210,63,${0.18 / i})`;
          ctx.beginPath();
          ctx.arc(-Math.sign(p.vx) * i * 10 * z, 0, p.r * z * (1 - i * 0.12), 0, Math.PI * 2);
          ctx.fill();
        }
        const w = Math.abs(Math.cos(p.age * 0.45)) * p.r * z + 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, w, p.r * z, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#e2b440';
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#5a3a10';
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(0, 0, w * 0.55, p.r * z * 0.55, 0, 0, Math.PI * 2);
        ctx.strokeStyle = '#fff2a8';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (p.kind === 'quake') {
        // ground tremor: a cracking ridge of planks and dust rolling along the floor
        const dir = Math.sign(p.vx) || 1, t = p.age;
        for (let i = 0; i < 5; i++) {
          const x = -dir * i * 12 * z, h = (18 - i * 3 + Math.sin(t * 0.9 + i) * 3) * z;
          ctx.fillStyle = `rgba(216,200,232,${0.5 - i * 0.08})`;
          ctx.beginPath();
          ctx.ellipse(x, -h * 0.3, (14 - i) * z, h * 0.6, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#5a3a2a';
        ctx.strokeStyle = '#140c10';
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          const x = (dir * 6 - i * dir * 10) * z, up = (14 + Math.sin(t * 1.3 + i * 2) * 4) * z;
          ctx.moveTo(x - 7 * z, 4 * z);
          ctx.lineTo(x - 2 * z, -up);
          ctx.lineTo(x + 6 * z, -up * 0.6);
          ctx.lineTo(x + 8 * z, 4 * z);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      } else if (p.kind === 'pie') {
        // cream pie spinning flat through the air
        const sp = Math.cos(p.age * 0.35);
        const R = p.r * z;
        ctx.rotate(p.age * 0.05 * (Math.sign(p.vx) || 1));
        ctx.beginPath();
        ctx.ellipse(0, 0, R, Math.max(3, Math.abs(sp) * R), 0, 0, Math.PI * 2);
        ctx.fillStyle = '#c88a3a';
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#3a200c';
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(0, -Math.abs(sp) * R * 0.25, R * 0.85, Math.max(2, Math.abs(sp) * R * 0.7), 0, 0, Math.PI * 2);
        ctx.fillStyle = '#fff6e8';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, -Math.abs(sp) * R * 0.4, R * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = '#e8203a';
        ctx.fill();
      } else if (p.kind === 'notes') {
        // three bobbing music notes
        const dir = Math.sign(p.vx) || 1;
        const cols = ['#ff3fd0', '#3fe6d0', '#ffd23f'];
        for (let i = 0; i < 3; i++) {
          const x = -dir * i * 16 * z, y = Math.sin(p.age * 0.25 + i * 2) * 10 * z - i * 4 * z;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(Math.sin(p.age * 0.2 + i) * 0.3);
          ctx.fillStyle = cols[i];
          ctx.strokeStyle = '#140c10';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(0, 6 * z, 6 * z, 4.5 * z, -0.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillRect(4.5 * z, -14 * z, 2.6 * z, 20 * z);
          if (i !== 1) { ctx.beginPath(); ctx.moveTo(7 * z, -14 * z); ctx.quadraticCurveTo(14 * z, -8 * z, 12 * z, -2 * z); ctx.lineWidth = 3 * z; ctx.strokeStyle = cols[i]; ctx.stroke(); }
          ctx.restore();
        }
      } else {
        // sonic wave: pulsing concentric arcs
        const dir = Math.sign(p.vx);
        for (let i = 0; i < 4; i++) {
          const r = (p.r * 0.5 + i * 9 + (p.age % 8)) * z;
          ctx.strokeStyle = `rgba(63,230,208,${0.9 - i * 0.2})`;
          ctx.lineWidth = 5 - i;
          ctx.beginPath();
          ctx.arc(-dir * 18 * z, 0, r, dir > 0 ? -0.9 : Math.PI - 0.9, dir > 0 ? 0.9 : Math.PI + 0.9);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255,63,208,0.35)';
        ctx.beginPath();
        ctx.arc(0, 0, p.r * 0.5 * z, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /** Super flash cut-in: the attacker's portrait slides in on a diagonal band with the move name. */
  drawSuperCutIn(ctx, fr) {
    const f = this.match.fighters[fr.who];
    const t = 1 - fr.ticks / fr.total; // 0..1
    const W = VIEW.width, H = VIEW.height;
    const left = fr.who === 0;
    const slide = t < 0.2 ? 1 - t / 0.2 : t > 0.85 ? -(t - 0.85) / 0.15 : 0;
    const off = slide * W * (left ? -1 : 1);
    ctx.save();
    ctx.translate(off, 0);
    const y0 = H * 0.3, y1 = H * 0.66;
    ctx.beginPath();
    ctx.moveTo(0, y0 + 40); ctx.lineTo(W, y0 - 40); ctx.lineTo(W, y1 - 40); ctx.lineTo(0, y1 + 40);
    ctx.closePath();
    const col = left ? '#ff3fd0' : '#3fe6d0';
    const g = ctx.createLinearGradient(0, y0, W, y1);
    g.addColorStop(0, rgba(col, 0.92));
    g.addColorStop(1, 'rgba(20,6,30,0.95)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    ctx.clip();
    // speed lines
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 18; i++) {
      const yy = y0 + ((i * 37 + this.cam.t * 9) % (y1 - y0 + 80)) - 40;
      ctx.beginPath();
      ctx.moveTo(0, yy); ctx.lineTo(W, yy - 80);
      ctx.stroke();
    }
    const img = this.portraits[f.def.id];
    if (img && img.complete && img.naturalWidth) {
      const ph = (y1 - y0) * 1.9, pw = ph * (img.naturalWidth / img.naturalHeight);
      const px = left ? 60 : W - 60 - pw;
      ctx.drawImage(img, 0, img.naturalHeight * 0.02, img.naturalWidth, img.naturalHeight * 0.55, px, y0 - 40, pw, ph * 0.55);
    }
    ctx.restore();
    ctx.font = '900 64px "Arial Black", Impact, sans-serif';
    ctx.textAlign = left ? 'right' : 'left';
    const tx = left ? W - 60 : 60;
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#120816';
    ctx.strokeText(fr.name.toUpperCase(), tx, H * 0.53);
    ctx.fillStyle = '#fff6c8';
    ctx.fillText(fr.name.toUpperCase(), tx, H * 0.53);
    ctx.font = '900 22px "Arial Black", Impact, sans-serif';
    ctx.fillStyle = col;
    ctx.strokeText('SUPER', tx, H * 0.53 - 62);
    ctx.fillText('SUPER', tx, H * 0.53 - 62);
    ctx.restore();
  }

  drawDizzyStars(ctx, f, skel, x, y, now) {
    const h = skel.j.head;
    const c = this.cam.toScreen(x + h.x * f.facing, y + h.y + f.props.headR * 2);
    for (let k = 0; k < 4; k++) {
      const a = now / 300 + (k * Math.PI) / 2;
      const px = c.x + Math.cos(a) * 26, py = c.y + Math.sin(a) * 8;
      ctx.fillStyle = k % 2 ? '#ffd23f' : '#3fe6d0';
      ctx.beginPath();
      for (let n = 0; n < 10; n++) {
        const r = n % 2 ? 2.5 : 6;
        const aa = (n / 10) * Math.PI * 2 + a;
        ctx.lineTo(px + Math.cos(aa) * r, py + Math.sin(aa) * r);
      }
      ctx.fill();
    }
  }
}
