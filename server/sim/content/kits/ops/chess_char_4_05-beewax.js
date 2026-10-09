// server/sim/content/kits/ops/chess_char_4_05-beewax.js — 蜜蜡 (char_344_beewax) kit, tier 4 (hidden).
// Conventions of the tier-4 kits: ../shared/tier4.js; kit contract and rules: ../README.md.

import { COLS } from '../../../constants.js';
import {
  num, tbb, grid, targetsInRange, targetsInGrid, toggleBuff, skillActive, withDefaults,
} from '../shared/tier4.js';
import { hypot } from '../../../detmath.js';

/**
 * Free tile for a summon/device: in the rect, standable, not reserved (Battle.isReservedTile: empty, no knocked-out
 * operator lying there) and not the home tile of any ally (dead ones redeploy there).
 */
function freeTile(battle, r, c, { ranged = false, ground = false } = {}) {
  if (!Number.isInteger(r) || !Number.isInteger(c) || !battle.grid.inRect(r, c)) return false;
  if (battle.isReservedTile(r, c)) return false;
  if (!battle.grid.canStand(r, c, { ranged })) return false;
  if (ground && !battle.grid.groundPassable(r, c)) return false;
  for (const u of battle.allyUnits) if (!u.removed && u.homeR === r && u.homeC === c && u.kind !== 'device') return false;
  return true;
}

export default withDefaults({
  // ===== 蜜蜡 (phalanx, hidden) S2 守卫尖碑 — obelisk on a melee tile in range: 200 % arts burst + stun, blocks 3
  chess_char_4_05_a: (bb, chess, def) => {
    const t0 = tbb(def, 0);
    const tb = def.traitBb || {};
    const tokenId = def.raw?.skill?.overrideTokenKey ?? (def.tokens || [])[0] ?? 'token_10011_beewax_oblisk';
    const keepDef = num(tb['soil_e_002[buff].def'], 0), keepRes = num(tb['soil_e_002[buff].magic_resistance'], 0);
    const obeliskKit = { skill: null, talents: [], trait: { noAttack: true } };
    return {
      skill: {
        kind: 'duration',
        onStart({ battle, unit }) {
          if (keepDef || keepRes) battle.addBuff(unit, { key: 'beewax:keep', mods: { defPct: keepDef, resFlat: keepRes } });
          // melee deploy tile in range: nearest to the most advanced enemy (path tile first)
          const foes = targetsInRange(battle, unit);
          const ref = foes[0] || battle.aliveEnemies().filter((e) => !e.hidden).sort((a, b) => battle.remainingDistance(a) - battle.remainingDistance(b))[0] || unit;
          let best = null, bd = Infinity;
          for (const k of unit.rangeKeys || []) {
            const r = (k / COLS) | 0, c = k % COLS;
            if (!freeTile(battle, r, c)) continue;
            const d = hypot(c - ref.x, r - ref.y) + (battle.grid.groundPassable(r, c) ? 0 : 5);
            if (d < bd - 1e-9) { bd = d; best = [r, c]; }
          }
          if (!best) return;
          const tok = battle.tokenDef(tokenId, unit); // the owner's skill / module variant (DESIGN §16)
          const dur = num(tok?.talents?.[0]?.bb?.duration, num(def.skill?.duration, 20));
          const ob = battle.spawnToken(unit, tokenId, best[0], best[1], { duration: dur, kit: obeliskKit });
          if (!ob) return;
          unit.mem.obelisk = ob;
          battle.fx('obelisk', { x: ob.x, y: ob.y, id: ob.id });
          const tokGrid = grid(tok?.skill?.rangeGrid) || [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 0], [0, 1], [1, -1], [1, 0], [1, 1]];
          for (const e of targetsInGrid(battle, ob, tokGrid)) {
            battle.dealDamage(unit, e, { amount: unit.s.atk * num(bb.atk_scale, 2), type: 'arts', isSkill: true, tags: ['skill', 'burst'] });
            if (e.alive) battle.applyStatus(e, 'stun', { duration: num(bb.stun, 1), source: unit });
          }
        },
        onEnd({ battle, unit }) { battle.removeBuff(unit, 'beewax:keep'); },
      },
      talents: [{ install(battle, unit) { // 沙原的庇护: +4 % max HP/s while the skill is off
        const set = () => toggleBuff(battle, unit, 'beewax:regen', unit.alive && !skillActive(unit), { hpRegenRatio: num(t0.hp_recovery_per_sec_by_max_hp_ratio, 0.04) });
        for (const ev of ['deploy', 'skillStart', 'skillEnd']) battle.on(ev, (c) => { if (c.unit === unit) set(); }, { owner: unit });
      } }],
    };
  },
});
