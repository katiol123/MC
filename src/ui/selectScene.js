// Character select: a fanned deck of portrait cards, big glitch-swapping portrait panels for each
// side, live procedural previews of the in-game fighter, stat bars and a "LOCKED IN" stamp.
import { ROSTER, buildFighterDef } from '../data/fighters.js';
import { Keyboard } from '../input/keyboard.js';
import { el, clearUI } from './dom.js';
import { FighterPreview } from './preview.js';
import { ATTRIBUTES, ATTRIBUTE_GROUPS, attributeRanges, attributeFill } from '../data/attributes.js';

const MODE_LABEL = { cpu: 'ARCADE · VS CPU', versus: 'VERSUS · 2 PLAYERS', training: 'TRAINING', watch: 'CPU VS CPU' };

// Bars are scaled between the weakest and strongest value in the whole roster (see attributes.js).
const DEFS = ROSTER.map((f) => buildFighterDef(f.id));
const RANGES = attributeRanges(DEFS);

export class SelectScene {
  constructor(app, mode = 'cpu') {
    this.app = app;
    this.mode = mode;
    this.cursor = [0, 3];
    this.locked = [false, false];
    this.active = 0; // in single-player modes P1 picks both sides in turn
  }

  enter() {
    clearUI();
    const ui = document.getElementById('ui');
    this.cards = ROSTER.map((f, i) =>
      el('div', { class: 'card', style: { '--i': i, '--n': ROSTER.length }, onclick: () => this.click(i), onmouseenter: () => this.hover(i) }, [
        el('div', { class: 'card-img', style: { backgroundImage: `url(${this.app.portraitURL(f.id)})` } }),
        el('div', { class: 'card-num' }, [String(i + 1).padStart(2, '0')]),
        el('div', { class: 'card-name' }, [f.name.replace(/".*"\s*/, '')]),
        el('div', { class: 'card-tags' }),
      ]));
    this.sides = [0, 1].map((s) => this.buildSide(s));
    const second = this.mode === 'versus' ? 'P2' : this.mode === 'watch' ? 'CPU 2' : this.mode === 'training' ? 'DUMMY' : 'CPU';
    this.secondLabel = second;
    this.root = el('div', { class: `select mode-${this.mode}` }, [
      el('div', { class: 'sel-bg' }, [el('div', { class: 'sel-stripes left' }), el('div', { class: 'sel-stripes right' }), el('div', { class: 'sel-halftone' })]),
      el('div', { class: 'marquee' }, [el('div', { class: 'marquee-track' }, ['CHOOSE YOUR FIGHTER ✦ PIER 9 FIGHT NIGHT ✦ CHOOSE YOUR FIGHTER ✦ PIER 9 FIGHT NIGHT ✦ '.repeat(2)])]),
      el('div', { class: 'sel-mode' }, [MODE_LABEL[this.mode] || '']),
      this.sides[0].root,
      this.sides[1].root,
      el('div', { class: 'deck' }, this.cards),
      el('div', { class: 'sel-help' }, [this.mode === 'versus'
        ? 'P1: A / D + F lock · G back      P2: ← / → + I lock · O back'
        : 'A / D or ← / → choose · F / Enter lock in · G / Esc back']),
    ]);
    ui.appendChild(this.root);
    this.unsub = this.app.keyboard.onPress((code) => this.onKey(code));
    this.refresh(true);
  }

  buildSide(s) {
    const canvas = el('canvas', { class: 'preview', width: 320, height: 320 });
    const root = el('div', { class: `side ${s === 0 ? 'p1' : 'p2'}` }, [
      el('div', { class: 'portrait-frame' }, [
        el('div', { class: 'portrait base' }),
        el('div', { class: 'portrait g1' }),
        el('div', { class: 'portrait g2' }),
        el('div', { class: 'scan' }),
      ]),
      el('div', { class: 'side-tag' }, [s === 0 ? 'P1' : '']),
      el('div', { class: 'info' }, [
        el('div', { class: 'pname' }),
        el('div', { class: 'ptitle' }),
        el('div', { class: 'stats' }),
        el('div', { class: 'blurb' }),
      ]),
      canvas,
      el('div', { class: 'stamp' }, ['LOCKED IN']),
    ]);
    const preview = new FighterPreview(canvas, s === 0 ? 1 : -1);
    return { root, preview, shown: null };
  }

  /** Side controlled by the mouse: P1 until it locks, then P2 (versus) / the CPU slot. */
  mouseSide() {
    return this.mode === 'versus' ? (this.locked[0] ? 1 : 0) : this.active;
  }

  /** Mouse hover selects the card, exactly like moving the cursor with the keys. */
  hover(i) {
    const s = this.mouseSide();
    if (this.locked[s] || this.cursor[s] === i) return;
    this.cursor[s] = i;
    this.app.audio.ui('move');
    this.refresh();
  }

  click(i) {
    const s = this.mouseSide();
    if (this.locked[s]) return;
    this.cursor[s] = i;
    this.lock(s);
  }

  onKey(code) {
    const a = Keyboard.actionOf(code);
    if (!a) return;
    const n = ROSTER.length;
    let s = this.mode === 'versus' ? a.player : this.active;
    if (code === 'ArrowLeft' || code === 'ArrowRight' || code === 'KeyA' || code === 'KeyD') {
      if (this.mode !== 'versus') s = this.active;
    }
    if (a.action === 'left' || a.action === 'right' || a.action === 'up' || a.action === 'down') {
      if (this.locked[s]) return;
      const d = a.action === 'left' || a.action === 'up' ? -1 : 1;
      this.cursor[s] = (this.cursor[s] + d + n) % n;
      this.app.audio.ui('move');
      this.refresh();
    } else if (a.action === 'lp' || a.action === 'lk') {
      if (!this.locked[s]) this.lock(s);
    } else if (a.action === 'hp' || a.action === 'back') {
      this.back(s);
    }
  }

  lock(s) {
    this.locked[s] = true;
    this.app.audio.ui('slam');
    const side = this.sides[s].root;
    side.classList.add('locked');
    this.root.classList.remove('shake');
    void this.root.offsetWidth;
    this.root.classList.add('shake');
    if (this.mode !== 'versus' && s === 0) this.active = 1;
    this.refresh();
    if (this.locked[0] && this.locked[1]) {
      this.done = setTimeout(() => {
        this.app.goVersus(ROSTER[this.cursor[0]].id, ROSTER[this.cursor[1]].id, this.mode);
      }, 900);
    }
  }

  back(s) {
    clearTimeout(this.done);
    if (this.mode !== 'versus') {
      if (this.locked[1]) { this.locked[1] = false; this.sides[1].root.classList.remove('locked'); }
      else if (this.locked[0]) { this.locked[0] = false; this.active = 0; this.sides[0].root.classList.remove('locked'); }
      else return this.app.goTitle();
    } else if (this.locked[s]) {
      this.locked[s] = false;
      this.sides[s].root.classList.remove('locked');
    } else return this.app.goTitle();
    this.app.audio.ui('back');
    this.refresh();
  }

  refresh(first = false) {
    const secondActive = this.mode === 'versus' || this.active === 1 || this.locked[1];
    this.cards.forEach((c, i) => {
      const p1 = this.cursor[0] === i, p2 = this.cursor[1] === i && secondActive;
      c.classList.toggle('c1', p1);
      c.classList.toggle('c2', p2);
      c.classList.toggle('focus', p1 || p2);
      const tags = c.querySelector('.card-tags');
      tags.innerHTML = '';
      if (p1) tags.appendChild(el('span', { class: 't1' }, ['P1']));
      if (p2) tags.appendChild(el('span', { class: 't2' }, [this.mode === 'versus' ? 'P2' : this.secondLabel]));
    });
    this.sides.forEach((side, s) => {
      const visible = s === 0 || secondActive;
      side.root.classList.toggle('waiting', !visible);
      side.root.querySelector('.side-tag').textContent = s === 0 ? 'P1' : this.mode === 'versus' ? 'P2' : this.secondLabel;
      if (!visible) {
        side.root.querySelector('.pname').textContent = '???';
        side.root.querySelector('.ptitle').textContent = 'Awaiting challenger';
        return;
      }
      const f = ROSTER[this.cursor[s]];
      if (side.shown === f.id && !first) return;
      side.shown = f.id;
      const def = buildFighterDef(f.id);
      for (const p of side.root.querySelectorAll('.portrait')) p.style.backgroundImage = `url(${this.app.portraitURL(f.id)})`;
      const frame = side.root.querySelector('.portrait-frame');
      frame.classList.remove('swap');
      void frame.offsetWidth;
      frame.classList.add('swap');
      side.root.querySelector('.pname').textContent = f.name;
      side.root.querySelector('.ptitle').textContent = f.title;
      side.root.querySelector('.blurb').textContent = f.blurb;
      const st = side.root.querySelector('.stats');
      st.innerHTML = '';
      // BODY always; CHARACTER (how the CPU plays this fighter) only when the CPU plays both sides
      const groups = this.mode === 'watch' ? ATTRIBUTE_GROUPS : ATTRIBUTE_GROUPS.filter((g) => g.id === 'body');
      for (const g of groups) {
        if (groups.length > 1) st.appendChild(el('div', { class: 'stat-group' }, [g.label]));
        for (const a of ATTRIBUTES.filter((x) => x.group === g.id)) {
          const v = def.attrs[a.id];
          const k = attributeFill(a, v, RANGES[a.id]);
          st.appendChild(el('div', { class: 'stat', title: a.hint }, [
            el('span', { class: 'stat-l' }, [a.label]),
            el('span', { class: 'stat-bar' }, [el('i', { style: { width: `${Math.round(4 + k * 96)}%` } })]),
            el('span', { class: 'stat-v' }, [a.fmt(v)]),
          ]));
        }
      }
      side.preview.setFighter(f.id);
    });
  }

  frame(dt) {
    const ctx = this.app.ctx;
    ctx.fillStyle = '#07030b';
    ctx.fillRect(0, 0, 1280, 720);
    for (const s of this.sides) s.preview.frame(dt, 0.92);
  }

  exit() {
    clearTimeout(this.done);
    this.unsub?.();
    clearUI();
  }
}
