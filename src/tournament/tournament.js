// Round-robin tournament: schedule, results, standings, awards, persistence and the background
// simulator. Pure logic (no DOM): the tournament scene draws it, tests exercise it in node.
//
// Every match is fully reproducible: the simulation is deterministic, so a match is defined by
// (fighters, seed, AI level, rules) plus the fighters' definition overrides AT THAT MOMENT. Those
// overrides (`o1`, `o2`: future level-ups, injuries, bought upgrades...) are snapshotted into the
// match record when it is played, so a replay shows exactly the fight that happened, whatever the
// fighters look like now.
import { Match } from '../game/match.js';
import { AIController } from '../ai/aiController.js';
import { ROSTER } from '../data/fighters.js';
import { Rng } from '../core/rng.js';
import { MatchStats } from './stats.js';
import { initCondition, conditionOverrides, fatalityChance, applyMatch, restRound, autoManage, hypeBonus, COND } from './condition.js';
import { initInjuries, profileShift, activeEffects, injuryRoller, addInjury, tickInjuries, autoInvest, leagueDrift } from './injuries.js';

const BASE = Object.fromEntries(ROSTER.map((f) => [f.id, f.profile || {}]));

export const TOURNAMENT_RULES = { roundsToWin: 2, roundTime: 99 };
/**
 * FAME is the currency (upgrades will be bought with it). Spectacle points earned in a match
 * convert into fame; every award adds a bonus of about 25 % of what an average fighter earns in a
 * match (measured: ~118 spectacle points per fighter per match).
 */
export const FAME_PER_SP = 1;
export const AWARD_FAME = 30;
/** League points by final score (winner's rounds : loser's rounds). */
export const POINTS = { win20: 3, win21: 2, loss12: 1, loss02: 0, draw: 1 };
const STORAGE_KEY = 'boneforge.tournament';
const VERSION = 5;

/** Circle-method round robin: n-1 rounds (n even), every pair meets exactly once. */
export function roundRobin(ids) {
  const list = ids.slice();
  if (list.length % 2) list.push(null);
  const n = list.length, rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i], b = list[n - 1 - i];
      if (a && b) pairs.push(r % 2 ? [b, a] : [a, b]);
    }
    rounds.push(pairs);
    list.splice(1, 0, list.pop()); // rotate everyone but the first
  }
  return rounds;
}

function createTournamentRaw({ ids = ROSTER.map((f) => f.id), level = 'normal', seed = Math.floor(Math.random() * 1e9) } = {}) {
  const rng = new Rng(seed);
  const shuffled = ids.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const rounds = roundRobin(shuffled).map((pairs) => pairs.map(([a, b]) => ({ a, b, seed: rng.int(1, 1e9), result: null })));
  return {
    version: VERSION, created: Date.now(), seed, level, ids: ids.slice(), rounds,
    // per-fighter state that will grow (level-ups, injuries, upgrades); empty overrides for now
    fighters: Object.fromEntries(ids.map((id) => {
      const f = { overrides: {}, sp: 0, fame: 0, fameEarned: 0 };
      initCondition(f);
      initInjuries(f);
      return [id, f];
    })),
    camp: [], // per round: { id: { items, spent, fameLeft } } what each manager bought after it
    underdogs: [], // per round: the bottom of the table when the round started (fame bonus)
    history: [], // per completed round (index 0 = before the first round): snapshot per fighter, for the charts
    roundAwards: [], // per round: the awards list, filled in when the round completes
  };
}

export function createTournament(opts) {
  const t = createTournamentRaw(opts);
  t.history[0] = snapshot(t);
  return t;
}

export function allMatches(t) {
  return t.rounds.flatMap((r, ri) => r.map((m, mi) => ({ m, ri, mi })));
}
export function nextMatch(t) {
  return allMatches(t).find((x) => !x.m.result) || null;
}
export function isFinished(t) {
  return !nextMatch(t);
}
export function currentRound(t) {
  const n = nextMatch(t);
  return n ? n.ri : t.rounds.length - 1;
}

/**
 * Definition overrides for both fighters of a match, as they are right now (snapshot): their own
 * overrides plus the current stamina / morale applied to the bars.
 */
export function snapshotOverrides(t, m) {
  return [m.a, m.b].map((id) => {
    const f = t.fighters[id];
    // the bars as they are now: base + upgrades − injury damage + active injury debuffs
    const shift = profileShift(f);
    const profile = Object.fromEntries(Object.entries(shift).map(([a, d]) => [a, (BASE[id][a] ?? 0.5) + d]));
    const extra = { ...(f.overrides || {}), profile: { ...profile, ...(f.overrides?.profile || {}) }, injuryFx: activeEffects(f), injuryKinds: f.injuries.map((i) => i.kind) };
    return conditionOverrides(id, extra, f);
  });
}

/** A fresh Match + AI pair for a scheduled match (used for live viewing, simulation and replays). */
export function setupMatch(t, m, overrides = m.result?.overrides || snapshotOverrides(t, m)) {
  const injuryRoll = injuryRoller(m.seed, [overrides[0].injuryKinds || [], overrides[1].injuryKinds || []]);
  const match = new Match({ p1: m.a, p2: m.b, o1: overrides[0], o2: overrides[1], injuryRoll, ...TOURNAMENT_RULES });
  const ai = [new AIController(0, { level: t.level, seed: m.seed }), new AIController(1, { level: t.level, seed: m.seed * 7 + 3 })];
  for (const a of ai) a.fatalityChance = fatalityChance;
  return { match, ai, overrides };
}

/**
 * Background simulator for one match: advance() runs ticks until the time budget is spent, so the
 * UI stays responsive. done/result once the match is over.
 */
export class MatchRunner {
  constructor(t, m) {
    const { match, ai, overrides } = setupMatch(t, m);
    Object.assign(this, { t, m, match, ai, overrides, stats: new MatchStats(), done: false, ticks: 0 });
  }
  advance(budgetMs = 12) {
    const end = performance.now() + budgetMs;
    const { match, ai, stats } = this;
    while (!this.done && performance.now() < end) {
      for (let i = 0; i < 60 && !this.done; i++) {
        const ev = match.tick([ai[0].input(match), ai[1].input(match)]);
        stats.onTick(match, ev);
        if (match.phase === 'over' || ++this.ticks > 60 * 60 * 10) this.done = true;
      }
    }
    return this.done;
  }
  /** Runs to the end synchronously (tests, node tools); returns the report without recording it. */
  finish() {
    while (!this.advance(1e9));
    return this.stats.report(this.match);
  }
  /** Records the finished match into the tournament (once). */
  record() {
    return recordResult(this.t, this.m, this.match, this.stats, this.overrides);
  }
}

/** Stores a finished match (winner, score, stats, spectacle points, the overrides used). */
export function recordResult(t, m, match, stats, overrides) {
  const rep = stats.report(match);
  const tableBefore = standings(t);
  // the underdogs of a round are fixed by the table at the start of that round (its first match)
  const ri = t.rounds.findIndex((r) => r.includes(m));
  if (t.underdogs[ri] === undefined) t.underdogs[ri] = ri + 1 >= COND.underdogFromRound ? tableBefore.slice(-COND.underdogs).map((r) => r.id) : [];
  const underdog = new Set(t.underdogs[ri]);
  m.result = { ...rep, overrides, playedAt: Date.now() };
  m.result.condition = applyMatch(t, m, m.result, tableBefore);
  const ids = [m.a, m.b];
  // injuries: the ones carried into this match count down, a new one starts
  const drift = leagueDrift(t);
  m.result.injuries = ids.map((id, i) => {
    tickInjuries(t.fighters[id]);
    const kind = rep.sides[i].injuredWith;
    return kind ? addInjury(t, id, kind, drift) : null;
  });
  rep.sides.forEach((s, i) => {
    const hype = hypeBonus(t.fighters[ids[i]].streak); // streak already counts this match
    const under = underdog.has(ids[i]);
    const fame = Math.round(s.spectacle.total * FAME_PER_SP * (1 + hype + (under ? COND.underdogFame : 0)));
    s.fame = fame;
    s.hype = hype;
    s.streak = Math.max(0, t.fighters[ids[i]].streak);
    s.underdog = under;
    t.fighters[ids[i]].sp += s.spectacle.total;
    addFame(t, ids[i], fame);
  });
  // a round (tour) that just completed hands out its awards; the last match closes the tournament
  t.rounds.forEach((r, ri) => {
    if (!t.roundAwards[ri] && roundComplete(t, ri)) {
      t.roundAwards[ri] = grantAwards(t, awards(t, ri));
      // the camp between rounds: everyone rests, then the managers spend fame on recovery
      restRound(t);
      t.camp[ri] = Object.fromEntries(t.ids.map((id) => {
        const f = t.fighters[id], before = f.fame;
        const items = [...autoManage(t, id), ...autoInvest(t, id, BASE[id])];
        return [id, { items, spent: before - f.fame, fameLeft: f.fame }];
      }));
      t.history[ri + 1] = snapshot(t);
    }
  });
  save(t);
  return m.result;
}

/** Per-fighter numbers for the charts: place, fame, attribute index, morale, stamina, injuries. */
export function snapshot(t) {
  const table = standings(t);
  const out = {};
  table.forEach((r, i) => {
    const f = t.fighters[r.id], b = BASE[r.id];
    const keys = Object.keys(b);
    const attr = keys.reduce((s, a) => s + (b[a] ?? 0.5) + (f.perm?.[a] || 0), 0) / keys.length;
    out[r.id] = { place: i + 1, pts: r.pts, fame: f.fame, fameEarned: f.fameEarned, attr: Math.round(attr * 1000) / 10, morale: Math.round(f.morale), stamina: Math.round(f.stamina), injuries: f.injuries.length };
  });
  return out;
}

function addFame(t, id, n) {
  const f = t.fighters[id];
  f.fame += n;
  f.fameEarned += n;
}

/** Each award winner gets AWARD_FAME bonus fame; returns the list with the bonus noted. */
function grantAwards(t, list) {
  return list.map((a) => {
    if (a.id) {
      addFame(t, a.id, AWARD_FAME);
      t.fighters[a.id].morale = Math.min(100, t.fighters[a.id].morale + COND.award);
    }
    return { ...a, fame: a.id ? AWARD_FAME : 0 };
  });
}

/** League table with tie-breaks: points, head-to-head, round difference, damage dealt, perfects. */
export function standings(t) {
  const row = (id) => ({ id, played: 0, won: 0, lost: 0, drawn: 0, rf: 0, ra: 0, pts: 0, dmg: 0, taken: 0, perfect: 0, form: [], sp: t.fighters[id].sp, fame: t.fighters[id].fame, stamina: t.fighters[id].stamina, morale: t.fighters[id].morale, injuries: t.fighters[id].injuries });
  const rows = Object.fromEntries(t.ids.map((id) => [id, row(id)]));
  const h2h = {};
  for (const { m } of allMatches(t)) {
    const r = m.result;
    if (!r) continue;
    const ids = [m.a, m.b];
    ids.forEach((id, i) => {
      const x = rows[id], s = r.sides[i];
      x.played++;
      x.rf += r.wins[i];
      x.ra += r.wins[1 - i];
      x.dmg += s.damageDealt;
      x.taken += s.damageTaken;
      x.perfect += s.perfect;
      if (r.winner === 'draw') { x.drawn++; x.pts += POINTS.draw; x.form.push('D'); }
      else if (r.winner === i) {
        x.won++;
        x.pts += r.wins[1 - i] === 0 ? POINTS.win20 : POINTS.win21;
        x.form.push('W');
        h2h[`${id}>${ids[1 - i]}`] = true;
      } else {
        x.lost++;
        x.pts += r.wins[i] > 0 ? POINTS.loss12 : POINTS.loss02;
        x.form.push('L');
      }
    });
  }
  const list = Object.values(rows);
  list.sort((a, b) => b.pts - a.pts
    || (h2h[`${a.id}>${b.id}`] ? -1 : h2h[`${b.id}>${a.id}`] ? 1 : 0)
    || (b.rf - b.ra) - (a.rf - a.ra)
    || b.dmg - a.dmg
    || b.perfect - a.perfect
    || a.id.localeCompare(b.id));
  list.forEach((r) => { r.form = r.form.slice(-5); });
  return list;
}

/**
 * Awards over a set of matches: fastest K.O., most combos, biggest combo (damage), least damage taken (per
 * match) and most spectacular (spectacle points earned). Each: { key, title, id, value, note }.
 * awards(t, ri) = one round (tour).
 */
function awardsOver(matches) {
  const per = {};
  for (const m of matches) {
    const r = m.result;
    if (!r) continue;
    [m.a, m.b].forEach((id, i) => {
      const s = r.sides[i];
      const p = (per[id] ||= { played: 0, combos: 0, biggest: 0, biggestVs: null, taken: 0, sp: 0, fastest: Infinity, fastestVs: null });
      const vs = [m.a, m.b][1 - i];
      p.played++;
      p.combos += s.combos;
      if ((s.biggestCombo || 0) > p.biggest) { p.biggest = s.biggestCombo; p.biggestVs = vs; }
      p.taken += s.damageTaken;
      p.sp += s.spectacle.total;
      for (const k of s.koTimes) if (k < p.fastest) { p.fastest = k; p.fastestVs = vs; }
    });
  }
  const ids = Object.keys(per);
  const best = (score, lower = false, ok = () => true) => {
    let id = null;
    for (const x of ids) {
      if (!ok(x)) continue;
      if (id === null || (lower ? score(x) < score(id) : score(x) > score(id))) id = x;
    }
    return id;
  };
  const one = matches.length <= ids.length / 2; // a single round: every fighter played once
  const fastest = best((x) => per[x].fastest, true, (x) => per[x].fastest < Infinity);
  const combos = best((x) => per[x].combos, false, (x) => per[x].combos > 0);
  // biggest combo by damage: long flurries of light hits (Tao) no longer win it every time
  const biggest = best((x) => per[x].biggest, false, (x) => per[x].biggest > 0);
  const iron = best((x) => per[x].taken / per[x].played, true);
  const star = best((x) => per[x].sp);
  return [
    { key: 'fastest', title: 'Fastest K.O.', id: fastest, value: fastest ? `${per[fastest].fastest.toFixed(1)} s` : '—', note: fastest ? `vs ${per[fastest].fastestVs}` : '' },
    { key: 'combos', title: 'Most combos', id: combos, value: combos ? String(per[combos].combos) : '—' },
    { key: 'biggest', title: 'Biggest combo', id: biggest, value: biggest ? `${per[biggest].biggest} dmg` : '—', note: biggest ? `vs ${per[biggest].biggestVs}` : '' },
    { key: 'iron', title: 'Least damage taken', id: iron, value: iron ? (one ? String(per[iron].taken) : `${Math.round(per[iron].taken / per[iron].played)} / match`) : '—' },
    { key: 'star', title: 'Most spectacular', id: star, value: star ? `${per[star].sp} SP` : '—' },
  ];
}

/** True when every match of round `ri` has been played. */
export function roundComplete(t, ri) {
  return t.rounds[ri].every((m) => m.result);
}

/** Awards of one round (tour). */
export function awards(t, ri) {
  return awardsOver(t.rounds[ri]);
}

// --- persistence -----------------------------------------------------------------------------
export function save(t) {
  try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(t)); } catch { /* storage unavailable */ }
}
export function load() {
  try {
    const t = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) || 'null');
    return t && t.version === VERSION ? t : null;
  } catch {
    return null;
  }
}
export function clearSaved() {
  try { globalThis.localStorage?.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
