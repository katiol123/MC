// Fighter attributes: ten numbers that drive the game and are shown as bars on the select screen.
//   BODY (always shown):        power, speed, mobility, health, toughness
//   CHARACTER (CPU vs CPU only): reaction, aggression, combo, antiAir, cunning
// Every bar is real: buildFighterDef derives damage, startup frames, movement, health and stun
// resistance from the body values, and the AI controller derives its behaviour from the character
// values. Bars are scaled between the lowest and highest value in the roster.
//
// The ranges (and the AI response curves in AI_CURVES) are calibrated by tools/calibrate.mjs so that
// moving any bar by the same share of its range changes the win rate by about the same amount.

export const ATTRIBUTES = [
  { id: 'power', group: 'body', label: 'POWER', hint: 'average damage per attack', fmt: (v) => v.toFixed(0) },
  { id: 'speed', group: 'body', label: 'ATTACK SPEED', hint: 'average start-up (frames, lower is faster)', fmt: (v) => `${v.toFixed(1)}f`, lowerIsBetter: true },
  { id: 'mobility', group: 'body', label: 'MOBILITY', hint: 'walk speed (px/s); run, dash and jump scale with it', fmt: (v) => `${Math.round(v * 60)}` },
  { id: 'health', group: 'body', label: 'HEALTH', hint: 'hit points', fmt: (v) => v.toFixed(0) },
  { id: 'toughness', group: 'body', label: 'TOUGHNESS', hint: 'stun needed to get dizzy', fmt: (v) => v.toFixed(0) },
  { id: 'reaction', group: 'mind', label: 'REACTION', hint: 'how quickly the CPU sees attacks and how often it blocks', fmt: (v) => v.toFixed(0) },
  { id: 'aggression', group: 'mind', label: 'AGGRESSION', hint: 'how much the CPU presses forward and attacks', fmt: (v) => v.toFixed(0) },
  { id: 'combo', group: 'mind', label: 'COMBO SKILL', hint: 'chance to continue combos and punish mistakes', fmt: (v) => v.toFixed(0) },
  { id: 'antiAir', group: 'mind', label: 'ANTI-AIR', hint: 'how reliably the CPU knocks jumpers out of the air', fmt: (v) => v.toFixed(0) },
  { id: 'cunning', group: 'mind', label: 'CUNNING', hint: 'throws, throw escapes and well-timed specials', fmt: (v) => v.toFixed(0) },
];

export const ATTRIBUTE_GROUPS = [
  { id: 'body', label: 'BODY' },
  { id: 'mind', label: 'CHARACTER' },
];

/**
 * Calibrated roster ranges: [worst, best] value of every attribute. A fighter's profile (0..1 per
 * attribute, fighters.js) places it inside the range; the weakest fighter in an attribute sits at
 * 0, the strongest at 1. See tools/calibrate.mjs for how the ranges were chosen.
 */
export const ATTR_RANGES = {
  power: [77.4, 81.1], speed: [6.91, 6.29], mobility: [2.4, 4.0], health: [976, 1024], toughness: [260, 1060],
  reaction: [10, 90], aggression: [10, 90], combo: [10, 90], antiAir: [10, 90], cunning: [10, 90],
};

/** Attribute values from a 0..1 profile. */
export function attrsFromProfile(profile = {}) {
  const out = {};
  for (const [id, [lo, hi]] of Object.entries(ATTR_RANGES)) {
    const k = profile[id] ?? 0.5;
    out[id] = lo + (hi - lo) * k;
  }
  return out;
}

/** Neutral values (roster middle); fighters override any of them in fighters.js `attrs`. */
export const ATTR_DEFAULTS = {
  power: 78, speed: 6.6, mobility: 3.2, health: 1000, toughness: 640,
  reaction: 50, aggression: 50, combo: 50, antiAir: 50, cunning: 50,
};

/** Agility (wake-up / landing speed) = (mobility / average) ^ AGILITY_EXP. */
export const AGILITY_EXP = 2;

/** Movement stats as multiples of the walk speed (mobility). */
export const MOBILITY_RATIOS = { walkF: 1, walkB: 0.82, run: 2.12, dash: 3.05, jumpVX: 1.28 };

/**
 * Response curves of the CPU's character, per point (0..100) relative to the difficulty level's
 * base value: behaviour = base * lerp(lo, hi, points / 100).
 */
export const AI_CURVES = {
  reaction: { reactionFrames: [1.43, 0.87], block: [0.7, 1.1] },
  aggression: { aggression: [0.875, 1.175], think: [1.105, 0.925] },
  combo: { combo: [0.65, 1.15], punish: [0.73, 1.17] },
  antiAir: { antiAir: [0.0, 2.4], aaGuard: [0.05, 1.0] }, // aaGuard: absolute chance to at least block a jump-in
  cunning: { throws: [0.1, 2.4], tech: [0.1, 2.0], signature: [0.5, 1.5] },
};

export const NORMAL_IDS = ['lp', 'hp', 'lk', 'hk', 'clp', 'clk', 'chp', 'chk', 'jp', 'jk'];
const ATTACK_IDS = [...NORMAL_IDS, 's1', 's2', 's3', 's4', 'throw'];

/** Total damage one use of a move can deal (sequences sum their steps, projectiles their hits). */
export function moveDamage(m, moves = {}) {
  if (!m) return 0;
  if (m.steps) return m.steps.reduce((a, s) => a + (s.hit?.damage || 0), 0);
  if (m.projectile) return (m.projectile.hit?.damage || 0) * (m.projectile.hits || 1);
  if (m.type === 'counter' && m.followup) return moveDamage(moves[m.followup], moves);
  return m.damage || 0;
}

/** Raw (unscaled) average damage of a fighter's attack list. */
export function rawAverageDamage(moves) {
  const v = ATTACK_IDS.map((id) => moveDamage(moves[id], moves)).filter((d) => d > 0);
  return v.reduce((a, b) => a + b, 0) / v.length;
}

/** Average start-up of the normal attacks. */
export function averageStartup(moves) {
  const v = NORMAL_IDS.map((id) => moves[id]?.startup).filter((s) => s > 0);
  return v.reduce((a, b) => a + b, 0) / v.length;
}

/** Current value of an attribute for a built fighter definition. */
export function attributeValue(def, id) {
  return def.attrs[id];
}

/** Lowest / highest value of every attribute across the given definitions. */
export function attributeRanges(defs) {
  const out = {};
  for (const a of ATTRIBUTES) {
    const v = defs.map((d) => attributeValue(d, a.id));
    out[a.id] = { min: Math.min(...v), max: Math.max(...v) };
  }
  return out;
}

/** 0..1 bar fill: the best value in the roster fills the bar, the worst leaves it (nearly) empty. */
export function attributeFill(a, v, range) {
  const span = range.max - range.min;
  if (span <= 1e-9) return 0.5;
  const k = (v - range.min) / span;
  return a.lowerIsBetter ? 1 - k : k;
}
