#!/usr/bin/env node
// tools/records.mjs — (fork, GitHub #32) read a folder of anonymous match records (server/records.js, SP_RECORDS) and
// print summary tables (markdown, like tools/botbench.mjs --compare).
//
// Usage:
//   node tools/records.mjs [folder…]          tables over every record under the folders (default logs/records)
//   node tools/records.mjs --json [folder…]   the same numbers as JSON
//   node tools/records.mjs --verify [folder…] re-run each recorded normal battle from its BattleSpec and compare the
//                                             result digest with the recorded one. A record of this checkout's `app`
//                                             version must match (a difference fails); one of another version may or may
//                                             not (versions move fast, most carry no gameplay change): its differences
//                                             are reported apart, as maybes, and do not fail
// Records are `*.json.gz` (or `*.json`), any depth below the folders; a file that does not parse is reported and skipped.
//
// Tables: matches per mode and difficulty (wins, reached the final boss, rounds passed); seats, human vs AI (rounds
// passed, LP at the last round); by lobby rule (each rule not at its default); by Risk (the SPA-CC sum, cheats noted); by strategy (band); human prep activity per
// round (buys, sells, refreshes, levels: the investor churn a single board snapshot loses).

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { rulesInForce, ruleLabels } from '../shared/rules.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Every record file under `dirs` (sorted). */
export function recordFiles(dirs) {
  const out = [];
  const walk = (d) => {
    let ents;
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.json(\.gz)?$/.test(e.name)) out.push(p);
    }
  };
  for (const d of dirs) walk(d);
  return out.sort();
}

/** @returns {{ records: any[], bad: { file: string, error: string }[] }} */
export function readRecords(dirs) {
  const records = [], bad = [];
  for (const file of recordFiles(dirs)) {
    try {
      const buf = fs.readFileSync(file);
      const rec = JSON.parse((file.endsWith('.gz') ? zlib.gunzipSync(buf) : buf).toString('utf8'));
      if (!rec || rec.v !== 1 || !Array.isArray(rec.seats)) throw new Error('not a match record');
      records.push(rec);
    } catch (e) { bad.push({ file, error: String(e?.message || e) }); }
  }
  return { records, bad };
}

const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const pct = (n, d) => (d ? Math.round((100 * n) / d) : null);
const reachedBoss = (r) => (r.result?.roundsPassed ?? 0) >= (r.bossRound ?? Infinity) - 1;
const humans = (r) => r.seats.filter((s) => s.human).length;

/** A match that ended before its first battle (everyone left during the briefing or the drafts): not a result. */
export const unplayed = (r) => !(r.battles || []).length;

/** The numbers behind the tables. Matches that never reached a battle are counted apart (`unplayed`) and left out. */
export function summarize(all) {
  const records = all.filter((r) => !unplayed(r));
  const group = (keyOf) => {
    const m = new Map();
    for (const r of records) for (const k of [].concat(keyOf(r))) { if (k == null) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
    return [...m.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))).map(([key, rs]) => ({
      key, matches: rs.length, wins: rs.filter((r) => r.result?.victory).length, winPct: pct(rs.filter((r) => r.result?.victory).length, rs.length),
      reachedBoss: rs.filter(reachedBoss).length, roundsPassed: avg(rs.map((r) => r.result?.roundsPassed ?? 0)), humanSeats: rs.reduce((s, r) => s + humans(r), 0),
    }));
  };
  const byMode = group((r) => `${r.mode}:${r.difficulty}${r.mode === 'coop' ? ` (${r.seats.length} seats, ${humans(r)} human)` : ''}`);
  // the rules not at their default: a switch by its key, a list by its size, anything else key=value
  const byRule = group((r) => rulesInForce(r.lobbyRules).map((k) => {
    const v = r.lobbyRules[k];
    return v === true ? k : Array.isArray(v) ? `${k} (${v.length})` : `${k}=${v}`;
  }));
  // the end-screen labels: the Risk sum of the SPA-CC tags, and whether a cheat was on
  const byRisk = group((r) => { const l = ruleLabels(r.lobbyRules || {}); return `Risk ${l.risk}${l.cheats ? ', with cheats' : ''}`; });
  const lastRow = (r, seat) => [...(r.rounds || [])].reverse().find((row) => row.seats && row.seats[seat]);
  const seats = [];
  for (const r of records) for (const s of r.seats) {
    const row = lastRow(r, s.seat);
    seats.push({ diff: `${r.mode}:${r.difficulty}`, human: s.human, band: s.band, rounds: s.roundsPassed ?? 0, victory: !!r.result?.victory, lp: row ? row.seats[s.seat].lp : null });
  }
  const seatGroup = (keyOf) => {
    const m = new Map();
    for (const s of seats) { const k = keyOf(s); if (k == null) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(s); }
    return [...m.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))).map(([key, ss]) => ({
      key, seats: ss.length, winPct: pct(ss.filter((s) => s.victory).length, ss.length), roundsPassed: avg(ss.map((s) => s.rounds)),
      lastLp: avg(ss.filter((s) => s.lp != null).map((s) => s.lp)),
    }));
  };
  const bySeat = seatGroup((s) => `${s.diff} · ${s.human ? 'human' : 'AI'}`);
  const byBand = seatGroup((s) => s.band);
  // human prep activity: actions per human seat and round (AI 托管 / bot-made actions left out)
  const activity = new Map();
  for (const r of records) {
    const human = new Set(r.seats.filter((s) => s.human).map((s) => s.seat));
    const cells = new Map();
    for (const a of r.actions || []) {
      if (!human.has(a.s) || a.bot || !(a.r >= 1)) continue;
      const k = `${a.r}:${a.s}`;
      if (!cells.has(k)) cells.set(k, { r: a.r, buy: 0, sell: 0, refresh: 0, levelUp: 0 });
      const c = cells.get(k);
      if (a.a in c) c[a.a]++;
    }
    for (const c of cells.values()) { if (!activity.has(c.r)) activity.set(c.r, []); activity.get(c.r).push(c); }
  }
  const byRound = [...activity.entries()].sort(([a], [b]) => a - b).map(([r, cs]) => ({
    round: r, seats: cs.length, buys: avg(cs.map((c) => c.buy)), sells: avg(cs.map((c) => c.sell)), refreshes: avg(cs.map((c) => c.refresh)), levelUps: avg(cs.map((c) => c.levelUp)),
  }));
  return { matches: records.length, unplayed: all.length - records.length, byMode, bySeat, byRule, byRisk, byBand, byRound };
}

const f1 = (x) => (x == null ? '–' : x.toFixed(1));
const p = (x) => (x == null ? '–' : `${x} %`);

/** The markdown tables of summarize(). */
export function tables(s) {
  const out = [`${s.matches} match records${s.unplayed ? ` (${s.unplayed} more left out: ended before the first battle)` : ''}`];
  out.push('', '| mode | matches | wins | reached the final boss | rounds passed | human seats |', '|---|---|---|---|---|---|');
  for (const g of s.byMode) out.push(`| ${g.key} | ${g.matches} | ${g.wins} (${p(g.winPct)}) | ${g.reachedBoss} | ${f1(g.roundsPassed)} | ${g.humanSeats} |`);
  out.push('', '| seats | seats | win | rounds passed | LP at the last round |', '|---|---|---|---|---|');
  for (const g of s.bySeat) out.push(`| ${g.key} | ${g.seats} | ${p(g.winPct)} | ${f1(g.roundsPassed)} | ${f1(g.lastLp)} |`);
  if (s.byRule.length) {
    out.push('', '| lobby rule on | matches | wins | reached the final boss | rounds passed |', '|---|---|---|---|---|');
    for (const g of s.byRule) out.push(`| ${g.key} | ${g.matches} | ${g.wins} (${p(g.winPct)}) | ${g.reachedBoss} | ${f1(g.roundsPassed)} |`);
  }
  out.push('', '| Risk | matches | wins | reached the final boss | rounds passed |', '|---|---|---|---|---|');
  for (const g of s.byRisk) out.push(`| ${g.key} | ${g.matches} | ${g.wins} (${p(g.winPct)}) | ${g.reachedBoss} | ${f1(g.roundsPassed)} |`);
  out.push('', '| strategy | seats | win | rounds passed | LP at the last round |', '|---|---|---|---|---|');
  for (const g of s.byBand) out.push(`| ${g.key} | ${g.seats} | ${p(g.winPct)} | ${f1(g.roundsPassed)} | ${f1(g.lastLp)} |`);
  if (s.byRound.length) {
    out.push('', '| round | human seats | buys | sells | refreshes | level-ups |', '|---|---|---|---|---|---|');
    for (const g of s.byRound) out.push(`| ${g.round} | ${g.seats} | ${f1(g.buys)} | ${f1(g.sells)} | ${f1(g.refreshes)} | ${f1(g.levelUps)} |`);
  }
  return out.join('\n');
}

/**
 * Re-run every recorded normal battle of `records` (not a synthetic result) from its spec and compare the digests.
 * `differ`: battles of version `app` (or every battle, with no `app`) whose digest changed — a real mismatch; `maybe`:
 * those of records of another version (or none) — a gameplay change since may explain them.
 * @returns {Promise<{ same: number, differ: Diff[], maybe: Diff[], skipped: number }>}
 * @typedef {{ app: string | null, round: number, field: string }} Diff
 */
export async function verify(records, { app = null } = {}) {
  const { createBattleFromSpec, resultDigest } = await import('../server/sim/spec.js');
  const { getData } = await import('../server/data.js');
  const { DataSource } = await import('../server/sim/simdata.js');
  const ds = new DataSource(getData({ log: { warn() {}, error() {}, info() {} } }), null);
  let same = 0, skipped = 0;
  const differ = [], maybe = [];
  for (const r of records) for (const b of r.battles || []) {
    if (b.kind !== 'normal' || b.synthetic || !b.digest) { skipped++; continue; }
    const res = createBattleFromSpec(b.spec, ds, { recordEvents: false, quiet: true }).runToEnd(4000);
    if (resultDigest(res).hash === b.digest) { same++; continue; }
    const d = { app: r.app ?? null, round: b.r, field: b.field };
    (!app || r.app === app ? differ : maybe).push(d);
  }
  return { same, differ, maybe, skipped };
}

function main() {
  const args = process.argv.slice(2);
  const dirs = args.filter((a) => !a.startsWith('--'));
  if (!dirs.length) dirs.push(path.join(ROOT, 'logs', 'records'));
  const { records, bad } = readRecords(dirs);
  for (const b of bad) console.error(`skipped ${b.file}: ${b.error}`);
  if (args.includes('--verify')) {
    let app = null;
    try { app = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version; } catch { /* none */ }
    return verify(records, { app }).then((v) => {
      console.log(`battles replayed: ${v.same} same, ${v.differ.length} differ, ${v.maybe.length} differ from another version (maybe a gameplay change since), ${v.skipped} skipped (not normal, or synthetic)`);
      for (const d of v.differ.slice(0, 20)) console.log(`  differs: round ${d.round} ${d.field}`);
      for (const d of v.maybe.slice(0, 20)) console.log(`  maybe: ${d.app ?? 'no version'} round ${d.round} ${d.field}`);
      process.exitCode = v.differ.length ? 1 : 0;
    });
  }
  const s = summarize(records);
  console.log(args.includes('--json') ? JSON.stringify(s, null, 2) : tables(s));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
