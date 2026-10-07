// server/sim/content/kits/ops/op-pallas.js — 帕拉斯 (char_485_pallas) 自选 operator kit: 6★ 教官 (近卫), an owned-6★ pick of
// the tier-5 and tier-6 自选 slots; every skill, both talents, the trait and both modules at every form.
// Kit contract and the 自选 rules: ../README.md ("How to add an operator (自选)").
//
// Forms (data/backups.json units.char_485_pallas, the DIY slot statuses): normal = E2 Lv1, skills at rank 4, no module;
// elite = E2 Lv60, rank 7, the picked module at stage 1 (tier 5) or 3 (tier 6). Full potential (the owner's decision of 2026-10-07).
// Sources: character_table / skill_table / battle_equip_table (zh_CN, as built into backups.json); PRTS 帕拉斯 (英勇的祝福 备注
// "持有增益的干员撤退时，增益立刻转交至帕拉斯；自身持有增益，满足条件的干员部署时，帕拉斯的增益立刻转交给对方"; 女神的振奋 备注
// "本天赋无视自身获得的禁疗，且必定进行治疗"); gamedata_const ba.strong 精力充沛 "生命值高于一定比例时获得一定属性加成（同类属性取
// 最高）"; the client's battle data — charpack char_485_pallas (英雄的诞生: an aura on every ally tagged `minos`; S3: an aura on
// her 1-1 for operators only, professionMask without TOKEN / TRAP), skchr_pallas_1 (`_additionalTimes` 1), buff_template_data
// `pallas_t_2` / `pallas_t_2[heal]`, `pallas_s_3[peak]`, `pallas_e_t_2[trigger]` and [uc]equips pallas_equip_2_x_p2.
// - Trait (教官) "可以攻击到较远敌人，攻击自身未阻挡的敌人时攻击力提升至120%": the profession profile (professions.js
//   instructor: ×atk_scale on a target she does not block, her attacks only; range 2-2). Module INS-X “故乡的山岩” raises
//   it to 130% (its traitOverride bb atk_scale, read by the profile through the composed record).
// - T1 英雄的诞生 "在场时，所有【米诺斯】干员生命值高于80%时获得+25%攻击力的精力充沛" (bb peak_performance.hp_ratio / .atk):
//   while she is deployed, every allied operator of nation minos (her included — the aura has no self exclusion) gets ATK
//   +atk while its HP ratio is above hp_ratio. INS-X stage 3: above 50 %, +30 % (the module's talent change). 精力充沛 of
//   several sources is "同类属性取最高": one buff per ally carrying the highest ATK bonus whose HP condition holds (her T1
//   and her S3 alike, several 帕拉斯 of a shared field too), re-evaluated every tick. 帕拉斯 is the only minos operator of
//   the data (chess.json and backups.json), so in practice the talent is hers.
// - T2 女神的振奋 "每攻击一名敌人时为自身与身前一格的我方干员恢复40点生命值" (full potential: 45; bb value): pallas_t_2 is
//   ON_OUTPUT_DAMAGE — every damage instance she deals (S1's two strikes, each S3 target) heals every ally on her 1-1 (her tile and
//   the tile in front, rotated with her) `value` HP, a heal that ignores 禁疗 (FixedValueHeal _ignoreHealFree; PRTS 备注) but not
//   "不成为其他角色的治疗目标" (the heal's selector is HEAL-purpose). INS-Y “赫里亚之辉” stage 2+: value 60 (full potential: 65)
//   and "并使所有【米诺斯】干员额外恢复40点生命值" (talent bb pallas_e_t_2.value): pallas_e_t_2[trigger] (ON_OUTPUT_DAMAGE) uses
//   pallas_e_heal on every ally its aura marks — tags minos, _selfOption INCLUDE, so herself too — for that much more (also
//   ignoring 禁疗).
// - Module INS-Y "可以额外部署在远程位" (hidden module talent buildable_type 2) is a placement rule of the prep, not of the
//   battle: by the owner's decision of 2026-10-04 (shared/highGround.js) only elite 歌蕾蒂娅 + HOK-Y may take a 高台, so a
//   帕拉斯 piece stays on the melee tiles — an open question for the owner (DESIGN draft 0.2.0.o9), nothing in this kit.
// - S1 胜利的连击 (AUTO, attack SP 3; data DEFAULT): the next attack strikes its target twice for atk_scale × ATK physical
//   (skchr_pallas_1 `_additionalTimes` 1, `_triggerDelta` 0.1 s: the second strike 0.1 s after the first — both land in the
//   attack here [ASSUMED: the 0.1 s is not modelled]); the instructor ×1.2 applies to each strike.
// - S2 信念的长鞭 (MANUAL, 20 / 22 s): attack range +ability_range_forward_extend tile forward (2-2 ⇒ 4 tiles: targeting
//   rangeExtend, the card's live range follows), ATK +atk, every attack attack@buff_prob to stun its target attack@stun s.
//   Its trigger is the data's DEFAULT: tools/build-data.mjs ATTACK_RANGE_CHANGE does not read "攻击范围向前延伸一格", so the
//   owner's ACTIVE_RANGE rule (a running range that strictly contains the own one) does not reach it — reported, not
//   worked around (the brief: report a trigger that looks wrong).
// - S3 英勇的祝福 (MANUAL, 30 s; data DEFAULT): ATK +atk, attacks hit attack@max_target (3) targets; the operator deployed
//   on the tile in front of her, when that tile is low ground (pallas_s_3[peak] CheckHeightTypeOfRootTile LOWLAND: on any
//   other tile the buff is finished on it), holds "生命值高于80%获得+35%攻击力的精力充沛、防御力+20%、阻挡数+1"
//   (attack@peak_performance.hp_ratio / .atk, attack@def, attack@block_cnt) — else she holds it herself; the holder is
//   re-read every tick, so it passes to her the moment the front operator leaves and back when one deploys there (PRTS
//   备注). Summons do not hold it (the aura's professionMask). The DEF / block part is per source (independentCharacterSource).
// Melee, ground-only (data canHitFly false: no anti-air); ground enemies target her normally (no 起飞 / 迷彩 / 隐匿).

import { num, talentBb, skillRec, up, alliesInGridOf } from '../shared/tier1.js';
import { frontOf } from '../../../dir.js';

const S1 = 'skchr_pallas_1';
const S2 = 'skchr_pallas_2';
const S3 = 'skchr_pallas_3';
/** The nation of 英雄的诞生 / pallas_e_heal (the client's `minos` tag = character_table nationId minos). */
const MINOS = 'minos';
/** T2's heal area: her 1-1 (pallas_t_2 `_rangeId` 1-1) — her tile and the tile in front. */
const RANGE_1_1 = Object.freeze([[0, 0], [0, 1]]);
/** The one 精力充沛 buff of an ally (ba.strong "同类属性取最高"). */
export const PEAK_KEY = 'talent:pallas:peak';
/** The S3 holder's DEF / block buff, per 帕拉斯 (independentCharacterSource). */
export const holderKey = (unit) => `skill:pallas:blessing#${unit.id}`;

const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};
const isMinos = (a) => !!a && a.kind === 'op' && (a.def?.raw?.nationId ?? a.def?.nationId) === MINOS;

/**
 * The 精力充沛 sources of a battle (a Set of `(ally) => ATK bonus`, 0 when one does not apply); the first registration
 * installs the battle-wide tick that keeps, on every deployed ally, one buff with the highest bonus whose HP condition
 * holds (never a sum: "同类属性取最高").
 */
const PEAKS = new WeakMap();
function peakSources(battle) {
  let set = PEAKS.get(battle);
  if (set) return set;
  PEAKS.set(battle, (set = new Set()));
  battle.on('tick', () => {
    for (const a of battle.allyUnits) {
      if (!a.alive || !a.deployed || a.kind === 'device') continue;
      let v = 0;
      for (const f of set) v = Math.max(v, f(a));
      const cur = a.findBuff(PEAK_KEY);
      if ((cur?.data?.v ?? 0) === v) continue;
      if (v > 0) battle.addBuff(a, { key: PEAK_KEY, mods: { atkPct: v }, data: { v }, tags: ['talent'] });
      else battle.removeBuff(a, PEAK_KEY);
    }
  });
  return set;
}

/**
 * The holder of 英勇的祝福's buff: the operator deployed on the tile in front of her when it stands on low ground (and her
 * aura may select it), else herself.
 */
export function blessingHolder(battle, unit) {
  const [fr, fc] = frontOf(unit.tileR, unit.tileC, unit.dir, 1);
  const a = battle.grid.inRect(fr, fc) ? battle.unitAt(fr, fc) : null;
  if (a && a !== unit && a.side === 'ally' && a.kind === 'op' && a.deployed && a.ground !== false && battle.grid.isLow(fr, fc)
    && battle.allySelectable(a, unit)) return a;
  return unit;
}

export default {
  char_485_pallas: (bb, chess) => {
    const t0 = talentBb(chess, 0);   // 英雄的诞生 (INS-X stage 3: hp_ratio 0.5, atk 0.3)
    const t1 = talentBb(chess, 1);   // 女神的振奋 (INS-Y stage 3: value 65, pallas_e_t_2.value 40)
    const b1 = bbOf(chess, S1), b2 = bbOf(chess, S2), b3 = bbOf(chess, S3);
    const blessDef = num(b3['attack@def']), blessBlock = num(b3['attack@block_cnt']);
    const blessHp = num(b3['attack@peak_performance.hp_ratio'], 0.8), blessAtk = num(b3['attack@peak_performance.atk']);
    /** Move 英勇的祝福 to the current holder (DEF / block here; its 精力充沛 goes through the shared tick). */
    const bless = ({ battle, unit }) => {
      const st = unit.mem.pallasBless ?? (unit.mem.pallasBless = { holder: null });
      const h = unit.skill?.active && up(unit) ? blessingHolder(battle, unit) : null;
      if (st.holder === h) return;
      if (st.holder) battle.removeBuff(st.holder, holderKey(unit));
      st.holder = h;
      if (h) battle.addBuff(h, { key: holderKey(unit), source: unit, mods: { defPct: blessDef, blockCnt: blessBlock }, tags: ['skill'], visible: true });
    };
    return {
      skills: {
        [S1]: { kind: 'instant', attack: { atkScale: num(b1.atk_scale, 1), hits: 2 } },
        [S2]: {
          kind: 'duration',
          mods: { atkPct: num(b2.atk) },
          targeting: { rangeExtend: Math.max(0, Math.round(num(b2.ability_range_forward_extend))) },
          attack: {
            onHit({ battle, unit, target }) {
              if (target && target.alive && target.side === 'enemy' && battle.rng.chance(num(b2['attack@buff_prob']))) {
                battle.applyStatus(target, 'stun', { duration: num(b2['attack@stun']), source: unit });
              }
            },
          },
        },
        [S3]: {
          kind: 'duration',
          mods: { atkPct: num(b3.atk) },
          targeting: { maxTargets: Math.max(1, num(b3['attack@max_target'], 3)) },
          onStart: bless,
          onTick: bless,
          onEnd: bless,
        },
      },
      talents: [
        { install(battle, unit) { // 英雄的诞生 (and S3's 精力充沛, same 同类取最高 buff)
          const hp0 = num(t0['peak_performance.hp_ratio'], 0.8), atk0 = num(t0['peak_performance.atk']);
          peakSources(battle).add((a) => {
            if (!up(unit) || !battle.allySelectable(a, unit)) return 0;
            let v = 0;
            if (atk0 > 0 && isMinos(a) && a.hpRatio > hp0) v = atk0;
            if (blessAtk > 0 && unit.mem.pallasBless?.holder === a && unit.skill?.active && a.hpRatio > blessHp) v = Math.max(v, blessAtk);
            return v;
          });
        } },
        { install(battle, unit) { // 女神的振奋 (+ INS-Y stage 2+: the minos extra heal)
          const value = num(t1.value), extra = num(t1['pallas_e_t_2.value']);
          if (!(value > 0) && !(extra > 0)) return;
          battle.on('damaged', (c) => {
            if (c.source !== unit || !c.target || c.target.side !== 'enemy' || c.type === 'element' || !up(unit)) return;
            if (value > 0) {
              for (const a of alliesInGridOf(battle, unit, RANGE_1_1)) battle.heal(unit, a, value, { self: a === unit, ignoreHealFree: true, tags: ['talent'] });
            }
            if (extra > 0) {
              for (const a of battle.alliesFor(unit)) if (isMinos(a)) battle.heal(unit, a, extra, { self: a === unit, ignoreHealFree: true, tags: ['talent', 'module'] });
            }
          }, { owner: unit });
        } },
      ],
    };
  },
};
