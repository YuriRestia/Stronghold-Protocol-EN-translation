// public/js/render/steamKnightFx.js — the look of the Steam Knight slice's pile bunker (dev sandbox only; the sim side is
// server/sim/content/steamKnight.js, which sends `fx 'steamKnight'` with { id, kind, … } and the clip forms through
// `fx 'phase'` — render/units.js FORMS enemy_1533_stmkgt).
//
// What it draws, by `kind`:
//   landing   the official landing effect (stmkgt_skill_02_end_01) + a steam ring where he comes down
//   leapUp    the official take-off effects (stmkgt_skill_02_begin_01 / _02)
//   dashStart the stance's official effects (stmkgt_skill_01_start_*), then a thruster plume behind him every frame while
//             he boosts (frame()): a white-hot nozzle flare, an orange plume cone and embers, after the Armored Core 6
//             thrusters and the fan animation's nozzle flare (crew-docs/steam-knight-slice-design.md "Reference notes")
//   shove     a spark burst and a short ring on a normal enemy he throws aside
//   impact    the blow: the official hit effect (stmkgt_skill_01_hit_01), a white-hot flash with a ring and a streak down the
//             lane, a screen flash and a shower of sparks; scaled by the tiles boosted
// Every number here is a look, not a rule: nothing in it reaches the sim.

export const STEAM_KNIGHT_FX_KEYS = Object.freeze([
  'stmkgt_skill_02_end_01', 'stmkgt_skill_02_begin_01', 'stmkgt_skill_02_begin_02', 'stmkgt_skill_01_start_01',
  'stmkgt_skill_01_start_02', 'stmkgt_skill_01_start_03', 'stmkgt_skill_01_start_weapon_01', 'stmkgt_skill_01_start_weapon_02',
  'stmkgt_skill_01_hit_01', 'stmkgt_presure_buff_01', 'stmkgt_immortal_buff_01',
]);

const WHITE = 0xffffff, HOT = 0xfff1c9, ORANGE = 0xff8a2a, EMBER = 0xff5a1a, STEAM = 0xcfe6ff;

/**
 * @param {{ fx: any, ofx: any, wiring: any, views: Map<any, any>, preload?: (keys: string[]) => void }} deps
 */
export function createSteamKnightFx({ fx, ofx, wiring, views, preload, audio }) {
  const sound = (kind) => { try { audio?.()?.playSteamKnight?.(kind); } catch { /* sound is optional */ } };
  const dashing = new Map();   // knight id → { dr, dc }
  const boosted = new Set();   // knight ids with the steam loop running
  let preloaded = false;

  const ensure = () => {
    if (preloaded) return;
    preloaded = true;
    try { preload?.(STEAM_KNIGHT_FX_KEYS.slice()); } catch { /* the procedural look alone */ }
  };
  const official = (key, x, y, opts = {}) => {
    if (!ofx?.active || !ofx.lib.has(key)) return null;
    return ofx.spawn(key, { pos: [x - 10, y - 9, 0], groundZ: 0 }, { important: true, ...opts });
  };
  const proj = (x, y, z = 0) => fx._proj(x, y, z);

  /** A thruster plume behind (x, y) against the lane direction (dr, dc). */
  const plume = (x, y, dr, dc) => {
    const back = { x: x - dc * 0.55, y: y - dr * 0.55 };
    const tip = { x: x - dc * 1.9, y: y - dr * 1.9 };
    const p = proj(back.x, back.y, 0.55);
    const s = p.s;
    // nozzle flare: small white-hot glow, then the orange cone as stretched additive streaks
    fx.particle('glow', p.x, p.y, { tint: WHITE, life: 0.12, s0: (s / 128) * 0.9, s1: (s / 128) * 0.3, a0: 1, a1: 0 });
    fx.particle('glow', p.x, p.y, { tint: ORANGE, life: 0.22, s0: (s / 128) * 1.4, s1: (s / 128) * 0.5, a0: 0.9, a1: 0 });
    fx.streak(back.x, back.y, tip.x, tip.y, 0.55, HOT, 0.16);
    fx.streak(back.x, back.y - dc * 0.12, tip.x, tip.y - dc * 0.12, 0.5, ORANGE, 0.24);
    fx.streak(back.x, back.y + dc * 0.12, tip.x, tip.y + dc * 0.12, 0.5, EMBER, 0.3);
    fx.burst(p.x, p.y, s, 3, ORANGE, { speed: 1.6, life: 0.4, tex: 'dot', size: 0.3, g: 0.6 });
  };

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
          // the steam stays on him from the first drop (Boost: always on, the official stmkgt_presure_buff_01)
          if (v && id != null && !boosted.has(id)) { boosted.add(id); wiring.playOn?.('stmkgt_presure_buff_01', v, { loop: true }); }
          official('stmkgt_skill_02_end_01', x, y);
          sound('landing');
          const p = proj(x, y, 0.2);
          fx.ring(x, y, 0, 0.2, 2.4, STEAM, 0.6, 'shock');
          fx.ring(x, y, 0, 0.1, 1.4, WHITE, 0.4);
          fx.burst(p.x, p.y, p.s, 14, STEAM, { speed: 2.2, life: 0.6, tex: 'dot', size: 0.4 });
          break;
        }
        case 'leapUp':
          official('stmkgt_skill_02_begin_01', x, y);
          official('stmkgt_skill_02_begin_02', x, y);
          fx.ring(x, y, 0, 0.2, 1.8, ORANGE, 0.5, 'shock');
          break;
        case 'stance':
          sound('stance');
          break;
        case 'dashStart':
          sound('dash');
          official('stmkgt_skill_01_start_01', x, y);
          official('stmkgt_skill_01_start_02', x, y);
          official('stmkgt_skill_01_start_03', x, y);
          dashing.set(id, { dr: d.dr || 0, dc: d.dc || 0 });
          fx.flashScreen(HOT, 0.25, 0.25);
          break;
        case 'shove': {
          sound('shove');
          const p = proj(x, y, 0.4);
          fx.burst(p.x, p.y, p.s, 8, HOT, { speed: 2.6, life: 0.35, size: 0.4 });
          fx.ring(x, y, 0, 0.1, 0.9, ORANGE, 0.25);
          break;
        }
        case 'impact': {
          dashing.delete(id);
          const big = Math.min(2.2, 1 + (Number(d.tiles) || 0) * 0.12);
          const dr = d.dr || 0, dc = d.dc || 0;
          official('stmkgt_skill_01_hit_01', x, y);
          sound('impact');
          // white-hot flash with a ring and a streak down the lane, then the orange fire cone and the sparks
          const p = proj(x, y, 0.5);
          // (the user, 2026-11-24: the flash hid the strike pose) a small, short white-hot core on the contact point only
          fx.particle('glow', p.x, p.y, { tint: WHITE, life: 0.14, s0: (p.s / 128) * 0.5 * big, s1: (p.s / 128) * 1.3 * big, a0: 0.9, a1: 0 });
          fx.particle('glow', p.x, p.y, { tint: ORANGE, life: 0.3, s0: (p.s / 128) * 0.6 * big, s1: (p.s / 128) * 1.8 * big, a0: 0.6, a1: 0 });
          fx.ring(x, y, 0, 0.2, 3.2 * big, WHITE, 0.5, 'shock');
          fx.ring(x, y, 0, 0.1, 2 * big, ORANGE, 0.7, 'ring');
          fx.streak(x - dc * 3.5 * big, y - dr * 3.5 * big, x + dc * 4 * big, y + dr * 4 * big, 0.5, WHITE, 0.3);
          fx.streak(x - dc * 2.5 * big, y - dr * 2.5 * big, x + dc * 3 * big, y + dr * 3 * big, 0.5, ORANGE, 0.45);
          fx.burst(p.x, p.y, p.s, Math.round(26 * big), HOT, { speed: 3.4, life: 0.55, size: 0.5, g: 0.8 });
          fx.burst(p.x, p.y, p.s, Math.round(18 * big), ORANGE, { speed: 2.4, life: 0.8, tex: 'dot', size: 0.4, g: 0.9 });
          fx.flashScreen(WHITE, 0.3, 0.2);
          break;
        }
        default: break;
      }
    },

    /** Every frame: the thruster plume of a knight that is boosting. */
    frame() {
      for (const [id, dsh] of dashing) {
        const v = views.get(id);
        if (!v || v.destroyed) { dashing.delete(id); continue; }
        plume(v.x, v.y, dsh.dr, dsh.dc);
      }
    },

    clear() { dashing.clear(); boosted.clear(); },
  };
}
