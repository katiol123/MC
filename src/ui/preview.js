// Small live preview of a procedural fighter (used on the select screen): a standalone Fighter
// is driven through a shadow-boxing routine with the real simulation + animation code.
import { buildFighterDef } from '../data/fighters.js';
import { Fighter } from '../fighter/fighter.js';
import { FighterPainter } from '../render/fighterPainter.js';
import { SecondaryMotion } from '../render/secondary.js';
import { emptyRaw } from '../input/inputBuffer.js';
import { blendPoses, computeSkeleton, emptyPose } from '../anim/skeleton.js';
import { TICK_MS } from '../config/constants.js';

const ROUTINE = [
  [40, {}], [2, { lp: true }], [16, {}], [2, { lp: true }], [18, {}], [2, { hp: true }], [34, {}],
  [2, { lk: true }], [26, {}], [2, { hk: true }], [44, {}], [6, { down: true }], [2, { down: true, hp: true }], [44, {}],
  [3, { down: true }], [3, { down: true, right: true }], [2, { right: true, lp: true }], [60, {}],
  [2, { down: true }], [2, { down: true, left: true }], [2, { left: true, hk: true }], [70, {}],
];

export class FighterPreview {
  constructor(canvas, facing = 1) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.facing = facing;
    this.acc = 0;
    this.id = null;
  }
  setFighter(id) {
    if (this.id === id) return;
    this.id = id;
    this.def = buildFighterDef(id);
    this.f = new Fighter(this.def, 0, 1000, 1);
    this.painter = new FighterPainter(this.def);
    this.sec = new SecondaryMotion(this.def);
    this.step = 0;
    this.stepLeft = ROUTINE[0][0];
  }
  tick() {
    const [, spec] = ROUTINE[this.step];
    const raw = { ...emptyRaw(), ...spec };
    if (--this.stepLeft <= 0) {
      this.step = (this.step + 1) % ROUTINE.length;
      this.stepLeft = ROUTINE[this.step][0];
    }
    const f = this.f;
    f.snapshot();
    f.pushInput(raw);
    f.update(null);
    f.body.x = 1000;
    f.body.prevX = 1000;
    f.prev.x = 1000;
    f.updatePose();
    this.sec.tick(f);
  }
  frame(dt, scale = 1) {
    if (!this.f) return;
    this.acc += Math.min(dt, 100);
    while (this.acc >= TICK_MS) {
      this.tick();
      this.acc -= TICK_MS;
    }
    const a = this.acc / TICK_MS;
    const { ctx, canvas } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const k = canvas.width / 320;
    const g = ctx.createRadialGradient(canvas.width / 2, canvas.height - 26 * k, 4, canvas.width / 2, canvas.height - 26 * k, 120 * k);
    g.addColorStop(0, 'rgba(255,255,255,0.25)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const f = this.f;
    const pose = blendPoses(f.prev.pose, f.anim.pose, a, f.props, emptyPose());
    const skel = computeSkeleton(pose, f.props);
    ctx.save();
    ctx.translate(canvas.width / 2 - 30 * k * this.facing, canvas.height - 26 * k + -f.body.y * scale * k);
    ctx.scale(scale * k * this.facing, -scale * k);
    this.painter.draw(ctx, skel, { layers: f.anim.layers, chains: this.sec.localChains(a, f.body.x, f.body.y, 1) });
    ctx.restore();
  }
}
