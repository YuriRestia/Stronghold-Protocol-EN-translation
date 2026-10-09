// server/sim/content/kits/ops/chess_char_5_15-thorn2.js — 引星棘刺 (char_1039_thorn2) kit, tier 5.
// Conventions of the tier-5 kits: ../shared/tier5.js; kit contract and rules: ../README.md.

import { COLS } from '../../../constants.js';
import { sortEnemyTargets } from '../../../targeting.js';
import { toLocal } from '../../../dir.js';
import {
  AURA_IV, AURA_DUR, RING1, num, on, talent, skillGrid, maxCharges, mods, dist, isOp, selectedId, lazySkills,
  instantKind, whileOn, permBuff,
} from '../shared/tier5.js';
import { hypot } from '../../../detmath.js';

/** Straight-road length through each tile (max of the horizontal and vertical runs of ground-passable tiles). */
const ROAD_CACHE = new WeakMap();
function straightRun(battle, r, c) {
  let m = ROAD_CACHE.get(battle);
  if (!m) {
    m = new Map();
    const g = battle.grid, R = battle.rect;
    const pass = (rr, cc) => g.groundPassable(rr, cc, true);
    for (let rr = R.r0; rr <= R.r1; rr++) {
      for (let cc = R.c0; cc <= R.c1; cc++) {
        if (!pass(rr, cc)) continue;
        let h = 1, v = 1;
        for (let k = cc - 1; k >= R.c0 && pass(rr, k); k--) h++;
        for (let k = cc + 1; k <= R.c1 && pass(rr, k); k++) h++;
        for (let k = rr - 1; k >= R.r0 && pass(k, cc); k--) v++;
        for (let k = rr + 1; k <= R.r1 && pass(k, cc); k++) v++;
        m.set(rr * COLS + cc, Math.max(h, v));
      }
    }
    ROAD_CACHE.set(battle, m);
  }
  return m.get(r * COLS + c) ?? 0;
}

export default {
  // ---------------------------------------------------------------------------------------------------------------
  // 引星棘刺 — S2 解构涌潮 (instant / 2 charges elite): throws an alchemy unit at the target: for 12/15 s ground enemies
  // around it get healing ×0.5, take 120/140 % ATK arts per second, allies recover 12/15 % ATK per second; the unit drifts
  // along the throw direction and its radius grows. T1 心相: ATK +10 %, +3 s when another op is in range.
  // T2 视界: allies ASPD +5, enemies −5 (doubled on straight roads ≥ 6 tiles). Module (elite): +0.1 SP/s with a unit out.
  // S1 度算浪波 (instant): an alchemy unit thrown at the ally in her range with the lowest HP ratio: for
  // projectile_delay_time s (+3 s 心相) allies on the landing tile and the 8 around it get DEF +def and recover
  // hp_recovery_per_sec_ratio × ATK per second. The recovery of S1 / S2 ("每秒回复/恢复相当于攻击力…的生命") is 生命回复速度,
  // an hpRegen buff per alchemy unit set at each 1 s pulse until the next — the wording and blackboard key of 锡人 S2, whose
  // PRTS 备注 says "生命恢复的提供方式为增加目标的“生命回复速度”属性，不受治疗加成和禁疗影响" (the only other 炼金师): 不屈者 and
  // 禁疗 units recover too (community report: 炼金单元无法给不屈者等禁疗的干员提供生命恢复; it was a heal up to 0.2.1).
  // S3 “我的海疆”: passive — her range is the skill range; active
  // (instant) — alchemy units on the max_target_token operators with the lowest block count: for projectile_delay_time s
  // the enemies around each of them (RING1, following it) get ATK/DEF/RES −, one strongest instance (不叠加), and take
  // atk_scale × ATK arts per second, everything ramping +per_interval each `interval` s up to max_stack_cnt steps.
  chess_char_5_15_a: (bb, chess, def) => {
    const t0 = talent(chess, 0), t1 = talent(chess, 1), tm = talent(chess, -1);
    const sid = selectedId(chess, def);
    const baseDur = num(bb.projectile_delay_time, num(bb.remaining_time, 12));
    const r0 = num(bb.projectile_range, 1.1), grow = num(bb.value), speed = num(bb.projectile_move_speed);
    const healMul = Math.max(0, num(bb.heal_scale, 1));
    const extend = (battle, unit) => (battle.alliesInGrid(unit).some((a) => a !== unit && isOp(a)) ? Math.min(num(t0.projectile_extend), num(t0.projectile_extend_max, Infinity)) : 0);
    // S3 ramp: value after `steps` intervals, clamped towards the max ("效果逐渐提升…15秒后达到最大")
    const ramp = (base, per, max, steps) => {
      const v = num(base) + num(per) * steps;
      return num(max) < num(base) ? Math.max(num(max), v) : Math.min(num(max, v), v);
    };
    /** One tick (AURA_IV) of an S1 guard zone / S3 sea zone. */
    const tickSpecial = (battle, unit, z, seaHits) => {
      if (z.type === 'guard') {
        const inZone = (a) => Math.abs(a.tileR - z.r) <= 1 && Math.abs(a.tileC - z.c) <= 1;
        const allies = battle.alliesFor(unit).filter(inZone);
        // one DEF buff per alchemy unit, so two units on one ally add up (+60 +60; PRTS 度算浪波 备注 「效果均可叠加」,
        // GitHub #388 — one shared key let the last unit's buff replace the other's)
        z.defKey ??= `thorn2:bastion:${unit.id}:${unit.mem.bastionSeq = (unit.mem.bastionSeq ?? 0) + 1}`;
        for (const a of allies) battle.addBuff(a, { key: z.defKey, duration: AURA_DUR, mods: mods({ defFlat: num(bb.def) }) });
        if (z.acc >= 1 - 1e-9) {
          z.acc -= 1;
          const regen = unit.s.atk * num(bb.hp_recovery_per_sec_ratio);   // 生命回复速度 (see the header)
          if (regen > 0) for (const a of allies) battle.addBuff(a, { key: z.key, duration: 1 + 2 * battle.dt, source: unit, mods: { hpRegen: regen } });
        }
        return;
      }
      // sea: follows its operator while it stands on the field; the first burn lands with the unit, then one per
      // `interval` (so the 15th step — the max — is reached 15 s after the throw, for the debuff and the damage alike)
      if (z.anchor && z.anchor.alive && z.anchor.deployed) { z.x = z.anchor.x; z.y = z.anchor.y; }
      const iv = Math.max(0.1, num(bb.interval, 1));
      const steps = Math.min(Math.max(0, num(bb.max_stack_cnt, 15)), Math.floor((z.t - AURA_IV + 1e-9) / iv));
      const foes = battle.foesInRadius(z.x, z.y, RING1);
      for (const e of foes) seaHits.set(e, Math.max(seaHits.get(e) ?? -1, steps));
      if (z.acc >= iv - 1e-9) {
        z.acc -= iv;
        const scale = ramp(bb.atk_scale, bb.atk_scale_per_interval, bb.max_atk_scale, steps);
        z.burn = { foes, scale }; // dealt after the debuffs of this tick are on
      }
    };
    return {
      skills: lazySkills({
        skchr_thorn2_1: () => ({
          kind: instantKind(chess, def),
          // an AUTO skill (skill_table 自动触发) that throws at an ally: it fires as soon as its SP is full, with or
          // without an enemy — the basic DEFAULT rule waited for an attack, so with no enemy around it sat at 7/7
          // (GitHub #124 「引星棘刺一技能不会在满技力时自动释放」)
          trigger: { rule: 'SP_FULL' },
          onStart({ battle, unit }) {
            // PRTS 备注 「※优先选择生命比例最低>最晚部署的我方单位（不含装置职业单位）」: the lowest HP ratio, a tie to the
            // latest deployment (alliesInGrid has no devices); until 0.2.2 a tie went to more blocking, then the nearer
            const t = battle.alliesInGrid(unit).filter((a) => a.hp > 0).sort((a, b) => a.hpRatio - b.hpRatio || b.deploySeq - a.deploySeq || a.id - b.id)[0];
            if (!t) return;
            const key = `thorn2:guard:${unit.id}:${unit.mem.zoneSeq = (unit.mem.zoneSeq ?? 0) + 1}`;   // its regen buff ("效果均可叠加")
            const z = { type: 'guard', r: t.tileR, c: t.tileC, x: t.x, y: t.y, t: 0, acc: 0, dur: num(bb.projectile_delay_time, 6) + extend(battle, unit), key };
            (unit.mem.zones ??= []).push(z);
            battle.fx('zone', { x: z.x, y: z.y, id: unit.id, r: RING1, duration: z.dur });
          },
        }),
        skchr_thorn2_3: () => ({
          kind: instantKind(chess, def),
          onStart({ battle, unit }) {
            const ops = battle.allies(unit.ownerId).filter((a) => isOp(a) && a.hp > 0)
              .sort((a, b) => a.s.blockCnt - b.s.blockCnt || dist(a, unit) - dist(b, unit) || a.id - b.id)
              .slice(0, Math.max(1, num(bb.max_target_token, 3)));
            const dur = num(bb.projectile_delay_time, 19) + extend(battle, unit);
            for (const a of ops) {
              (unit.mem.zones ??= []).push({ type: 'sea', anchor: a, x: a.x, y: a.y, t: 0, acc: Math.max(0.1, num(bb.interval, 1)) - AURA_IV, dur });
              battle.fx('zone', { x: a.x, y: a.y, id: unit.id, r: RING1, duration: dur });
            }
          },
        }),
      }),
      skill: {
        kind: maxCharges(chess, def) > 1 ? 'charges' : 'instant',
        // 白铁's 铁钳号·原型机 (a registered ally target) is a target like an enemy when no enemy is in her range — the owner's
        // rule of 2026-10-08: the unit lands on it and its pulses hit it (cancelled by its kit) [ASSUMED] (skills.js allyTargetsOk)
        allyTargets: true,
        onStart({ battle, unit }) {
          const list = battle.enemiesInKeys(unit.rangeKeys, unit, unit.profile);
          sortEnemyTargets(battle, unit, list, null);
          let t = list.find((e) => !e.isFlying) ?? list[0] ?? battle.allyTargetsInKeys(unit.rangeKeys, unit)[0];
          if (!t) {
            // PRTS 备注: no enemy in range → thrown at the farthest tile straight ahead inside her range
            let best = null;
            for (const k of unit.rangeKeys || []) {
              const r = Math.floor(k / COLS), c = k % COLS;
              if (!battle.grid.inRect(r, c)) continue;
              const [lat, d] = toLocal(r - unit.tileR, c - unit.tileC, unit.dir);
              if (lat !== 0) continue;
              if (d > 0 && (!best || d > best.d)) best = { d, x: c, y: r };
            }
            if (!best) return;
            t = best;
          }
          const extra = battle.alliesInGrid(unit).some((a) => a !== unit && isOp(a)) ? Math.min(num(t0.projectile_extend), num(t0.projectile_extend_max, Infinity)) : 0;
          // it drifts away from her deployment tile ("移动方向始终为远离棘刺部署位置中心的方向")
          const dx = t.x - unit.x, dy = t.y - unit.y, len = hypot(dx, dy) || 1;
          // `key`: the fx re-sent every second as the unit drifts and grows is this one zone — the client updates it in
          // place instead of stacking a new layer each second (render/fx/zones.js; community report of 2026-10-06)
          const key = `thorn2:${unit.id}:${unit.mem.zoneSeq = (unit.mem.zoneSeq ?? 0) + 1}`;
          const z = { x: t.x, y: t.y, vx: (dx / len) * speed, vy: (dy / len) * speed, t: 0, acc: 0, dur: baseDur + extra, key };
          (unit.mem.zones ??= []).push(z);
          battle.fx('zone', { x: z.x, y: z.y, id: unit.id, r: r0, duration: z.dur, key });
        },
      },
      talents: [
        { install(battle, unit) { permBuff(battle, unit, 'thorn2:mind', { atkPct: num(t0.atk) }); } },
        { install(battle, unit) { // 视界
          const cnt = num(t1.cnt, 6);
          const ally = num(t1.attack_speed_ally), allyX = num(t1.attack_speed_ally_extra), foe = num(t1.attack_speed_enemy), foeX = num(t1.attack_speed_enemy_extra);
          whileOn(battle, unit, AURA_IV, () => {
            for (const a of battle.alliesFor(unit)) {
              const v = ally + (straightRun(battle, a.tileR, a.tileC) >= cnt ? allyX : 0);
              if (v) battle.addBuff(a, { key: 'thorn2:vision', duration: AURA_DUR, mods: { aspd: v } });
            }
            for (const e of battle.enemies) {
              if (!e.alive || e.hidden) continue;
              const v = foe + (straightRun(battle, Math.round(e.y), Math.round(e.x)) >= cnt ? foeX : 0);
              if (v) battle.addBuff(e, { key: 'thorn2:vision', duration: AURA_DUR, mods: { aspd: v } });
            }
          });
        } },
      ],
      install(battle, unit) {
        const sp = num(tm.sp_recovery_per_sec);
        if (sid === 'skchr_thorn2_3') { // S3 被动效果：攻击范围扩大 (her own range, so also the DEFAULT trigger range)
          const g = skillGrid(chess, def);
          if (g) { unit.rangeGrid = g; battle.refreshRange(unit); }
        }
        // alchemy units keep working after she falls (they are already thrown)
        battle.every(AURA_IV, () => {
          const zones = unit.mem.zones;
          if (!zones || !zones.length) return;
          const R = battle.rect;
          const seaHits = new Map();
          for (const z of zones) {
            z.t += AURA_IV;
            z.acc += AURA_IV;
            if (z.type) { tickSpecial(battle, unit, z, seaHits); continue; }
            z.x = Math.max(R.c0, Math.min(R.c1, z.x + z.vx * AURA_IV));
            z.y = Math.max(R.r0, Math.min(R.r1, z.y + z.vy * AURA_IV));
            const r = r0 + grow * z.t;
            const foes = battle.foesInRadius(z.x, z.y, r).filter((e) => !e.isFlying);
            for (const e of foes) battle.addBuff(e, { key: 'thorn2:rot', duration: AURA_DUR, mods: { healingTakenMul: healMul } });
            if (z.acc >= 1 - 1e-9) {
              z.acc -= 1;
              for (const e of foes) battle.dealDamage(unit, e, { amount: unit.s.atk * num(bb.atk_scale), type: 'arts', isSkill: true, tags: ['skill', 'alchemy'] });
              // (白铁's 铁钳号 too, like a ground enemy — its kit cancels the hit)
              for (const a of battle.allyTargetsInRadius(z.x, z.y, r, unit)) battle.dealDamage(unit, a, { amount: unit.s.atk * num(bb.atk_scale), type: 'arts', isSkill: true, tags: ['skill', 'alchemy'] });
              const regen = unit.s.atk * num(bb.hp_recovery_per_sec_ratio_chr);   // 生命回复速度 (see the header)
              if (regen > 0) {
                for (const a of battle.alliesInRadius(z.x, z.y, r, null)) {
                  if (battle.allySelectable(a, unit)) battle.addBuff(a, { key: `${z.key}:regen`, duration: 1 + 2 * battle.dt, source: unit, mods: { hpRegen: regen } });
                }
              }
              battle.fx('zone', { x: z.x, y: z.y, id: unit.id, r, duration: Math.max(0, z.dur - z.t), key: z.key });
            }
          }
          for (const [e, steps] of seaHits) { // S3 debuff: 不叠加 — the strongest zone wins
            if (!e.alive) continue;
            battle.addBuff(e, { key: 'thorn2:sea', duration: AURA_DUR, visible: true, mods: mods({
              atkPct: ramp(bb.atk, bb.atk_per_interval, bb.max_atk, steps),
              defPct: ramp(bb.def, bb.def_per_interval, bb.max_def, steps),
              resMul: 1 + ramp(bb.magic_resistance, bb.magic_resistance_per_interval, bb.max_magic_resistance, steps),
            }) });
          }
          for (const z of zones) {
            if (!z.burn) continue;
            for (const e of z.burn.foes) if (e.alive) battle.dealDamage(unit, e, { amount: unit.s.atk * z.burn.scale, type: 'arts', isSkill: true, tags: ['skill', 'mySea'] });
            z.burn = null;
          }
          unit.mem.zones = zones.filter((z) => z.t < z.dur - 1e-9);
          if (chess?.isGolden && sp > 0 && on(unit) && unit.mem.zones.length) battle.addBuff(unit, { key: 'thorn2:module', duration: AURA_DUR, mods: { spRecoveryFlat: sp } });
        }, { owner: unit });
      },
    };
  },
};
