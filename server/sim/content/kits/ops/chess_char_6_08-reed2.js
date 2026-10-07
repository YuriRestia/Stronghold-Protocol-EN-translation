// server/sim/content/kits/ops/chess_char_6_08-reed2.js — 焰影苇草 (char_1020_reed2) kit, tier 6.
// Conventions of the tier-6 kits: ../shared/tier6.js; kit contract and rules: ../README.md.

import { sortEnemyTargets } from '../../../targeting.js';
import { num, tbb, moduleBb, live, enemiesIn, onDefaultSkill, aura } from '../shared/tier6.js';

// ------------------------------------------------------------------------------------------------------------------
// 焰影苇草 chess_char_6_08 (咒愈师) — S3 生命火种; 灼痕; 映耀

function reed2(bb, chess, def) {
  const t0 = tbb(def, 0), t1 = tbb(def, 1), tb = def?.traitBb || {}, mod = moduleBb(chess);
  const isDef = onDefaultSkill(chess);
  const selfAtk = (() => { for (const k of Object.keys(bb)) if (!k.startsWith('talent@') && (k === 'atk' || k.endsWith('.atk'))) return num(bb[k]); return 0; })();
  const sProb = num(bb['talent@prob'], num(t0.prob)), dot = num(bb['talent@s3_atk_scale']);
  const aoe = num(bb['talent@aoe_scale']), aoeR = num(bb['talent@range_radius'], 1.7);
  const scorchAtk = num(t0.atk), scorchFragile = num(t0.damage_scale, 1) - 1;
  // 灼痕: ATK −22 % (marker buff, 不可叠加) + 32 % 法术脆弱 at full potential (the catalogue status: 同名效果取最高 with other sources)
  const scorch = (battle, unit, e) => {
    if (!e || !e.alive) return;
    const sk = unit.skill;
    // "灼痕效果持续至技能结束" — S3 (the default skill) only
    const dur = isDef && sk && sk.active ? Math.max(0.1, sk.timeLeft) : num(t0.duration, 6);
    battle.addBuff(e, { key: 'reed2:scorch', duration: dur, refresh: 'extend', mods: scorchAtk ? { atkPct: scorchAtk } : null, visible: true, source: unit });
    if (scorchFragile > 0 && e.alive) battle.applyStatus(e, 'artsFragile', { duration: dur, value: scorchFragile, source: unit });
  };
  const skills = {
    // S1 迅捷打击·γ型
    'skcom_quickattack[3]': { kind: 'duration', mods: { atkPct: num(bb.atk), aspd: num(bb.attack_speed) } },
    // S2 枯荣共息: up to max_target operators of her range (ground ones first) carry three fireballs for
    // projectile_life_time s: every `cooldown` s one enemy in the carrier's range (else hers) takes atk_scale × her ATK
    // arts, and her trait heals only that carrier (trait scale × the damage)
    skchr_reed2_2: {
      kind: 'duration',
      duration: num(bb.projectile_life_time) > 0 ? num(bb.projectile_life_time) : undefined,
      onStart({ battle, unit, skill }) {
        const n = Math.max(1, Math.floor(num(bb.max_target, 1)));
        const cands = battle.alliesInGrid(unit).filter((a) => a.kind === 'op' && live(a));
        cands.sort((a, b) => (a === unit) - (b === unit) || (b.ground ? 1 : 0) - (a.ground ? 1 : 0) || a.hpRatio - b.hpRatio || a.deploySeq - b.deploySeq);
        unit.mem.reedFire = cands.slice(0, n).map((a) => ({ a, acc: 0 }));
        for (const F of unit.mem.reedFire) {
          battle.addBuff(F.a, { key: `reed2:fireball:${unit.id}`, duration: skill.timeLeft, visible: true, source: unit });
          battle.fx('ember', { x: F.a.x, y: F.a.y, id: F.a.id, src: unit.id, n: 3 });
        }
      },
      onTick({ battle, unit, dt }) {
        const cd = Math.max(0.1, num(bb.cooldown, 1.5));
        for (const F of unit.mem.reedFire || []) {
          if (!live(F.a)) continue;
          F.acc += dt;
          if (F.acc + 1e-9 < cd) continue;
          F.acc -= cd;
          let c = enemiesIn(battle, F.a);
          if (!c.length) c = enemiesIn(battle, unit);
          if (!c.length) continue;
          sortEnemyTargets(battle, F.a, c, null);
          // "每1.5秒对一名敌人造成…法术伤害并仅对该干员触发焰影苇草特性": the trait heal (professions.js
          // installIncantation) runs for this damage and names the carrier instead of the lowest-HP ally in range
          battle.dealDamage(unit, c[0], { amount: unit.s.atk * num(bb.atk_scale, 1), type: 'arts', isSkill: true, tags: ['skill', 'fireball'], traitAlly: F.a });
          battle.fx('strike', { x: c[0].x, y: c[0].y, id: c[0].id, src: F.a.id });
        }
      },
      onEnd({ battle, unit }) {
        for (const F of unit.mem.reedFire || []) battle.removeBuff(F.a, `reed2:fireball:${unit.id}`);
        unit.mem.reedFire = null;
      },
    },
  };
  return {
    skills,
    install(battle, unit) {
      // module “独属自己的一隅”: "攻击范围内存在已受伤的友方干员时，自身造成的伤害提升至110%"
      const ds = num(mod.damage_scale, 1);
      if (ds > 1) aura(battle, unit, 0.25, () => {
        if (battle.injuredAlliesInKeys(unit.rangeKeys, unit).some((a) => a.kind === 'op' && a !== unit)) {
          battle.addBuff(unit, { key: 'reed2:corner', mods: { dmgDealtMul: ds }, duration: 0.4, refresh: 'replace' });
        }
      });
    },
    skill: {
      kind: 'duration',
      mods: { atkPct: selfAtk },
      targeting: { maxTargets: Math.max(1, Math.floor(num(bb.max_target, 1))) },
      onStart({ unit }) { unit.mem.reedAcc = 0; },
      onTick({ battle, unit, dt }) {
        unit.mem.reedAcc += dt;
        if (unit.mem.reedAcc + 1e-9 < 1) return;
        unit.mem.reedAcc -= 1;
        if (!(dot > 0)) return;
        for (const e of battle.enemies) if (e.alive && !e.hidden && e.findBuff('reed2:scorch')) {
          battle.dealDamage(unit, e, { amount: unit.s.atk * dot, type: 'arts', isSkill: true, tags: ['skill', 'scorch'] });
        }
      },
    },
    talents: [
      { install(battle, unit) { // 灼痕 (+ S3 kill explosions)
        battle.on('damaged', (ctx) => {
          const t = ctx.target;
          if (ctx.source !== unit || !t || t.side !== 'enemy' || !t.alive || ctx.type === 'element') return;
          if (ctx.dmg?.tags?.includes('scorch')) return;
          const p = unit.skill?.active ? sProb : num(t0.prob);
          if (p >= 1 || (p > 0 && battle.rng() < p)) scorch(battle, unit, t);
        }, { owner: unit });
        battle.on('kill', ({ victim }) => {
          if (!unit.skill?.active || !live(unit) || victim.side !== 'enemy' || !victim.findBuff('reed2:scorch') || !(aoe > 0)) return;
          const x = victim.x, y = victim.y;
          // deferred to the next scheduler pass: chained explosions must not nest kill → damage → kill hooks
          battle.after(0, () => {
            if (!live(unit)) return;
            battle.fx('scorchBurst', { x, y, id: unit.id, r: aoeR });
            for (const e of battle.foesInRadius(x, y, aoeR, true)) { // splash around the victim: 中点判定
              if (!e.alive) continue;
              battle.dealDamage(unit, e, { amount: unit.s.atk * aoe, type: 'arts', isSkill: true, isSplash: true, tags: ['skill', 'scorch'] });
              scorch(battle, unit, e);
            }
          }, { owner: unit });
        }, { owner: unit });
      } },
      { install(battle, unit) { // 映耀
        const share = num(t1.scale), boost = num(t1.heal_scale, 1);
        battle.on('heal', (ctx) => {
          if (ctx.source !== unit || ctx.target === unit || ctx.opts?.reflect) return;
          if (boost !== 1) ctx.amount *= boost;
          if (share > 0 && ctx.amount > 0) battle.heal(unit, unit, ctx.amount * share, { self: true, reflect: true });
        }, { owner: unit });
      } },
    ],
  };
}

export default {
  chess_char_6_08_a: reed2,
};
