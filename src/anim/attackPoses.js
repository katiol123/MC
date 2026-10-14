// Key poses for attacks. Each entry provides the anticipation (windup) pose, the contact pose
// reached exactly on the first active frame, and optionally an `extend` pose held at the end of the
// active window and a `follow` pose for the start of recovery. Timing comes from move frame data.
import { P, STANCE, CROUCH, AIR_FALL } from './poses.js';

const guardF = [52, 110, 0];
const guardB = [34, 148, 10];

export const ATTACK_POSES = {
  jab: {
    base: 'stand',
    windup: P(STANCE, { x: -3, lean: 7, chest: 2, fa: [62, 122, 0], ba: guardB }),
    contact: P(STANCE, { x: 7, lean: 15, chest: 9, neck: -6, head: -8, fa: [106, 3, 0], ba: [38, 150, 10], ff: [34, 8, 0], bf: [-30, 8, 0] }),
    extend: P(STANCE, { x: 8, lean: 16, chest: 10, neck: -6, head: -8, fa: [104, 6, 0], ba: [38, 150, 10], ff: [34, 8, 0], bf: [-30, 8, 0] }),
  },
  cross: {
    base: 'stand', layers: { ba: 'front' },
    windup: P(STANCE, { x: -7, lean: 4, chest: -12, fa: [62, 112, 0], ba: [20, 142, 0], ff: [28, 8, 0], bf: [-34, 8, 0] }),
    contact: P(STANCE, { x: 18, y: 106, lean: 24, chest: 12, neck: -8, head: -10, fa: [26, 132, 10], ba: [104, 2, 0], ff: [38, 8, 0], bf: [-22, 8, 0] }),
    extend: P(STANCE, { x: 19, y: 105, lean: 25, chest: 13, neck: -8, head: -10, fa: [26, 132, 10], ba: [101, 6, 0], ff: [38, 8, 0], bf: [-22, 8, 0] }),
    follow: P(STANCE, { x: 14, y: 106, lean: 20, chest: 9, fa: [40, 120, 0], ba: [80, 50, 0], ff: [38, 8, 0], bf: [-24, 8, 0] }),
  },
  frontKick: {
    base: 'stand', layers: { fl: 'front' },
    windup: P(STANCE, { x: -2, y: 110, lean: -4, chest: -2, fa: guardF, ba: guardB, fl: [96, 112, 20], ff: null, bf: [-32, 8, 0] }),
    contact: P(STANCE, { x: -6, y: 112, lean: -14, chest: -4, neck: 4, head: 6, fa: [44, 112, 0], ba: [26, 146, 10], fl: [93, 4, 32], ff: null, bf: [-34, 8, 0] }),
    extend: P(STANCE, { x: -6, y: 112, lean: -15, chest: -4, neck: 4, head: 6, fa: [44, 112, 0], ba: [26, 146, 10], fl: [90, 10, 30], ff: null, bf: [-34, 8, 0] }),
  },
  roundhouse: {
    base: 'stand', layers: { bl: 'front' },
    windup: P(STANCE, { x: 2, y: 110, lean: -12, chest: -16, fa: [60, 100, 0], ba: [30, 120, 0], bl: [84, 120, 10], bf: null, ff: [16, 8, 0] }),
    contact: P(STANCE, { x: 14, y: 112, lean: -34, chest: -8, neck: 10, head: 10, fa: [44, 86, 0], ba: [-24, 62, 0], bl: [122, 4, 26], bf: null, ff: [12, 8, 0] }),
    extend: P(STANCE, { x: 14, y: 112, lean: -34, chest: -8, neck: 10, head: 10, fa: [44, 86, 0], ba: [-24, 62, 0], bl: [118, 14, 20], bf: null, ff: [12, 8, 0] }),
    follow: P(STANCE, { x: 10, y: 110, lean: -18, chest: -4, fa: [50, 96, 0], ba: [10, 90, 0], bl: [80, 80, 10], bf: null, ff: [12, 8, 0] }),
  },
  uppercut: {
    base: 'crouch', layers: { ba: 'front' },
    windup: P(CROUCH, { x: 0, y: 60, lean: 28, chest: 8, fa: [54, 112, 0], ba: [44, 112, 0] }),
    contact: P(STANCE, { x: 18, y: 106, lean: 10, chest: -8, neck: -12, head: -14, fa: [20, 124, 0], ba: [126, 12, 0], ff: [38, 8, 0], bf: [-24, 8, 0] }),
    extend: P(STANCE, { x: 18, y: 110, lean: 4, chest: -12, neck: -12, head: -14, fa: [20, 124, 0], ba: [150, 8, 0], ff: [38, 8, 0], bf: [-24, 8, 0] }),
  },
  crouchJab: {
    base: 'crouch',
    windup: P(CROUCH, { x: 1, lean: 20, fa: [58, 124, 0] }),
    contact: P(CROUCH, { x: 10, lean: 18, chest: 10, neck: -12, fa: [100, 3, 0] }),
  },
  lowKick: {
    base: 'crouch', layers: { fl: 'front' },
    windup: P(CROUCH, { x: 0, y: 62, lean: 18, fl: [62, 92, 10], ff: null }),
    contact: P(CROUCH, { x: 6, y: 60, lean: 10, chest: 6, fl: [82, 0, 20], ff: null, bf: [-42, 8, 0] }),
  },
  sweep: {
    base: 'crouch', layers: { bl: 'front' },
    windup: P(CROUCH, { x: 2, y: 54, lean: 34, chest: 10, fa: [20, 40, 0], ba: [60, 90, 0], bl: [30, 110, 0], bf: null, ff: [24, 8, 0] }),
    contact: P(CROUCH, { x: 8, y: 48, lean: 38, chest: 12, neck: -18, head: -10, fa: [6, 24, 0], ba: [70, 70, 0], bl: [94, 0, 18], bf: null, ff: [20, 8, 0] }),
    extend: P(CROUCH, { x: 8, y: 48, lean: 38, chest: 12, neck: -18, head: -10, fa: [6, 24, 0], ba: [70, 70, 0], bl: [90, 2, 18], bf: null, ff: [20, 8, 0] }),
  },
  airKick: {
    base: 'air', layers: { fl: 'front' },
    windup: P(AIR_FALL, { lean: 0, fl: [84, 122, 10], bl: [62, 130, 0], fa: [72, 104, 0], ba: [44, 128, 0] }),
    contact: P(AIR_FALL, { lean: -12, chest: -4, fl: [52, 3, 24], bl: [78, 136, 0], fa: [64, 104, 0], ba: [40, 126, 0] }),
  },
  airPunch: {
    base: 'air', layers: { ba: 'front' },
    windup: P(AIR_FALL, { lean: -4, chest: -8, ba: [112, 68, 0], fa: [70, 100, 0], fl: [70, 108, 0], bl: [40, 96, 0] }),
    contact: P(AIR_FALL, { lean: 18, chest: 10, neck: -8, ba: [66, 14, 0], fa: [30, 120, 0], fl: [68, 112, 0], bl: [36, 92, 0] }),
  },
  lunge: {
    base: 'stand',
    windup: P(STANCE, { x: -10, y: 96, lean: 6, chest: -8, fa: [40, 132, 0], ba: [26, 140, 0], ff: [26, 8, 0], bf: [-42, 8, 0] }),
    contact: P(STANCE, { x: 30, y: 90, lean: 30, chest: 12, neck: -12, head: -12, fa: [102, 0, 0], ba: [18, 140, 10], ff: [72, 8, 0], bf: [-48, 8, 0] }),
    extend: P(STANCE, { x: 30, y: 90, lean: 31, chest: 13, neck: -12, head: -12, fa: [100, 4, 0], ba: [18, 140, 10], ff: [72, 8, 0], bf: [-48, 8, 0] }),
  },
  rising: {
    base: 'crouch', layers: { ba: 'front' },
    windup: P(CROUCH, { x: 0, y: 58, lean: 30, chest: 10, ba: [44, 114, 0], fa: [50, 112, 0] }),
    contact: P(AIR_FALL, { y: 96, lean: 2, chest: -10, neck: -12, head: -14, fa: [24, 124, 0], ba: [126, 22, 0], fl: [70, 96, 10], bl: [10, 40, 10] }),
    extend: P(AIR_FALL, { y: 100, lean: -8, chest: -14, neck: -14, head: -16, fa: [24, 124, 0], ba: [168, 8, 0], fl: [64, 90, 10], bl: [6, 34, 10] }),
  },
  whirl: {
    base: 'stand', layers: { bl: 'front', fa: 'back' }, spin: true,
    windup: P(STANCE, { x: 4, y: 108, lean: 26, chest: 10, neck: 10, fa: [20, 60, 0], ba: [60, 80, 0], bl: [60, 120, 0], bf: null, ff: [10, 8, 0] }),
    contact: P(STANCE, { x: 18, y: 112, lean: -40, chest: -10, neck: 14, head: 12, fa: [130, 20, 0], ba: [-30, 40, 0], bl: [104, 2, 30], bf: null, ff: [4, 8, 0] }),
    extend: P(STANCE, { x: 18, y: 112, lean: -40, chest: -10, neck: 14, head: 12, fa: [130, 20, 0], ba: [-30, 40, 0], bl: [100, 6, 30], bf: null, ff: [4, 8, 0] }),
  },
};
