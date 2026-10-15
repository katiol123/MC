// Tournament CONDITION: stamina and morale.
//   STAMINA (0..100) shifts every BODY bar (power, attack speed, mobility, health, toughness).
//   MORALE  (0..100) shifts every CHARACTER bar (reaction, aggression, combo, anti-air, cunning).
// 75 is "match fit": below it the bars drop hard (at 0 every bar of the group loses 0.6 of the
// roster range, more than the gap between the strongest and weakest fighter), above it they gain a
// little. Calibrated with tools/condition.mjs.
//
// Matches drain stamina (more for long, punishing fights) and move morale (results, fatalities,
// streaks, upsets, awards, crowd love). Between rounds everyone rests a little and morale drifts
// back toward calm. Fame buys recovery: every fighter has a manager (automatic by default) that
// decides what to buy; the player can take over and buy by hand.
import { ROSTER } from '../data/fighters.js';

export const BODY = ['power', 'speed', 'mobility', 'health', 'toughness'];
export const MIND = ['reaction', 'aggression', 'combo', 'antiAir', 'cunning'];

export const COND = {
  start: { stamina: 100, morale: 70 },
  fit: 75, // no effect at this level
  lowShift: { stamina: 1.1, morale: 1.0 }, // bars lost at 0
  highShift: { stamina: 0.4, morale: 0.15 }, // bars gained at 100
  // stamina cost of a match
  drainBase: 9, drainPerHealth: 6, drainPerRound: 3, drainFatality: 6, // per match; drainPerHealth per full health bar lost
  restPerRound: 12, // free recovery after every round
  moraleDrift: 0.15, moraleCalm: 60, // between rounds morale moves 15 % toward 60
  // morale changes
  win: 9, flawlessWin: 4, loss: -9, flawlessLoss: -4, perfectRound: 3, comebackRound: 4,
  fatalityDone: 6, fatalitySuffered: -12, upset: 6, award: 4, crowdPerSp: 1 / 40, crowdCap: 5,
  streak: 3, // a streak of this many results amplifies morale changes by 50 %
  exhausted: 25, exhaustedMorale: -4, // running on empty wears the spirit down too
  firedUp: 90, firedUpFame: 0.1, // confident fighters get 10 % more fame (the crowd loves them)
  underdogs: 4, underdogFame: 0.2, // the bottom 4 of the table get 20 % more fame (fans back the underdog)
  redemption: 35, redemptionMorale: 6, // a win from a low ebb lifts morale extra
};

/** Fame shop: recovery items with their trade-offs. */
export const SHOP = [
  { id: 'rest', label: 'Rest day', icon: '🛏', cost: 75, stamina: 25, desc: '+25 stamina' },
  { id: 'physio', label: 'Physio session', icon: '💆', cost: 170, stamina: 60, desc: '+60 stamina' },
  { id: 'pep', label: 'Pep talk', icon: '📣', cost: 70, morale: 20, desc: '+20 morale' },
  { id: 'party', label: 'Party with fans', icon: '🎉', cost: 110, morale: 45, stamina: -10, desc: '+45 morale, −10 stamina' },
];

const BASE_PROFILE = Object.fromEntries(ROSTER.map((f) => [f.id, f.profile || {}]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Bars gained (+) or lost (−) at a condition value. */
export function conditionShift(v, kind = 'stamina') {
  return v >= COND.fit ? ((v - COND.fit) / (100 - COND.fit)) * COND.highShift[kind] : -((COND.fit - v) / COND.fit) * COND.lowShift[kind];
}

// how far a bar may be pushed outside the roster range (toughness must stay a positive stun meter)
const FLOOR = { toughness: -0.25 };

/** Fighter definition overrides with the condition applied (plus whatever else the fighter has). */
export function conditionOverrides(id, extra = {}, cond = COND.start) {
  const base = { ...BASE_PROFILE[id], ...(extra.profile || {}) };
  const sb = conditionShift(cond.stamina, 'stamina'), sm = conditionShift(cond.morale, 'morale');
  const profile = { ...base };
  for (const k of BODY) profile[k] = clamp((base[k] ?? 0.5) + sb, FLOOR[k] ?? -0.7, 1.4);
  for (const k of MIND) profile[k] = clamp((base[k] ?? 0.5) + sm, -0.7, 1.4);
  return { ...JSON.parse(JSON.stringify(extra)), profile, cond: { stamina: Math.round(cond.stamina), morale: Math.round(cond.morale) } };
}

/**
 * Chance that the winner performs the fatality: their morale and stamina, plus how dominant the
 * current fight was (health left when FINISH HIM starts, and a 2:0 sweep).
 */
export function fatalityChance(match, winnerIndex) {
  const f = match.fighters[winnerIndex];
  const c = f.def.cond || COND.start;
  const dominance = f.health / f.maxHealth;
  const sweep = match.wins[1 - winnerIndex] === 0 ? 0.08 : 0;
  return clamp(0.05 + 0.45 * (c.morale / 100) + 0.2 * (c.stamina / 100) + 0.3 * dominance + sweep - 0.15, 0.03, 0.95);
}

export function initCondition(rec) {
  Object.assign(rec, { stamina: COND.start.stamina, morale: COND.start.morale, auto: true, streak: 0, spentFame: 0 });
}

/**
 * Applies a finished match to both fighters' condition. Returns per side
 * { stamina: [before, after], morale: [before, after], notes: [{label, stamina?, morale?}] }.
 */
export function applyMatch(t, m, result, table) {
  const ids = [m.a, m.b];
  const rank = Object.fromEntries((table || []).map((r, i) => [r.id, i]));
  return ids.map((id, i) => {
    const f = t.fighters[id], s = result.sides[i], o = result.sides[1 - i];
    const before = { stamina: f.stamina, morale: f.morale };
    const notes = [];
    const won = result.winner === i, lost = result.winner === 1 - i;
    // stamina: the fight's toll
    const rounds = result.wins[0] + result.wins[1];
    const bars = s.damageTaken / (s.maxHealth || 1000);
    let ds = -(COND.drainBase + bars * COND.drainPerHealth + Math.max(0, rounds - 2) * COND.drainPerRound);
    notes.push({ label: `Fight toll (${s.damageTaken} damage taken)`, stamina: Math.round(ds) });
    if (o.fatality) { ds -= COND.drainFatality; notes.push({ label: 'Fatality suffered', stamina: -COND.drainFatality }); }
    // morale
    let dm = 0;
    const add = (label, v) => { if (v) { dm += v; notes.push({ label, morale: v }); } };
    if (won) add(result.wins[1 - i] === 0 ? 'Won 2:0' : 'Won', COND.win + (result.wins[1 - i] === 0 ? COND.flawlessWin : 0));
    else if (lost) add(result.wins[i] === 0 ? 'Lost 0:2' : 'Lost', COND.loss + (result.wins[i] === 0 ? COND.flawlessLoss : 0));
    add('Perfect rounds', s.perfect * COND.perfectRound);
    add('Comeback round', (s.spectacle.items.find((x) => x.key === 'comeback')?.count || 0) * COND.comebackRound);
    if (s.fatality) add('Performed a fatality', COND.fatalityDone);
    if (o.fatality) add('Humiliated by a fatality', COND.fatalitySuffered);
    if (won && rank[ids[1 - i]] !== undefined && rank[ids[1 - i]] + 3 <= rank[id]) add('Upset win', COND.upset);
    if (won && before.morale <= COND.redemption) add('Redemption', COND.redemptionMorale);
    add('Crowd love', Math.min(COND.crowdCap, Math.floor(s.spectacle.total * COND.crowdPerSp)));
    // streaks amplify morale swings
    f.streak = won ? Math.max(1, f.streak + 1) : lost ? Math.min(-1, f.streak - 1) : 0;
    if (Math.abs(f.streak) >= COND.streak && Math.sign(dm) === Math.sign(f.streak)) {
      const bonus = Math.round(dm * 0.5);
      add(f.streak > 0 ? `On fire (${f.streak} wins)` : `Slump (${-f.streak} losses)`, bonus);
    }
    if (before.stamina < COND.exhausted) add('Exhausted', COND.exhaustedMorale);
    f.stamina = clamp(f.stamina + ds, 0, 100);
    f.morale = clamp(f.morale + dm, 0, 100);
    return { stamina: [before.stamina, f.stamina], morale: [before.morale, f.morale], notes };
  });
}

/** Between rounds: free rest, morale settles toward calm. */
export function restRound(t) {
  for (const id of t.ids) {
    const f = t.fighters[id];
    f.stamina = clamp(f.stamina + COND.restPerRound, 0, 100);
    f.morale += (COND.moraleCalm - f.morale) * COND.moraleDrift;
  }
}

export function canBuy(t, id, itemId) {
  const it = SHOP.find((x) => x.id === itemId), f = t.fighters[id];
  return !!it && f.fame >= it.cost;
}

export function buy(t, id, itemId) {
  const it = SHOP.find((x) => x.id === itemId), f = t.fighters[id];
  if (!it || f.fame < it.cost) return false;
  f.fame -= it.cost;
  f.spentFame += it.cost;
  if (it.stamina) f.stamina = clamp(f.stamina + it.stamina, 0, 100);
  if (it.morale) f.morale = clamp(f.morale + it.morale, 0, 100);
  return true;
}

/**
 * Automatic manager: keeps the fighter match fit without blowing all the fame. Personality matters:
 * cunning managers keep a bigger reserve (fame will buy upgrades), aggressive ones spend on morale.
 */
export function autoManage(t, id) {
  const f = t.fighters[id];
  if (!f.auto) return [];
  const p = BASE_PROFILE[id] || {};
  const reserve = 30 + 40 * (p.cunning ?? 0.5);
  const bought = [];
  for (let guard = 0; guard < 6; guard++) {
    const spare = f.fame - reserve;
    let pick = null;
    const cost = (id2) => SHOP.find((x) => x.id === id2).cost;
    if (f.stamina < 45 && spare >= cost('physio')) pick = 'physio';
    else if (f.stamina < 65 && spare >= cost('rest')) pick = 'rest';
    else if (f.morale < 40 && f.stamina >= 60 && spare >= cost('party') && (p.aggression ?? 0.5) > 0.5) pick = 'party';
    else if (f.morale < 55 && spare >= cost('pep')) pick = 'pep';
    if (!pick || !buy(t, id, pick)) break;
    bought.push(pick);
  }
  return bought;
}
