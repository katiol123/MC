// Authored key poses (base proportions, fighter facing +x, y up). See skeleton.js for conventions.
//   fa/ba = front/back arm [shoulder, elbow, wrist]; fl/bl = front/back leg [hip, knee, ankle]
//   ff/bf = optional IK ankle targets [x, y, footRotation] that plant the feet.
// Limb angles of legs with ff/bf are recomputed by IK, so their authored values do not matter.

export function P(base, o = {}) {
  const r = {
    x: base.x, y: base.y, rot: base.rot, lean: base.lean, chest: base.chest, neck: base.neck, head: base.head,
    fa: base.fa.slice(), ba: base.ba.slice(), fl: base.fl.slice(), bl: base.bl.slice(),
    ff: base.ff ? base.ff.slice() : null, bf: base.bf ? base.bf.slice() : null,
  };
  for (const k in o) {
    const v = o[k];
    r[k] = Array.isArray(v) ? v.slice() : v;
  }
  return r;
}

const ROOT = {
  x: 0, y: 112, rot: 0, lean: 0, chest: 0, neck: 0, head: 0,
  fa: [10, 10, 0], ba: [10, 10, 0], fl: [0, 0, 0], bl: [0, 0, 0], ff: null, bf: null,
};

export const STANCE = P(ROOT, {
  x: 0, y: 117, lean: 7, chest: 5, neck: -4, head: -6,
  fa: [46, 118, 0], ba: [30, 150, 10], ff: [27, 8, 0], bf: [-29, 8, 0],
});

export const STANCE_BREATH = P(STANCE, {
  x: 1.5, y: 115, chest: 7.5, fa: [49, 114, 0], ba: [33, 147, 12],
});

export const NEUTRAL = P(ROOT, {
  y: 124, lean: 1, fa: [8, 14, 0], ba: [-6, 16, 0], ff: [11, 8, 0], bf: [-12, 8, 0],
});

export const CROUCH = P(STANCE, {
  x: 4, y: 64, lean: 24, chest: 8, neck: -12, head: -10,
  fa: [62, 108, 0], ba: [40, 146, 10], ff: [36, 8, 0], bf: [-38, 8, 0],
});
export const CROUCH_BREATH = P(CROUCH, { y: 62.5, chest: 10, fa: [64, 105, 0] });

export const PREJUMP = P(STANCE, {
  y: 86, lean: 16, chest: 6, fa: [40, 80, 0], ba: [20, 90, 0], ff: [28, 8, 0], bf: [-30, 8, 0],
});

export const AIR_RISE = P(ROOT, {
  y: 100, lean: 6, chest: 4, neck: -6, head: -4,
  fa: [85, 70, 0], ba: [55, 100, 0], fl: [78, 105, 15], bl: [25, 85, 10],
});
export const AIR_FALL = P(ROOT, {
  y: 104, lean: 4, chest: 2, neck: -4, head: -6,
  fa: [100, 45, 0], ba: [70, 70, 0], fl: [38, 48, 5], bl: [-8, 35, 15],
});
export const AIR_TUCK = P(ROOT, {
  y: 92, lean: 34, chest: 16, neck: 10, head: 6,
  fa: [70, 130, 0], ba: [55, 135, 0], fl: [118, 145, 20], bl: [104, 140, 20],
});

export const LAND = P(STANCE, {
  y: 88, lean: 20, chest: 8, fa: [42, 92, 0], ba: [26, 112, 0], ff: [32, 8, 0], bf: [-34, 8, 0],
});

export const RUN = [
  P(ROOT, { y: 104, lean: 26, chest: 4, neck: -14, head: -10, fa: [-35, 95, 0], ba: [70, 100, 0], fl: [62, 78, 10], bl: [-34, 48, 25] }),
  P(ROOT, { y: 98, lean: 26, chest: 5, neck: -14, head: -10, fa: [15, 95, 0], ba: [25, 95, 0], fl: [18, 108, 5], bl: [12, 25, 0] }),
  P(ROOT, { y: 104, lean: 26, chest: 4, neck: -14, head: -10, fa: [70, 100, 0], ba: [-35, 95, 0], fl: [-34, 48, 25], bl: [62, 78, 10] }),
  P(ROOT, { y: 98, lean: 26, chest: 5, neck: -14, head: -10, fa: [25, 95, 0], ba: [15, 95, 0], fl: [12, 25, 0], bl: [18, 108, 5] }),
];

export const DASH_F = [
  P(STANCE, { y: 98, lean: 24, chest: 6, ff: [34, 8, 0], bf: [-40, 8, 0], fa: [60, 110, 0], ba: [30, 140, 0] }),
  P(ROOT, { y: 98, lean: 32, chest: 6, neck: -14, head: -12, fa: [70, 110, 0], ba: [20, 130, 0], fl: [70, 60, 10], bl: [-45, 35, 25] }),
];
export const DASH_B = [
  P(STANCE, { x: -6, y: 104, lean: -6, ff: [24, 8, 0], bf: [-30, 8, 0] }),
  P(ROOT, { x: -6, y: 108, lean: -10, chest: -4, neck: -2, head: 4, fa: [60, 110, 0], ba: [38, 140, 0], fl: [30, 50, 5], bl: [-20, 40, 10] }),
];

export const BLOCK_HIGH = P(STANCE, {
  x: -6, y: 106, lean: -2, chest: -2, neck: 4, head: 10,
  fa: [64, 112, 0], ba: [50, 128, 0], ff: [26, 8, 0], bf: [-38, 8, 0],
});
export const BLOCK_LOW = P(CROUCH, {
  x: -2, y: 62, lean: 26, chest: 12, neck: -6, head: 4,
  fa: [52, 70, 0], ba: [38, 92, 0], ff: [32, 8, 0], bf: [-40, 8, 0],
});

export const HIT_HIGH = P(STANCE, {
  x: -12, y: 106, lean: -20, chest: -12, neck: -20, head: -22,
  fa: [35, 55, 0], ba: [12, 70, 0], ff: [32, 8, 0], bf: [-40, 8, 0],
});
export const HIT_LOW = P(STANCE, {
  x: -8, y: 100, lean: 31, chest: 14, neck: 10, head: 12,
  fa: [20, 85, 0], ba: [6, 95, 0], ff: [30, 8, 0], bf: [-38, 8, 0],
});
export const HIT_CROUCH = P(CROUCH, {
  x: -6, y: 62, lean: 6, chest: -8, neck: -16, head: -14, fa: [30, 60, 0], ba: [16, 75, 0],
});

export const STAGGER = [
  P(STANCE, { x: -14, y: 104, lean: -24, chest: -14, neck: -18, head: -18, fa: [60, 30, 0], ba: [40, 40, 0], ff: [20, 8, 0], bf: [-46, 8, 0] }),
  P(STANCE, { x: -18, y: 100, lean: -10, chest: -6, neck: -10, head: -10, fa: [45, 40, 0], ba: [55, 30, 0], ff: [-4, 22, 0], bf: [-44, 8, 0] }),
  P(STANCE, { x: -10, y: 102, lean: 12, chest: 4, neck: 6, head: 8, fa: [25, 60, 0], ba: [15, 70, 0], ff: [22, 8, 0], bf: [-40, 8, 0] }),
];

export const AIR_HIT = P(ROOT, {
  y: 100, lean: -28, chest: -12, neck: -20, head: -14,
  fa: [92, 45, 0], ba: [108, 40, 0], fl: [45, 55, 10], bl: [20, 35, 10],
});
export const AIR_TUMBLE = P(ROOT, {
  y: 96, lean: 10, chest: 8, neck: 4, head: 4,
  fa: [104, 50, 0], ba: [120, 42, 0], fl: [80, 80, 10], bl: [55, 60, 10],
});

export const LYING = P(ROOT, {
  x: -8, y: 15, rot: 90, lean: 0, chest: 2, neck: -14, head: -8,
  fa: [18, 22, 0], ba: [30, 20, 0], fl: [6, 18, 12], bl: [2, 8, 10],
});
export const LYING_BOUNCE = P(LYING, { y: 26, rot: 80, neck: -22, fa: [60, 40, 0], ba: [80, 30, 0], fl: [20, 50, 10], bl: [30, 40, 0] });

export const GETUP = [
  LYING,
  P(ROOT, { x: -14, y: 24, rot: 0, lean: 66, chest: 12, neck: -24, head: -16, fa: [8, 30, 0], ba: [-20, 20, 0], fl: [118, 120, 0], bl: [104, 80, 0] }),
  P(STANCE, { x: -6, y: 70, lean: 30, chest: 10, neck: -12, head: -10, fa: [40, 90, 0], ba: [20, 100, 0], ff: [30, 8, 0], bf: [-34, 26, 0] }),
  STANCE,
];

export const DIZZY = [
  P(STANCE, { x: -4, y: 102, lean: -8, chest: -6, neck: -18, head: -20, fa: [22, 30, 0], ba: [8, 30, 0], ff: [24, 8, 0], bf: [-30, 8, 0] }),
  P(STANCE, { x: 6, y: 100, lean: 18, chest: 6, neck: 16, head: 18, fa: [12, 25, 0], ba: [16, 35, 0], ff: [28, 8, 0], bf: [-28, 8, 0] }),
];

export const VICTORY = [
  // 0: fist to the sky
  P(STANCE, { x: 0, y: 118, lean: -6, chest: -8, neck: -10, head: -18, fa: [176, 14, 0], ba: [22, 118, 10], ff: [26, 8, 0], bf: [-26, 8, 0] }),
  // 1: arms folded across the chest, chin up (forearms level: reads as folded arms in profile)
  P(STANCE, { x: -2, y: 121, lean: -6, chest: -10, neck: -4, head: -12, fa: [24, 76, 0], ba: [30, 70, 0], ff: [20, 8, 0], bf: [-22, 8, 0] }),
  // 2: martial bow - fist pressed into the palm, held well out in front of the chest
  P(STANCE, { x: 0, y: 118, lean: 24, chest: 8, neck: 12, head: 16, fa: [58, 44, 0], ba: [64, 40, 0], ff: [14, 8, 0], bf: [-14, 8, 0] }),
  // 3: biceps flex - near arm out front with the fist up, far arm cocked higher behind it
  P(STANCE, { x: 0, y: 114, lean: -6, chest: -12, neck: -6, head: -12, fa: [92, 80, 0], ba: [104, 90, 0], ff: [30, 8, 0], bf: [-30, 8, 0] }),
];

export const DEFEAT_KNEEL = P(STANCE, {
  x: -4, y: 64, lean: 46, chest: 14, neck: 18, head: 22,
  fa: [2, 12, 0], ba: [-6, 14, 0], ff: [30, 8, 0], bf: [-40, 12, 0],
});

export const TURN = P(STANCE, { lean: 4, fa: [40, 115, 0], ba: [40, 120, 0] });
