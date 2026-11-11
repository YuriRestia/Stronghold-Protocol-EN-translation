// server/sim/content/kits/ops/chess_char_3_09-haini.js — 海霓 (char_4079_haini) kit, tier 3.
// Conventions of the tier-3 kits: ../shared/tier3.js; kit contract and rules: ../README.md.

import { num, defOf, talentBb, altSkills, instantKindOf, alive, onTiles, aura } from '../shared/tier3.js';

/** Non-elite, non-leader enemy (海霓 "非精英和领袖敌人"). */
const isNormalEnemy = (e) => !e.isBoss && String(e.def?.rank ?? 'NORMAL').toUpperCase() === 'NORMAL';

export default {
  // ---- 3_09 海霓 · 削弱者 — S2 阻滞性显色剂: ATK +, 2 targets, slows non-elite enemies in range, their deaths raise the
  //      talent up to max_talent_up; 测绘器材的奇用: non-elite enemies in range are fragile
  chess_char_3_09_a: (bb, chess, def) => {
    const d = defOf(chess, def);
    const t0 = talentBb(d, 0);
    const slow = num(bb['attack@move_speed'], 0);
    const up = num(bb['attack@talent_up'], 0), upMax = num(bb['attack@max_talent_up'], 1);
    const mt = Math.floor(num(bb['attack@max_target'], 1));
    const kit = {
      skill: {
        kind: 'duration',
        mods: { atkPct: num(bb.atk) },
        onStart({ battle, unit }) {
          unit.mem.hainiMul = 1;
          if (!unit.mem.hainiSlow) {
            unit.mem.hainiSlow = aura(battle, unit, { key: 'skill:haini_slow', side: 'enemy', interval: 0, tiles: () => unit.rangeKeySet, filter: isNormalEnemy, mods: { moveMul: Math.max(0, 1 + slow) } });
          }
          unit.mem.hainiSlow();
        },
        onTick({ unit }) { unit.mem.hainiSlow?.(); },
        onEnd({ unit }) { unit.mem.hainiSlow?.clear(); unit.mem.hainiMul = 1; },
      },
      // S1 迷惑性洋流图: next attack ×atk_scale on max_target enemies at once
      skills: altSkills(chess, d, bb, {
        skchr_haini_1: (s) => ({
          kind: instantKindOf(s),
          targeting: { maxTargets: Math.max(1, Math.floor(num(s.bb.max_target, 1))) },
          attack: { atkScale: num(s.bb.atk_scale, 1) },
        }),
      }),
      talents: [{ install(battle, unit) {
        unit.mem.hainiMul = 1;
        // (fork) the client's haini_s_2[modify_talent]: haini_skill_02_buff_01 / _02 and _weapon_01 on her while S2 runs — display only
        battle.fxProbe(unit, 'haini_s_2[modify_talent]', (u) => !!(u.alive && u.deployed && u.skill?.active));
        aura(battle, unit, {
          key: 'talent:haini_fragile', side: 'enemy', tiles: () => unit.rangeKeySet, filter: isNormalEnemy,
          mods: () => ({ dmgTakenMul: 1 + (num(t0.damage_scale, 1) - 1) * (unit.mem.hainiMul ?? 1) }),
        });
        battle.on('kill', (ctx) => {
          const v = ctx.victim;
          if (!unit.skill?.active || !alive(unit) || v.side !== 'enemy' || !isNormalEnemy(v)) return;
          if (!unit.rangeKeySet || !onTiles(v, unit.rangeKeySet)) return;
          unit.mem.hainiMul = Math.min(upMax, (unit.mem.hainiMul ?? 1) + up);
        }, { owner: unit });
      } }],
    };
    if (mt > 1) kit.skill.targeting = { maxTargets: mt };
    return kit;
  },
};
