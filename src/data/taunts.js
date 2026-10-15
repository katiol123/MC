// SHOWBOATING: when the opponent is dizzy a fighter may play to the crowd instead of cashing in
// the free combo. It is a real move with a real risk: it lasts TAUNT_FRAMES (longer than most of
// the dizzy window), the fighter cannot block, and a hit during it is a counter hit. Completed, the
// crowd goes wild: spectacle points (fame in tournaments) and a little super meter.
//   keys   [frame, raw pose, easing?] sampled by the 'taunt' clip
//   cues   [{ at, sfx?, fx? }] fx positions are relative to the fighter: dx forward, y up from the floor
//   prop / fire / bite / flurry   [from, to, value?] frame ranges for held props and render flags
//   face   [[from, to, expression]] facial expression override (default: grin)
import * as K from '../anim/poses.js';
import { ATTACK_POSES as AP } from '../anim/attackPoses.js';

const P = K.P;
const S = K.STANCE;

export const TAUNT_FRAMES = 90;
export const TAUNT_METER = 25; // super meter for a completed showboat

/** Repeats [a, b] poses from `from` to `to` every `step` frames. */
function alt(from, to, step, a, b) {
  const out = [];
  for (let f = from, i = 0; f <= to; f += step, i++) out.push([f, i % 2 ? b : a]);
  return out;
}
const note = (at, dx = 40, y = 210) => ({ at, fx: { kind: 'label', text: '♪', dx, y, color: '#ffd23f', life: 34 } });
const label = (at, text, color = '#ffd23f', y = 320, life = 50) => ({ at, fx: { kind: 'label', text, dx: 0, y, color, life } });

const FLEX = K.VICTORY[3], FIST_UP = K.VICTORY[0], BOW = K.VICTORY[2], CROSSED = K.VICTORY[1];

export const TAUNTS = {
  // knuckle crack, then alternating biceps to both sides of the crowd
  brick: {
    name: 'Gun Show',
    keys: [[0, S], [8, P(S, { fa: [72, 96, 0], ba: [82, 92, 0], lean: 10 })], [14, P(S, { fa: [78, 84, 0], ba: [86, 82, 0], lean: 12, chest: 6 })], [20, P(S, { fa: [72, 96, 0], ba: [82, 92, 0] })],
      [32, P(S, { fa: [92, 96, 0], ba: [174, 14, 0], lean: -4, chest: -10, head: -10, y: 116 })], [46, P(S, { fa: [94, 100, 0], ba: [176, 10, 0], lean: -6, chest: -12, head: -12, y: 114 })],
      [56, P(S, { fa: [172, 16, 0], ba: [96, 96, 0], lean: -4, chest: -10, head: -10, y: 116 })], [68, P(S, { fa: [174, 12, 0], ba: [98, 100, 0], lean: -6, chest: -12, head: -12, y: 114 })],
      [80, P(S, { fa: [96, 104, 0], ba: [100, 100, 0], lean: 2, chest: -14, head: -8, y: 108, ff: [32, 8, 0], bf: [-32, 8, 0] })], [90, S]],
    cues: [{ at: 9, sfx: 'snap' }, { at: 15, sfx: 'snap' }, { at: 32, sfx: 'boing' }, label(40, 'FLEX!')],
  },
  // tips the top hat to the crowd and bows with a flourish
  rattigan: {
    name: 'Hat Trick',
    keys: [[0, S], [14, P(S, { fa: [160, 150, 20], ba: [20, 30, 0], lean: -4, y: 118, ff: [20, 8, 0], bf: [-20, 8, 0] })], [26, P(S, { fa: [170, 120, 20], ba: [20, 30, 0], head: -14, y: 118, ff: [20, 8, 0], bf: [-20, 8, 0] })],
      [44, P(S, { fa: [96, 20, 0], ba: [-30, 20, 0], lean: 40, chest: 14, neck: 12, head: 14, y: 112, ff: [24, 8, 0], bf: [-26, 8, 0] })], [64, P(S, { fa: [96, 20, 0], ba: [-30, 20, 0], lean: 44, chest: 16, neck: 14, head: 16, y: 110, ff: [24, 8, 0], bf: [-26, 8, 0] })],
      [80, P(CROSSED, { head: -12 })], [90, S]],
    cues: [{ at: 26, sfx: 'ding' }, { at: 46, sfx: 'cash' }, label(50, 'MERCI!', '#ffe08a')],
  },
  // holds his belly and roars with laughter, head thrown back
  smiles: {
    name: 'Belly Laugh',
    keys: [[0, S], ...alt(10, 74, 8, P(S, { fa: [24, 110, 0], ba: [20, 110, 0], lean: -14, chest: -10, neck: -20, head: -26, y: 116 }), P(S, { fa: [26, 100, 0], ba: [22, 100, 0], lean: 10, chest: 6, neck: 6, head: 2, y: 112 })), [90, S]],
    cues: [{ at: 10, sfx: 'laugh' }, label(20, 'HA HA HA!', '#ffe08a')],
    face: [[8, 80, 'shout']],
  },
  // windmill air guitar and a headbang
  jax: {
    name: 'Air Guitar',
    keys: [[0, S], [8, P(S, { fa: [78, 24, 0], ba: [178, 6, 0], lean: -8, y: 112 })], [16, P(S, { fa: [78, 24, 0], ba: [36, 64, 0], lean: 14, y: 108 })],
      [24, P(S, { fa: [80, 22, 0], ba: [178, 6, 0], lean: -8, y: 112 })], [32, P(S, { fa: [80, 22, 0], ba: [36, 64, 0], lean: 14, y: 108 })],
      ...alt(40, 76, 6, P(S, { fa: [70, 28, 0], ba: [34, 70, 0], lean: 30, neck: 22, head: 24, y: 106 }), P(S, { fa: [88, 20, 0], ba: [44, 56, 0], lean: -6, neck: -18, head: -20, y: 110 })), [90, S]],
    cues: [{ at: 16, sfx: 'chord' }, { at: 32, sfx: 'chord' }, note(18), note(34, 60, 230), label(50, 'ROCK!', '#ff4fd8')],
    face: [[10, 80, 'shout']],
  },
  // straightens the collar, brushes off the shoulder, kisses his fingertips
  vellaro: {
    name: 'Smooth Operator',
    keys: [[0, S], [12, P(S, { fa: [44, 150, 0], ba: [48, 148, 0], lean: -2, head: -12, y: 120 })], [24, P(S, { fa: [42, 152, 0], ba: [46, 150, 0], neck: -10, head: -16, y: 120 })],
      [36, P(S, { fa: [70, 140, 0], ba: [30, 40, 0], head: -6, y: 120 })], [44, P(S, { fa: [96, 30, 0], ba: [30, 40, 0], head: -8, y: 120 })], [52, P(CROSSED, {})],
      [66, P(S, { fa: [62, 154, 0], ba: [10, 20, 0], head: -4, y: 120 })], [76, P(S, { fa: [128, 20, 0], ba: [10, 20, 0], head: -14, y: 120 })], [90, S]],
    cues: [{ at: 44, sfx: 'whoosh' }, { at: 70, sfx: 'kiss' }, label(72, 'BELLISSIMO', '#ffe08a')],
  },
  // stomp, devil horns up and a tongue-out headbang
  roxy: {
    name: 'Mosh Pit',
    keys: [[0, S], [8, P(S, { ff: [36, 40, 0], fa: [60, 110, 0], y: 116 })], [14, P(S, { ff: [32, 8, 0], y: 110 })],
      ...alt(20, 78, 7, P(S, { fa: [170, 20, 0], ba: [165, 25, 0], lean: 22, neck: 18, head: 20, y: 110 }), P(S, { fa: [175, 10, 0], ba: [170, 15, 0], lean: -8, neck: -16, head: -20, y: 114 })), [90, S]],
    cues: [{ at: 14, sfx: 'thud' }, { at: 14, fx: { kind: 'dust', dx: 30, y: 4, n: 8 } }, { at: 22, sfx: 'chord' }, label(30, 'RIOT!', '#ff4fd8')],
    face: [[18, 82, 'shout']],
  },
  // sharpens the butcher knife on his forearm, then a chef's kiss
  bruno: {
    name: 'Mise en Place',
    keys: [[0, S], [10, P(S, { fa: [60, 80, 0], ba: [66, 70, 0], lean: -4, head: 10, y: 118 })],
      ...alt(16, 58, 6, P(S, { fa: [86, 40, 0], ba: [66, 70, 0], lean: -4, head: 12, y: 118 }), P(S, { fa: [52, 92, 0], ba: [68, 68, 0], lean: -2, head: 14, y: 118 })),
      [68, P(S, { fa: [150, 30, 0], ba: [10, 20, 0], head: -10, y: 120 })], [78, P(S, { fa: [62, 154, 0], ba: [10, 20, 0], head: -14, y: 120 })], [90, S]],
    cues: [16, 46].map((at) => ({ at, sfx: 'shing' })).concat([{ at: 30, fx: { kind: 'sparks', dx: 40, y: 150, n: 6, color: '#ffe08a' } }, { at: 80, sfx: 'kiss' }, label(80, 'PERFETTO!', '#ffe08a')]),
    prop: [[8, 70, { type: 'knife', hand: 'F' }]],
  },
  // salutes the sun: low crouch, then rises with both arms to the sky
  jaguar: {
    name: 'Sun Salute',
    keys: [[0, S], [14, P(K.CROUCH, { fa: [10, 20, 0], ba: [6, 20, 0], lean: 40, neck: 10, head: 14 })], [30, P(K.CROUCH, { fa: [20, 30, 0], ba: [16, 30, 0], lean: 44, neck: 14, head: 18 })],
      [46, P(S, { fa: [168, 20, 0], ba: [172, 16, 0], lean: -14, chest: -14, neck: -18, head: -26, y: 120, ff: [22, 8, 0], bf: [-22, 8, 0] })], [72, P(S, { fa: [174, 10, 0], ba: [178, 10, 0], lean: -18, chest: -16, neck: -22, head: -30, y: 122, ff: [22, 8, 0], bf: [-22, 8, 0] })], [90, S]],
    cues: [{ at: 30, sfx: 'thud' }, { at: 46, sfx: 'boom' }, { at: 46, fx: { kind: 'ring', dx: 0, y: 260, r: 20, vr: 6, life: 30, color: '#ffd23f' } }, label(52, 'INTI!', '#ffd23f', 330, 60)],
    face: [[40, 80, 'shout']],
  },
  // lights his fist and blows the flame out like a smoking gun
  cinder: {
    name: 'Hot Hands',
    keys: [[0, S], [12, P(S, { fa: [96, 92, 0], ba: [20, 60, 0], head: 4, y: 118 })], [40, P(S, { fa: [98, 90, 0], ba: [20, 60, 0], head: 6, y: 118 })],
      [52, P(S, { fa: [86, 104, 0], ba: [20, 60, 0], head: 12, neck: 8, lean: 4, y: 118 })], [64, P(S, { fa: [88, 102, 0], ba: [20, 60, 0], head: 12, neck: 8, lean: 4, y: 118 })], [78, P(CROSSED, { head: -10 })], [90, S]],
    cues: [{ at: 12, sfx: 'fire' }, { at: 56, sfx: 'whoosh' }, { at: 58, fx: { kind: 'smoke', dx: 20, y: 230, n: 8 } }, label(60, 'TOO HOT!', '#ff8a3a')],
    fire: [[12, 54]],
  },
  // throws the arms wide, claws out, and roars at the crowd
  grizz: {
    name: 'Big Roar',
    keys: [[0, S], [12, P(S, { fa: [110, 60, 0], ba: [104, 64, 0], lean: -10, y: 114 })], [24, P(S, { fa: [140, 50, 0], ba: [134, 54, 0], lean: 20, chest: 10, neck: 10, head: -6, y: 104, ff: [36, 8, 0], bf: [-36, 8, 0] })],
      [62, P(S, { fa: [146, 46, 0], ba: [140, 50, 0], lean: 24, chest: 12, neck: 12, head: -4, y: 102, ff: [36, 8, 0], bf: [-36, 8, 0] })], [76, P(S, { fa: [60, 90, 0], ba: [56, 90, 0], y: 114 })], [90, S]],
    cues: [{ at: 24, sfx: 'roar' }, { at: 24, fx: { kind: 'shake', amount: 7 } }, label(30, 'RAWRR!', '#ffb347', 330, 60)],
    face: [[20, 72, 'shout']],
  },
  // the crane: stands on one leg, wings spread, perfectly still
  hawk: {
    name: 'Crane Stance',
    keys: [[0, S], [16, P(S, { fa: [104, 14, 30], ba: [-96, 14, -30], ff: [16, 72, 30], bf: [-6, 8, 0], lean: 4, y: 120, head: -6 })],
      [70, P(S, { fa: [112, 10, 40], ba: [-104, 10, -40], ff: [18, 76, 34], bf: [-6, 8, 0], lean: 4, y: 121, head: -8 })], [80, P(BOW, {})], [90, S]],
    cues: [{ at: 16, sfx: 'whoosh' }, { at: 40, sfx: 'ding' }, label(40, 'PATIENCE', '#bfe7ff')],
    face: [[12, 76, 'strain']],
  },
  // a bow, then the classic come-on: palm up, fingers beckoning
  tao: {
    name: 'Come On',
    keys: [[0, S], [10, BOW], [24, BOW], ...alt(32, 76, 6, P(S, { fa: [90, 30, 0], ba: [40, 120, 0], lean: 4, y: 116 }), P(S, { fa: [96, 70, 0], ba: [40, 120, 0], lean: 4, y: 116 })), [90, S]],
    cues: [{ at: 12, sfx: 'snap' }, { at: 40, sfx: 'whoosh' }, label(46, 'COME ON!', '#ffffff')],
    flurry: [[34, 74]],
  },
  // shiko: lifts a leg high to the side and stamps the ring, twice
  goro: {
    name: 'Shiko Stomp',
    keys: [[0, S], [14, P(S, { lean: -18, x: -10, fa: [40, 60, 0], ba: [30, 60, 0], ff: [60, 110, 20], bf: [-30, 8, 0], y: 112 })], [26, P(S, { lean: 10, fa: [30, 40, 0], ba: [30, 40, 0], ff: [40, 8, 0], bf: [-34, 8, 0], y: 92 })],
      [32, P(S, { lean: 10, fa: [30, 40, 0], ba: [30, 40, 0], ff: [40, 8, 0], bf: [-34, 8, 0], y: 90 })],
      [48, P(S, { lean: 18, x: 8, fa: [40, 60, 0], ba: [30, 60, 0], ff: [40, 8, 0], bf: [-60, 104, -20], y: 112 })], [60, P(S, { lean: 10, fa: [30, 40, 0], ba: [30, 40, 0], ff: [40, 8, 0], bf: [-34, 8, 0], y: 92 })],
      [76, P(S, { lean: 10, fa: [30, 40, 0], ba: [30, 40, 0], ff: [40, 8, 0], bf: [-34, 8, 0], y: 94 })], [90, S]],
    cues: [26, 60].flatMap((at) => [{ at, sfx: 'thud' }, { at, fx: { kind: 'shake', amount: 8 } }, { at, fx: { kind: 'dust', dx: 0, y: 4, n: 14, spread: 60 } }]).concat([label(64, 'DOSUKOI!', '#ffffff')]),
    face: [[10, 80, 'strain']],
  },
  // sobs into his hands... then a cheeky "ta-da!"
  sobby: {
    name: 'Crocodile Tears',
    keys: [[0, S], ...alt(8, 50, 6, P(S, { fa: [48, 124, 0], ba: [54, 118, 0], lean: 22, neck: 14, head: 18, y: 112 }), P(S, { fa: [50, 120, 0], ba: [56, 114, 0], lean: 27, neck: 16, head: 20, y: 109 })),
      [62, P(S, { fa: [130, 20, 0], ba: [-60, 20, 0], lean: -10, head: -14, y: 120, ff: [30, 8, 0], bf: [-30, 8, 0] })], [80, P(S, { fa: [134, 16, 0], ba: [-64, 16, 0], lean: -12, head: -16, y: 120, ff: [30, 8, 0], bf: [-30, 8, 0] })], [90, S]],
    cues: [{ at: 10, sfx: 'sob' }, { at: 20, fx: { kind: 'drops', dx: 20, y: 230, n: 6, color: '#7fd3ff' } }, { at: 34, fx: { kind: 'drops', dx: 20, y: 230, n: 6, color: '#7fd3ff' } }, { at: 62, sfx: 'boing' }, label(64, 'TA-DA!', '#ffe08a')],
    face: [[8, 56, 'hurt']],
  },
  // arms become the jaws: three big snaps over his head
  snapper: {
    name: 'Jaw Snap',
    keys: [[0, S], ...alt(10, 70, 10, P(S, { fa: [150, 20, 0], ba: [60, 20, 0], lean: -6, y: 116 }), P(S, { fa: [108, 10, 0], ba: [96, 10, 0], lean: 8, y: 114 })), [82, CROSSED], [90, S]],
    cues: [20, 40, 60].map((at) => ({ at, sfx: 'chomp' })).concat([label(42, 'SNAP!', '#9be36b')]),
    bite: [[18, 24], [38, 44], [58, 64]],
  },
  // a flourish on the guitar and a grito
  chuy: {
    name: 'Serenata',
    keys: [[0, S], ...alt(8, 50, 4, P(S, { y: 114, lean: -6, chest: -6, head: 8, fa: [70, 30, 0], ba: [36, 64, 0] }), P(S, { y: 114, lean: -6, chest: -6, head: 8, fa: [70, 30, 0], ba: [26, 84, 0] })),
      [64, P(S, { fa: [160, 150, 0], ba: [150, 150, 0], neck: -10, head: -20, y: 118 })], [80, FIST_UP], [90, S]],
    cues: [{ at: 8, sfx: 'chord' }, { at: 30, sfx: 'chord' }, note(10), note(20, 60, 240), note(32, 30, 250), { at: 64, sfx: 'cheer' }, label(66, '¡AY AY AY!', '#ffd23f')],
    face: [[60, 84, 'shout']],
    prop: [[6, 56, { type: 'guitarPlay', hand: 'F' }]],
  },
};

/** Value of a frame-range list ([from, to, value?]) at frame f, or null. */
export function rangeAt(list, f) {
  for (const [a, b, v] of list || []) if (f >= a && f < b) return v ?? true;
  return null;
}
