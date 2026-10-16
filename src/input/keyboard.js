// Keyboard device: tracks physical key state and maps it to two players' raw inputs.
import { emptyRaw } from './inputBuffer.js';

export const BINDINGS = [
  {
    up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
    lp: ['KeyF'], hp: ['KeyG'], lk: ['KeyV'], hk: ['KeyB'], stance: ['KeyR'], taunt: ['KeyH'],
  },
  {
    up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
    lp: ['KeyI', 'Numpad4'], hp: ['KeyO', 'Numpad5'], lk: ['KeyK', 'Numpad1'], hk: ['KeyL', 'Numpad2'], stance: ['KeyP', 'Numpad0'], taunt: ['Semicolon', 'Numpad3'],
  },
];

export class Keyboard {
  constructor(target = window) {
    this.down = new Set();
    this.pressedQueue = [];
    this.listeners = [];
    this.captures = [];
    target.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'F1', 'F2', 'F3', 'F4', 'Tab'].includes(e.code)) e.preventDefault();
      if (!e.repeat) {
        this.down.add(e.code);
        // a modal on top (fighter card) can capture the keyboard: only it hears key presses then
        const top = this.captures[this.captures.length - 1];
        for (const l of top ? [top] : this.listeners) l(e.code, e);
      }
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    target.addEventListener('blur', () => this.down.clear());
  }
  onPress(fn) {
    this.listeners.push(fn);
    return () => (this.listeners = this.listeners.filter((l) => l !== fn));
  }
  /** Exclusive listener (stacked): while set, the regular listeners hear nothing. */
  capture(fn) {
    this.captures.push(fn);
    return () => (this.captures = this.captures.filter((l) => l !== fn));
  }
  raw(player) {
    const b = BINDINGS[player];
    const r = emptyRaw();
    for (const k in b) r[k] = b[k].some((code) => this.down.has(code));
    return r;
  }
  /** Which player (0/1) a key code belongs to and which action it is, or null. */
  static actionOf(code) {
    for (let p = 0; p < 2; p++) for (const k in BINDINGS[p]) if (BINDINGS[p][k].includes(code)) return { player: p, action: k };
    if (code === 'Enter' || code === 'Space') return { player: 0, action: 'lp' };
    if (code === 'Escape' || code === 'Backspace') return { player: 0, action: 'back' };
    return null;
  }
}
