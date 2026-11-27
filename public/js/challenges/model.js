// The local model behind Challenges (fish-edition/untracked/challenge-system-draft.md §5.3): two small parts, both fitted in the
// browser from the player's own finished matches (facts.js), nothing sent anywhere, nothing kept beyond what the records already hold.
//
//   ability(history, prior)   θ, the player's level in the SAME logit units as the ratings. A one-parameter logistic (Rasch) model,
//                             P(an instance is met in a match) = sigmoid(θ − rating), fitted by Newton's method with a Normal(0, 1)
//                             prior on θ, so a few matches cannot move it far and no history leaves it at 0 (the public prior as is).
//                             Only the outcomes and the performance conditions are labels; a setting (difficulty, players, rules) is
//                             the player's choice, not a result, so it says nothing about skill.
//   playstyle(history)        smoothed counts of what the player has used (Alliances active, Risk tags, difficulty, players), and
//                             `novelty(instance)`, a weight above 1 for things they rarely do (the surprisal, damped).
//
// The ratings are a PRIOR derived from human matches (tools/challenge-prior.mjs); this model only shifts them by θ. Whether the sum of
// ratings predicts a conjunction well is checked offline (docs: the calibration report); the novelty weighting is a design choice, not a result.

import { ALL, STACK_BONDS } from './catalog.js';
import { RULES } from '../../../shared/rules.js';

const sigmoid = (x) => 1 / (1 + Math.exp(-x));
/** Fits θ by MAP over the history; `history` = a list of facts (facts.js), newest last. */
export function ability(history, prior, { sd = 1, iters = 25 } = {}) {
  const items = ALL.filter((c) => c.needsPrior && c.kind !== 'setting' && prior.ratings[c.id] != null);
  const obs = []; // [rating, y]
  for (const f of history) {
    for (const c of items) {
      const t = c.test(f);
      if (t == null) continue;
      // a performance condition is only "met" in a match that was won (its rating is relative to winning, tools/challenge-prior.mjs)
      const y = c.group === 'outcome' ? t : t && f.win;
      obs.push([prior.ratings[c.id], y ? 1 : 0]);
    }
  }
  if (!obs.length) return { theta: 0, n: 0, se: sd };
  let th = 0;
  for (let i = 0; i < iters; i++) {
    let g = -th / (sd * sd), h = 1 / (sd * sd);
    for (const [d, y] of obs) { const p = sigmoid(th - d); g += y - p; h += p * (1 - p); }
    const step = g / h; th += step;
    if (Math.abs(step) < 1e-6) break;
  }
  th = Math.max(-4, Math.min(4, th));
  let info = 1 / (sd * sd);
  for (const [d] of obs) { const p = sigmoid(th - d); info += p * (1 - p); }
  return { theta: th, n: history.length, se: 1 / Math.sqrt(info) };
}

const TAGS = RULES.filter((r) => r.category === 'risk').map((r) => r.key);
/** The facets of one match a challenge instance can be tied to. */
function facetsOf(f) {
  const out = [];
  for (const b of f.active ?? []) out.push(`bond:${b}`);
  for (const k of Object.keys(f.tags ?? {})) out.push(`tag:${k}`);
  return out;
}

/** The playstyle of the player: how often each Alliance / Risk tag showed up, smoothed (add-one over the options of its kind). */
export function playstyle(history, { exponent = 0.5, cap = 4 } = {}) {
  const n = history.length;
  const count = new Map();
  for (const f of history) for (const k of new Set(facetsOf(f))) count.set(k, (count.get(k) ?? 0) + 1);
  const kinds = { bond: STACK_BONDS.length, tag: TAGS.length };
  /** Share of matches that used it, smoothed: (count + 1) / (n + options). */
  const share = (key) => ((count.get(key) ?? 0) + 1) / (n + 1 + (kinds[key.split(':')[0]] ?? 2));
  const base = (key) => 1 / (1 + (kinds[key.split(':')[0]] ?? 2));
  /** A weight >= 1: how much more often to draw an instance tied to a rarely used Alliance / tag (1 for anything else). */
  function novelty(instance) {
    const key = instance.bond ? `bond:${instance.bond}` : instance.key?.startsWith('tag:') ? instance.key : null;
    if (!key || !n) return 1;
    return Math.min(cap, Math.max(1, (base(key) / share(key)) ** exponent));
  }
  return { n, share, novelty, count };
}
