// Developer overlay: skeleton, joints, centre of gravity, hit/hurt/push boxes, state, frame
// phase, velocities and the reason each hit was accepted or rejected. Uses the *simulated*
// (non-interpolated) state, i.e. exactly what the collision system sees this tick.
import { VIEW } from '../config/constants.js';

const BONES = [
  ['pelvis', 'waist'], ['waist', 'neck'], ['neck', 'headBase'], ['headBase', 'head'],
  ['shoulderF', 'elbowF'], ['elbowF', 'wristF'], ['wristF', 'handF'],
  ['shoulderB', 'elbowB'], ['elbowB', 'wristB'], ['wristB', 'handB'],
  ['pelvis', 'hipF'], ['hipF', 'kneeF'], ['kneeF', 'ankleF'], ['heelF', 'toeF'],
  ['pelvis', 'hipB'], ['hipB', 'kneeB'], ['kneeB', 'ankleB'], ['heelB', 'toeB'],
];

function capsule(ctx, cam, c, stroke, fill) {
  const a = cam.toScreen(c.a.x, c.a.y), b = cam.toScreen(c.b.x, c.b.y);
  ctx.lineCap = 'round';
  ctx.strokeStyle = fill;
  ctx.lineWidth = c.r * 2 * cam.zoom;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x + 0.01, b.y);
  ctx.stroke();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
  const nx = (-dy / L) * c.r * cam.zoom, ny = (dx / L) * c.r * cam.zoom;
  ctx.beginPath();
  ctx.moveTo(a.x + nx, a.y + ny);
  ctx.lineTo(b.x + nx, b.y + ny);
  ctx.arc(b.x, b.y, c.r * cam.zoom, Math.atan2(ny, nx), Math.atan2(ny, nx) - Math.PI, true);
  ctx.lineTo(a.x - nx, a.y - ny);
  ctx.arc(a.x, a.y, c.r * cam.zoom, Math.atan2(-ny, -nx), Math.atan2(-ny, -nx) - Math.PI, true);
  ctx.stroke();
}

export function drawDebug(ctx, match, cam, dbg) {
  ctx.save();
  ctx.font = '12px Menlo, Consolas, monospace';
  for (const f of match.fighters) {
    const W = (p) => cam.toScreen(f.body.x + p.x * f.facing, f.body.y + p.y);
    // pushbox
    const pb = f.body.pushbox();
    const p0 = cam.toScreen(pb.x, pb.y + pb.h), p1 = cam.toScreen(pb.x + pb.w, pb.y);
    ctx.strokeStyle = 'rgba(80,255,120,0.9)';
    ctx.fillStyle = 'rgba(80,255,120,0.07)';
    ctx.lineWidth = 1.5;
    ctx.fillRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
    ctx.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
    // hurtboxes (head yellow, torso blue, limbs cyan); invulnerable parts grey
    const inv = f.invulnerability();
    for (const h of f.hurtboxes) {
      const off = inv === 'all' || (inv && inv.has(h.part));
      const col = off ? '150,150,150' : h.part === 'head' ? '255,220,60' : h.part === 'torso' ? '70,140,255' : '60,220,255';
      capsule(ctx, cam, h, `rgba(${col},0.9)`, `rgba(${col},0.16)`);
    }
    for (const h of f.hitboxes) capsule(ctx, cam, h, 'rgba(255,40,40,1)', 'rgba(255,40,40,0.35)');
    // skeleton
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [a, b] of BONES) {
      const A = W(f.skel.j[a]), B = W(f.skel.j[b]);
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
    }
    ctx.stroke();
    ctx.fillStyle = '#ff3fd0';
    for (const k in f.skel.j) {
      const p = W(f.skel.j[k]);
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    // centre of gravity
    const c = W(f.cog);
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 7, 0, Math.PI * 2);
    ctx.moveTo(c.x - 11, c.y); ctx.lineTo(c.x + 11, c.y);
    ctx.moveTo(c.x, c.y - 11); ctx.lineTo(c.x, c.y + 11);
    ctx.stroke();
    const g = cam.toScreen(f.body.x + f.cog.x * f.facing, 0);
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(g.x, g.y);
    ctx.stroke();
    ctx.setLineDash([]);
    // velocity vector
    const o = cam.toScreen(f.body.x, f.body.y + 4);
    ctx.strokeStyle = '#7fe8ff';
    ctx.beginPath();
    ctx.moveTo(o.x, o.y);
    ctx.lineTo(o.x + f.body.vx * 8, o.y - f.body.vy * 8);
    ctx.stroke();

    // text panel
    const left = f.index === 0;
    const px = left ? 12 : VIEW.width - 312, py = 140;
    ctx.fillStyle = 'rgba(8,4,12,0.78)';
    ctx.fillRect(px, py, 300, 196);
    ctx.fillStyle = '#ffffff';
    const mv = f.move;
    const phase = mv ? f.movePhase() : '-';
    const lines = [
      `P${f.index + 1} ${f.def.id}  state: ${f.state} (${f.stateFrame})`,
      mv ? `move: ${mv.def.id} ${mv.def.name}  f${mv.frame}/${mv.def.startup + mv.def.active + mv.def.recovery}` : 'move: -',
      mv ? `phase: ${phase.toUpperCase()}  S${mv.def.startup} A${mv.def.active} R${mv.def.recovery}` : 'phase: -',
      `pos ${f.body.x.toFixed(1)}, ${f.body.y.toFixed(1)}  vel ${f.body.vx.toFixed(2)}, ${f.body.vy.toFixed(2)}`,
      `momentum ${(f.body.vx * f.body.mass).toFixed(2)}  mass ${f.body.mass}  grav x${f.body.gravityScale.toFixed(2)}`,
      `hitstop ${f.hitstop}  facing ${f.facing > 0 ? 'R' : 'L'}  stance ${f.stance ? 'switch' : 'orth'}  wall ${f.body.wall}`,
      `combo taken ${f.combo.hits} (${f.combo.damage})  juggle ${f.combo.juggle}  stun ${f.stun.toFixed(0)}`,
      `input ${f.input.dir}  ${['lp', 'hp', 'lk', 'hk'].map((b) => (f.input.held(b) ? b.toUpperCase() : '..')).join(' ')}`,
    ];
    lines.forEach((l, k) => {
      ctx.fillStyle = k === 2 && phase === 'active' ? '#ff6060' : k === 2 && phase === 'startup' ? '#ffd23f' : '#ffffff';
      ctx.fillText(l, px + 8, py + 18 + k * 15);
    });
    ctx.fillStyle = '#9fffcf';
    f.hitLog.slice(-3).forEach((h, k) => ctx.fillText(`[t${h.tick} ${h.move}] ${h.reason}`.slice(0, 44), px + 8, py + 144 + k * 15));
  }
  ctx.fillStyle = 'rgba(8,4,12,0.78)';
  ctx.fillRect(VIEW.width / 2 - 170, VIEW.height - 34, 340, 26);
  ctx.fillStyle = '#ffd23f';
  ctx.textAlign = 'center';
  ctx.fillText(`tick ${match.frame}  speed x${dbg.timeScale}${dbg.paused ? '  PAUSED (F4 = step)' : ''}`, VIEW.width / 2, VIEW.height - 16);
  ctx.restore();
}
