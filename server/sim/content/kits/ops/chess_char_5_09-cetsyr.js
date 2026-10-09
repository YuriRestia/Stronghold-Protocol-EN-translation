// server/sim/content/kits/ops/chess_char_5_09-cetsyr.js — 魔王 (char_4134_cetsyr) kit, tier 5 (hidden).
// Conventions of the tier-5 kits: ../shared/tier5.js; kit contract and rules: ../README.md.

import { COLS } from '../../../constants.js';
import { rotateOffset } from '../../../dir.js';
import { AURA_IV, AURA_DUR, num, talent, traitBb, skillGrid, isOp, leaderOf, whileOn } from '../shared/tier5.js';
import { hypot, sin, cos } from '../../../detmath.js';

/** 魔王 T1 微尘: collision radius of one mote (PRTS 备注 0.4); orbit radius / speed come from the talent bb. */
const MOTE_HIT_RADIUS = 0.4;

export default {
  // ---------------------------------------------------------------------------------------------------------------
  // 魔王 — bard (trait: 生命回复速度 +10 % ATK on the allies in range, professions.js bardRegen). S3 编织重构现世 (30 s):
  // skill range, trait 65 %, motes never vanish, other allies in range get 鼓舞 = +65 % of her max HP, HP of everyone in
  // range is equalised every 2 s.
  // T1 过往尘埃: 3 motes orbit her; one colliding with an operator vanishes and gives it ×1.5 of her trait for 6 s, then
  // respawns after 6 s.
  // T2 魔王残响: allies take −10 % damage from Sarkaz enemies. Module (elite): ≥2 other ops in range → ATK +8 %.
  chess_char_5_09_a: (bb, chess, def) => {
    const t0 = talent(chess, 0), t1 = talent(chess, 1), tb = traitBb(chess), tm = talent(chess, -1);
    const baseRatio = num(tb['attack@atk_to_hp_recovery_ratio'], 0.1);
    const skillRatio = num(bb['attack@atk_to_hp_recovery_ratio'], baseRatio);
    const inspire = num(bb.max_hp);
    const shareIv = Math.max(0.1, num(bb['attack@cetsyr_s_3[cal_hp_ratio].interval'], 2));
    const inspireAll = (battle, unit) => {
      if (!(inspire > 0)) return;
      const hp = unit.s.maxHp * inspire;
      for (const a of battle.alliesInGrid(unit)) {
        if (a !== unit) battle.addBuff(a, { key: 'cetsyr:inspire', duration: AURA_DUR, visible: true, status: 'inspire', mods: { hpFlat: hp }, data: { src: unit } });
      }
    };
    return {
      skill: {
        kind: 'duration',
        targeting: skillGrid(chess, def) ? { rangeGrid: skillGrid(chess, def) } : undefined,
        onStart({ battle, unit }) {
          if (unit.profile) unit.profile.auraRatio = skillRatio;
          unit.mem.shareAcc = 0;
          unit.mem.inspireAcc = 0;
          inspireAll(battle, unit);
          battle.fx('healAoe', { x: unit.x, y: unit.y, id: unit.id, r: 2.5 });
        },
        onTick({ battle, unit, dt }) {
          unit.mem.inspireAcc += dt;
          if (unit.mem.inspireAcc >= AURA_IV) { unit.mem.inspireAcc = 0; inspireAll(battle, unit); }
          unit.mem.shareAcc += dt;
          if (unit.mem.shareAcc < shareIv - 1e-9) return;
          unit.mem.shareAcc -= shareIv;
          const group = battle.alliesInGrid(unit).filter((a) => a.alive && a.kind !== 'device');
          let hp = 0, max = 0;
          for (const a of group) { hp += a.hp; max += a.s.maxHp; }
          if (!(max > 0) || group.length < 2) return;
          const ratio = hp / max;
          for (const a of group) a.hp = Math.max(1, Math.min(a.s.maxHp, a.s.maxHp * ratio));
          battle.fx('hpShare', { x: unit.x, y: unit.y, id: unit.id, ratio: Math.round(ratio * 1000) / 1000 });
        },
        onEnd({ battle, unit }) {
          if (unit.profile) unit.profile.auraRatio = baseRatio;
          for (const a of battle.allyUnits) {
            const b = a.findBuff('cetsyr:inspire');
            if (b && b.data.src === unit) battle.removeBuff(a, b);
          }
        },
      },
      talents: [
        { install(battle, unit) { // 过往尘埃: cnt motes orbit her (radius range_radius, dynamic_spd °/s, PRTS hit radius 0.4)
          const cnt = Math.max(0, Math.floor(num(t0.cnt, 3))), orbit = num(t0.range_radius, 1.15);
          const spd = (num(t0.dynamic_spd, 30) * Math.PI) / 180;
          const cd = num(t0.cooldown, 6), dur = num(t0.talent_duration, 6), mul = num(t0['attack@trait_mul'], 1.5);
          const motes = new Array(cnt).fill(0); // per orbit slot: the time its mote is back (vanished → respawn after cd)
          const reach = orbit + MOTE_HIT_RADIUS + 0.01;
          battle.on('deploy', (c) => { if (c.unit === unit) motes.fill(0); }, { owner: unit });
          whileOn(battle, unit, AURA_IV, () => {
            if (!cnt) return;
            const keep = !!unit.skill?.active; // S3: "微尘"不再消失
            // "微尘"碰撞友方干员: operators only; a mote never collides with an operator already under a mote effect
            const cands = battle.alliesInRadius(unit.x, unit.y, reach, null).filter((a) => a !== unit && isOp(a) && !a.findBuff('cetsyr:mote'));
            if (!cands.length) return;
            const t = battle.time - num(unit.deployedAt);
            for (let k = 0; k < cnt; k++) {
              if (motes[k] > battle.time + 1e-9) continue;
              const ang = spd * t + (2 * Math.PI * k) / cnt;
              // the orbit turns with his direction: angle 0 = straight ahead, π/2 = his left hand
              const [fr, fc] = unit.fwd, [lr, lc] = rotateOffset(1, 0, unit.dir);
              const mx = unit.x + orbit * (fc * cos(ang) + lc * sin(ang)), my = unit.y + orbit * (fr * cos(ang) + lr * sin(ang));
              let hit = null, hd = Infinity;
              for (const a of cands) {
                if (a.findBuff('cetsyr:mote')) continue;
                const d = hypot(a.x - mx, a.y - my);
                if (d <= MOTE_HIT_RADIUS + 1e-9 && d < hd) { hd = d; hit = a; }
              }
              if (!hit) continue;
              battle.addBuff(hit, { key: 'cetsyr:mote', duration: dur, visible: true, data: { src: unit, mul } });
              if (!keep) motes[k] = battle.time + cd;
              battle.fx('mote', { x: hit.x, y: hit.y, id: hit.id });
            }
          });
          // "受到魔王特性效果提升至1.5倍": his trait's 生命回复速度 on that operator (professions.js bardRegen hook)
          battle.on('bardRegen', (c) => {
            if (c.unit !== unit) return;
            const b = c.target.findBuff('cetsyr:mote');
            if (b) c.value *= num(b.data.mul, 1);
          }, { owner: unit });
        } },
        { install(battle, unit) { // 魔王残响
          const dr = num(t1.damage_resistance);
          if (!(dr > 0)) return;
          battle.on('hit', (c) => {
            if (!c.target || c.target.side !== 'ally' || !c.source || c.source.side !== 'enemy') return;
            if (!(c.source.def?.tags || []).includes('sarkaz') || leaderOf(battle, unit) !== unit) return;
            c.dmg.mul *= 1 - dr;
          }, { owner: unit });
        } },
      ],
      install(battle, unit) { // module: ≥ cnt other ops in the (base) range → ATK +8 %
        const atk = num(tm.atk), need = num(tm.cnt, 2);
        if (!chess?.isGolden || !atk) return;
        whileOn(battle, unit, AURA_IV, () => {
          const keys = new Set(unit.baseRangeKeys || []);
          let n = 0;
          for (const a of battle.allies()) if (a !== unit && isOp(a) && keys.has(a.tileR * COLS + a.tileC)) n++;
          if (n >= need) battle.addBuff(unit, { key: 'cetsyr:module', duration: AURA_DUR, mods: { atkPct: atk } });
        });
      },
    };
  },
};
