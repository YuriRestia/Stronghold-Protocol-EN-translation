// server/sim/content/kits/ops/chess_char_6_12-rosmon.js — 迷迭香 (char_391_rosmon) kit, tier 6.
// Conventions of the tier-6 kits: ../shared/tier6.js; kit contract and rules: ../README.md.

import { sortEnemyTargets } from '../../../targeting.js';
import { summonToken } from '../../tokens.js';
import { num, tbb, live, opsOf, selectedSkill, batOf } from '../shared/tier6.js';

// ------------------------------------------------------------------------------------------------------------------
// 迷迭香 chess_char_6_12 (投掷手) — S2 末梢阻断; 歼灭战装备; 感知稳定

/** S2 末梢阻断 "溅射范围扩大": radius 1.5 (PRTS 溅射半径一览, 技能: 迷迭香 末梢阻断 1.5; ×1.3 [ASSUMED] until 0.1.1). */
const ROSMON_S2_SPLASH = 1.5;

function rosmon(bb, chess, def) {
  const t0 = tbb(def, 0), t1 = tbb(def, 1);
  const sid = selectedSkill(chess, def);
  const prob = num(bb['attack@prob']), stun = num(bb['attack@stun']);
  const gearId = (chess?.tokens || []).find((t) => /rosmon_shield/.test(String(t))) || 'token_10012_rosmon_shield';
  const skills = {
    // S1 思维膨大 (attack SP): the next attack also deals extra_atk_scale × ATK arts to every enemy it hits
    skchr_rosmon_1: {
      kind: 'instant',
      attack: {
        onEachHit({ battle, unit, target, kind }) {
          if (!target || !target.alive || (kind !== 'main' && kind !== 'splash')) return;
          battle.dealDamage(unit, target, { amount: unit.s.atk * num(bb.extra_atk_scale, 1), type: 'arts', isSkill: true, tags: ['skill'] });
        },
      },
    },
    // S3 “如你所愿”: base attack time ×0.5 (akdata: 乘算负数), ATK +atk, 2 targets but blocked enemies only (install);
    // two 战术装备 on melee tiles of her range (the token kit: appear stun, blocked enemies DEF −160, lifetime)
    skchr_rosmon_3: {
      kind: 'duration',
      // [ASSUMED] blocked enemies only; 白铁's unblockable 铁钳号 never: it does not open it (skills.js allyTargetsOk)
      allyTargets: false,
      mods: { batPct: batOf(bb.base_attack_time, def, true), atkPct: num(bb.atk) },
      targeting: { maxTargets: Math.max(1, Math.floor(num(bb['attack@max_target'], 2))) },
      onStart({ battle, unit }) {
        let n = 0;
        for (let i = 0; i < 2; i++) if (summonToken(battle, unit, gearId, 'melee')) n++;
        battle.fx('summon', { x: unit.x, y: unit.y, id: unit.id, n });
      },
    },
  };
  return {
    skills,
    install(battle, unit) {
      if (sid !== 'skchr_rosmon_3') return;
      battle.on('beforeAttack', (ctx) => { // "仅选择被阻挡的敌人作为目标"
        if (ctx.attacker !== unit || !unit.skill?.active) return;
        // her range, plus the enemies she blocks herself — always her targets (Battle.blockedTargets, DESIGN §20.3)
        const c = battle.enemiesInKeys(unit.rangeKeys, unit, ctx.profile);
        for (const e of battle.blockedTargets(unit, ctx.profile)) if (!c.includes(e)) c.push(e);
        for (let i = c.length - 1; i >= 0; i--) if (!c[i].blockedBy) c.splice(i, 1);
        sortEnemyTargets(battle, unit, c, ctx.profile?.priority ?? null);
        ctx.targets = c.slice(0, Math.max(1, Math.floor(num(ctx.profile?.maxTargets, 2))));
      }, { owner: unit });
    },
    skill: {
      kind: 'duration',
      mods: { batPct: batOf(bb.base_attack_time, def), atkPct: num(bb.atk) },
      onStart({ unit }) {
        const p = unit.profile;
        unit.mem.rosSaved = { r: p.splashRadius, n: p.shockTimes };
        p.splashRadius = Math.max(num(p.splashRadius, 0.9), ROSMON_S2_SPLASH);
        p.shockTimes = num(p.shockTimes, 2) + Math.floor(num(bb.add_times));
      },
      onEnd({ unit }) {
        const s = unit.mem.rosSaved;
        if (s) { unit.profile.splashRadius = s.r; unit.profile.shockTimes = s.n; }
        unit.mem.rosSaved = null;
      },
    },
    talents: [
      { install(battle, unit) { // S2: attack & aftershock stun chance
        battle.on('damaged', (ctx) => {
          if (ctx.source !== unit || !unit.skill?.active || !(stun > 0) || !ctx.target.alive || ctx.target.side !== 'enemy') return;
          if (!ctx.dmg?.isAttack && !ctx.dmg?.tags?.includes('aftershock')) return;
          if (battle.rng() < prob) battle.applyStatus(ctx.target, 'stun', { duration: stun, source: unit });
        }, { owner: unit });
      } },
      { install(battle, unit) { // 歼灭战装备
        const v = num(t0.def_penetrate_fixed);
        if (v) battle.addBuff(unit, { key: 'rosmon:pierce', mods: { defIgnoreFlat: v }, persist: true, allowDead: true });
      } },
      { install(battle, unit) { // 感知稳定
        const atk = num(t1.atk);
        battle.on('deploy', ({ unit: u }) => {
          if (u !== unit || !atk) return;
          battle.after(0, () => {
            if (!live(unit)) return;
            const casters = opsOf(battle, unit.ownerId).filter((a) => a.def?.profession === 'CASTER');
            const pick = battle.rng.pick(casters);
            if (!pick) return;
            battle.addBuff(unit, { key: 'rosmon:stable', mods: { atkPct: atk } });
            battle.addBuff(pick, { key: 'rosmon:stable', mods: { atkPct: atk } });
            battle.fx('link', { x: pick.x, y: pick.y, id: pick.id, src: unit.id });
          }, { owner: unit });
        }, { owner: unit });
      } },
    ],
  };
}

export default {
  chess_char_6_12_a: rosmon,
};
