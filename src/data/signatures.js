// Per-fighter signature special (s4, input ↓↙← + punch) and super (su, ↓↘→↓↘→ + punch).
// Pure data: the generic systems (sequences, projectiles, throws, counter stance, air dives)
// interpret these fields, so each fighter gets distinct mechanics without fighter-specific code.
//
// Sequence steps: { anim, len, hitAt (frame inside the step, omit for no hit), hitLen, hit: {...},
//   vx (forward speed during the step), teleport: 'behind' }

const S4_INPUT = { motion: '214', buttons: ['lp', 'hp'] };
const SUPER_INPUT = { motion: '236236', buttons: ['lp', 'hp'] };

/** Defaults for every super: full meter, invulnerable start-up, cinematic freeze. */
const SUPER = { super: true, isSpecial: true, strength: 'special', stance: 'stand', input: SUPER_INPUT, priority: 6 };

// Small helpers to keep step lists readable.
// the hit lands ~55% into the step, leaving time for the limb to come back before the next strike
// big-arc strikes need more wind-up frames so the limb does not cross the screen in one frame
const MIN_HIT_AT = { panSwing: 9, uppercut: 9, rising: 9, chop: 15, roundhouse: 9, whirl: 10, lunge: 9 };
const step = (anim, len, hit, extra = {}) => {
  const hitAt = Math.max(3, Math.round(len * 0.55), MIN_HIT_AT[anim] || 0);
  const kick = anim === 'roundhouse' || anim === 'frontKick' || anim === 'whirl';
  const finisher = hit && ['launch', 'knockdown', 'knockback'].includes(hit.reaction);
  return { anim, len: Math.max(len, hitAt + (kick ? 9 : 6)), hitAt, hitLen: finisher ? 4 : 2, vx: 2.6, hit, ...extra };
};
/** Wrist cock of the pan handle relative to the forearm (radians); the painter uses the same value. */
export const PAN_COCK = 0.35;
/** Frying pan held in the lead hand: forearm + a capsule over the pan head beyond the fist. */
const PAN = { hitboxes: [{ a: 'shoulderF', b: 'elbowF', r: 14 }, { a: 'elbowF', b: 'handF', r: 14 }, { a: 'handF', b: 'handF', dir: 'elbowF', rot: PAN_COCK, ext: 50, r: 20 }], prop: 'pan' };
const H = (damage, o = {}) => ({ damage, hitstun: 32, blockstun: 16, hitstop: 6, reaction: 'light', push: { hit: 1.4, block: 2.6 }, stun: 0, ...o });
const FINISH = (damage, reaction = 'launch', o = {}) => H(damage, {
  hitstun: 36, hitstop: 14, reaction, push: { hit: 4, block: 5 }, launch: { vx: 5, vy: reaction === 'launch' ? 13 : 8 }, shake: 9, ...o,
});

/** Fire strikes (Cinder's super): flaming fists, fire sparks, and a burn lasting 10 s (600 ticks). */
const FIRE = { fire: true, burn: 600 };

/** Bear claws (Grizz's super): whole arm plus the claws reaching past the paw; claw-slash effects. */
const CLAW_F = { claw: true, hitboxes: [{ a: 'shoulderF', b: 'elbowF', r: 14 }, { a: 'elbowF', b: 'handF', r: 15 }, { a: 'handF', b: 'handF', dir: 'elbowF', ext: 22, r: 15 }] };
const CLAW_B = { claw: true, hitboxes: [{ a: 'shoulderB', b: 'elbowB', r: 14 }, { a: 'elbowB', b: 'handB', r: 15 }, { a: 'handB', b: 'handB', dir: 'elbowB', ext: 22, r: 15 }] };

export const SIGNATURES = {
  brick: {
    s4: {
      name: 'Anchor Drop', anim: 'hammer', input: S4_INPUT, stance: 'stand', strength: 'special', isSpecial: true,
      startup: 17, active: 8, recovery: 14, air: { vy: 9, vx: 3.4, at: 6 }, landRecovery: 10,
      damage: 120, stun: 90, hitstun: 26, blockstun: 18, hitstop: 13,
      height: 'overhead', reaction: 'knockdown', push: { hit: 3, block: 5 }, launch: { vx: 3, vy: 7 },
      hitboxes: [{ a: 'elbowF', b: 'handF', r: 15 }, { a: 'elbowB', b: 'handB', r: 15 }],
      juggle: 2, priority: 4, shake: 8,
    },
    su: {
      ...SUPER, name: 'Dockyard Demolition', anim: 'sequence',
      steps: [step('jab', 9, H(45)), step('cross', 10, H(50)), step('jab', 8, H(40)), step('cross', 10, H(50)), step('lunge', 18, FINISH(95), { vx: 6 })],
      recoveryAfter: 16,
    },
  },
  rattigan: {
    s4: {
      name: 'Coin Flick', anim: 'flick', input: S4_INPUT, stance: 'stand', strength: 'special', isSpecial: true,
      startup: 11, active: 2, recovery: 20, hitboxes: [],
      projectile: { at: 12, kind: 'coin', speed: 11.5, y: 150, r: 13, life: 80, hits: 1,
        hit: { damage: 58, hitstun: 18, blockstun: 14, hitstop: 8, reaction: 'light', push: { hit: 3, block: 4 }, stun: 40, height: 'mid' } },
      priority: 2,
    },
    su: {
      ...SUPER, name: 'Grand Heist', anim: 'sequence',
      steps: [
        { anim: 'flick', len: 12 },
        step('cross', 11, H(60), { teleport: 'behind', vx: 1 }),
        step('jab', 8, H(45)),
        step('roundhouse', 16, FINISH(110, 'knockdown')),
      ],
      recoveryAfter: 16,
    },
  },
  smiles: {
    s4: {
      name: 'Long Leg Slide', anim: 'slide', input: S4_INPUT, stance: 'stand', strength: 'special', isSpecial: true,
      startup: 10, active: 12, recovery: 18, motion: [{ from: 6, to: 22, vx: 9 }],
      damage: 85, stun: 60, hitstun: 26, blockstun: 14, hitstop: 10,
      height: 'low', reaction: 'knockdown', push: { hit: 3, block: 6 }, launch: { vx: 2, vy: 6 },
      hitboxes: [{ a: 'kneeF', b: 'ankleF', r: 12 }, { a: 'ankleF', b: 'toeF', r: 13 }],
      invuln: [{ from: 8, to: 20, parts: ['head'] }], juggle: 2, priority: 3, shake: 4,
    },
    su: {
      ...SUPER, name: 'Laughing Storm', anim: 'sequence',
      steps: [step('frontKick', 14, H(45)), step('roundhouse', 16, H(55)), step('frontKick', 14, H(40)), step('roundhouse', 16, H(55)), step('roundhouse', 18, FINISH(95), { vx: 4 })],
      recoveryAfter: 18,
    },
  },
  jax: {
    s4: {
      name: 'Feedback Wave', anim: 'pushWave', input: S4_INPUT, stance: 'stand', strength: 'special', isSpecial: true,
      startup: 13, active: 2, recovery: 22, hitboxes: [],
      projectile: { at: 14, kind: 'wave', speed: 6.5, y: 135, r: 26, life: 110, hits: 2, interval: 7,
        hit: { damage: 38, hitstun: 17, blockstun: 12, hitstop: 6, reaction: 'light', push: { hit: 2.5, block: 3 }, stun: 35, height: 'mid' } },
      priority: 2,
    },
    su: {
      ...SUPER, name: 'Mosh Pit', anim: 'sequence',
      steps: [step('jab', 8, H(40)), step('jab', 8, H(40)), step('cross', 10, H(50)), step('frontKick', 14, H(50)), step('uppercut', 18, FINISH(100), { vx: 6 })],
      recoveryAfter: 16,
    },
  },
  vellaro: {
    s4: {
      name: 'Velvet Counter', anim: 'counterStance', type: 'counter', input: S4_INPUT, stance: 'stand', strength: 'special', isSpecial: true,
      startup: 3, active: 20, recovery: 18, hitboxes: [], counterWindow: [3, 22], followup: 'vc', priority: 1,
    },
    // the automatic counter-attack after a successful parry (not directly selectable)
    vc: {
      name: 'Velvet Counter', anim: 'sequence', stance: 'stand', strength: 'special', isSpecial: true, hidden: true, priority: 6,
      steps: [step('cross', 9, H(55, { hitstun: 30 }), { hitAt: 6 }), step('lunge', 16, FINISH(85, 'knockback'), { vx: 6 })],
      recoveryAfter: 14, invuln: [{ from: 1, to: 14, parts: ['all'] }],
    },
    su: {
      ...SUPER, name: 'Collar Execution', anim: 'sequence',
      steps: [step('jab', 8, H(40)), step('cross', 10, H(50)), step('jab', 8, H(40)), step('cross', 10, H(55)), step('lunge', 18, FINISH(105, 'knockback'), { vx: 6 })],
      recoveryAfter: 16,
    },
  },
  roxy: {
    s4: {
      name: 'Spike Rush', anim: 'sequence', input: S4_INPUT, stance: 'stand', strength: 'special', isSpecial: true, priority: 4,
      steps: [
        step('frontKick', 14, H(32, { hitstun: 22, blockstun: 12 }), { vx: 3.5 }),
        step('roundhouse', 16, H(36, { hitstun: 22, blockstun: 12 }), { vx: 3.5 }),
        step('frontKick', 14, FINISH(48, 'knockdown', { hitstun: 26, hitstop: 11, launch: { vx: 5, vy: 7 } }), { vx: 3 }),
      ],
      recoveryAfter: 16, chip: true,
    },
    su: {
      ...SUPER, name: 'Riot Barrage', anim: 'sequence',
      steps: [step('frontKick', 14, H(40)), step('roundhouse', 16, H(50)), step('frontKick', 14, H(40)), step('roundhouse', 16, H(50)), step('whirl', 18, FINISH(105, 'knockdown'))],
      recoveryAfter: 18,
    },
  },
  bruno: {
    s4: {
      name: 'Into the Pot', anim: 'grab', type: 'throw', input: S4_INPUT, stance: 'stand', strength: 'special', isSpecial: true,
      startup: 9, active: 3, recovery: 28, hitboxes: [], range: 62, techable: false,
      throwAnim: 'slam', duration: 44, release: 28, damage: 150, stun: 80, priority: 1,
    },
    su: {
      ...SUPER, name: "Chef's Special", anim: 'sequence', prop: { type: 'pan', hand: 'F' },
      steps: [step('chop', 19, H(60, PAN)), step('panSwing', 14, H(55, PAN)), step('chop', 19, H(60, PAN)), step('chop', 19, FINISH(120, 'knockdown', PAN))],
      recoveryAfter: 18,
    },
  },
  jaguar: {
    s4: {
      name: 'Sun Pounce', anim: 'pounce', input: S4_INPUT, stance: 'stand', strength: 'special', isSpecial: true,
      startup: 14, active: 14, recovery: 10, air: { vy: 8.5, vx: 8, at: 8 }, landRecovery: 12,
      damage: 105, stun: 80, hitstun: 24, blockstun: 16, hitstop: 12,
      height: 'overhead', reaction: 'knockdown', push: { hit: 3, block: 4 }, launch: { vx: 4, vy: 6 },
      hitboxes: [{ a: 'elbowF', b: 'handF', r: 15 }, { a: 'elbowB', b: 'handB', r: 14 }, { a: 'neck', b: 'pelvis', r: 16 }],
      juggle: 2, priority: 4, shake: 6,
    },
    su: {
      ...SUPER, name: 'Sun Eclipse', anim: 'sequence',
      steps: [step('jab', 8, H(40)), step('cross', 10, H(50)), step('jab', 8, H(40)), step('cross', 10, H(50)), step('lunge', 18, FINISH(100), { vx: 6 })],
      recoveryAfter: 16,
    },
  },
  cinder: {
    // a short-range fire burst from both palms: two hits, pushes the opponent away
    s4: {
      name: 'Flash Point', anim: 'pushWave', input: S4_INPUT, stance: 'stand', strength: 'special', isSpecial: true, fire: true,
      startup: 12, active: 2, recovery: 24, hitboxes: [],
      projectile: { at: 13, kind: 'flame', speed: 4.2, y: 130, r: 34, life: 30, hits: 2, interval: 9,
        hit: { damage: 36, hitstun: 20, blockstun: 13, hitstop: 7, reaction: 'light', push: { hit: 3.5, block: 4 }, stun: 40, height: 'mid', fire: true } },
      priority: 2,
    },
    su: {
      ...SUPER, name: 'Wildfire Rush', anim: 'sequence', fire: true,
      steps: [step('jab', 9, H(45, FIRE)), step('cross', 10, H(50, FIRE)), step('jab', 8, H(40, FIRE)), step('cross', 10, H(50, FIRE)), step('lunge', 18, FINISH(100, 'launch', FIRE), { vx: 6 })],
      recoveryAfter: 16,
    },
  },
  grizz: {
    // armoured shoulder charge: absorbs one strike during the run-up and keeps going
    s4: {
      name: 'Grizzly Charge', anim: 'tackle', input: S4_INPUT, stance: 'stand', strength: 'special', isSpecial: true,
      startup: 14, active: 12, recovery: 28, motion: [{ from: 6, to: 24, vx: 8.5 }],
      damage: 85, stun: 70, hitstun: 24, blockstun: 16, hitstop: 12,
      height: 'mid', reaction: 'knockdown', push: { hit: 4, block: 6 }, launch: { vx: 5, vy: 6 },
      hitboxes: [{ a: 'shoulderF', b: 'elbowF', r: 20 }, { a: 'neck', b: 'shoulderF', r: 20 }],
      armor: { from: 4, to: 24, hits: 1 }, juggle: 2, priority: 3, shake: 7,
    },
    su: {
      ...SUPER, name: 'Grizzly Fury', anim: 'sequence', claws: true,
      steps: [step('panSwing', 14, H(45, CLAW_F)), step('cross', 10, H(50, CLAW_B)), step('panSwing', 14, H(45, CLAW_F)), step('cross', 10, H(50, CLAW_B)), step('chop', 19, FINISH(115, 'knockdown', CLAW_F))],
      recoveryAfter: 18,
    },
  },
};
