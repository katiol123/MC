// Hit detection and resolution. Runs once per tick after both fighters moved and rebuilt their
// collision volumes. Both directions are detected first and then applied, so simultaneous hits
// trade (or the higher-priority move wins) independent of update order.
import { TUNING } from '../config/tuning.js';
import { capsulesOverlap, capsulePenetration } from '../core/math.js';
import { STAGE } from '../config/constants.js';

const PART_ORDER = { head: 0, torso: 1, limb: 2 };

/** Records why a hit attempt was accepted or rejected (shown by the debug overlay). */
function note(f, reason) {
  if (!reason) return;
  const mid = f.move ? f.move.def.id : '-';
  const last = f.hitLog[f.hitLog.length - 1];
  if (last && last.reason === reason && last.move === mid) return;
  f.lastHit = { tick: f.input.tick, move: mid, reason };
  f.hitLog.push(f.lastHit);
  if (f.hitLog.length > 6) f.hitLog.shift();
}

/**
 * Checks whether `att`'s active hitboxes connect with `def`. Returns
 *   { ok: true, part, point } or { ok: false, reason } (reason null when there is nothing to report).
 */
export function detectHit(att, def) {
  const mv = att.move;
  if (!mv || att.hitboxes.length === 0) return { ok: false, reason: null };
  const m = mv.def;
  if (mv.hitIds.has(def.index) && mv.hits >= (m.maxHits || 1)) return { ok: false, reason: 'rejected: move already hit' };
  const inv = def.invulnerability();
  let best = null, sawInvuln = false;
  for (const hb of att.hitboxes) {
    for (const hu of def.hurtboxes) {
      if (!capsulesOverlap(hb, hu)) continue;
      if (inv === 'all' || (inv && inv.has(hu.part))) {
        sawInvuln = true;
        continue;
      }
      const depth = capsulePenetration(hb, hu);
      if (!best || PART_ORDER[hu.part] < PART_ORDER[best.part] || (hu.part === best.part && depth > best.depth)) {
        best = { part: hu.part, depth, point: { x: hb.b.x, y: hb.b.y }, hb, hu };
      }
    }
  }
  if (!best) return { ok: false, reason: sawInvuln ? 'rejected: invulnerable' : 'whiff: no overlap' };
  if (def.state === 'juggle' && !m.juggleIgnore && def.combo.juggle + (m.juggle ?? 1) > TUNING.juggleLimit) {
    return { ok: false, reason: 'rejected: juggle limit' };
  }
  if (def.combo.hits >= TUNING.comboHitCap) return { ok: false, reason: 'rejected: combo hit cap' };
  if (def.combo.hits > 0 && (def.combo.moves[m.id] || 0) >= TUNING.maxSameMoveInCombo) {
    return { ok: false, reason: 'rejected: repeated move limit' };
  }
  return { ok: true, part: best.part, point: best.point, reason: `hit ${best.part}` };
}

function hitboxesClash(a, b) {
  for (const h1 of a.hitboxes) for (const h2 of b.hitboxes) if (capsulesOverlap(h1, h2)) return true;
  return false;
}

/** Detects and applies the hit exchange for this tick. Returns a list of events. */
export function resolveExchange(f1, f2) {
  const events = [];
  let r1 = detectHit(f1, f2);
  let r2 = detectHit(f2, f1);
  note(f1, r1.reason);
  note(f2, r2.reason);

  // Clash: two active attacks meet fist-to-fist and neither reaches a body yet.
  if (!r1.ok && !r2.ok && f1.hitboxes.length && f2.hitboxes.length && f1.move.hits === 0 && f2.move.hits === 0 &&
      !f1.move.clashed && hitboxesClash(f1, f2)) {
    const p1 = f1.move.def.priority, p2 = f2.move.def.priority;
    if (p1 === p2) {
      for (const [f, o] of [[f1, f2], [f2, f1]]) {
        f.move.clashed = true;
        f.move.hitIds.add(o.index);
        f.move.hits = 99;
        f.move.contact = 'clash';
        f.hitstop = 9;
        f.body.vx = -f.facing * 4;
        note(f, 'clash (equal priority)');
      }
      const hb = f1.hitboxes[0];
      events.push({ type: 'clash', x: hb.b.x, y: hb.b.y });
      return events;
    }
    // Unequal priority: the weaker hitbox is beaten; the stronger one continues normally.
    const loser = p1 < p2 ? f1 : f2;
    loser.move.hits = 99;
    loser.move.hitIds.add(loser === f1 ? f2.index : f1.index);
    note(loser, 'rejected: out-prioritised in clash');
  }

  if (r1.ok && r2.ok) {
    const p1 = f1.move.def.priority, p2 = f2.move.def.priority;
    if (p1 - p2 >= 2) r2 = { ok: false, reason: 'rejected: lost trade on priority' };
    else if (p2 - p1 >= 2) r1 = { ok: false, reason: 'rejected: lost trade on priority' };
    if (!r1.ok) note(f1, r1.reason);
    if (!r2.ok) note(f2, r2.reason);
  }
  // Capture defender states before applying anything (simultaneous resolution).
  const pending = [];
  // (moves are captured too: applying the first hit of a trade cancels the other fighter's move)
  if (r1.ok) pending.push([f1, f2, r1, snapshotDefender(f2), f1.move]);
  if (r2.ok) pending.push([f2, f1, r2, snapshotDefender(f1), f2.move]);
  const trade = pending.length === 2;
  for (const [att, def, res, snap, mv] of pending) events.push(applyHit(att, def, res, snap, trade, mv));
  return events;
}

function snapshotDefender(def) {
  return {
    state: def.state,
    moveFrame: def.move?.frame ?? 0,
    move: def.move?.def ?? null,
  };
}

export function damageScale(hitNumber) {
  const t = TUNING.damageScaling;
  return Math.max(TUNING.minDamageScale, t[Math.min(hitNumber - 1, t.length - 1)]);
}

function applyHit(att, def, res, snap, trade, mv) {
  const m = mv.def;
  mv.hitIds.add(def.index);
  mv.hits++;
  const block = trade ? { ok: false, why: 'trade' } : def.canBlock(att, m.height);
  if (block.ok) {
    mv.contact = 'block';
    const hs = Math.round(m.hitstop * TUNING.blockHitstopScale);
    def.receiveBlock(att, m, hs);
    att.hitstop = hs;
    cornerPushback(att, def, m.push.block);
    note(att, `BLOCKED (${block.low ? 'low' : 'high'} guard)`);
    return { type: 'block', who: att.index, target: def.index, x: res.point.x, y: res.point.y, strength: m.strength, move: m.id, low: block.low };
  }

  mv.contact = 'hit';
  const inStartupOrActive = snap.state === 'attack' && snap.move && snap.moveFrame <= snap.move.startup + snap.move.active;
  const counter = inStartupOrActive && !trade;
  const punish = snap.state === 'attack' && !inStartupOrActive;
  const hitN = def.combo.hits + 1;
  const scale = damageScale(hitN);
  const partMul = TUNING.partDamage[res.part] ?? 1;
  const dmgMul = att.stats.damage ?? 1;
  const damage = Math.max(1, Math.round(m.damage * partMul * scale * dmgMul * (counter ? TUNING.counterHitDamage : 1)));
  const decay = Math.max(0, hitN - TUNING.hitstunDecayStart) * TUNING.hitstunDecayPerHit;
  const hitstun = Math.max(TUNING.minHitstun, m.hitstun + (counter ? TUNING.counterHitStun : 0) - decay);
  const hitstop = m.hitstop + (counter ? TUNING.counterHitHitstop : 0);
  // Counter-hit heavy strikes on a grounded opponent stagger instead of a simple flinch.
  const reaction = counter && m.reaction === 'heavy' && def.body.onGround ? 'stagger' : m.reaction;

  def.combo.hits = hitN;
  def.combo.damage += damage;
  def.combo.moves[m.id] = (def.combo.moves[m.id] || 0) + 1;
  def.receiveHit(att, m, { damage, hitstun, part: res.part, hitstop, counter, reaction });
  att.hitstop = hitstop;
  cornerPushback(att, def, m.push.hit);
  note(att, `HIT ${res.part}${counter ? ' COUNTER' : ''}${punish ? ' PUNISH' : ''}${trade ? ' TRADE' : ''} dmg ${damage} stun ${hitstun}`);
  return {
    type: 'hit', who: att.index, target: def.index, x: res.point.x, y: res.point.y,
    strength: m.strength, move: m.id, part: res.part, damage, counter, punish, trade,
    combo: hitN, ko: def.health <= 0, shake: m.shake || 0, dir: att.facing,
  };
}

/** If the defender is pinned against a wall, the attacker is pushed back instead. */
function cornerPushback(att, def, push) {
  const dirAway = Math.sign(def.body.x - att.body.x) || att.facing;
  if (def.body.wall === dirAway || Math.abs(def.body.x - (dirAway > 0 ? STAGE.right - def.body.pushW : STAGE.left + def.body.pushW)) < 4) {
    if (att.body.onGround) att.body.vx = -dirAway * push * 0.9;
  }
}
