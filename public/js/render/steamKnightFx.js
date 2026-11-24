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
  'stmkgt_reborn_02', 'stmkgt_skill_02_hit_01', 'stmkgt_skill_02_hit_02', 'stmkgt_attack_start_01', 'stmkgt_attack_weapon_01',
  'stmkgt_skill_02_marker_01',
]);

const WHITE = 0xffffff, HOT = 0xfff1c9, ORANGE = 0xff8a2a, STEAM = 0xcfe6ff;

/**
 * @param {{ fx: any, ofx: any, wiring: any, views: Map<any, any>, preload?: (keys: string[]) => void, audio?: () => any }} deps
 */
export function createSteamKnightFx({ fx, ofx, wiring, views, preload, audio, shake }) {
  const sound = (kind) => { try { audio?.()?.playSteamKnight?.(kind); } catch { /* sound is optional */ } };
  /** An official effect that is cut after `secs` (a looping or long prefab layered in for weight). */
  const brief = (key, x, y, secs) => {
    if (!(ofx?.active && ofx.lib.has(key))) return false;
    const h = ofx.spawn(key, { pos: [x - 10, y - 9, 0], groundZ: 0 }, { important: true });
    if (h) setTimeout(() => { try { h.stop?.(); } catch { /* gone */ } }, secs * 1000);
    return !!h;
  };
  const leapOk = new Map();    // knight id → his leap's official window started (its end plays the landing)
  const marks = new Map();     // knight id → the marker loop on the enemy he boosts at
  const immortal = new Map();  // knight id → his invincible loop
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
          // the steam stays on him from the first drop (Boost: always on): the official loop on his own mount point
          if (v && id != null && !boosted.has(id) && has('stmkgt_presure_buff_01')) { boosted.add(id); wiring.playOn?.('stmkgt_presure_buff_01', v, { loop: true }); }
          // a leap's landing is the end of its official window (DownToTile, on his own position); the first drop plays it here
          if (!(d.leap && leapOk.get(id))) {
            if (!official('stmkgt_skill_02_end_01', x, y)) fx.ring(x, y, 0, 0.2, 2.4, STEAM, 0.6, 'shock');
          }
          break;
        }
        case 'touchdown':
          // his feet hit the ground (the sim times it on the landing clip's touchdown, 0.4 s in): the landing sound, his
          // official revive burst and the leap's ground hit layered in, cut short, and the camera shake (the user,
          // 2026-11-24: "the landing needs more oomph"; the shake came late when it was timed on the wall clock)
          sound('landing');
          brief('stmkgt_reborn_02', x, y, 1.2);
          brief('stmkgt_skill_02_hit_02', x, y, 0.7);
          shake?.(0.16, 0.4);
          break;
        case 'bunkerEnd': {
          // the pile bunker is over: its official Zantetsuken window closes now (its loops stop with their fade), so his
          // next normal attack plays its own cast rows (the laser on his weapon) instead of the skill's — the window would
          // otherwise run to its estimated end, past the first wind-up (the user, 2026-11-24)
          const S = wiring.skills, U = v ? S?.of?.(v) : null;
          if (U?.ewin) S._enemyEnd(U, v);
          { const m = marks.get(id); if (m) { try { m.stop?.(); } catch { /* gone */ } marks.delete(id); } }
          break;
        }
        case 'leapUp': {
          // the official HeroBomb window (slot 2 of his record): FlyToMoon's start effects now, DownToTile's end at its end
          const ok = !!(v && wiring.enemyCast?.(v, 2, 1.2));
          leapOk.set(id, ok);
          if (!ok) {
            const a = official('stmkgt_skill_02_begin_01', x, y), b = official('stmkgt_skill_02_begin_02', x, y);
            if (!a && !b) fx.ring(x, y, 0, 0.2, 1.8, ORANGE, 0.5, 'shock');
          }
          break;
        }
        case 'stance': {
          sound('stance');
          // the official Zantetsuken window (slot 1 of his record): its start loops and, later, its weapon glow, on his
          // own mount points, held for the whole bunker (castDur)
          const ok = !!(v && wiring.enemyCast?.(v, 1, Number(d.castDur) || 4));
          if (!ok) {
            const got = ['01', '02', '03'].map((n) => official(`stmkgt_skill_01_start_${n}`, x, y));
            if (!got.some(Boolean)) fx.ring(x, y, 0, 0.2, 1.2, HOT, 0.4, 'shock');
          }
          break;
        }
        case 'zanHold':
          sound('hold');
          break;
        case 'dashStart': {
          sound('dash');
          // the official leap marker (stmkgt_skill_02_marker_01, the HeroBomb's mark on its target) on the enemy he boosts at,
          // until the impact
          const tv = d.target != null ? views.get(d.target) : null;
          if (tv && has('stmkgt_skill_02_marker_01')) { const h = wiring.playOn?.('stmkgt_skill_02_marker_01', tv, { loop: true }); if (h) marks.set(id, h); }
          break;
        }
        case 'zanHit': {
          // the standing Zantetsuken's strike: its official hit on the target (the window's own hit row may also draw it)
          sound('impact');
          const tv = d.target != null ? views.get(d.target) : null;
          if (!(tv && has('stmkgt_skill_01_hit_01') && wiring.playOn?.('stmkgt_skill_01_hit_01', tv, {}))) official('stmkgt_skill_01_hit_01', x, y);
          shake?.(0.1, 0.3);
          break;
        }
        case 'invincible': {
          // the official invincible loop (stmkgt_immortal_buff_01) while he is untouchable: the landing and the leap
          const prev = immortal.get(id);
          if (prev) { try { prev.stop?.(); } catch { /* gone */ } immortal.delete(id); }
          if (d.on && v && has('stmkgt_immortal_buff_01')) { const h = wiring.playOn?.('stmkgt_immortal_buff_01', v, { loop: true }); if (h) immortal.set(id, h); }
          break;
        }
        case 'shove': {
          sound('shove');
          const tv = d.target != null ? views.get(d.target) : null;
          const ok = tv && has('stmkgt_attack_hit_01') && wiring.playOn?.('stmkgt_attack_hit_01', tv, {});
          if (!ok && !official('stmkgt_attack_hit_01', x, y)) {
            const p = proj(x, y, 0.4);
            fx.burst(p.x, p.y, p.s, 8, HOT, { speed: 2.6, life: 0.35, size: 0.4 });
          }
          break;
        }
        case 'impact': {
          sound('impact');
          { const m = marks.get(id); if (m) { try { m.stop?.(); } catch { /* gone */ } marks.delete(id); } }
          // the official hit effects on the target's own hit point, plus the ground twin under him (the blow is the big one)
          const tv = d.target != null ? views.get(d.target) : null;
          const a = tv && has('stmkgt_skill_01_hit_01') ? !!wiring.playOn?.('stmkgt_skill_01_hit_01', tv, {}) : official('stmkgt_skill_01_hit_01', x, y);
          const b = official('stmkgt_attack_hit_01', x, y);
          // weight (the user, 2026-11-24: "the impact needs more oomph"): the leap's bomb hit and the revive burst layered
          // in at the contact, cut short, and a camera shake that grows with the tiles boosted
          brief('stmkgt_skill_02_hit_01', x, y, 0.8);
          brief('stmkgt_reborn_02', x, y, 1.2);
          shake?.(Math.min(0.3, 0.14 + (Number(d.tiles) || 0) * 0.025), 0.45);
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

    /** Every frame (nothing to do: the official windows run in the wiring; kept for the render loop's call). */
    frame() {},

    clear() { boosted.clear(); leapOk.clear(); marks.clear(); immortal.clear(); },
  };
}
