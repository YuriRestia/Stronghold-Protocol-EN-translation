// server/sim/content/kits/ops/op-haruka.js — 遥 (char_4202_haruka) 自选 operator kit: 6★ 护佑者 (辅助), an owned-6★ pick of the
// tier-5 and tier-6 自选 slots; every skill, both talents, the trait and her module (BLS-Y 迟来的纪念) at every form. Kit
// contract and the 自选 rules: ../README.md ("How to add an operator (自选)").
//
// Forms (data/backups.json units.char_4202_haruka): normal = E2 Lv1, skills at rank 4, no module; elite = E2 Lv60, rank 7, the
// picked module at stage 1 (tier 5) or 3 (tier 6) — the owner's decision of 2026-10-05. Full potential (the owner's decision of 2026-10-07).
// Sources: character_table / skill_table / battle_equip_table (zh_CN, as built into backups.json), PRTS 遥 (浮光泡影 备注
// "进行普通攻击判定时，若范围内存在有效目标，则在本次攻击/治疗后同时触发一次赋予浮泡行为；若无有效目标，且范围内存在可赋予
// 浮泡的单位，则本次普通攻击改为赋予浮泡…赋予浮泡时，仅选择不具有浮泡的我方单位，优先选择其中生命比例最低者…触发浮泡破碎的
// 行动节点为“成功受到伤害后”；仅来源于敌方，且造成了生命值真实降低的伤害可触发浮泡破碎；触发后，浮泡将在0.5秒延迟后破碎";
// 扶摇花火 备注 "治疗量的计算使用遥赋予浮泡时的缓存攻击力"; 夜啼彩羽 备注 "浮泡破碎后优先给予生命比例最低的单位浮泡"; 幽隙栖萤
// 备注 "伤害溅射半径1.7，可对空…治疗量为0时将不会造成法术伤害…每次部署时，重新计算该技能的使用次数"; 夏末游鳞 备注 "触发浮空
// 效果与触发浮泡破碎的判定采用相同逻辑；即将破碎的浮泡仍能对伤害来源制造浮空效果…无法对持有无敌/不可选中/浮空免疫的来源生效
// （伤害绑定于该浮空效果上）"), and the client's battle data read from the local install — charpack char_4202_haruka (every
// mode's attack = AttackAndShield when it has a target, else ShieldOnly; the shield selector: allies, no haruka_t_1 holder,
// lowest HP share first, max_target_shield; S2 adds attack@max_target_heal_add / max_target_shield_add to the trait's and the
// talent's counts) and buff_template_data haruka_t_1 / haruka_t_1_delay / haruka_s_2 / haruka_s_2[damage] / haruka_s_3_scale
// / haruka_s_3_debuff_delay / haruka_s_3_debuff.
// - Trait (护佑者) "攻击造成法术伤害，技能开启后改为治疗友方单位（治疗量相当于75%攻击力）": ranged arts bolts (y-6, hits air
//   units), blocks 1, ground enemies target her; while any skill runs every attack heals the most injured allies of her
//   range (attack@max_target_heal of them, heal_scale × ATK). BLS-Y “迟来的纪念” "攻击对2个目标…改为治疗2个友方单位"
//   (attack@max_target / attack@max_target_heal 2). Every skill keeps the data trigger: a 辅助's basic strategy casts on
//   an enemy she is about to attack (S1 / S2 DEFAULT), S3 ACTIVE_RANGE on its y-8 (the owner's rule of 2026-10-05).
// - T1 浮光泡影 "每过一个攻击间隔，使范围内一名友方单位获得30%庇护的浮泡，浮泡在受到敌方伤害的短暂延迟后破碎": with each
//   attack or heal she gives a bubble to max_target_shield allies of her current range that hold none (operators and summons,
//   禁疗 ones too — ignoreHealFree; never a 孤立 one; herself included), the lowest HP share first; with no target to attack
//   or heal but such an ally, the attack itself becomes the bubble (it takes the attack interval); with neither she waits.
//   A bubble (no time limit, it outlasts her [ASSUMED: the ability's buff, not removed on her leaving]) gives 庇护
//   damage_resistance (phys / arts taken ×(1 − v); the client's override key damage_resistance[bonus] — not the common 庇护
//   damage_resistance[inf] of other operators, so it multiplies with those) — while her S3 runs ×damage_resistance_scale
//   (haruka_s_3_scale re-reads every bubble of hers at its start and end). Damage from an enemy (a `source` on the enemy side)
//   that lowered its holder's HP sets it off: 0.5 s (bb interval) later it breaks — once, later hits change nothing.
// - T2 扶摇花火 "浮泡破碎时，为所在的单位治疗相当于遥攻击力25%的生命值" (full potential: 28%): the break heals the holder
//   heal_scale × her ATK as it was when she gave the bubble (a 治疗 — her heal, also after she left). BLS-Y stage 2+
//   "并有20%的概率回复1点技力": then prob to give sp SP to the holder (the client's ModifySp on the BUFF_OWNER).
// - S1 夜啼彩羽 (MANUAL, DEFAULT, 19 / 20 s): ASPD +attack_speed; heals; while it runs a breaking bubble at once gives a new one
//   to the ally of the 8 tiles around its holder that holds none, the lowest HP share first (haruka_t_1_delay → shield_s1).
// - S2 幽隙栖萤 (MANUAL, DEFAULT, 22 / 23 s): heals (attack@max_target_heal_add more targets), max_target_shield_add more
//   bubbles per attack (rank 7: +1 / +1); every heal of hers meanwhile (the trait's and T2's — ON_AFTER_OUTPUT_HEAL, the heal's
//   value after the healing multipliers; none under 禁疗) deals that value × atk_scale_extra as arts damage to
//   max_target_extra enemies within ability_range_radius (1.7) of the healed unit, air units too — the nearest first
//   [ASSUMED: the ExtraSelect order]. "第二次及以后使用时攻击力+25%，且持续时间无限": the uses of the deployment are counted
//   (PRTS); from the second on ATK +atk and it never ends (haruka_s_2[first].atk = 0 for the first).
// - S3 夏末游鳞 (MANUAL, ACTIVE_RANGE, 40 s): ATK +atk, range y-8, attack interval +base_attack_time s (−0.4 / −0.6 on 1.6),
//   heals, her bubbles ×damage_resistance_scale; an enemy whose damage sets one of her bubbles off (the same test; also a
//   bubble already breaking) is 浮空 levitate_duration s (the catalogue status: immunity, 抵抗, half on 重量 > 3; not an
//   invulnerable / untargetable one) and while it stays levitated takes atk_scale × her ATK arts damage per second (the
//   first after 0.5 s, then every `interval` s; 持续伤害, not dodgeable; 无来源 at her last ATK once she left).

import { num, up, traitBb, talentBb, skillRec, batMod, giveSp, protectMods } from '../shared/tier1.js';
import { absoluteRangeKeys } from '../../../targeting.js';
import { COLS } from '../../../constants.js';

const S1 = 'skchr_haruka_1';
const S2 = 'skchr_haruka_2';
const S3 = 'skchr_haruka_3';
/** A bubble (haruka_t_1): one per unit, whoever gave it — the selector skips holders. */
export const BUBBLE = 'haruka:bubble';
/** The S3 levitation damage (haruka_s_3_debuff). */
export const FLOAT_DOT = 'haruka:float';
/** 浮光泡影: the break delay when the talent carries no `interval`. */
const BREAK_DELAY = 0.5;
/** S3's levitation damage: the first tick (haruka_s_3_debuff firstTriggerInterval). */
const FLOAT_FIRST = 0.5;
/** 幽隙栖萤: the splash radius when the blackboard carries none (PRTS 备注 1.7). */
const S2_RADIUS = 1.7;
/** The 8 tiles around a unit and its own (夜啼彩羽's shield_s1 area; the holder itself is left out). */
const X4 = Object.freeze([[1, -1], [1, 0], [1, 1], [0, -1], [0, 0], [0, 1], [-1, -1], [-1, 0], [-1, 1]]);

const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};
const tileKey = (r, c) => r * COLS + c;
const skillOn = (u, id) => !!(u && u.skill && u.skill.id === id && u.skill.active);

/** Allies that may get a bubble from `by` on tile keys `keys`: no bubble yet, not 孤立; the lowest HP share first. */
function bubbleCands(battle, by, keys, except = null) {
  const out = battle.allyUnits.filter((a) => a.alive && a.deployed && !a.hidden && a.kind !== 'device' && a !== except
    && keys.has(tileKey(a.tileR, a.tileC)) && !a.findBuff(BUBBLE) && battle.allySelectable(a, by));
  out.sort((a, b) => a.hpRatio - b.hpRatio || a.deploySeq - b.deploySeq || a.id - b.id);
  return out;
}

export default {
  char_4202_haruka: (bb, chess) => {
    const tb = traitBb(chess);
    const t1 = talentBb(chess, 0), t2 = talentBb(chess, 1);
    const b1 = bbOf(chess, S1), b2 = bbOf(chess, S2), b3 = bbOf(chess, S3);
    const s2 = skillRec(chess, S2), s3 = skillRec(chess, S3);
    const atkTargets = Math.max(1, Math.floor(num(tb['attack@max_target'], 1)));
    const healTargets = Math.max(1, Math.floor(num(tb['attack@max_target_heal'], 1)));
    const healAttack = (n) => Object.freeze({
      dmgType: 'heal', heal: n > 1 ? { mode: 'multi', count: n } : { mode: 'single' }, healScale: num(tb.heal_scale, 0.75),
      maxTargets: n, projectile: 'none',
    });
    const shelter = num(t1.damage_resistance, 0.3), breakDelay = num(t1.interval, BREAK_DELAY);
    const bubbles = Math.max(1, Math.floor(num(t1.max_target_shield, 1)));
    const t2Heal = num(t2.heal_scale), t2Prob = num(t2.prob), t2Sp = num(t2.sp);
    const s3Scale = num(b3.damage_resistance_scale, 1);
    /** Bubbles per grant: the talent's, + S2's add while it runs. */
    const grantCount = (u) => bubbles + (skillOn(u, S2) ? Math.max(0, Math.floor(num(b2.max_target_shield_add))) : 0);
    /** A bubble's 庇护 now: ×damage_resistance_scale while her S3 runs. */
    const shelterNow = (u) => shelter * (skillOn(u, S3) ? s3Scale : 1);

    /** Give `a` a bubble from `u` (its 庇护, her ATK of now for the T2 heal). */
    function bubble(battle, u, a) {
      const v = shelterNow(u);
      battle.addBuff(a, {
        key: BUBBLE, source: u, visible: true, mods: protectMods(v), tags: ['talent'],
        data: { v, atk: u.s.atk, heal: t2Heal, prob: t2Prob, sp: t2Sp, boom: false },
      });
      battle.fx('shield', { x: a.x, y: a.y, id: a.id, kind: 'bubble' });
    }
    /** One bubble grant of `u` on her current range: up to grantCount allies. Returns how many got one. */
    function grant(battle, u) {
      const list = bubbleCands(battle, u, u.rangeKeySet || new Set(u.rangeKeys || []));
      const n = Math.min(grantCount(u), list.length);
      for (let i = 0; i < n; i++) bubble(battle, u, list[i]);
      return n;
    }
    /** Re-read the 庇护 of every bubble of `u` (S3's start / end). */
    function rescale(battle, u) {
      const v = shelterNow(u);
      for (const a of battle.allyUnits) {
        const b = a.findBuff(BUBBLE);
        if (!b || b.source !== u || !b.data || Math.abs(b.data.v - v) < 1e-12) continue;
        b.data = { ...b.data, v };
        b.mods = protectMods(v);
        a.markDirty();
      }
    }
    /** S3: levitate the enemy whose damage set a bubble of `u` off, and its per-second damage while it floats. */
    function levitate(battle, u, e) {
      if (!e || !e.alive || e.side !== 'enemy' || e.s.flags.invulnerable || e.s.flags.untargetable) return;
      const dur = num(b3.levitate_duration);
      if (!(dur > 0) || !battle.applyStatus(e, 'levitate', { duration: dur, source: u })) return;
      const iv = Math.max(0.1, num(b3.interval, 1)), scale = num(b3.atk_scale);
      let lastAtk = u.s.atk;
      battle.addBuff(e, {
        key: `${FLOAT_DOT}#${u.id}`, duration: dur + 0.05, source: u, tags: ['skill'],
        data: { next: battle.time + FLOAT_FIRST },
        onTick: ({ battle: b, unit: tgt, buff }) => {
          if (!tgt.s.flags.levitate) { b.removeBuff(tgt, buff); return; }
          if (b.time + 1e-9 < buff.data.next) return;
          buff.data = { next: buff.data.next + iv };
          const here = up(u);
          if (here) lastAtk = u.s.atk;
          b.dealDamage(u, tgt, { amount: lastAtk * scale, type: 'arts', canDodge: false, isSkill: true, sourceless: !here, tags: ['skill', 'dot', 'haruka:float'] });
        },
      });
      battle.fx('levitate', { x: e.x, y: e.y, id: e.id });
    }
    /** A bubble of `u` on `a` breaks (the delay is over): T2's heal and SP, S1's next bubble. */
    function burst(battle, u, a, buff) {
      battle.removeBuff(a, buff);
      const d = buff.data;
      if (d.heal > 0) {
        battle.heal(u, a, d.atk * d.heal);
        battle.fx('heal', { x: a.x, y: a.y, id: a.id });
        if (d.prob > 0 && d.sp > 0 && battle.rng.chance(d.prob)) giveSp(a, d.sp);
      }
      if (skillOn(u, S1) && up(u)) {
        const keys = new Set(absoluteRangeKeys(X4, a.tileR, a.tileC, a.dir || 'RIGHT', 0));
        const next = bubbleCands(battle, u, keys, a)[0];
        if (next) bubble(battle, u, next);
      }
    }

    return {
      trait: atkTargets > 1 ? { maxTargets: atkTargets } : null,
      skills: {
        [S1]: { kind: 'duration', mods: { aspd: num(b1.attack_speed) }, attack: healAttack(healTargets) },
        [S2]: {
          kind: 'duration', attack: healAttack(healTargets + Math.max(0, Math.floor(num(b2['attack@max_target_heal_add'])))),
          onStart({ battle, unit }) {
            unit.mem.harukaS2Uses = (unit.mem.harukaS2Uses ?? 0) + 1;
            unit.mem.harukaS2Endless = unit.mem.harukaS2Uses >= 2;
            const atk = unit.mem.harukaS2Endless ? num(b2.atk) : num(b2['haruka_s_2[first].atk']);
            if (atk) battle.addBuff(unit, { key: 'haruka:s2:atk', mods: { atkPct: atk }, tags: ['skill'] });
          },
          // 持续时间无限 (2nd use on): the bar stays full and the skill never ends
          onTick({ unit, skill }) { if (unit.mem.harukaS2Endless) skill.timeLeft = Math.max(skill.timeLeft, s2?.duration ?? skill.duration); },
          onEnd({ battle, unit }) { battle.removeBuff(unit, 'haruka:s2:atk'); unit.mem.harukaS2Endless = false; },
        },
        [S3]: {
          kind: 'duration',
          mods: { atkPct: num(b3.atk), batPct: batMod(b3.base_attack_time, chess) },
          targeting: { rangeGrid: s3?.rangeGrid ?? null },
          attack: healAttack(healTargets),
          onStart({ battle, unit }) { rescale(battle, unit); },
          onEnd({ battle, unit }) { rescale(battle, unit); },   // (`active` is already false: ×1 again)
        },
      },
      talents: [
        { install(battle, unit) { // 浮光泡影: a bubble with each attack / heal, or instead of one; the break
          battle.on('attack', (c) => { if (c.attacker === unit && up(unit)) grant(battle, unit); }, { owner: unit });
          // no target to attack or heal but an ally to bubble: the attack becomes the bubble (ShieldOnly)
          battle.on('tick', () => {
            if (!up(unit) || !unit.canAct || unit.s.flags.disarm || unit.atkCd > 0 || unit.trait.hadTarget !== false) return;
            if (grant(battle, unit) > 0) unit.atkCd = Math.max(unit.atkCd, unit.s.interval);
          }, { owner: unit });
          battle.on('damaged', (c) => {
            const a = c.target, src = c.source;
            if (!a || a.side !== 'ally' || !src || src.side !== 'enemy' || !(c.amount > 0) || c.type === 'element') return;
            const b = a.findBuff(BUBBLE);
            if (!b || b.source !== unit) return;
            if (skillOn(unit, S3) && up(unit)) levitate(battle, unit, src);
            if (b.data.boom) return;
            b.data = { ...b.data, boom: true };
            battle.after(breakDelay, () => { if (a.alive && a.findBuff(BUBBLE) === b) burst(battle, unit, a, b); }, { owner: a });
          }, { owner: unit });
          battle.on('deploy', (c) => { if (c.unit === unit) { unit.mem.harukaS2Uses = 0; unit.mem.harukaS2Endless = false; } }, { owner: unit });
        } },
        { install(battle, unit) { // 幽隙栖萤: each heal of hers while S2 runs ⇒ arts damage around the healed unit
          if (unit.skill?.id !== S2) return;
          const scale = num(b2.atk_scale_extra), n = Math.max(0, Math.floor(num(b2.max_target_extra)));
          const r = num(b2.ability_range_radius, S2_RADIUS);
          battle.on('heal', (c) => {
            if (c.source !== unit || c.opts?.regen || !skillOn(unit, S2) || !(c.amount > 0) || !(scale > 0) || !n) return;
            const t = c.target;
            const foes = battle.foesInRadius(t.x, t.y, r);
            foes.sort((x, y) => Math.hypot(x.x - t.x, x.y - t.y) - Math.hypot(y.x - t.x, y.y - t.y) || x.spawnSeq - y.spawnSeq);
            const amount = c.amount * scale;
            for (const e of foes.slice(0, n)) battle.dealDamage(unit, e, { amount, type: 'arts', isSkill: true, tags: ['skill', 'haruka:s2'] });
            if (foes.length) battle.fx('aoe', { x: t.x, y: t.y, radius: r, id: unit.id, skill: 'haruka:s2' });
          }, { owner: unit, priority: -1000 });
        } },
      ],
    };
  },
};
