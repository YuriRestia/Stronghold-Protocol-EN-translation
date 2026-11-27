// Generating the panel of Challenges (fish-edition/untracked/challenge-system-draft.md §5.2). Pure: the same seed, history, level and
// frozen cards always give the same panel, so a reload shows the same challenges and a test can reproduce one.
//
// A challenge = one outcome + conditions whose ratings (prior.json, logit difficulty) sum to a TARGET near the player's level:
// success chance = sigmoid(θ − sum), so the target sum θ means "about one match in two". Easier / Harder shift the target by
// STEP per press; the three slots sit a little apart so the panel offers a choice of effort. A frozen card is kept as it is.

import { OUTCOMES, CONDITIONS, resolve, compatible, META_CUSTOM, anyCustomId } from './catalog.js';
import { ability, playstyle } from './model.js';
import { MODZ } from '../../../shared/modZ.js';

export const STEP = 0.5; // logit per Easier / Harder press (Fish, 2026-11-26: halve if automated tests find it too extreme)
export const HALF_WIDTH = 0.4; // half-width of the target range
export const SLOTS = 3;
export const MAX_PARTS = 5; // one outcome + up to four conditions
const TRIES = 60;

/** mulberry32: a small seeded PRNG (the same shape the engine uses for its own seeded draws). */
export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pickWeighted = (items, weights, r) => {
  let total = 0; for (const w of weights) total += w;
  if (!(total > 0)) return null;
  let x = r() * total;
  for (let i = 0; i < items.length; i++) { x -= weights[i]; if (x <= 0) return items[i]; }
  return items[items.length - 1];
};

/** [PLACEHOLDER, no data: the human records hold too few custom boards to rate operators one by one] rating of "field one of A, B, C". */
export const ANY_CUSTOM_RATING = 0.8;
const rateOf = (p, prior) => (p.dynamic ? prior.ratings.anyCustom ?? ANY_CUSTOM_RATING : prior.ratings[p.id] ?? 0);
export const ratingOf = (parts, prior) => parts.reduce((s, p) => s + rateOf(p, prior), 0);

/**
 * "Field one of A, B, C", from the custom pool of this game version (null without one). Fish, 2026-11-26: at least one of the three has
 * a Mod Z / W / V (they are the operators to try in a modded room), and either at least one is a meta operator or a second has a module;
 * the third is any other operator. The card never needs the module itself: the operator on the board is enough.
 */
export function makeAnyCustom(pool, r) {
  const have = new Set(pool ?? []);
  const mods = [...new Set(MODZ.map((m) => m.charId))].filter((x) => have.has(x));
  const meta = META_CUSTOM.filter((x) => have.has(x) && !mods.includes(x));
  if (!mods.length || !meta.length) return null;
  const take = (arr) => arr.splice(Math.floor(r() * arr.length), 1)[0];
  const a = take(mods);
  const b = r() < 0.75 || !mods.length ? take(meta) : take(mods); // a second module operator also satisfies the rule
  const rest = (pool ?? []).filter((x) => x !== a && x !== b);
  if (!rest.length) return null;
  return resolve(anyCustomId([a, b, rest[Math.floor(r() * rest.length)]]));
}
/** The points of a challenge (the prior rating, not the personal one: playing badly on purpose cannot raise it). Scale (Fish, 2026-11-27): 100 to 400, about a won match's worth (100 to 450); steps of 10. */
export const pointsOf = (rating) => Math.min(400, Math.max(100, Math.round((rating * 130) / 10) * 10));
const isWinOutcome = (p) => p.id === 'win' || p.id === 'winHidden';

/** One challenge near `target` (±tol), avoiding keys in `taken` (what the other cards hold). */
function makeOne({ prior, style, target, tol, taken, r, usedIds }) {
  const rated = (c) => c.needsPrior && prior.ratings[c.id] != null;
  const outcomes = OUTCOMES.filter((c) => rated(c) && !usedIds.has(c.id));
  if (!outcomes.length) outcomes.push(...OUTCOMES.filter(rated));
  let best = null;
  for (let attempt = 0; attempt < TRIES; attempt++) {
    const out = pickWeighted(outcomes, outcomes.map((o) => (o.id === 'win' ? 4 : o.id === 'winHidden' ? 2 : 1) * Math.exp(-Math.abs(target - prior.ratings[o.id]) / 2)), r);
    const parts = [out];
    let sum = ratingOf(parts, prior);
    while (parts.length < MAX_PARTS && Math.abs(sum - target) > tol) {
      const gap = target - sum;
      const dyn = makeAnyCustom(prior.customPool, r);
      const cands = [...CONDITIONS, ...(dyn ? [dyn] : [])].filter((c) => (c.dynamic || rated(c)) && !taken.has(c.key) && compatible(parts, c) && (c.kind !== 'performance' || isWinOutcome(out)));
      // prefer a condition whose rating closes the gap (a hard condition alone, or a light one that leaves room); novelty favours the unusual
      const w = cands.map((c) => Math.exp(-Math.abs(gap - rateOf(c, prior))) * (c.dynamic ? 1 : style.novelty(c)));
      const c = pickWeighted(cands, w, r);
      if (!c) break;
      parts.push(c); sum += rateOf(c, prior);
    }
    const err = Math.abs(sum - target);
    if (!best || err < best.err) best = { parts, err, sum };
    if (err <= tol && parts.length >= 1) break;
  }
  return best;
}

/**
 * The panel: `SLOTS` challenges. `frozen[i]` (a saved challenge) is kept; the others are generated.
 * @param {{ prior: any, history?: any[], level?: number, frozen?: (any|null)[], seed: number }} o
 * @returns {{ theta: number, target: number, cards: { id: string, parts: string[], rating: number, points: number, frozen: boolean }[] }}
 */
export function generatePanel({ prior, history = [], level = 0, frozen = [], seed }) {
  const { theta } = ability(history, prior);
  const style = playstyle(history);
  const r = rng(seed);
  const target = theta + level * STEP;
  const taken = new Set();
  const usedIds = new Set();
  const cards = new Array(SLOTS).fill(null);
  for (let i = 0; i < SLOTS; i++) {
    const f = frozen[i];
    if (f && Array.isArray(f.parts)) {
      const parts = f.parts.map((id) => resolve(id)).filter(Boolean);
      if (parts.length === f.parts.length) { cards[i] = { ...f, frozen: true }; for (const p of parts) taken.add(p.key); usedIds.add(parts[0].id); }
    }
  }
  for (let i = 0; i < SLOTS; i++) {
    if (cards[i]) continue;
    const centre = target + (i - (SLOTS - 1) / 2) * HALF_WIDTH;
    const made = makeOne({ prior, style, target: centre, tol: HALF_WIDTH * 0.75, taken, r, usedIds });
    const rating = ratingOf(made.parts, prior);
    for (const p of made.parts) taken.add(p.key);
    usedIds.add(made.parts[0].id);
    cards[i] = { id: `${seed}-${i}-${made.parts.map((p) => p.id).join('+')}`, parts: made.parts.map((p) => p.id), rating, points: pointsOf(rating), frozen: false };
  }
  return { theta, target, cards };
}
