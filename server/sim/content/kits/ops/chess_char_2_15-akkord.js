// server/sim/content/kits/ops/chess_char_2_15-akkord.js — 协律 (char_4051_akkord) kit, tier 2 (hidden).
// Conventions of the tier-2 kits: ../shared/tier2.js; kit contract and rules: ../README.md.

import { num, talentBb, traitBb, onHitBy, alliesInGridOf, toggleBuff } from '../shared/tier1.js';
import { hypot } from '../../../detmath.js';

export default {
  // ---------------------------------------------------------------------------------------------------------------
  // 2_15 协律 (hidden) 震爆调谐: ATK +atk; each attack sets off a sonic boom at every other operator in range:
  // attack@aoe_atk_scale × ATK arts within attack@range_radius. 律脉同构: ATK +atk with another operator in range.
  // Elite module (BLA-X): damage grows with distance, up to +damage_scale at max_dist tiles.
  chess_char_2_15_a: (bb, chess) => {
    const t = talentBb(chess, 0);
    const tb = traitBb(chess);
    const rad = num(bb['attack@range_radius'], 0.9), sc = num(bb['attack@aoe_atk_scale']);
    return {
      skill: {
        kind: 'duration', mods: { atkPct: num(bb.atk) },
        onAttack({ battle, unit }) {
          if (!(sc > 0)) return;
          for (const a of alliesInGridOf(battle, unit)) {
            if (a === unit || a.kind !== 'op') continue;
            battle.fx('sonic', { x: a.x, y: a.y, radius: rad, id: unit.id });
            for (const e of battle.foesInRadius(a.x, a.y, rad)) {
              if (!e.s.flags.untargetable) battle.dealDamage(unit, e, { amount: unit.s.atk * sc, type: 'arts', isSkill: true, isSplash: true, tags: ['sonic'] });
            }
          }
        },
      },
      talents: [{ install(battle, unit) {
        const v = num(t.atk);
        if (v) toggleBuff(battle, unit, 'akkord:sync', () => alliesInGridOf(battle, unit).some((a) => a !== unit && a.kind === 'op'), { atkPct: v });
        if (tb.damage_scale != null) {
          const mn = num(tb.min_dist), mx = num(tb.max_dist, 4), ds = num(tb.damage_scale);
          onHitBy(battle, unit, ({ target, dmg }) => {
            if (!dmg.isAttack) return;
            const d = hypot(target.x - unit.x, target.y - unit.y);
            dmg.amount *= 1 + ds * (mx > mn ? Math.max(0, Math.min(1, (d - mn) / (mx - mn))) : 1);
          });
        }
      } }],
    };
  },
};
