#!/usr/bin/env node
// tools/capture-specs.mjs — capture real BattleSpecs for the battle perf page (public/dev/battle-perf.html) and
// tools/perfbench.mjs: the b.start a browser receives under client-side combat (DESIGN §14), taken from a headless bot
// match (virtual time, real simulation, like tools/matchrun.mjs). Co-op with 4 seats: the first two are humans on AI
// autoplay (so the match sends b.start to seat 1, whose battles are kept) and two bots; every player starts with a high
// LP so the match reaches the Final Assault and the Hidden Core. By default the last normal round, the last 联防 field
// of seat 1, the Final Assault and the Hidden Core are written:
//
//   <out>/<difficulty>-<kind>-r<round>.json   the b.start message (elapsed / clocks zeroed, authoritative)
//   <out>/index.json                          [{ name, title, kind, round, stageId, players, units }]
//
// The match is deterministic for a seed, so a plain run reproduces the committed specs byte for byte as long as the
// game data and the bots do not change.
//
// Usage: node tools/capture-specs.mjs [--difficulty HARD] [--seed 7] [--out public/dev/perf] [--all] [--kind normal]
//   --all   write every battle seat 1 played, not only the four defaults
//   --kind  write every battle of that kind only
//   --stages  one match per stage of the difficulty, every battle of --kind (default normal) under <out>/<stageId>/
//             (the sandbox's waves: node tools/capture-specs.mjs --stages --out public/dev/sandbox)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Match } from '../server/match/Match.js';
import { VirtualScheduler } from '../server/match/scheduler.js';
import { getData } from '../server/data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KIND_TITLE = { normal: '普通战', unite: '联防', boss: '最终攻势', hidden: '隐秘核心' };

/** One spec's file name and index row. */
export function specMeta(difficulty, msg, round) {
  const spec = msg.spec || {};
  const players = Array.isArray(spec.players) ? spec.players : [];
  return {
    name: `${difficulty.toLowerCase()}-${msg.kind}-r${round}`,
    title: `${KIND_TITLE[msg.kind] || msg.kind} · 第 ${round} 回合`,
    kind: msg.kind, round, stageId: spec.stageId,
    players: players.length,
    units: players.reduce((n, p) => n + (Array.isArray(p?.units) ? p.units.length : 0), 0),
  };
}

/** The defaults: the last normal round, the last 联防, the Final Assault and the Hidden Core (latest send of each). */
export function pickDefaults(captured) {
  const last = new Map();
  for (const c of captured) last.set(`${c.msg.kind}-r${c.round}`, c);
  const all = [...last.values()];
  const latest = (kind) => all.filter((c) => c.msg.kind === kind).sort((a, b) => b.round - a.round)[0];
  return ['normal', 'unite', 'boss', 'hidden'].map(latest).filter(Boolean);
}

/** A b.start as the perf page starts it: from the beginning, authoritative, no clocks of the capturing run. */
export function cleanStart(msg) {
  return { ...msg, elapsed: 0, startAt: 0, serverNow: 0, authoritative: true, watch: false, done: false };
}

/** Run one bot match and return seat 1's b.start messages in order: [{ round, msg }]. */
export function captureMatch({ difficulty = 'HARD', seed = 7, data = getData({ log: { warn() {}, error() {}, info() {} } }) } = {}) {
  const sched = new VirtualScheduler();
  const seats = [0, 1, 2, 3].map((i) => ({ seat: i, playerId: i < 2 ? `p_${i}` : `ai_${i}`, name: i < 2 ? `P${i + 1}` : `AI-${i + 1}`, isBot: i >= 2, connected: true }));
  const captured = [];
  let summary = null;
  const m = new Match({
    roomCode: 'PERF', mode: 'coop', difficulty, seats, seed, data, scheduler: sched, clientCombat: true,
    log: { info() {}, debug() {}, warn() {}, error() {} },
    send: (pid, msg) => {
      if (pid === 'p_0' && msg && msg.t === 'b.start' && !msg.watch) captured.push({ round: m.round, msg: JSON.parse(JSON.stringify(msg)) });
      return true;
    },
    broadcast: () => {}, onEnd: (s) => { summary = s; },
  });
  for (const ps of m.players.values()) if (!ps.isBot) ps.autoplay = true;
  let lpSet = false;
  m.start();
  sched.runUntil(() => {
    if (!lpSet && m.phase === 'PREP' && m.round === 1) { for (const ps of m.players.values()) ps.lp = 400; lpSet = true; }
    return summary != null;
  }, { maxSteps: 5e6 });
  m.dispose();
  return { captured, summary };
}

/** The stages a match of `difficulty` may draw (active, weighted), in data order. */
export function matchStages({ difficulty = 'HARD', data = getData({ log: { warn() {}, error() {}, info() {} } }) } = {}) {
  const probe = new Match({ roomCode: 'PERF', mode: 'coop', difficulty, seats: [{ seat: 0, playerId: 'p_0', name: 'P1', isBot: false, connected: true }],
    seed: 1, data, scheduler: new VirtualScheduler(), log: { info() {}, debug() {}, warn() {}, error() {} }, send: () => true, broadcast: () => {}, onEnd: () => {} });
  const ids = (probe.gd.mode.stages || []).filter((id) => { const s = probe.gd.stage(id); return s && s.active !== false && Number(s.weight) > 0; });
  probe.dispose();
  return ids;
}

/** The first seed from `seed` on whose match is fought on `stageId` (the stage is drawn when the Match is built), or null. */
export function seedForStage(stageId, { difficulty = 'HARD', seed = 7, tries = 500, data = getData({ log: { warn() {}, error() {}, info() {} } }) } = {}) {
  const seats = [0, 1, 2, 3].map((i) => ({ seat: i, playerId: i < 2 ? `p_${i}` : `ai_${i}`, name: `P${i + 1}`, isBot: i >= 2, connected: true }));
  for (let s = seed; s < seed + tries; s++) {
    const m = new Match({ roomCode: 'PERF', mode: 'coop', difficulty, seats, seed: s, data, scheduler: new VirtualScheduler(), clientCombat: true,
      log: { info() {}, debug() {}, warn() {}, error() {} }, send: () => true, broadcast: () => {}, onEnd: () => {} });
    const hit = m.stageId === stageId;
    m.dispose();
    if (hit) return s;
  }
  return null;
}

/**
 * --stages: one bot match per stage the difficulty draws (the first seed from `seed` on that lands on it), every battle
 * of `kind` written to <out>/<stageId>/<name>.json; <out>/index.json lists them all (rows carry `stageId` and `dir`).
 */
function captureStages({ difficulty, seed, out, kind }) {
  const data = getData({ log: { warn() {}, error() {}, info() {} } });
  const index = [];
  for (const stageId of matchStages({ difficulty, data })) {
    const s = seedForStage(stageId, { difficulty, seed, data });
    if (s == null) { console.warn(`${stageId}: no seed lands on it, skipped`); continue; }
    const { captured, summary } = captureMatch({ difficulty, seed: s, data });
    if (!summary) { console.warn(`${stageId}: the match (seed ${s}) did not end, skipped`); continue; }
    const keep = [...new Map(captured.map((c) => [`${c.msg.kind}-r${c.round}`, c])).values()].filter((c) => c.msg.kind === kind);
    fs.mkdirSync(path.join(out, stageId), { recursive: true });
    for (const c of keep) {
      const meta = specMeta(difficulty, c.msg, c.round);
      fs.writeFileSync(path.join(out, stageId, `${meta.name}.json`), JSON.stringify(cleanStart(c.msg)));
      index.push({ ...meta, dir: stageId, seed: s });
    }
    console.log(`${stageId.padEnd(18)} seed ${s}: ${keep.length} ${kind} battles (match: ${summary.reason}, rounds ${summary.roundsPassed})`);
  }
  fs.writeFileSync(path.join(out, 'index.json'), `${JSON.stringify(index, null, 1)}\n`);
  console.log(`${index.length} specs → ${path.relative(ROOT, out)}`);
  return 0;
}

function main() {
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
  const difficulty = String(opt('difficulty', 'HARD')).toUpperCase();
  const seed = Number(opt('seed', 7));
  const out = path.resolve(ROOT, opt('out', 'public/dev/perf'));
  if (argv.includes('--stages')) return captureStages({ difficulty, seed, out, kind: opt('kind', 'normal') });
  const { captured, summary } = captureMatch({ difficulty, seed });
  if (!summary) { console.error('the match did not end'); return 1; }
  const kind = opt('kind', null);
  let keep = argv.includes('--all') || kind ? [...new Map(captured.map((c) => [`${c.msg.kind}-r${c.round}`, c])).values()] : pickDefaults(captured);
  if (kind) keep = keep.filter((c) => c.msg.kind === kind);
  fs.mkdirSync(out, { recursive: true });
  const index = [];
  for (const c of keep) {
    const meta = specMeta(difficulty, c.msg, c.round);
    fs.writeFileSync(path.join(out, `${meta.name}.json`), JSON.stringify(cleanStart(c.msg)));
    index.push(meta);
    console.log(`${meta.name.padEnd(18)} ${meta.title}  stage ${meta.stageId}  players ${meta.players}  units ${meta.units}`);
  }
  fs.writeFileSync(path.join(out, 'index.json'), `${JSON.stringify(index, null, 1)}\n`);
  console.log(`${index.length} specs → ${path.relative(ROOT, out)} (match: ${summary.reason}, rounds ${summary.roundsPassed})`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
