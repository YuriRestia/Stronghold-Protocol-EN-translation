// test/match/bot-host-parity.test.js — (fork) piece 3 of docs/host-browser-bots.md: a bot's prep played on the restored
// match gives the very game the same bot gives in the match itself, and the server's side of the move list holds.
//
// Parity compares two matches of one seed: `seatStreams` (the bot in the match) and `botExecution: 'host'` (the bot on the
// copy, moves applied as intents). A row per combat holds every seat's funds, shop, pieces and LP, the shared pool and
// streams and the uid counter; the final summary must match too. SP_BOT_PARITY=full adds more seeds, whole matches with
// real battles and rehearsals; about 15 minutes, so not part of the normal suite.
//
// Run: node --test test/match/bot-host-parity.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_BOT_ATTEMPTS, MAX_BATCH_MOVES } from '../../server/match/match/botTasks.js';
import { buildWorld, seatHash } from '../../server/match/botWorld.js';
import { createBotRun } from '../../server/match/botRunner.js';
import { createFakeBotHost, nodeBotEnv, wire } from './fakeBotHost.js';
import { DATA, makeMatch } from './harness.js';

const FULL = process.env.SP_BOT_PARITY === 'full';
const human = (extra = {}) => ({ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: false, ...extra });
const bot = (i) => ({ seat: i, playerId: `ai_${i}`, name: `A${i}`, isBot: true, connected: true });
const SEATS = [human(), bot(1), bot(2), bot(3)];

function row(m) {
  return {
    round: m.round, uid: m.uidSeq, shop: m.rngShop.state(), meta: m.rngMeta.state(),
    pool: [...m.pool.entries].map(([, e]) => e.left).join(''),
    seats: m.order.map((p) => ({ id: p.playerId, hash: seatHash(p), funds: p.funds, lp: p.lp, level: p.shop.level, band: p.bandId,
      board: [...p.board].map(([k, q]) => `${k}=${q.uid}:${q.id}:${q.dir}`).sort().join(' ') })),
  };
}

function play({ host, seed, seats = SEATS, stopRound = Infinity, layouts = 0, real = false, botStrategy, difficulty = 'NORMAL', env = {} }) {
  let h = null;
  const executor = host ? createFakeBotHost(() => h.m, nodeBotEnv({ data: DATA, modeId: `mode_multi_${difficulty.toLowerCase()}`, hashEvery: true, ...env })) : undefined;
  h = makeMatch({ mode: 'coop', difficulty, seats, seed, fake: !real, botStrategy, botRehearsal: layouts,
    ...(host ? { botExecution: 'host', botExecutor: executor, botTaskLayouts: layouts } : { seatStreams: true }) }).autoHumans().start();
  const rows = [];
  let key = '';
  h.run(() => {
    const k = `${h.m.phase}:${h.m.round}`;
    if (k !== key) { key = k; if (h.m.phase === 'COMBAT') rows.push(row(h.m)); }
    return h.ended != null || h.m.round > stopRound;
  }, { maxSteps: 2e7 });
  const out = { rows, summary: h.ended, errors: h.logs.error.slice(0, 3), executor, m: h.m };
  h.m.dispose();
  return out;
}

const noDuration = (s) => s && JSON.parse(JSON.stringify(s, (k, v) => (k === 'durationMs' ? undefined : v)));

function assertParity(o) {
  const local = play({ ...o, host: false });
  const hosted = play({ ...o, host: true });
  assert.deepEqual(hosted.errors, []);
  assert.deepEqual(local.errors, []);
  assert.ok(hosted.executor.tasks.length > 0, 'the seats really played on the executor');
  assert.deepEqual(hosted.executor.acks.filter((a) => a.stale), [], 'nothing changes under a bot here, so nothing may go stale');
  assert.equal(hosted.rows.length, local.rows.length);
  hosted.rows.forEach((r, i) => assert.deepEqual(r, local.rows[i], `R${r.round}`));
  assert.deepEqual(noDuration(hosted.summary), noDuration(local.summary));
  return hosted;
}

test('parity: a whole match, the original bot', { timeout: 300_000 }, () => {
  const hosted = assertParity({ seed: 7 });
  assert.ok(hosted.summary, 'it ran to the end');
  assert.ok(hosted.rows.length >= 10);
});

for (const botStrategy of ['adaptive', 'ioleta', 'ioleta-adaptive']) {
  test(`parity: the ${botStrategy} bot`, { timeout: 300_000 }, () => {
    assertParity({ seed: 21, botStrategy, stopRound: 8 });
  });
}

test('parity: a human seat under AI, with its 自选 pick', { timeout: 300_000 }, () => {
  const diy = { chess_char_5_diy1_a: { charId: 'char_112_siege', skillIndex: 2, uniEquipId: 'uniequip_002_siege' } }; // en: 推进之王 is Siege
  assertParity({ seed: 31, seats: [human({ diy }), bot(1)], stopRound: 8 });
});

test('parity: rehearsals on the copy pick the same layouts (real battles)', { timeout: 300_000 }, () => {
  assertParity({ seed: 11, layouts: 2, real: true, stopRound: 3 });
});

if (FULL) {
  for (const seed of [1, 2, 3, 4, 5, 6, 8, 9]) {
    test(`parity (full): seed ${seed}`, { timeout: 600_000 }, () => { assertParity({ seed }); });
  }
  for (const botStrategy of ['adaptive', 'ioleta', 'ioleta-adaptive']) {
    test(`parity (full): a whole match, ${botStrategy}`, { timeout: 600_000 }, () => { assertParity({ seed: 22, botStrategy }); });
  }
  for (const difficulty of ['HARD', 'ABYSS']) {
    test(`parity (full): ${difficulty}, real battles`, { timeout: 900_000 }, () => { assertParity({ seed: 13, difficulty, real: true }); });
  }
  test('parity (full): real battles, rehearsals and the boss rounds', { timeout: 1_200_000 }, () => { assertParity({ seed: 11, layouts: 3, real: true }); });
}

/** A match in its first prep, with a scripted executor. */
function scripted(submit, { seats = SEATS, ...o } = {}) {
  let h = null;
  const executor = { submits: [], cancelled: [], submit(t) { executor.submits.push(t); submit(t, h, executor); }, cancel(id) { executor.cancelled.push(id); } };
  h = makeMatch({ mode: 'coop', seats, seed: 41, fake: true, botExecution: 'host', botExecutor: executor, botTaskLayouts: 0, ...o }).autoHumans().start();
  return { h, executor };
}
const envOf = (h) => nodeBotEnv({ data: DATA, modeId: h.m.modeId });

test('host mode: the server never runs a bot\'s prep itself', { timeout: 120_000 }, () => {
  let h = null;
  const executor = createFakeBotHost(() => h.m, nodeBotEnv({ data: DATA, modeId: 'mode_multi_normal' }));
  h = makeMatch({ mode: 'coop', seats: SEATS, seed: 3, fake: true, botExecution: 'host', botExecutor: executor, botTaskLayouts: 0 });
  const real = h.m.botFor.bind(h.m);
  h.m.botFor = (ps) => {
    const b = real(ps);
    return new Proxy({}, { get(_, k) {
      if (k === 'prepBegin' || k === 'prepEnd') throw new Error(`the server ran ${k}`);
      return b[k];
    } });
  };
  h.autoHumans().start();
  h.runToPhase('COMBAT', 4);
  assert.deepEqual(h.logs.error, []);
  for (const ps of h.m.order) assert.ok(ps.deployCount > 0, `${ps.playerId} played`);
  h.m.dispose();
});

test('no executor: bots keep their board and ready up, and the match goes on', () => {
  const h = makeMatch({ mode: 'coop', seats: SEATS, seed: 3, fake: true, botExecution: 'host', botExecutor: null, botTaskLayouts: 0 }).autoHumans().start();
  h.runToPhase('COMBAT', 3);
  assert.deepEqual(h.logs.error, []);
  for (const ps of h.m.order) assert.equal(ps.deployCount, 0, 'nobody decided anything for it');
  h.m.dispose();
});

test('stale: a move whose result differs stops the batch and the seat gets a fresh snapshot; moves before it stand', () => {
  let h = null;
  let tampered = false;
  const executor = createFakeBotHost(() => h.m, nodeBotEnv({ data: DATA, modeId: 'mode_multi_normal' }), { tamper: (batch) => {
    const i = batch.moves.findIndex((mv) => mv.x);
    if (tampered || batch.batch !== 'plan' || i < 0) return;
    tampered = true;
    batch.moves[i].x = 'not-this';
  } });
  h = makeMatch({ mode: 'coop', seats: SEATS, seed: 41, fake: true, botExecution: 'host', botExecutor: executor, botTaskLayouts: 0 }).autoHumans().start();
  h.runToPhase('COMBAT', 1);
  const staleAcks = executor.acks.filter((a) => a.stale);
  assert.equal(staleAcks.length, 1);
  assert.match(staleAcks[0].stale, /differs after/);
  assert.equal(executor.tasks.length, new Set(executor.tasks).size, 'the retry is a task of its own');
  assert.deepEqual(h.logs.error, []);
  for (const ps of h.m.order) assert.ok(ps.ready || h.m.phase === 'COMBAT');
  h.m.dispose();
});

test('stale for real: a human buys from the shared pool between the snapshot and the answer', () => {
  let h = null;
  const executor = createFakeBotHost(() => h.m, nodeBotEnv({ data: DATA, modeId: 'mode_multi_normal' }), { tamper: (batch) => {
    if (batch.batch !== 'plan' || executor.stolen) return;
    executor.stolen = true;
    for (const e of h.m.pool.entries.values()) e.left = Math.max(1, e.left - 1); // every later roll lands elsewhere
  } });
  h = makeMatch({ mode: 'coop', seats: SEATS, seed: 41, fake: true, botExecution: 'host', botExecutor: executor, botTaskLayouts: 0 }).autoHumans().start();
  h.runToPhase('COMBAT', 2);
  assert.deepEqual(h.logs.error, []);
  assert.ok(executor.stolen);
  for (const ps of h.m.order) assert.ok(ps.funds >= 0 && ps.deployCount > 0, `${ps.playerId} still played`);
  h.m.dispose();
});

test(`stale: after ${MAX_BOT_ATTEMPTS} attempts the seat keeps its board and readies up`, () => {
  const { h, executor } = scripted(() => {});
  h.run(() => executor.submits.length > 0);
  const first = executor.submits[0];
  const ps = h.m.players.get(first.playerId);
  for (let i = 0; i < MAX_BOT_ATTEMPTS; i++) {
    const { taskId } = executor.submits[executor.submits.length - 1];
    assert.equal(executor.submits.filter((s) => s.playerId === first.playerId).length, i + 1);
    assert.ok(h.m.receiveBotBatch(taskId, { batch: 'plan', moves: [{ t: 'g.buy', slot: 15 }] }).stale);
  }
  assert.equal(ps.ready, true);
  h.m.dispose();
});

test('the move list: only the allowed intents, valid ones, from a live task', () => {
  const { h, executor } = scripted(() => {});
  h.run(() => executor.submits.length > 0);
  const { taskId, playerId } = executor.submits[0];
  const ps = h.m.players.get(playerId);
  const funds = ps.funds;
  const bad = (moves) => h.m._applyBotMove(h.m._botActive.task, ps, moves);
  for (const t of ['g.leave', 'g.autoplay', 'g.pause', 'g.test', 'g.emote', 'room.leave', 'b.result']) assert.match(bad({ t }), /not allowed/, t);
  assert.match(bad({ t: 'g.sell', uid: 'x' }), /invalid/);
  assert.match(bad({ t: 'g.buy', slot: 99 }), /invalid/);
  assert.match(bad(null), /malformed/);
  assert.equal(ps.left, false);
  assert.equal(ps.funds, funds);
  assert.ok(h.m.receiveBotBatch(taskId, { batch: 'plan', moves: new Array(MAX_BATCH_MOVES + 1).fill({ t: 'g.freeze' }) }).error);
  assert.ok(h.m.receiveBotBatch(taskId, { batch: 'other', moves: [] }).error);
  assert.equal(h.m.receiveBotBatch('nobody', { batch: 'plan', moves: [] }).stale, 'gone', 'an unknown task changes nothing');
  h.m.dispose();
});

test('the prep ends first: the executor is told, and a late answer changes nothing', () => {
  // two humans keep the prep on its clock (a lone human has none)
  const seats = [human(), { ...human(), seat: 1, playerId: 'p_1' }, bot(2)];
  const { h, executor } = scripted(() => {}, { seats });
  h.run(() => executor.submits.length > 0);
  const { taskId, playerId } = executor.submits[0];
  const ps = h.m.players.get(playerId);
  h.runToPhase('COMBAT', 1);
  assert.ok(executor.cancelled.includes(taskId));
  const funds = ps.funds;
  assert.equal(h.m.receiveBotBatch(taskId, { batch: 'final', moves: [{ t: 'g.refresh' }] }).stale, 'gone');
  assert.equal(ps.funds, funds);
  h.m.dispose();
});

test('out of budget: the best layout so far stands and the seat still readies up', { timeout: 120_000 }, () => {
  const { h, executor } = scripted(() => {}, { fake: false, botTaskLayouts: 3 });
  h.run(() => executor.submits.length > 0);
  const { taskId, world } = executor.submits[0];
  const run = createBotRun(wire(world), envOf(h));
  const plan = run.plan();
  assert.ok(h.m.receiveBotBatch(taskId, { batch: 'plan', ...wire(plan) }).applied > 0);
  assert.equal(run.rehearse(0), false, 'no time at all');
  const end = run.finish();
  assert.equal(end.moves.at(-1).t, 'g.ready');
  assert.ok(!h.m.receiveBotBatch(taskId, { batch: 'final', ...wire(end) }).stale);
  assert.equal(h.m.players.get(executor.submits[0].playerId).ready, true);
  h.m.dispose();
});

test('a world for a seat that does not exist is refused, not guessed', () => {
  const h = makeMatch({ mode: 'coop', seats: SEATS, seed: 3, fake: true, seatStreams: true }).autoHumans().start();
  const ps = h.m.players.get('ai_1');
  const world = wire(buildWorld(h.m, ps, h.m.newBotTask(ps)));
  assert.throws(() => createBotRun({ ...world, seat: 9 }, envOf(h)), /no seat 9/);
  h.m.dispose();
});
