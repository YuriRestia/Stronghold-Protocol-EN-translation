// server/sim/content/kits/ops/chess_char_1_01-inside.js — 隐现 (char_498_inside) kit, tier 1.
// Conventions of the tier-1 kits: ../shared/tier1.js; kit contract and rules: ../README.md.

import { num, talentBb, up, once, skillBbOf, batMod } from '../shared/tier1.js';

/** (fork) The Insider whose live grant a unit holds (its fxProbe's src). */
const g0 = (a) => [...(a.mem.insiderAmmo?.values() || [])].find((g) => up(g.src) && g.src.deploySeq === g.seq)?.src ?? null;

export default {
  // ---------------------------------------------------------------------------------------------------------------
  // 1_01 隐现 “解决麻烦”: ammo (attack@trigger_time) ATK+atk, base attack time +base_attack_time s, prefers ranged
  // enemies, taunt −1. 火力支援: after `duration` s on the field own ammo +self_ammo (from the next cast); elite: another
  // random 【拉特兰】 op's ammo +ally_ammo while that deployment lasts (one grant per source).
  // Alternate S1 “不惹麻烦” (AUTO, attack SP): attack@trigger_time rounds of attack@atk_scale × ATK physical (an ammo
  // skill, so 火力支援's larger magazine applies to it too).
  chess_char_1_01_a: (bb, chess, def) => {
    const t = talentBb(chess, 0);
    const dur = num(t.duration), selfAmmo = num(t.self_ammo), allyAmmo = num(t.ally_ammo);
    const s1 = skillBbOf(chess, 'skchr_inside_1');
    return {
      skill: {
        kind: 'ammo', ammo: num(bb['attack@trigger_time'], 1),
        mods: { atkPct: num(bb.atk), batPct: batMod(bb.base_attack_time, chess, def?.skill?.description ?? chess?.skill?.desc), taunt: -1 },
        targeting: { priority: 'ranged' },
      },
      skills: {
        skchr_inside_1: { kind: 'ammo', ammo: Math.max(1, Math.floor(num(s1['attack@trigger_time'], 4))), attack: { atkScale: num(s1['attack@atk_scale'], 1) } },
      },
      talents: [{ install(battle, unit) {
        const onField = () => up(unit) && battle.time - unit.deployedAt + 1e-9 >= dur;
        battle.on('skillStart', ({ unit: u, skill }) => {
          if (u === unit && skill.kind === 'ammo' && onField() && selfAmmo > 0) skill.addAmmo(selfAmmo);
        }, { owner: unit });
        if (!(allyAmmo > 0)) return;
        // elite: once per deployment, `duration` s after it, one random other 【拉特兰】 operator with an ammo skill gets
        // +ally_ammo for as long as this deployment lasts (one grant per source — redeploying never stacks it)
        battle.on('deploy', ({ unit: u }) => {
          if (u !== unit) return;
          const seq = unit.deploySeq;
          battle.after(dur, () => {
            // (the larger magazine applies from the next activation: a running skill keeps its rounds)
            if (!up(unit) || unit.deploySeq !== seq) return;
            const pool = battle.allyUnits.filter((a) => a !== unit && a.kind === 'op' && a.ownerId === unit.ownerId && a.alive
              && (a.def.bonds || []).includes('lateranoShip') && a.skill && a.skill.kind === 'ammo');
            const pick = battle.rng.pick(pool);
            if (!pick) return;
            (pick.mem.insiderAmmo ??= new Map()).set(unit.id, { src: unit, seq, n: allyAmmo });
            // (fork) the client's inside_t_1[active] (RandomAuraAbility buff): inside_buff_01_start on the chosen ally while the
            // grant lasts — display only, read at snapshot time (b.snap fxs)
            battle.fxProbe(pick, 'inside_t_1[active]', (a) => ([...(a.mem.insiderAmmo?.values() || [])].some((g) => up(g.src) && g.src.deploySeq === g.seq) ? { src: g0(a) } : false)); // (snapshot.js fxStateView: { src })
            battle.fx('buff', { x: pick.x, y: pick.y, id: pick.id, kind: 'ammo' });
          }, { owner: unit });
        }, { owner: unit });
        once(battle, 'insider:bonusAmmo', () => battle.on('skillStart', ({ unit: u, skill }) => {
          const m = u.mem.insiderAmmo;
          if (!m || skill.kind !== 'ammo') return;
          let n = 0;
          for (const [k, g] of m) {
            if (up(g.src) && g.src.deploySeq === g.seq) n += g.n;
            else m.delete(k);
          }
          if (n > 0) skill.addAmmo(n);
        }));
      } }],
    };
  },
};
