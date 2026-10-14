// Hit detection and resolution. Runs once per tick after both fighters moved and rebuilt their
// collision volumes. Both directions are detected first and then applied, so simultaneous hits
// trade (or the higher-priority move wins) independent of update order.
// Also resolves throws (grab / tech / release), projectiles and counter-stance parries.
import { TUNING } from '../config/tuning.js';
import { capsulesOverlap, capsulePenetration, lerp, clamp } from '../core/math.js';
import { STAGE } from '../config/constants.js';

const PART_ORDER = { head: 0, torso: 1, limb: 2 };

/** Records why a hit attempt was accepted or rejected (shown by the debug overlay). */
export function note(f, reason) {
  if (!reason) return;
  const mid = f.move ? f.move.def.id : f.state;
  const last = f.hitLog[f.hitLog.length - 1];
  if (last && last.reason === reason && last.move === mid) return;
  f.lastHit = { tick: f.input.tick, move: mid, reason };
  f.hitLog.push(f.lastHit);
  if (f.hitLog.length > 6) f.hitLog.shift();
}

/** Finds the best hurtbox touched by a set of hit volumes. */
function touch(volumes, def) {
  const inv = def.invulnerability();
  let best = null, sawInvuln = false;
  for (const hb of volumes) {
    for (const hu of def.hurtboxes) {
      if (!capsulesOverlap(hb, hu)) continue;
      if (inv === 'all' || (inv && inv.has(hu.part))) {
        sawInvuln = true;
        continue;
      }
      const depth = capsulePenetration(hb, hu);
      if (!best || PART_ORDER[hu.part] < PART_ORDER[best.part] || (hu.part === best.part && depth > best.depth)) {
        best = { part: hu.part, depth, point: { x: hb.b.x, y: hb.b.y } };
      }
    }
  }
  return { best, sawInvuln };
}

/** Combo-protection checks shared by strikes and projectiles. */
function comboRejection(spec, def) {
  if (def.state === 'juggle' && !spec.juggleIgnore && def.combo.juggle + (spec.juggle ?? 1) > TUNING.juggleLimit) return 'rejected: juggle limit';
  if (def.combo.hits >= TUNING.comboHitCap) return 'rejected: combo hit cap';
  if (!spec.comboExempt && def.combo.hits > 0 && (def.combo.moves[spec.id] || 0) >= TUNING.maxSameMoveInCombo) return 'rejected: repeated move limit';
  return null;
}

/** True when `def` is in the parry window of a counter stance and the strike can be parried. */
function parries(def, spec) {
  const mv = def.move;
  if (!mv || mv.def.type !== 'counter' || def.state !== 'attack') return false;
  const [from, to] = mv.def.counterWindow;
  return mv.frame >= from && mv.frame <= to && spec.height !== 'low' && !spec.projectile;
}

/**
 * Checks whether `att`'s active hitboxes connect with `def`. Returns
 *   { ok: true, part, point } or { ok: false, reason } (reason null when there is nothing to report).
 */
export function detectHit(att, def) {
  const mv = att.move;
  const spec = att.hitSpec;
  if (!mv || !spec || att.hitboxes.length === 0) return { ok: false, reason: null };
  if (mv.hitIds.has(def.index) && mv.hits >= (spec.maxHits || 1)) return { ok: false, reason: 'rejected: move already hit' };
  const { best, sawInvuln } = touch(att.hitboxes, def);
  if (!best) return { ok: false, reason: sawInvuln ? 'rejected: invulnerable' : 'whiff: no overlap' };
  if (parries(def, spec)) return { ok: false, parry: true, point: best.point, reason: 'PARRIED by counter stance' };
  const rej = comboRejection(spec, def);
  if (rej) return { ok: false, reason: rej };
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

  // Counter stance: the strike is caught, the attacker is left open and the parry follow-up runs.
  for (const [att, def, r] of [[f1, f2, r1], [f2, f1, r2]]) {
    if (r.parry) {
      events.push(applyParry(att, def, r.point));
      return events;
    }
  }

  // Clash: two active attacks meet fist-to-fist and neither reaches a body yet.
  if (!r1.ok && !r2.ok && f1.hitboxes.length && f2.hitboxes.length && f1.move.hits === 0 && f2.move.hits === 0 &&
      !f1.move.clashed && hitboxesClash(f1, f2)) {
    const p1 = f1.hitSpec.priority ?? 1, p2 = f2.hitSpec.priority ?? 1;
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
    const p1 = f1.hitSpec.priority ?? 1, p2 = f2.hitSpec.priority ?? 1;
    if (p1 - p2 >= 2) r2 = { ok: false, reason: 'rejected: lost trade on priority' };
    else if (p2 - p1 >= 2) r1 = { ok: false, reason: 'rejected: lost trade on priority' };
    if (!r1.ok) note(f1, r1.reason);
    if (!r2.ok) note(f2, r2.reason);
  }
  // Capture defender states and specs before applying anything (simultaneous resolution).
  const pending = [];
  if (r1.ok) pending.push([f1, f2, r1, snapshotDefender(f2), f1.move, f1.hitSpec]);
  if (r2.ok) pending.push([f2, f1, r2, snapshotDefender(f1), f2.move, f2.hitSpec]);
  const trade = pending.length === 2;
  for (const [att, def, res, snap, holder, spec] of pending) {
    events.push(applyStrike(att, def, spec, res, snap, { trade, holder }));
  }
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

/**
 * Applies a strike (melee or projectile) from `att` to `def` using hit spec `spec`.
 * holder: object carrying hitIds/hits/contact (the move instance or the projectile).
 */
export function applyStrike(att, def, spec, res, snap, { trade = false, holder, projectile = null } = {}) {
  holder.hitIds.add(def.index);
  holder.hits++;
  const from = projectile ? { body: { x: projectile.x - Math.sign(projectile.vx) * 20 }, facing: Math.sign(projectile.vx) || 1 } : att;
  const block = trade ? { ok: false, why: 'trade' } : def.canBlock(from, spec.height);
  const ownHitstop = (n) => { if (!projectile) att.hitstop = n; };
  // Armour (Grizz's charge): absorbs a strike during its window, taking half damage without
  // flinching. Supers and throws break through; the armour holds a limited number of hits.
  const arm = def.state === 'attack' && def.move?.def.armor;
  if (arm && !spec.super && def.move.frame >= arm.from && def.move.frame <= arm.to && (def.move.armorUsed || 0) < arm.hits) {
    def.move.armorUsed = (def.move.armorUsed || 0) + 1;
    holder.contact = 'block';
    const damage = Math.max(1, Math.round(spec.damage * TUNING.armorDamage));
    def.health = Math.max(1, def.health - damage);
    def.flash = 6;
    def.hitstop = spec.hitstop;
    ownHitstop(spec.hitstop);
    note(att, 'ABSORBED by armour');
    return { type: 'armor', who: att.index, target: def.index, x: res.point.x, y: res.point.y, damage };
  }
  if (block.ok) {
    holder.contact = 'block';
    const hs = Math.round(spec.hitstop * TUNING.blockHitstopScale);
    def.receiveBlock(from, spec, hs);
    ownHitstop(hs);
    if (!projectile) cornerPushback(att, def, spec.push.block);
    if (!spec.super) att.gainMeter(spec.damage * TUNING.meterOnBlock);
    def.gainMeter(spec.damage * TUNING.meterOnDamaged * 0.5);
    note(att, `BLOCKED (${block.low ? 'low' : 'high'} guard)`);
    return { type: 'block', who: att.index, target: def.index, x: res.point.x, y: res.point.y, strength: spec.strength, move: spec.id, low: block.low, fire: !!spec.fire };
  }

  holder.contact = 'hit';
  const inStartupOrActive = snap.state === 'attack' && snap.move && snap.moveFrame <= snap.move.startup + snap.move.active;
  const counter = inStartupOrActive && !trade && !projectile;
  const punish = snap.state === 'attack' && !inStartupOrActive;
  const hitN = def.combo.hits + 1;
  const scale = spec.super ? Math.max(0.6, damageScale(hitN)) : damageScale(hitN);
  const partMul = TUNING.partDamage[res.part] ?? 1;
  const dmgMul = att.stats.damage ?? 1;
  const damage = Math.max(1, Math.round(spec.damage * partMul * scale * dmgMul * (counter ? TUNING.counterHitDamage : 1)));
  const decay = spec.comboExempt ? 0 : Math.max(0, hitN - TUNING.hitstunDecayStart) * TUNING.hitstunDecayPerHit;
  const hitstun = Math.max(TUNING.minHitstun, spec.hitstun + (counter ? TUNING.counterHitStun : 0) - decay);
  const hitstop = spec.hitstop + (counter ? TUNING.counterHitHitstop : 0);
  // Counter-hit heavy strikes on a grounded opponent stagger instead of a simple flinch.
  const reaction = counter && spec.reaction === 'heavy' && def.body.onGround ? 'stagger' : spec.reaction;

  def.combo.hits = hitN;
  def.combo.damage += damage;
  def.combo.moves[spec.id] = (def.combo.moves[spec.id] || 0) + 1;
  def.receiveHit(projectile ? from : att, spec, { damage, hitstun, part: res.part, hitstop, counter, reaction });
  ownHitstop(hitstop);
  if (!projectile) cornerPushback(att, def, spec.push.hit);
  // set on fire (Cinder's super): every fire hit restarts the burn timer
  if (spec.burn && def.health > 0) def.burn = Math.max(def.burn, spec.burn);
  if (!spec.super) att.gainMeter(damage * TUNING.meterOnHit);
  def.gainMeter(damage * TUNING.meterOnDamaged);
  note(att, `HIT ${res.part}${counter ? ' COUNTER' : ''}${punish ? ' PUNISH' : ''}${trade ? ' TRADE' : ''} dmg ${damage} stun ${hitstun}`);
  return {
    type: 'hit', who: att.index, target: def.index, x: res.point.x, y: res.point.y,
    strength: spec.strength, move: spec.id, part: res.part, damage, counter, punish, trade,
    combo: hitN, ko: def.health <= 0, shake: spec.shake || 0, dir: projectile ? Math.sign(projectile.vx) : att.facing,
    super: !!spec.super, prop: spec.prop, fire: !!spec.fire, claw: !!spec.claw,
  };
}

/** Counter stance caught a strike: freeze the attacker open and run the parry follow-up. */
function applyParry(att, def, point) {
  att.move.hitIds.add(def.index);
  att.move.hits = 99;
  att.move = null;
  att.hitstop = 14;
  att.flash = 4;
  att.setState('stagger', { duration: 34 }, 'stagger', { blend: 5, params: { duration: 34 } });
  const follow = def.def.moves[def.move.def.followup];
  def.hitstop = 8;
  if (follow) def.startMove(follow, false, true);
  note(def, 'PARRY: counter stance caught a strike');
  return { type: 'parry', who: def.index, target: att.index, x: point.x, y: point.y };
}

/** If the defender is pinned against a wall, the attacker is pushed back instead. */
function cornerPushback(att, def, push) {
  const dirAway = Math.sign(def.body.x - att.body.x) || att.facing;
  if (def.body.wall === dirAway || Math.abs(def.body.x - (dirAway > 0 ? STAGE.right - def.body.pushW : STAGE.left + def.body.pushW)) < 4) {
    if (att.body.onGround) att.body.vx = -dirAway * push * 0.9;
  }
}

// --- projectiles --------------------------------------------------------------------------------

/** Advances projectiles, resolves projectile clashes and hits. Mutates `list`; returns events. */
export function updateProjectiles(list, fighters) {
  const events = [];
  for (const p of list) {
    p.x += p.vx;
    p.life--;
    p.age++;
    if (p.cooldown > 0) p.cooldown--;
    if (p.x < STAGE.left - 50 || p.x > STAGE.right + 50) p.life = 0;
  }
  // projectile vs projectile: they cancel each other out
  for (let i = 0; i < list.length; i++) {
    for (let k = i + 1; k < list.length; k++) {
      const a = list[i], b = list[k];
      if (a.owner === b.owner || a.life <= 0 || b.life <= 0) continue;
      if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r) {
        a.life = b.life = 0;
        events.push({ type: 'clash', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      }
    }
  }
  for (const p of list) {
    if (p.life <= 0 || p.cooldown > 0) continue;
    const owner = fighters[p.owner], def = fighters[1 - p.owner];
    const vol = { a: { x: p.x, y: p.y }, b: { x: p.x, y: p.y }, r: p.r };
    if (def.state === 'thrown') continue;
    const { best } = touch([vol], def);
    if (!best) continue;
    const rej = comboRejection(p.spec, def);
    if (rej) { p.life = 0; continue; }
    p.hitIds.clear(); // multi-hit projectiles may hit again after their interval
    const ev = applyStrike(owner, def, p.spec, { part: best.part, point: { x: p.x, y: p.y } }, snapshotDefender(def), { holder: p, projectile: p });
    events.push(ev);
    p.hitsLeft--;
    p.cooldown = p.interval || 6;
    if (p.hitsLeft <= 0) p.life = 0;
  }
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].life <= 0) {
      events.push({ type: 'projectileEnd', who: list[i].owner, x: list[i].x, y: list[i].y, kind: list[i].kind });
      list.splice(i, 1);
    }
  }
  return events;
}

// --- throws ---------------------------------------------------------------------------------------

const THROWABLE = new Set(['idle', 'walkF', 'walkB', 'crouch', 'guardHigh', 'guardLow', 'run', 'attack', 'land', 'dashF', 'prejump']);

/** Can `f` be grabbed right now? Returns a rejection reason or null. */
export function throwImmunity(f) {
  if (!f.body.onGround) return 'airborne';
  if (!THROWABLE.has(f.state)) return `state ${f.state}`;
  if (f.throwProtect > 0) return 'just recovered (throw protection)';
  if (f.invulnerability() === 'all') return 'invulnerable';
  return null;
}

function grabbing(f) {
  const mv = f.move;
  if (f.state !== 'attack' || !mv || mv.def.type !== 'throw' || mv.grabbed) return false;
  return mv.frame > mv.def.startup && mv.frame <= mv.def.startup + mv.def.active;
}

/** Throw paths: [t (0..1 of release time), x along the thrower's facing, height]. */
const PATHS = {
  throwFwd: [[0, 62, 0], [0.45, 66, 70], [1, 86, 46]],
  throwBack: [[0, 62, 0], [0.5, 8, 140], [1, -76, 50]],
  slam: [[0, 62, 0], [0.45, 34, 150], [1, 78, 6]],
};
const ROT = { throwFwd: 70, throwBack: -170, slam: 100 };

function samplePath(kind, t) {
  const keys = PATHS[kind];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, x0, y0] = keys[i - 1], [t1, x1, y1] = keys[i];
      const k = (t - t0) / (t1 - t0);
      return [lerp(x0, x1, k), lerp(y0, y1, k)];
    }
  }
  return keys[keys.length - 1].slice(1);
}

function tech(a, b, events) {
  for (const [f, o] of [[a, b], [b, a]]) {
    const dir = Math.sign(f.body.x - o.body.x) || -f.facing;
    f.move = null;
    f.body.y = 0;
    f.body.onGround = true;
    f.body.vx = dir * 7;
    f.setState('blockstun', { duration: 18 }, 'blockHigh', { blend: 4, params: { duration: 18 } });
    note(f, 'THROW TECH');
  }
  events.push({ type: 'tech', x: (a.body.x + b.body.x) / 2, y: 160 });
}

/** Grabs, techs, carries and releases throws. Call once per tick after movement. */
export function resolveThrows(fighters) {
  const events = [];
  const [a, b] = fighters;
  // 1) new grabs
  const tries = [];
  for (const [g, o] of [[a, b], [b, a]]) {
    if (!grabbing(g)) continue;
    const m = g.move.def;
    const gap = Math.abs(g.body.x - o.body.x) - g.body.pushW - o.body.pushW;
    const imm = throwImmunity(o);
    if (gap > m.range) { note(g, 'throw whiff: out of range'); continue; }
    if (imm) { note(g, `throw rejected: ${imm}`); continue; }
    tries.push([g, o]);
  }
  if (tries.length === 2) {
    tech(a, b, events); // simultaneous throws break each other
  } else if (tries.length === 1) {
    const [g, o] = tries[0];
    const m = g.move.def;
    g.move.grabbed = true;
    const kind = m.throwAnim === 'throwFwd' && g.holdingAwayFrom(o.body.x) ? 'throwBack' : m.throwAnim;
    g.move = null;
    g.setState('throwing', { target: o.index, def: m, kind }, 'throwing', { blend: 3, params: { kind, duration: m.duration } });
    o.move = null;
    o.setState('thrown', { by: g.index, techable: m.techable, rot: 0 }, 'thrown', { blend: 4 });
    note(g, `THROW grabbed (${kind})`);
    events.push({ type: 'grab', who: g.index, target: o.index, x: o.body.x, y: 150 });
  }
  // 2) carry / tech / release
  for (const [g, o] of [[a, b], [b, a]]) {
    if (g.state !== 'throwing' || o.state !== 'thrown' || o.sd.by !== g.index) continue;
    const m = g.sd.def;
    const f = g.stateFrame;
    if (o.sd.techable && f <= TUNING.throwTechWindow && o.input.pressed('lp', TUNING.throwTechWindow) && o.input.pressed('lk', TUNING.throwTechWindow)) {
      o.input.consume('lp');
      o.input.consume('lk');
      tech(g, o, events);
      continue;
    }
    const t = clamp(f / m.release, 0, 1);
    const [px, py] = samplePath(g.sd.kind, t);
    o.body.x = clamp(g.body.x + g.facing * px * g.props.posScale, STAGE.left + o.body.pushW, STAGE.right - o.body.pushW);
    o.body.y = py;
    o.body.vx = o.body.vy = 0;
    o.body.onGround = py <= 0;
    o.sd.rot = ROT[g.sd.kind] * t;
    if (f === m.release) events.push(...releaseThrow(g, o, m));
  }
  return events;
}

function releaseThrow(g, o, m) {
  const kind = g.sd.kind;
  const dir = kind === 'throwBack' ? -g.facing : g.facing;
  const hitN = o.combo.hits + 1;
  const damage = Math.max(1, Math.round(m.damage * damageScale(hitN) * (g.stats.damage ?? 1)));
  o.combo.hits = hitN;
  o.combo.damage += damage;
  o.health = Math.max(0, o.health - damage);
  o.stun += m.stun || 0;
  o.flash = 6;
  g.hitstop = o.hitstop = 10;
  g.gainMeter(damage * TUNING.meterOnHit);
  o.gainMeter(damage * TUNING.meterOnDamaged);
  const b = o.body;
  b.onGround = false;
  b.vy = kind === 'slam' ? 4 : 7.5;
  b.vx = (dir * (kind === 'slam' ? 2 : 7)) / b.mass;
  if (o.health <= 0) o.setState('ko', {}, 'airHit', { blend: 6, params: { launch: true, rot0: o.anim.pose.rot } });
  else o.setState('juggle', { knockdown: true }, 'airHit', { blend: 6, params: { launch: false, rot0: o.anim.pose.rot } });
  note(g, `THROW released dmg ${damage}`);
  return [{ type: 'hit', who: g.index, target: o.index, x: o.body.x, y: o.body.y + 80, strength: 'heavy', move: m.id, part: 'torso',
    damage, combo: hitN, ko: o.health <= 0, shake: 8, dir, throw: true }];
}
