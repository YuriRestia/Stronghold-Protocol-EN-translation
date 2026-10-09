// server/sim/content/kits/ops/chess_char_5_21-sntlla.js — 寒檀 (char_341_sntlla) kit, tier 5.
// Conventions of the tier-5 kits: ../shared/tier5.js; kit contract and rules: ../README.md.

import { COLS } from '../../../constants.js';
import { attackCountdown } from '../../../ai.js';
import { toLocal } from '../../../dir.js';
import { num, talent, skillGrid, batPct, mods, lazySkills, whileOn } from '../shared/tier5.js';

/** 寒檀 S2 icicle splash radius (PRTS 备注 "冰凌溅射半径1.5"). */
const ICICLE_RADIUS = 1.5;
/** 寒檀 S2 icicle fall time (s) between the attack and the impact. [ASSUMED] */
const ICICLE_DELAY = 0.3;
/** 寒檀 S2 icicle lines, lateral offsets in her facing-RIGHT frame: ① the line on her left, ② on her right, ③ her own, then ①. */
const ICICLE_ROWS = [1, -1, 0];

export default {
  // ---------------------------------------------------------------------------------------------------------------
  // 寒檀 — S2 “女巫之泪” (15 s): skill range, BAT −2.4 s; attacks become icicles on random tiles of the range (cycling left
  // row → right row → own row): 65/75 % ATK arts + 1 s cold to every enemy within 1.5 of the impact. T1 生于冰寒: after 20 s on the field ATK +15 % and 抵抗 (negative
  // statuses on her last half as long).
  chess_char_5_21_a: (bb, chess, def) => {
    const t0 = talent(chess, 0);
    const scale = num(bb['attack@atk_scale'], 1), cold = num(bb['attack@cold']);
    const resist = Math.min(1, Math.max(0, -num(t0.one_minus_status_resistance)));   // share of the duration removed
    return {
      // S1 迅捷打击·γ型 (duration): ATK +, ASPD +.
      skills: lazySkills({
        'skcom_quickattack[3]': () => ({ kind: 'duration', mods: mods({ atkPct: num(bb.atk), aspd: num(bb.attack_speed) }) }),
      }),
      skill: {
        kind: 'duration',
        mods: mods({ batPct: batPct(bb.base_attack_time, chess) }),
        targeting: skillGrid(chess, def) ? { rangeGrid: skillGrid(chess, def) } : undefined,
        attack: { noAttack: true },
        onStart({ unit }) { unit.mem.iceCd = 0; unit.mem.iceRow = 0; },
        onTick({ battle, unit, dt }) {
          unit.mem.iceCd = attackCountdown(unit.mem.iceCd, dt);   // (the engine's attack countdown, PR #402)
          if (unit.mem.iceCd > 0 || !unit.canAct || unit.s.flags.disarm) return;
          if (!battle.enemiesInKeys(unit.rangeKeys, unit, { canHitFly: true }).length) return;
          unit.mem.iceCd = unit.s.interval;
          // PRTS 备注: icicles fall on a random tile of ① the row on her left, ② the row on her right, ③ her own row, …
          let k = null;
          for (let i = 0; i < ICICLE_ROWS.length && k == null; i++) {
            const idx = (num(unit.mem.iceRow) + i) % ICICLE_ROWS.length;
            const lat = ICICLE_ROWS[idx];
            const keys = (unit.rangeKeys || []).filter((x) => toLocal(Math.floor(x / COLS) - unit.tileR, x % COLS - unit.tileC, unit.dir)[0] === lat);
            if (!keys.length) continue;
            k = battle.rng.pick(keys);
            unit.mem.iceRow = (idx + 1) % ICICLE_ROWS.length;
          }
          if (k == null) return;
          const r = Math.floor(k / COLS), c = k % COLS;
          unit.lastAttackAt = battle.time;
          unit.stats.attacks++; // "攻击变为…召唤冰凌": every icicle is one of her attacks
          battle.fx('iceSpike', { x: c, y: r, id: unit.id, r: ICICLE_RADIUS });
          battle.after(ICICLE_DELAY, () => {
            const hit = [];
            for (const e of battle.foesInRadius(c, r, ICICLE_RADIUS)) {
              battle.dealDamage(unit, e, { amount: unit.s.atk * scale, type: 'arts', isAttack: true, isSkill: true, isSplash: true, tags: ['skill', 'iceSpike'] });
              if (e.alive && cold > 0) battle.applyStatus(e, 'cold', { duration: cold, source: unit });
              if (e.alive) hit.push(e);
            }
            // an icicle is an attack: "攻击时" effects (items, bonds) see it with the enemies it hit
            if (hit.length && battle.hasHook('attack')) battle.emit('attack', { attacker: unit, targets: hit, isSkill: true });
          }, { owner: unit });
        },
      },
      talents: [{ install(battle, unit) { // 生于冰寒
        const after = num(t0.interval, 20);
        // + 抵抗 (engine `resist` status: new control statuses last half as long, never compounding with other sources)
        whileOn(battle, unit, 0.5, () => {
          if (battle.time - unit.deployedAt < after - 1e-9 || unit.findBuff('sntlla:born')) return;
          battle.addBuff(unit, { key: 'sntlla:born', visible: true, mods: mods({ atkPct: num(t0.atk) }) });
          if (resist > 0) battle.applyStatus(unit, 'resist', { value: resist, source: unit });
        });
      } }],
    };
  },
};
