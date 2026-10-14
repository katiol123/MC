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

  stunDecayPerTick: 0.35, // dizzy meter recovery
  partDamage: { head: 1.1, torso: 1, limb: 0.9 },
  roundTimeSeconds: 99,
};
