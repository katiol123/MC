// Tournament INJURIES and UPGRADES: the two forces that make the fighters' bars drift during a
// tournament (on top of stamina / morale).
//
//   UPGRADES: fame buys +0.1 of a bar in any attribute (price grows with each level of that attribute).
//   INJURIES: a heavy blow can injure the opponent during a fight ("INJURY!", the battered look). An
//     injury takes a permanent bite out of some bars AND gives an unusual debuff for the next 1-3
//     matches (no dashes, a bleeding nose, a weak super...). A fighter can carry several injuries,
//     never two of the same kind. Fame can shorten an injury by one round.
//
// Balance: over a tournament the roster average stays about the same. Upgrades and injuries are
// tuned to cancel out (tools/tourney.mjs), and as a safety valve injuries bite harder when the league
// as a whole has gained (LEAGUE_REG), softer when it has lost.
import { Rng } from '../core/rng.js';
import { ATTRIBUTES } from '../data/attributes.js';

export const ATTR_IDS = ATTRIBUTES.map((a) => a.id);

/**
 * Injury kinds. perm: permanent bar losses; temp: bar losses while active; games: how many of the
 * fighter's next matches it lasts; effect: the unusual debuff (handled by the fight systems).
 */
export const INJURIES = {
  nose: {
    label: 'Broken nose', icon: '👃', games: 2, effect: 'bleeding',
    desc: 'bleeds during fights (loses health slowly)',
    perm: { toughness: -0.12, reaction: -0.06 }, temp: { reaction: -0.25 },
  },
  ankle: {
    label: 'Sprained ankle', icon: '🦶', games: 3, effect: 'noDash',
    desc: 'cannot dash, slower on the feet',
    perm: { mobility: -0.18 }, temp: { mobility: -0.45 },
  },
  ribs: {
    label: 'Cracked ribs', icon: '🩻', games: 2, effect: 'fragileBody',
    desc: 'body hits deal +25 % damage to him',
    perm: { health: -0.14, toughness: -0.06 }, temp: { health: -0.3 },
  },
  knuckles: {
    label: 'Broken knuckles', icon: '🤜', games: 2, effect: 'weakPunches',
    desc: 'punches deal −25 % damage',
    perm: { power: -0.18 }, temp: { power: -0.2 },
  },
  concussion: {
    label: 'Concussion', icon: '💫', games: 3, effect: 'groggy',
    desc: 'starts every round 40 % dizzy, gets dizzy faster',
    perm: { reaction: -0.08, combo: -0.06, cunning: -0.04 }, temp: { reaction: -0.25, combo: -0.2 },
  },
  shoulder: {
    label: 'Torn shoulder', icon: '💪', games: 1, effect: 'slowMeter',
    desc: 'super meter fills half as fast',
    perm: { speed: -0.14, power: -0.04 }, temp: { speed: -0.35 },
  },
  shaken: {
    label: 'Shell-shocked', icon: '😨', games: 2, effect: 'timid',
    desc: 'timid: hangs back, rarely presses',
    perm: { aggression: -0.12, antiAir: -0.06 }, temp: { aggression: -0.5, cunning: -0.2 },
  },
};
export const INJURY_KINDS = Object.keys(INJURIES);

export const INJ = {
  chance: 0.0105, // per qualifying hit, before the multipliers below
  minDamage: 50, // qualifying hit: this much damage, or a super / throw / counter hit
  superMul: 1.6, throwMul: 1.4,
  // the attacker's aggression (0..1) and the victim's fatigue raise the odds
  aggrBase: 0.5, fatigueBase: 0.4, fatigueMul: 1.6,
  perMatch: 1, // at most one new injury per fighter per match
  spectacle: 15, // spectacle points for injuring the opponent
  treatCost: 90, // fame to shorten an injury by one round
  upgradeStep: 0.1, // bars per upgrade
  upgradeCost: 150, upgradeCostGrowth: 0.35, // 150, 203, 255, ... per level of that attribute
  permScale: 1.25, // overall weight of permanent injury damage (tuned so upgrades and injuries cancel out)
  leagueReg: 4, // injury severity × (1 + leagueReg × average permanent shift of the league)
};

export function upgradeCost(f, attr) {
  const lvl = f.upLevels?.[attr] || 0;
  return Math.round(INJ.upgradeCost * (1 + INJ.upgradeCostGrowth * lvl));
}

/** Average permanent bar shift over the whole league (upgrades minus injury damage). */
export function leagueDrift(t) {
  let s = 0, n = 0;
  for (const id of t.ids) for (const a of ATTR_IDS) { s += t.fighters[id].perm?.[a] || 0; n++; }
  return n ? s / n : 0;
}

export function initInjuries(rec) {
  Object.assign(rec, { perm: {}, upLevels: {}, injuries: [], injuryLog: [] });
}

/** Profile shift (bars) from permanent changes and active injuries. */
export function profileShift(rec) {
  const out = {};
  for (const a of ATTR_IDS) out[a] = rec.perm?.[a] || 0;
  for (const inj of rec.injuries || []) for (const [a, v] of Object.entries(INJURIES[inj.kind].temp)) out[a] += v;
  return out;
}

/** Effects of the active injuries, for the fight systems. */
export function activeEffects(rec) {
  return (rec.injuries || []).map((i) => INJURIES[i.kind].effect);
}

/**
 * In-fight injury roller for one match (deterministic: seeded by the match). Returns the injury kind
 * a hit causes, or null. cond: [{stamina, morale}] of both fighters; carried: kinds each already has.
 */
export function injuryRoller(seed, carried) {
  const rng = new Rng(seed ^ 0x5eed);
  const done = [0, 0];
  return (match, e) => {
    if (e.type !== 'hit' || e.target === undefined) return null;
    const vi = e.target, at = e.who;
    if (done[vi] >= INJ.perMatch) return null;
    const qualifies = e.damage >= INJ.minDamage || e.super || e.throw || e.counter;
    if (!qualifies) return null;
    const A = match.fighters[at], V = match.fighters[vi];
    const aggr = A.def.ai?.aggression ?? 0.5;
    const st = V.def.cond?.stamina ?? 100;
    let p = INJ.chance * (INJ.aggrBase + aggr) * (INJ.fatigueBase + INJ.fatigueMul * (1 - st / 100));
    if (e.super) p *= INJ.superMul;
    if (e.throw) p *= INJ.throwMul;
    if (!rng.chance(p)) return null;
    const free = INJURY_KINDS.filter((k) => !carried[vi].includes(k));
    if (!free.length) return null;
    done[vi]++;
    return rng.pick(free);
  };
}

/** Adds an injury after the match: permanent damage (league-regulated) + the debuff for N games. */
export function addInjury(t, id, kind, drift = leagueDrift(t)) {
  const f = t.fighters[id], inj = INJURIES[kind];
  const sev = INJ.permScale * Math.max(0.4, Math.min(3, 1 + INJ.leagueReg * drift));
  const perm = {};
  for (const [a, v] of Object.entries(inj.perm)) {
    const d = Math.round(v * sev * 1000) / 1000;
    f.perm[a] = (f.perm[a] || 0) + d;
    perm[a] = d;
  }
  f.injuries = f.injuries.filter((i) => i.kind !== kind);
  f.injuries.push({ kind, games: inj.games });
  f.injuryLog.push({ kind, perm });
  return { kind, games: inj.games, perm };
}

/** After a match: the injuries the fighter carried into it count down one game. */
export function tickInjuries(rec) {
  for (const i of rec.injuries) i.games--;
  rec.injuries = rec.injuries.filter((i) => i.games > 0);
}

export function buyUpgrade(t, id, attr) {
  const f = t.fighters[id], cost = upgradeCost(f, attr);
  if (!ATTR_IDS.includes(attr) || f.fame < cost) return false;
  f.fame -= cost;
  f.spentFame += cost;
  f.spentUpgrades = (f.spentUpgrades || 0) + cost;
  f.upLevels[attr] = (f.upLevels[attr] || 0) + 1;
  f.perm[attr] = (f.perm[attr] || 0) + INJ.upgradeStep;
  return true;
}

export function treatInjury(t, id, kind) {
  const f = t.fighters[id], inj = f.injuries.find((i) => i.kind === kind);
  if (!inj || f.fame < INJ.treatCost) return false;
  f.fame -= INJ.treatCost;
  f.spentFame += INJ.treatCost;
  inj.games--;
  f.injuries = f.injuries.filter((i) => i.games > 0);
  return true;
}

/**
 * Automatic manager, second pass (after recovery): treats a long injury, then upgrades. Specialists
 * (cunning) sharpen their best bars, everyone else patches the weakest one. Keeps a fame reserve.
 */
export function autoInvest(t, id, baseProfile) {
  const f = t.fighters[id];
  if (!f.auto) return [];
  const reserve = 30 + 40 * (baseProfile.cunning ?? 0.5);
  const out = [];
  const long = f.injuries.filter((i) => i.games >= 2).sort((a, b) => b.games - a.games)[0];
  if (long && f.fame - reserve >= INJ.treatCost && treatInjury(t, id, long.kind)) out.push('treat');
  const specialist = (baseProfile.cunning ?? 0.5) >= 0.6;
  for (let n = 0; n < 2; n++) {
    const cur = (a) => (baseProfile[a] ?? 0.5) + (f.perm[a] || 0);
    const cand = ATTR_IDS.slice().sort((a, b) => (specialist ? cur(b) - cur(a) : cur(a) - cur(b)) || upgradeCost(f, a) - upgradeCost(f, b));
    const pick = cand.find((a) => cur(a) < 1.3);
    if (!pick || f.fame - reserve < upgradeCost(f, pick) || !buyUpgrade(t, id, pick)) break;
    out.push(`up:${pick}`);
  }
  return out;
}
