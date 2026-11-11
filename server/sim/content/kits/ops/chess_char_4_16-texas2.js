// server/sim/content/kits/ops/chess_char_4_16-texas2.js — 缄默德克萨斯 (char_1028_texas2) kit, tier 4.
// Conventions of the tier-4 kits: ../shared/tier4.js; kit contract and rules: ../README.md.

import { sortEnemyTargets } from '../../../targeting.js';
import {
  AURA, num, tbb, grid, targetsInGrid, whileDeployed, toggleBuff, resCut, isSel, alt, lonely, withDefaults,
} from '../shared/tier4.js';

export default withDefaults({
  // ===== 缄默德克萨斯 (executor) S3 剑雨滂沱 (passive) — deploy burst 2×115 % + 1.5 s stun, sword rain 1/s; talents
  //       S1 细雨无声 (passive, for the skill duration: ATK up; hits silence the target 5 s/8 s — 失去特殊能力 — with
  //       260/320 arts per s meanwhile); S2 阵雨连绵 (passive: deploy burst 150 %/180 % arts + RES −15 %/−20 % around her;
  //       for the skill duration ATK up and attacks become arts double hits). Talent 德克萨斯传统 applies to every passive.
  //       The S3 rain hits air units (PRTS 备注 "效果可对空"); so does the S2 deploy burst [ASSUMED: no note].
  chess_char_4_16_a: (bb, chess, def) => {
    const t0 = tbb(def, 0), t1 = tbb(def, 1);
    const tb = def.traitBb || {};
    const g = grid(def.skill?.rangeGrid) || [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 0], [0, 1], [1, -1], [1, 0], [1, 1]];
    const S1 = isSel(def, 'skchr_texas2_1'), S2 = isSel(def, 'skchr_texas2_2');
    const dur = num(def.skill?.duration, S1 ? 11 : S2 ? 8 : 6);
    const castS1 = (battle, unit) => {
      if (!unit.alive || !unit.deployed) return;
      battle.fx('swordRain', { x: unit.x, y: unit.y, id: unit.id });
    };
    const castS2 = (battle, unit) => {
      if (!unit.alive || !unit.deployed) return;
      const mr = num(bb.magic_resistance, 0);
      for (const e of targetsInGrid(battle, unit, g)) {
        battle.dealDamage(unit, e, { amount: unit.s.atk * num(bb.atk_scale, 1.5), type: 'arts', isSkill: true, tags: ['skill', 'burst'] });
        // 同名效果取最高: one RES cut per enemy (the strongest), never one per 缄默德克萨斯
        if (e.alive && mr) battle.applyStrongest(e, 'texas2:resDown', { duration: num(bb.debuff_duration, 8), value: mr, mods: resCut, source: unit });
      }
      battle.fx('swordStorm', { x: unit.x, y: unit.y, id: unit.id });
    };
    const castS3 = (battle, unit) => {
      if (!unit.alive || !unit.deployed) return;
      for (const e of targetsInGrid(battle, unit, g)) {
        for (let i = 0; i < 2 && e.alive; i++) battle.dealDamage(unit, e, { amount: unit.s.atk * num(bb['appear.atk_scale'], 1.15), type: 'arts', isSkill: true, tags: ['skill', 'burst'] });
        if (e.alive) battle.applyStatus(e, 'stun', { duration: num(bb['appear.stun'], 1.5), source: unit });
      }
      battle.fx('swordStorm', { x: unit.x, y: unit.y, id: unit.id });
      unit.mem.rainTimer?.cancel();
      unit.mem.rainTimer = battle.every(Math.max(0.1, num(bb['texas2_s_3[sword].interval'], 1)), (b, sched) => {
        if (!unit.alive || !unit.deployed || !unit.skill?.active) { sched.cancel(); return; }
        const list = targetsInGrid(b, unit, g);
        sortEnemyTargets(b, unit, list, null);
        for (const e of list.slice(0, Math.max(1, Math.floor(num(bb.max_target, 2))))) {
          b.dealDamage(unit, e, { amount: unit.s.atk * num(bb.atk_scale, 0.85), type: 'arts', isSkill: true, tags: ['skill', 'swordRain'] });
          if (e.alive) b.applyStatus(e, 'stun', { duration: num(bb.stun, 0.2), source: unit });
          b.fx('swordRain', { x: e.x, y: e.y, id: e.id });
        }
      }, { owner: unit });
      // Duration advances by dt in the ally phase; align the rain with that clock so the final wave lands before end.
      unit.mem.rainTimer.due -= battle.dt;
    };
    const cast = S1 ? castS1 : S2 ? castS2 : castS3;
    const skill = {
      kind: 'duration', activateOnDeploy: true, duration: dur, spCost: 0, spType: 'none', trigger: 'NEVER',
      mods: { atkPct: num(t0.atk, 0.2) + (S1 || S2 ? num(bb.atk) : 0) },
      onStart({ battle, unit, reason }) {
        if (reason === 'kill' && unit.mem.texasRecastPending) {
          unit.mem.texasRecastPending = false; // the synchronous burst already performed this recast
          return;
        }
        unit.mem.texasCasting = true;
        cast(battle, unit);
        unit.mem.texasCasting = false;
      },
      onEnd({ unit, reason }) {
        if (reason === 'recast' && unit.mem.texasRecastPending) return;
        unit.mem.rainTimer?.cancel();
      },
    };
    return {
      skill,
      skills: alt(def, {
        skchr_texas2_1: () => skill,
        skchr_texas2_2: () => skill,
      }),
      // S2: 攻击变为二连击 while the passive lasts
      trait: S2 ? { hitsFn: (b, u) => (u.skill?.active ? 2 : 1) } : undefined,
      talents: [
        { install(battle, unit) { // 德克萨斯传统 (2nd half): first kill of each deployment ⇒ full heal + recast
          // (the passive's deploy burst runs inside skill.reset, BEFORE the `deploy` hook: the per-deployment state is
          // therefore reset when she leaves the field, so a kill by the deploy burst itself counts)
          battle.on('death', (c) => {
            if (c.unit !== unit) return;
            unit.mem.texasKilled = unit.mem.texasCasting = unit.mem.texasRecastPending = false;
          }, { owner: unit });
          battle.on('kill', (c) => {
            if (c.killer !== unit || !unit.alive || c.victim.side !== 'enemy' || unit.mem.texasKilled) return;
            unit.mem.texasKilled = true;
            battle.removeBuff(unit, 'texas2:swordplay');
            battle.heal(unit, unit, unit.s.maxHp * num(t0.hp_ratio, 1), { self: true });
            if (unit.mem.texasCasting) {
              unit.mem.texasRecastPending = true;
              cast(battle, unit); // preserve the burst's synchronous reentry and damage order
            } else {
              unit.skill.end('recast');
              unit.skill.activate('kill', { free: true });
            }
          }, { owner: unit });
          battle.on('skillStart', (c) => {
            if (c.unit !== unit || !unit.mem.texasRecastPending) return;
            // Complete the lifecycle after observers received the outer start; the burst already recast above.
            unit.skill.end('recast');
            unit.skill.activate('kill', { free: true });
          }, { owner: unit, priority: -2000 });
        } },
        { install(battle, unit) { // 德克萨斯剑术: until her first kill after each deployment: ASPD +8, −25 % damage taken
          battle.on('deploy', (c) => {
            if (c.unit !== unit || unit.mem.texasKilled) return; // the deploy burst may already have scored the kill
            battle.addBuff(unit, { key: 'texas2:swordplay', mods: { aspd: num(t1.attack_speed, 8), dmgTakenMul: 1 - num(t1.damage_resistance, 0.25) } });
          }, { owner: unit });
        } },
      ],
      install(battle, unit) {
        if (S1) {
          // 攻击使命中目标失去特殊能力N秒，期间目标每秒受到X点法术伤害 (landed normal attacks while the passive lasts)
          const sil = num(bb['attack@silence'], 5), dotDur = num(bb['attack@texas2_s_1[dot].duration'], sil);
          const dot = num(bb['attack@texas2_s_1[dot].dot_damage'], 260), dotIv = Math.max(0.1, num(bb['attack@texas2_s_1[dot].interval'], 1));
          battle.on('damaged', (c) => {
            const e = c.target;
            if (c.source !== unit || !c.dmg?.isAttack || e.side !== 'enemy' || !e.alive || !unit.skill?.active) return;
            battle.applyStatus(e, 'silence', { duration: sil, source: unit });
            battle.addBuff(e, { key: `texas2:drizzleDot:${unit.id}`, duration: dotDur + 1e-6, interval: dotIv, source: unit, refresh: 'extend', // a re-hit refreshes it, the per-second ticks keep their rhythm
              onTick: ({ unit: t }) => battle.dealDamage(unit, t, { amount: dot, type: 'arts', isSkill: true, tags: ['skill', 'dot'] }) });
            // (fork) the client's texas2_s_1[dot] (PassiveAttachmentAbility._additiveActiveBuffs): texas2_skill_01_hit_buff on the
            // enemy while the dot lasts — display only (render: talentfx.js targetRows via b.snap fxs)
            battle.fxState(e, 'texas2_s_1[dot]', true, { src: unit, dur: dotDur });
          }, { owner: unit });
        }
        if (S2) {
          // 攻击…造成法术伤害 while the passive lasts (the double hit is the kit trait's hitsFn)
          battle.on('hit', (c) => {
            if (c.source === unit && c.dmg.isAttack && c.dmg.type === 'phys' && unit.skill?.active) c.dmg.type = 'arts';
          }, { owner: unit, priority: 50 });
        }
        const a = num(tb.atk, 0); // module (elite): ATK +10 % with no ally on the 4 adjacent tiles
        if (!a) return;
        whileDeployed(battle, unit, AURA, () => toggleBuff(battle, unit, 'texas2:module', lonely(battle, unit), { atkPct: a }));
      },
    };
  },
});
