// test/match/bot-task-protocol.test.js — (fork) piece 6 of docs/host-browser-bots.md: a bot seat's prep over the live frames,
// and everything that can go wrong with the browser playing it. A scripted host stands in for the page and Worker.
// Run: node --test test/match/bot-task-protocol.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateC2S, S2C } from '../../shared/protocol.js';
import { BOT_GRACE_MS, BOT_PLAN_MS, BOT_RECEIPT_MS } from '../../server/match/match/botTasks.js';
import { seatHash } from '../../server/match/botWorld.js';
import { createBotRun, createBotWorkerEnv } from '../../server/match/botWorkerEnv.js';
import { wire } from './fakeBotHost.js';
import { DataSource } from '../../server/sim/simdata.js';
import { simMeter } from '../../server/match/simMeter.js';
import { attachFakeBattleHost } from './fakeBotHost.js';
import { FakeBattle } from './fakeBattle.js';
import { MatchProxy, wireOptions } from '../../server/match/host/proxy.js';
import { DATA, makeMatch } from './harness.js';

const human = (seat, connected = true) => ({ seat, playerId: `p_${seat}`, name: `P${seat}`, isBot: false, connected });
const bot = (seat) => ({ seat, playerId: `ai_${seat}`, name: `A${seat}`, isBot: true, connected: true });
const SEATS = [human(0), human(1), bot(2), bot(3)];
const NODE = createBotWorkerEnv(DATA);
const FRAMES = new Set(['b.botTask', 'b.botAck', 'b.botHurry', 'b.botCancel']);

/**
 * A match at its first prep with bot prep on the live frames. `script` plays the page: it sees each frame sent to a human.
 * Nothing answers by default, so a test can walk the failure it is about.
 */
function atPrep({ autoplay = false, picks = true, ...o } = {}) {
  const h = makeMatch({ mode: 'coop', difficulty: 'NORMAL', seats: SEATS, seed: 3, fake: true, hostId: 'p_0', botExecution: 'host', botTaskLayouts: 0, ...o });
  h.frames6 = [];
  h.onSend.push((pid, msg) => { if (FRAMES.has(msg.t)) h.frames6.push([pid, msg]); });
  // band and card picks answered unless a test is about them
  if (picks) h.onSend.push((pid, msg) => {
    if (msg.t !== 'b.botTask' || !msg.world.pick) return;
    h.m.later(1, () => { if (h.m._botActive?.task.id === msg.taskId) send(h, pid, { t: 'b.botMoves', taskId: msg.taskId, batch: 'final', ...playPick(msg) }); });
  });
  if (autoplay) h.autoHumans();
  h.m.start();
  return h;
}
const send = (h, pid, msg) => {
  const m = wire(msg);
  assert.equal(validateC2S(m), null, JSON.stringify(m).slice(0, 200));
  return h.m.handle(pid, m);
};
const taskFrames = (h, pid) => h.allTo(pid, 'b.botTask').filter((m) => !m.world.pick);
const pickFrames = (h, pid) => h.allTo(pid, 'b.botTask').filter((m) => m.world.pick);
const playPick = (frame) => wire(createBotRun(wire(frame.world), NODE.envFor(frame.world.match.modeId)).pick());
/** Run to the moment the first bot seat's task has gone out. */
function toFirstTask(h) {
  assert.ok(h.run(() => (h.m._botActive != null && !h.m._botActive.entry.pick) || h.ended != null, { maxSteps: 3e6 }), 'a task went out');
  assert.ok(h.m._botActive);
  return h.m._botActive;
}
/** Plays a frame's task the way the Worker does. */
function playTask(frame) {
  const run = createBotRun(wire(frame.world), NODE.envFor(frame.world.match.modeId));
  const plan = run.plan();
  return { plan: wire(plan), rest() { run.rehearse(); return wire(run.finish()); } };
}
/** A page that answers everything, a moment after it arrives. */
function answering(h, { pid = null, tamper = null, around = (fn) => fn() } = {}) {
  const runs = new Map();
  h.onSend.push((to, msg) => {
    if (pid && to !== pid) return;
    if (msg.t === 'b.botTask' && !msg.world.pick) {
      h.m.later(1, () => {
        send(h, to, { t: 'b.botReceived', taskId: msg.taskId });
        const run = around(() => playTask(wire(msg)));
        runs.set(msg.taskId, run);
        const body = { t: 'b.botMoves', taskId: msg.taskId, batch: 'plan', moves: run.plan.moves };
        tamper?.(body);
        send(h, to, body);
      });
    } else if (msg.t === 'b.botAck' && !msg.stale) {
      const run = runs.get(msg.taskId);
      h.m.later(1, () => { if (run) send(h, to, { t: 'b.botMoves', taskId: msg.taskId, batch: 'final', ...around(() => run.rest()) }); });
    }
  });
  return h;
}

test('the frames are declared, a plugin room\'s task names its content, and without the flag nothing changes', () => {
  for (const t of FRAMES) assert.ok(S2C.includes(t), t);
  const plugin = atPrep({ cs: 'a'.repeat(64), requireCs: true });
  assert.equal(plugin.m.botExecution, 'host');
  assert.equal(plugin.lastTo('p_0', 'b.botWarm').cs, 'a'.repeat(64));
  toFirstTask(plugin);
  assert.equal(plugin.lastTo('p_0', 'b.botTask').cs, 'a'.repeat(64));
  plugin.m.dispose();
  const vanilla = atPrep({ cs: 'b'.repeat(64) });
  assert.equal(vanilla.m.botExecution, 'host', 'every vanilla room has a cs too, the official content\'s hash');
  assert.equal('cs' in vanilla.lastTo('p_0', 'b.botWarm'), false);
  vanilla.m.dispose();
  const off = makeMatch({ seats: SEATS, fake: true });
  assert.equal(off.m.botExecution, 'local');
  off.m.dispose();
});

test('a whole prep over the frames: task to the host, plan, ack, final, Ready, next seat', () => {
  const h = answering(atPrep());
  const ai = [h.ps('ai_2'), h.ps('ai_3')];
  assert.ok(h.run(() => h.m.phase === 'PREP' && ai.every((p) => p.ready), { maxSteps: 3e6 }));
  assert.equal(taskFrames(h, 'p_0').length, 2);
  assert.equal(taskFrames(h, 'p_1').length, 0);
  assert.deepEqual(h.allTo('p_0', 'b.botAck').map((m) => !!m.stale), [false, false]);
  assert.equal(h.m.botTaskStats.stale, 0);
  assert.equal(h.m._botActive, null);
  h.m.dispose();
});

test('same seed over the frames: the game equals the one played in the match on seat streams', { timeout: 120000 }, () => {
  const seats = [human(0), bot(1), bot(2), bot(3)];
  const row = (m) => JSON.stringify([m.round, m.uidSeq, [...m.pool.entries].map(([, e]) => e.left).join(''), m.order.map((p) => [seatHash(p), p.funds, p.lp])]);
  const rowsOf = (h) => {
    const rows = [];
    let key = '';
    h.run(() => {
      const k = `${h.m.phase}:${h.m.round}`;
      if (k !== key) { key = k; if (h.m.phase === 'COMBAT') rows.push(row(h.m)); }
      return h.ended != null || h.m.round > 8;
    }, { maxSteps: 2e7 });
    h.m.dispose();
    return rows;
  };
  const local = makeMatch({ mode: 'coop', difficulty: 'NORMAL', seats, seed: 7, fake: true, seatStreams: true, botRehearsal: 0 }).autoHumans().start();
  const a = rowsOf(local);
  const b = rowsOf(answering(atPrep({ seats, seed: 7, autoplay: true })));
  assert.ok(a.length >= 6, `${a.length} combats`);
  assert.deepEqual(b, a);
});

test('no receipt in time: a strike, and the next human gets a fresh snapshot', () => {
  const h = atPrep();
  const active = toFirstTask(h);
  const first = active.task.id;
  assert.equal(active.executor, 'p_0');
  h.sched.advance(BOT_RECEIPT_MS + 1);
  assert.equal(active.executor, 'p_1');
  assert.notEqual(active.task.id, first);
  assert.ok(h.allTo('p_0', 'b.botCancel').some((m) => m.taskId === first));
  assert.equal(h.m._botHostStrikes.get('p_0'), 1);
  assert.equal(h.m.botTaskStats.failovers, 1);
  h.m.dispose();
});

test('a receipt gives the plan its own window; a silent plan fails over, and so does a silent rehearsal', () => {
  const h = atPrep();
  const active = toFirstTask(h);
  send(h, 'p_0', { t: 'b.botReceived', taskId: active.task.id });
  h.sched.advance(BOT_RECEIPT_MS + 1);
  assert.equal(active.executor, 'p_0', 'the Worker may still be starting');
  h.sched.advance(BOT_PLAN_MS - BOT_RECEIPT_MS);
  assert.equal(active.executor, 'p_1');
  // the plan comes, then nothing
  const frame = h.lastTo('p_1', 'b.botTask');
  send(h, 'p_1', { t: 'b.botReceived', taskId: frame.taskId });
  send(h, 'p_1', { t: 'b.botMoves', taskId: frame.taskId, batch: 'plan', moves: playTask(frame).plan.moves });
  assert.equal(h.lastTo('p_1', 'b.botAck').taskId, frame.taskId);
  h.sched.advance(frame.budgetMs / 2);
  assert.equal(active.entry.ps.ready, false, 'still inside its budget');
  h.sched.advance(frame.budgetMs / 2 + BOT_GRACE_MS + 1);
  assert.ok(active.entry.ps.ready, 'nobody left: the seat keeps its board and readies up');
  h.m.dispose();
});

test('every human gone silent: the seat readies up and the server decides nothing', () => {
  const h = atPrep();
  const active = toFirstTask(h);
  const { ps } = active.entry;
  h.m.botFor = () => assert.fail('no bot code on the server');
  h.sched.advance(BOT_RECEIPT_MS + 1);
  h.sched.advance(BOT_RECEIPT_MS + 1);
  assert.ok(ps.ready);
  assert.equal(h.m._botActive?.entry.ps === ps, false);
  h.m.dispose();
});

test('two strikes and a human is not asked again this match', () => {
  const h = atPrep();
  toFirstTask(h);
  h.m._botHostStrike('p_0');
  h.m._botHostStrike('p_0');
  assert.equal(h.m._botExecutorFor(), 'p_1');
  h.m._botHostStrike('p_1');
  assert.equal(h.m._botExecutorFor(), 'p_1');
  h.m._botHostStrike('p_1');
  assert.equal(h.m._botExecutorFor(), null);
  h.m.dispose();
});

test('an executor that disconnects or leaves loses the seat at once; moves already applied stay', () => {
  const h = atPrep();
  const active = toFirstTask(h);
  const { ps } = active.entry;
  const frame = h.lastTo('p_0', 'b.botTask');
  send(h, 'p_0', { t: 'b.botReceived', taskId: frame.taskId });
  const { plan } = playTask(frame);
  send(h, 'p_0', { t: 'b.botMoves', taskId: frame.taskId, batch: 'plan', moves: plan.moves });
  const after = seatHash(ps);
  h.m.onDisconnect('p_0');
  assert.equal(active.executor, 'p_1');
  assert.equal(seatHash(ps), after);
  h.m.onLeave('p_1');
  assert.equal(h.m._botActive?.entry === active.entry, false);
  assert.ok(ps.ready);
  h.m.dispose();
});

test('a hidden tab: failed over at once, no strike, not asked while hidden, asked again when back', () => {
  const h = atPrep();
  const active = toFirstTask(h);
  send(h, 'p_0', { t: 'b.botHidden', hidden: true });
  assert.equal(active.executor, 'p_1');
  assert.equal(h.m._botHostStrikes.get('p_0'), undefined);
  assert.equal(h.m._botExecutorFor(), 'p_1');
  send(h, 'p_0', { t: 'b.botHidden', hidden: false });
  assert.equal(h.m._botExecutorFor(), 'p_0');
  send(h, 'p_0', { t: 'b.botHidden', hidden: true });
  h.m.onDisconnect('p_0');
  h.m.onReconnect?.('p_0');
  assert.equal(h.m._botHostHidden.has('p_0'), false, 'a page that reconnects reports its tab again');
  h.m.dispose();
});

test('a browser that cannot play it says so: a strike and the next human, at once', () => {
  const h = atPrep();
  const active = toFirstTask(h);
  send(h, 'p_0', { t: 'b.botMoves', taskId: active.task.id, error: true });
  assert.equal(active.executor, 'p_1');
  assert.equal(h.m._botHostStrikes.get('p_0'), 1);
  assert.equal(h.m.botTaskStats.errors, 1);
  h.m.dispose();
});

test('forged and late frames change nothing', () => {
  const h = atPrep();
  const active = toFirstTask(h);
  const { ps } = active.entry;
  const frame = h.lastTo('p_0', 'b.botTask');
  const { plan } = playTask(frame);
  const before = seatHash(ps);
  send(h, 'p_1', { t: 'b.botMoves', taskId: frame.taskId, batch: 'plan', moves: plan.moves });
  send(h, 'p_0', { t: 'b.botMoves', taskId: 'other', batch: 'plan', moves: plan.moves });
  assert.equal(seatHash(ps), before);
  assert.equal(h.allTo('p_0', 'b.botAck').length, 0);
  h.sched.advance(BOT_RECEIPT_MS + 1);
  assert.equal(active.executor, 'p_1');
  send(h, 'p_0', { t: 'b.botMoves', taskId: frame.taskId, batch: 'plan', moves: plan.moves });
  assert.equal(seatHash(ps), before, 'the old executor is out');
  h.m.dispose();
});

test('a move outside the allow-list goes stale, even from the executor; the wire refuses oversized batches', () => {
  const h = atPrep();
  const active = toFirstTask(h);
  const id = active.task.id;
  for (const t of ['g.leave', 'g.autoplay', 'g.pause', 'g.test', 'b.result']) {
    h.m._botActive.stale = 0;
    const res = h.m.receiveBotBatch(h.m._botActive.task.id, { batch: 'plan', moves: [{ t }] });
    assert.match(String(res.stale), /not allowed/, t);
  }
  assert.notEqual(h.m._botActive?.task.id, id);
  assert.notEqual(validateC2S({ t: 'b.botMoves', taskId: 'x', batch: 'plan', moves: Array(201).fill({ t: 'g.refresh' }) }), null);
  assert.notEqual(validateC2S({ t: 'b.botMoves', taskId: 'x', batch: 'nope', moves: [] }), null);
  h.m.dispose();
});

test('a stale plan: ack says so, a fresh task follows with a new attempt, and three tries end in Ready', () => {
  const h = atPrep();
  const active = toFirstTask(h);
  const { ps } = active.entry;
  for (let i = 0; i < 3; i++) {
    const frame = h.lastTo('p_0', 'b.botTask');
    assert.equal(frame.taskId, active.task.id);
    send(h, 'p_0', { t: 'b.botMoves', taskId: frame.taskId, batch: 'plan', moves: [{ t: 'g.refresh', x: 'wrong' }] });
    assert.deepEqual(h.lastTo('p_0', 'b.botAck'), { t: 'b.botAck', taskId: frame.taskId, stale: true });
  }
  assert.equal(h.m.botTaskStats.stale, 3);
  assert.ok(ps.ready);
  h.m.dispose();
});

test('every human Ready: the running task is told to hurry, and later seats get no rehearsal budget', () => {
  const h = atPrep();
  const active = toFirstTask(h);
  assert.ok(h.lastTo('p_0', 'b.botTask').budgetMs > 0);
  h.ps('p_0').setReady(true);
  assert.equal(h.allTo('p_0', 'b.botHurry').length, 0, 'one human is still preparing');
  h.ps('p_1').setReady(true);
  assert.deepEqual(h.allTo('p_0', 'b.botHurry'), [{ t: 'b.botHurry', taskId: active.task.id }]);
  const frame = h.lastTo('p_0', 'b.botTask');
  send(h, 'p_0', { t: 'b.botReceived', taskId: frame.taskId });
  const run = playTask(frame);
  send(h, 'p_0', { t: 'b.botMoves', taskId: frame.taskId, batch: 'plan', moves: run.plan.moves });
  send(h, 'p_0', { t: 'b.botMoves', taskId: frame.taskId, batch: 'final', ...run.rest() });
  assert.ok(h.run(() => h.m._botActive != null && h.m._botActive !== active || h.m.phase !== 'PREP', { maxSteps: 1e6 }));
  if (h.m.phase === 'PREP') assert.equal(h.lastTo('p_0', 'b.botTask').budgetMs, 0);
  h.m.dispose();
});

test('the budget: 40 % of the prep within 15–60 s, shared among the seats still to play; 30 s when untimed', () => {
  const h = atPrep();
  toFirstTask(h);
  const m = h.m;
  const at = (deadlineIn, queued) => {
    m._botBudgetRound = -1;
    m._botHurryRound = -1;
    m.deadline = deadlineIn ? m.sched.now() + deadlineIn : 0;
    const q = m._botQueue;
    m._botQueue = Array(queued).fill(m._botActive.entry);
    const out = m._botSeatBudgetMs();
    m._botQueue = q;
    return out;
  };
  assert.equal(at(100000, 0), 40000);
  assert.equal(at(100000, 1), 20000, 'two seats share it');
  assert.equal(at(20000, 0), 15000, 'the floor');
  assert.equal(at(10000, 0), 10000, 'never past the prep');
  assert.equal(at(300000, 0), 60000, 'the ceiling');
  assert.equal(at(0, 0), 30000, 'untimed');
  h.m.dispose();
});

test('the prep ending cancels the running task, and its late batch is ignored', () => {
  const h = atPrep();
  const active = toFirstTask(h);
  const { ps } = active.entry;
  const frame = h.lastTo('p_0', 'b.botTask');
  const { plan } = playTask(frame);
  h.m.cancelBotTasks();
  assert.ok(h.allTo('p_0', 'b.botCancel').some((m) => m.taskId === frame.taskId));
  const before = seatHash(ps);
  send(h, 'p_0', { t: 'b.botMoves', taskId: frame.taskId, batch: 'plan', moves: plan.moves });
  assert.equal(seatHash(ps), before);
  h.m.dispose();
});

test('nobody connected: the bot seats ready up on rule-level moves', () => {
  const h = atPrep({ seats: [human(0, false), bot(1), bot(2), bot(3)], autoplay: true });
  assert.ok(h.run(() => h.m.phase === 'COMBAT', { maxSteps: 3e6 }));
  assert.ok(h.m.botTaskStats.noHost >= 3);
  assert.equal(h.m.botTaskStats.sent, 0);
  h.m.dispose();
});

test('a band pick is a task: one g.band from the browser, and it is applied as that seat\'s pick', () => {
  const h = atPrep();
  assert.ok(h.run(() => h.m.phase === 'PREP' || h.ended != null, { maxSteps: 3e6 }));
  const bands = pickFrames(h, 'p_0').filter((m) => m.world.pick === 'band');
  assert.equal(bands.length, 2, 'the two AI seats');
  for (const frame of bands) {
    const pick = playPick(frame);
    assert.equal(pick.moves.length, 1);
    assert.equal(pick.moves[0].t, 'g.band');
    assert.ok(h.ps(frame.world.seats.find((x) => x.seat === frame.world.seat).playerId).bandId);
  }
  h.m.dispose();
});

test('a band pick with nobody answering: the next human, then the rule\'s own pick, and the draft goes on', () => {
  const h = atPrep({ picks: false });
  assert.ok(h.run(() => h.m._botActive?.entry.pick === 'band' || h.ended != null, { maxSteps: 3e6 }));
  const { ps } = h.m._botActive.entry;
  assert.equal(h.m._botActive.executor, 'p_0');
  h.sched.advance(BOT_RECEIPT_MS + 1);
  assert.equal(h.m._botActive.executor, 'p_1');
  h.sched.advance(BOT_RECEIPT_MS + 1);
  assert.ok(ps.bandId || h.m.draft?.picks[ps.playerId], 'the seat has a band');
  h.m.dispose();
});

test('a refused pick: the rule\'s own pick, and only that seat\'s turn is touched', () => {
  const h = atPrep({ picks: false });
  assert.ok(h.run(() => h.m._botActive?.entry.pick === 'band', { maxSteps: 3e6 }));
  const active = h.m._botActive;
  const { ps } = active.entry;
  send(h, 'p_0', { t: 'b.botMoves', taskId: active.task.id, batch: 'final', moves: [{ t: 'g.band', bandId: 'band_nope' }] });
  assert.ok(h.m.draft?.picks[ps.playerId] || ps.bandId);
  h.m.dispose();
});

test('a pick for a turn that ended is dropped, and a late answer changes nothing', () => {
  const h = atPrep({ picks: false });
  assert.ok(h.run(() => h.m._botActive?.entry.pick === 'band', { maxSteps: 3e6 }));
  const active = h.m._botActive;
  const frame = h.lastTo('p_0', 'b.botTask');
  const { ps } = active.entry;
  h.m._applyBand(ps, h.m.timeoutBand(ps.playerId));
  const band = h.m.draft?.picks[ps.playerId];
  if (h.m._botActive === active) h.m.cancelBotTasks();
  send(h, 'p_0', { t: 'b.botMoves', taskId: frame.taskId, batch: 'final', moves: [{ t: 'g.band', bandId: 'band_bldsk' }] });
  assert.equal(h.m.draft?.picks[ps.playerId], band);
  h.m.dispose();
});

test('a card pick is a task: one g.choice from the browser', { timeout: 60000 }, () => {
  const h = atPrep({ autoplay: true });
  answering(h);
  assert.ok(h.run(() => pickFrames(h, 'p_0').some((m) => m.world.pick === 'card') || h.ended != null || h.m.round > 12, { maxSteps: 1e7 }));
  const frame = pickFrames(h, 'p_0').find((m) => m.world.pick === 'card');
  assert.ok(frame, `a card draft by round ${h.m.round}`);
  const pick = playPick(frame);
  assert.deepEqual(Object.keys(pick.moves[0]).sort(), ['idx', 't']);
  assert.equal(pick.moves[0].t, 'g.choice');
  h.m.dispose();
});

test('the guard: in host mode a strategy\'s decision hooks throw on the server, and a whole game never trips them', { timeout: 120000 }, () => {
  const seats = [human(0), bot(1), bot(2), bot(3)];
  const add = simMeter.add;
  let inHost = false;
  let onServer = 0;
  simMeter.add = function metered(kind, ms) {
    if (!inHost && ['prep', 'rehearsal', 'headless'].includes(kind)) onServer++;
    return add.call(this, kind, ms);
  };
  const around = (fn) => { inHost = true; try { return fn(); } finally { inHost = false; } };
  try {
    const h = atPrep({ seats, seed: 9, autoplay: true, clientCombat: true, botBattles: 'host', botTaskLayouts: 2 });
    const ps = h.ps('ai_1');
    for (const hook of ['pickBand', 'pickCard', 'prepBegin', 'prepEnd']) assert.throws(() => h.m.botFor(ps)[hook](h.m, ps), /bot code on the server/);
    assert.equal(typeof h.m.botFor(ps).id, 'string');
    answering(h, { around });
    attachFakeBattleHost(h, { ds: new DataSource(DATA, null), BattleClass: FakeBattle, around });
    h.run(() => h.ended != null || h.m.round > 10, { maxSteps: 2e7 });
    assert.ok(h.m.round > 8 || h.ended);
    assert.deepEqual(h.logs.error, []);
    assert.equal(onServer, 0, 'no bot simulation on the server');
    assert.ok(h.m.botTaskStats.sent > 20);
    assert.equal(h.m.botTaskStats.errors, 0);
    h.m.dispose();
  } finally {
    simMeter.add = add;
  }
});

test('an AI seat a human takes, or autoplay turned off: its task is cancelled and the queue moves on', () => {
  const h = atPrep();
  const active = toFirstTask(h);
  const frame = h.lastTo('p_0', 'b.botTask');
  h.m.cancelSeatRehearsal(active.entry.ps.playerId);
  assert.notEqual(h.m._botActive, active);
  assert.ok(h.allTo('p_0', 'b.botCancel').some((m) => m.taskId === frame.taskId));
  h.m.dispose();
  const auto = atPrep({ autoplay: true });
  const task = toFirstTask(auto);
  const human0 = [...auto.m.players.values()].find((p) => !p.isBot);
  auto.m.cancelBotTasks(human0.playerId);
  assert.equal(auto.m._botActive === task, task.entry.ps !== human0);
  auto.m.dispose();
});

test('the first executor is told early, once; a room without bots or with bots off is not', () => {
  const h = atPrep();
  assert.equal(h.allTo('p_0', 'b.botWarm').length, 1);
  assert.equal(h.allTo('p_1', 'b.botWarm').length, 0);
  h.m.dispose();
  const none = atPrep({ seats: [human(0), human(1)] });
  assert.equal(none.allTo('p_0', 'b.botWarm').length, 0);
  none.m.dispose();
  const off = makeMatch({ mode: 'coop', seats: SEATS, seed: 3, fake: true }).start();
  assert.equal(off.allTo('p_0', 'b.botWarm').length, 0);
  off.m.dispose();
});

test('the match host\'s child learns who the host is only when bots run in a browser, and follows a new host', () => {
  const base = { roomCode: 'R', seed: 1, hostId: 'p_0' };
  assert.equal('hostId' in wireOptions(base), false, 'every other worker payload stays as it was');
  assert.equal('botExecution' in wireOptions(base), false);
  const hosted = wireOptions({ ...base, botExecution: 'host', botBattles: 'host' });
  assert.deepEqual([hosted.hostId, hosted.botExecution, hosted.botBattles], ['p_0', 'host', 'host']);
  assert.equal(wireOptions({ ...base, botBattles: 'host' }).hostId, 'p_0');
  const notified = [];
  const proxyLike = (opts) => Object.assign(Object.create(MatchProxy.prototype), { opts, _notify: (...a) => notified.push(a) });
  proxyLike({ test: false }).setHost('p_1');
  assert.deepEqual(notified, []);
  const live = proxyLike({ botExecution: 'host' });
  live.setHost('p_1');
  assert.deepEqual(notified, [['setHost', ['p_1']]]);
  assert.equal(live.opts.hostId, 'p_1');
});

test('stale measure: a human refreshes against the shared pool in the gap of every bot task, the worst case', { timeout: 120000 }, () => {
  const h = atPrep({ seed: 17 });
  answering(h, { pid: 'p_0' });
  // p_1 refreshes each time a bot's snapshot goes out, before the answer comes back; both humans ready when bots are done
  let refreshes = 0;
  h.onSend.push((pid, msg) => {
    if (msg.t !== 'b.botTask' || pid !== 'p_0') return;
    const buyer = h.ps('p_1');
    buyer.funds += 10;
    if (!h.m.handle('p_1', { t: 'g.refresh' }).error) refreshes++;
  });
  h.onSend.push((pid, msg) => {
    if (msg.t === 'b.botAck' || msg.t === 'b.botCancel') h.m.later(1, () => { if (!h.m._botActive && h.m.phase === 'PREP') for (const id of ['p_0', 'p_1']) h.ps(id).setReady(true); });
  });
  h.run(() => h.ended != null || h.m.round > 6, { maxSteps: 3e6 });
  const s = { ...h.m.botTaskStats };
  console.log(`stale measure, worst case: ${JSON.stringify(s)}, human refreshes ${refreshes}, rounds ${h.m.round}`);
  assert.ok(s.sent > 0);
  assert.ok(refreshes > 0);
  assert.equal(s.failovers, 0);
  assert.equal(s.errors, 0);
  h.m.dispose();
});
