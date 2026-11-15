// render/crowd.js — (fork) when a crowded field switches its Spine units to impostors (render/app.js
// pickImpostorInterval; render/units.js _updateImpostor), and how often each impostor redraws its pose.
//
// The base is the number of animated units a field draws directly at each quality (12 / 26 / 44, divided by
// 1 + the adaptive load level). A desktop at High with frames to spare (load level 0) draws twice as many before
// switching (ROOMY_HIGH): a Grand Alliance relay field holds 70–90 units, and a strong PC drew them directly at
// 89 fps where the 44 limit turned them into impostors refreshed every third frame (crew-docs/ga-lag-proposal.md).
// Once the load level rises during such a crowd, the field goes back to the 44 base until the crowd thins out
// (`roomy` false, render/app.js), so a slower PC is never stuck switching between the two.

export const IMPOSTOR_BASE = Object.freeze({ low: 12, medium: 26, high: 44 });
/** Animated units a desktop at High draws directly while its frames keep up (load level 0). */
export const ROOMY_HIGH = 88;

/**
 * (fork) 设置「简化单位动画」 (`spriteAnim`, en: "Simplified Sprite Animation"; the user's own option texts, 2026-11-15):
 * - 'auto' (default): full animation; when the frame rate drops (the load level below) units switch to impostors until
 *   it recovers.
 * - 'quality': the load level never turns a unit into an impostor; only a crowd past ROOMY_HIGH does, on any device and
 *   at any 画面质量 (the "about 90+ units" of the option's text).
 * - 'unlimited': never an impostor (the enemy preview pen's idle figures included).
 */
export const SPRITE_ANIM_MODES = Object.freeze(['auto', 'quality', 'unlimited']);

/** The units a field draws directly before impostors. o: { quality, loadLevel, roomy (desktop, frames kept up), mode } */
export function impostorBase({ quality = 'high', loadLevel = 0, roomy = false, mode = 'auto' } = {}) {
  if (mode === 'unlimited') return Infinity;
  if (mode === 'quality') return ROOMY_HIGH;
  const q = IMPOSTOR_BASE[quality] ? quality : 'high';
  const base = q === 'high' && roomy ? ROOMY_HIGH : IMPOSTOR_BASE[q];
  return base / (1 + loadLevel);
}

/**
 * Frames between two pose redraws of an impostor unit: 0 = no impostors (the field draws every unit directly).
 * n = animated units on the field; o as impostorBase plus `force` (dev / tests: impostors always, every 2nd frame).
 */
export function impostorInterval(n, o = {}) {
  if (o.force) return 2;
  const base = impostorBase(o);
  if (n <= base) return 0;
  // a struggling device (load level ≥ 2) may refresh a big crowd more rarely (10 Hz at worst); 'quality' ignores the level
  const lvl = o.mode === 'quality' ? 0 : (o.loadLevel || 0);
  return Math.min(lvl >= 2 ? 6 : 4, Math.max(2, Math.ceil(n / (base * 0.75))));
}

/**
 * (fork) Enemies first (user, 2026-11-15): when a crowd switches to impostors, the player's and the helpers' units (every
 * unit not on the enemy side) stay drawn directly as long as they alone fit under the base; only the enemies become
 * impostors. Returns { enemy, ally }: the interval of each side (0 = drawn directly).
 * n = animated units on the field, allies = those of them not on the enemy side; o as impostorInterval.
 */
export function crowdIntervals(n, allies, o = {}) {
  const enemy = impostorInterval(n, o);
  if (!enemy || o.force) return { enemy, ally: enemy };
  return { enemy, ally: allies <= impostorBase(o) ? 0 : enemy };
}

/**
 * The least interval the load level puts on one unit (units.js), whatever the crowd: from level 1 a small / far unit
 * (< ~56 px per tile) every 2nd frame, from level 2 every unit. (fork) Enemies first: a unit not on the enemy side is
 * spared until the top level (LOAD_MAX); 'quality' and 'unlimited' never apply it.
 */
export function loadFloor(level, { enemy = true, far = false, mode = 'auto' } = {}) {
  if (!(level > 0) || mode !== 'auto') return 0;
  if (!enemy && level < LOAD_MAX) return 0;
  return level >= 2 || far ? 2 : 0;
}

// ---- the adaptive load level (render/app.js adaptLoad) ----
// A device that cannot hold the frame rate with the current work steps the load level up (0–LOAD_MAX): crowds switch
// to impostors earlier (impostorBase) and units take the load floor (loadFloor); a calm spell steps it back down.
// Slow / calm frame lines: unchanged from before this fork change (render/app.js adaptLoad).
export const LOAD_SLOW_MS = 19.5;
export const LOAD_CALM_MS = 17.6;
export const LOAD_MAX = 3;
// (fork) Timings: design values the user approved on 2026-11-15 from Dev 44's measurement of a round-12 Grand Alliance
// relay field on an idle RTX 4080 desktop (crew notes dev44-ga-impostor-measure-report-2.md: every run tripped 0→1 at
// 1.2–1.4 s on battle-start loading frames; the leaks' spawn rush ran slow for 2–3 s around 3–5 s; frames were calm
// again from about 6 s, yet the old way down — 6 s × level of calm — kept units on impostors for up to 31 s).
/** Drawn seconds after a battle starts (enterBattle) whose slow frames never step the level up: model, effect and
 *  shader loading. */
export const LOAD_GRACE_S = 3;
/** Seconds of continuous slow frames that step the level up (was 1). */
export const LOAD_UP_S = 3;
/** Seconds of continuous calm frames that step the level down by one (was 6 × the level, or 2 with a small field). */
export const LOAD_DOWN_S = 2;

/** A fresh load meter. `battleFor` = drawn seconds since the battle started (Infinity: no battle start seen). */
export function createLoadMeter() {
  return { level: 0, slowFor: 0, fastFor: 0, battleFor: Infinity };
}

/** A battle starts (render/app.js enterBattle): the level goes back to 0 and the grace period begins. */
export function startBattleLoad(m) {
  m.level = 0; m.slowFor = 0; m.fastFor = 0; m.battleFor = 0;
}

/**
 * One drawn frame: dt = its seconds, workMs = the frame's work, busy = a field with more than a few units.
 * Returns +1 / −1 when the level stepped, else 0.
 */
export function stepLoad(m, dt, workMs, busy) {
  m.battleFor += dt;
  if (workMs > LOAD_SLOW_MS && busy) {
    if (m.battleFor > LOAD_GRACE_S) m.slowFor += dt;
    m.fastFor = 0;
  } else if (workMs < LOAD_CALM_MS) { m.fastFor += dt; m.slowFor = 0; }
  if (m.slowFor > LOAD_UP_S && m.level < LOAD_MAX) { m.level++; m.slowFor = 0; m.fastFor = 0; return 1; }
  if (m.level > 0 && m.fastFor > LOAD_DOWN_S) { m.level--; m.fastFor = 0; return -1; }
  return 0;
}
