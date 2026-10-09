// server/sim/content/kits/ops/chess_char_6_03-yu.js — 余 (char_2026_yu) kit, tier 6.
// Conventions of the tier-6 kits: ../shared/tier6.js; kit contract and rules: ../README.md.

import { canTargetEnemy } from '../../../targeting.js';
import {
  num, bv, tbb, moduleBb, live, opsOf, ANY, onDefaultSkill, selectedSkill, skillGridOf, AROUND8, onElementHit,
  elementDmg, aura,
} from '../shared/tier6.js';
import { holdProtect, byEnemyAttack } from '../shared/tier1.js';

/**
 * "传送至自身位置": a ground enemy that can reach `unit`'s tile on the ground grid is moved onto it (unblocked, its
 * route re-planned from there — the engine then blocks it on that tile when capacity allows). Flyers stay, and so does a
 * 自缚 unit (flag `selfBound`: 守墓石像's 转换模式, the 7 huge leaders, the 胄 parts' anchor): PRTS 余 S2 备注 "处于消失状态的/
 * 持有自缚的单位不视为可达目标" (束缚 alone does not exempt it, so not `noMove`). Being a leader is no exemption: PRTS gives
 * 卢西恩 and 假想敌：铳 (both sections) 传送抗性 无 — they are teleported like any ground enemy and walk on from his tile (a
 * patrol keeps looping: content/bosses.js patrolLoop). 静态刚体 forbids physical movement, not a teleport (the 备注 names
 * only 消失 / 自缚 / 免疫传送); every 静态刚体 of the mode flies or is 自缚 anyway.
 */
function teleportEnemy(battle, unit, e) {
  if (!e || !e.alive || e.isFlying || e.s.flags.selfBound) return false;
  const r = unit.tileR, c = unit.tileC;
  if (!battle.grid.groundPassable(r, c)) return false;
  const er = Math.round(e.y), ec = Math.round(e.x);
  if ((er !== r || ec !== c) && !battle.grid.findPath(er, ec, r, c)) return false;
  e.x = c; e.y = r;
  battle._unblock(e);
  if (e.route) e.route.pts = null;
  battle.fx('teleport', { x: c, y: r, id: e.id, src: unit.id });
  return true;
}

// ------------------------------------------------------------------------------------------------------------------
// 余 chess_char_6_03 (本源铁卫) — S3 灶里乾坤; 礼尚往来; 闲云隐市; module 人间百味

function yu(bb, chess, def) {
  const t0 = tbb(def, 0), t1 = tbb(def, 1), mod = moduleBb(chess), tb = def?.traitBb || {};
  const isDef = onDefaultSkill(chess), sid = selectedSkill(chess, def);
  const wallProb = isDef ? num(bb.prob) : 0, wallBurn = isDef ? num(bb.ep_damage_ratio) : 0;
  // "将第二天赋效果赋予全场所有干员" belongs to S3 (the default skill) only
  const s3On = (unit) => isDef && !!unit.skill?.active;
  const skills = {
    // S1 今日做东 (TAKE_DAMAGE, hurt SP): passive taunt +taunt_level; active: HP / DEF +, every enemy damage instance taken ⇒
    // ep_damage_ratio × ATK 灼燃损伤 on its source (install below)
    skchr_yu_1: { kind: 'duration', mods: { hpPct: num(bb.max_hp), defPct: num(bb.def) } },
    // S2 厚礼上宾 (cast with an enemy on its x-1: the data's SKILL_RANGE, a deliberate deviation from the 重装 TAKE_DAMAGE
    // row — tools/build-data.mjs TRIGGER_DEVIATIONS, DESIGN §22.10): atk_scale × ATK arts on every enemy of the skill range
    // + the ground-reachable ones teleported onto his tile (leaders too, unless 自缚: teleportEnemy); block +block_cnt, HP /
    // ATK +, normal attacks deal arts damage. The burst hits air units too [ASSUMED: no 对空 note on PRTS]; the teleport
    // takes ground units only ("地面可达目标"). The 'pull' fx only when someone was teleported (each one also gets its own
    // 'teleport' fx). PRTS's 0.13 s between the damage and the teleport is not modelled (same tick).
    skchr_yu_2: {
      kind: 'duration',
      // [ASSUMED] its burst and teleport pick enemies; 白铁's 铁钳号 alone does not open it (skills.js allyTargetsOk)
      allyTargets: false,
      mods: { hpPct: num(bb.max_hp), atkPct: num(bb.atk), blockCnt: num(bb.block_cnt) },
      attack: { dmgType: 'arts' },
      onStart({ battle, unit }) {
        const grid = skillGridOf(def) || AROUND8;
        const foes = battle.unitsInGrid(unit, grid, { side: 'enemy' }).filter((e) => canTargetEnemy(unit, e, ANY));
        for (const e of foes) battle.dealDamage(unit, e, { amount: unit.s.atk * num(bb.atk_scale, 1), type: 'arts', isSkill: true, tags: ['skill'] });
        let n = 0;
        for (const e of foes) if (teleportEnemy(battle, unit, e)) n++;
        if (n > 0) battle.fx('pull', { x: unit.x, y: unit.y, id: unit.id, n });
      },
    },
  };
  return {
    skills,
    install(battle, unit) {
      if (sid !== 'skchr_yu_1') return;
      // 被动效果：自身更容易受到敌人攻击 (while this skill is carried)
      battle.addBuff(unit, { key: 'yu:host', mods: { taunt: num(bb.taunt_level, 1) }, persist: true, allowDead: true });
      battle.on('damaged', (ctx) => {
        const s = ctx.source;
        // "每次受到攻击" = the official yu_s_1[inverse_damage]: every enemy damage instance (tier1 byEnemyAttack)
        if (ctx.target !== unit || !unit.skill?.active || !byEnemyAttack(ctx) || !s.alive) return;
        elementDmg(battle, unit, s, 'burn', unit.s.atk * num(bb.ep_damage_ratio), ['skill']);
      }, { owner: unit });
    },
    skill: {
      kind: 'duration',
      mods: { hpPct: num(bb.max_hp), atkPct: num(bb.atk), defPct: num(bb.def) },
      allyTargets: false,   // [ASSUMED] its wall burns enemies crossing it; 白铁's 铁钳号 alone does not open it
      // the wall runs through his tile perpendicular to his direction (RIGHT / LEFT: his column; UP / DOWN: his row —
      // it turns with the deploy direction like a range) [ASSUMED orientation for UP / DOWN]
      onStart({ battle, unit }) {
        const vertical = unit.fwd[0] === 0;
        unit.mem.yuWall = vertical ? { axis: 'x', v: unit.tileC } : { axis: 'y', v: unit.tileR };
        battle.fx('firewall', { x: unit.tileC, y: unit.tileR, id: unit.id, dir: unit.dir, axis: vertical ? 'col' : 'row' });
      },
      onEnd({ unit }) { unit.mem.yuWall = null; },
    },
    talents: [
      { install(battle, unit) { // 礼尚往来: 庇护 while blocking + DoT on blocked enemies
        const dr = num(t0.damage_resistance), sc = bv(t0, 'atk_scale'), er = bv(t0, 'ep_damage_ratio'), iv = Math.max(0.1, bv(t0, 'interval', 1));
        // 庇护 (ba.protect): 受到的物理和法术伤害降低相应比例（同名效果取最高）— true / element damage is not reduced; the shared
        // 庇护 (holdProtect: the strongest of every source holds)
        aura(battle, unit, 0.1, () => {
          if (dr > 0 && unit.blocking.length) holdProtect(battle, unit, dr, 0.2, unit);
        });
        aura(battle, unit, iv, () => {
          for (const e of unit.blocking.slice()) {
            if (!e.alive) continue;
            if (sc > 0) battle.dealDamage(unit, e, { amount: unit.s.atk * sc, type: 'arts', tags: ['talent'] });
            if (er > 0) elementDmg(battle, unit, e, 'burn', unit.s.atk * er, ['talent']);
          }
        });
      } },
      { install(battle, unit) { // 闲云隐市 (all operators while S3 runs)
        const cnt = num(t1.cnt, 4), hr = num(t1.hp_recovery_per_sec_by_max_hp_ratio), er = num(t1.ep_heal_ratio), iv = Math.max(0.1, num(t1.interval, 1));
        aura(battle, unit, iv, () => {
          const ops = opsOf(battle, unit.ownerId);
          if (ops.length < cnt) return;
          for (const a of s3On(unit) ? ops : [unit]) {
            if (hr > 0) battle.heal(unit, a, a.s.maxHp * hr * iv, { self: true, silent: true });
            if (er > 0) battle.reduceElement(a, a.s.maxHp * er * iv);
          }
        });
      } },
      { install(battle, unit) { // S3 fire wall
        const crosses = (a, b) => {
          const w = unit.mem.yuWall;
          if (w == null) return false;
          return w.axis === 'y' ? (a.y - w.v) * (b.y - w.v) < 0 : (a.x - w.v) * (b.x - w.v) < 0;
        };
        battle.on('damaged', (ctx) => {
          const s = ctx.source, t = ctx.target;
          if (!(wallBurn > 0) || unit.mem.yuWall == null || !live(unit) || ctx.type !== 'arts' || !(ctx.amount > 0)) return;
          if (!s || s === unit || s.side !== 'ally' || !t || t.side !== 'enemy' || !t.alive || !crosses(s, t)) return;
          elementDmg(battle, unit, t, 'burn', unit.s.atk * wallBurn, ['skill', 'firewall']);
        }, { owner: unit });
        battle.on('hit', (ctx) => {
          const s = ctx.source, t = ctx.target;
          if (!(wallProb > 0) || unit.mem.yuWall == null || !live(unit) || !s || s.side !== 'enemy' || !t || t.side !== 'ally') return;
          if (!ctx.dmg.isAttack || !(s.base.rangeRadius > 0) || s.blockedBy === t || !crosses(s, t)) return;
          if (battle.rng() < wallProb) {
            ctx.dmg.cancel = true;
            const w = unit.mem.yuWall;
            battle.fx('firewallBlock', w.axis === 'y' ? { x: t.x, y: w.v, id: unit.id } : { x: w.v, y: t.y, id: unit.id });
          }
        }, { owner: unit });
      } },
      { install(battle, unit) { // elite: module element ×1.15 while blocking; 闲云隐市 arts ×1.14 vs burning targets (≥4 ops)
        const epScale = num(tb.ep_damage_scale, 1), cnt = num(mod.cnt, Infinity), ds = num(mod.damage_scale, 1);
        if (epScale > 1) onElementHit(battle, unit, (ctx) => (ctx.source === unit && live(unit) && unit.blocking.length ? epScale : 1));
        // "将第二天赋效果赋予全场所有干员": while S3 runs every operator of hers gets the ×1.14 too
        if (ds > 1) battle.on('hit', (ctx) => {
          const s = ctx.source;
          if (!s || ctx.dmg.type !== 'arts' || !ctx.target || ctx.target.side !== 'enemy' || !ctx.target.findBuff('burnBurst')) return;
          if (s !== unit && !(s.kind === 'op' && s.ownerId === unit.ownerId && live(unit) && s3On(unit))) return;
          if (opsOf(battle, unit.ownerId).length >= cnt) ctx.dmg.mul *= ds;
        }, { owner: unit });
      } },
    ],
  };
}

export default {
  chess_char_6_03_a: yu,
};
