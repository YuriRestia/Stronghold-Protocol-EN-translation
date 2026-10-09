// server/sim/content/kits/ops/chess_char_3_07-forcer.js — 见行者 (char_4036_forcer) kit, tier 3 (hidden).
// Conventions of the tier-3 kits: ../shared/tier3.js; kit contract and rules: ../README.md.

import { PUSH_DIRECTIONAL_MIN_DIST } from '../../../constants.js';
import { num, defOf, talentBb, traitBb, onTiles, gridKeys, fx, copyGrid } from '../shared/tier3.js';
import { hypot } from '../../../detmath.js';

/** Two enemy bodies touch within this distance (tiles) — 见行者 collision stun. */
const COLLIDE = 0.6;

export default {
  // ---- 3_07 见行者 · 推击手 (hidden) — S2 惊爆射击: push every enemy in the skill range forward + stun (longer when
  //      slammed into a wall, collided enemies stunned too; air units too [ASSUMED: "范围内所有敌人", no 对空 note on
  //      PRTS] — a 失衡免疫 enemy or a 静态刚体 (the drones) is not pushed but still stunned); 技巧射击: ignore DEF vs heavy enemies;
  //      精锐 module PUS-X: redeployed on a ranged tile ⇒ half the deployment cost back
  chess_char_3_07_a: (bb, chess, def) => {
    const d = defOf(chess, def);
    const t0 = talentBb(d, 0);
    const tb = traitBb(d);
    const skillGrid = copyGrid(d.skill?.rangeGrid);
    const force = num(bb.force, 1);
    const sDirect = num(bb['forcer_s_2[hit_directly].stun'], num(bb.stun, 1));
    const sWall = num(bb.stun, sDirect);
    const sBrush = num(bb['forcer_s_2[brush].stun'], sDirect);
    const kit = {
      skill: {
        kind: 'instant',
        onStart({ battle, unit }) {
          const keys = new Set(gridKeys(skillGrid ?? unit.rangeGrid, unit));
          const victims = battle.enemies.filter((e) => e.alive && !e.hidden && !e.s.flags.untargetable && onTiles(e, keys));
          const pushed = new Set(victims);
          for (const e of victims) {
            // "往身前方向…推开": a directional push whose angle is fixed — PRTS 备注 "不会因为角度过大而改变推动的方向或削减力度"
            // (only the angle: a target nearer than 0.25 tile still turns radial at 受力等级 −2) — by the official
            // 力度 − 重量 distance of a 特效 push (PRTS 推与拉 names 见行者's skills 特效类; Battle.push / pushDistance);
            // stopped short of it ⇒ it hit a wall
            const near = hypot(e.x - unit.x, e.y - unit.y) < PUSH_DIRECTIONAL_MIN_DIST;
            const expect = battle.pushDistance(e, near ? force - 2 : force, { effect: true });
            const moved = battle.push(e, force, { from: unit, dir: { x: unit.fwd[1], y: unit.fwd[0] }, fixedAngle: true, effect: true });
            const wall = expect > 0 && moved + 0.05 < expect;
            battle.applyStatus(e, 'stun', { duration: wall ? sWall : sDirect, source: unit });
          }
          for (const e of victims) {
            for (const o of battle.enemiesInRadius(e.x, e.y, COLLIDE)) {
              if (pushed.has(o)) continue;
              pushed.add(o);
              battle.applyStatus(o, 'stun', { duration: sBrush, source: unit });
            }
          }
          fx(battle, 'push', unit, { skill: 'forcer_2', n: victims.length });
        },
        // "立即将范围内所有敌人…": the data rule SKILL_RANGE fires it once an enemy is inside the skill range (PRTS 技能
        // 策略 "仅在技能范围内存在敌人（无视其不可选中）时释放技能"), not only when one stands on her 2-tile attack range
      },
      talents: [{ install(battle, unit) {
        battle.on('hit', (ctx) => {
          if (ctx.source === unit && ctx.target.side === 'enemy' && ctx.target.s.massLevel >= num(t0.value, 3)) ctx.dmg.defIgnoreFlat += num(t0.def_penetrate_fixed);
        }, { owner: unit });
      } }],
    };
    if (num(tb.value) > 0) {
      kit.install = (battle, unit) => {
        battle.on('deploy', (ctx) => {
          // ranged position = not a ground tile (a high tile, or a platform that elevates it: unit.ground false)
          if (ctx.unit !== unit || ctx.initial || unit.ground) return;
          battle.addDp(unit.ownerId, unit.base.cost * num(tb.value));
          fx(battle, 'dp', unit, { n: unit.base.cost * num(tb.value) });
        }, { owner: unit });
      };
    }
    return kit;
  },
};
