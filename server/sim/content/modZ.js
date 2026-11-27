// server/sim/content/modZ.js — (Fish Edition) the battle effects of Mod Z / W (shared/modZ.js; Fish's designs in
// fish-edition/operator-mod-z/*.md). The stats and granted bonds come with the module record; everything else is here,
// installed per unit by Battle._setupUnit (battle/players.js) after the kit, keyed by the active module's id.
//
// DRAFT (2026-11-13): written for the code-compatibility check — every effect is wired with the engine's existing hooks
// and helpers, and each [DRAFT] note marks an approximation or a number Fish's text leaves open. Nothing here runs unless
// the room has the `modZ` rule (a pick naming a Mod Z / W is swapped for the first official module otherwise).

import { modZOf } from '../../../shared/modZ.js';
import { up, skillBusy, isMainHit, holdProtect, PROTECT_TICK_HOLD, enemyInRange } from './kits/shared/tier1.js';
import { installLordArtsAddition } from './kits/shared/lord.js';
import { memberOf } from './items/battle.js';
import { ASPD_MAX, COLS } from '../constants.js';
import { hypot, powi } from '../detmath.js';
import { gainLayers, unitBonds, bondActive as bondOn } from './support/index.js';

const KEY = 'fishModZ';
/** Viviana V: the share (per cent) of the player's boss-pool damage Glimmering Touch adds: the base and one more per combo. */
export const VVANA_V = { base: 10, mly: 20, nearl: 60, deg: 40, delay: 25, lock: 0.7 };
const isBursting = (e) => e.buffs.some((b) => typeof b.key === 'string' && b.key.endsWith('Burst'));
/** ATK above base, as a fraction (0.25 = +25 %). */
const atkGain = (u) => (u.base.atk > 0 ? Math.max(0, u.s.atk / u.base.atk - 1) : 0);

/**
 * 提丰 Mod Z: the ATK % bonus (×100) and the ASPD bonus summed and split evenly; ASPD's share at most +500 (and the
 * engine's ASPD cap), the rest on ATK. A total below 0 (debuffs) is split the same way.
 */
export function typhonBalance({ atk, aspd, baseAtk, baseAspd }) {
  if (!(baseAtk > 0)) return { atk, aspd };
  const total = (atk / baseAtk - 1) * 100 + (aspd - baseAspd);
  const sp = Math.min(total / 2, 500, ASPD_MAX - baseAspd);
  return { atk: baseAtk * (1 + (total - sp) / 100), aspd: baseAspd + sp };
}

/** 左乐 Mod Z: the ATK he gains from buffs counts twice (a loss is unchanged). */
export function zuoleDouble({ atk, aspd, baseAtk }) {
  return { atk: atk > baseAtk ? baseAtk + 2 * (atk - baseAtk) : atk, aspd };
}

/** Keep buff `key` on `unit` with `mods()` while `cond()` holds, re-evaluated every tick (mods may change). */
function liveBuff(battle, unit, key, cond, mods, extra = {}) {
  const check = () => {
    if (!up(unit) || !cond()) { if (unit.findBuff(key)) battle.removeBuff(unit, key); return; }
    const m = mods();
    const cur = unit.findBuff(key);
    if (cur && JSON.stringify(cur.mods) === JSON.stringify(m)) return;
    battle.addBuff(unit, { key, mods: m, tags: ['module'], ...extra });
  };
  battle.on('tick', check, { owner: unit });
  battle.on('battleStart', check, { owner: unit });
}

/** Extra natural SP recovery of `perSec()` per second (hooks the per-tick 'time' SP gain). */
function spTime(battle, unit, perSec) {
  battle.on('spGain', (ctx) => {
    if (ctx.unit !== unit || ctx.reason !== 'time') return;
    const v = perSec();
    if (v > 0) ctx.amount += v * battle.dt;
  }, { owner: unit });
}

/** Redeploy timers of `ownerId`'s waiting operators run `rate()` faster (+0.5 = +50 %) while `cond()` holds. */
function fasterRedeploy(battle, unit, rate, cond = () => up(unit)) {
  battle.on('tick', () => {
    if (!cond()) return;
    const r = rate();
    if (!(r > 0)) return;
    for (const a of battle.units) {
      if (a.kind !== 'op' || a.ownerId !== unit.ownerId || a.deployed || !(a.respawnAt > battle.time)) continue;
      a.respawnAt = Math.max(battle.time, a.respawnAt - r * battle.dt);
    }
  }, { owner: unit });
}

/** "The first time the skill ends in a battle, immediately gain max SP" (Typhon Z, Thorns Z; once per battle). */
function maxSpAtFirstSkillEnd(battle, u) {
  let done = false;
  battle.on('skillEnd', (c) => {
    const sk = u.skill;
    if (c.unit !== u || done || !sk || sk.noSkill || sk.kind === 'passive') return;
    done = true;
    sk.gainSp(Math.max(0, sk.spCost - sk.sp), 'module', false, { ignoreLock: true });
  }, { owner: u });
}

/** +`n` stacks to each of `u`'s own Alliances that is active, at most `times` triggers per battle (counted by the caller). */
const stackOwn = (battle, u, n) => gainLayers(battle, { playerId: u.ownerId, bonds: unitBonds(u), n, requireActive: true, source: u, reason: 'module' });

/** The skill index (0-based) the loadout picked. */
const skillIndex = (u) => {
  const i = u.def?.raw?.skill?.index ?? u.def?.loadout?.skillIndex;
  return Number.isInteger(i) ? i : null;
};

const INSTALL = {
  // ATK and ASPD balanced (+1 % ATK = +1 ASPD): the ATK % and ASPD bonuses are summed and split evenly, the ASPD half
  // capped at +500 (the excess stays on ATK); ASPD +100 from 10 s after each deployment (in the sum). Applied last in
  // the stat stack (units.js fishStatPost), so it follows every buff and debuff as they change.
  uniequip_fishz_typhon(battle, u) {
    let since = Infinity;
    battle.on('deploy', (c) => { if (c.unit === u) since = battle.time; }, { owner: u });
    liveBuff(battle, u, `${KEY}:typhonZ`, () => battle.time - since >= 10, () => ({ aspd: 100 }));
    u.fishStatPost = typhonBalance;
    u.markDirty();
    maxSpAtFirstSkillEnd(battle, u);
  },

  // attacks inflict Cold; on a Frozen target, shatter every enemy within 1 tile: Freeze removed, Stun 4 s, physical
  // damage taken +40 % for 4 s. [DRAFT: Cold lasts 3 s — the text names no duration.]
  uniequip_fishw_typhon(battle, u) {
    battle.on('hit', (c) => {
      if (c.source !== u || c.target?.side !== 'enemy' || !isMainHit(c.dmg)) return;
      const t = c.target;
      if (!t.findBuff('freeze')) { battle.applyStatus(t, 'cold', { duration: 3, source: u }); return; }
      for (const e of battle.foesInRadius(t.x, t.y, 1)) {
        battle.removeStatus(e, 'freeze');
        battle.applyStatus(e, 'stun', { duration: 4, source: u });
        battle.addBuff(e, { key: `${KEY}:shatter`, duration: 4, mods: { physTakenMul: 1.4 }, source: u, tags: ['module'] });
      }
    }, { owner: u });
    // v2: in a normal battle (no boss rounds, no unite phase) the first 30 enemies that die while she is on the field are added
    // to the wave again on their own route: +100 % max HP, -70 % ATK, no LP when they leak, not passed on to the unite phase,
    // no bounty. A revived enemy does not come back a second time. [DRAFT: only while she is on the field]
    let revived = 0;
    battle.on('death', (c) => {
      const e = c.unit;
      if (!e || e.side !== 'enemy' || revived >= 30 || !up(u) || battle.kind !== 'normal' || e.isBoss || e.tag || e.fishRevived || e.uniteRuntime) return;
      const n = battle.spawnEnemy(e.defId, { routeIndex: e.routeIndex ?? 0, mods: { hpMul: 2, atkMul: 0.3 }, countInTotal: false, ownerPlayerId: e.ownerId, sourcePlayerId: e.sourcePlayerId ?? undefined });
      if (!n) return;
      revived++;
      n.fishRevived = true;
      n.uniteRuntime = true;
      n.lpr = 0;
    }, { owner: u });
  },

  // Kal'tsit Esperanta: Physical and Arts damage taken ×0.5 (a plain multiplier with every other damage-taken effect: she has no
  // other damage reduction, Fish 2026-11-24); at the battle's start she and every operator of her player that shares at least one
  // alliance with her (the alliances she was granted count; 协防干员 is no alliance) gain 10 SP. The granted alliances come from the
  // match (grantedBonds, unitBonds).
  uniequip_fishz_kalts2(battle, u) {
    liveBuff(battle, u, `${KEY}:kalts2`, () => true, () => ({ physTakenMul: 0.5, artsTakenMul: 0.5 }));
    battle.on('battleStart', () => {
      const mine = new Set(unitBonds(u).filter((b) => b !== 'emptyShip'));
      for (const a of battle.units) {
        if (a.kind !== 'op' || a.side !== 'ally' || a.ownerId !== u.ownerId || !a.skill || a.skill.noSkill) continue;
        if (a !== u && !unitBonds(a).some((b) => mine.has(b))) continue;
        a.skill.gainSp(10, 'init');
      }
    }, { owner: u });
  },

  // enemies she damages are marked; at the end of a skill, 17 SP per marked enemy that fell during it
  uniequip_fishz_poca(battle, u) {
    const marked = new WeakSet();
    let during = false, fell = 0;
    battle.on('hit', (c) => { if (c.source === u && c.target?.side === 'enemy') marked.add(c.target); }, { owner: u });
    battle.on('skillStart', (c) => { if (c.unit === u) { during = true; fell = 0; } }, { owner: u });
    battle.on('death', (c) => { if (during && c.unit?.side === 'enemy' && marked.has(c.unit)) fell++; }, { owner: u });
    battle.on('skillEnd', (c) => {
      if (c.unit !== u) return;
      during = false;
      if (fell > 0 && u.skill && !u.skill.noSkill) u.skill.gainSp(17 * fell, 'module');
      fell = 0;
    }, { owner: u });
  },

  // 3×3 range; SP +1/s while an enemy is in range; the start of S2 / S3 (not S1) lures every enemy in range to her
  // until the skill ends; DEF + the ATK she gains (at most +5000)
  uniequip_fishz_zumama(battle, u) {
    u.rangeGrid = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 0], [0, 1], [1, -1], [1, 0], [1, 1]];
    if (u.deployed) battle._refreshRange(u);
    spTime(battle, u, () => (up(u) && !skillBusy(u) && enemyInRange(battle, u) ? 1 : 0));
    let lured = [];
    battle.on('skillStart', (c) => {
      if (c.unit !== u || skillIndex(u) === 0) return;
      lured = battle.enemiesInKeys(u.rangeKeys, u, { canHitFly: true });
      for (const e of lured) battle.applyStatus(e, 'attract', { duration: 60, source: u, point: { x: u.x, y: u.y } });
    }, { owner: u });
    battle.on('skillEnd', (c) => {
      if (c.unit !== u) return;
      for (const e of lured) if (e.alive) battle.removeStatus(e, 'attract');
      lured = [];
    }, { owner: u });
    // an enemy that dies in her range: +3 stacks to all her active Alliances (20 times per battle at most)
    let kills = 0;
    battle.on('death', (c) => {
      const e = c.unit;
      if (!e || e.side !== 'enemy' || kills >= 20 || !up(u)) return;
      const keys = u.rangeKeySet || new Set(u.rangeKeys);
      if (!keys.has(Math.round(e.y) * COLS + Math.round(e.x))) return;
      kills++;
      stackOwn(battle, u, 3);
    }, { owner: u });
    liveBuff(battle, u, `${KEY}:zumama`, () => true, () => ({ defFlat: Math.min(5000, Math.max(0, Math.round(u.s.atk - u.base.atk))) }));
  },

  // every skill an ammo skill (24 / 4 / 200 attacks: S1 her normal attacks, S2 / S3 one shell per ammo); during it,
  // ASPD +100 and max HP +100 %; when a [Laterano] Operator on one of the 4 tiles around her finishes a skill while hers is
  // active, she reloads to max ammo; every [Laterano] Operator gets x2 (x3 at 500+ stacks) of the Laterano ATK effect
  // (bonds/core.js installLaterano reads `fishLateranoMul`)
  uniequip_fishz_phenxi(battle, u) {
    const sk = u.skill;
    const i = skillIndex(u);
    const ammo = [24, 4, 200][i ?? -1];
    if (sk && !sk.noSkill && ammo && sk.kind !== 'passive') {
      const was = sk.kind;
      sk.kind = 'ammo';
      sk.ammo = ammo;
      sk.duration = 0;   // no time cap: the skill ends when the ammo runs out [DRAFT]
      // one ammo, as Skill.onAttackPerformed spends it (the `ammoUsed` hook: 拉特兰's per-ammo ATK, bonds/core.js)
      const spend = () => {
        if (!sk.active || sk.kind !== 'ammo') return;
        sk.ammoLeft--;
        if (battle._hooks.ammoUsed) battle.emit('ammoUsed', { unit: u, left: sk.ammoLeft, skill: sk });
        if (sk.ammoLeft <= 0) sk.end('ammo');
      };
      const spec = sk.spec;
      if (was === 'instant' && typeof spec.onStart === 'function') {
        // S2: one 灼痕弹 per ammo (the cast's own shell first), one per attack interval, in place of her attacks
        const shell = spec.onStart;
        let cd = 0;
        sk.spec = { ...spec, attack: { noAttack: true },
          onStart(ctx) { shell(ctx); cd = u.s.interval; spend(); },
          onTick(ctx) {
            if (!u.canAct || u.s.flags.disarm) return;
            cd -= ctx.dt;
            if (cd > 1e-9) return;
            cd = u.s.interval;
            shell(ctx);
            spend();
          } };
      } else if (was === 'toggle' && typeof spec.onTick === 'function') {
        // S3: its shells are fired from onTick (her attack cycle); each one spends an ammo
        const tick = spec.onTick;
        sk.spec = { ...spec, onTick(ctx) {
          const before = u.mem.phenxiCd ?? 0;
          tick(ctx);
          if ((u.mem.phenxiCd ?? 0) > before + 1e-9) spend();
        } };
      }
    }
    liveBuff(battle, u, `${KEY}:phenxi`, () => !!(u.skill && u.skill.active), () => ({ aspd: 100, hpMul: 2 }));
    u.fishLateranoMul = true;
    battle.on('skillEnd', (c) => {
      const o = c.unit;
      if (!o || o === u || o.side !== u.side || !up(u) || !sk || !sk.active || sk.kind !== 'ammo') return;
      if (Math.abs(o.tileR - u.tileR) + Math.abs(o.tileC - u.tileC) !== 1 || !memberOf(battle, o, 'lateranoShip')) return;
      sk.ammoLeft = sk.ammo;
    }, { owner: u });
  },

  // per attack: max HP +50 and 庇护 +1 % (80 stacks, kept through retreats); per deployment: one Waxing stack (10 at
  // most): healing received +20 %, ASPD +20 Tenacity (坚忍, as his talent: in full at 70 % HP lost, linear before; Tenacity doesn't stack, the
  // highest counts, so this only adds what exceeds his talent's), and
  // Corrosion of 1 % ATK on each hit, per stack
  uniequip_fishz_helage(battle, u) {
    const p = (u.persist[KEY] ??= { stacks: 0, wax: 0 });
    const apply = () => {
      battle.addBuff(u, {
        key: `${KEY}:helage`, persist: true, allowDead: true, tags: ['module'],
        mods: { hpFlat: 50 * p.stacks, healingTakenMul: 1 + 0.2 * p.wax },
      });
    };
    battle.on('attack', (c) => { if (c.attacker === u && p.stacks < 80) { p.stacks++; apply(); } }, { owner: u });
    battle.on('deploy', (c) => { if (c.unit === u && !c.move) { p.wax = Math.min(10, p.wax + 1); apply(); } }, { owner: u });
    const tenKey = `${KEY}:helage:tenacity`;
    battle.on('tick', () => {
      const cur = u.findBuff(tenKey);
      const talent = u.findBuff('talent:helage:berserk')?.data?.v ?? 0;
      const v = up(u) ? Math.max(0, 20 * p.wax * Math.max(0, Math.min(1, (1 - u.hpRatio) / 0.7)) - talent) : 0;
      if (cur && Math.abs((cur.data?.v ?? 0) - v) < 0.05) return;
      if (v < 0.05) { if (cur) battle.removeBuff(u, tenKey); return; }
      battle.addBuff(u, { key: tenKey, mods: { aspd: v }, data: { v }, tags: ['module'] });
    }, { owner: u });
    battle.on('tick', () => { if (up(u) && p.stacks > 0) holdProtect(battle, u, p.stacks * 0.01, PROTECT_TICK_HOLD, u); }, { owner: u });
    battle.on('hit', (c) => {
      if (c.source !== u || c.target?.side !== 'enemy' || c.dmg.type === 'element' || !(p.wax > 0)) return;
      battle.dealElementDamage({ source: u, target: c.target, element: 'erosion', amount: u.s.atk * 0.01 * p.wax, tags: ['module'] });
    }, { owner: u });
  },

  // Raid treats his skill as ready (bonds/addon/battle.js reads `fishRaidReady`)
  // and, each time he is deployed or redeployed, +3 stacks to all his active Alliances (10 times per battle at most)
  uniequip_fishz_phatom(battle, u) {
    u.fishRaidReady = true;
    let n = 0;
    battle.on('deploy', (c) => { if (c.unit === u && !c.move && n < 10) { n++; stackOwn(battle, u, 3); } }, { owner: u });
  },

  // block 0, always Invisible; DP she earns ×2; while she is on the field, her player's redeploy timers run +50 %
  // faster (+300 % during her skill)
  uniequip_fishz_sleach(battle, u) {
    battle.addBuff(u, { key: `${KEY}:sleach`, persist: true, allowDead: true, mods: { blockCnt: -999 }, flags: { stealth: true }, tags: ['module'] });
    u.fishDpMul = 2;
    fasterRedeploy(battle, u, () => (skillBusy(u) ? 3 : 0.5));
  },

  // Immortality has two states (Fish): READY (granted: no expiry) → ACTIVE when its holder would die: HP can't go below 1 for 8 s.
  // Only ready → active grows her grant cooldown (+5 s, starts at 0); the grant itself doesn't. At the start of the battle every
  // Operator of her player is granted READY; her heals grant it when the cooldown is over (a full-HP ally is a heal target too,
  // those without Immortality first: `fishHealPriority`, battle/queries.js). No stacking: nobody holds two.
  uniequip_fishz_shining(battle, u) {
    const READY = `${KEY}:immortalReady`, ACTIVE = `${KEY}:immortal`;
    let cd = 0, readyAt = 0;
    const has = (a) => !!(a.findBuff(READY) || a.findBuff(ACTIVE));
    const grantable = () => battle.time >= readyAt;
    const grant = (a) => { if (!a || a.side === 'enemy' || !a.alive || has(a)) return false; battle.addBuff(a, { key: READY, source: u, visible: true, tags: ['module'] }); return true; };
    u.fishHealFull = (a) => grantable() && !has(a);
    u.fishHealPriority = (a) => (grantable() && !has(a) ? 0 : 1);
    battle.on('battleStart', () => { for (const a of battle.allies(u.ownerId)) if (a.kind === 'op') grant(a); }, { owner: u });
    battle.on('heal', (c) => {
      if (c.source !== u || !c.target || !grantable()) return;
      if (grant(c.target)) readyAt = battle.time + cd;
    }, { owner: u });
    battle.on('fatal', (c) => {
      const a = c.unit;
      if (c.prevented || !a?.findBuff) return;
      if (a.findBuff(ACTIVE)) { c.prevented = true; return; }
      const r = a.findBuff(READY);
      if (!r || r.source !== u) return;
      battle.removeBuff(a, READY);
      battle.addBuff(a, { key: ACTIVE, duration: 8, source: u, visible: true, tags: ['module'] });
      c.prevented = true;
      cd += 5;
    }, { owner: u, priority: -10 });
  },

  // DP he earns ×2; DP above 90 is drained, each 1 DP giving 1 SP to every ally of his player [DRAFT: drained at once
  // every 0.5 s; "持续消耗" names no rate]
  uniequip_fishz_siege(battle, u) {
    u.fishDpMul = 2;
    // GitHub #176: while she is up, her player's DP cap is 999, so a gain between two drains is never wasted at the usual
    // 99 (Fish's suggestion: "Siege Mod Z also raises DP cap to 999")
    battle.every(0.5, () => {
      const ps = battle.getPlayer(u.ownerId);
      if (ps) ps.fishDpMax = up(u) ? 999 : 0;
      if (!up(u)) return;
      const extra = Math.floor((ps?.dp ?? 0) - 90);
      if (!(extra > 0)) return;
      battle.addDp(u.ownerId, -extra);
      for (const a of battle.allies(u.ownerId)) if (a.skill && !a.skill.noSkill && !skillBusy(a)) a.skill.gainSp(extra, 'module');
    }, { owner: u });
  },

  // Siege W: as Z (DP limit 999 on the field, DP ×2) but DP above 90 is drained into [Marvel] stacks, 1 stack per 3 DP, at
  // most 50 stacks a round [DRAFT: the cap is on what she converts: once it is reached she stops draining]
  uniequip_fishw_siege(battle, u) {
    u.fishDpMul = 2;
    let made = 0;
    battle.every(0.5, () => {
      const ps = battle.getPlayer(u.ownerId);
      if (ps) ps.fishDpMax = up(u) ? 999 : 0;
      if (!up(u) || !ps) return;
      const n = Math.min(Math.floor((ps.dp - 90) / 3), 50 - made);
      if (!(n > 0)) return;
      battle.addDp(u.ownerId, -3 * n);
      made += gainLayers(battle, { playerId: u.ownerId, bonds: 'miraShip', n, requireActive: false, source: u, reason: 'module' });
    }, { owner: u });
  },

  // Saileach W: after each skill cast, if [Aid] is active every active Alliance gains +2 stacks, +4 with 3 or more different
  // [Aid] Operators on the field (the official Aid effect, per cast instead of per round)
  uniequip_fishw_sleach(battle, u) {
    battle.on('skillStart', (c) => {
      if (c.unit !== u || !bondOn(battle, u.ownerId, 'deputShip')) return;
      const aid = new Set();
      for (const a of battle.allies(u.ownerId)) if (a.kind === 'op' && a.deployed && unitBonds(a).includes('deputShip')) aid.add(a.defId);
      const bonds = Object.keys(battle.getPlayer(u.ownerId)?.bonds ?? {});
      gainLayers(battle, { playerId: u.ownerId, bonds, n: aid.size >= 3 ? 4 : 2, requireActive: true, source: u, reason: 'module' });
    }, { owner: u });
  },

  // poison (talent 神经腐蚀) ticks 3× as often (kits/ops/op-thorns.js reads `fishPoisonTickMul`); range +1; during the
  // skill range +1 more, +1 target and Invisible; attacks also deal 20 % ATK Arts and 5 % ATK Nervous Impairment
  uniequip_fishz_thorns(battle, u) {
    battle.addBuff(u, { key: `${KEY}:thorns`, persist: true, allowDead: true, mods: { rangeExtend: 1 }, tags: ['module'] });
    liveBuff(battle, u, `${KEY}:thornsSkill`, () => skillBusy(u), () => ({ rangeExtend: 1, maxTargets: 1 }), { flags: { stealth: true } });
    u.fishPoisonTickMul = 3;
    maxSpAtFirstSkillEnd(battle, u);
    installLordArtsAddition(battle, u, (c) => (isMainHit(c.dmg) ? 0.2 : 0), ['module', 'addition']);
    battle.on('damageCalculate', (c) => {
      if (c.source !== u || !c.target?.alive || c.target.side !== 'enemy' || !isMainHit(c.dmg)) return;
      battle.dealElementDamage({ source: u, target: c.target, element: 'neural', amount: u.s.atk * 0.05, tags: ['module'] });
    }, { owner: u });
  },

  // while she lives, every enemy's weight −2; her damage to an enemy not in an element burst becomes Corrosion; per
  // +10 % ATK (99 at most): SP +0.02/s and the Water Cannon's redeploy time −1 % (kits/ops/op-weedy.js reads
  // `fishCannonRedeployMul` when the cannon leaves) [DRAFT: the ATK at that moment counts]
  uniequip_fishz_weedy(battle, u) {
    battle.every(0.5, () => {
      if (!u.alive || !u.deployed) return;
      for (const e of battle.aliveEnemies()) battle.addBuff(e, { key: `${KEY}:weedyMass`, duration: 0.6, mods: { massFlat: -2 }, source: u, tags: ['module'] });
    }, { owner: u, immediate: true });
    battle.on('hit', (c) => {
      if (c.source !== u || c.target?.side !== 'enemy' || c.dmg.type === 'element' || c.dmg.cancel || isBursting(c.target)) return;
      c.dmg.cancel = true;
      battle.dealElementDamage({ source: u, target: c.target, element: 'erosion', amount: c.dmg.amount, tags: ['module'] });
    }, { owner: u, priority: -10 });
    const steps = () => Math.min(99, Math.floor(atkGain(u) * 10 + 1e-9));
    spTime(battle, u, () => (up(u) && !skillBusy(u) ? 0.02 * steps() : 0));
    u.fishCannonRedeployMul = 1;
    battle.on('tick', () => { if (up(u)) u.fishCannonRedeployMul = 1 - 0.01 * steps(); }, { owner: u });
  },
  // Weedy W: skill SP requirement -30 % (added to similar effects, e.g. 绝技's); every skill activation gives every enemy on the
  // field one Slippery stack (5 at most, for good): weight -1 per stack, and every 0.5 s an enemy touching a red box (an enemy
  // route's start tile) takes 1000 / 2000 / 4000 / 8000 / 16000 true damage; and her Water Cannon's cooldown is set to 1 s
  // when more than 1 s is left. [Slippery goes only on the enemies already on the field when the skill is activated]
  uniequip_fishw_weedy(battle, u) {
    const SLIP = `${KEY}:slippery`;
    battle.on('battleStart', () => {
      const sk = u.skill;
      if (sk && !sk.noSkill && sk.kind !== 'passive') sk.spCostMul = Math.max(0, sk.spCostMul - 0.3);
    }, { owner: u });
    battle.on('skillStart', (c) => {
      if (c.unit !== u) return;
      for (const e of battle.aliveEnemies()) {
        const k = Math.min(5, (e.findBuff(SLIP)?.data?.k ?? 0) + 1);
        battle.addBuff(e, { key: SLIP, mods: { massFlat: -k }, data: { k }, source: u, tags: ['module'] });
      }
      for (const t of battle.allyUnits) {
        const w = t.kind === 'token' && t.defId === 'token_10009_weedy_cannon' && t.ownerUnit === u ? t.fishCannonWait : null;
        if (w && !t.alive && w.at - battle.time > 1) w.at = battle.time + 1;
      }
    }, { owner: u });
    battle.every(0.5, () => {
      for (const e of battle.aliveEnemies()) {
        const k = e.findBuff(SLIP)?.data?.k;
        if (!k || !battle.routes.some((r) => r.start && hypot(e.x - r.start[1], e.y - r.start[0]) <= 0.75)) continue;
        battle.dealDamage({ source: u, target: e, amount: 1000 * powi(2, k - 1), type: 'true', attackType: 'ADDITION', applyWay: 'NONE',
          calculation: 'precomputed', tags: ['module', 'fishSlippery'] });
      }
    }, { owner: u });
  },

  // Glimmering Touch (cooldown 12 s, ready at once): an enemy in the range of any of her player's 卡西米尔 operators
  // (leaders first) is marked; 7 s later its tile explodes (5×5 diamond): 300 % ATK Burn and 300 % ATK Arts — the Arts
  // 600 % ATK × the living 卡西米尔 operators on an enemy already in a Burn burst. Any enemy's Burn burst: RES −2,
  // 10 times at most, kept after she falls (one battle-wide handler). [DRAFT: placeholder fx — the official boss's
  // effects aren't in the assets; "living" = deployed and alive; the target is the first in sortEnemyTargets order]
  uniequip_fishz_vvana(battle, u) {
    installVvanaRes(battle);
    const kaz = () => battle.units.filter((a) => a.kind === 'op' && a.ownerId === u.ownerId && a.alive && a.deployed && memberOf(battle, a, 'kazimierzShip'));
    let readyAt = 0;
    battle.on('tick', () => {
      if (!up(u) || battle.time < readyAt) return;
      let pick = null;
      for (const op of kaz()) {
        for (const e of battle.enemiesInKeys(op.rangeKeys, op, { canHitFly: true })) {
          if (!e.alive || (pick && (pick.gaugeMax >= e.gaugeMax))) continue;
          pick = e;
        }
      }
      if (!pick) return;
      readyAt = battle.time + 12;
      const tx = Math.round(pick.x), ty = Math.round(pick.y);
      // the warning is the 13 tiles of the diamond it will hit (a round 'zone' ring showed no diamond: GitHub #175)
      const diamond = [];
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) if (Math.abs(dr) + Math.abs(dc) <= 2) diamond.push([ty + dr, tx + dc]);
      battle.fx('telegraph', { x: tx, y: ty, r: 2.5, dur: 7, tiles: diamond, id: u.id, skill: 'fishVvana' });
      battle.after(7, () => {
        if (!u.alive) return;   // [DRAFT: the explosion needs her alive; her ATK at detonation]
        const n = kaz().length;
        battle.fx('aoe', { x: tx, y: ty, radius: 2, id: u.id, skill: 'fishVvana' });
        for (const e of battle.aliveEnemies()) {
          if (Math.abs(Math.round(e.x) - tx) + Math.abs(Math.round(e.y) - ty) > 2) continue;
          const burning = !!e.findBuff('burnBurst');
          battle.dealDamage({ source: u, target: e, amount: u.s.atk * (burning ? 6 * n : 3), type: 'arts',
            attackType: 'ADDITION', applyWay: 'NONE', calculation: 'precomputed', tags: ['module', 'fishVvana'] });
          if (e.alive) battle.dealElementDamage({ source: u, target: e, element: 'burn', amount: u.s.atk * 3, tags: ['module', 'fishVvana'] });
        }
      }, { owner: u });
    }, { owner: u });
  },

  // Viviana W: [Durable] + [Agile]; her damage type is Physical; every other [Kazimierz] Operator on the field has as much +ASPD as
  // she has (all of it: Agile, the S2 steal, items; the copy is not read back); her attacks add 10 % ATK Corrosion; each Corrosion
  // burst on an enemy takes another 150 DEF for good (no limit) and gives it a stack of Illuminated (10 at most: DEF -5 %,
  // Physical damage taken +5 % each, for good) [DRAFT: the stacks come only while she is on the field, what is on the enemy stays;
  // the percentage DEF applies after the flat loss, as Meteor's does (units.js: (base + flat) x (1 + pct))]
  uniequip_fishw_vvana(battle, u) {
    if (u.profile) u.profile.dmgType = 'phys';
    const COPY = `${KEY}:vvanaCopy`, given = new Map();
    battle.on('tick', () => {
      const want = up(u) ? Math.max(0, Math.round(u.s.aspd - (u.base.aspd ?? 100))) : 0;
      for (const a of battle.units) {
        if (a.kind !== 'op' || a === u || a.ownerId !== u.ownerId) continue;
        const v = want > 0 && a.alive && a.deployed && memberOf(battle, a, 'kazimierzShip') ? want : 0;
        if ((given.get(a) ?? 0) === v) continue;
        given.set(a, v);
        if (v > 0) battle.addBuff(a, { key: COPY, mods: { aspd: v }, tags: ['module'] });
        else if (a.findBuff(COPY)) battle.removeBuff(a, COPY);
      }
    }, { owner: u });
    battle.on('hit', (c) => {
      if (c.source !== u || c.target?.side !== 'enemy' || !c.target.alive || !isMainHit(c.dmg) || c.dmg.tags?.includes('fishVvanaW')) return;
      battle.dealElementDamage({ source: u, target: c.target, element: 'erosion', amount: u.s.atk * 0.1, tags: ['module', 'fishVvanaW'] });
    }, { owner: u });
    const bursts = new WeakMap();
    battle.on('elementBurst', (c) => {
      const e = c.target;
      if (c.element !== 'erosion' || !e || e.side !== 'enemy' || !e.alive || !up(u)) return;
      const n = (bursts.get(e) ?? 0) + 1;
      bursts.set(e, n);
      const k = Math.min(10, n);
      battle.addBuff(e, { key: `${KEY}:vvanaW`, mods: { defFlat: -150 * n, defPct: -0.05 * k, physTakenMul: powi(1.05, k) }, tags: ['module'] });
    }, { owner: u });
  },

  // Viviana V (Kazimierz endgame): no Alliance of her own. Glimmering Touch (cooldown 50 s, ready at once): an enemy in the range
  // of any of her player's [Kazimierz] operators (leaders first) is marked; 25 s later its tile explodes (5x5 diamond; the aim follows the enemy to its new tile until the last 0.7 s, VVANA_V.lock, and re-picks if it dies), 1500 % ATK
  // Physical plus VVANA_V percent of the damage her player's units dealt to the boss pool meanwhile (the player's own `bossDamage`
  // counter, the explosion's own damage excluded because the baseline is read when it is queued: nothing outside a boss round).
  // Combos need that operator on the field this battle (alive or fallen), Viviana too; they last the whole battle:
  //   Mlynar: always full Liberator charge; every [Kazimierz] operator +30 ASPD.   Nearl (the Radiant Knight): she and Viviana
  //   attack what the other's range covers; every [Kazimierz] operator +30 % max HP.   Degenbrecher: Raid redeploys after 1 s
  //   (all the player's Raid members), he may land on ranged tiles; every [Kazimierz] operator +30 % ATK.
  // [DRAFT: the explosion still goes off if she falls meanwhile; the recorded share is computed at detonation; the free Nearl, the
  // Alliances given to the three and the boss-body landing are match-level pieces (PlayerState), not here]
  uniequip_fishv_vvana(battle, u) {
    const MLY = 'char_4064_mlynar', NEARL = 'char_1014_nearl2', DEG = 'char_4116_blkkgt';
    const charOf = (a) => a.def?.charId ?? a.def?.raw?.charId ?? null;
    const mine = () => battle.units.filter((a) => a.kind === 'op' && a.ownerId === u.ownerId);
    const has = {};
    const BUFF = `${KEY}:vvanaV`, given = new Map();
    const fieldedRaid = battle.fishRaidIdle ??= new Map();
    let unionKey = '';
    const syncCombos = () => {
      const all = mine();
      has.mly = all.find((a) => charOf(a) === MLY) ?? null;
      has.nearl = all.find((a) => charOf(a) === NEARL) ?? null;
      has.deg = all.find((a) => charOf(a) === DEG) ?? null;
      const mods = {};
      if (has.mly) mods.aspd = 30;
      if (has.nearl) mods.hpPct = 0.3;
      if (has.deg) mods.atkPct = 0.3;
      const sig = JSON.stringify(mods);
      for (const a of all) {
        const want = a.alive && a.deployed && memberOf(battle, a, 'kazimierzShip') && sig !== '{}' ? sig : '';
        if ((given.get(a) ?? '') === want) continue;
        given.set(a, want);
        if (want) battle.addBuff(a, { key: BUFF, mods, tags: ['module'] });
        else if (a.findBuff(BUFF)) battle.removeBuff(a, BUFF);
      }
      // Mlynar: full charge (the trait's ramp), whenever his skill is not running
      const m = has.mly;
      if (m && m.alive && m.deployed && !m.skill?.active && m.trait && 'ramp' in m.trait) {
        const full = m.profile?.rampMax ?? 2;
        if (m.trait.ramp < full - 1e-9) { m.trait.ramp = full; battle.addBuff(m, { key: 'trait:libratorRamp', mods: { atkPct: full } }); }
      }
      // Raid: 1 s of idleness for all the player's Raid members; Degenbrecher may land on ranged tiles
      if (has.deg) fieldedRaid.set(u.ownerId, 1); else fieldedRaid.delete(u.ownerId);
      if (has.deg) has.deg.fishRaidRanged = true;
      // Nearl and Viviana attack what the other's range covers (the union: each gets the other's own range as extra targets)
      const a = u, b = has.nearl;
      if (b && a.alive && a.deployed && b.alive && b.deployed) {
        const own = (x) => x.rangeKeys.filter((k) => !x.fishUnion?.has(k));
        const ka = own(a), kb = own(b);
        const key = `${ka.join()}|${kb.join()}`;
        if (key !== unionKey) {
          unionKey = key;
          a.fishUnion = new Set(kb); b.fishUnion = new Set(ka);
          battle.setExtraRange(a, kb); battle.setExtraRange(b, ka);
        }
      } else if (unionKey) { unionKey = ''; for (const x of [a, b]) if (x?.fishUnion) { x.fishUnion = null; battle.setExtraRange(x, null); } }
    };
    battle.on('tick', syncCombos, { owner: u });
    battle.on('battleStart', syncCombos, { owner: u });
    let readyAt = 0;
    // the enemy in the range of any of her player's Kazimierz operators with the highest gaugeMax
    const findTarget = () => {
      let pick = null;
      for (const op of mine()) {
        if (!op.alive || !op.deployed || !memberOf(battle, op, 'kazimierzShip')) continue;
        for (const e of battle.enemiesInKeys(op.rangeKeys, op, { canHitFly: true })) {
          if (!e.alive || (pick && (pick.gaugeMax >= e.gaugeMax))) continue;
          pick = e;
        }
      }
      return pick;
    };
    const diamondAt = (tx, ty) => {
      const t = [];
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) if (Math.abs(dr) + Math.abs(dc) <= 2) t.push([ty + dr, tx + dc]);
      return t;
    };
    // the aim: follows its target (or, when that dies, the best enemy in range) until the last VVANA_V.lock seconds, then stays put
    let aim = null;
    const telegraph = () => battle.fx('telegraph', { x: aim.tx, y: aim.ty, r: 2.5, dur: Math.max(0.4, aim.at - battle.time), tiles: diamondAt(aim.tx, aim.ty), id: u.id, skill: 'fishVvanaV', key: `fishVvanaV:${u.id}` });
    battle.on('tick', () => {
      if (aim) {
        if (battle.time >= aim.at - VVANA_V.lock) return;
        if (!aim.target?.alive) aim.target = findTarget() || aim.target;
        const t = aim.target;
        if (!t?.alive) return;
        const tx = Math.round(t.x), ty = Math.round(t.y);
        if (tx !== aim.tx || ty !== aim.ty) { aim.tx = tx; aim.ty = ty; telegraph(); }
        return;
      }
      if (!up(u) || battle.time < readyAt) return;
      const pick = findTarget();
      if (!pick) return;
      readyAt = battle.time + 50;
      aim = { target: pick, tx: Math.round(pick.x), ty: Math.round(pick.y), at: battle.time + VVANA_V.delay };
      telegraph();
      const pp = battle._pp(u.ownerId);
      const base = pp ? pp.bossDamage : 0;
      battle.after(VVANA_V.delay, () => {
        const { tx, ty } = aim; aim = null;
        const share = (VVANA_V.base + (has.mly ? VVANA_V.mly : 0) + (has.nearl ? VVANA_V.nearl : 0) + (has.deg ? VVANA_V.deg : 0)) / 100;
        const recorded = pp ? Math.max(0, pp.bossDamage - base) * share : 0;
        battle.fx('aoe', { x: tx, y: ty, radius: 2, id: u.id, skill: 'fishVvanaV' });
        for (const e of battle.aliveEnemies()) {
          if (Math.abs(Math.round(e.x) - tx) + Math.abs(Math.round(e.y) - ty) > 2) continue;
          battle.dealDamage({ source: u, target: e, amount: u.s.atk * 15 + recorded, type: 'phys',
            attackType: 'ADDITION', applyWay: 'NONE', calculation: 'precomputed', tags: ['module', 'fishVvanaV'] });
        }
      }, { owner: u });
    }, { owner: u });
  },

  // Rosa W: [Aid] + [Marvel] (and she keeps Assist Operator). Takes Off: while her skill is active, +2 attack targets, ASPD -30,
  // ATK scale x2, her hits inflict Bind for 5 s and she shoots enemies without Bind first (targeting.js `fishUnboundFirst`);
  // an enemy that dies in her range gives +5 stacks to her active Alliances, 10 times per battle [DRAFT: the stacks are not
  // tied to the skill; +5 and not +2 as asked by Fish 2026-11-25: 50 a battle = Siege W's 50 a round]
  uniequip_fishw_poca(battle, u) {
    liveBuff(battle, u, `${KEY}:pocaW`, () => skillBusy(u), () => ({ maxTargets: 2, aspd: -30, atkScaleMul: 2 }));
    u.fishUnboundFirst = () => skillBusy(u);
    battle.on('hit', (c) => {
      if (c.source !== u || c.target?.side !== 'enemy' || !c.target.alive || !isMainHit(c.dmg) || !skillBusy(u)) return;
      battle.applyStatus(c.target, 'bind', { duration: 5, source: u });
    }, { owner: u });
    // "in her range" is the engine's own test (an enemy's body covers tiles, so its centre rounded to a tile is not it): the enemies
    // in range at the last tick, checked when one dies
    let kills = 0, inRange = new Set();
    battle.on('tick', () => { inRange = up(u) ? new Set(battle.enemiesInKeys(u.rangeKeys, u, { canHitFly: true })) : new Set(); }, { owner: u });
    battle.on('death', (c) => {
      const e = c.unit;
      if (!e || e.side !== 'enemy' || kills >= 10 || !up(u) || !inRange.has(e)) return;
      kills++;
      stackOwn(battle, u, 5);
    }, { owner: u });
  },

  // ATK from buffs ×2 (units.js fishStatPost); SP from anything but natural recovery ×2; every skill +1 charge; each
  // damage dealt adds 5 % ATK Corrosion — on an enemy at 0 DEF, 5 % ATK Burn and 10 % ATK Arts instead [DRAFT: the
  // starting SP isn't "gained" (not doubled); the riders follow HP damage only, not element damage]
  uniequip_fishz_zuole(battle, u) {
    u.fishStatPost = zuoleDouble;
    u.markDirty();
    battle.on('spGain', (c) => { if (c.unit === u && c.reason !== 'time' && c.reason !== 'init' && c.amount > 0) c.amount *= 2; }, { owner: u });
    const sk = u.skill;
    if (sk && !sk.noSkill && sk.kind !== 'passive') sk.maxCharges += 1;
    battle.on('hit', (c) => {
      if (c.source !== u || c.target?.side !== 'enemy' || !c.dmg || c.dmg.cancel || c.dmg.type === 'element'
        || c.dmg.tags?.includes('fishZuole')) return;
      const t = c.target;
      battle.dealElementDamage({ source: u, target: t, element: 'burn', amount: u.s.atk * 0.05, tags: ['module', 'fishZuole'] });
      if (t.alive) battle.dealDamage({ source: u, target: t, amount: u.s.atk * 0.1, type: 'arts', attackType: 'ADDITION',
        applyWay: 'NONE', calculation: 'precomputed', origin: c.dmg, tags: ['module', 'fishZuole'] });
    }, { owner: u });
  },
};

const VVANA_RES = new WeakSet();
/** 维娜 Mod Z's RES shred: every enemy Burn burst, RES −2 (10 times at most); installed once per battle, no owner. */
function installVvanaRes(battle) {
  if (VVANA_RES.has(battle)) return;
  VVANA_RES.add(battle);
  const n = new WeakMap();
  battle.on('elementBurst', (c) => {
    const e = c.target;
    if (c.element !== 'burn' || !e || e.side !== 'enemy' || !e.alive) return;
    const k = Math.min(10, (n.get(e) ?? 0) + 1);
    n.set(e, k);
    battle.addBuff(e, { key: `${KEY}:vvanaRes`, mods: { resFlat: -2 * k, defFlat: -200 * k }, tags: ['module'] });
  });
}

/** Install the Mod Z / W effects of `u`'s active module, if it has one. */
export function installModZ(battle, u) {
  const mod = u?.def?.raw?.module;
  if (!mod || mod.active === false) return;
  const def = modZOf(mod.id);
  if (!def) return;
  const fn = INSTALL[def.id];
  if (fn) fn(battle, u);
}

/** The module ids with an installer (tests check every Mod Z / W has one). */
export const MODZ_INSTALLED = Object.freeze(Object.keys(INSTALL));
