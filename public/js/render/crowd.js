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

/** The units a field draws directly before impostors. o: { quality, loadLevel, roomy (desktop, frames kept up) } */
export function impostorBase({ quality = 'high', loadLevel = 0, roomy = false } = {}) {
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
  // a struggling device (load level ≥ 2) may refresh a big crowd more rarely (10 Hz at worst)
  return Math.min((o.loadLevel || 0) >= 2 ? 6 : 4, Math.max(2, Math.ceil(n / (base * 0.75))));
}
