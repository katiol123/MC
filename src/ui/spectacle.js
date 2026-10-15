// Post-match SPECTACLE report: an animated, multi-step window showing the spectacle points each
// fighter earned in the match and what for.
//   1. the band sweeps in, both portraits slide in, the score slams down, the winner is stamped
//   2. each fighter's highlights reveal one by one (icon pops, label slides, points count up)
//   3. the match totals count up and convert into FAME, then each fighter's fame bar fills up
//   4. CONTINUE pulses. Enter / Space / click skips straight to the end; again closes.
import { ROSTER } from '../data/fighters.js';
import { SPECTACLE_RULES } from '../tournament/stats.js';
import { el } from './dom.js';

const NAME = Object.fromEntries(ROSTER.map((f) => [f.id, f.name]));
const HINT = Object.fromEntries(SPECTACLE_RULES.map((r) => [r.key, r.hint || (r.per ? `${r.per} pts each` : '')]));

export function showSpectacle(app, m, before, onClose) {
  const r = m.result;
  const ids = [m.a, m.b];
  const timers = [];
  const steps = []; // [{at, fn}] - fn(instant)
  let finished = false;
  let closed = false;
  const at = (ms, fn) => steps.push({ at: ms, fn });

  const countUp = (node, to, ms, instant, prefix = '') => {
    if (instant || ms <= 0) { node.textContent = `${prefix}${to}`; return; }
    const t0 = performance.now();
    const tick = () => {
      if (closed) return;
      const k = Math.min(1, (performance.now() - t0) / ms);
      node.textContent = `${prefix}${Math.round(to * (1 - Math.pow(1 - k, 3)))}`;
      if (k < 1 && !finished) requestAnimationFrame(tick);
      else node.textContent = `${prefix}${to}`;
    };
    requestAnimationFrame(tick);
  };

  // --- layout ----------------------------------------------------------------------------------
  const fameOf = (i) => r.sides[i].fame ?? r.sides[i].spectacle.total;
  const maxSp = Math.max(1, ...ids.map((id, i) => (before[i] || 0) + fameOf(i)));
  const cols = ids.map((id, i) => {
    const s = r.sides[i].spectacle;
    const won = r.winner === i;
    const rows = s.items.map((it) => {
      const pts = el('b', { class: 'sp-pts' }, ['+0']);
      const row = el('div', { class: 'sp-row', title: HINT[it.key] || '' }, [
        el('span', { class: 'sp-icon' }, [it.icon]),
        el('span', { class: 'sp-label' }, [it.label]),
        el('span', { class: 'sp-count' }, [`×${it.count}`]),
        pts,
      ]);
      return { row, pts, it };
    });
    const total = el('div', { class: 'sp-total-num' }, ['0']);
    const balFrom = before[i] || 0, balTo = balFrom + fameOf(i);
    const fameChip = el('div', { class: 'sp-fame' }, [`→ +${fameOf(i)} FAME`]);
    const barOld = el('div', { class: 'sp-bar-old', style: { width: `${(balFrom / maxSp) * 100}%` } });
    const barNew = el('div', { class: 'sp-bar-new', style: { width: `${(balFrom / maxSp) * 100}%` } });
    const balNum = el('span', { class: 'sp-bal-num' }, [String(balFrom)]);
    const col = el('div', { class: `sp-col ${i ? 'right' : 'left'} ${won ? 'won' : ''}` }, [
      el('div', { class: 'sp-head' }, [
        el('div', { class: 'sp-portrait', style: { backgroundImage: `url(${app.portraitURL(id)})` } }),
        el('div', { class: 'sp-name' }, [NAME[id], won ? el('span', { class: 'sp-stamp' }, ['WINNER']) : null]),
      ]),
      el('div', { class: 'sp-list' }, rows.length ? rows.map((x) => x.row) : [el('div', { class: 'sp-row empty' }, ['no highlights this time'])]),
      el('div', { class: 'sp-total' }, [el('span', {}, ['SPECTACLE']), total]),
      fameChip,
      el('div', { class: 'sp-bal' }, [
        el('div', { class: 'sp-bal-label' }, [el('span', {}, ['★ FAME']), balNum]),
        el('div', { class: 'sp-bar' }, [barOld, barNew]),
      ]),
    ]);
    return { col, rows, total, s, barNew, balNum, balFrom, balTo, won };
  });

  const score = el('div', { class: 'sp-score' }, [`${r.wins[0]} : ${r.wins[1]}`]);
  const cont = el('button', { class: 'tbtn big sp-continue', onclick: (e) => { e.stopPropagation(); advance(); } }, ['CONTINUE ▸']);
  const root = el('div', { class: 'menu-overlay spectacle' }, [
    el('div', { class: 'sp-band' }, [el('span', {}, ['SPECTACLE REPORT'])]),
    el('div', { class: 'sp-body' }, [cols[0].col, el('div', { class: 'sp-mid' }, [score, el('div', { class: 'sp-vs' }, ['FINAL'])]), cols[1].col]),
    el('div', { class: 'sp-foot' }, [cont, el('div', { class: 'sp-hint' }, ['Spectacle points turn into fame · fame buys upgrades between fights'])]),
  ]);
  root.addEventListener('click', () => advance());

  // --- timeline --------------------------------------------------------------------------------
  at(0, () => root.classList.add('s0'));
  at(250, () => { root.classList.add('s1'); app.audio.ui('slam'); });
  at(700, () => { root.classList.add('s2'); app.audio.ui('slam'); });
  let tl = 1100;
  const n = Math.max(cols[0].rows.length, cols[1].rows.length);
  for (let k = 0; k < n; k++) {
    for (const c of cols) {
      const x = c.rows[k];
      if (!x) continue;
      at(tl, (instant) => {
        x.row.classList.add('in');
        countUp(x.pts, x.it.points, 380, instant, '+');
        if (!instant) app.audio.ui('move');
      });
    }
    tl += 230;
  }
  tl += 200;
  at(tl, (instant) => {
    root.classList.add('s3');
    for (const c of cols) countUp(c.total, c.s.total, 700, instant);
    if (!instant) app.audio.ui('confirm');
  });
  tl += 850;
  at(tl, (instant) => {
    root.classList.add('s4');
    for (const c of cols) {
      c.barNew.style.width = `${(c.balTo / maxSp) * 100}%`;
      if (instant) c.balNum.textContent = String(c.balTo);
      // the counter runs from the old balance to the new one
      if (!instant) {
        const from = c.balFrom, to = c.balTo, t0 = performance.now();
        const tick = () => {
          if (closed) return;
          const k = Math.min(1, (performance.now() - t0) / 900);
          c.balNum.textContent = String(Math.round(from + (to - from) * k));
          if (k < 1 && !finished) requestAnimationFrame(tick);
          else c.balNum.textContent = String(to);
        };
        requestAnimationFrame(tick);
      }
    }
  });
  tl += 1000;
  at(tl, () => { root.classList.add('s5'); finished = true; });

  for (const s of steps) timers.push(setTimeout(() => { if (!finished || s.at === tl) s.fn(false); }, s.at));

  function skip() {
    finished = true;
    for (const id of timers) clearTimeout(id);
    root.classList.add('instant');
    for (const s of steps) s.fn(true);
  }
  function close() {
    if (closed) return;
    closed = true;
    for (const id of timers) clearTimeout(id);
    unsub();
    root.classList.add('out');
    setTimeout(() => { root.remove(); onClose?.(); }, 220);
  }
  function advance() {
    if (!finished) skip();
    else { app.audio.ui('confirm'); close(); }
  }
  const unsub = app.keyboard.onPress((code) => {
    if (['Enter', 'Space', 'Escape', 'KeyF', 'KeyJ'].includes(code)) advance();
  });
  document.getElementById('ui').appendChild(root);
  return { close };
}
