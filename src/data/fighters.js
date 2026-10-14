// Fighter roster. Everything here is data: proportions, palette, outfit, physical stats and per-move
// overrides. The combat, physics and render systems read it without fighter-specific code paths.
//
// All eleven are procedural interpretations of the user's concept portraits (hair, outfit, palette).
// The portraits themselves are only shown on the character-select / versus screens.
import { MOVES } from './moves.js';
import { SIGNATURES } from './signatures.js';
import { compileMove } from './compileMove.js';
import { buildProportions } from '../anim/skeleton.js';

export const ROSTER = [
  {
    id: 'brick',
    name: 'BRICK MADDOX',
    title: 'Grinning Wrecking Ball',
    blurb: 'Dock-yard brawler. Heavy hands, heavy grin, heavier follow-through.',
    body: { height: 1.02, bulk: 1.22, arms: 1.0, legs: 0.97, head: 1.05, torso: 1.02, shoulders: 1.2, armBulk: 1.15, waist: 1.05 },
    stats: { health: 1080, walkF: 3.0, walkB: 2.4, run: 6.4, dash: 9, jumpVY: 15.8, jumpVX: 3.8, mass: 1.15, stunMax: 680, pushW: 37 },
    look: {
      skin: '#c88a5e', outline: '#1b1012', rim: '#ff4fd8',
      eyes: '#3fd29a', brows: 'thick', mouth: 'grin',
      hair: { style: 'spiky', color: '#2b1d16', streak: '#f4f1ea', streak2: '#ff4fd8' },
      beard: { style: 'stubble', color: '#3a2a20' },
      earrings: '#2a2a2a',
      top: { type: 'tee', color: '#4a3526', color2: '#2f2219', emblem: '#d8c9a0', straps: '#3b3b3b' },
      pants: { type: 'cargo', color: '#2d2b33' },
      belt: { color: '#1e1a18', buckle: '#b5b5b5' },
      gloves: { type: 'fingerless', color: '#2a2224' },
      shoes: { type: 'boots', color: '#3b2a20', sole: '#16110f' },
      victory: 3,
    },
    moves: {
      hp: { damage: 92, stun: 80 },
      s1: { name: 'Pier Breaker', damage: 125 },
    },
  },
  {
    id: 'rattigan',
    name: 'SIR RATTIGAN',
    title: 'The Top-Hat Weasel',
    blurb: 'A gentleman thief with goggles, a sharp tie and sharper teeth. Quick and slippery.',
    body: { height: 0.94, bulk: 0.88, arms: 1.05, legs: 1.04, head: 1.12, torso: 0.96, shoulders: 0.92 },
    stats: { health: 920, walkF: 3.6, walkB: 3.0, run: 7.4, dash: 10.5, jumpVY: 17, jumpVX: 4.4, mass: 0.88, stunMax: 560, pushW: 32 },
    look: {
      species: 'weasel',
      skin: '#8a5a36', fur2: '#d9b48a', outline: '#1a0f14', rim: '#ff3fd0',
      eyes: '#ff3fd0', brows: 'sharp', mouth: 'fangs',
      hat: { type: 'tophat', color: '#e0399b', band: '#2a2a2a', goggles: '#c99b4a' },
      top: { type: 'trench', color: '#7d7a3e', color2: '#e0399b', vest: '#2f6d6a', buttons: '#c9c2a8' },
      tie: { color: '#7a3db8', dots: '#e3b23c' },
      pants: { type: 'pants', color: '#3a3a48' },
      gloves: { type: 'none', color: '#8a5a36' },
      shoes: { type: 'shoes', color: '#2a1d22', sole: '#120c0e' },
      tail: '#8a5a36',
      victory: 2,
    },
    moves: {
      lp: { damage: 28, startup: 3 },
      lk: { startup: 5 },
      s1: { name: 'Pickpocket Lunge', damage: 100, motion: [{ from: 6, to: 16, vx: 10 }] },
      s3: { name: 'Coat-tail Whirl', startup: 12 },
    },
  },
  {
    id: 'smiles',
    name: 'HOLLIS "SMILES" OKAFOR',
    title: 'Laughing Long-Neck',
    blurb: 'Tall, bald and always laughing. Long legs make his kicks reach across the street.',
    body: { height: 1.08, bulk: 0.96, arms: 1.06, legs: 1.1, head: 1.0, torso: 1.0, shoulders: 1.02 },
    stats: { health: 1000, walkF: 3.2, walkB: 2.6, run: 6.8, dash: 9.5, jumpVY: 16, jumpVX: 4, mass: 1.0, stunMax: 620, pushW: 34 },
    look: {
      skin: '#a8714c', outline: '#1d1414', rim: '#ff52e0',
      eyes: '#2a1a12', brows: 'thick', mouth: 'grin', eyesClosed: true,
      hair: { style: 'bald', color: '#3a2a20' },
      beard: { style: 'goatee', color: '#4a3324' },
      earrings: '#1a1a1a',
      top: { type: 'henley', color: '#efe6d6', color2: '#cfc3ad', buttons: '#8d8576' },
      pants: { type: 'pants', color: '#5b4b3b' },
      belt: { color: '#2a1f18', buckle: '#c9a24a' },
      gloves: { type: 'wraps', color: '#e8e1d2' },
      shoes: { type: 'sneakers', color: '#e9e4da', sole: '#8a1f6a' },
      victory: 1,
    },
    moves: {
      lk: { damage: 48 },
      hk: { damage: 98, startup: 12 },
      s3: { name: 'Belly-Laugh Heel', damage: 125 },
    },
  },
  {
    id: 'jax',
    name: 'JAX PATCHWORK',
    title: 'Punk Rush',
    blurb: 'Freckles, piercings and a jacket full of patches. Never stops coming forward.',
    body: { height: 0.98, bulk: 1.0, arms: 1.0, legs: 1.0, head: 1.08, torso: 0.98, shoulders: 1.04 },
    stats: { health: 960, walkF: 3.5, walkB: 2.8, run: 7.2, dash: 10.2, jumpVY: 16.4, jumpVX: 4.2, mass: 0.96, stunMax: 590, pushW: 34 },
    look: {
      skin: '#e3a27e', outline: '#1d1216', rim: '#2ee6d6',
      eyes: '#b04fd6', brows: 'angry', mouth: 'teeth', freckles: true,
      hair: { style: 'swept', color: '#c99a52', root: '#5a3a22' },
      earrings: '#9a9aa6',
      headphones: '#b6a77a',
      top: { type: 'jacket', color: '#b07a2a', color2: '#d4318f', inner: '#f2efe8', patches: ['#3fd2c2', '#ff5fbf', '#f2d24a'] },
      pants: { type: 'pants', color: '#2b2e3e' },
      belt: { color: '#1c1c22', buckle: '#d0d0d0' },
      gloves: { type: 'fingerless', color: '#1e1e24' },
      shoes: { type: 'sneakers', color: '#e8e2d6', sole: '#2a2a30' },
      victory: 0,
    },
    moves: {
      lp: { recovery: 6 },
      s1: { name: 'Feedback Fist', startup: 11 },
    },
  },
  {
    id: 'vellaro',
    name: 'DON VELLARO',
    title: 'The Velvet Collar',
    blurb: 'Pompadour, gold earrings and a coat that costs more than your street. Punishes everything.',
    body: { height: 1.06, bulk: 0.94, arms: 1.08, legs: 1.04, head: 1.0, torso: 1.04, shoulders: 1.0 },
    stats: { health: 1020, walkF: 3.0, walkB: 2.6, run: 6.5, dash: 9.2, jumpVY: 15.6, jumpVX: 3.8, mass: 1.04, stunMax: 650, pushW: 34 },
    look: {
      skin: '#b98256', outline: '#1a1012', rim: '#ff47d6',
      eyes: '#b34be0', brows: 'angry', mouth: 'snarl',
      hair: { style: 'pompadour', color: '#1b1716', streak: '#2f8f86' },
      beard: { style: 'full', color: '#2a1d16' },
      earrings: '#e2b440',
      top: { type: 'longcoat', color: '#c49030', color2: '#e0399b', inner: '#24202a', collar: true },
      tie: { color: '#1a1a1e' },
      pants: { type: 'pants', color: '#24202a' },
      gloves: { type: 'gloves', color: '#1c1a1e' },
      shoes: { type: 'shoes', color: '#151214', sole: '#0a0909' },
      victory: 1,
    },
    moves: {
      hp: { startup: 9, damage: 90 },
      s2: { name: 'Collar Rise' },
    },
  },
  {
    id: 'roxy',
    name: 'ROXY VOLTA',
    title: 'Spiked Riot',
    blurb: 'Street-punk kickboxer with a spiked pauldron and a bad attitude. Fastest legs in the district.',
    body: { height: 0.96, bulk: 0.84, arms: 0.98, legs: 1.08, head: 0.98, torso: 0.95, shoulders: 0.88, hips: 1.06, waist: 0.84 },
    stats: { health: 900, walkF: 3.7, walkB: 3.1, run: 7.6, dash: 11, jumpVY: 17.2, jumpVX: 4.5, mass: 0.85, stunMax: 560, pushW: 31 },
    look: {
      female: true,
      skin: '#7a4a32', outline: '#140d12', rim: '#ff3fd0',
      eyes: '#a6d63a', brows: 'sharp', mouth: 'lips', lips: '#8a2a7a', freckles: true,
      hair: { style: 'bun', color: '#15121a', streak: '#e0399b', streak2: '#2fc8b8' },
      earrings: '#e2b440', hoops: true,
      top: { type: 'punkvest', color: '#1d1a20', color2: '#d4318f', plaid: '#2a1430', spikes: '#c9c9d2', trim: '#3a3540' },
      pants: { type: 'pants', color: '#1a171d' },
      belt: { color: '#2a2224', buckle: '#c99b4a' },
      gloves: { type: 'wraps', color: '#d4318f' },
      shoes: { type: 'boots', color: '#1d1a20', sole: '#0c0a0d' },
      victory: 0,
    },
    moves: {
      lk: { damage: 46, startup: 5 },
      hk: { startup: 10, damage: 88 },
      lp: { damage: 26 },
      hp: { damage: 72 },
      s3: { name: 'Riot Spin' },
    },
  },
  {
    id: 'bruno',
    name: 'CHEF BRUNO KASSO',
    title: 'The Butcher of Pier 9',
    blurb: 'Runs the meanest kitchen on the docks. Slow, enormous, and every hit is a cleaver.',
    body: { height: 1.08, bulk: 1.36, arms: 1.02, legs: 0.94, head: 1.02, torso: 1.06, shoulders: 1.28, armBulk: 1.2, legBulk: 1.15, waist: 1.3, hands: 1.15 },
    stats: { health: 1200, walkF: 2.5, walkB: 2.0, run: 5.6, dash: 8, jumpVY: 14.6, jumpVX: 3.4, mass: 1.4, stunMax: 810, pushW: 42 },
    look: {
      skin: '#b07a52', outline: '#141012', rim: '#ff47d6',
      eyes: '#b04fd6', brows: 'thick', mouth: 'grin',
      hair: { style: 'short', color: '#1d1512' },
      beard: { style: 'full', color: '#1d1512' },
      hat: { type: 'chef', color: '#f1ede4', band: '#c9a24a' },
      top: { type: 'chefcoat', color: '#ece7dc', color2: '#d4318f', buttons: '#2a2224', kerchief: '#4a2e22' },
      pants: { type: 'pants', color: '#2a2630' },
      gloves: { type: 'none', color: '#b07a52' },
      shoes: { type: 'boots', color: '#2b2522', sole: '#100c0b' },
      victory: 3,
    },
    moves: {
      lp: { startup: 5, damage: 38 },
      hp: { startup: 10, damage: 108, hitstop: 13 },
      lk: { startup: 7, damage: 54 },
      hk: { startup: 13, damage: 112 },
      s1: { name: 'Meat Tenderizer', damage: 135 },
    },
  },
  {
    id: 'jaguar',
    name: 'OZ JAGUAR',
    title: 'Masked Dread',
    blurb: 'A luchador-shaman in a golden jaguar mask. Patient, precise, and terrifyingly flexible.',
    body: { height: 1.0, bulk: 0.94, arms: 1.03, legs: 1.03, head: 1.0, torso: 1.0, shoulders: 1.0 },
    stats: { health: 980, walkF: 3.4, walkB: 2.9, run: 7.0, dash: 10.4, jumpVY: 16.6, jumpVX: 4.3, mass: 0.95, stunMax: 610, pushW: 33 },
    look: {
      skin: '#6a4430', outline: '#120c10', rim: '#ff3fd0',
      eyes: '#e6e23a', brows: 'none', mouth: 'none',
      mask: { style: 'jaguar', color: '#c49a3c', markings: '#7a2a8a', visor: '#e6e23a' },
      dreads: { color: '#2a1d16', beads: '#3fd2c2' },
      hood: { color: '#7d7a5e', lining: '#d4318f' },
      top: { type: 'opencoat', color: '#8d8a6a', color2: '#d4318f', medallion: '#e2b440' },
      pants: { type: 'cargo', color: '#3a3428' },
      belt: { color: '#2a1f18', buckle: '#e2b440' },
      gloves: { type: 'wraps', color: '#3fb8a8' },
      shoes: { type: 'boots', color: '#2a2018', sole: '#0c0a08' },
      victory: 2,
    },
    moves: {
      s2: { name: 'Sun Pounce' },
      s3: { name: 'Jungle Arc', startup: 13 },
    },
  },
  {
    id: 'cinder',
    name: 'KAI "CINDER" VOSS',
    title: 'Pocket Wildfire',
    blurb: 'Moody street kid with fire in his fists. Keeps it caged until the bar is full, then lets it burn.',
    body: { height: 1.0, bulk: 0.86, arms: 1.03, legs: 1.04, head: 1.05, torso: 0.98, shoulders: 0.94, waist: 0.9 },
    stats: { health: 930, walkF: 3.4, walkB: 2.8, run: 7.1, dash: 10.3, jumpVY: 16.6, jumpVX: 4.3, mass: 0.92, stunMax: 590, pushW: 32 },
    look: {
      skin: '#b97f58', outline: '#140c10', rim: '#ff8a2a',
      eyes: '#f2c230', brows: 'angry', mouth: 'flat', freckles: true, ears: 'pointed',
      hair: { style: 'spiky', color: '#3a2618', streak: '#b8306f' },
      earrings: '#c9c9d2',
      top: { type: 'jacket', sleeves: 'short', color: '#2c3328', color2: '#3fb89a', inner: '#c42f8f', pendant: '#b8c0c8' },
      pants: { type: 'pants', color: '#26232c' },
      belt: { color: '#1a1416', buckle: '#9a9aa2' },
      gloves: { type: 'wraps', color: '#d9c9a6' },
      shoes: { type: 'sneakers', color: '#2a2a30', sole: '#e8e4dc' },
      victory: 1,
    },
    moves: {
      lp: { startup: 4 },
      s1: { name: 'Spark Fist' },
    },
  },
  {
    id: 'grizz',
    name: 'TEDDY "GRIZZ" BARRETT',
    title: 'Bear-Suit Bruiser',
    blurb: 'Lost a bet, kept the bear suit. Shrugs off a punch mid-charge and mauls whoever threw it.',
    body: { height: 1.06, bulk: 1.18, arms: 1.02, legs: 0.98, head: 1.04, torso: 1.04, shoulders: 1.16, armBulk: 1.1, waist: 1.12, hands: 1.1 },
    stats: { health: 1000, walkF: 2.9, walkB: 2.4, run: 6.3, dash: 9, jumpVY: 15.6, jumpVX: 3.8, mass: 1.2, stunMax: 690, pushW: 38 },
    look: {
      skin: '#8a5a3c', outline: '#160e0c', rim: '#3fd2c2',
      eyes: '#4fb8a0', brows: 'thick', mouth: 'flat',
      hair: { style: 'short', color: '#1a1210' },
      beard: { style: 'goatee', color: '#1a1210' },
      hood: { color: '#7a4a28', lining: '#d4318f', bear: true, snout: '#c9a27a', teeth: '#f2ead8', eyes: '#4fb8a0' },
      top: { type: 'onesie', color: '#7a4a28', color2: '#d4318f', belly: '#d8c39a', patch: '#d4318f' },
      pants: { type: 'pants', color: '#6e4224' },
      gloves: { type: 'paws', color: '#7a4a28', claws: '#f2ead8' },
      shoes: { type: 'boots', color: '#6e4224', sole: '#3a2414' },
      victory: 3,
    },
    moves: {
      hp: { damage: 90, stun: 80 },
      s1: { name: 'Honey Hammer' },
    },
  },
  {
    id: 'hawk',
    name: 'SILAS "HAWK" GREYWATER',
    title: 'The Unbending Elder',
    blurb: 'Thirty years of dock fights and still standing. Once he hooks you in, you stay for the whole lesson.',
    body: { height: 1.0, bulk: 1.1, arms: 1.04, legs: 0.98, head: 1.06, torso: 1.02, shoulders: 1.12, armBulk: 1.08, waist: 1.04 },
    stats: { health: 1060, walkF: 3.0, walkB: 2.5, run: 6.5, dash: 9.4, jumpVY: 15.8, jumpVX: 3.9, mass: 1.08, stunMax: 650, pushW: 35 },
    look: {
      skin: '#a8684a', outline: '#160c0c', rim: '#ff4fd8',
      eyes: '#5aa8c8', brows: 'thick', mouth: 'flat', facepaint: '#c8308f',
      hair: { style: 'ponytail', color: '#1a1414', tie: '#3fb8a8' },
      earrings: '#e2b440', hoops: true,
      hat: { type: 'feathers', color: '#e8dcc0', tip: '#d4318f', band: '#2f9a8a', pattern: '#e2b440', disc: '#e2b440' },
      top: { type: 'opencoat', color: '#7d7a3e', color2: '#2f9a8a', medallion: '#e2b440', pattern: '#2f9a8a', fringe: true, beads: '#e8e4d8' },
      pants: { type: 'pants', color: '#5a3a24' },
      belt: { color: '#3a2618', buckle: '#e2b440' },
      gloves: { type: 'none' },
      shoes: { type: 'boots', color: '#6a4a30', sole: '#2a1a10' },
      victory: 1,
    },
    moves: {
      hk: { damage: 82 },
      s1: { name: 'Hawk Strike' },
    },
  },
];

const deepMerge = (base, over) => {
  const out = { ...base };
  for (const k in over) {
    const v = over[k];
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])
      ? deepMerge(base[k], v) : v;
  }
  return out;
};

/** Returns a fully-resolved fighter definition: proportions computed and move list merged. */
export function buildFighterDef(id, overrides = {}) {
  const src = ROSTER.find((f) => f.id === id) || ROSTER[0];
  const def = deepMerge(src, overrides);
  const moves = {};
  const sig = SIGNATURES[def.id] || {};
  for (const mid of new Set([...Object.keys(MOVES), ...Object.keys(sig)])) {
    const base = MOVES[mid] ? deepMerge(MOVES[mid], sig[mid] || {}) : sig[mid];
    moves[mid] = compileMove(mid, deepMerge(base, def.moves?.[mid] || {}));
  }
  return { ...def, moves, props: buildProportions(def.body) };
}
