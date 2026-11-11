// server/sim/content/kits/ops/standin-accast.js — Pith (char_612_accast) 补位 stand-in kit: 6★ 扩散术师 for 烛煌 (T5) and
// 焰影苇草 / 迷迭香 / 荒芜拉普兰德 (T6), all S3 + SPC-X; every skill at every form.
// Kit contract and the stand-in rules: ../README.md ("Stand-in kits").
//
// Sources: data/backups.json (character_table / skill_table / battle_equip_table at E2 Lv1 rank 4 and E2 Lv60 rank 7),
// PRTS Pith(卫戍协议) (S3 备注 "※溅射范围扩大至1.2") and the client's battle data (charpack char_612_accast,
// battle/buff_template_data.json accast_s_3[AOE]).
// - 扩散术师 trait "攻击造成群体法术伤害": the splash around each struck target, radius = the trait's
//   attack@projectile_range (1.1, PRTS 溅射半径一览's branch value); a skill's attack@projectile_range replaces it while it runs.
// - T1 "见我所见" "攻击无视目标12法术抗性": magic_resist_penetrate_fixed — a flat 法术穿透 attribute (charpack accast_t_1:
//   attribute 27 from the blackboard; PRTS Pith 备注 "无视法抗效果为增加自身法术穿透属性（直接加算）"): every arts damage she deals.
// - T2 "授我所授" "自身及相邻四格的【术师】干员攻击力+10%" (module SPC-X level 2 / 3: +15 / +20 %): an aura on her own tile and
//   the 4 orthogonal ones, 【术师】 operators only (charpack: profession mask CASTER, removed when the target leaves);
//   several sources keep the strongest (installAura, [ASSUMED] like every same-named talent aura of the mode).
// - S1 "书我所书" (自动触发, 25 s): ASPD +attack_speed, splash radius attack@projectile_range (1.5). Trigger: the data's
//   DEFAULT — an AUTO attack buff waits for her next attack (W5C's AUTO audit: "attack modes / attack buffs" keep waiting).
// - S2 "为我所为" (35 s): her ASPD +attack_speed; "所有【术师】干员攻击力+atk" — an aura on every 【术师】 operator of the field
//   (her included) while it runs, refreshed every AURA_IV s; the strongest of several sources applies [ASSUMED].
// - S3 "驭我所驭" (35 s): at the cast, one atk_scale_aoe × ATK arts hit on every enemy in her attack range (accast_s_3[AOE]:
//   AOEDamage MAGICAL, its s3_selector; a skill hit, not an attack); then attack@max_target targets (+1), ASPD
//   +attack_speed, splash attack@projectile_range (1.2, PRTS 备注).
// - Module SPC-X "攻击范围扩大": her range becomes the module's own grid (the 3×3 caster range + the tile [0,3]; shared
//   tier5 moduleRangeUp), so the S3 burst covers it too; HP / ATK in the stats; T2 +20 % at level 3 (composed talents).

import { num, talentBb, skillRec, statBuff, installAura, up } from '../shared/tier1.js';
import { moduleRangeUp } from '../shared/tier5.js';

const S1 = 'skchr_accast_1';
const S2 = 'skchr_accast_2';
const S3 = 'skchr_accast_3';
/** Refresh period / length of the S2 aura buff (the non-stacking aura convention of the kits). */
const AURA_IV = 0.25;
const AURA_DUR = 0.4;
const S2_KEY = 'accast:s2';

const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};
/** A 【术师】 operator (summons are never 【术师】 operators). */
const isCaster = (a) => !!a && a.kind === 'op' && a.def?.profession === 'CASTER';
/** One of the 4 tiles next to `u` (相邻四格). */
const adjacent4 = (a, u) => Math.abs(a.tileR - u.tileR) + Math.abs(a.tileC - u.tileC) === 1;

/** S2: ATK +v on every 【术师】 operator unless a stronger one from another source is on it. */
function casterAtk(battle, unit, v) {
  if (!(v > 0)) return;
  for (const a of battle.alliesFor(unit)) {
    if (!isCaster(a)) continue;
    const cur = a.findBuff(S2_KEY);
    if (cur && cur.source !== unit && (cur.data?.v ?? 0) > v && cur.timeLeft > 0.05) continue;
    battle.addBuff(a, { key: S2_KEY, duration: AURA_DUR, mods: { atkPct: v }, source: unit, data: { v }, tags: ['aura'], fx: 'accast_s_2', fxSrc: unit.id }); // (fork) fx: b.snap fxs
  }
}

export default {
  char_612_accast: (bb, chess) => {
    const t0 = talentBb(chess, 0), t1 = talentBb(chess, 1);
    const tb = chess?.trait?.bb ?? {};
    const b1 = bbOf(chess, S1), b2 = bbOf(chess, S2), b3 = bbOf(chess, S3);
    return {
      trait: { splashRadius: num(tb['attack@projectile_range'], 1.1) },
      skills: {
        [S1]: { kind: 'duration', mods: { aspd: num(b1.attack_speed) }, attack: { splashRadius: num(b1['attack@projectile_range'], 1.5) } },
        [S2]: {
          kind: 'duration',
          mods: { aspd: num(b2.attack_speed) },
          onStart({ battle, unit }) { casterAtk(battle, unit, num(b2.atk)); },
        },
        [S3]: {
          kind: 'duration',
          mods: { aspd: num(b3.attack_speed) },
          targeting: { maxTargets: Math.max(1, Math.floor(num(b3['attack@max_target'], 2))) },
          attack: { splashRadius: num(b3['attack@projectile_range'], 1.2) },
          onStart({ battle, unit }) {
            const scale = num(b3.atk_scale_aoe, 1);
            for (const e of battle.enemiesInKeys(unit.rangeKeys, unit, unit.profile)) {
              battle.dealDamage(unit, e, { amount: unit.s.atk * scale, type: 'arts', isSkill: true, tags: ['skill', 'accast:aoe'] });
              battle.fx('aoe', { x: e.x, y: e.y, r: 0.5, id: unit.id, skill: 'accast' });
            }
          },
        },
      },
      talents: [
        { install(battle, unit) { statBuff(battle, unit, 'talent:accast:res', { resIgnoreFlat: num(t0.magic_resist_penetrate_fixed) }); } },
        { install(battle, unit) {
          const v = num(t1.atk);
          if (v) installAura(battle, unit, { key: 'talent:accast', value: v, select: (a) => isCaster(a) && (a === unit || adjacent4(a, unit)), mods: { atkPct: v } });
        } },
      ],
      install(battle, unit) {
        moduleRangeUp(battle, unit, chess);
        if (unit.skill?.id !== S2) return;
        // S2's aura while it runs (its onStart gives the first application at the cast)
        const v2 = num(b2.atk);
        battle.every(AURA_IV, () => { if (up(unit) && unit.skill.active) casterAtk(battle, unit, v2); }, { owner: unit });
      },
    };
  },
};
