#!/usr/bin/env node
// tools/replay-record.mjs — (fork, GitHub #104) rebuild a recorded match (server/match/records.js) from its seed, its
// lobby rules, each seat's setup and the seats' actions, and continue it from any round.
//
// Usage:
//   node tools/replay-record.mjs FILE                  replay every action; report the first divergence
//   node tools/replay-record.mjs FILE --until R        stop at round R's prep (before its actions) and print the state
//   node tools/replay-record.mjs FILE --until R --bot ID
//                                                      … then hand every seat to the bot ID (AI 托管, server/match/
//                                                      botStrategies.js) and play to the end; prints both results
//   --reseed S  with --bot: the match continues on seed S from the handover (Fish's seed re-randomisation, #104): what
//            is already drawn stays (stage, leader, the rounds' types, bans, the shop on screen); the shop rolls, drafts,
//            battles and the bot's own draws after it come from S, so one human board gives many different endgames
//   --json   the report as JSON
//
// It replays what the record keeps: the band and 机变 drafts, every prep action of every seat (bots and 托管 included),
// the personal choices and the plugin offers, with each seat's loadout, 潜能 / 练度, 补位 list and 自选 picks (`setup`;
// a record from before #104 has none, so its seats play on the defaults: see "Limits"). Every seat replays as an offline
// human, so the battles run on the server and no bot decides anything until --bot. Checks on the way: each recorded
// shop roll (`shop`) must show the same cards, each round's SETTLE the recorded LP and shop level of every seat, and
// each normal battle the recorded leaks and kills (a record keeps battles when the match ran client combat). The first that
// differs ends the replay (`diverged`): from there on the state is no longer the recorded match.
//
// Limits (#104: "a future update breaks the behaviour of that match, in which case the future version will not be able
// to replay it"): a record replays exactly only on the app version that made it (`app` in the record). An older record
// usually diverges within a few rounds: the waves of a seed, prices or a kit changed. A gameplay plugin room (`cs`)
// needs that content set; this tool runs the built-in content only.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { Match } from '../server/match/Match.js';
import { VirtualScheduler } from '../server/match/scheduler.js';
import { getData } from '../server/data.js';
import { createRng, deriveSeed } from '../server/sim/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A record file (`.json` or `.json.gz`). */
export function readRecord(file) {
  const buf = fs.readFileSync(file);
  return JSON.parse(file.endsWith('.gz') ? zlib.gunzipSync(buf).toString('utf8') : buf.toString('utf8'));
}

/** The app version of this checkout (package.json), to compare with a record's `app`. */
export function appVersion() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version ?? null; } catch { return null; }
}

/** The prep actions of PlayerState: record name → [method, args from the record entry]. */
const PS_CALLS = {
  buy: (a) => ['buy', [a.slot]],
  refresh: () => ['refresh', []],
  freeze: () => ['freeze', []],
  levelUp: () => ['levelUp', []],
  sell: (a) => ['sell', [a.uid]],
  move: (a) => ['move', [a.uid, a.to, a.dir]],
  destroy: (a) => ['destroy', [a.uid]],
  equip: (a) => ['equip', a.replace != null ? [a.itemUid, a.uid, a.replace] : [a.itemUid, a.uid]],
  art: (a) => ['useArt', [a.itemUid, a.row, a.col, a.dir]],
  unequip: (a) => ['unequip', [a.itemUid]],
  reward: (a) => ['pickReward', [a.idx]],
};

const refused = (res) => res && typeof res === 'object' && res.error;

/**
 * Replay `rec`. Returns { replayed, total, checks: { shops, battles }, diverged, stopped: { phase, round }, seats, result? }.
 * @param {any} rec a record (readRecord)
 * @param {{ until?: number, bot?: string|null, data?: any, maxSteps?: number }} [opts]
 */
export function replayRecord(rec, { until = Infinity, bot = null, reseed = null, data = null, maxSteps = 5e6 } = {}) {
  const sched = new VirtualScheduler();
  const pid = (s) => `p_${Number(String(s).slice(1))}`;
  const seats = rec.seats.map((s) => ({
    seat: Number(String(s.seat).slice(1)), playerId: pid(s.seat), name: s.seat, isBot: false, connected: false,
    ...(s.setup?.loadout ? { loadout: s.setup.loadout } : {}), ...(s.setup?.ops ? { ops: s.setup.ops } : {}),
    ...(s.setup?.notOwned ? { notOwned: s.setup.notOwned } : {}), ...(s.setup?.diy ? { diy: s.setup.diy } : {}),
  }));
  let summary = null;
  const errors = [];
  const log = { info() {}, debug() {}, warn() {}, error: (...a) => errors.push(a.map(String).join(' ').slice(0, 200)) };
  const m = new Match({
    roomCode: 'REPLAY', mode: rec.mode, difficulty: rec.difficulty, seats, seed: rec.seed, data: data ?? getData({ log }), log,
    scheduler: sched, lobbyRules: rec.lobbyRules ?? {}, ...(rec.rules ? { rules: rec.rules } : {}),
    clientCombat: false, botStrategy: bot || 'legacy', botStrategySeats: {},
    send: () => true, broadcast: () => {}, onEnd: (s) => { summary = s; },
  });
  const P = (s) => m.players.get(pid(s));
  // the round's normal battles: checked against the record once the round has settled
  const recBattles = new Map();
  for (const b of rec.battles || []) if (b.kind === 'normal' && b.out) for (const [s, o] of Object.entries(b.out)) recBattles.set(`${b.r}:${s}`, o);
  const recRounds = new Map((rec.rounds || []).filter((x) => !x.final && !x.noSettle).map((x) => [x.r, x.seats || {}]));
  const checks = { shops: 0, battles: 0, rounds: 0 };
  let checkedRound = 0;
  let readyBefore = 0; // seats get ready in every PREP of a round below this
  const checkBattles = () => {
    if (checkedRound >= m.round || m.phase !== 'SETTLE') return null;
    checkedRound = m.round;
    // the round's row (records.js roundRow, taken at SETTLE): LP and shop level of every seat
    const row = recRounds.get(m.round);
    if (row) {
      for (const ps of m.players.values()) {
        const want = row[`s${ps.seat}`];
        if (want && (want.lp !== ps.lp || want.level !== ps.shop.level)) return `R${m.round} s${ps.seat} at SETTLE: LP ${ps.lp}, level ${ps.shop.level} (record: ${want.lp}, ${want.level})`;
      }
      checks.rounds++;
    }
    for (const ps of m.players.values()) {
      const want = recBattles.get(`${m.round}:s${ps.seat}`);
      const got = m.lastResults?.get(ps.playerId);
      if (!want || !got) continue;
      const leaks = (got.leaked || []).filter((l) => l && l.counted !== false).length;
      const killed = got.killed ?? null;
      if (leaks !== want.leaks || (killed != null && want.killed != null && killed !== want.killed)) {
        return `R${m.round} s${ps.seat} battle: ${killed} killed, ${leaks} leaks (record: ${want.killed}, ${want.leaks})`;
      }
      checks.battles++;
    }
    return null;
  };
  let battleDiff = null;
  let checking = true; // off once the bot plays: its rounds are its own
  const drive = (pred) => {
    for (let i = 0; i < maxSteps; i++) {
      if (checking) battleDiff ||= checkBattles();
      if (battleDiff || pred() || summary) return !battleDiff && pred();
      for (const ps of m.players.values()) {
        if (ps.left) continue;
        if (m.phase === 'INFO_CHECK' && !ps.infoReady) m.handle(ps.playerId, { t: 'g.infoReady' });
        if (m.phase === 'PREP' && m.round < readyBefore && ps.alive && !ps.ready) {
          if (!ps.tempEmpty) ps.resolveTemp();
          m.handle(ps.playerId, { t: 'g.ready', ready: true });
        }
      }
      if (pred()) return true;
      if (!sched.runNext()) return pred();
    }
    return pred();
  };
  const inRound = (r) => m.round === r && (m.phase === 'SP_DRAFT' || m.phase === 'PREP');
  const toRound = (r) => { readyBefore = r; return drive(() => m.round > r || inRound(r)) && m.round === r; };
  const toPrep = (r) => { readyBefore = r; return drive(() => m.round > r || (m.round === r && m.phase === 'PREP')) && m.phase === 'PREP' && m.round === r; };

  m.start();
  let n = 0;
  let diverged = null;
  const actions = rec.actions || [];
  const stopAt = Number.isFinite(until) ? until : Infinity;
  for (const a of actions) {
    if (a.r >= stopAt) break;
    const ps = P(a.s);
    let why = null;
    if (!ps) why = `unknown seat ${a.s}`;
    else if (a.a === 'band') {
      if (!drive(() => m.phase === 'BAND_DRAFT' && m.draftTurn() === ps.playerId)) why = 'no band draft turn';
      else if (refused(m.handle(ps.playerId, { t: 'g.band', bandId: a.id })) || m.draft?.picks?.[ps.playerId] !== a.id) why = `band ${a.id} not taken`;
    } else if (a.a === 'card') {
      readyBefore = a.r;
      if (!drive(() => m.round > a.r || (m.phase === 'SP_DRAFT' && m.round === a.r && m.spTurn() === ps.playerId)) || m.phase !== 'SP_DRAFT') why = `no 机变 turn in R${a.r}`;
      else if (a.id && m.sp?.cards?.[a.idx]?.id !== a.id) why = `机变 card ${a.idx} is ${m.sp?.cards?.[a.idx]?.id}, record ${a.id}`;
      else if (refused(m.handle(ps.playerId, { t: 'g.choice', idx: a.idx }))) why = `机变 card ${a.idx} refused`;
    } else if (a.a === 'shop') {
      if (!toRound(a.r)) why = `no round ${a.r}`;
      else {
        const ids = ps.shop.slots.map((x) => (x ? x.id : null));
        if (JSON.stringify(ids) !== JSON.stringify(a.ids)) why = `R${a.r} ${a.s} shop ${JSON.stringify(ids)}, record ${JSON.stringify(a.ids)}`;
        else checks.shops++;
      }
    } else if (a.a === 'gain' || a.a === 'autoplay') {
      // an observation / a seat setting: the replay acts for every seat itself
    } else if (a.a === 'loadout') {
      if (!toRound(a.r === 0 ? 0 : a.r)) why = `no round ${a.r}`;
      else if (refused(m.setLoadout(ps.playerId, a.loadout, a.ops))) why = 'loadout refused';
    } else if (a.a === 'choice') {
      if (!toPrep(a.r)) why = `no PREP R${a.r}`;
      else if (refused(m.pickPersonalChoice(ps, a.idx, ps.personalChoice?.id))) why = 'personal choice refused';
    } else if (a.a === 'offer' || a.a === 'offerRefresh') {
      if (!toPrep(a.r)) why = `no PREP R${a.r}`;
      else if (refused(a.a === 'offer' ? m.requestOffer(ps, a.offerId, a.idx) : m.requestOfferRefresh(ps, a.offerId, a.idx))) why = `${a.a} refused`;
    } else if (PS_CALLS[a.a]) {
      if (!toPrep(a.r)) why = `no PREP R${a.r}`;
      else {
        const [name, args] = PS_CALLS[a.a](a);
        const res = ps[name](...args);
        if (refused(res)) why = `${a.a} refused: ${res.error}${res.detail ? ` (${res.detail})` : ''}`;
      }
    } else why = `unknown action ${a.a}`;
    if (battleDiff) why = battleDiff;
    if (why) { diverged = { at: n, round: a.r, seat: a.s, action: a.a, why }; break; }
    n++;
  }
  // stop at `until`'s prep — then optionally continue with the bot; without `until`, play the record's last rounds out
  // (a final round often has no action) to compare the result
  if (!diverged && Number.isFinite(until)) {
    if (!toPrep(until) && !summary) diverged = { at: n, round: until, why: battleDiff || `no PREP R${until} (${m.phase} R${m.round})` };
  } else if (!diverged && !bot) {
    readyBefore = Infinity;
    drive(() => summary != null);
    if (battleDiff) diverged = { at: n, round: m.round, why: battleDiff };
  }
  const state = () => [...m.players.values()].map((ps) => ({
    seat: `s${ps.seat}`, alive: ps.alive, lp: ps.lp, level: ps.shop.level, funds: ps.funds, band: ps.bandId,
    board: [...ps.board.values()].filter((p) => p.kind === 'chess').map((p) => p.id).sort(),
    layers: Object.values(ps.layers || {}).reduce((s, x) => s + (Number(x) || 0), 0),
  }));
  const out = {
    app: rec.app ?? null, appNow: appVersion(), replayed: n, total: actions.length, checks, diverged,
    stopped: { phase: m.phase, round: m.round }, seats: state(), errors: errors.slice(0, 5),
  };
  if (bot && !summary) {
    out.botFrom = m.round;
    if (reseed != null) reseedMatch(m, reseed);
    for (const ps of m.players.values()) if (!ps.left) m.setAutoplay(ps, true);
    readyBefore = -1; // the bot readies its seats itself
    checking = false;
    drive(() => summary != null);
  }
  if (summary || bot || !Number.isFinite(until)) {
    out.result = summary ? { victory: !!summary.victory, roundsPassed: summary.roundsPassed ?? 0, teamLp: summary.teamLp ?? null } : null;
    out.recordResult = rec.result ?? null;
  }
  m.dispose?.();
  return out;
}

/**
 * Continue `m` on another seed: the battle seeds (deriveSeed of m.seed) and the match's later draws (shop, waves, drafts,
 * bots, effects) change; what was drawn at the setup stays.
 */
export function reseedMatch(m, seed) {
  m.seed = (Number(seed) >>> 0) || 1;
  for (const k of ['Shop', 'Waves', 'Draft', 'Bots', 'Meta']) m[`rng${k}`] = createRng(deriveSeed(m.seed, `reseed:${k.toLowerCase()}`));
  m.reseeded = m.seed;
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (k) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
  const json = args.includes('--json');
  if (json) args.splice(args.indexOf('--json'), 1);
  const until = flag('--until');
  const bot = flag('--bot');
  const reseed = flag('--reseed');
  const [file] = args;
  if (!file) {
    console.error('usage: node tools/replay-record.mjs FILE [--until R] [--bot ID] [--json]');
    process.exit(2);
  }
  const rec = readRecord(file);
  const out = replayRecord(rec, { until: until != null ? Number(until) : Infinity, bot: bot ?? null, reseed: reseed != null ? Number(reseed) : null });
  if (json) { console.log(JSON.stringify(out, null, 1)); return; }
  console.log(`${path.basename(file)}: app ${out.app} (this checkout ${out.appNow}), ${rec.mode} ${rec.difficulty}, seed ${rec.seed}`);
  console.log(`replayed ${out.replayed} of ${out.total} actions; as recorded: ${out.checks.shops} shop rolls, ${out.checks.rounds} rounds (LP, level), ${out.checks.battles} battles`);
  console.log(out.diverged ? `diverged at R${out.diverged.round}${out.diverged.seat ? ` ${out.diverged.seat}` : ''}: ${out.diverged.why}` : 'no divergence');
  console.log(`stopped at ${out.stopped.phase} R${out.stopped.round}`);
  for (const s of out.seats) console.log(`  ${s.seat}: ${s.alive ? 'alive' : 'out'}, LP ${s.lp}, level ${s.level}, funds ${s.funds}, ${s.layers} stacks, board ${s.board.join(' ')}`);
  if (out.result !== undefined) {
    const f = (r) => (r ? `${r.victory ? 'won' : 'lost'}, ${r.roundsPassed} rounds, team LP ${r.teamLp}` : 'not finished');
    console.log(`${bot ? `bot ${bot} from R${out.botFrom}${reseed != null ? ` on seed ${reseed}` : ''}` : 'replay'}: ${f(out.result)}; record: ${f(out.recordResult)}`);
  }
  if (out.errors.length) console.log(`match errors: ${out.errors.join(' | ')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
