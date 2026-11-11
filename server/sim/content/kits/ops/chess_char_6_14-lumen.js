// server/sim/content/kits/ops/chess_char_6_14-lumen.js — 流明 (char_4042_lumen) kit, tier 6.
// Conventions of the tier-6 kits: ../shared/tier6.js; kit contract and rules: ../README.md.

import { COLS } from '../../../constants.js';
import {
  num, bv, tbb, live, onDefaultSkill, instantKind, ABNORMAL, hasAbnormal, cleanseAbnormal,
} from '../shared/tier6.js';

// ------------------------------------------------------------------------------------------------------------------
// 流明 chess_char_6_14 (疗养师) — S3 灯火不灭; 凡人之愿; 应急处理; module 纯铜单筒望远镜

function lumen(bb, chess, def) {
  const t0 = tbb(def, 0), t1 = tbb(def, 1), tb = def?.traitBb || {};
  const isDef = onDefaultSkill(chess);
  const hs = num(bb.heal_scale, 1);
  const abnormalAllies = (battle, unit) => battle.alliesInGrid(unit).filter((a) => hasAbnormal(a)).sort((a, b) => a.hpRatio - b.hpRatio || a.deploySeq - b.deploySeq);
  const cleanse = (battle, t) => { cleanseAbnormal(battle, t); };
  const skills = {
    // S1 沐雨: the next heal also gives its target and the allies around it (8 tiles) aura.heal_scale × ATK healing
    // per second for aura.projectile_life_time s
    skchr_lumen_1: {
      kind: 'instant',
      heal: true,
      attack: { healScale: 1 },
      onHit({ battle, unit, target }) {
        if (!target) return;
        const sc = bv(bb, 'heal_scale'), life = bv(bb, 'projectile_life_time', 4), iv = Math.max(0.2, bv(bb, 'interval', 1));
        if (!(sc > 0) || !(life > 0)) return;
        battle.fx('healField', { x: target.x, y: target.y, id: unit.id });
        for (const a of battle.alliesInRadius(target.x, target.y, 1.5, target.ownerId)) {
          if (a.kind === 'device' || a.s.flags.noHeal || a.profile?.noHeal) continue; // a heal: never on 禁疗 / 孤立
          battle.addBuff(a, {
            key: `lumen:rain:${unit.id}`, duration: life, interval: iv, refresh: 'replace', visible: true, source: unit,
            onTick: ({ unit: x }) => {
              if (!(x.hp < x.s.maxHp)) return;
              battle.heal(unit, x, unit.s.atk * sc, { hot: true });
              battle.tickFx(unit, x, 'lumen:s1');   // lumen_s_1[heal] ON_BUFF_TRIGGER (hp below full): lumen_skill_01_hit
            },
          });
        }
      },
    },
    // S2 沛霖 (2 charges): heal up to max_target allies of her range for heal_scale × ATK; cast with full charges ⇒
    // also cleanse their 异常状态 (蓄力额外效果)
    skchr_lumen_2: {
      kind: instantKind(def),
      heal: true,
      onStart({ battle, unit, skill }) {
        const full = skill.maxCharges > 1 && skill.charges >= skill.maxCharges - 1; // (this cast already spent one)
        const inj = battle.injuredAlliesInKeys(unit.rangeKeys, unit);
        const abn = full ? abnormalAllies(battle, unit).filter((a) => !inj.includes(a)) : [];
        const tgts = inj.concat(abn).slice(0, Math.max(1, Math.floor(num(bb.max_target, 2))));
        for (const t of tgts) {
          battle.heal(unit, t, unit.s.atk * num(bb.heal_scale, 1), { skillHeal: true });
          if (full) cleanse(battle, t);
        }
        battle.fx('heal', { x: unit.x, y: unit.y, id: unit.id, n: tgts.length, charged: full });
      },
    },
  };
  return {
    skills,
    skill: {
      kind: 'ammo',
      heal: true,
      ammo: Math.max(1, Math.floor(num(bb['attack@trigger_time'], 4))),
      mods: { atkPct: num(bb.atk), aspd: num(bb.attack_speed) },
      attack: { healScale: 1 },
      onHit({ battle, unit, target }) { if (unit.mem.lumenAbn && target) cleanse(battle, target); },
      onAttack(ctx) { // only heals on abnormal targets consume a bullet (engine: ctx.noAmmo — no bullet, no ammoUsed)
        if (!ctx.unit.mem.lumenAbn) ctx.noAmmo = true;
        ctx.unit.mem.lumenAbn = false;
      },
    },
    talents: [
      { install(battle, unit) { // S3 targeting / bullet bookkeeping
        if (!isDef) return;
        battle.on('beforeAttack', (ctx) => {
          if (ctx.attacker !== unit || !unit.skill?.active) return;
          const abn = abnormalAllies(battle, unit);
          unit.mem.lumenAbn = abn.length > 0;
          if (abn.length) ctx.targets = [abn[0]];
          if (ctx.profile && ctx.profile !== unit.profile) ctx.profile.healScale = abn.length ? hs : 1;
        }, { owner: unit });
        battle.on('tick', () => { // abnormal allies at full HP are healed too
          const sk = unit.skill;
          if (!sk?.active || !unit.canAct || unit.atkCd > 0 || unit.s.flags.disarm) return;
          if (battle.injuredAlliesInKeys(unit.rangeKeys, unit).length) return;
          const abn = abnormalAllies(battle, unit);
          if (!abn.length) return;
          battle.forceAttack(unit, [abn[0]]);
          unit.atkCd = unit.s.interval;
        }, { owner: unit });
      } },
      { install(battle, unit) { // 凡人之愿: healed targets gain 抵抗
        const base = bv(t0, 'status_resistance[limit]', 0), special = num(t0['lumen_t_1[special].status_resistance[limit]'], base);
        const res = -num(t0.one_minus_status_resistance, -0.5), thr = num(t0.hp_ratio, 0.75);
        battle.on('heal', (ctx) => {
          const t = ctx.target;
          if (ctx.source !== unit || ctx.opts?.regen || !t || !(res > 0) || !(base > 0)) return; // "治疗的目标": not her own 生命回复速度 tick
          const after = Math.min(t.s.maxHp, t.hp + ctx.amount);
          battle.applyStatus(t, 'resist', { duration: after / t.s.maxHp > thr ? special : base, value: Math.min(1, res), source: unit });
        }, { owner: unit, priority: -10 });
      } },
      { install(battle, unit) { // 应急处理
        const sc = num(t1.heal_scale), cd = num(t1.duration, 12);
        let ready = -Infinity;
        battle.on('statusApplied', (ctx) => {
          const t = ctx.target;
          if (!live(unit) || !t || t.side !== 'ally' || !ABNORMAL.has(ctx.status) || battle.time < ready || !(sc > 0)) return;
          if (!unit.rangeKeySet?.has(t.tileR * COLS + t.tileC)) return;
          ready = battle.time + cd;
          battle.heal(unit, t, unit.s.atk * sc);
          battle.fx('emergency', { x: t.x, y: t.y, id: t.id, src: unit.id });
        }, { owner: unit });
      } },
      { install(battle, unit) { // elite module: taunt −1 and 抵抗
        const taunt = num(tb.taunt_level), res = -num(tb.one_minus_status_resistance);
        if (taunt) battle.addBuff(unit, { key: 'lumen:scope', mods: { taunt }, persist: true, allowDead: true });
        // a permanent 抵抗 (survives death/redeploy): any buff with status 'resist' counts (engine resistOf — the
        // strongest one applies, never compounding with 凡人之愿 / 灵知)
        if (res > 0) battle.addBuff(unit, { key: 'lumen:scopeResist', status: 'resist', visible: true, persist: true, allowDead: true, data: { value: Math.min(1, res) } });
      } },
    ],
  };
}

export default {
  chess_char_6_14_a: lumen,
};
