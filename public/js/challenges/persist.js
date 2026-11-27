// The Challenges state in localStorage (`sp.pref.challenges`, store.js loadPref / savePref: every access is guarded there, so a
// private window or blocked storage just gives the default state each time). The local match history it is generated from comes
// from ui/stats.js; nothing is sent anywhere.

import { loadPref, savePref } from '../store.js';
import { loadStats } from '../ui/stats.js';
import { defaultState, normalizeState } from './state.js';
import { factsFromClientRecord } from './facts.js';

export const PREF_KEY = 'challenges';

export function loadChallenges() {
  const raw = loadPref(PREF_KEY, null);
  return raw == null ? defaultState(((Date.now() / 1000) | 0) || 1) : normalizeState(raw);
}
export const saveChallenges = (state) => savePref(PREF_KEY, state);

/** The finished matches of this browser as facts (a match left early, and a record the facts cannot be read from, are not in it). Oldest first. */
export function localHistory() {
  const recs = loadStats().records ?? [];
  const out = [];
  for (const r of [...recs].sort((a, b) => (a.t ?? 0) - (b.t ?? 0))) { const f = factsFromClientRecord(r); if (f) out.push(f); }
  return out;
}
