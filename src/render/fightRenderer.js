// Draws a running Match: arena, fighters (interpolated between simulation ticks), effects, HUD and
// the debug overlay. Reads simulation state, never writes it.
import { VIEW } from '../config/constants.js';
import { lerp } from '../core/math.js';
import { blendPoses, computeSkeleton, emptyPose, clonePose } from '../anim/skeleton.js';
import { drawFlame, drawGlow } from './fire.js';
import { ATTACK_POSES } from '../anim/attackPoses.js';
import { FighterPainter } from './fighterPainter.js';
import { SecondaryMotion } from './secondary.js';
import { Effects, Trails } from './effects.js';
import { Camera } from './camera.js';
import { Arena } from './arena.js';
import { drawHud } from './hud.js';
import { drawDebug } from './debugDraw.js';
import { rgba } from './color.js';

export class FightRenderer {
  constructor(match, { arena = 'dusk', portraits = {}, hud = true } = {}) {
    this.match = match;
    this.showHud = hud;
    this.painters = match.fighters.map((f) => new FighterPainter(f.def));
    this.secondary = match.fighters.map((f) => new SecondaryMotion(f.def));
    this.effects = new Effects();
    this.trails = new Trails();
    this.cam = new Camera();
    this.cam.snap(match.fighters);
    this.arena = new Arena(arena);
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
      if (e.type === 'announce') this.hud.announce = { text: e.text, t: 0 };
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
    this.effects.tick();
    this.arena.tick();
    if (this.hud.announce) this.hud.announce.t++;
  }

  render(ctx, alpha, { debug = null, now = 0 } = {}) {
    const fs = this.match.fighters;
    this.cam.update(fs, alpha, this.effects.shake);
    ctx.save();
    this.arena.drawBack(ctx, this.cam);
    if (this.match.freeze) {
      // super flash: darken the stage behind the fighters
      const k = Math.min(1, (this.match.freeze.total - this.match.freeze.ticks) / 6);
      ctx.fillStyle = `rgba(10,2,20,${0.62 * k})`;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }
    for (const f of fs) this.drawShadow(ctx, f, alpha);
    for (const i of this.drawOrder) this.drawFighter(ctx, fs[i], i, alpha, now);
    this.trails.draw(ctx, this.cam, fs.map((f) => f.def.look.rim));
    this.drawProjectiles(ctx, now);
    this.effects.draw(ctx, this.cam);
    this.arena.drawFront(ctx, this.cam);
    if (this.effects.flash > 0.02) {
      ctx.fillStyle = rgba('#ffffff', this.effects.flash);
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }
    ctx.restore();
    if (this.showHud) drawHud(ctx, this.match, this.hud, this.portraits);
    if (this.match.freeze) this.drawSuperCutIn(ctx, this.match.freeze);
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
    ctx.save();
    ctx.translate(s.x + jitter, s.y);
    ctx.scale(z * f.facing * sec.facingScale * spin * (1 + 0.05 * sq), -z * (1 - 0.04 * sq));
    const expression = ['hitstun', 'juggle', 'stagger', 'knockdown', 'ko', 'dizzy', 'defeat'].includes(f.state) ? 'hurt' : null;
    const blink = (Math.floor((now + i * 1700) / 100) % 38) === 0;
    // held prop (Bruno's frying pan during his super); stance mirroring swaps the hand like hitboxes
    const prop = mv?.def.prop && f.state === 'attack'
      ? { type: mv.def.prop.type, hand: f.stance === 1 ? (mv.def.prop.hand === 'F' ? 'B' : 'F') : mv.def.prop.hand }
      : null;
    // flaming fists only on fire moves (specials / super), never on normal attacks
    const fire = !!(mv?.def.fire && f.state === 'attack');
    this.painters[i].draw(ctx, skel, {
      prop,
      fire,
      now,
      layers: f.anim.layers,
      tint: f.flash > 0 ? 0.6 * (f.flash / 6) : 0,
      chains: sec.localChains(alpha, x, y, f.facing),
      expression,
      blink,
    });
    if (f.burn > 0) this.drawBurning(ctx, f, skel, now);
    ctx.restore();
    if (f.state === 'dizzy') this.drawDizzyStars(ctx, f, skel, x, y, now);
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
