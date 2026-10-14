// Fight scene: owns the Match (simulation), the fixed-step loop, input routing (keyboard / AI /
// training dummy), the renderer and audio. Also handles debug keys and the results overlay.
import { FixedStepLoop } from '../core/loop.js';
import { Match } from '../game/match.js';
import { FightRenderer } from '../render/fightRenderer.js';
import { AIController } from '../ai/aiController.js';
import { emptyRaw } from '../input/inputBuffer.js';
import { el, clearUI } from './dom.js';

const SPEEDS = [1, 0.5, 0.25, 0.1];
const DUMMY_MODES = ['stand', 'crouch', 'block', 'jump', 'cpu'];

export class FightScene {
  constructor(app, { p1, p2, mode = 'cpu' }) {
    this.app = app;
    this.mode = mode;
    this.p1 = p1;
    this.p2 = p2;
    const s = app.settings;
    this.match = new Match({
      p1, p2,
      roundsToWin: mode === 'training' ? 99 : s.roundsToWin,
      roundTime: mode === 'training' ? 0 : s.roundTime,
      training: mode === 'training',
    });
    this.renderer = new FightRenderer(this.match, { arena: s.arena === 'random' ? (Math.random() < 0.5 ? 'dusk' : 'night') : s.arena, portraits: app.portraits });
    this.loop = new FixedStepLoop();
    this.debug = { enabled: mode === 'training', timeScale: 1, paused: false };
    this.ai = [
      mode === 'watch' ? new AIController(0, { level: s.difficulty, seed: 11 }) : null,
      mode === 'cpu' || mode === 'watch' ? new AIController(1, { level: s.difficulty, seed: 29 }) : null,
    ];
    this.dummyMode = 'stand';
    this.dummyAI = new AIController(1, { level: 'normal', seed: 5 });
    this.overlay = null;
    this.paused = false;
    this.endTimer = 0;
  }

  enter() {
    clearUI();
    this.app.audio.playMusic();
    this.unsub = this.app.keyboard.onPress((code) => this.onKey(code));
    this.hint = el('div', { class: 'fight-hint' }, [
      this.mode === 'training'
        ? 'TRAINING  ·  T: dummy mode (stand)  ·  F1 debug  ·  F2 speed  ·  F3 pause  ·  F4 step  ·  Esc menu'
        : 'F1 debug  ·  F2 slow-mo  ·  F3 pause  ·  F4 frame step  ·  Esc pause',
    ]);
    document.getElementById('ui').appendChild(this.hint);
  }

  exit() {
    this.unsub?.();
    clearUI();
  }

  onKey(code) {
    if (this.overlay) return;
    if (code === 'F1' || code === 'Backquote') this.debug.enabled = !this.debug.enabled;
    else if (code === 'F2') {
      const i = (SPEEDS.indexOf(this.debug.timeScale) + 1) % SPEEDS.length;
      this.debug.timeScale = SPEEDS[i];
      this.loop.timeScale = SPEEDS[i];
    } else if (code === 'F3') {
      this.debug.paused = !this.debug.paused;
      this.loop.paused = this.debug.paused;
    } else if (code === 'F4') {
      this.debug.paused = true;
      this.loop.paused = true;
      this.loop.stepOnce();
    } else if (code === 'KeyT' && this.mode === 'training') {
      this.dummyMode = DUMMY_MODES[(DUMMY_MODES.indexOf(this.dummyMode) + 1) % DUMMY_MODES.length];
      this.hint.textContent = `TRAINING  ·  T: dummy mode (${this.dummyMode})  ·  F1 debug  ·  F2 speed  ·  F3 pause  ·  F4 step  ·  Esc menu`;
    } else if (code === 'Escape') this.showPause();
  }

  inputs() {
    const kb = this.app.keyboard;
    const raws = [kb.raw(0), this.mode === 'versus' ? kb.raw(1) : emptyRaw()];
    for (let i = 0; i < 2; i++) if (this.ai[i]) raws[i] = this.ai[i].input(this.match);
    if (this.mode === 'training') raws[1] = this.dummyInput();
    return raws;
  }

  dummyInput() {
    const m = this.match;
    const me = m.fighters[1], op = m.fighters[0];
    const r = emptyRaw();
    const away = op.body.x < me.body.x ? 'right' : 'left';
    switch (this.dummyMode) {
      case 'crouch': r.down = true; break;
      case 'block': {
        r[away] = true;
        if (op.move && op.move.def.height === 'low') r.down = true;
        break;
      }
      case 'jump': r.up = me.actionable; break;
      case 'cpu': return this.dummyAI.input(m);
      default:
    }
    return r;
  }

  tick() {
    const events = this.match.tick(this.inputs());
    this.renderer.onTick(events);
    for (const e of events) {
      this.app.audio.onEvent(e);
      if (e.type === 'matchEnd') this.app.audio.fadeMusic(2500);
    }
    if (this.match.phase === 'over' && !this.overlay) this.showResults();
  }

  frame(dt, now) {
    if (!this.paused) this.loop.advance(dt, () => this.tick());
    this.renderer.render(this.app.ctx, this.loop.alpha, { debug: this.debug, now });
  }

  showPause() {
    this.paused = true;
    this.app.audio.music?.pause();
    this.overlay = this.app.menu('PAUSED', [
      ['Resume', () => this.closeOverlay(true)],
      ['Restart match', () => this.app.startFight(this.p1, this.p2, this.mode)],
      ['Character select', () => this.app.goSelect(this.mode)],
      ['Main menu', () => this.app.goTitle()],
    ], { onBack: () => this.closeOverlay(true) });
  }

  closeOverlay(resume) {
    this.overlay?.close();
    this.overlay = null;
    if (resume) {
      this.paused = false;
      const p = this.app.audio.music?.play();
      if (p && p.catch) p.catch(() => {});
    }
  }

  showResults() {
    const m = this.match;
    const w = m.winner;
    const winner = w === 'draw' ? null : m.fighters[w];
    const title = !winner ? 'DRAW GAME' : this.mode === 'cpu' ? (w === 0 ? 'YOU WIN' : 'YOU LOSE') : `${winner.def.name} WINS`;
    this.overlay = this.app.menu(title, [
      ['Rematch', () => this.app.startFight(this.p1, this.p2, this.mode)],
      ['Character select', () => this.app.goSelect(this.mode)],
      ['Main menu', () => this.app.goTitle()],
    ], { portrait: winner ? this.app.portraitURL(winner.def.id) : null, subtitle: winner ? `"${winner.def.title}"  ·  ${m.wins[0]} - ${m.wins[1]}` : `${m.wins[0]} - ${m.wins[1]}`, result: true });
  }
}
