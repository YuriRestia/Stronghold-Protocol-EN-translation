// ui/rangePreview.js (fork) — the detail card's 攻击范围 toggle: the range the unit attacks with now, or the one it
// attacks with while its skill runs. One switch for the card's mini-map and the field overlay (screens/game.js
// cardRange, the dev sandbox), kept across cards and sessions (pref `rangePreview`).
import { createStore, useStore, loadPref, savePref } from '../store.js';
import { skillAttackRangeGrid } from '../../../shared/loadoutRecord.js';

const sanitize = (v) => ({ skill: !!(v && typeof v === 'object' && v.skill === true) });

export const rangePreviewStore = createStore(sanitize(loadPref('rangePreview', null)));
rangePreviewStore.subscribe((s) => savePref('rangePreview', s));

/** Show the skill's range (true) or the range now (false). */
export const setSkillRangePreview = (on) => rangePreviewStore.set({ skill: !!on });

/** Preact hook: whether the skill-range preview is on. */
export function useSkillRangePreview() {
  return useStore((s) => s.skill, Object.is, rangePreviewStore);
}

/**
 * The grid the unit attacks with while its skill runs: the live entry's `skillRange` (shared/protocol.js
 * unitStatsEntry — the kit's own range, 攻击距离 included), else the loadout record's (shared/loadoutRecord.js
 * skillAttackRangeGrid). null when the skill keeps the attack range — no toggle then.
 * @param {any} live unitStatsEntry (+ src) or null @param {any} rec loadout-resolved record
 * @returns {number[][]|null}
 */
export function skillRangeGrid(live, rec) {
  if (live && Array.isArray(live.skillRange) && live.skillRange.length) return live.skillRange;
  // a live entry without one: the kit keeps the attack range (a grid that only selects targets, a passive)
  if (live && Array.isArray(live.range)) return null;
  try { return skillAttackRangeGrid(rec); } catch { return null; }
}
