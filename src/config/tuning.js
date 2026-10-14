// Global combat / physics rules. Change values here to rebalance the game without touching systems.
export const TUNING = {
  gravity: 0.88,
  groundFriction: 0.82, // per-tick multiplier for sliding (hit pushback)
  airDrag: 0.995,

  inputBufferFrames: 6, // how long a button press stays usable
  motionWindow: 14, // frames allowed to complete a special-move motion
  dashWindow: 12, // max frames between taps of a double-tap dash

  landingFrames: 4,
  airAttackLandingFrames: 3,
  prejumpFrames: 4,
  knockdownFrames: 38,
  getupFrames: 30,
  dizzyFrames: 110,

  // Combo protection
  damageScaling: [1, 1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.45, 0.4], // by hit number, last value repeats
  minDamageScale: 0.35,
  hitstunDecayStart: 4, // hits in a combo before hitstun starts shrinking
  hitstunDecayPerHit: 2,
  minHitstun: 7,
  juggleLimit: 4, // total juggle points an airborne defender can absorb
  juggleGravityPerHit: 0.06, // extra gravity added per juggle hit (falls faster)
  maxChainLength: 4, // links in a normal-to-normal chain
  maxSameMoveInCombo: 2, // a move may appear at most this many times in one combo
  comboHitCap: 14, // absolute safety cap: further hits are rejected (reason logged)

  counterHitDamage: 1.2,
  counterHitStun: 4,
  counterHitHitstop: 3,
  blockHitstopScale: 0.75,
  chipDamage: 0.12, // fraction of special-move damage dealt through block

  stunDecayPerTick: 0.35, // dizzy meter recovery per tick...
  stunRecoverDelay: 120, // ...once this many ticks have passed without being hit
  partDamage: { head: 1.1, torso: 1, limb: 0.9 },
  roundTimeSeconds: 99,

  // Throws
  throwTechWindow: 9, // frames after being grabbed in which LP+LK escapes a normal throw

  // Super meter (anti-spam: a super costs the whole bar, builds no meter itself, and locks
  // meter gain for superCooldown ticks afterwards, so at most ~1 super per round is realistic)
  superCost: 100,
  superCooldown: 480, // 8 s without meter gain after using a super
  superFreeze: 48, // cinematic freeze when a super starts
  // burn (Cinder's super): a small hit every burnInterval ticks while the timer runs; never KOs
  criticalHealth: 0.3, // below this share of health a fighter looks battered (props fly off, heavy breathing)
  focusDamage: 1.3, // damage multiplier while in Focus (Tao's super)
  guardBreakStagger: 36, // ticks of stagger after a guard-breaking blocked strike
  burnInterval: 30,
  armorDamage: 0.5, // share of a strike's damage taken through armour
  burnDamage: 5,
  superMotionWindow: 26,
  meterOnHit: 0.09, // fraction of damage dealt
  meterOnBlock: 0.05,
  meterOnDamaged: 0.06, // fraction of damage taken
  meterOnSpecialWhiff: 2,
};
