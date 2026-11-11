// server/sim/content/fxStates.js — (fork) the official lasting effects whose moment the client never sees, read off the
// sim's own state when a snapshot is taken (Battle.fxProbe → b.snap `fxs`; render/vfx/skills.js STATE_BUFFS plays them).
// Display only: nothing here runs in the battle's ticks or changes it (the bots' budget, the golden results).
//
// Each entry is the client's buff (config/buff_template_holder.ab, read from the client of 2026-10-15; index.json uses'
// `buff`) whose graph re-checks a condition every tick (ON_BUFF_TRIGGER) and keeps a derived buff with its own effect
// while it holds — the condition transcribed over the sim's state. `probe(u)` → null / false: none; true: the buff's
// effects; else the branch (`look`) STATE_BUFFS names. The kits signal the moments the sim marks itself (a kill, a
// fired trigger effect, an overload) with Battle.fxState or a buff's `fx`.

/** The skill's stored uses (CompareCharSkillAvailableCnt / CheckCharSkillAvailable: SkillRuntime.charges). */
const stored = (u) => (u.skill && !u.skill.noSkill ? Math.max(0, Math.floor(u.skill.charges || 0)) : 0);

/** Skill id → { buff, probe }. */
export const SKILL_FX_STATES = Object.freeze({
  // Leizi the Thunderbringer S1: leizi2_s_1[effect_controller] — a ring per stored charge (count ≤ 0 none, then _01, _02, _03)
  skchr_leizi2_1: { buff: 'leizi2_s_1[effect_controller]', probe: (u) => { const n = Math.min(3, stored(u)); return n > 0 ? n : null; } },
  // Lumen S2: lumen_s_2[eff_cond] — 1 charge [effect_1] lumen_skill_02_buff, ≥ 2 [effect_2] lumen_skill_02_buff_02
  skchr_lumen_2: { buff: 'lumen_s_2[eff_cond]', probe: (u) => { const n = stored(u); return n >= 2 ? 2 : n === 1 ? 1 : null; } },
  // Gnosis S2: gnosis_s_2[eff_cond] — 1 charge [effect1] gnosis_skill_02_buff_01, ≥ 2 [effect2] _02
  skchr_gnosis_2: { buff: 'gnosis_s_2[eff_cond]', probe: (u) => { const n = stored(u); return n >= 2 ? 2 : n === 1 ? 1 : null; } },
  // Mon3tr S1: monstr_s_1[ready] — ≥ 1 charge: monstr_s_1[ready_eff] monstr_skill_01_buff
  skchr_monstr_1: { buff: 'monstr_s_1[ready]', probe: (u) => stored(u) >= 1 },
  // Minimalist S2: malist_s_2[eff_cond] — the skill available (CheckCharSkillAvailable): [effect_1] the weapon, [effect_2] the glow
  skchr_malist_2: { buff: 'malist_s_2[eff_cond]', probe: (u) => stored(u) >= 1 && !u.skill.active },
  // Ch'en the Holungday S2: chen2_s_2[eff_cond] (the graph 卡涅利安's [eff_cond] has too) — running: [full] when cast with both charges
  // (chen2_s_2_enhance_mark: the kit's mem.chen2Charged), else [half]; waiting: ≥ 2 charges [full], ≥ 1 [half]
  skchr_chen2_2: {
    buff: 'chen2_s_2[eff_cond]',
    probe: (u) => {
      if (u.skill?.active) return u.mem.chen2Charged ? 'full' : 'half';
      const n = stored(u);
      return n >= 2 ? 'full' : n >= 1 ? 'half' : null;
    },
  },
  // Caper S1: caper_s_1[effect_trigger] — FilterByTargetSpRatio GE the ability's ratio: the
  // strike ready [ASSUMED: the blackboard ratio is the full SP — the template's own `_spRatio` is 0]
  skchr_caper_1: { buff: 'caper_s_1[effect_trigger]', probe: (u) => stored(u) >= 1 },
  // Nearl the Radiant Knight S3: nearl2_s_3[effect] — CheckContainsCardBuff nearl2_t_1: [combo_effect] nearl2_buff_01_start while 不畏苦暗's
  // combo holds (deployed right after a 卡西米尔 operator: the kit's mem.nearlDawnTimes 2) [ASSUMED: the card buff is that combo]
  skchr_nearl2_3: { buff: 'nearl2_s_3[effect]', probe: (u) => u.mem.nearlDawnTimes === 2 },
  // Angelina the Mellow Wish (char_1015_aglna2) S3: aglna2_s_3[mode] — while the skill runs (CheckCharSkillAffecting) the wing glow of her
  // facing (CheckFaceLOrR: move_eff_r / _l); the client picks the side (STATE_BUFFS `byFacing`: the sim keeps no facing)
  skchr_aglna2_3: { buff: 'aglna2_s_3[mode]', probe: (u) => !!u.skill?.active },
});

/** Register the probe of the unit's selected skill (BattlePlayers._setupUnit). */
export function installFxStates(battle, unit) {
  const id = unit.skill?.id ?? unit.def?.skill?.id;
  const s = id ? SKILL_FX_STATES[id] : null;
  if (s) battle.fxProbe(unit, s.buff, s.probe);
}
