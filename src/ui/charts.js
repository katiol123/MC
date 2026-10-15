// Tournament charts: how any set of fighters moved through the tournament, round by round.
// Metrics: table place, fame balance, fame earned, attribute index (average bar incl. upgrades and
// injury damage), morale, stamina. Pick any fighters (or all) to compare.
//   - every fighter keeps one colour + marker shape whatever else is selected
//   - equal values never merge into one line: each series is nudged by a small fixed offset
//   - hover a line to bring it forward; hover the plot for a crosshair with every value of that round
import { ROSTER } from '../data/fighters.js';
import { el } from './dom.js';
import { faceStyle } from './faces.js';

const NAME = Object.fromEntries(ROSTER.map((f) => [f.id, f.name]));
const short = (id) => { const n = NAME[id] || id; const m = n.match(/"([^"]+)"/); return m ? m[1] : n.split(' ').slice(-1)[0]; };

const METRICS = [
  { key: 'place', label: 'PLACE', invert: true, fmt: (v) => `#${v}` },
  { key: 'fame', label: 'FAME (balance)', fmt: (v) => `★${v}` },
  { key: 'fameEarned', label: 'FAME EARNED', fmt: (v) => `★${v}` },
  { key: 'attr', label: 'ATTRIBUTES', fmt: (v) => `${v.toFixed(1)} %`, hint: 'average of the 10 bars (base + upgrades − injury damage), % of the roster range' },
  { key: 'morale', label: 'MORALE', fmt: (v) => String(v), fixed: [0, 100] },
  { key: 'stamina', label: 'STAMINA', fmt: (v) => String(v), fixed: [0, 100] },
];

// 16 fixed identity colours (well apart in hue, alternating lightness for neighbours) + 4 marker shapes
const COLORS = ['#ff4fd8', '#3fe6d0', '#ffd23f', '#7a8aff', '#ff8a3a', '#5ff07a', '#ff5a6a', '#4fb8ff',
  '#d88aff', '#c8f050', '#ffb8e0', '#2fb8a8', '#f0a050', '#a0a0ff', '#e0e0e0', '#ff3a9a'];
const SHAPES = ['circle', 'square', 'diamond', 'triangle'];

const W = 860, H = 470, PAD = { l: 58, r: 120, t: 18, b: 34 };

function marker(shape, x, y, r, color) {
  if (shape === 'square') return `<rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" rx="1.5" fill="${color}" stroke="#0c0610" stroke-width="2"/>`;
  if (shape === 'diamond') return `<path d="M${x} ${y - r - 1}L${x + r + 1} ${y}L${x} ${y + r + 1}L${x - r - 1} ${y}Z" fill="${color}" stroke="#0c0610" stroke-width="2"/>`;
  if (shape === 'triangle') return `<path d="M${x} ${y - r - 1}L${x + r + 1} ${y + r}L${x - r - 1} ${y + r}Z" fill="${color}" stroke="#0c0610" stroke-width="2"/>`;
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" stroke="#0c0610" stroke-width="2"/>`;
}

export function showCharts(app, t, onClose) {
  const ids = t.ids.slice();
  const colorOf = Object.fromEntries(ids.map((id, i) => [id, COLORS[i % COLORS.length]]));
  const shapeOf = Object.fromEntries(ids.map((id, i) => [id, SHAPES[i % SHAPES.length]]));
  const hist = (t.history || []).map((h, i) => (h ? { r: i, h } : null)).filter(Boolean);
  let metric = METRICS[0];
  let sel = new Set(standingsTop(t, 4));
  let hot = null;

  const plot = el('div', { class: 'ch-plot' });
  const tip = el('div', { class: 'ch-tip' });
  const chips = el('div', { class: 'ch-chips' });
  const tabs = el('div', { class: 'ch-tabs' });
  const note = el('div', { class: 'ch-note' });

  function draw() {
    tabs.replaceChildren(...METRICS.map((m) => el('button', { class: `ch-tab ${m === metric ? 'on' : ''}`, onclick: () => { metric = m; draw(); } }, [m.label])));
    chips.replaceChildren(
      el('button', { class: 'ch-chip all', onclick: () => { sel = new Set(ids); draw(); } }, ['ALL']),
      el('button', { class: 'ch-chip all', onclick: () => { sel = new Set(); draw(); } }, ['NONE']),
      ...ids.map((id) => el('button', {
        class: `ch-chip ${sel.has(id) ? 'on' : ''}`, style: { '--c': colorOf[id] },
        onclick: () => { sel.has(id) ? sel.delete(id) : sel.add(id); draw(); },
        onmouseenter: () => { hot = id; drawPlot(); }, onmouseleave: () => { hot = null; drawPlot(); },
      }, [el('span', { class: 'fx-face', style: faceStyle(app, id) }), el('i', {}), short(id)])),
    );
    note.textContent = metric.hint || (hist.length < 2 ? 'The charts fill in as rounds are completed.' : '');
    drawPlot();
  }

  function drawPlot() {
    const series = ids.filter((id) => sel.has(id));
    const xs = hist.map((x) => x.r);
    const maxR = Math.max(1, ...xs);
    let lo = Infinity, hi = -Infinity;
    for (const id of series) for (const { h } of hist) { const v = h[id]?.[metric.key]; if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }
    if (metric.key === 'place') { lo = 1; hi = ids.length; }
    else if (metric.fixed) [lo, hi] = metric.fixed;
    if (!(hi > lo)) { lo = (isFinite(lo) ? lo : 0) - 1; hi = (isFinite(hi) ? hi : 1) + 1; }
    const span = hi - lo, padv = metric.key === 'place' || metric.fixed ? 0 : span * 0.08;
    lo -= padv; hi += padv;
    const X = (r) => PAD.l + (r / maxR) * (W - PAD.l - PAD.r);
    const Y = (v) => {
      const k = (v - lo) / (hi - lo);
      return PAD.t + (metric.invert ? k : 1 - k) * (H - PAD.t - PAD.b);
    };
    // nudge: equal values stay distinguishable (each series a little up / down, fixed per fighter)
    const nudge = (id) => (series.length > 1 ? (ids.indexOf(id) - (ids.length - 1) / 2) * 1.1 : 0);
    let g = '';
    // grid + axes (recessive)
    const ticks = metric.key === 'place' ? [1, 4, 8, 12, 16].filter((v) => v <= ids.length) : niceTicks(lo, hi, 5);
    for (const v of ticks) {
      const y = Y(v);
      g += `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y}" y2="${y}" stroke="rgba(255,255,255,.08)"/>`;
      g += `<text x="${PAD.l - 8}" y="${y + 4}" text-anchor="end" class="ch-ax">${metric.fmt(v)}</text>`;
    }
    for (const r of xs) {
      if (maxR > 10 && r % 2 && r !== maxR) continue;
      g += `<text x="${X(r)}" y="${H - 10}" text-anchor="middle" class="ch-ax">${r === 0 ? 'start' : `R${r}`}</text>`;
    }
    // lines: the hovered one last (on top), others dimmed while something is hovered
    const order = series.filter((id) => id !== hot).concat(series.includes(hot) ? [hot] : []);
    for (const id of order) {
      const pts = hist.map(({ r, h }) => (h[id] ? [X(r), Y(h[id][metric.key]) + nudge(id)] : null)).filter(Boolean);
      if (!pts.length) continue;
      const dim = hot && hot !== id ? 0.18 : 1;
      const c = colorOf[id];
      g += `<g opacity="${dim}" data-id="${id}">`;
      g += `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#0c0610" stroke-width="5" stroke-linejoin="round"/>`;
      g += `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${c}" stroke-width="${hot === id ? 3.5 : 2}" stroke-linejoin="round"/>`;
      for (const [x, y] of pts) g += marker(shapeOf[id], x, y, hot === id ? 5 : 4, c);
      // direct label at the end of the line (when few series or hovered)
      if (series.length <= 6 || hot === id) {
        const [x, y] = pts[pts.length - 1];
        g += `<text x="${x + 10}" y="${y + 4}" class="ch-lab" fill="#efe6fb">${short(id)}</text>`;
      }
      g += '</g>';
    }
    // crosshair layer
    g += `<line class="ch-cross" x1="0" x2="0" y1="${PAD.t}" y2="${H - PAD.b}" stroke="rgba(255,255,255,.35)" stroke-dasharray="3 3" visibility="hidden"/>`;
    plot.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${g}</svg>`;
    const svg = plot.firstChild;
    svg.addEventListener('mousemove', (e) => {
      const b = svg.getBoundingClientRect();
      const mx = ((e.clientX - b.left) / b.width) * W;
      if (!hist.length || !series.length) return;
      const r = xs.reduce((best, x) => (Math.abs(X(x) - mx) < Math.abs(X(best) - mx) ? x : best), xs[0]);
      const cross = svg.querySelector('.ch-cross');
      cross.setAttribute('x1', X(r)); cross.setAttribute('x2', X(r)); cross.setAttribute('visibility', 'visible');
      const h = hist.find((x) => x.r === r).h;
      const rows = series.filter((id) => h[id]).map((id) => [id, h[id][metric.key]])
        .sort((a, b) => (metric.invert ? a[1] - b[1] : b[1] - a[1]));
      tip.replaceChildren(el('b', {}, [r === 0 ? 'START' : `AFTER ROUND ${r}`]), ...rows.map(([id, v]) => el('div', { class: hot === id ? 'hot' : '' }, [
        el('i', { style: { background: colorOf[id] } }), el('span', {}, [short(id)]), el('em', {}, [metric.fmt(v)]),
      ])));
      tip.style.display = 'block';
      const left = (X(r) / W) * b.width;
      tip.style.left = `${left > b.width * 0.6 ? left - 200 : left + 16}px`;
    });
    svg.addEventListener('mouseleave', () => { tip.style.display = 'none'; svg.querySelector('.ch-cross')?.setAttribute('visibility', 'hidden'); });
    // hovering a line brings it forward without redrawing (the crosshair and tooltip stay)
    const groups = [...svg.querySelectorAll('g[data-id]')];
    const focus = (id) => {
      hot = id;
      for (const n of groups) n.setAttribute('opacity', !id || n.dataset.id === id ? 1 : 0.18);
      const n = groups.find((x) => x.dataset.id === id);
      if (n) svg.insertBefore(n, svg.querySelector('.ch-cross'));
    };
    groups.forEach((n) => n.addEventListener('mouseenter', () => focus(n.dataset.id)));
    svg.addEventListener('mouseleave', () => focus(null));
    plot.appendChild(tip);
  }

  const close = () => { wrap.remove(); unsub(); onClose?.(); };
  const wrap = el('div', { class: 'menu-overlay charts' }, [
    el('div', { class: 'ch-panel' }, [
      el('div', { class: 'ch-head' }, [el('div', { class: 'awards-title small' }, ['CHARTS']), tabs, el('button', { class: 'tbtn mini', onclick: close }, ['CLOSE'])]),
      note,
      el('div', { class: 'ch-body' }, [plot, chips]),
    ]),
  ]);
  const unsub = app.keyboard.onPress((code) => { if (code === 'Escape') close(); });
  document.getElementById('ui').appendChild(wrap);
  draw();
}

function standingsTop(t, n) {
  const last = (t.history || []).filter(Boolean).pop();
  if (!last) return t.ids.slice(0, n);
  return Object.entries(last).sort((a, b) => a[1].place - b[1].place).slice(0, n).map(([id]) => id);
}

function niceTicks(lo, hi, n) {
  const step0 = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= step0) || step0;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}
