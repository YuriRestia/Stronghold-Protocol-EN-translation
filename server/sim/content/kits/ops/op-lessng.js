// server/sim/content/kits/ops/op-lessng.js — 止颂 (char_4011_lessng) 自选 operator kit: 6★ 无畏者 (近卫), an owned-6★ pick of
// the tier-5 and tier-6 自选 slots; every skill, both talents, the trait and both modules at every form.
// Kit contract and the 自选 rules: ../README.md ("How to add an operator (自选)").
//
// Forms (data/backups.json units.char_4011_lessng, the DIY slot statuses): normal = E2 Lv1, skills at rank 4, no module;
// elite = E2 Lv60, rank 7, the picked module at stage 1 (tier 5) or 3 (tier 6). Full potential (the owner's decision of 2026-10-07).
// Sources: character_table / skill_table / battle_equip_table (zh_CN, as built into backups.json); PRTS 止颂 (苦痛专注 备注
// "将降低无来源或任意来源于非“自身阻挡的敌人”的物理、法术伤害…伤害降低效果于“受到伤害前”生效…<Y模组>额外效果为在计算伤害前，若伤害
// 目标满足条件则临时获取…物理穿透（百分比）Buff（不可叠加，直接加算）"; 痛楚砺刃 备注 "天赋于受到伤害时触发，无需成功受到伤害也可
// 生效…重复受到伤害时，重置本天赋持续时间"; 苦修破誓 备注 "技能期间，持有状态免疫、晕眩反制、寒冷反制、冻结反制…技能开启时，若有
// 异常状态，会先对自身造成法术伤害（来源为自身，可致死），然后清除自身所有异常状态，最后再获得技能效果"; DRE-X 备注 "于每次计算伤害时检查
// 目标是否处于阻挡/被阻挡状态…提升效果为攻击力倍率提升"; DRE-Y 备注 "属于免死效果，触发效果后获得属性变化后生命上限100%的生命复原");
// the client's battle data — buff_template_data `lessng_t1` (ON_APPLYING_MODIFIER: he blocks, the source is not blocked by
// him ⇒ DamageScale 1 − damage_resistance on PHYSICAL_AND_MAGICAL), `lessng_t2` (ON_TAKE_DAMAGE ⇒ ATK MULTIPLIER for
// add_atk_duration), `lessng_s3[atk_scale]` / `lessng_e_002_trait[blocked]` (ON_CALCULATE_DAMAGE, CheckBlocked of the
// target — by anyone — ⇒ AtkScaleUp), `lessng_s3[anti]`, `lessng_e_003_trait` / `lessng_e_003_talent`; charpack
// char_4011_lessng (S2 mode: `_additionalTimes` 1, its talent with `_applyTalentScale`), skchr_lessng_2 (`_castOnLocate`,
// the mode for `duration` s), skchr_lessng_3 (`_canUseInAbnormalState`); his skeleton (Skill_2_Loop: OnAttack 0.300 / 0.567 s).
// - Trait (无畏者) "能够阻挡一个敌人": the profession default (block 1, melee, ground only). Module DRE-X “沉锋之束” "攻击被阻挡
//   的敌人时攻击力提升至115%" (trait bb atk_scale): ×atk_scale on his attack's ATK against a target blocked by anyone (a
//   profile dmgMul — the scale of the attack, before DEF). Module DRE-Y “苦修者的抗压训练” "被击倒时不撤退且回复所有生命但生命上限
//   -60%，攻击速度+30（单次部署只触发1次）" (trait bb max_hp 0.4 / attack_speed / hp_ratio): the first lethal hit of a deployment
//   is prevented, max HP ×max_hp (FINAL_SCALER) and ASPD +attack_speed for the rest of that deployment, HP set to hp_ratio of
//   the new max (生命复原, not a heal); not while a 不死 already holds him ("_dontConsumeWhenUndeadable": 坚固维式重锤's window,
//   items/battle.js holdsUndying).
// - T1 苦痛专注 "阻挡时，受到来自非自身阻挡敌人的物理和法术伤害降低35%" (bb damage_resistance): while he blocks an enemy, a
//   physical or arts damage instance whose source is not an enemy he blocks — 无来源, an ally, himself included — is
//   ×(1 − damage_resistance) (`hit`: before the 伤判 / barrier steps). S2's window doubles it (talent_scale). DRE-Y stage 3:
//   40 %, and "攻击自身阻挡的敌人时，无视目标12%的防御力" (the hidden module talent's def_penetrate: defIgnorePct on his damage to an
//   enemy he blocks).
// - T2 痛楚砺刃 "受到伤害后，攻击力+12%，持续15秒（不可叠加）" (full potential: +16 %; bb atk / add_atk_duration): every damage
//   instance aimed at him (`hit`, so a dodged or shielded one too; never a 流失) sets ATK +atk for add_atk_duration s,
//   refreshed, never stacked. DRE-X stage 3: +24 %.
// - S1 强力击·γ型 (AUTO, attack SP 3; data DEFAULT): the next attack at atk_scale × ATK.
// - S2 虔修对决 (PASSIVE, 部署后, 18 / 21 s): from every deployment for the skill's duration: 苦痛专注 ×talent_scale, ATK +atk and
//   every attack strikes twice (2连击 — both strikes land in the attack [ASSUMED: the skeleton's 0.267 s between them is not
//   modelled]); then back to his single attack (lessng_s2[switch_mode]).
// - S3 苦修破誓 (MANUAL, 20 s; data DEFAULT): max HP +max_hp (MULTIPLIER), attacks on a blocked target (by anyone) at
//   lessng_s3[atk_scale] × ATK, immune to every 异常状态 (晕眩, 寒冷, 冻结 … — tier6 ABNORMAL) while it runs. Cast while under a
//   异常状态: magical_value arts damage to himself first (source himself, may knock him out; 苦痛专注 and 痛楚砺刃 see it as any
//   damage), then every 异常状态 is cleansed, then the effects apply (the HP buff after the damage). "可以无视异常状态开启": the
//   basic strategy casts it when he is about to attack, and 沉默 does not hold it back; 晕眩 / 冻结 / 沉睡 stop his attack and so
//   the cast [ASSUMED: the official 基础策略 waits for an attack too].
// Melee, ground-only (data canHitFly false: no anti-air); ground enemies target him normally (no 起飞 / 迷彩 / 隐匿).

import { num, talentBb, moduleBb, traitBb, skillRec, up } from '../shared/tier1.js';
import { ABNORMAL, hasAbnormal, cleanseAbnormal } from '../shared/tier6.js';
import { holdsUndying } from '../../items/battle.js';

const S1 = 'skchr_lessng_1';
const S2 = 'skchr_lessng_2';
const S3 = 'skchr_lessng_3';
/** S2 虔修对决's window after a deployment (2连击, ATK, 苦痛专注 ×talent_scale). */
export const DUEL_KEY = 'skill:lessng:duel';
/** S3 苦修破誓's effects while it runs (max HP; the status immunity and the blocked-target scale read it). */
export const OATH_KEY = 'skill:lessng:oath';
export const PAIN_KEY = 'talent:lessng:pain';
export const REBORN_KEY = 'trait:lessng:reborn';

const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};
/** He blocks at least one living enemy (苦痛专注 "阻挡时"). */
const blocking = (u) => u.blocking.some((e) => e && e.alive && e.blockedBy === u);

export default {
  char_4011_lessng: (bb, chess) => {
    const tb = traitBb(chess);       // DRE-X: atk_scale; DRE-Y: max_hp / attack_speed / hp_ratio / value
    const t0 = talentBb(chess, 0);   // 苦痛专注 (DRE-Y stage 3: 0.4)
    const t1 = talentBb(chess, 1);   // 痛楚砺刃 (DRE-X stage 3: 0.24)
    const hb = moduleBb(chess);      // DRE-Y stage 3: def_penetrate
    const b1 = bbOf(chess, S1), b2 = bbOf(chess, S2), b3 = bbOf(chess, S3);
    const s2 = skillRec(chess, S2);
    const blockedScale = num(tb.atk_scale, 1);
    const oathScale = num(b3['lessng_s3[atk_scale].atk_scale'], 1);
    const duelOn = (u) => !!u.findBuff(DUEL_KEY);
    const oathOn = (u) => !!u.findBuff(OATH_KEY);
    return {
      skills: {
        [S1]: { kind: 'instant', attack: { atkScale: num(b1.atk_scale, 1) } },
        [S2]: {
          kind: 'passive',
          onStart({ battle, unit }) { // every deployment (skills.js reset → passive start)
            const dur = num(s2?.duration);
            if (dur > 0) battle.addBuff(unit, { key: DUEL_KEY, duration: dur, mods: { atkPct: num(b2.atk) }, tags: ['skill'], visible: true });
          },
        },
        [S3]: {
          kind: 'duration',
          onStart({ battle, unit }) {
            if (hasAbnormal(unit)) {
              battle.dealDamage(unit, unit, { amount: num(b3.magical_value), type: 'arts', canDodge: false, isSkill: true, tags: ['skill', 'lessngOath'] });
              if (!unit.alive) return;
              cleanseAbnormal(battle, unit);
            }
            battle.addBuff(unit, { key: OATH_KEY, mods: { hpPct: num(b3.max_hp) }, tags: ['skill'], visible: true });
          },
          onEnd({ battle, unit }) { battle.removeBuff(unit, OATH_KEY); },
        },
      },
      trait: {
        // S2's 2连击 (only while its window runs; 1 otherwise and under every other skill)
        hitsFn: (b, u) => (duelOn(u) ? 2 : 1),
        // DRE-X ×atk_scale and S3 ×lessng_s3[atk_scale] on a blocked target (CheckBlocked of the target: by anyone)
        dmgMul: (b, u, t) => (t && t.blockedBy ? blockedScale * (oathOn(u) ? oathScale : 1) : 1),
      },
      talents: [
        { install(battle, unit) { // 苦痛专注
          const cut = num(t0.damage_resistance), scale2 = num(b2.talent_scale, 1);
          if (!(cut > 0)) return;
          battle.on('hit', (c) => {
            if (c.target !== unit || !up(unit) || !blocking(unit)) return;
            const d = c.dmg;
            if (!d || (d.type !== 'phys' && d.type !== 'arts')) return;
            const src = c.source;   // null = 无来源
            if (src && src.side === 'enemy' && src.blockedBy === unit) return;
            d.mul *= Math.max(0, 1 - cut * (duelOn(unit) ? scale2 : 1));
          }, { owner: unit });
        } },
        { install(battle, unit) { // 痛楚砺刃
          const atk = num(t1.atk), dur = num(t1.add_atk_duration, 15);
          if (!atk) return;
          battle.on('hit', (c) => {
            if (c.target !== unit || !up(unit)) return;
            battle.addBuff(unit, { key: PAIN_KEY, duration: dur, refresh: 'replace', mods: { atkPct: atk }, tags: ['talent'], visible: true });
          }, { owner: unit });
        } },
      ],
      install(battle, unit) {
        // DRE-Y stage 3: 攻击自身阻挡的敌人时，无视目标12%的防御力 (every damage of his to an enemy he blocks)
        const pen = num(hb.def_penetrate);
        if (pen > 0) {
          battle.on('hit', (c) => {
            if (c.source === unit && c.target && c.target.side === 'enemy' && c.target.blockedBy === unit) c.dmg.defIgnorePct += pen;
          }, { owner: unit });
        }
        // DRE-Y trait: 被击倒时不撤退且回复所有生命但生命上限-60%，攻击速度+30（单次部署只触发1次）
        if (tb.hp_ratio != null && (tb.max_hp != null || tb.value != null)) {
          const hpMul = tb.max_hp != null ? num(tb.max_hp, 0.4) : 1 - num(tb.value, 0.6);
          let usedSeq = -1;
          battle.on('fatal', (c) => {
            if (c.unit !== unit || c.prevented || usedSeq === unit.deploySeq || holdsUndying(battle, unit)) return;
            c.prevented = true;
            usedSeq = unit.deploySeq;
            battle.addBuff(unit, { key: REBORN_KEY, mods: { hpMul: Math.max(0.05, hpMul), aspd: num(tb.attack_speed) }, tags: ['trait'], visible: true });
            unit.hp = Math.max(1, unit.s.maxHp * num(tb.hp_ratio, 1));
            battle.fx('revive', { x: unit.x, y: unit.y, id: unit.id, module: true });
          }, { owner: unit, priority: -60 });
        }
        // S3 苦修破誓: status immunity while it runs; "可以无视异常状态开启" — 沉默 does not hold the basic-strategy cast back
        battle.on('beforeStatus', (c) => {
          if (c.target === unit && oathOn(unit) && ABNORMAL.has(c.status)) c.cancel = true;
        }, { owner: unit });
        battle.on('beforeAttack', (c) => {
          const sk = unit.skill;
          if (c.attacker !== unit || !sk || sk.id !== S3 || !sk.ready || sk.active || sk.opCooling || !unit.s.flags.silence) return;
          sk.activate('abnormal');
        }, { owner: unit });
      },
    };
  },
};
