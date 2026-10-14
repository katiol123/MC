// Base move list shared by all fighters. Fighters override any field in src/data/fighters.js.
// Frame data is in simulation ticks (1/60 s). Hitboxes are capsules attached to skeleton joints
// (a -> b, radius r) and exist only during the listed active frames (1-based within the active window).
//
// Fields:
//   startup/active/recovery  frames of each phase (first active frame = startup + 1)
//   damage, stun             health damage, dizzy-meter damage
//   hitstun/blockstun        frames the defender is locked on hit / on block
//   hitstop                  frames both fighters freeze on contact
//   height                   'mid' | 'low' (block crouching) | 'overhead' (block standing)
//   reaction                 'light' | 'heavy' | 'stagger' | 'knockback' | 'launch' | 'knockdown'
//   push                     {hit, block} horizontal speed given to the defender
//   launch                   {vx, vy} for airborne reactions
//   chain                    normals this move may be cancelled into on contact
//   special                  may be cancelled into special moves on contact
//   juggle                   juggle points used when hitting an airborne opponent
//   priority                 trade/clash resolution (higher wins clashes)
//   invuln                   [{from, to, parts}] frames where listed hurtbox parts are intangible
//   motion                   {vx at frame ranges} forward motion of the attacker
export const MOVES = {
  lp: {
    name: 'Jab', anim: 'jab', button: 'lp', stance: 'stand', strength: 'light',
    startup: 4, active: 3, recovery: 7,
    damage: 32, stun: 30, hitstun: 14, blockstun: 10, hitstop: 7,
    height: 'mid', reaction: 'light', push: { hit: 3.2, block: 4 },
    hitboxes: [{ a: 'wristF', b: 'handF', r: 12 }],
    chain: ['lp', 'lk', 'hp', 'hk'], special: true, cancelWindow: 8,
    juggle: 1, priority: 1,
  },
  hp: {
    name: 'Cross', anim: 'cross', button: 'hp', stance: 'stand', strength: 'heavy',
    startup: 8, active: 4, recovery: 15,
    damage: 82, stun: 70, hitstun: 21, blockstun: 16, hitstop: 11,
    height: 'mid', reaction: 'heavy', push: { hit: 5, block: 6 },
    hitboxes: [{ a: 'elbowB', b: 'handB', r: 13 }],
    chain: [], special: true, cancelWindow: 10,
    juggle: 1, priority: 3, motion: [{ from: 6, to: 10, vx: 2.2 }], shake: 3,
  },
  lk: {
    name: 'Snap Kick', anim: 'frontKick', button: 'lk', stance: 'stand', strength: 'light',
    startup: 6, active: 3, recovery: 10,
    damage: 45, stun: 40, hitstun: 16, blockstun: 12, hitstop: 8,
    height: 'mid', reaction: 'light', hitLevel: 'low', push: { hit: 3.8, block: 4.6 },
    hitboxes: [{ a: 'kneeF', b: 'ankleF', r: 11 }, { a: 'ankleF', b: 'toeF', r: 11 }],
    chain: ['hp', 'hk'], special: true, cancelWindow: 8,
    juggle: 1, priority: 2,
  },
  hk: {
    name: 'Roundhouse', anim: 'roundhouse', button: 'hk', stance: 'stand', strength: 'heavy',
    startup: 11, active: 4, recovery: 19,
    damage: 92, stun: 90, hitstun: 24, blockstun: 17, hitstop: 12,
    height: 'mid', reaction: 'knockback', push: { hit: 7.5, block: 6.5 }, launch: { vx: 5.5, vy: 7 },
    hitboxes: [{ a: 'kneeB', b: 'ankleB', r: 12 }, { a: 'ankleB', b: 'toeB', r: 13 }],
    chain: [], special: false,
    juggle: 2, priority: 3, shake: 5,
  },
  clp: {
    name: 'Crouch Jab', anim: 'crouchJab', button: 'lp', stance: 'crouch', strength: 'light',
    startup: 4, active: 2, recovery: 8,
    damage: 26, stun: 25, hitstun: 13, blockstun: 9, hitstop: 6,
    height: 'mid', reaction: 'light', push: { hit: 3, block: 3.8 },
    hitboxes: [{ a: 'wristF', b: 'handF', r: 12 }],
    chain: ['clp', 'clk', 'chp', 'chk'], special: true, cancelWindow: 8,
    juggle: 1, priority: 1,
  },
  clk: {
    name: 'Shin Kick', anim: 'lowKick', button: 'lk', stance: 'crouch', strength: 'light',
    startup: 5, active: 3, recovery: 10,
    damage: 34, stun: 30, hitstun: 14, blockstun: 10, hitstop: 7,
    height: 'low', reaction: 'light', hitLevel: 'low', push: { hit: 3, block: 3.6 },
    hitboxes: [{ a: 'kneeF', b: 'ankleF', r: 10 }, { a: 'ankleF', b: 'toeF', r: 11 }],
    chain: ['clp', 'chp', 'chk'], special: true, cancelWindow: 8,
    juggle: 1, priority: 2,
  },
  chp: {
    name: 'Uppercut', anim: 'uppercut', button: 'hp', stance: 'crouch', endStance: 'stand', strength: 'heavy',
    startup: 7, active: 5, recovery: 22,
    damage: 88, stun: 80, hitstun: 26, blockstun: 15, hitstop: 12,
    height: 'mid', reaction: 'launch', push: { hit: 2, block: 5 }, launch: { vx: 2.4, vy: 14.5 },
    hitboxes: [{ a: 'elbowB', b: 'handB', r: 15 }],
    chain: [], special: true, cancelWindow: 10,
    juggle: 1, priority: 4, invuln: [{ from: 1, to: 9, parts: ['head'] }], shake: 5,
  },
  chk: {
    name: 'Sweep', anim: 'sweep', button: 'hk', stance: 'crouch', strength: 'heavy',
    startup: 9, active: 4, recovery: 22,
    damage: 78, stun: 60, hitstun: 30, blockstun: 14, hitstop: 10,
    height: 'low', reaction: 'knockdown', hitLevel: 'low', push: { hit: 2, block: 5 }, launch: { vx: 1.5, vy: 6 },
    hitboxes: [{ a: 'kneeB', b: 'ankleB', r: 11 }, { a: 'ankleB', b: 'toeB', r: 12 }],
    chain: [], special: false,
    juggle: 3, priority: 3, shake: 3,
  },
  jp: {
    name: 'Hammer Fist', anim: 'airPunch', button: ['lp', 'hp'], stance: 'air', strength: 'heavy',
    startup: 7, active: 7, recovery: 10,
    damage: 64, stun: 55, hitstun: 19, blockstun: 14, hitstop: 10,
    height: 'overhead', reaction: 'heavy', push: { hit: 3, block: 3 },
    hitboxes: [{ a: 'elbowB', b: 'handB', r: 14 }],
    chain: [], special: false, juggle: 1, priority: 2,
  },
  jk: {
    name: 'Flying Kick', anim: 'airKick', button: ['lk', 'hk'], stance: 'air', strength: 'heavy',
    startup: 5, active: 10, recovery: 8,
    damage: 70, stun: 60, hitstun: 20, blockstun: 14, hitstop: 10,
    height: 'overhead', reaction: 'heavy', push: { hit: 3.5, block: 3.5 },
    hitboxes: [{ a: 'kneeF', b: 'ankleF', r: 12 }, { a: 'ankleF', b: 'toeF', r: 13 }],
    chain: [], special: false, juggle: 1, priority: 3,
  },
  s1: {
    name: 'Surge Fist', anim: 'lunge', input: { motion: '236', buttons: ['lp', 'hp'] }, stance: 'stand', strength: 'special',
    startup: 12, active: 5, recovery: 20,
    damage: 110, stun: 100, hitstun: 26, blockstun: 18, hitstop: 13,
    height: 'mid', reaction: 'knockback', push: { hit: 8, block: 7 }, launch: { vx: 7, vy: 8 },
    hitboxes: [{ a: 'elbowF', b: 'handF', r: 15 }],
    chain: [], special: false, isSpecial: true,
    juggle: 2, priority: 4, motion: [{ from: 8, to: 17, vx: 8.5 }, { from: 18, to: 24, vx: 2 }], shake: 7,
  },
  s2: {
    name: 'Skybreaker', anim: 'rising', input: { motion: '623', buttons: ['lp', 'hp'] }, stance: 'stand', strength: 'special',
    startup: 7, active: 7, recovery: 25, air: { vy: 15, vx: 2.2, at: 7 },
    damage: 120, stun: 110, hitstun: 30, blockstun: 20, hitstop: 13,
    height: 'mid', reaction: 'launch', push: { hit: 2, block: 4 }, launch: { vx: 3, vy: 13 },
    hitboxes: [{ a: 'elbowB', b: 'handB', r: 16 }, { a: 'shoulderB', b: 'elbowB', r: 13 }],
    chain: [], special: false, isSpecial: true, landRecovery: 12,
    juggle: 1, juggleIgnore: true, priority: 5, invuln: [{ from: 1, to: 7, parts: ['all'] }], shake: 7,
  },
  s3: {
    name: 'Whirl Kick', anim: 'whirl', input: { motion: '214', buttons: ['lk', 'hk'] }, stance: 'stand', strength: 'special',
    startup: 14, active: 5, recovery: 22,
    damage: 115, stun: 90, hitstun: 30, blockstun: 16, hitstop: 13,
    height: 'mid', reaction: 'knockdown', push: { hit: 6, block: 6 }, launch: { vx: 6, vy: 9 },
    hitboxes: [{ a: 'kneeB', b: 'ankleB', r: 13 }, { a: 'ankleB', b: 'toeB', r: 14 }],
    chain: [], special: false, isSpecial: true,
    juggle: 2, priority: 4, motion: [{ from: 6, to: 18, vx: 5 }], shake: 6,
  },
};

/** Order in which buffered inputs are checked: specials first, then normals. */
export const SPECIAL_ORDER = ['s2', 's1', 's3'];
