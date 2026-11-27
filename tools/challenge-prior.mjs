#!/usr/bin/env node
// Derives the challenge ratings PRIOR (public/js/challenges/prior.json) from match records, and checks how well it predicts
// matches it was not fitted on. Reproducible by anyone who has records of their own: the file the game ships is the output
// of this script on Fish's 2026-11-18 human records. (fish-edition/untracked/challenge-system-draft.md §5)
//
//   node tools/challenge-prior.mjs --records DIR[,DIR…] [--out public/js/challenges/prior.json] [--report FILE] [--holdout 0.3] [--seed 1]
//
// A rating `d` is in logit units: a challenge's rating is the SUM of its parts' ratings, and the predicted chance that a
// typical player meets it in one match is sigmoid(-sum). The outcome "win" has d = -logit(P(win)); a condition adds
//   - setting  (difficulty, players, rules: the player chooses it):  logit(P(win)) - logit(P(win | condition))
//   - performance (stacks, funds, kills: the match must produce it): logit(P(win)) - logit(P(win and condition))
// each smoothed toward the overall win rate, capped to [-3, 6]. The additive form is an assumption; the hold-out check below
// is the test of it.

import fs from 'node:fs';
import { readRecords, factsFromServerRecord } from './challenge-prior-lib.mjs';
import { ALL, OUTCOMES, CONDITIONS, compatible } from '../public/js/challenges/catalog.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const dirs = String(arg('records', '')).split(',').filter(Boolean);
if (!dirs.length) { console.error('usage: node tools/challenge-prior.mjs --records DIR[,DIR…] [--out FILE] [--report FILE] [--holdout 0.3] [--seed 1]'); process.exit(2); }
const OUT = arg('out', 'public/js/challenges/prior.json');
const HOLD = Number(arg('holdout', 0.3));
let seed = Number(arg('seed', 1)) >>> 0;
const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const logit = (p) => Math.log(p / (1 - p));
const sigm = (x) => 1 / (1 + Math.exp(-x));
const clip = (x, a = -3, b = 6) => Math.min(b, Math.max(a, x));

// ---- the matches ----------------------------------------------------------------------------------------------------
const rows = [];
let files = 0, skipped = 0;
for (const dir of dirs) for (const { rec } of readRecords(dir)) {
  files++;
  // not a finished match: gave up / errored (a quit record is no match for the challenge system either)
  if (rec?.result?.reason === 'abandoned' || rec?.result?.reason === 'error') { skipped++; continue; }
  for (const f of factsFromServerRecord(rec)) rows.push(f);
}
// a stable pseudo-random split (the same rows land in the same half on every run)
const split = rows.map(() => rnd() < HOLD);
const train = rows.filter((_, i) => !split[i]), test = rows.filter((_, i) => split[i]);

function fit(data) {
  const N = data.length, W = data.filter((r) => r.win).length;
  const pw = (W + 0.5) / (N + 1);
  const M = 8; // pseudo-matches of the overall win rate for a setting
  const out = {};
  for (const c of ALL) {
    if (!c.needsPrior) continue;
    let n = 0, k = 0, kw = 0;
    for (const r of data) { const t = c.test(r); if (t == null) continue; n++; if (t) { k++; if (r.win) kw++; } }
    if (n < 5) { out[c.id] = { d: null, n, k }; continue; }
    let d;
    if (c.group === 'outcome') d = -logit(clip((k + 0.5) / (n + 1), 1e-3, 1 - 1e-3)); // the outcome's own rate
    else if (c.kind === 'setting') d = logit(pw) - logit((kw + M * pw) / (k + M));
    else d = logit(pw) - logit(Math.min(pw * 0.999, (kw + 0.5) / (n + 1)));
    out[c.id] = { d: Math.round(clip(d) * 100) / 100, n, k: c.kind === 'setting' && c.group !== 'outcome' ? k : kw };
  }
  return { pw, N, W, out };
}

// ---- hold-out check: random challenges = an outcome + 0..2 compatible conditions, predicted vs what happened -------------------
function holdout(model, data, n = 4000) {
  const usable = ALL.filter((c) => c.needsPrior && model.out[c.id]?.d != null);
  const outs = OUTCOMES.filter((c) => usable.includes(c)), conds = CONDITIONS.filter((c) => usable.includes(c));
  const pairs = [];
  for (let i = 0; i < n; i++) {
    const parts = [outs[Math.floor(rnd() * outs.length)]];
    const want = Math.floor(rnd() * 3);
    for (let t = 0; t < 12 && parts.length - 1 < want; t++) { const c = conds[Math.floor(rnd() * conds.length)]; if (compatible(parts, c)) parts.push(c); }
    const d = parts.reduce((s, p, j) => s + (j === 0 && p.id === 'win' ? model.out[p.id].d : model.out[p.id].d), 0);
    // settings are the player's own choice: score the challenge only over matches that satisfied them
    const settings = parts.filter((p) => p.kind === 'setting' && p.group !== 'outcome');
    const rest = parts.filter((p) => !settings.includes(p));
    let hit = 0, known = 0;
    for (const r of data) {
      if (settings.some((p) => p.test(r) !== true)) continue;
      let ok = true, unk = false;
      for (const p of rest) { const v = p.id === 'win' ? r.win : p.test(r); if (v == null) { unk = true; break; } if (!v) ok = false; if (p.kind === 'performance' && p.group !== 'outcome' && !r.win) ok = false; }
      if (unk) continue; known++; if (ok) hit++;
    }
    if (known >= 30) pairs.push({ parts: parts.map((p) => p.id), p: sigm(-d), rate: hit / known, known });
  }
  return pairs;
}
const model = fit(train);
const pairs = holdout(model, test);
const bins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, r: 0 }));
let brier = 0, brierBase = 0;
const baseRate = pairs.length ? pairs.reduce((s, x) => s + x.rate, 0) / pairs.length : 0;
for (const x of pairs) { const b = bins[Math.min(9, Math.floor(x.p * 10))]; b.n++; b.p += x.p; b.r += x.rate; brier += (x.p - x.rate) ** 2; brierBase += (baseRate - x.rate) ** 2; }

// ---- the shipped table: fitted on ALL rows ------------------------------------------------------------------------------
const all = fit(rows);
const prior = { v: 1, source: { matches: rows.length, wins: all.W, files, skipped, builtBy: 'tools/challenge-prior.mjs' }, base: Math.round(logit(all.pw) * 100) / 100, ratings: {} };
for (const [id, v] of Object.entries(all.out)) if (v.d != null) prior.ratings[id] = v.d;
fs.mkdirSync(OUT.replace(/[^/]*$/, '') || '.', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(prior, null, 1) + '\n');

let rep = `# Challenge ratings prior: calibration report\n\nmatches (human seats): ${rows.length} from ${files} files (${skipped} abandoned or errored skipped); wins ${all.W} (${(100 * all.W / rows.length).toFixed(1)}%)\nfitted on ${train.length}, held out ${test.length} (seed ${arg('seed', 1)}, hold-out ${HOLD})\n\n`;
rep += `Hold-out: ${pairs.length} random challenges (an outcome + 0 to 2 conditions), predicted chance vs the share of held-out matches that met them.\n\n| predicted | challenges | mean predicted | mean actual |\n|---|---|---|---|\n`;
bins.forEach((b, i) => { if (b.n) rep += `| ${i * 10}-${i * 10 + 10}% | ${b.n} | ${(100 * b.p / b.n).toFixed(1)}% | ${(100 * b.r / b.n).toFixed(1)}% |\n`; });
rep += `\nBrier score ${(brier / Math.max(1, pairs.length)).toFixed(4)} (always predicting the mean rate: ${(brierBase / Math.max(1, pairs.length)).toFixed(4)}; lower is better).\n`;
const worst = [...pairs].sort((a, b) => Math.abs(b.p - b.rate) - Math.abs(a.p - a.rate)).slice(0, 8);
rep += `\nWorst misses:\n\n${worst.map((x) => `- ${x.parts.join(' + ')}: predicted ${(100 * x.p).toFixed(1)}%, actual ${(100 * x.rate).toFixed(1)}% (${x.known} matches)`).join('\n')}\n`;
const unseen = Object.entries(all.out).filter(([, v]) => v.d == null).map(([id]) => id);
rep += `\nNo rating (fewer than 5 matches could be checked): ${unseen.length} of ${ALL.filter((c) => c.needsPrior).length} instances${unseen.length ? ': ' + unseen.slice(0, 40).join(', ') + (unseen.length > 40 ? ', …' : '') : ''}\n`;
rep += `\nHighest ratings: ${Object.entries(prior.ratings).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k} ${v}`).join(', ')}\n`;
const rf = arg('report', null);
if (rf) fs.writeFileSync(rf, rep); else console.log(rep);
console.error(`wrote ${OUT}: ${Object.keys(prior.ratings).length} ratings`);
