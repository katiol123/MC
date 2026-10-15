// Title screen: an attract-mode CPU vs CPU fight runs behind the logo and the main menu.
import { ROSTER } from '../data/fighters.js';
import { Match } from '../game/match.js';
import { FightRenderer } from '../render/fightRenderer.js';
import { FixedStepLoop } from '../core/loop.js';
import { AIController } from '../ai/aiController.js';
import { el, clearUI, createMenu } from './dom.js';

export class TitleScene {
  constructor(app) {
    this.app = app;
    this.newDemo();
  }

  newDemo() {
    const i = Math.floor(Math.random() * ROSTER.length);
    let j = Math.floor(Math.random() * ROSTER.length);
    if (j === i) j = (j + 1) % ROSTER.length;
    this.match = new Match({ p1: ROSTER[i].id, p2: ROSTER[j].id, roundsToWin: 1 });
    this.renderer = new FightRenderer(this.match, { arena: Math.random() < 0.6 ? 'dusk' : 'night', portraits: this.app.portraits, hud: false });
    this.ai = [new AIController(0, { level: 'hard', seed: Math.floor(Math.random() * 1e9) }), new AIController(1, { level: 'hard', seed: Math.floor(Math.random() * 1e9) })];
    this.loop = new FixedStepLoop();
  }

  enter() {
    clearUI();
    const ui = document.getElementById('ui');
    ui.appendChild(el('div', { class: 'title' }, [
      el('div', { class: 'logo', 'data-text': 'BONEFORGE' }, ['BONEFORGE']),
      el('div', { class: 'logo-sub' }, ['PROCEDURAL STREET FIGHTING · PIER 9']),
    ]));
    this.showMain();
  }

  showMain() {
    const a = this.app;
    this.menu = createMenu(a, '', [
      ['Arcade  ·  vs CPU', () => a.goSelect('cpu')],
      ['Versus  ·  2 players', () => a.goSelect('versus')],
      ['Training', () => a.goSelect('training')],
      ['CPU vs CPU', () => a.goSelect('watch')],
      ['Tournament  ·  round robin', () => a.goTournament()],
      ['Options', () => this.showOptions()],
      ['Controls', () => this.showControls()],
    ], { className: 'main-menu' });
  }

  showOptions(focus = 0) {
    const s = this.app.settings;
    const opts = [
      ['Rounds to win', 'roundsToWin', [1, 2, 3]],
      ['Round time', 'roundTime', [60, 99, 0], (v) => (v === 0 ? '∞' : `${v}s`)],
      ['CPU difficulty', 'difficulty', ['easy', 'normal', 'hard']],
      ['Arena', 'arena', ['dusk', 'night', 'random']],
      ['Sound & music', 'sound', [true, false], (v) => (v ? 'on' : 'off')],
    ];
    const label = ([name, key, , fmt]) => `${name}:  ◀ ${fmt ? fmt(s[key]) : String(s[key]).toUpperCase()} ▶`;
    const cycle = (o, d) => () => {
      const [, key, vals] = o;
      s[key] = vals[(vals.indexOf(s[key]) + d + vals.length) % vals.length];
      this.app.saveSettings();
      this.showOptions(opts.indexOf(o));
    };
    this.menu = createMenu(this.app, 'OPTIONS', [...opts.map((o) => [label(o), cycle(o, 1), cycle(o, -1)]), ['Back', () => this.showMain()]], { onBack: () => this.showMain(), start: focus });
  }

  showControls() {
    const panel = el('div', { class: 'menu-overlay' }, [el('div', { class: 'menu-panel controls' }, [
      el('h2', { class: 'menu-title' }, ['CONTROLS']),
      el('table', {}, [
        el('tr', {}, [el('th', {}, ['']), el('th', {}, ['Player 1']), el('th', {}, ['Player 2'])]),
        ...[
          ['Move / jump / crouch', 'W A S D', 'Arrows'],
          ['Light punch', 'F', 'I  (Num4)'],
          ['Heavy punch', 'G', 'O  (Num5)'],
          ['Light kick', 'V', 'K  (Num1)'],
          ['Heavy kick', 'B', 'L  (Num2)'],
          ['Switch stance', 'R', 'P  (Num0)'],
          ['Showboat (rival dizzy)', 'H', ';  (Num3)'],
          ['Block', 'hold back (crouch-back for lows)', ''],
          ['Dash / run', 'double-tap forward (hold to run), double-tap back', ''],
          ['Surge Fist', '↓ ↘ → + punch', ''],
          ['Skybreaker', '→ ↓ ↘ + punch', ''],
          ['Whirl Kick', '↓ ↙ ← + kick', ''],
          ['Signature special (unique per fighter)', '↓ ↙ ← + punch', ''],
          ['SUPER (needs a full bar)', '↓ ↘ → ↓ ↘ → + punch', ''],
          ['FATALITY (at FINISH HIM!, close)', '↓ ↘ → ↓ ↘ → + kick', ''],
          ['Throw / escape a throw (tech)', 'LP + LK together (F + V)', 'I + K'],
          ['Uppercut / Sweep', '↓ + HP  /  ↓ + HK', ''],
          ['Debug', 'F1 overlay · F2 slow-mo · F3 pause · F4 frame step', ''],
        ].map((r) => el('tr', {}, r.map((c) => el('td', {}, [c])))),
      ]),
      el('div', { class: 'menu-sub' }, ['Esc / G — back']),
    ])]);
    document.getElementById('ui').appendChild(panel);
    const un = this.app.keyboard.onPress(() => {
      un();
      panel.remove();
      this.showMain();
    });
  }

  frame(dt, now) {
    this.loop.advance(dt, () => {
      const ev = this.match.tick([this.ai[0].input(this.match), this.ai[1].input(this.match)]);
      this.renderer.onTick(ev);
      if (this.match.phase === 'over' || this.match.frame > 60 * 70) this.newDemo();
    });
    this.renderer.render(this.app.ctx, this.loop.alpha, { now });
    const ctx = this.app.ctx;
    ctx.fillStyle = 'rgba(7,3,11,0.45)';
    ctx.fillRect(0, 0, 1280, 720);
  }

  exit() {
    this.menu?.close();
    clearUI();
  }
}
