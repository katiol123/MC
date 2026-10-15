// Application bootstrap: canvas, render loop (requestAnimationFrame), scene switching, settings.
import { VIEW } from './config/constants.js';
import { Keyboard } from './input/keyboard.js';
import { AudioSystem } from './audio/audio.js';
import { ROSTER } from './data/fighters.js';
import { createMenu } from './ui/dom.js';
import { FightScene } from './ui/fightScene.js';
import { TitleScene } from './ui/titleScene.js';
import { SelectScene } from './ui/selectScene.js';
import { VersusScene } from './ui/versusScene.js';
import { TournamentScene } from './ui/tournamentScene.js';

const DEFAULT_SETTINGS = { roundsToWin: 2, roundTime: 99, difficulty: 'normal', arena: 'dusk', sound: true };

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('boneforge.settings') || '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

class App {
  constructor() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.stage = document.getElementById('stage');
    this.keyboard = new Keyboard();
    this.audio = new AudioSystem();
    this.settings = loadSettings();
    this.audio.setEnabled(this.settings.sound);
    this.portraits = {};
    for (const f of ROSTER) {
      const img = new Image();
      img.src = this.portraitURL(f.id);
      this.portraits[f.id] = img;
    }
    this.scene = null;
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', () => this.audio.unlock(), { capture: true });
    window.addEventListener('pointerdown', () => this.audio.unlock(), { capture: true });
    this.resize();
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  portraitURL(id) {
    return `assets/portraits/${id}.webp`;
  }

  saveSettings() {
    try {
      localStorage.setItem('boneforge.settings', JSON.stringify(this.settings));
    } catch { /* storage unavailable: settings stay in memory */ }
    this.audio.setEnabled(this.settings.sound);
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const scale = Math.min(window.innerWidth / VIEW.width, window.innerHeight / VIEW.height);
    this.canvas.width = Math.round(VIEW.width * dpr * Math.max(1, scale));
    this.canvas.height = Math.round(VIEW.height * dpr * Math.max(1, scale));
    this.pixelScale = this.canvas.width / VIEW.width;
    this.stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
  }

  setScene(scene) {
    this.scene?.exit?.();
    this.scene = scene;
    scene.enter?.();
  }

  frame(now) {
    const dt = now - this.last;
    this.last = now;
    const ctx = this.ctx;
    ctx.setTransform(this.pixelScale, 0, 0, this.pixelScale, 0, 0);
    try {
      this.scene?.frame(dt, now);
    } catch (err) {
      console.error(err);
      this.lastError = err;
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  menu(title, items, opts) {
    return createMenu(this, title, items, opts);
  }

  goTitle() {
    this.audio.stopMusic();
    this.setScene(new TitleScene(this));
  }
  goSelect(mode = 'cpu') {
    this.audio.stopMusic();
    this.setScene(new SelectScene(this, mode));
  }
  goVersus(p1, p2, mode) {
    this.setScene(new VersusScene(this, p1, p2, mode));
  }
  goTournament() {
    this.audio.stopMusic();
    this.setScene(new TournamentScene(this));
  }
  startFight(p1, p2, mode = 'cpu') {
    this.setScene(new FightScene(this, { p1, p2, mode }));
  }
}

const app = new App();
window.__app = app; // handy for debugging / automated smoke tests

const hash = new URLSearchParams(location.hash.slice(1));
if (hash.has('fight')) {
  const [p1, p2, mode] = hash.get('fight').split(':');
  if (hash.has('debug')) app.settings.sound = false;
  app.startFight(p1 || 'brick', p2 || 'jax', mode || 'cpu');
} else if (hash.has('select')) app.goSelect(hash.get('select') || 'cpu');
else if (hash.has('tournament')) app.goTournament();
else app.goTitle();
