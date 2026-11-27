// The Challenges state (fish-edition/untracked/challenge-system-draft.md §6): what is kept in this browser, and every action on it
// as a pure function (state in, state out), so the panel only calls these and a test can run them without a page. The panel is
// generated from the player's own finished matches (history = facts.js facts, newest last) by generate.js; nothing here talks to
// a server, and `reset` clears all of it.
//
// Shape (v 1): { v, enabled, showPopup, level, seed, rolls, open: [card|null × SLOTS], done: [{ at, pts, parts }] }
//   card = { id, parts: [instance id], rating, points, frozen }.   rolls counts the regenerations, so every one draws fresh.

import { generatePanel, SLOTS } from './generate.js';
import { resolve, check } from './catalog.js';

export const STATE_VERSION = 1;
export const MAX_LEVEL = 6; // Easier / Harder presses either way (beyond it the generator would only repeat the extremes)
export const MAX_DONE = 200;

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const int = (v, d, lo, hi) => (Number.isInteger(v) ? Math.min(hi, Math.max(lo, v)) : d);

export function defaultState(seed = 1) {
  return { v: STATE_VERSION, enabled: true, showPopup: true, level: 0, seed: int(seed, 1, 1, 0x7fffffff), rolls: 0, open: new Array(SLOTS).fill(null), done: [] };
}

function normalizeCard(c) {
  if (!isObj(c) || !Array.isArray(c.parts) || !c.parts.length || c.parts.length > 8) return null;
  if (!c.parts.every((id) => typeof id === 'string' && resolve(id))) return null;
  const rating = Number.isFinite(c.rating) ? c.rating : 0;
  return { id: typeof c.id === 'string' ? c.id.slice(0, 120) : c.parts.join('+'), parts: [...c.parts], rating, points: int(c.points, 1, 1, 10000), frozen: c.frozen === true };
}

/** A stored value, made safe: unknown fields dropped, unknown instances (a catalog change) drop their card, everything bounded. */
export function normalizeState(raw) {
  if (!isObj(raw) || raw.v !== STATE_VERSION) return defaultState();
  const open = Array.from({ length: SLOTS }, (_, i) => normalizeCard(raw.open?.[i]));
  const done = (Array.isArray(raw.done) ? raw.done : []).filter((d) => isObj(d) && Number.isFinite(d.at) && Array.isArray(d.parts))
    .slice(-MAX_DONE).map((d) => ({ at: d.at, pts: int(d.pts, 0, 0, 100000), parts: d.parts.filter((x) => typeof x === 'string').slice(0, 8) }));
  return { v: STATE_VERSION, enabled: raw.enabled !== false, showPopup: raw.showPopup !== false, level: int(raw.level, 0, -MAX_LEVEL, MAX_LEVEL), seed: int(raw.seed, 1, 1, 0x7fffffff), rolls: int(raw.rolls, 0, 0, 1e9), open, done };
}

/** Generates what the state lacks (a slot with no card): the first panel, or a card whose instance left the catalog. */
export function ensure(state, history, prior) {
  if (!state.enabled || state.open.every(Boolean)) return state;
  return regenerate(state, history, prior, { bump: false });
}

/** Regenerates every card that is not frozen. */
export function regenerate(state, history, prior, { bump = true } = {}) {
  const rolls = state.rolls + (bump ? 1 : 0);
  const panel = generatePanel({ prior, history, level: state.level, frozen: state.open.map((c) => (c && c.frozen ? c : null)), seed: (state.seed + rolls * 7919) >>> 0 || 1 });
  return { ...state, rolls, open: panel.cards.map((c) => ({ id: c.id, parts: c.parts, rating: c.rating, points: c.points, frozen: c.frozen })) };
}

export const reroll = (state, history, prior) => regenerate(state, history, prior);
export const easier = (state, history, prior) => regenerate({ ...state, level: Math.max(-MAX_LEVEL, state.level - 1) }, history, prior);
export const harder = (state, history, prior) => regenerate({ ...state, level: Math.min(MAX_LEVEL, state.level + 1) }, history, prior);

export function toggleFreeze(state, i) {
  if (!state.open[i]) return state;
  const open = state.open.slice(); open[i] = { ...open[i], frozen: !open[i].frozen };
  return { ...state, open };
}
export const setEnabled = (state, enabled) => ({ ...state, enabled: !!enabled });
export const setShowPopup = (state, showPopup) => ({ ...state, showPopup: !!showPopup });
/** B12: everything this system stored goes (the seed is new, so the panel is not the same one again). */
export const reset = (seed) => defaultState(seed);

/**
 * A finished match against the open cards: every card all of whose parts hold is completed (true, never "unknown"), earns its
 * points, goes into `done` and is replaced by a new card (an unfrozen one: a completed freeze is spent). The other cards stay as they
 * are, frozen or not. `history` should already hold this match (the model then sees it). Pure; `facts` is facts.js of the match.
 * @returns {{ state: any, completed: { index: number, parts: string[], points: number }[], points: number }}
 */
export function complete(state, facts, history, prior, now = Date.now()) {
  if (!state.enabled || !facts) return { state, completed: [], points: 0 };
  const completed = [];
  state.open.forEach((c, index) => {
    if (c && check(c.parts.map((id) => resolve(id)), facts) === true) completed.push({ index, parts: c.parts, points: c.points });
  });
  if (!completed.length) return { state, completed, points: 0 };
  const points = completed.reduce((n, c) => n + c.points, 0);
  const gone = new Set(completed.map((c) => c.index));
  // the cards that stay are held (frozen) for the draw, so only the completed slots get new cards; their own flags come back after
  const held = state.open.map((c, i) => (c && !gone.has(i) ? { ...c, frozen: true } : null));
  const rolls = state.rolls + 1;
  const panel = generatePanel({ prior, history, level: state.level, frozen: held, seed: (state.seed + rolls * 7919) >>> 0 || 1 });
  const open = panel.cards.map((card, i) => (gone.has(i) ? { id: card.id, parts: card.parts, rating: card.rating, points: card.points, frozen: false } : state.open[i]));
  const done = [...state.done, ...completed.map((c) => ({ at: now, pts: c.points, parts: c.parts }))].slice(-MAX_DONE);
  return { state: { ...state, rolls, open, done }, completed, points };
}
