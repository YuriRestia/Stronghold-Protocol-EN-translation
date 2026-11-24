// public/js/render/steamKnightFx.js — the look of the Steam Knight slice's pile bunker (dev sandbox only; the sim side is
// server/sim/content/steamKnight.js, which sends `fx 'steamKnight'` with { id, kind, … } and the clip forms through
// `fx 'phase'` — render/units.js FORMS enemy_1533_stmkgt).
//
// The official stmkgt effects (the client's battle/prefabs/effects/stmkgt.ab, 24 prefabs) are the look (the user,
// 2026-11-24: "I prefer official vfx"); the procedural effects below are the fallback only when the official ones are off
// or not loaded (设置「官方特效」). By `kind`:
//   landing   stmkgt_skill_02_end_01 where he comes down; the steam (stmkgt_presure_buff_01, the Boost) stays on him
//   leapUp    stmkgt_skill_02_begin_01 / _02 at the take-off
//   stance    the Zantetsuken start: stmkgt_skill_01_start_01 .. _03 on him
//   dashStart stmkgt_skill_01_start_weapon_01 / _02 on the pile while he boosts (re-spawned every 0.3 s)
//   shove     stmkgt_attack_hit_01 on a normal enemy he throws aside
//   impact    stmkgt_skill_01_hit_01 + stmkgt_attack_hit_01 on the target
// Every number here is a look, not a rule: nothing in it reaches the sim.

export const STEAM_KNIGHT_FX_KEYS = Object.freeze([
  'stmkgt_skill_02_end_01', 'stmkgt_skill_02_begin_01', 'stmkgt_skill_02_begin_02', 'stmkgt_skill_01_start_01',
  'stmkgt_skill_01_start_02', 'stmkgt_skill_01_start_03', 'stmkgt_skill_01_start_weapon_01', 'stmkgt_skill_01_start_weapon_02',
  'stmkgt_skill_01_hit_01', 'stmkgt_presure_buff_01', 'stmkgt_immortal_buff_01', 'stmkgt_attack_hit_01',
]);

const WHITE = 0xffffff, HOT = 0xfff1c9, ORANGE = 0xff8a2a, STEAM = 0xcfe6ff;
const TRAIL_EVERY = 0.3;   // s between the pile-glow effects while he boosts

/**
 * @param {{ fx: any, ofx: any, wiring: any, views: Map<any, any>, preload?: (keys: string[]) => void, audio?: () => any }} deps
 */
export function createSteamKnightFx({ fx, ofx, wiring, views, preload, audio }) {
  const sound = (kind) => { try { audio?.()?.playSteamKnight?.(kind); } catch { /* sound is optional */ } };
  const dashing = new Map();   // knight id → { acc }
  const boosted = new Set();   // knight ids with the steam loop running
  let preloaded = false;

  const ensure = () => {
    if (preloaded) return;
    preloaded = true;
    try { preload?.(STEAM_KNIGHT_FX_KEYS.slice()); } catch { /* the procedural look alone */ }
  };
  const has = (key) => !!(ofx?.active && ofx.lib.has(key));
  /** An official effect at a board point; false when it cannot play (the caller falls back to the procedural look). */
  const official = (key, x, y, opts = {}) => {
    if (!has(key)) return false;
    return !!ofx.spawn(key, { pos: [x - 10, y - 9, 0], groundZ: 0 }, { important: true, ...opts });
  };
  const proj = (x, y, z = 0) => fx._proj(x, y, z);

  return {
    /** Preload the official files (call before the battle starts). */
    ensure,

    /** One sim `steamKnight` fx. */
    play(x, y, d) {
      if (!d || typeof d !== 'object') return;
      ensure();
      const id = d.id;
      const v = id != null ? views.get(id) : null;
      switch (d.kind) {
        case 'landing': {
          // the steam stays on him from the first drop (Boost: always on)
          if (v && id != null && !boosted.has(id) && has('stmkgt_presure_buff_01')) { boosted.add(id); wiring.playOn?.('stmkgt_presure_buff_01', v, { loop: true }); }
          sound('landing');
          if (!official('stmkgt_skill_02_end_01', x, y)) fx.ring(x, y, 0, 0.2, 2.4, STEAM, 0.6, 'shock');
          break;
        }
        case 'leapUp': {
          const a = official('stmkgt_skill_02_begin_01', x, y), b = official('stmkgt_skill_02_begin_02', x, y);
          if (!a && !b) fx.ring(x, y, 0, 0.2, 1.8, ORANGE, 0.5, 'shock');
          break;
        }
        case 'stance': {
          sound('stance');
          const got = ['01', '02', '03'].map((n) => official(`stmkgt_skill_01_start_${n}`, x, y));
          if (!got.some(Boolean)) fx.ring(x, y, 0, 0.2, 1.2, HOT, 0.4, 'shock');
          break;
        }
        case 'dashStart':
          sound('dash');
          dashing.set(id, { acc: TRAIL_EVERY });
          break;
        case 'shove': {
          sound('shove');
          if (!official('stmkgt_attack_hit_01', x, y)) {
            const p = proj(x, y, 0.4);
            fx.burst(p.x, p.y, p.s, 8, HOT, { speed: 2.6, life: 0.35, size: 0.4 });
          }
          break;
        }
        case 'impact': {
          dashing.delete(id);
          sound('impact');
          const a = official('stmkgt_skill_01_hit_01', x, y), b = official('stmkgt_attack_hit_01', x, y);
          if (!a && !b) {
            const p = proj(x, y, 0.5);
            fx.particle('glow', p.x, p.y, { tint: WHITE, life: 0.14, s0: (p.s / 128) * 0.5, s1: (p.s / 128) * 1.3, a0: 0.9, a1: 0 });
            fx.ring(x, y, 0, 0.2, 3.2, WHITE, 0.5, 'shock');
            fx.burst(p.x, p.y, p.s, 20, HOT, { speed: 3.4, life: 0.55, size: 0.5, g: 0.8 });
          }
          break;
        }
        default: break;
      }
    },

    /** Every frame: the pile glow follows a knight that is boosting. */
    frame(dt = 1 / 60) {
      for (const [id, dsh] of dashing) {
        const v = views.get(id);
        if (!v || v.destroyed) { dashing.delete(id); continue; }
        dsh.acc += dt;
        if (dsh.acc < TRAIL_EVERY) continue;
        dsh.acc = 0;
        const a = official('stmkgt_skill_01_start_weapon_01', v.x, v.y), b = official('stmkgt_skill_01_start_weapon_02', v.x, v.y);
        if (!a && !b) {
          const p = proj(v.x, v.y, 0.55);
          fx.particle('glow', p.x, p.y, { tint: ORANGE, life: 0.22, s0: (p.s / 128) * 1.2, s1: (p.s / 128) * 0.5, a0: 0.9, a1: 0 });
        }
      }
    },

    clear() { dashing.clear(); boosted.clear(); },
  };
}
