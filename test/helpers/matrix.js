// test/helpers/matrix.js — (fork) which combinations a layout-fit browser test checks. The fit tests loop over language ×
// 文字大小 × 界面大小 × window size (or device × page): every combination is several hundred checks a file, about 15% of the
// browser suite's time. A normal run checks a sample; the end-of-cycle run checks every combination.
//
//   import { matrix, groupBy } from '../helpers/matrix.js';
//   const combos = matrix('room-fit phones', { lang: LANGS, ts: SIZES, screen: PHONES },
//     { corners: [{ ts: 'xl', screen: PHONES[0] }] });   // the smallest phone at 特大, in every language
//   for (const { lang, ts, rows } of groupBy(combos, 'lang', 'ts')) { …switch language and text size once…
//     for (const { screen } of rows) { …the same checks as before… } }
//
// - Default: a deterministic pairwise sample. Every value of every dimension appears, and every pair of values of two
//   dimensions (zh with 特大, 特大 with 640×360, zh with 640×360, …) is checked together at least once. `strength: 1` asks
//   only for every value once (for a two-dimension matrix, where pairwise is the whole product). The `corners` are added
//   on top: each is a partial combination and brings in every combination that matches it.
// - SP_FULL_MATRIX=1: every combination, as before the sampling (the end-of-cycle run, CONTRIBUTING.md).
// - SP_MATRIX_SEED=<n> picks another sample (default 1). Each matrix's name is part of its seed, so two loops over the same
//   dimensions check different combinations.
// Each call prints which combinations it runs (`# matrix <name>: …`), so a failure can be replayed: the same seed and the
// same lists give the same sample.

export const FULL_MATRIX = process.env.SP_FULL_MATRIX === '1';
export const MATRIX_SEED = Number.parseInt(process.env.SP_MATRIX_SEED ?? '1', 10) || 1;
/** The language whose labels run widest (§35.18's leftovers are English ones): the risky corner beside the smallest screen. */
export const LONGEST_LANG = 'en';

/** A value as the log and the corner match see it: [640, 360] → "640×360", { label } → label. */
export function label(v) {
  if (Array.isArray(v)) return v.join('×');
  if (v && typeof v === 'object') return String(v.label ?? JSON.stringify(v));
  return String(v);
}

function hash(s) { // FNV-1a
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The combinations of `dims` to check, in product order (the first dimension outermost).
 * @param {string} name shown in the log and part of the seed
 * @param {Record<string, readonly any[]>} dims
 * @param {{ corners?: Record<string, any>[], strength?: 1 | 2, seed?: number, full?: boolean, log?: (line: string) => void }} [opts]
 * @returns {Record<string, any>[]}
 */
export function matrix(name, dims, { corners = [], strength = 2, seed = MATRIX_SEED, full = FULL_MATRIX, log = console.log } = {}) {
  const keys = Object.keys(dims);
  if (!keys.length || keys.some((k) => !dims[k]?.length)) throw new Error(`matrix ${name}: every dimension needs values`);
  for (const k of keys) {
    const seen = new Set(dims[k].map(label));
    if (seen.size !== dims[k].length) throw new Error(`matrix ${name}: ${k} has two values with the same label`);
  }
  const sizes = keys.map((k) => dims[k].length);
  const total = sizes.reduce((a, b) => a * b, 1);
  const at = (n) => { // product index → value indices
    const ix = new Array(keys.length);
    for (let d = keys.length - 1; d >= 0; d--) { ix[d] = n % sizes[d]; n = Math.floor(n / sizes[d]); }
    return ix;
  };
  const combo = (n) => Object.fromEntries(at(n).map((i, d) => [keys[d], dims[keys[d]][i]]));
  const chosen = new Set();
  if (full) for (let n = 0; n < total; n++) chosen.add(n);
  else {
    for (const c of corners) {
      for (const k of Object.keys(c)) {
        if (!keys.includes(k)) throw new Error(`matrix ${name}: corner names an unknown dimension ${k}`);
        if (!dims[k].some((v) => label(v) === label(c[k]))) throw new Error(`matrix ${name}: corner ${k}=${label(c[k])} is not one of its values`);
      }
      for (let n = 0; n < total; n++) {
        const ix = at(n);
        if (Object.keys(c).every((k) => label(dims[k][ix[keys.indexOf(k)]]) === label(c[k]))) chosen.add(n);
      }
    }
    // the sample: greedy cover of every value pair (strength 2) or every value (strength 1); ties go to a seeded order
    const t = keys.length < 2 ? 1 : strength;
    const tuples = (ix) => {
      const out = [];
      if (t === 1) for (let d = 0; d < ix.length; d++) out.push(`${d}=${ix[d]}`);
      else for (let d = 0; d < ix.length; d++) for (let e = d + 1; e < ix.length; e++) out.push(`${d}=${ix[d]},${e}=${ix[e]}`);
      return out;
    };
    const need = new Set();
    for (let n = 0; n < total; n++) for (const tp of tuples(at(n))) need.add(tp);
    const order = [...Array(total).keys()];
    const rand = rng((hash(name) ^ Math.imul(seed, 0x9e3779b1)) >>> 0);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const sample = [];
    while (need.size) {
      let best = -1, gain = 0;
      for (const n of order) {
        const g = tuples(at(n)).filter((tp) => need.has(tp)).length;
        if (g > gain) { gain = g; best = n; }
      }
      sample.push(best);
      for (const tp of tuples(at(best))) need.delete(tp);
    }
    for (const n of sample) chosen.add(n);
  }
  const list = [...chosen].sort((a, b) => a - b).map(combo);
  const how = full ? 'SP_FULL_MATRIX=1' : `${strength === 1 || keys.length < 2 ? 'each value' : 'pairwise'} sample + ${corners.length} corner${corners.length === 1 ? '' : 's'}, seed ${seed}; SP_FULL_MATRIX=1 runs all`;
  log(`# matrix ${name}: ${list.length} of ${total} (${how}): ${list.map((c) => keys.map((k) => label(c[k])).join('/')).join(', ')}`);
  return list;
}

/**
 * Whether the list holds a combination with these values (compared by label), for nested loops that skip the rest:
 * `if (!picked(combos, { lang, ts, screen: [w, h] })) continue;`
 * @param {Record<string, any>[]} combos
 * @param {Record<string, any>} values
 */
export function picked(combos, values) {
  const ks = Object.keys(values);
  return combos.some((c) => ks.every((k) => label(c[k]) === label(values[k])));
}

/**
 * Consecutive combinations sharing `keys`, for loops that set a language or a text size once and then walk the windows:
 * [{ ...those keys' values, rows: [combo, …] }, …] in the list's order.
 * @param {Record<string, any>[]} combos
 * @param {...string} keys
 */
export function groupBy(combos, ...keys) {
  const out = [];
  for (const c of combos) {
    const last = out[out.length - 1];
    if (last && keys.every((k) => last[k] === c[k])) last.rows.push(c);
    else out.push({ ...Object.fromEntries(keys.map((k) => [k, c[k]])), rows: [c] });
  }
  return out;
}
