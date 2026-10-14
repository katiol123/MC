// "VS" splash between character select and the fight.
import { ROSTER } from '../data/fighters.js';
import { el, clearUI } from './dom.js';

export class VersusScene {
  constructor(app, p1, p2, mode) {
    this.app = app;
    this.p1 = p1;
    this.p2 = p2;
    this.mode = mode;
    this.t = 0;
  }
  enter() {
    clearUI();
    const a = ROSTER.find((f) => f.id === this.p1), b = ROSTER.find((f) => f.id === this.p2);
    const half = (f, s) => el('div', { class: `vs-half ${s}` }, [
      el('div', { class: 'vs-img', style: { backgroundImage: `url(${this.app.portraitURL(f.id)})` } }),
      el('div', { class: 'vs-name' }, [f.name]),
      el('div', { class: 'vs-title' }, [f.title]),
    ]);
    this.root = el('div', { class: 'versus' }, [
      half(a, 'left'), half(b, 'right'),
      el('div', { class: 'vs-bolt' }),
      el('div', { class: 'vs-text' }, ['VS']),
      el('div', { class: 'vs-sub' }, ['PIER 9 · FIGHT NIGHT']),
    ]);
    document.getElementById('ui').appendChild(this.root);
    this.app.audio.ui('slam');
    setTimeout(() => this.app.audio.ui('slam'), 350);
    this.unsub = this.app.keyboard.onPress((code) => {
      if (['Enter', 'Space', 'KeyF', 'KeyI', 'Escape'].includes(code)) this.go();
    });
  }
  go() {
    if (this.gone) return;
    this.gone = true;
    this.app.startFight(this.p1, this.p2, this.mode);
  }
  frame(dt) {
    this.t += dt;
    const ctx = this.app.ctx;
    ctx.fillStyle = '#07030b';
    ctx.fillRect(0, 0, 1280, 720);
    if (this.t > 2900) this.go();
  }
  exit() {
    this.unsub?.();
    clearUI();
  }
}
