// Deterministic PRNG (mulberry32). The simulation never calls Math.random so replays and tests are exact.
export class Rng {
  constructor(seed = 1) {
    this.state = seed >>> 0 || 1;
  }
  next() {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(lo, hi) {
    return lo + (hi - lo) * this.next();
  }
  int(lo, hi) {
    return Math.floor(this.range(lo, hi + 1));
  }
  chance(p) {
    return this.next() < p;
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
}
