// Tournament hub: league table, rounds and fixtures, watch / simulate controls, the results grid
// (click a cell to replay that match), the background simulation progress, the animated
// spectacle report after each match, and the final awards screen.
import { ROSTER } from '../data/fighters.js';
import { el, clearUI } from './dom.js';
import {
  createTournament, load, save, clearSaved, standings, awards, tournamentAwards, allMatches, nextMatch, isFinished,
  currentRound, roundComplete, MatchRunner, recordResult, POINTS, FAME_PER_SP, AWARD_FAME,
} from '../tournament/tournament.js';
import { showSpectacle } from './spectacle.js';
import { FightScene } from './fightScene.js';

const NAME = Object.fromEntries(ROSTER.map((f) => [f.id, f.name]));
const short = (id) => {
  const n = NAME[id] || id;
  const m = n.match(/"([^"]+)"/);
  return m ? m[1] : n.split(' ').slice(-1)[0];
};

export class TournamentScene {
  constructor(app, { tournament = null, view = null } = {}) {
    this.app = app;
    this.t = tournament || load();
    this.viewRound = null;
    this.sim = null; // { queue: [{m}], runner, done, total, cancel }
    this.afterEnter = view;
  }

  enter() {
    clearUI();
    this.app.audio.stopMusic();
    this.unsub = this.app.keyboard.onPress((code) => this.onKey(code));
    if (!this.t) return this.showNew();
    this.render();
    if (this.afterEnter) { const f = this.afterEnter; this.afterEnter = null; f(this); }
  }

  exit() {
    this.unsub?.();
    clearUI();
  }

  onKey(code) {
    if (this.modal || this.sim) {
      if (code === 'Escape' && this.sim) this.sim.cancel = true;
      return;
    }
    if (!this.t) return;
    if (code === 'Enter' && !isFinished(this.t)) this.watchNext();
    else if (code === 'Space' && !isFinished(this.t)) this.simulate('one');
    else if (code === 'KeyG') this.showGrid();
    else if (code === 'ArrowLeft' || code === 'KeyA') this.browse(-1);
    else if (code === 'ArrowRight' || code === 'KeyD') this.browse(1);
    else if (code === 'Escape') this.app.goTitle();
  }

  frame(dt) {
    const ctx = this.app.ctx;
    ctx.fillStyle = '#07030b';
    ctx.fillRect(0, 0, 1280, 720);
    if (this.sim) this.stepSim();
  }

  // --- new tournament -----------------------------------------------------------------------------
  showNew() {
    clearUI();
    const ui = document.getElementById('ui');
    const level = this.app.settings.difficulty || 'normal';
    this.root = el('div', { class: 'tour tour-new' }, [
      el('div', { class: 'sel-bg' }, [el('div', { class: 'sel-stripes left' }), el('div', { class: 'sel-stripes right' }), el('div', { class: 'sel-halftone' })]),
      el('div', { class: 'tour-new-panel' }, [
        el('div', { class: 'tour-kicker' }, ['PIER 9 PRESENTS']),
        el('h1', { class: 'tour-logo', 'data-text': 'ROUND ROBIN' }, ['ROUND ROBIN']),
        el('p', { class: 'tour-lead' }, [`${ROSTER.length} fighters · everyone fights everyone · ${ROSTER.length - 1} rounds · ${(ROSTER.length * (ROSTER.length - 1)) / 2} matches`]),
        el('p', { class: 'tour-lead small' }, [`Best of 3 · CPU level: ${level} · 2:0 win = ${POINTS.win20} pts, 2:1 = ${POINTS.win21}, 1:2 loss = ${POINTS.loss12}`]),
        el('p', { class: 'tour-lead small' }, [`Spectacle points turn into FAME (${FAME_PER_SP}:1) · every round award: +${AWARD_FAME} fame`]),
        el('div', { class: 'tour-faces' }, ROSTER.map((f, i) => el('div', { class: 'tour-face', style: { backgroundImage: `url(${this.app.portraitURL(f.id)})`, '--i': i } }))),
        el('div', { class: 'tour-actions' }, [
          btn('START TOURNAMENT', () => { this.t = createTournament({ level }); save(this.t); this.app.audio.ui('confirm'); this.render(); }, 'big'),
          btn('MAIN MENU', () => this.app.goTitle()),
        ]),
      ]),
    ]);
    ui.appendChild(this.root);
  }

  // --- hub ------------------------------------------------------------------------------------------
  render() {
    clearUI();
    const t = this.t;
    const ui = document.getElementById('ui');
    const table = standings(t);
    const played = allMatches(t).filter((x) => x.m.result).length, total = allMatches(t).length;
    const cr = currentRound(t);
    const vr = this.viewRound ?? cr;
    const finished = isFinished(t);
    const nx = nextMatch(t);

    const rows = table.map((r, i) => el('div', { class: `trow ${i < 4 ? 'top' : ''}`, style: { '--i': i } }, [
      el('span', { class: 'tpos' }, [String(i + 1)]),
      el('span', { class: 'tface', style: { backgroundImage: `url(${this.app.portraitURL(r.id)})` } }),
      el('span', { class: 'tname' }, [NAME[r.id]]),
      el('span', { class: 'tnum' }, [String(r.played)]),
      el('span', { class: 'tnum' }, [String(r.won)]),
      el('span', { class: 'tnum' }, [String(r.lost)]),
      el('span', { class: 'tnum' }, [`${r.rf - r.ra >= 0 ? '+' : ''}${r.rf - r.ra}`]),
      el('span', { class: 'tform' }, r.form.map((x) => el('i', { class: `f${x}` }, [x]))),
      el('span', { class: 'tsp', title: `${r.sp} spectacle points earned` }, [`★${r.fame}`]),
      el('span', { class: 'tpts' }, [String(r.pts)]),
    ]));

    const fixtures = t.rounds[vr].map((m) => {
      const r = m.result, isNext = nx && nx.m === m;
      const side = (id, i) => el('div', { class: `fx-side ${r && r.winner === i ? 'won' : ''} ${r && r.winner !== i && r.winner !== 'draw' ? 'lost' : ''}` }, [
        el('span', { class: 'fx-face', style: { backgroundImage: `url(${this.app.portraitURL(id)})` } }),
        el('span', { class: 'fx-name' }, [short(id)]),
      ]);
      return el('div', { class: `fx ${isNext ? 'next' : ''} ${r ? 'done' : ''}`, onclick: r ? () => this.replay(m) : null, title: r ? 'Click to replay' : '' }, [
        side(m.a, 0),
        el('div', { class: 'fx-score' }, [r ? `${r.wins[0]} : ${r.wins[1]}` : isNext ? 'NEXT' : 'vs']),
        side(m.b, 1),
      ]);
    });

    this.root = el('div', { class: 'tour' }, [
      el('div', { class: 'sel-bg' }, [el('div', { class: 'sel-stripes left' }), el('div', { class: 'sel-stripes right' }), el('div', { class: 'sel-halftone' })]),
      el('div', { class: 'tour-head' }, [
        el('div', { class: 'tour-title' }, ['ROUND ROBIN']),
        el('div', { class: 'tour-progress' }, [
          el('span', {}, [finished ? 'TOURNAMENT COMPLETE' : `ROUND ${cr + 1} / ${t.rounds.length}`]),
          el('div', { class: 'tbar' }, [el('div', { class: 'tbar-fill', style: { width: `${(played / total) * 100}%` } })]),
          el('span', { class: 'tcount' }, [`${played} / ${total} matches`]),
        ]),
      ]),
      el('div', { class: 'tour-table' }, [
        el('div', { class: 'trow thead' }, ['#', '', 'FIGHTER', 'P', 'W', 'L', 'R±', 'FORM', 'FAME', 'PTS'].map((h) => el('span', {}, [h]))),
        ...rows,
      ]),
      el('div', { class: 'tour-side' }, [
        el('div', { class: 'round-nav' }, [
          btn('◀', () => this.browse(-1), 'mini'),
          el('span', {}, [`ROUND ${vr + 1}`]),
          btn('▶', () => this.browse(1), 'mini'),
        ]),
        el('div', { class: 'fixtures' }, fixtures),
        roundComplete(t, vr) ? btn(`🏅 ROUND ${vr + 1} AWARDS`, () => this.showRoundAwards(vr), 'mini wide') : null,
        el('div', { class: 'tour-actions col' }, finished
          ? [btn('AWARDS', () => this.showFinal(), 'big'), btn('RESULTS GRID', () => this.showGrid()), btn('NEW TOURNAMENT', () => this.confirmNew()), btn('MAIN MENU', () => this.app.goTitle())]
          : [
            btn('▶ WATCH NEXT MATCH', () => this.watchNext(), 'big'),
            el('div', { class: 'tour-actions' }, [btn('SIMULATE MATCH', () => this.simulate('one')), btn('SIMULATE ROUND', () => this.simulate('round'))]),
            el('div', { class: 'tour-actions' }, [btn('SIMULATE ALL', () => this.simulate('all')), btn('RESULTS GRID', () => this.showGrid())]),
            el('div', { class: 'tour-actions' }, [btn('NEW', () => this.confirmNew(), 'mini wide'), btn('MAIN MENU', () => this.app.goTitle(), 'mini wide')]),
          ]),
        el('div', { class: 'tour-help' }, ['Enter watch · Space simulate · ◀ ▶ rounds · G grid · click a result to replay']),
      ]),
    ]);
    ui.appendChild(this.root);
  }

  browse(d) {
    const cur = this.viewRound ?? currentRound(this.t);
    this.viewRound = Math.max(0, Math.min(this.t.rounds.length - 1, cur + d));
    this.render();
  }

  confirmNew() {
    this.modal = this.app.menu('NEW TOURNAMENT?', [
      ['Yes, start over', () => { this.modal = null; clearSaved(); this.t = null; this.showNew(); }],
      ['Cancel', () => { this.modal = null; }],
    ], { subtitle: 'The current table and all results will be lost.', onBack: () => { this.modal = null; } });
  }

  // --- watching / replays -------------------------------------------------------------------------
  watchNext() {
    const nx = nextMatch(this.t);
    if (!nx) return;
    this.app.audio.ui('confirm');
    this.playLive(nx.m);
  }

  playLive(m) {
    const app = this.app, t = this.t;
    const back = (view) => app.setScene(new TournamentScene(app, { tournament: t, view }));
    app.setScene(new FightScene(app, {
      p1: m.a, p2: m.b, mode: 'watch',
      tournament: {
        t, m, replay: false,
        onEnd: ({ match, stats, overrides }) => {
          const before = spSnapshot(t, m);
          recordResult(t, m, match, stats, overrides);
          setTimeout(() => back((s) => s.spectacle(m, before)), 600);
        },
        // quitting a live match: the result is decided by simulating the same seed
        onQuit: () => back((s) => s.simulate('match', m)),
      },
    }));
  }

  replay(m) {
    const app = this.app, t = this.t;
    this.app.audio.ui('confirm');
    const back = () => app.setScene(new TournamentScene(app, { tournament: t }));
    app.setScene(new FightScene(app, {
      p1: m.a, p2: m.b, mode: 'watch',
      tournament: { t, m, replay: true, onEnd: () => setTimeout(back, 1200), onQuit: back },
    }));
  }

  // --- background simulation ----------------------------------------------------------------------
  simulate(scope, only = null) {
    const t = this.t;
    let queue;
    if (only) queue = [only];
    else if (scope === 'one') queue = [nextMatch(t)?.m].filter(Boolean);
    else if (scope === 'round') queue = t.rounds[currentRound(t)].filter((m) => !m.result);
    else queue = allMatches(t).filter((x) => !x.m.result).map((x) => x.m);
    if (!queue.length) return;
    this.app.audio.ui('confirm');
    this.sim = { queue, runner: null, done: 0, total: queue.length, cancel: false, single: queue.length === 1, before: spSnapshot(t, queue[0]) };
    this.modal = true;
    this.simEl = el('div', { class: 'menu-overlay sim' }, [
      el('div', { class: 'sim-panel' }, [
        el('div', { class: 'sim-title' }, ['SIMULATING']),
        this.simVs = el('div', { class: 'sim-vs' }),
        el('div', { class: 'tbar big' }, [this.simFill = el('div', { class: 'tbar-fill' })]),
        this.simCount = el('div', { class: 'sim-count' }),
        btn('STOP', () => { this.sim.cancel = true; }, 'mini'),
      ]),
    ]);
    document.getElementById('ui').appendChild(this.simEl);
  }

  stepSim() {
    const s = this.sim;
    if (!s.runner) {
      if (s.cancel || !s.queue.length) return this.endSim();
      const m = s.queue.shift();
      s.runner = new MatchRunner(this.t, m);
      this.simVs.replaceChildren(
        el('span', { class: 'fx-face big', style: { backgroundImage: `url(${this.app.portraitURL(m.a)})` } }),
        el('b', {}, ['VS']),
        el('span', { class: 'fx-face big', style: { backgroundImage: `url(${this.app.portraitURL(m.b)})` } }),
      );
    }
    if (s.runner.advance(14)) {
      s.runner.record();
      s.last = s.runner.m;
      s.runner = null;
      s.done++;
    }
    const k = (s.done + (s.runner ? Math.min(0.95, s.runner.ticks / 9000) : 0)) / s.total;
    this.simFill.style.width = `${k * 100}%`;
    this.simCount.textContent = `${s.done} / ${s.total}`;
  }

  endSim() {
    const s = this.sim;
    this.sim = null;
    this.modal = null;
    this.simEl?.remove();
    this.viewRound = null;
    this.render();
    if (s.single && s.last) this.spectacle(s.last, s.before);
    else this.afterResults();
  }

  // --- spectacle report ---------------------------------------------------------------------------
  spectacle(m, before) {
    this.modal = true;
    showSpectacle(this.app, m, before, () => {
      this.modal = null;
      this.render();
      this.afterResults();
    });
  }

  // --- results grid -------------------------------------------------------------------------------
  showGrid() {
    const t = this.t;
    const order = standings(t).map((r) => r.id);
    const res = {};
    for (const { m } of allMatches(t)) {
      if (!m.result) continue;
      res[`${m.a}|${m.b}`] = { m, i: 0 };
      res[`${m.b}|${m.a}`] = { m, i: 1 };
    }
    const head = [el('div', { class: 'gcell corner' }), ...order.map((id) => el('div', { class: 'gcell ghead', style: { backgroundImage: `url(${this.app.portraitURL(id)})` }, title: NAME[id] }))];
    const body = order.flatMap((rid) => [
      el('div', { class: 'gcell ghead', style: { backgroundImage: `url(${this.app.portraitURL(rid)})` }, title: NAME[rid] }),
      ...order.map((cid) => {
        if (rid === cid) return el('div', { class: 'gcell self' });
        const x = res[`${rid}|${cid}`];
        if (!x) return el('div', { class: 'gcell empty' }, ['·']);
        const r = x.m.result, me = x.i;
        const cls = r.winner === 'draw' ? 'draw' : r.winner === me ? 'win' : 'loss';
        return el('div', { class: `gcell ${cls}`, title: `${NAME[rid]} vs ${NAME[cid]} — click to replay`, onclick: () => { close(); this.replay(x.m); } }, [`${r.wins[me]}:${r.wins[1 - me]}`]);
      }),
    ]);
    const close = () => { wrap.remove(); this.modal = null; unsub(); };
    const wrap = el('div', { class: 'menu-overlay grid-overlay' }, [
      el('div', { class: 'grid-panel' }, [
        el('div', { class: 'grid-title' }, ['RESULTS GRID', el('small', {}, ['row = fighter · click a score to replay'])]),
        el('div', { class: 'grid', style: { '--n': order.length + 1 } }, [...head, ...body]),
        btn('CLOSE', close, 'mini'),
      ]),
    ]);
    this.modal = true;
    const unsub = this.app.keyboard.onPress((code) => { if (code === 'Escape' || code === 'KeyG') close(); });
    document.getElementById('ui').appendChild(wrap);
  }

  // --- awards ---------------------------------------------------------------------------------------
  /** After results come in: newly completed rounds get their awards screen, then the final. */
  afterResults() {
    const t = this.t;
    t.awardsSeen = t.awardsSeen || [];
    const fresh = t.rounds.map((_, i) => i).filter((i) => roundComplete(t, i) && !t.awardsSeen[i]);
    for (const i of fresh) t.awardsSeen[i] = true;
    save(t);
    const done = () => { if (isFinished(t)) this.showFinal(); };
    // a long batch completes many rounds at once: show the latest one (the rest stay viewable)
    if (fresh.length) this.showRoundAwards(fresh[fresh.length - 1], done);
    else done();
  }

  awardCards(list, delay = 0.4) {
    return el('div', { class: 'awards' }, list.map((a, i) => el('div', { class: 'award', style: { '--d': `${delay + i * 0.3}s` } }, [
      el('div', { class: 'award-title' }, [a.title]),
      a.id ? el('div', { class: 'award-face', style: { backgroundImage: `url(${this.app.portraitURL(a.id)})` } }) : el('div', { class: 'award-face none' }),
      el('div', { class: 'award-name' }, [a.id ? short(a.id) : 'nobody']),
      el('div', { class: 'award-value' }, [a.value]),
      a.note ? el('div', { class: 'award-note' }, [a.note.replace(/vs (\w+)/, (_, id) => `vs ${short(id)}`)]) : null,
      a.fame ? el('div', { class: 'award-fame' }, [`+${a.fame} FAME`]) : null,
    ])));
  }

  showRoundAwards(ri, then = null) {
    const close = () => { wrap.remove(); this.modal = null; unsub(); then?.(); };
    const wrap = el('div', { class: 'menu-overlay final round-awards' }, [
      el('div', { class: 'final-panel' }, [
        el('div', { class: 'final-kicker' }, [`ROUND ${ri + 1} OF ${this.t.rounds.length}`]),
        el('div', { class: 'awards-title' }, ['ROUND AWARDS']),
        this.awardCards(this.t.roundAwards?.[ri] || awards(this.t, ri), 0.35),
        el('div', { class: 'tour-actions' }, [btn('CONTINUE', close, 'big')]),
      ]),
    ]);
    this.modal = true;
    const unsub = this.app.keyboard.onPress((code) => { if (['Escape', 'Enter', 'Space'].includes(code)) close(); });
    document.getElementById('ui').appendChild(wrap);
    this.app.audio.ui('slam');
  }

  // --- final screen -------------------------------------------------------------------------------
  showFinal() {
    const t = this.t;
    const table = standings(t);
    const champ = table[0];
    const list = t.finalAwards || tournamentAwards(t);
    const close = () => { wrap.remove(); this.modal = null; unsub(); };
    const wrap = el('div', { class: 'menu-overlay final' }, [
      el('div', { class: 'final-panel' }, [
        el('div', { class: 'final-kicker' }, ['TOURNAMENT CHAMPION']),
        el('div', { class: 'final-champ' }, [
          el('div', { class: 'final-portrait', style: { backgroundImage: `url(${this.app.portraitURL(champ.id)})` } }),
          el('div', { class: 'final-name' }, [NAME[champ.id], el('small', {}, [`${champ.pts} pts · ${champ.won}-${champ.lost} · ★${champ.fame} fame`])]),
        ]),
        el('div', { class: 'podium' }, table.slice(1, 3).map((r, i) => el('div', { class: 'pod' }, [
          el('span', { class: 'fx-face', style: { backgroundImage: `url(${this.app.portraitURL(r.id)})` } }), `${i + 2}. ${short(r.id)} · ${r.pts} pts`]))),
        el('div', { class: 'awards-label' }, ['TOURNAMENT AWARDS']),
        this.awardCards(list, 0.9),
        el('div', { class: 'tour-actions' }, [btn('VIEW TABLE', close), btn('NEW TOURNAMENT', () => { close(); this.confirmNew(); })]),
      ]),
    ]);
    this.modal = true;
    const unsub = this.app.keyboard.onPress((code) => { if (code === 'Escape' || code === 'Enter') close(); });
    document.getElementById('ui').appendChild(wrap);
    this.app.audio.ui('slam');
  }
}

/** Fame balance of both fighters before a match (for the "before → after" bar). */
function spSnapshot(t, m) {
  return m ? [t.fighters[m.a].fame, t.fighters[m.b].fame] : [0, 0];
}

function btn(label, fn, cls = '') {
  return el('button', { class: `tbtn ${cls}`, onclick: (e) => { e.stopPropagation(); fn(); } }, [label]);
}
