#!/usr/bin/env node
// (Fish Edition) Paired bot-strength runs anyone can contribute to, with results small enough to paste into a GitHub
// comment (fish-edition/COLLABORATION.md "Compute jobs").
//
//   node tools/bench-share.mjs run --a legacy --b evobot [--config solo:ABYSS] [--seeds 200] [--seed S] [--jobs N]
//       Plays both bots on the same seeds (tools/botbench.mjs) and prints one block to paste as a reply. --a / --b take
//       a bot id or a profile JSON file. --seed defaults to a random start (ai-players/README.md "Seeds").
//   node tools/bench-share.mjs merge FILE…   (or stdin)
//       Reads every block in the files (a saved issue thread is fine), drops repeated seeds, and prints the totals and
//       one sign test. Blocks of another config or bot pair are listed apart.
//
// The block holds one bit per seed (won / lost) as hex, so 1,000 seeds are ~500 characters.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TAG = 'bench-share v1';

/** Bits (0/1 array) → hex, 4 seeds per digit, the first seed in the highest bit. */
export const toHex = (bits) => {
  let out = '';
  for (let i = 0; i < bits.length; i += 4) {
    let v = 0;
    for (let j = 0; j < 4; j++) v = (v << 1) | (bits[i + j] ? 1 : 0);
    out += v.toString(16);
  }
  return out;
};
/** Hex → `n` bits. */
export const fromHex = (hex, n) => {
  const bits = [];
  for (const c of hex) { const v = parseInt(c, 16); for (let j = 3; j >= 0; j--) bits.push((v >> j) & 1); }
  return bits.slice(0, n);
};

/** The block a run prints. */
export function formatBlock({ commit, config, a, b, seed, aBits, bBits }) {
  const n = aBits.length;
  const w = (x) => x.reduce((s, v) => s + v, 0);
  const up = aBits.filter((v, i) => !v && bBits[i]).length, dn = aBits.filter((v, i) => v && !bBits[i]).length;
  return [
    '```',
    `${TAG} commit=${commit} config=${config} a=${a} b=${b} seed=${seed} n=${n}`,
    `a ${toHex(aBits)}`,
    `b ${toHex(bBits)}`,
    `# a won ${w(aBits)}, b won ${w(bBits)}; b gained ${up} seeds, lost ${dn}`,
    '```',
  ].join('\n');
}

/** Every block in `text`: { commit, config, a, b, seed, n, aBits, bBits }. */
export function parseBlocks(text) {
  const out = [];
  const re = new RegExp(`^${TAG} (.+)\\r?\\n\\s*a ([0-9a-f]+)\\s*\\r?\\n\\s*b ([0-9a-f]+)`, 'gm');
  for (const m of String(text).matchAll(re)) {
    const kv = Object.fromEntries(m[1].trim().split(/\s+/).map((p) => p.split('=')));
    const n = Number(kv.n), seed = Number(kv.seed);
    if (!Number.isInteger(n) || n <= 0 || !Number.isInteger(seed)) continue;
    out.push({ commit: kv.commit, config: kv.config, a: kv.a, b: kv.b, seed, n, aBits: fromHex(m[2], n), bBits: fromHex(m[3], n) });
  }
  return out;
}

/** Two-sided exact sign test on `up` vs `dn` (ties dropped). */
export function signTest(up, dn) {
  const n = up + dn; if (!n) return 1;
  const k = Math.min(up, dn);
  // log-space binomial tail
  let lc = 0, tail = 0; const ln2n = n * Math.LN2;
  for (let i = 0; i <= k; i++) { if (i > 0) lc += Math.log(n - i + 1) - Math.log(i); tail += Math.exp(lc - ln2n); }
  return Math.min(1, 2 * tail);
}

/** Totals per (config, a, b): seeds counted once (the first block that has a seed wins). */
export function merge(blocks) {
  const groups = new Map();
  for (const bl of blocks) {
    const key = `${bl.config} a=${bl.a} b=${bl.b}`;
    const g = groups.get(key) ?? { key, seen: new Map(), commits: new Set(), dupes: 0 };
    g.commits.add(bl.commit);
    for (let i = 0; i < bl.n; i++) {
      const s = bl.seed + i;
      if (g.seen.has(s)) { g.dupes++; continue; }
      g.seen.set(s, [bl.aBits[i], bl.bBits[i]]);
    }
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => {
    const r = [...g.seen.values()];
    const aw = r.filter(([x]) => x).length, bw = r.filter(([, y]) => y).length;
    const up = r.filter(([x, y]) => !x && y).length, dn = r.filter(([x, y]) => x && !y).length;
    return { key: g.key, seeds: r.length, dupes: g.dupes, commits: [...g.commits], aWins: aw, bWins: bw, up, dn, p: signTest(up, dn) };
  });
}

const sd = (w, n) => 100 * Math.sqrt((w / n) * (1 - w / n) / n);

function run(opt) {
  const config = opt.config ?? 'solo:ABYSS';
  const n = Number(opt.seeds ?? 200);
  const seed = opt.seed != null ? Number(opt.seed) : 1e5 + Math.floor(Math.random() * 9e8);
  const jobs = Number(opt.jobs ?? Math.max(1, os.cpus().length - 1));
  if (!opt.a || !opt.b) throw new Error('give --a and --b (a bot id or a profile JSON file)');
  let commit = 'unknown';
  try { commit = execFileSync('git', ['-C', ROOT, 'rev-parse', '--short=9', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* not a checkout */ }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-share-'));
  const bits = {};
  for (const side of ['a', 'b']) {
    const who = opt[side];
    const sel = fs.existsSync(who) ? ['--profile', path.resolve(who)] : ['--bot', who];
    const out = path.join(tmp, `${side}.json`);
    console.error(`${side} = ${who}: ${n} seeds from ${seed}, ${jobs} threads…`);
    const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/botbench.mjs'), '--configs', config, '--seeds', String(n), '--seed', String(seed),
      '--jobs', String(jobs), ...sel, '--json', out, '--quiet'], { stdio: ['ignore', 'ignore', 'inherit'], cwd: ROOT });
    if (r.status !== 0) throw new Error(`botbench failed for ${who} (exit ${r.status})`);
    const rows = JSON.parse(fs.readFileSync(out, 'utf8'));
    const won = new Map();
    for (const row of rows) if (row.errors === 0 || row.errors == null) won.set(row.seed, won.get(row.seed) || !!row.victory);
    if (rows.some((row) => row.errors > 0)) console.error(`warning: ${who} had matches with errors`);
    bits[side] = Array.from({ length: n }, (_, i) => (won.get(seed + i) ? 1 : 0));
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(formatBlock({ commit, config, a: path.basename(opt.a).replace(/\.json$/, ''), b: path.basename(opt.b).replace(/\.json$/, ''), seed, aBits: bits.a, bBits: bits.b }));
}

function mergeCmd(files) {
  const text = files.length ? files.map((f) => fs.readFileSync(f, 'utf8')).join('\n') : fs.readFileSync(0, 'utf8');
  const res = merge(parseBlocks(text));
  if (!res.length) { console.log('no bench-share blocks found'); return; }
  for (const g of res) {
    console.log(`${g.key}: ${g.seeds} seeds${g.dupes ? ` (${g.dupes} repeated seeds dropped)` : ''}, commits ${g.commits.join(', ')}`);
    console.log(`  a won ${g.aWins} (${(100 * g.aWins / g.seeds).toFixed(1)} % ± ${sd(g.aWins, g.seeds).toFixed(1)}), b won ${g.bWins} (${(100 * g.bWins / g.seeds).toFixed(1)} % ± ${sd(g.bWins, g.seeds).toFixed(1)})`);
    console.log(`  b gained ${g.up} seeds, lost ${g.dn}: sign test p = ${g.p.toPrecision(3)} (two-sided)`);
  }
}

function main(argv) {
  const [cmd, ...rest] = argv;
  const opt = {}; const files = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) opt[rest[i].slice(2)] = rest[++i];
    else files.push(rest[i]);
  }
  if (cmd === 'run') return run(opt);
  if (cmd === 'merge') return mergeCmd(files);
  console.error('usage: node tools/bench-share.mjs run --a BOT --b BOT [--config solo:ABYSS] [--seeds 200] [--seed S] [--jobs N]\n       node tools/bench-share.mjs merge [FILE…]');
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
