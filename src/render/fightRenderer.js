// Draws a running Match: arena, fighters (interpolated between simulation ticks), effects, HUD and
// the debug overlay. Reads simulation state, never writes it.
import { VIEW } from '../config/constants.js';
import { lerp } from '../core/math.js';
import { blendPoses, computeSkeleton, emptyPose } from '../anim/skeleton.js';
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
    for (const f of fs) this.drawShadow(ctx, f, alpha);
    for (const i of this.drawOrder) this.drawFighter(ctx, fs[i], i, alpha, now);
    this.trails.draw(ctx, this.cam, fs.map((f) => f.def.look.rim));
    this.effects.draw(ctx, this.cam);
    this.arena.drawFront(ctx, this.cam);
    if (this.effects.flash > 0.02) {
      ctx.fillStyle = rgba('#ffffff', this.effects.flash);
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }
    ctx.restore();
    if (this.showHud) drawHud(ctx, this.match, this.hud, this.portraits);
    if (debug?.enabled) drawDebug(ctx, this.match, this.cam, debug);
  }

  interpolated(f, alpha) {
    const sameFacing = f.prev.facing === f.facing;
    const pose = sameFacing ? blendPoses(f.prev.pose, f.anim.pose, alpha, f.props, emptyPose()) : f.anim.pose;
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
    this.painters[i].draw(ctx, skel, {
      layers: f.anim.layers,
      tint: f.flash > 0 ? 0.6 * (f.flash / 6) : 0,
      chains: sec.localChains(alpha, x, y, f.facing),
      expression,
      blink,
    });
    ctx.restore();
    if (f.state === 'dizzy') this.drawDizzyStars(ctx, f, skel, x, y, now);
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
