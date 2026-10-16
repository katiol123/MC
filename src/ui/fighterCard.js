// Tournament fighter card: opened by clicking any fighter's name in the tournament screens.
// Attributes (click one for a full explanation and the breakdown of its current value), signature
// special and super, condition, injuries, fame, the tournament so far match by match, awards and
// every purchase made with fame.
import { ROSTER, buildFighterDef } from '../data/fighters.js';
import { ATTRIBUTES, ATTRIBUTE_GROUPS } from '../data/attributes.js';
import { MOVE_INFO, ATTRIBUTE_INFO, SIGNATURE_INPUT, SUPER_INPUT } from '../data/moveInfo.js';
import { standings } from '../tournament/tournament.js';
import { SHOP, COND, conditionShift } from '../tournament/condition.js';
import { INJURIES, INJ, profileShift, fighterLevel } from '../tournament/injuries.js';
import { el } from './dom.js';
import { faceStyle } from './faces.js';

const FIGHTER = Object.fromEntries(ROSTER.map((f) => [f.id, f]));
const LABEL = Object.fromEntries(ATTRIBUTES.map((a) => [a.id, a.label]));
const short = (id) => {
  const n = FIGHTER[id]?.name || id;
  const m = n.match(/"([^"]+)"/);
  return m ? m[1] : n.split(' ').slice(-1)[0];
};
const pts = (v) => Math.round(v * 100);
const signed = (v) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v)}`;

/** Text of a purchase record. */
function itemLabel(item) {
  if (item.startsWith('up:')) return `⬆ ${LABEL[item.slice(3)]} +${pts(INJ.upgradeStep)}`;
  if (item.startsWith('treat')) {
    const k = INJURIES[item.split(':')[1]];
    return `🩺 Treatment${k ? `: ${k.label}` : ''}`;
  }
  const it = SHOP.find((x) => x.id === item);
  return it ? `${it.icon} ${it.label} (${it.desc})` : item;
}

/**
 * Opens the card of fighter `id`. opts.onReplay(m) replays a match; opts.onClose runs after closing.
 * Clicking an opponent's name inside the card opens that fighter's card instead.
 */
export function showFighterCard(app, t, id, opts = {}) {
  const f = t.fighters[id], src = FIGHTER[id];
  const def = buildFighterDef(id);
  const table = standings(t);
  const place = table.findIndex((r) => r.id === id) + 1;
  const row = table[place - 1];
  const info = MOVE_INFO[id] || {};

  const close = () => { wrap.remove(); release(); opts.onClose?.(); };
  const open = (other) => { wrap.remove(); release(); showFighterCard(app, t, other, opts); };
  const link = (other) => el('button', { class: 'fc-link', onclick: (e) => { e.stopPropagation(); app.audio.ui('move'); open(other); } }, [short(other)]);

  // --- attributes: base, upgrades / injury damage, active injuries, condition -> now
  const shift = profileShift(f); // perm (upgrades − injury damage) + active injury debuffs
  const temp = {};
  for (const inj of f.injuries) for (const [a, v] of Object.entries(INJURIES[inj.kind].temp)) temp[a] = (temp[a] || 0) + v;
  const cond = { body: conditionShift(f.stamina, 'stamina'), mind: conditionShift(f.morale, 'morale') };
  const attrRow = (a) => {
    const base = src.profile?.[a.id] ?? 0.5;
    const up = ((f.upLevels?.[a.id] || 0) + (f.careerUp?.[a.id] || 0)) * INJ.upgradeStep;
    const perm = f.perm?.[a.id] || 0, hurt = perm - up, tmp = temp[a.id] || 0, c = cond[a.group];
    const now = base + shift[a.id] + c;
    const pct = (v) => `${Math.max(0, Math.min(1.4, v)) / 1.4 * 100}%`;
    const parts = [
      ['Base', pts(base)],
      up ? ['Upgrades', signed(pts(up))] : null,
      hurt < -0.004 ? ['Injury damage (permanent)', signed(pts(hurt))] : null,
      tmp ? ['Active injuries', signed(pts(tmp))] : null,
      Math.abs(c) >= 0.005 ? [a.group === 'body' ? `Stamina ${Math.round(f.stamina)}` : `Morale ${Math.round(f.morale)}`, signed(pts(c))] : null,
    ].filter(Boolean);
    const detail = el('div', { class: 'fc-detail' }, [
      el('p', {}, [ATTRIBUTE_INFO[a.id] || a.hint]),
      el('div', { class: 'fc-break' }, [
        ...parts.map(([k, v]) => el('span', {}, [`${k} `, el('b', {}, [String(v)])])),
        el('span', { class: 'now' }, ['Now ', el('b', {}, [String(pts(now))])]),
        el('span', { class: 'val' }, [`${a.hint}: `, el('b', {}, [a.fmt(def.attrs[a.id])]), ' (base)']),
      ]),
    ]);
    const rowEl = el('div', { class: `fc-attr ${a.group}` }, [
      el('button', { class: 'fc-attr-label', onclick: () => { rowEl.classList.toggle('open'); app.audio.ui('move'); } }, [a.label, el('i', {}, ['▾'])]),
      el('span', { class: 'fc-bar' }, [
        el('b', { class: 'base', style: { width: pct(base) } }),
        el('b', { class: `now ${now >= base ? 'up' : 'down'}`, style: { width: pct(now) } }),
        el('i', { style: { left: pct(1) } }),
      ]),
      el('span', { class: 'fc-num' }, [String(pts(now)), now !== base ? el('small', {}, [` ${signed(pts(now - base))}`]) : null]),
      detail,
    ]);
    return rowEl;
  };
  const attrs = ATTRIBUTE_GROUPS.map((g) => el('div', { class: 'fc-group' }, [
    el('div', { class: 'fc-sub' }, [g.label, el('small', {}, [g.id === 'body' ? ' · shifted by stamina' : ' · CPU behaviour, shifted by morale'])]),
    ...ATTRIBUTES.filter((a) => a.group === g.id).map(attrRow),
  ]));

  // --- condition and injuries
  const meter = (label, v, cls, note) => el('div', { class: `fc-meter ${cls}` }, [
    el('span', {}, [label]),
    el('span', { class: 'fc-mbar' }, [el('b', { style: { width: `${v}%` } }), el('i', { style: { left: `${COND.fit}%` } })]),
    el('b', {}, [String(Math.round(v))]),
    el('small', {}, [note]),
  ]);
  const shiftNote = (v, what) => `${what} ${signed(pts(v))}`;
  const injuries = f.injuries.length
    ? f.injuries.map((i) => el('div', { class: 'fc-inj' }, [`${INJURIES[i.kind].icon} ${INJURIES[i.kind].label}`, el('small', {}, [` — ${INJURIES[i.kind].desc} · ${i.games} more match${i.games > 1 ? 'es' : ''}`])]))
    : [el('div', { class: 'fc-none' }, ['No active injuries.'])];
  const multi = (t.season || 1) > 1;
  const scars = (f.injuryLog || []).map((l) => el('span', {}, [`${multi ? `S${l.season || 1} ` : ''}${INJURIES[l.kind].icon} ${INJURIES[l.kind].label}: ${Object.entries(l.perm).map(([a, v]) => `${LABEL[a].toLowerCase()} ${signed(pts(v))}`).join(', ')}`]));

  // --- matches
  const matches = [];
  t.rounds.forEach((round, ri) => {
    const m = round.find((x) => x.a === id || x.b === id);
    if (!m) return;
    const i = m.a === id ? 0 : 1, opp = i ? m.a : m.b, r = m.result;
    if (!r) {
      matches.push(el('div', { class: 'fc-match todo' }, [el('span', { class: 'fc-rd' }, [`R${ri + 1}`]), el('span', {}, ['vs ', link(opp)]), el('span', { class: 'fc-res' }, ['—'])]));
      return;
    }
    const won = r.winner === i, draw = r.winner === 'draw';
    const notes = [];
    if (r.sides[i].fatality) notes.push('☠ fatality');
    if (r.sides[1 - i].fatality) notes.push('☠ suffered a fatality');
    if (r.injuries?.[i]) notes.push(`${INJURIES[r.injuries[i].kind].icon} injured`);
    if (r.sides[i].hype) notes.push(`hype +${Math.round(r.sides[i].hype * 100)}%`);
    if (r.sides[i].underdog) notes.push('underdog +20%');
    const sb = r.sides[i].spectacle.items.find((x) => x.key === 'showboat');
    if (sb) notes.push(`🎭 showboat ×${sb.count}`);
    matches.push(el('div', { class: `fc-match ${won ? 'w' : draw ? 'd' : 'l'}`, title: opts.onReplay ? 'click to replay' : '', onclick: opts.onReplay ? () => { close(); opts.onReplay(m); } : null }, [
      el('span', { class: 'fc-rd' }, [`R${ri + 1}`]),
      el('span', {}, ['vs ', link(opp)]),
      el('span', { class: 'fc-res' }, [`${won ? 'W' : draw ? 'D' : 'L'} ${r.wins[i]}:${r.wins[1 - i]}`]),
      el('span', { class: 'fc-fame' }, [`★${r.sides[i].fame ?? r.sides[i].spectacle.total}`]),
      el('span', { class: 'fc-notes' }, [notes.join(' · ')]),
    ]));
  });
  const won = (t.roundAwards || []).flatMap((list, ri) => (list || []).filter((a) => a.id === id).map((a) => el('span', { class: 'fc-award' }, [`🏅 R${ri + 1} ${a.title}`])));

  // --- career: past seasons (places, titles), career fame
  const c = f.career, past = (t.seasons || []).map((s) => {
    const i = s.table.findIndex((r) => r.id === id), r = s.table[i];
    return r ? el('span', { class: `fc-season ${i === 0 ? 'champ' : ''}` }, [`S${s.season}: ${i === 0 ? '🏆 ' : ''}#${i + 1} · ${r.pts} pts · ${r.won}W ${r.lost}L`]) : null;
  });
  const career = c ? el('div', { class: 'fc-career' }, [
    el('div', { class: 'fc-sec' }, ['CAREER']),
    el('div', { class: 'fc-cstats' }, [
      el('span', {}, [`${c.seasons} past season${c.seasons > 1 ? 's' : ''}`]),
      el('span', { class: 'gold' }, [`${c.titles} title${c.titles === 1 ? '' : 's'}`]),
      el('span', {}, [`fame earned ${c.fameEarned + (f.fameEarned || 0)} · spent ${c.spentFame + (f.spentFame || 0)}`]),
    ]),
    el('div', { class: 'fc-seasons' }, past),
  ]) : null;

  // --- purchases, grouped by the camp they were made in
  const byCamp = {};
  for (const p of f.purchases || []) (byCamp[`${p.season || 1}|${p.after}`] ||= []).push(p);
  const purchases = Object.keys(byCamp).length
    ? Object.entries(byCamp).reverse().map(([key, list]) => { const [s, after] = key.split('|').map(Number); return el('div', { class: 'fc-camp' }, [
      el('span', { class: 'fc-rd' }, [`${multi ? `S${s} ` : ''}${after ? `after R${after}` : 'before R1'}`]),
      el('span', { class: 'fc-items' }, list.map((p) => el('em', { class: p.by === 'auto' ? 'auto' : 'you' }, [`${itemLabel(p.item)} ★${p.cost}`, el('small', {}, [p.by === 'auto' ? ' manager' : ' you'])]))),
    ]); })
    : [el('div', { class: 'fc-none' }, ['Nothing bought yet.'])];

  const wrap = el('div', { class: 'menu-overlay fcard-overlay', onclick: (e) => { if (e.target === wrap) close(); } }, [
    el('div', { class: 'fcard' }, [
      el('button', { class: 'fc-close', onclick: close, title: 'close (Esc)' }, ['✕']),
      el('div', { class: 'fc-head' }, [
        el('div', { class: 'fc-portrait', style: faceStyle(app, id, 0.95) }, [el('b', { class: 'fc-lvl', title: 'level: 1 + upgrades bought this season (back to 1 every new tournament)' }, [`LV ${fighterLevel(f)}`])]),
        el('div', { class: 'fc-id' }, [
          el('div', { class: 'fc-name' }, [src.name]),
          el('div', { class: 'fc-title' }, [src.title]),
          el('div', { class: 'fc-stats' }, [
            el('span', { class: 'big' }, [`#${place}`]),
            el('span', {}, [`${row.pts} pts`]),
            el('span', {}, [`${row.won}W ${row.lost}L${row.drawn ? ` ${row.drawn}D` : ''}`]),
            el('span', {}, [`rounds ${row.rf}:${row.ra}`]),
            el('span', { class: 'gold' }, [`★${f.fame} fame`]),
            el('span', { class: 'dim' }, [`this season: earned ${f.fameEarned} · spent ${f.spentFame || 0}`]),
          ]),
        ]),
      ]),
      el('div', { class: 'fc-body' }, [
        el('div', { class: 'fc-col' }, [
          el('div', { class: 'fc-sec' }, ['CONDITION']),
          meter('STAMINA', f.stamina, 'sta', shiftNote(cond.body, 'body bars')),
          meter('MORALE', f.morale, 'mor', shiftNote(cond.mind, 'character bars')),
          ...injuries,
          scars.length ? el('div', { class: 'fc-scars' }, [el('small', {}, ['Permanent damage: ']), ...scars]) : null,
          el('div', { class: 'fc-sec' }, ['ATTRIBUTES', el('small', {}, [' · click a name for details'])]),
          ...attrs,
          el('div', { class: 'fc-sec' }, ['MOVES']),
          el('div', { class: 'fc-move' }, [el('div', { class: 'fc-mname' }, [def.moves.s4?.name || '—', el('small', {}, [` SIGNATURE · ${SIGNATURE_INPUT}`])]), el('p', {}, [info.special || ''])]),
          el('div', { class: 'fc-move su' }, [el('div', { class: 'fc-mname' }, [def.moves.su?.name || '—', el('small', {}, [` SUPER · ${SUPER_INPUT}`])]), el('p', {}, [info.super || ''])]),
        ]),
        el('div', { class: 'fc-col' }, [
          career,
          el('div', { class: 'fc-sec' }, [`SEASON ${t.season || 1}`, opts.onReplay ? el('small', {}, [' · click a result to replay']) : null]),
          el('div', { class: 'fc-matches' }, matches),
          won.length ? el('div', { class: 'fc-awards' }, won) : null,
          el('div', { class: 'fc-sec' }, ['PURCHASES']),
          el('div', { class: 'fc-purchases' }, purchases),
        ]),
      ]),
    ]),
  ]);
  const release = app.keyboard.capture((code) => { if (code === 'Escape' || code === 'Backspace') close(); });
  document.getElementById('ui').appendChild(wrap);
  app.audio.ui('confirm');
  return { close };
}

/** A clickable fighter name for the tournament screens. */
export function fighterLink(text, onOpen) {
  return el('button', { class: 'fname-link', onclick: (e) => { e.stopPropagation(); onOpen(); } }, [text]);
}

