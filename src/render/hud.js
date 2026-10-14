// Fight HUD: slanted health bars with damage trail, stun meters, portraits, timer, round pips,
// combo counters and round announcements.
import { VIEW } from '../config/constants.js';
import { rgba } from './color.js';

const FONT = '"Arial Black", Impact, "Segoe UI", sans-serif';

function slanted(ctx, x, y, w, h, skew) {
  ctx.beginPath();
  ctx.moveTo(x + skew, y);
  ctx.lineTo(x + w + skew, y);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
}

function portraitIcon(ctx, img, cx, cy, r, color, flip) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#140a18';
  ctx.fill();
  ctx.clip();
  if (img && img.complete && img.naturalWidth) {
    const sw = img.naturalWidth * 0.62, sh = sw;
    const sx = img.naturalWidth * 0.19, sy = img.naturalHeight * 0.07;
    ctx.translate(cx, cy);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(img, sx, sy, sw, sh, -r, -r, r * 2, r * 2);
  }
  ctx.restore();
}

export function drawHud(ctx, match, hud, portraits) {
  const W = VIEW.width;
  const fs = match.fighters;
  ctx.save();
  const barW = 470, barH = 26, top = 34;
  fs.forEach((f, i) => {
    const left = i === 0;
    const x = left ? 108 : W - 108 - barW;
    const col = left ? '#ff3fd0' : '#3fe6d0';
    // frame
    slanted(ctx, x - 6, top - 6, barW + 12, barH + 12, left ? 10 : -10);
    ctx.fillStyle = 'rgba(12,6,18,0.85)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgba(col, 0.9);
    ctx.stroke();
    const k = Math.max(0, f.health / f.maxHealth);
    const kt = Math.max(0, hud.trail[i] / f.maxHealth);
    // trail (recent damage)
    const tw = barW * kt, hw = barW * k;
    slanted(ctx, left ? x + barW - tw : x, top, tw, barH, left ? 8 : -8);
    ctx.fillStyle = '#ff5a3a';
    ctx.fill();
    slanted(ctx, left ? x + barW - hw : x, top, hw, barH, left ? 8 : -8);
    const g = ctx.createLinearGradient(0, top, 0, top + barH);
    const low = k < 0.25;
    g.addColorStop(0, low ? '#ffe36a' : '#fff2a8');
    g.addColorStop(0.45, low ? '#ff9a2a' : '#ffd23f');
    g.addColorStop(1, low ? '#c43a1a' : '#d98a14');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    slanted(ctx, left ? x + barW - hw : x, top + 2, hw, 5, left ? 2 : -2);
    ctx.fill();
    // stun meter
    const sk = Math.min(1, f.stun / f.stats.stunMax);
    ctx.fillStyle = 'rgba(12,6,18,0.8)';
    ctx.fillRect(left ? x + barW - 220 : x, top + barH + 9, 220, 6);
    ctx.fillStyle = sk > 0.8 ? '#ff4040' : '#7fe8ff';
    ctx.fillRect(left ? x + barW - 220 * sk : x, top + barH + 9, 220 * sk, 6);
    // name
    ctx.font = `900 19px ${FONT}`;
    ctx.textAlign = left ? 'left' : 'right';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#120816';
    const name = f.def.name;
    ctx.strokeText(name, left ? x + 4 : x + barW - 4, top + barH + 38);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(name, left ? x + 4 : x + barW - 4, top + barH + 38);
    // round wins
    for (let r = 0; r < match.opts.roundsToWin; r++) {
      const px = left ? x + barW - 18 - r * 26 : x + 18 + r * 26;
      ctx.beginPath();
      ctx.arc(px, top + barH + 32, 8, 0, Math.PI * 2);
      ctx.fillStyle = r < match.wins[i] ? col : 'rgba(255,255,255,0.12)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#120816';
      ctx.stroke();
    }
    portraitIcon(ctx, portraits[f.def.id], left ? 58 : W - 58, top + 22, 38, col, !left);
    // combo counter
    const c = hud.combo[i];
    if (c && c.hits >= 2) {
      const a = Math.min(1, c.life / 20);
      ctx.textAlign = left ? 'left' : 'right';
      const cx = left ? 40 : W - 40;
      ctx.font = `900 64px ${FONT}`;
      ctx.lineWidth = 8;
      ctx.strokeStyle = rgba('#120816', a);
      ctx.strokeText(`${c.hits}`, cx, 250);
      ctx.fillStyle = rgba(col, a);
      ctx.fillText(`${c.hits}`, cx, 250);
      ctx.font = `900 22px ${FONT}`;
      ctx.strokeText('HITS', cx, 278);
      ctx.fillStyle = rgba('#ffffff', a);
      ctx.fillText('HITS', cx, 278);
    }
  });
  // timer
  const t = match.timeLeft;
  ctx.textAlign = 'center';
  slanted(ctx, W / 2 - 44, 20, 88, 62, 0);
  ctx.fillStyle = 'rgba(12,6,18,0.9)';
  ctx.fill();
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = `900 44px ${FONT}`;
  ctx.fillStyle = t !== Infinity && t <= 10 ? '#ff5a3a' : '#ffffff';
  ctx.fillText(t === Infinity ? '∞' : String(Math.max(0, t)).padStart(2, '0'), W / 2, 68);
  if (match.opts.training) {
    ctx.font = `900 14px ${FONT}`;
    ctx.fillStyle = '#3fe6d0';
    ctx.fillText('TRAINING', W / 2, 100);
  }
  // announcement
  const an = hud.announce;
  if (an && an.t < 90) {
    const k = an.t < 8 ? an.t / 8 : 1;
    const a = an.t > 70 ? 1 - (an.t - 70) / 20 : 1;
    const sc = 1.6 - 0.6 * k;
    ctx.save();
    ctx.translate(W / 2, VIEW.height * 0.42);
    ctx.scale(sc, sc);
    ctx.rotate(-0.04);
    ctx.font = `900 92px ${FONT}`;
    ctx.lineWidth = 14;
    ctx.strokeStyle = rgba('#120816', a);
    ctx.strokeText(an.text, 0, 0);
    const g = ctx.createLinearGradient(0, -70, 0, 10);
    g.addColorStop(0, rgba('#fff6c8', a));
    g.addColorStop(0.5, rgba('#ffd23f', a));
    g.addColorStop(1, rgba('#ff3fd0', a));
    ctx.fillStyle = g;
    ctx.fillText(an.text, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}
