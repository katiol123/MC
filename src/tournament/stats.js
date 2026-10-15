// Match statistics and SPECTACLE points.
// A MatchStats object listens to the events of one match (watched or simulated: the same events
// either way) and, at the end, reports per-fighter numbers plus the spectacle points each fighter
// earned and what they were earned for. Spectacle points are the tournament currency.

/** What earns spectacle points. `per` = points per occurrence; combos are scored by length. */
export const SPECTACLE_RULES = [
  { key: 'combo', label: 'Combos', icon: '⚡', hint: '2 pts per hit after the first, +5 for 5+ hits' },
  { key: 'variety', label: 'Move variety', icon: '🎯', per: 1, hint: 'different moves that landed', cap: 20 },
  { key: 'special', label: 'Specials landed', icon: '✦', per: 3 },
  { key: 'super', label: 'Supers landed', icon: '★', per: 10 },
  { key: 'counter', label: 'Counter hits', icon: '↯', per: 2 },
  { key: 'punish', label: 'Punishes', icon: '⚔', per: 2 },
  { key: 'throw', label: 'Throws', icon: '⤴', per: 4 },
  { key: 'parry', label: 'Parries', icon: '🛡', per: 5 },
  { key: 'dizzy', label: 'Dizzied the rival', icon: '💫', per: 8 },
  { key: 'fastKo', label: 'Quick K.O. (< 20 s)', icon: '⏱', per: 8 },
  { key: 'perfect', label: 'Perfect round', icon: '💎', per: 20 },
  { key: 'comeback', label: 'Comeback round', icon: '🔥', per: 12, hint: 'won with less than 15 % health' },
  { key: 'fatality', label: 'Fatality', icon: '☠', per: 25 },
  { key: 'win', label: 'Match won', icon: '🏆', per: 10 },
  { key: 'flawless', label: 'Won without dropping a round', icon: '✪', per: 5 },
];

const SPECIAL_IDS = new Set(['s1', 's2', 's3', 's4', 'vc']);
const QUICK_KO_TICKS = 20 * 60;

const side = () => ({
  hits: 0, damageDealt: 0, damageTaken: 0,
  combos: 0, longestCombo: 0, comboPoints: 0,
  moves: new Set(), special: 0, super: 0, counter: 0, punish: 0, throw: 0, parry: 0, dizzy: 0,
  fastKo: 0, perfect: 0, comeback: 0, fatality: 0, roundsWon: 0,
  koTimes: [], // seconds of fighting before each K.O. this fighter scored
});

export class MatchStats {
  constructor() {
    this.s = [side(), side()];
    this.roundTicks = 0;
    this.superPending = [false, false];
  }

  /** Feed one tick: the match (after its tick) and the events that tick produced. */
  onTick(match, events) {
    if (match.phase === 'fight' || match.phase === 'finish') this.roundTicks++;
    for (const e of events) this.onEvent(e, match);
  }

  onEvent(e, match) {
    const S = this.s;
    switch (e.type) {
      case 'roundIntro':
        this.roundTicks = 0;
        break;
      case 'hit': {
        const a = S[e.who], d = S[e.target];
        if (!a || !d) break;
        a.hits++;
        a.damageDealt += e.damage;
        d.damageTaken += e.damage;
        const id = e.move ? (e.move.startsWith('proj:') ? 's4' : e.move) : null;
        if (id) a.moves.add(id);
        if (e.super) {
          if (this.superPending[e.who]) { a.super++; this.superPending[e.who] = false; }
        } else if (id && SPECIAL_IDS.has(id)) a.special++;
        if (e.counter) a.counter++;
        if (e.punish) a.punish++;
        if (e.throw) a.throw++;
        break;
      }
      case 'superStart':
        this.superPending[e.who] = true;
        break;
      case 'comboEnd': {
        // emitted by the fighter who took the combo
        const a = S[1 - e.who];
        if (e.hits >= 2) {
          a.combos++;
          a.longestCombo = Math.max(a.longestCombo, e.hits);
          a.comboPoints += (e.hits - 1) * 2 + (e.hits >= 5 ? 5 : 0);
        }
        break;
      }
      case 'parry':
        S[e.who].parry++;
        break;
      case 'dizzy':
        S[1 - e.who].dizzy++;
        break;
      case 'ko':
        if (e.winner === 0 || e.winner === 1) {
          const w = S[e.winner];
          w.koTimes.push(Math.round((this.roundTicks / 60) * 10) / 10);
          if (this.roundTicks < QUICK_KO_TICKS) w.fastKo++;
        }
        break;
      case 'fatalityStart':
        S[e.who].fatality++;
        break;
      case 'roundEnd': {
        if (e.result !== 0 && e.result !== 1) break;
        const w = S[e.result], f = match.fighters[e.result];
        w.roundsWon++;
        if (f.health >= f.maxHealth) w.perfect++;
        else if (f.health / f.maxHealth < 0.15) w.comeback++;
        break;
      }
      default:
    }
  }

  /** Final report: { winner, wins, sides: [{...numbers, spectacle: {total, items}}] } */
  report(match) {
    const winner = match.winner;
    const sides = this.s.map((st, i) => {
      const won = winner === i;
      const counts = {
        combo: st.combos, variety: st.moves.size, special: st.special, super: st.super, counter: st.counter,
        punish: st.punish, throw: st.throw, parry: st.parry, dizzy: st.dizzy, fastKo: st.fastKo,
        perfect: st.perfect, comeback: st.comeback, fatality: st.fatality,
        win: won ? 1 : 0, flawless: won && match.wins[1 - i] === 0 ? 1 : 0,
      };
      const items = [];
      for (const r of SPECTACLE_RULES) {
        const count = counts[r.key];
        if (!count) continue;
        const points = r.key === 'combo' ? st.comboPoints : Math.min(count, r.cap ?? Infinity) * r.per;
        items.push({ key: r.key, label: r.label, icon: r.icon, count, points });
      }
      const total = items.reduce((a, b) => a + b.points, 0);
      return {
        hits: st.hits, damageDealt: st.damageDealt, damageTaken: st.damageTaken,
        combos: st.combos, longestCombo: st.longestCombo, koTimes: st.koTimes,
        perfect: st.perfect, roundsWon: match.wins[i],
        spectacle: { total, items },
      };
    });
    return { winner, wins: match.wins.slice(), sides };
  }
}
