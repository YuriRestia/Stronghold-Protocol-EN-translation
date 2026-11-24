// public/js/render/steamKnightFx.js — the look of the Steam Knight slice's pile bunker (dev sandbox only; the sim side is
// server/sim/content/steamKnight.js, which sends `fx 'steamKnight'` with { id, kind, … } and the clip forms through
// `fx 'phase'` — render/units.js FORMS enemy_1533_stmkgt).
//
// The official stmkgt effects (the client's battle/prefabs/effects/stmkgt.ab, 24 prefabs) are the look (the user,
// 2026-11-24: "I prefer official vfx"); the procedural effects below are the fallback only when the official ones are off
// or not loaded (设置「官方特效」). By `kind`:
//   landing   stmkgt_skill_02_end_01 where he comes down; the steam (stmkgt_presure_buff_01, the Boost) stays on him
//   leapUp    stmkgt_skill_02_begin_01 / _02 at the take-off
//   stance    the Zantetsuken cast start: stmkgt_skill_01_start_01 / _02 loops on him (ON_CAST_START)
//   dashStart the leap marker stmkgt_skill_02_marker_01 on the enemy he boosts at
//   shove     stmkgt_attack_hit_01 on a normal enemy he throws aside
//   impact /  the strike: start_03 (ON_SPELL_ON) and start_weapon_01 / _02 (ON_SPELL_END) loops on him,
//   zanHit    stmkgt_skill_01_hit_01 on the target; every loop stops at bunkerEnd (ON_CAST_END)
// Every number here is a look, not a rule: nothing in it reaches the sim.

export const STEAM_KNIGHT_FX_KEYS = Object.freeze([
  'stmkgt_skill_02_end_01', 'stmkgt_skill_02_begin_01', 'stmkgt_skill_02_begin_02', 'stmkgt_skill_01_start_01',
  'stmkgt_skill_01_start_03', 'stmkgt_skill_01_start_weapon_01', 'stmkgt_skill_01_start_weapon_02',
  'stmkgt_skill_01_hit_01', 'stmkgt_presure_buff_01', 'stmkgt_attack_hit_01',
  'stmkgt_skill_02_hit_01', 'stmkgt_attack_start_01', 'stmkgt_attack_weapon_01',
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
  const steam = new Map();     // knight id → the Boost's steam loop, held on him (follow) until he dies
  const held = new Map();      // knight id → { keys: Set, hs: [] } the Zantetsuken loops on him until its cast ends
  const jets = new Map();      // knight id → { v, next, dr, dc } boosting: an exhaust jet every JET_EVERY s
  const puffs = [];            // { h, left } the vent bursts on him, cut after their `left` s (the prefab loops)
  // looks, not rules: the exhaust jet is emitted every 0.03 battle s while he boosts. The pack has no thruster prefab, and
  // the ground blasts read as a thick low soup (the user, 2026-11-24), so the plume is drawn procedurally: small white
  // puffs leaving his back vents backwards along the dash, slowing in the air
  const JET_EVERY = 0.03;
  let preloaded = false;

  /** Start official loops on his mount points, held until stopHeld; false when none could play. */
  const holdOn = (id, v, keys) => {
    if (!v || id == null) return false;
    const e = held.get(id) || { keys: new Set(), hs: [] };
    held.set(id, e);
    let any = false;
    for (const k of keys) {
      if (e.keys.has(k)) { any = true; continue; }
      if (!has(k)) continue;
      const h = wiring.playOn?.(k, v, { follow: true, loop: true, important: true });
      if (h) { e.keys.add(k); e.hs.push(h); any = true; }
    }
    return any;
  };
  const stopHeld = (id) => {
    const e = held.get(id);
    if (!e) return;
    for (const h of e.hs) { try { h.stop?.(); } catch { /* gone */ } }
    held.delete(id);
  };
  /** The strike (Zantetsuken's ON_SPELL_ON start_03, then ON_SPELL_END's weapon glow: his hits all land in one frame). */
  const spell = (id, v) => holdOn(id, v, ['stmkgt_skill_01_start_03', 'stmkgt_skill_01_start_weapon_01', 'stmkgt_skill_01_start_weapon_02']);

  const ensure = () => {
    if (preloaded) return;
    preloaded = true;
    try { preload?.(STEAM_KNIGHT_FX_KEYS.slice()); } catch { /* the procedural look alone */ }
  };
  const has = (key) => !!(ofx?.active && ofx.lib.has(key));
  /** An official effect at a board point; null when it cannot play (the caller falls back to the procedural look). */
  const official = (key, x, y, opts = {}) => {
    if (!has(key)) return null;
    return ofx.spawn(key, { pos: [x - 10, y - 9, 0], groundZ: 0 }, { important: true, ...opts }) || null;
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
          // the steam stays on him from the first drop (Boost: always on): the official loop on his own mount point, held
          // with `follow` so it moves with him (and `frame` stops it when he dies). Without the hold it stayed where he
          // first landed and never stopped (the code review, 2026-11-24)
          if (v && id != null && !steam.has(id) && has('stmkgt_presure_buff_01')) {
            const h = wiring.playOn?.('stmkgt_presure_buff_01', v, { follow: true, loop: true });
            if (h) steam.set(id, h);
          }
          // a leap's landing is the end of its official window (DownToTile, on his own position); the first drop plays it here
          if (!(d.leap && leapOk.get(id))) {
            if (!official('stmkgt_skill_02_end_01', x, y)) fx.ring(x, y, 0, 0.2, 2.4, STEAM, 0.6, 'shock');
          }
          break;
        }
        case 'touchdown':
          // his feet hit the ground (the sim times it on the landing clip's touchdown, 0.4 s in): the landing sound and
          // the camera shake. The revive burst and the leap hit were cut (the user, 2026-11-24: the gold ribbons as he
          // falls should be removed) — the official landing effect and the TriggerHeroBomb shield stay
          sound('landing');
          shake?.(0.16, 0.4);
          break;
        case 'bunkerEnd':
          // the pile bunker or Zantetsuken is over (ON_CAST_END): its loops stop with their fade, and the marker
          stopHeld(id);
          jets.delete(id);
          { const m = marks.get(id); if (m) { try { m.stop?.(); } catch { /* gone */ } marks.delete(id); } }
          break;
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
          // the charge's look: the stance's back vent (start_01) and the pile's two weapon glows (start_weapon_01 / _02),
          // held on his mount points until the bunker ends. start_02 alone read as one glow stretched over the model
          // (the user, 2026-11-24); the two weapon glows are the pair the strike and the boost wear, and start_03
          // (ON_SPELL_ON) still comes with the strike only
          stopHeld(id);
          if (!holdOn(id, v, ['stmkgt_skill_01_start_01', 'stmkgt_skill_01_start_weapon_01', 'stmkgt_skill_01_start_weapon_02'])) {
            const got = ['start_01', 'start_weapon_01', 'start_weapon_02'].map((n) => official(`stmkgt_skill_01_${n}`, x, y));
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
          // the propulsion (the user, 2026-11-24: "the steam ... blast out behind his back and legs as he's boosting"; "the
          // glow ... should be playing when he's boosting already"): the pile's glow (Zantetsuken's start_weapon loops) from
          // the boost on, the take-off's ground blast (HeroBomb's skill_02_begin_02) where he sets off, and the stance's
          // back vent (start_01: steam out behind him) left along his path while he boosts (frame)
          holdOn(id, v, ['stmkgt_skill_01_start_weapon_01', 'stmkgt_skill_01_start_weapon_02']);
          if (v) wiring.playOn?.('stmkgt_skill_02_begin_02', v, { important: true });
          if (v && id != null) jets.set(id, { v, next: 0, dr: Number(d.dr) || 0, dc: Number(d.dc) || 0 });
          break;
        }
        case 'zanHit': {
          // the standing Zantetsuken's strike: its spell rows on him and its official hit on the target. No camera shake:
          // the client gives this skill none (the user, 2026-11-24: "his zantetsuken ... doing the screenshake, which I
          // dont think it should happen")
          sound('impact');
          spell(id, v);
          const tv = d.target != null ? views.get(d.target) : null;
          if (!(tv && has('stmkgt_skill_01_hit_01') && wiring.playOn?.('stmkgt_skill_01_hit_01', tv, {}))) official('stmkgt_skill_01_hit_01', x, y);
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
          jets.delete(id);
          spell(id, v);
          { const m = marks.get(id); if (m) { try { m.stop?.(); } catch { /* gone */ } marks.delete(id); } }
          // the official hit effects on the target's own hit point, plus the ground twin under him (the blow is the big one)
          const tv = d.target != null ? views.get(d.target) : null;
          const a = tv && has('stmkgt_skill_01_hit_01') ? !!wiring.playOn?.('stmkgt_skill_01_hit_01', tv, {}) : official('stmkgt_skill_01_hit_01', x, y);
          const b = official('stmkgt_attack_hit_01', x, y);
          // weight (the user, 2026-11-24: "the impact needs more oomph"): the leap's bomb hit and the revive burst layered
          // in at the contact, cut short, and a camera shake that grows with the tiles boosted
          brief('stmkgt_skill_02_hit_01', x, y, 0.8);
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

    /** Every frame (battle seconds): the boost's steam jets, the held steam loop while he stands, and the cuts. */
    frame(dt) {
      const step = Number(dt) > 0 ? Number(dt) : 0;
      // his death ends the Boost's steam loop: the sim holds it for his whole life and sends no stop for it
      for (const [id, h] of steam) {
        const view = views.get(id);
        if (view && !view.destroyed && view.alive !== false) continue;
        try { h.stop?.(); } catch { /* gone */ }
        steam.delete(id);
      }
      for (const [, j] of jets) {
        j.next -= step;
        if (j.next > 0) continue;
        j.next = JET_EVERY;
        // the jet leaves his back vents, backwards along the dash: two projected points give the screen direction
        const x = Number(j.v?.x) || 0, y = Number(j.v?.y) || 0;
        const front = proj(x + j.dc * 0.6, y + j.dr * 0.6, 0.45);
        const back = proj(x - j.dc * 0.35, y - j.dr * 0.35, 0.45);
        let ux = back.x - front.x, uy = back.y - front.y;
        const len = Math.hypot(ux, uy) || 1;
        ux /= len; uy /= len;
        const sPx = back.s;
        for (let i = 0; i < 2; i++) {
          const o = { tint: STEAM, add: false, drag: 2.6, life: 0.45 + i * 0.1, fadeIn: 0.05, s1: sPx * 0.45 };
          o.vx = ux * sPx * (1.6 + i * 0.5) + (i ? sPx * 0.12 : -sPx * 0.12);
          o.vy = uy * sPx * (1.6 + i * 0.5) + sPx * (0.15 + i * 0.05);
          o.s0 = sPx * (0.10 + i * 0.03); o.a0 = 0.5 - i * 0.12;
          fx.particle('smoke', back.x + (i ? sPx * 0.1 : -sPx * 0.08), back.y, o);
        }
        // the stance's back vent on his own body adds the hot core every second emission
        if ((j.n = (j.n || 0) + 1) % 2 === 1) {
          const h = wiring.playOn?.('stmkgt_skill_01_start_01', j.v, { important: true });
          if (h) puffs.push({ h, left: 0.5 });
        }
      }
      for (let i = puffs.length - 1; i >= 0; i--) {
        if ((puffs[i].left -= step) > 0) continue;
        try { puffs[i].h.stop?.(); } catch { /* gone */ }
        puffs.splice(i, 1);
      }
    },

    /** A new battle or the prep board: every handle stopped, every map emptied (a knight of the next battle may get
     * the same id). */
    clear() {
      for (const m of [marks, steam]) for (const h of m.values()) { try { h.stop?.(); } catch { /* gone */ } }
      for (const id of [...held.keys()]) stopHeld(id);
      for (const p of puffs.splice(0)) { try { p.h.stop?.(); } catch { /* gone */ } }
      jets.clear();
      steam.clear(); leapOk.clear(); marks.clear();
    },
  };
}
