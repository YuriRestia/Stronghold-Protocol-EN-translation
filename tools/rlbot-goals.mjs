#!/usr/bin/env node
// tools/rlbot-goals.mjs — rlbot #197 I5: a goal tracker reading #197's numbers from a run (a folder of records, made
// by `botbench --records`, GitHub #207). Prints the current best against each measurable goal line of #197.
//
// Not every goal is measured yet (see UNMEASURED below) -- those are printed with the reason, never silently
// skipped. Definitions (does Funds include level-ups? peak or final Stacks? which action counts as a Transmitter
// use?) are being confirmed against orca's `fish-edition/untracked/rlbot-2026-11/` scripts (#197 comment,
// 2026-11-27); numbers here may not match the baseline column exactly until that's settled.
//
//   node tools/rlbot-goals.mjs DIR_OR_FILE...   # one or more folders of .json.gz records, or files directly

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRecord } from './replay-record.mjs';
import { ruleLabels } from '../shared/rules.js';

// English name -> bondId (server/data.js `bonds`, cross-checked against data/i18n/en.json `names`).
const ALLIANCES = {
  Yan: 'yanShip', Laterano: 'lateranoShip', Victoria: 'victoriaShip', Kazimierz: 'kazimierzShip',
  Sargon: 'sargonShip', Aegir: 'egirShip', Siracusa: 'siracusaShip', Kjerag: 'kjeragShip',
  Investor: 'investShip', Foresight: 'visiShip', Marvel: 'miraShip', Durable: 'steadShip',
  Swift: 'swiftShip', Precision: 'preciShip', Raid: 'raidShip', Resilient: 'indomShip', Arcane: 'arcaneShip',
};
// 信标 (Transmitter): chess_item_5_04_e_a (normal) / _b (golden) -- server/match/builtinMeta.js's
// use_equip_recruit_new_char_and_give_char_to_player_most_bond, cross-checked by effectId against data/items.json.
const TRANSMITTER_IDS = new Set(['chess_item_5_04_e_a', 'chess_item_5_04_e_b']);

export function collectFiles(args) {
  const out = [];
  for (const a of args) {
    const st = fs.statSync(a);
    if (st.isDirectory()) {
      for (const f of fs.readdirSync(a)) if (f.endsWith('.json.gz')) out.push(path.join(a, f));
    } else out.push(a);
  }
  return out;
}

/** One row per player-seat in one record: the facts every goal below reads. */
export function* factsOf(rec) {
  const ultimate = rec.difficulty === 'ABYSS';
  const { cheats, seeded, risk } = ruleLabels(rec.lobbyRules, rec.awarded);
  const last = rec.rounds[rec.rounds.length - 1];
  const players = rec.seats.length;
  const victory = !!rec.result?.victory;
  const transmitterUses = rec.actions.filter((a) => a.a === 'equip' && TRANSMITTER_IDS.has(a.item)).length;
  const fundsByRound = new Map();
  for (const a of rec.actions) {
    if (a.a !== 'buy') continue;
    fundsByRound.set(`${a.s}:${a.r}`, (fundsByRound.get(`${a.s}:${a.r}`) || 0) + (Number(a.price) || 0));
  }
  for (const seat of rec.seats) {
    const sid = seat.seat;
    const bonds = last?.seats?.[sid]?.bonds || [];
    const bondOf = (id) => bonds.find((b) => b.id === id) || { tier: 0, layers: 0, count: 0 };
    let fundsRoundMax = 0;
    for (const [k, v] of fundsByRound) if (k.startsWith(`${sid}:`) && v > fundsRoundMax) fundsRoundMax = v;
    yield {
      ultimate, players, victory, cheats, seeded, risk,
      human: !!seat.human, roundsPassed: seat.roundsPassed, lpLost: seat.stats.lpLost, alive: !seat.left,
      bondOf, transmitterUses, fundsGame: seat.stats.gold, fundsRoundMax,
      faUnitStats: seat.stats.faUnitStats || [],
    };
  }
}

// ---- goal definitions -----------------------------------------------------------------------------------------
// requireWin: only facts from a victory count. pool: 'solo' | 'coop4' | 'any' (co-op any size) filters `players`.
const WINRATE_GOALS = [
  { label: 'Solo Ultimate score', target: 52, pool: 'solo' },
  { label: '4-clone Ultimate score', target: 88, pool: 'coop4' },
];

const HIGHSCORE_GOALS = [
  { label: 'Isomorph: 3 Alliance memberships added', requireWin: true, target: 3, unmeasured: 'needs to isolate which memberships came from the Isomorph item specifically, not natural board Alliances' },
  { label: 'Yan with 9 members', requireWin: true, measure: (f) => f.bondOf(ALLIANCES.Yan).count, target: 9 },
  { label: 'Highest damage by a custom operator', requireWin: true, unmeasured: 'bots cannot field custom operators yet (rlbot I1, unclaimed) -- faUnitStats (#219) is ready once they can' },
  { label: '999 Stacks of a single Alliance', requireWin: false, measure: (f) => Math.max(0, ...Object.values(ALLIANCES).map((id) => f.bondOf(id).layers)), target: 999 },
  { label: 'Win Ultimate+18 (any tags)', requireWin: true, measure: (f) => f.risk, target: 18, gate: (f) => !f.cheats },
  { label: 'Win the H15 tag set', requireWin: true, target: '3 of 3', unmeasured: 'needs the record\'s lobbyRules matched against the H15 string (grinder-definition.md) -- not yet wired' },
  { label: 'Spend 60 Funds in a single round', requireWin: false, measure: (f) => f.fundsRoundMax, target: 60, note: 'buy prices only -- refreshes and level-ups not priced in yet, pending orca\'s definition (#197 comment)' },
  { label: 'Spend 400 Funds in a single game', requireWin: false, measure: (f) => f.fundsGame, target: 400, note: 'purchases + refreshes (ps.stats.gold) -- level-ups NOT included, pending orca\'s definition' },
  { label: '4-clone win, no one eliminated, no LP lost', requireWin: true, target: '0 of N', unmeasured: 'needs all 4 seats\' own rows together (roundsPassed/lpLost per seat) -- not yet wired for multi-seat' },
  { label: 'Use Transmitter 10 times in a game', requireWin: false, measure: (f) => f.transmitterUses, target: 10 },
];

const PLAYSTYLE_GOALS = [
  ['Yan', 300], ['Laterano', 300], ['Victoria', 500], ['Kazimierz', 500], ['Sargon', 500], ['Aegir', 500],
  ['Siracusa', 500], ['Kjerag', 800], ['Investor', 150], ['Foresight', 150], ['Marvel', 150], ['Durable', 300],
  ['Swift', 300], ['Precision', 300], ['Raid', 300], ['Resilient', 300], ['Arcane', 300],
].map(([name, target]) => ({ label: `${name}: ${target}+ Stacks in a win`, requireWin: true, target, measure: (f) => f.bondOf(ALLIANCES[name]).layers }));

function poolMatch(pool, f) {
  if (pool === 'solo') return f.players === 1;
  if (pool === 'coop4') return f.players === 4;
  return true;
}

export { WINRATE_GOALS, HIGHSCORE_GOALS, PLAYSTYLE_GOALS, ALLIANCES, TRANSMITTER_IDS };

function main() {
  const args = process.argv.slice(2);
  if (!args.length) { console.error('usage: node tools/rlbot-goals.mjs DIR_OR_FILE...'); process.exit(2); }
  const files = collectFiles(args);
  const facts = [];
  let errors = 0;
  for (const f of files) {
    try { const rec = readRecord(f); for (const row of factsOf(rec)) facts.push(row); } catch (e) { errors++; console.error(`skip ${f}: ${e.message}`); }
  }
  const ult = facts.filter((f) => f.ultimate && !f.cheats && !f.seeded);
  console.log(`${files.length} record(s) read (${errors} failed), ${ult.length} Ultimate non-cheat non-seeded player-rows\n`);

  console.log('## Winrate');
  for (const g of WINRATE_GOALS) {
    const pool = ult.filter((f) => poolMatch(g.pool, f));
    const wins = pool.filter((f) => f.victory).length;
    const score = pool.length ? (100 * wins / pool.length) : NaN;
    const se = pool.length ? 100 * Math.sqrt((score / 100) * (1 - score / 100) / pool.length) : NaN;
    console.log(`- ${g.label}: ${pool.length ? `${score.toFixed(1)}% ± ${se.toFixed(1)} (n=${pool.length})` : 'no data'} — target ${g.target}%`);
  }

  console.log('\n## Highscores');
  for (const g of HIGHSCORE_GOALS) {
    if (g.unmeasured) { console.log(`- ${g.label}: NOT MEASURED — ${g.unmeasured}`); continue; }
    const pool = ult.filter((f) => (!g.requireWin || f.victory) && (!g.gate || g.gate(f)));
    let best = -Infinity;
    for (const f of pool) { const v = g.measure(f); if (Number.isFinite(v) && v > best) best = v; }
    const note = g.note ? ` (${g.note})` : '';
    console.log(`- ${g.label}: best ${Number.isFinite(best) ? best : 'n/a'} (n=${pool.length})${note} — target ${g.target ?? '?'}`);
  }

  console.log('\n## Playstyles (at least N Stacks in a won game)');
  for (const g of PLAYSTYLE_GOALS) {
    const pool = ult.filter((f) => f.victory);
    let best = -Infinity;
    for (const f of pool) { const v = g.measure(f); if (Number.isFinite(v) && v > best) best = v; }
    const met = Number.isFinite(best) && best >= g.target;
    console.log(`- ${g.label}${met ? ' ✓' : ''}: best ${Number.isFinite(best) ? best : 'n/a'} (n=${pool.length})`);
  }

  console.log('\nelov3 (16 weighted sets, total /1000): NOT MEASURED -- needs the set-matching and weights from fish-edition/spacc/grinder-definition.md wired up.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
