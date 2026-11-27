// server/sim/content/risk.js — the battle side of the SPA-CC Risk tags (Custom Lobby Modifications, shared/rules.js,
// category 'risk'; numbers: shared/ruleData.js CC; fish-edition/FINDINGS.md §5). The rules come with the battle
// (BattleSpec flags.rules). Prep-side tags (prices, shop upgrades, bench counting, Strategy rounds, extra enemies) live
// with the match.
//   ccForesight   every 远见 operator −20 ASPD, whether 远见 is active or not (Fish, 2026-10-15)
//   ccSpRecovery  every operator's time-based SP recovers 0.2 / 0.4 / 0.6 SP/s slower (spRecoveryFlat)
//   ccLeaderDr    leaders — the Final Assault / Hidden Core bosses and the leader-class enemies (bosses.js BOSS_KEYS,
//                 enemies/leaders.js LEADER_KITS) — take 50 / 90 % less Physical and Arts damage, except while under an
//                 elemental burst (爆发: the burstLock flag)
//   ccBoss        the final bosses' ATK +15 / 25 / 50 % (their HP: the match sizes the shared pool, finalAssault.js)
//   ccDeepInfiltration  DP generation × 0.5 (flags.dpPerSec)
//   ccLowEfficiency     every operator's redeployment time × 1.75
//   ccOzArts / ccOzPhys / ccLockout, ccDelegation United 2 — the final boss's pool decides (server/sim/bossRisk.js); every
//                 field applies its view: +50 RES, +5000 DEF, 无敌 during a lockout; a field with a living Degenbrecher
//                 holds the pool (sharedBoss.setHold)
//   ccPatriot     Undying 1: Patriot's leak costs CC.patriot.leakLp; nobody took him (flags.ccPatriotSkipped) and Undying
//                 2: the final bosses' ATK +100 % more. Undying 2: in Marching Stance (his 'ab:patriotMarch' buff) 90 % less
//                 Physical / Arts damage from units not blocking him. Undying 3: in Marching Stance immune to
//                 CC.patriot.marchImmune; +200 % HP and never slower than his base speed (both forms); his escort
//                 (the match: infra.js). Patriot, and the Degenbrecher of the Delegation sub-wave, use their Level 1 stats (data
//                 enemies.json `level1`).
//   ccDelegation  United 2: the sub-wave's Degenbrecher charges while unblocked (installDegenCharge); United 3's gate is in
//                 her kit (enemies/leaders.js). Every level: the Degenbrechers of all the boss fields share one HP bar
//                 (installDegenLink)
//   ccJunk        the Toxic Waste's carrier ATK −50 % (installJunk; the item itself: shared/ruleData.js, the match)
//   ccVengeance   Invincible Blade 2 / 3 on the Reids the tag adds (installVengeance)
//   ccFamiglia    Unending / Seasonal: the Blood Ledger of every battle (installFamiglia; battle.ledger, the snapshot's
//                 `bl`); tier 3: Zaaro's leak costs CC.famiglia.zaaro.leakLp

import * as S from './support/index.js';
import { CC } from '../../../shared/ruleData.js';
import { BOSS_KEYS } from './bosses.js';
import { LEADER_KITS } from './enemies/leaders.js';
import { tagLevel, tagHas } from '../../../shared/rules.js';

const LEADERS = new Set([...BOSS_KEYS, ...Object.keys(LEADER_KITS)]);
const FINAL_BOSSES = new Set(BOSS_KEYS);

/** Whether an enemy unit is a leader for ccLeaderDr (its record's key). */
export const isLeaderEnemy = (u) => !!u && u.side === 'enemy' && LEADERS.has(u.def?.key ?? u.key);

export function install(battle) {
  const rules = battle.flags?.rules;
  if (!rules) return;
  const foresight = rules.ccForesight > 0, sp = CC.spRecovery[rules.ccSpRecovery] || 0;
  if (foresight || sp > 0) {
    battle.on('deploy', ({ unit }) => {
      if (!S.isOp(unit)) return;
      if (foresight && S.unitBonds(unit).includes('visiShip')) S.passiveBuff(battle, unit, 'risk:foresight', { aspd: CC.foresightAspd });
      if (sp > 0) S.passiveBuff(battle, unit, 'risk:spRecovery', { spRecoveryFlat: -sp });
    });
  }
  const dr = CC.leaderDr[rules.ccLeaderDr] || 0;
  if (dr > 0) {
    battle.on('hit', (c) => {
      const t = c.target;
      if (!isLeaderEnemy(t) || !c.dmg || (c.dmg.type !== 'phys' && c.dmg.type !== 'arts')) return;
      if (t.s.flags.burstLock) return;
      c.dmg.mul *= 1 - dr;
    });
  }
  // ccPatriot Undying 2: nobody took the round-9 Patriot → +100 % ATK on top
  const atk = (CC.bossAtk[rules.ccBoss] || 0) + (battle.flags.ccPatriotSkipped && tagHas(rules, 'ccPatriot', 'undying2') ? CC.patriot.skipAtk : 0);
  if (atk > 0) {
    battle.on('enemySpawn', ({ enemy }) => {
      if (enemy && FINAL_BOSSES.has(enemy.def?.key ?? enemy.key)) S.passiveBuff(battle, enemy, 'risk:bossAtk', { atkPct: atk });
    });
  }
  if (tagLevel(rules, 'ccDeepInfiltration') > 0) battle.flags.dpPerSec *= CC.dpPerSecMul;
  if (tagLevel(rules, 'ccLowEfficiency') > 0) {
    battle.on('deploy', ({ unit }) => { if (S.isOp(unit)) S.passiveBuff(battle, unit, 'risk:lowEfficiency', { redeployMul: CC.redeployMul }); });
  }
  installBossPool(battle, rules);
  installPatriot(battle, rules);
  installLevel1(battle, rules);
  installDegenCharge(battle, rules);
  installDegenLink(battle, rules);
  installFamiglia(battle, rules);
  installZaaro(battle, rules);
  installJunk(battle, rules);
  installVengeance(battle, rules);
}

/** ccJunk: the Toxic Waste's carrier ATK −50 % (its item record has no buffs; this is its effect). */
function installJunk(battle, rules) {
  if (!(tagLevel(rules, 'ccJunk') > 0)) return;
  battle.on('deploy', ({ unit }) => {
    if (S.isOp(unit) && Array.isArray(unit.items) && unit.items.includes(CC.junk.itemId)) S.passiveBuff(battle, unit, 'risk:cursedHammer', { atkPct: CC.junk.atkPct });
  });
}

/**
 * ccVengeance — the Reids the tag adds (spawn mods bountyId 'risk:vengeance'): Invincible Blade 2: +50 % ATK, Status
 * Resistance, 40 % less Physical / Arts damage below 50 % HP (his revive's 15 s 无敌: his kit, enemies/leaders.js);
 * Invincible Blade 3: below 50 % HP 80 % less damage instead and +100 ASPD.
 */
function installVengeance(battle, rules) {
  const V = CC.vengeance;
  const blade2 = tagHas(rules, 'ccVengeance', 'blade2'), blade3 = tagHas(rules, 'ccVengeance', 'blade3');
  if (!blade2) return;
  const isRisk = (u) => !!u && u.side === 'enemy' && keyOf(u) === V.key && String(u.mods?.bountyId ?? '').startsWith('risk:vengeance');
  const low = (u) => u.hpRatio < V.lowHp;
  battle.on('enemySpawn', ({ enemy }) => {
    if (!isRisk(enemy)) return;
    S.passiveBuff(battle, enemy, 'risk:vengeance', { atkPct: V.atkPct });
    battle.applyStatus(enemy, 'resist', { source: enemy });
  });
  battle.on('hit', (c) => {
    const t = c.target;
    if (!isRisk(t) || !low(t) || !c.dmg || (c.dmg.type !== 'phys' && c.dmg.type !== 'arts')) return;
    c.dmg.mul *= 1 - (blade3 ? V.lowDr3 : V.lowDr2);
  });
  if (blade3) {
    // +ASPD only while below half HP: a short buff renewed every 0.1 s (his revive's full HP ends it)
    let acc = 0;
    battle.on('tick', ({ dt }) => {
      acc += dt;
      if (acc < 0.1 - 1e-9) return;
      acc = 0;
      for (const e of battle.aliveEnemies()) if (isRisk(e) && low(e)) battle.addBuff(e, { key: 'risk:vengeanceLow', duration: 0.2, refresh: 'replace', mods: { aspd: V.aspd } });
    });
  }
}

/**
 * Level 1 stats (the stronger set hard stages use; data enemies.json `level1`) for Patriot under ccPatriot and the
 * Degenbrecher of the ccDelegation sub-wave (spawn mods bountyId 'risk:delegation:…'): her base stats × level1 / level 0,
 * so the round's multipliers and the tag's stay on top.
 */
/**
 * ccDelegation United 2: the sub-wave's Degenbrecher (spawn mods bountyId 'risk:delegation:…') charges — move speed
 * +CC.delegation.chargePct × (unblocked time / chargeSeconds), at most +chargePct, back to 0 when she is blocked or
 * cannot move (stunned, frozen, asleep, levitated, bound) — so a
 * field whose operators fell does not wait long for her to cross it (Fish 2026-10-15).
 */
function installDegenCharge(battle, rules) {
  if (!tagHas(rules, 'ccDelegation', 'united2')) return;
  const dg = CC.delegation;
  const free = new Map(); // Degenbrecher → unblocked seconds
  battle.on('tick', ({ dt }) => {
    if (!(dt > 0)) return;
    for (const e of battle.aliveEnemies()) {
      if (keyOf(e) !== dg.degen || !String(e.mods?.bountyId ?? '').startsWith('risk:delegation')) continue;
      // reset when blocked or unable to move (stunned / frozen / asleep / levitated: the stun flag; bound: noMove)
      const stuck = !!e.blockedBy || !!e.s.flags.stun || !!e.s.flags.noMove;
      const t = stuck ? 0 : Math.min(dg.chargeSeconds, (free.get(e) || 0) + dt);
      free.set(e, t);
      const pct = dg.chargePct * (t / dg.chargeSeconds);
      if (pct > 0) battle.addBuff(e, { key: 'risk:degenCharge', persist: true, visible: true, refresh: 'replace', mods: { moveMul: 1 + pct } });
      else if (e.findBuff('risk:degenCharge')) battle.removeBuff(e, 'risk:degenCharge');
    }
  });
}

function installLevel1(battle, rules) {
  const patriot = tagHas(rules, 'ccPatriot', 'undying1'), delegation = tagHas(rules, 'ccDelegation', 'united1');
  if (!patriot && !delegation) return;
  battle.on('enemySpawn', ({ enemy }) => {
    const key = keyOf(enemy);
    const wants = (patriot && key === CC.patriot.key)
      || (delegation && key === CC.delegation.degen && String(enemy.mods?.bountyId ?? '').startsWith('risk:delegation'));
    if (!wants) return;
    const rec = battle.data && typeof battle.data.rawEnemy === 'function' ? battle.data.rawEnemy(key) : null;
    const l1 = rec && rec.level1, l0 = rec && rec.stats;
    if (!l1 || !l0) return;
    const ratio = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && b > 0 ? a / b : 1);
    const hp = ratio(l1.maxHp, l0.maxHp);
    enemy.base.maxHp *= hp;
    enemy.base.atk *= ratio(l1.atk, l0.atk);
    enemy.base.def *= ratio(l1.def, l0.def);
    enemy.base.res = Number.isFinite(l1.res) ? l1.res : enemy.base.res;
    enemy.markDirty();
    if (!enemy.bossPool) enemy.hp = enemy.s.maxHp;
  });
}

/**
 * ccFamiglia Unending / Seasonal — the Blood Ledger (血债账款; arknights.wiki.gg Blood_Ledger), one per battle, fresh
 * every battle: `battle.ledger` { value, max, liquidating, count, permanent } (the snapshot's `bl`).
 *   Unending   the whole battle is an Asset Liquidation (permanent; no Silencer comes)
 *   Seasonal   the gauge fills CC.famiglia.perSec per game second (+zaaroPerSec per living Zaaro, + his Furious Howl);
 *              it starts at startShare of max (from round lateFrom at lateShare); at max an Asset Liquidation: one Shadow Silencer comes, the
 *              gauge drains over drainSeconds and does not fill meanwhile
 * An Asset Liquidation: every enemy ATK +20 %, DEF +15 % (spawned during it too); the Silencers their data Passive
 * (ATK / DEF +15 %, +50 ASPD) × the Liquidations of this battle so far, up to 5 [ASSUMED: the data's max_stack_cnt read
 * as one stack per Liquidation].
 */
function installFamiglia(battle, rules) {
  const unending = tagHas(rules, 'ccFamiglia', 'unending2'), seasonal = tagHas(rules, 'ccFamiglia', 'seasonal2');
  if (!unending && !seasonal) return;
  const F = CC.famiglia;
  const silencers = new Set(F.silencerKeys);
  const L = { value: 0, max: F.max, liquidating: false, count: 0, permanent: unending };
  battle.ledger = L;
  const buff = (e) => {
    battle.addBuff(e, { key: 'risk:liquidation', persist: true, visible: true, refresh: 'replace', mods: { atkPct: F.atkPct, defPct: F.defPct } });
    if (silencers.has(keyOf(e))) {
      const n = Math.min(L.count, F.silencer.maxStacks);
      battle.addBuff(e, { key: 'risk:liquidationSilencer', persist: true, visible: true, refresh: 'replace',
        mods: { atkPct: F.silencer.atkPct * n, defPct: F.silencer.defPct * n, aspd: F.silencer.aspd * n } });
    }
  };
  const start = () => {
    L.liquidating = true;
    L.count++;
    L.value = L.max;
    for (const e of battle.aliveEnemies()) buff(e);
  };
  const end = () => {
    L.liquidating = false;
    L.value = 0;
    for (const e of battle.aliveEnemies()) { battle.removeBuff(e, 'risk:liquidation'); battle.removeBuff(e, 'risk:liquidationSilencer'); }
  };
  battle.on('enemySpawn', ({ enemy }) => { if (L.liquidating) buff(enemy); });
  if (unending) { L.liquidating = true; L.count = 1; L.value = L.max; return; }
  L.value = L.max * (Number(battle.round) >= F.lateFrom ? F.lateShare : F.startShare);
  const howlSince = new Map(); // Zaaro → the time his second form started
  battle.on('tick', ({ dt }) => {
    if (battle.finished || !(dt > 0)) return;
    if (L.liquidating) {
      L.value -= (L.max / F.drainSeconds) * dt;
      if (L.value <= 0) end();
      return;
    }
    let rate = F.perSec;
    for (const e of battle.aliveEnemies()) {
      if (keyOf(e) !== F.zaaro.key) continue;
      rate += F.zaaroPerSec;
      if (!e.findBuff('ab:wolfRage')) continue;                // Furious Howl: his second form only
      if (!howlSince.has(e)) howlSince.set(e, battle.time);
      const sk = e.mem?.ab?.sk?.WildCalling;
      const h = { icd: sk?.icd ?? F.howl.icd, cd: sk?.cd ?? F.howl.cd, dur: sk?.bb?.duration ?? F.howl.duration, perSec: sk?.bb?.sp ?? F.howl.perSec };
      const t = battle.time - howlSince.get(e) - h.icd;
      if (t >= 0 && h.cd > 0 && t % h.cd < h.dur) rate += h.perSec;
    }
    L.value = Math.min(L.max, L.value + rate * dt);
    if (L.value >= L.max - 1e-9) {
      start();
      summonSilencer(battle, F.summonKey);
    }
  });
}

/** A Liquidation's Shadow Silencer (Seasonal): on the field's first ground route, the round's enemy scaling. */
function summonSilencer(battle, key) {
  const routes = Array.isArray(battle.routes) ? battle.routes : [];
  let routeIndex = routes.findIndex((r) => r && r.motion !== 'FLY');
  if (routeIndex < 0) routeIndex = 0;
  const s = battle.flags && battle.flags.enemyScale;
  const mods = s && typeof s === 'object' ? { hpMul: s.hpMul, atkMul: s.atkMul, speedMul: s.speedMul } : undefined;
  try { battle.spawnEnemy(key, { routeIndex, mods, tag: 'liquidation' }); } catch (e) { battle._internalError?.('liquidation summon', e); }
}

const keyOf = (u) => u.def?.key ?? u.key;

const DEGEN_SYNC = 'risk:degenSync';

/**
 * ccDelegation: one HP bar for the Degenbrechers of every boss field (Fish, balance draft 2026-11 — a field that cannot
 * kill hers is helped by the others, so United 2's hold never rests on the weakest board). Every 0.1 s this field
 * reports the HP its own battle took from its Degenbrecher (both lives; the pool's `noteDegen` → the risk view's
 * `degen`) and deals her the other fields' damage it has not applied yet, as tagged True damage with no source — her
 * own rules still decide what it does (United 3's gate and cast, the second form after a KO), and the damage another
 * field's copy refused (a gate, her revival) is applied later. Her death on the field that dealt the last blow and the
 * others' follow within one sync (a client field: within one b.pool). United 3's gate is linked too (Fish, 2026-11-12):
 * each field reports the gate steps its copy finished casting (`degenGate`), and a copy still held at a step another
 * field has finished opens at once, so a field whose copy never casts cannot lock the others.
 */
function installDegenLink(battle, rules) {
  const pool = battle.sharedBoss;
  if (!tagHas(rules, 'ccDelegation', 'united1') || !pool || typeof pool.noteDegen !== 'function') return;
  const isDegen = (e) => keyOf(e) === CC.delegation.degen && String(e.mods?.bountyId ?? '').startsWith('risk:delegation');
  let own = 0, reported = 0, applied = 0, acc = 0, gateReported = 0;
  battle.on('hpChanged', (c) => {
    if (c.delta < 0 && c.target && isDegen(c.target) && !(c.dmg?.tags || []).includes(DEGEN_SYNC)) own -= c.delta;
  });
  battle.on('tick', ({ dt }) => {
    acc += dt;
    if (acc < 0.1 - 1e-9) return;
    acc = 0;
    const her0 = battle.aliveEnemies().find(isDegen);
    const gate = her0?.degenGate ? her0.degenGate.done() : 0;
    if (own > reported || gate > gateReported) { reported = Math.max(reported, own); gateReported = Math.max(gateReported, gate); pool.noteDegen(battle.fieldId, reported, gateReported); }
    const view = pool.riskView();
    // United 3: one field's finished Momentum Murder opens the gate on every field
    if (her0?.degenGate && view?.degenGate) {
      let top = 0;
      for (const [fid, k] of Object.entries(view.degenGate)) if (fid !== String(battle.fieldId) && Number.isFinite(k)) top = Math.max(top, k);
      if (top > gate) her0.degenGate.open(top);
    }
    const by = view?.degen;
    if (!by) return;
    let others = 0;
    for (const [fid, d] of Object.entries(by)) if (fid !== String(battle.fieldId) && Number.isFinite(d)) others += d;
    const due = others - applied;
    if (!(due >= 1)) return;
    const her = battle.aliveEnemies().find(isDegen);
    if (!her) return;
    applied += battle.dealDamage({ source: null, target: her, amount: due, type: 'true', calculation: 'resolved',
      attackType: 'ADDITION', applyWay: 'NONE', dodgeMode: 'ignore', tags: [DEGEN_SYNC] }) || 0;
  });
}

/** The final boss pool's Risk view on this field's boss units, and United 2's hold (server/sim/bossRisk.js). */
function installBossPool(battle, rules) {
  const pool = battle.sharedBoss;
  if (!pool || typeof pool.riskView !== 'function') return;
  const hold = tagHas(rules, 'ccDelegation', 'united2');
  let held = false, acc = 0;
  battle.on('tick', ({ dt }) => {
    acc += dt;
    if (acc < 0.1 - 1e-9) return;
    acc = 0;
    if (hold && typeof pool.setHold === 'function') {
      const on = battle.aliveEnemies().some((e) => keyOf(e) === CC.delegation.degen);
      if (on !== held) { held = on; pool.setHold(battle.fieldId, on); }
    }
    const v = pool.riskView();
    if (!v) return;
    for (const e of battle.aliveEnemies()) {
      if (!e.bossPool) continue;
      toggle(battle, e, 'risk:ozArts', !!v.res, { mods: { resFlat: CC.ozArts.res } });
      toggle(battle, e, 'risk:ozPhys', !!v.def, { mods: { defFlat: CC.ozPhys.def } });
      toggle(battle, e, 'risk:lockout', !!v.inv, { flags: { invulnerable: true } });
    }
  });
}

function toggle(battle, e, key, on, buff) {
  const has = !!e.findBuff(key);
  if (on && !has) battle.addBuff(e, { key, persist: true, visible: true, ...buff });
  else if (!on && has) battle.removeBuff(e, key);
}

function installZaaro(battle, rules) {
  if (!tagHas(rules, 'ccFamiglia', 'unending3') && !tagHas(rules, 'ccFamiglia', 'seasonal3')) return;
  battle.on('enemySpawn', ({ enemy }) => { if (keyOf(enemy) === CC.famiglia.zaaro.key) enemy.lpr = CC.famiglia.zaaro.leakLp; });
}

function installPatriot(battle, rules) {
  if (!tagHas(rules, 'ccPatriot', 'undying1')) return;
  const pt = CC.patriot;
  const isPatriot = (u) => !!u && u.side === 'enemy' && keyOf(u) === pt.key;
  const undying2 = tagHas(rules, 'ccPatriot', 'undying2'), undying3 = tagHas(rules, 'ccPatriot', 'undying3');
  const marching = (u) => isPatriot(u) && !!u.findBuff('ab:patriotMarch');
  battle.on('enemySpawn', ({ enemy }) => {
    if (!isPatriot(enemy)) return;
    enemy.lpr = pt.leakLp;
    if (undying3) S.passiveBuff(battle, enemy, 'risk:patriotUndying', { hpPct: pt.hpPct }, { flags: { moveFloor: true } });
  });
  if (undying3) {
    const immune = new Set(pt.marchImmune);
    battle.on('beforeStatus', (c) => { if (marching(c.target) && immune.has(c.status)) c.cancel = true; });
  }
  if (undying2) {
    battle.on('hit', (c) => {
      const t = c.target;
      if (!marching(t) || !c.dmg || (c.dmg.type !== 'phys' && c.dmg.type !== 'arts')) return;
      const src = c.source;
      if (!src || src.side !== 'ally' || t.blockedBy === src) return;
      c.dmg.mul *= 1 - pt.marchDr;
    });
  }
}

export function registerMeta() {}
