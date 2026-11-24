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
//   dashStart the leap marker stmkgt_skill_02_marker_01 on the enemy he boosts at; his thrusters (the take-off's jets,
//             lit at the charge's end and turned to point behind him) and the steam left along the boost
//   shove     stmkgt_attack_hit_01 on a normal enemy he throws aside
//   impact /  the strike: start_03 (ON_SPELL_ON) and start_weapon_01 / _02 (ON_SPELL_END) loops on him,
//   zanHit    stmkgt_skill_01_hit_01 on the target; every loop stops at bunkerEnd (ON_CAST_END)
// Every number here is a look, not a rule: nothing in it reaches the sim.

import { SKELETON_TILT } from './vfx/mounts.js';

export const STEAM_KNIGHT_FX_KEYS = Object.freeze([
  'stmkgt_skill_02_end_01', 'stmkgt_skill_02_begin_01', 'stmkgt_skill_02_begin_02', 'stmkgt_skill_01_start_01',
  'stmkgt_skill_01_start_02', 'stmkgt_skill_01_start_03', 'stmkgt_skill_01_start_weapon_01', 'stmkgt_skill_01_start_weapon_02',
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
  const jets = new Map();      // knight id → { v, dr, dc, wait, hs } his thrusters: waiting to light, then burning
  // The thrusters are the official take-off's own jets (HeroBomb's stmkgt_skill_02_begin_01: two jet flames and their
  // steam, straight down) turned to point away from the boost. JET_LIT: their flame fades in from 0.4 s and is full at
  // 1.1 s [src: official stmkgt_skill_02_begin_01 clip material._TintColor.a keys 0.4 / 1.1], so lit that long before the
  // boost they burn at full as he leaves. (The puffs tried before came out 0.4-0.5 s late, after a 0.35 s boost was over.)
  const JET_KEY = 'stmkgt_skill_02_begin_01', JET_LIT = 1.1;
  // One thruster on his back (the user, 2026-11-24: "just one thruster should be enough, but a bit bigger and clearer on
  // his back"; the prefab's two needle planes, three pairs of them, read as six thin jets). Looks, not rules: its nozzle's
  // place (tiles behind his middle, up his body), and the two planes (nodes steam_01 / _02) as one flame: [length, width]
  // scale of the outer flame and of the core. Their front halves lie under his body (underMesh).
  const NOZZLE = [0.35, 0.85], FLAME = [[3, 3.4, 14], [4, 2.4, 7]], JET_BACK = 0.7;
  // The steam left along the boost: the stance's vent (stmkgt_skill_01_start_01), its 0.4 s start delay skipped [src:
  // official stmkgt_skill_01_start_01 smoke_01 startDelay], one puff every PUFF_EVERY s dropped PUFF_BACK tiles behind him
  // and cut after PUFF_LIFE (looks, not rules). The pile's exhausts blow with it, their 0.5 s `_delayToPlay` skipped.
  const PUFF_KEY = 'stmkgt_skill_01_start_01', PUFF_SKIP = 0.4, PUFF_EVERY = 0.07, PUFF_BACK = 1.2, PUFF_LIFE = 0.9;
  const EXHAUST = ['stmkgt_skill_01_start_weapon_01', 'stmkgt_skill_01_start_weapon_02'], EXHAUST_SKIP = 0.5;
  const puffs = [];            // { h, left }
  const puff = (j) => {
    if (!has(PUFF_KEY)) return;
    const t = -SKELETON_TILT / 2 * Math.PI / 180;
    const h = ofx.spawn(PUFF_KEY, { pos: [j.v.x - 10 - j.dc * PUFF_BACK, j.v.y - 9 - j.dr * PUFF_BACK, -(j.v.z || 0)], groundZ: -(j.v.z || 0), rootRot: [Math.sin(t), 0, 0, Math.cos(t)], flipY: j.dc < 0 }, { important: true, skip: PUFF_SKIP });
    if (h) puffs.push({ h, left: PUFF_LIFE });
  };
  let preloaded = false;
  let clock = 0, zanAt = -1;   // frames drawn; the frame the last Zantetsuken hit sounded in

  /** Light his thrusters `skip` s into the flame's own fade-in, kept on him until douse. */
  const ignite = (j, skip = 0) => {
    if (j.hs || !has(JET_KEY)) return;
    j.hs = [];
    // the jets point down the model's plane; turned in that plane to point against the boost (dc, dr: board right / up)
    const a = Math.atan2(-j.dc, j.dr) / 2, t = -SKELETON_TILT / 2 * Math.PI / 180;
    const rootRot = [Math.sin(t) * Math.cos(a), -Math.sin(t) * Math.sin(a), Math.cos(t) * Math.sin(a), Math.cos(t) * Math.cos(a)];
    const cos = Math.cos(SKELETON_TILT * Math.PI / 180), sin = Math.sin(SKELETON_TILT * Math.PI / 180);
    const at = (out, back) => {
      out[0] = j.v.x - 10 - j.dc * back; out[1] = j.v.y - 9 - j.dr * back + NOZZLE[1] * cos; out[2] = -(j.v.z || 0) - NOZZLE[1] * sin;
      return out;
    };
    // a plane's world matrix: its length against the boost (its drawn end is +x: the dissolve mask eats the other), its
    // width up the model (a boost along the column: across it)
    const x = [-j.dc, -j.dr, 0], y = j.dc ? [0, cos, -sin] : [1, 0, 0];
    const z = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
    const ov = new Map(FLAME.map(([node]) => [node, new Float64Array(16)])), p = [0, 0, 0];
    const track = (e) => {
      if (!j.v || j.v.destroyed) return;
      at(e.anchor, JET_BACK); e.groundZ = -(j.v.z || 0);
      at(p, NOZZLE[0]);
      for (const [node, len, wide] of FLAME) {
        const m = ov.get(node);
        for (let i = 0; i < 3; i++) { m[i] = x[i] * len; m[4 + i] = y[i] * wide; m[8 + i] = z[i]; m[12 + i] = p[i]; }
        m[15] = 1;
      }
      e.worldOv = ov;
    };
    const h = ofx.spawn(JET_KEY, { pos: at([0, 0, 0], JET_BACK), groundZ: -(j.v.z || 0), rootRot },
      { important: true, loop: true, owner: j.v, skip, onBody: true, underMesh: true, track });
    if (h) j.hs.push(h);
  };
  const douse = (id) => {
    const j = jets.get(id);
    if (!j) return;
    for (const h of j.hs || []) { try { h.stop?.(); } catch { /* gone */ } }
    jets.delete(id);
  };

  /** Start official loops on his mount points, held until stopHeld; false when none could play. */
  const holdOn = (id, v, keys) => {
    if (!v || id == null) return false;
    const e = held.get(id) || { keys: new Set(), hs: [] };
    held.set(id, e);
    let any = false;
    for (const k of keys) {
      if (e.keys.has(k)) { any = true; continue; }
      if (!has(k)) continue;
      // (onBody: the pile's spike glow is its one layer that tests the board's depth, and the raised tiles behind him cut
      // it off along a straight edge as the pile swung back; and it lay a frame behind the swinging pile — the user,
      // 2026-11-24)
      const h = wiring.playOn?.(k, v, { follow: true, loop: true, important: true, onBody: true });
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
  /** The strike: ON_SPELL_ON's shock (start_03), then ON_SPELL_END's steam out of the pile's two exhausts (start_weapon_01 /
   * _02: smoke only, on the bones Weapon_Ea / _Eb, 0.5 s `_delayToPlay`; his hits all land in one frame). */
  const spell = (id, v) => holdOn(id, v, ['stmkgt_skill_01_start_03', 'stmkgt_skill_01_start_weapon_01', 'stmkgt_skill_01_start_weapon_02']);

  const ensure = () => {
    if (preloaded) return;
    preloaded = true;
    sound('warm');
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

    /** His normal attack's cast starts (render/app/windup.js): the laser blade's sound, which peaks as the blade lights. */
    swing() { sound('swing'); },

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
          douse(id);
          { const m = marks.get(id); if (m) { try { m.stop?.(); } catch { /* gone */ } marks.delete(id); } }
          break;
        case 'leapUp': {
          sound('takeoff');
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
          // the official Zantetsuken (index.json units.enemy_1533_stmkgt.skills.zantetsuken, a MultiMeleeAttack): its
          // ON_CAST_START loops start_01 (steam) / start_02 (the pile's glow: weapon_glow_01 on the bone Weapon_Hc, lit 1 s
          // in, flaring at 2.2 s, over a 7.3 s clip — the 5 s charge and the thrust) now, until ON_CAST_END (bunkerEnd);
          // start_03 (ON_SPELL_ON) and the exhaust steam (ON_SPELL_END) come with the strike (spell)
          stopHeld(id);
          douse(id);
          if (!holdOn(id, v, ['stmkgt_skill_01_start_01', 'stmkgt_skill_01_start_02'])) {
            const got = ['start_01', 'start_02'].map((n) => official(`stmkgt_skill_01_${n}`, x, y));
            if (!got.some(Boolean)) fx.ring(x, y, 0, 0.2, 1.2, HOT, 0.4, 'shock');
          }
          // the charge before a boost: his thrusters light JET_LIT s ahead of it (frame)
          if (v && d.boostIn > 0) jets.set(id, { v, dr: Number(d.dr) || 0, dc: Number(d.dc) || 0, wait: d.boostIn - JET_LIT, hs: null });
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
          // the propulsion (the user, 2026-11-24: "the steam ... blast out behind his back and legs as he's boosting"): his
          // thrusters, burning since the charge's end (lit at full here if they were not), and one ground blast (the
          // take-off's skill_02_begin_02) where he sets off. The pile's glow is the charge's own, still on it
          if (v) wiring.playOn?.('stmkgt_skill_02_begin_02', v, { important: true });
          if (v && id != null) {
            const j = jets.get(id) || { v, dr: Number(d.dr) || 0, dc: Number(d.dc) || 0, wait: 0, hs: null };
            j.wait = 0;
            j.puffIn = 0;   // boosting from now on: the steam behind him (frame)
            jets.set(id, j);
            ignite(j, JET_LIT);
            for (const k of EXHAUST) wiring.playOn?.(k, v, { important: true, skip: EXHAUST_SKIP });
          }
          break;
        }
        case 'zanHit': {
          // the standing Zantetsuken's strike: its spell rows on him and its official hit on the target. No camera shake:
          // the client gives this skill none (the user, 2026-11-24: "his zantetsuken ... doing the screenshake, which I
          // dont think it should happen")
          // (one zanHit per enemy hit, all in one frame: one sound)
          if (zanAt !== clock) { zanAt = clock; sound('zanHit'); }
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
          douse(id);
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
      clock++;
      // his death ends the Boost's steam loop: the sim holds it for his whole life and sends no stop for it
      for (const [id, h] of steam) {
        const view = views.get(id);
        if (view && !view.destroyed && view.alive !== false) continue;
        try { h.stop?.(); } catch { /* gone */ }
        steam.delete(id);
      }
      for (const j of jets.values()) {
        if (!j.hs && (j.wait -= step) <= 0) ignite(j);
        if (j.puffIn != null && step > 0 && (j.puffIn -= step) <= 0) { j.puffIn += PUFF_EVERY; puff(j); }
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
      for (const id of [...jets.keys()]) douse(id);
      for (const p of puffs.splice(0)) { try { p.h.stop?.(); } catch { /* gone */ } }
      steam.clear(); leapOk.clear(); marks.clear();
    },
  };
}
