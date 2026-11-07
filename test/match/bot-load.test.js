// test/match/bot-load.test.js — (fork) the server load test of piece 9 (docs/host-browser-bots.md Part D): rooms of 1 human and
// 3 bots played to round ROUNDS, with fake hosts doing the browsers' work in this process. The fake hosts' time is measured and
// taken out, so what is left is the server's own work: snapshots, encoding them, applying moves, the match itself. The same rooms
// then run with bots on the server, as a baseline. The target is about 5 ms per seat, per prep. Times are CPU time, not wall time,
// so other work on the machine does not move them. No rehearsals on either side and fake battles: that work is the browser's in
// host mode, so the baseline here is the low end of what bots cost a server. Both sides include this harness's own frame checks.
// Rooms run one after another, since the number wanted is CPU per seat; more rooms only narrow it.
//   SP_BOT_LOAD=1 [SP_BOT_LOAD_ROOMS=10] [SP_BOT_LOAD_ROUNDS=12] [SP_BOT_LOAD_LOG=file] node --test test/match/bot-load.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createBotRun, createBotWorkerEnv } from '../../server/match/botWorkerEnv.js';
import { DataSource } from '../../server/sim/simdata.js';
import { attachFakeBattleHost, wire } from './fakeBotHost.js';
import { FakeBattle } from './fakeBattle.js';
import { DATA, makeMatch } from './harness.js';

const enabled = process.env.SP_BOT_LOAD === '1';
const ROOMS = Number(process.env.SP_BOT_LOAD_ROOMS) || 10;
const ROUNDS = Number(process.env.SP_BOT_LOAD_ROUNDS) || 12;
const human = { seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true };
const SEATS = [human, ...[1, 2, 3].map((seat) => ({ seat, playerId: `ai_${seat}`, name: `A${seat}`, isBot: true, connected: true }))];
const ENV = createBotWorkerEnv(DATA);
const DS = new DataSource(DATA, null);

const cpuMs = () => { const { user, system } = process.cpuUsage(); return (user + system) / 1000; };

/** One room's game. `clock.host` collects the time the fake browser took. */
function room(seed, hosted, clock) {
  const around = (fn) => { const t0 = cpuMs(); try { return fn(); } finally { clock.host += cpuMs() - t0; } };
  const h = makeMatch({ mode: 'coop', difficulty: 'NORMAL', seats: SEATS, seed, fake: true, clientCombat: true, hostId: 'p_0', captureFrames: false,
    botRehearsal: hosted ? 0 : Number(process.env.SP_BOT_LOAD_LOCAL_LAYOUTS ?? 0),
    ...(hosted ? { botExecution: 'host', botBattles: 'host', botTaskLayouts: 0 } : {}) });
  if (hosted) {
    // where the server's time goes: the snapshot and its send, then applying the moves
    const timed = (name, key) => {
      const real = h.m[name];
      h.m[name] = function measured(...args) {
        const t0 = cpuMs();
        const host0 = clock.host;
        try { return real.apply(this, args); } finally { clock[key] += cpuMs() - t0 - (clock.host - host0); }
      };
    };
    timed('_submitBotTask', 'snapshot');
    timed('receiveBotBatch', 'apply');
    const runs = new Map();
    h.onSend.push((pid, msg) => {
      // what a real send pays for; the socket's own compression is not counted
      if (msg.t === 'b.botTask' || msg.t === 'b.botBattle') {
        const t0 = cpuMs();
        clock.bytes += JSON.stringify(msg).length;
        clock.encode += cpuMs() - t0;
      }
      if (msg.t === 'b.botTask') {
        clock.tasks += msg.world.pick ? 0 : 1;
        const copy = around(() => wire(msg.world));
        h.m.later(1, () => {
          h.m.handle(pid, { t: 'b.botReceived', taskId: msg.taskId });
          if (copy.pick) {
            const body = around(() => wire(createBotRun(copy, ENV.envFor(copy.match.modeId)).pick()));
            h.m.handle(pid, { t: 'b.botMoves', taskId: msg.taskId, batch: 'final', ...body });
            return;
          }
          const run = around(() => createBotRun(copy, ENV.envFor(copy.match.modeId)));
          const plan = around(() => wire(run.plan()));
          runs.set(msg.taskId, run);
          h.m.handle(pid, { t: 'b.botMoves', taskId: msg.taskId, batch: 'plan', ...plan });
        });
      } else if (msg.t === 'b.botAck' && !msg.stale && runs.has(msg.taskId)) {
        const run = runs.get(msg.taskId);
        runs.delete(msg.taskId);
        h.m.later(1, () => {
          const body = around(() => { run.rehearse(); return wire(run.finish()); });
          h.m.handle(pid, { t: 'b.botMoves', taskId: msg.taskId, batch: 'final', ...body });
        });
      }
    });
    attachFakeBattleHost(h, { ds: DS, BattleClass: FakeBattle, around });
  }
  h.autoHumans().start();
  // the human's own battle is the human's browser: this harness's scripted client is not the server's work either
  h.run(() => h.ended != null || h.m.round > ROUNDS, { maxSteps: 2e7 });
  const stats = { ...h.m.botTaskStats };
  const rounds = h.m.round;
  h.m.dispose();
  return { stats, rounds };
}

function measure(hosted) {
  const clock = { host: 0, tasks: 0, bytes: 0, snapshot: 0, apply: 0, encode: 0 };
  const t0 = cpuMs();
  let rounds = 0;
  let stale = 0;
  for (let i = 0; i < ROOMS; i++) {
    const r = room(7000 + i, hosted, clock);
    // a file, since the runner holds a test's output until the file ends
    if (process.env.SP_BOT_LOAD_LOG) fs.appendFileSync(process.env.SP_BOT_LOAD_LOG, `${hosted ? 'hosted' : 'local'} room ${i}: ${Math.round(cpuMs() - t0)} ms CPU, host ${Math.round(clock.host)} ms, tasks ${clock.tasks}, round ${r.rounds}\n`);
    rounds += r.rounds;
    stale += r.stats.stale;
  }
  const wall = cpuMs() - t0;
  return { wall, host: clock.host, server: wall - clock.host, tasks: clock.tasks, bytes: clock.bytes, rounds, stale, snapshot: clock.snapshot, apply: clock.apply, encode: clock.encode };
}

test('server load: the server\'s own CPU per bot seat, per prep', { skip: !enabled && 'set SP_BOT_LOAD=1', timeout: 840000 }, () => {
  // hosted first and printed at once: a run that hits its time limit still leaves the number this test exists for
  const hosted = measure(true);
  const seatsPreps = hosted.tasks;
  console.log(`load, hosted: ${JSON.stringify({ rooms: ROOMS, serverMsPerSeatPrep: +(hosted.server / seatsPreps).toFixed(2), seatPreps: seatsPreps, cpuSeconds: Math.round(hosted.wall / 1000) })}`);
  const local = measure(false);
  const report = {
    rooms: ROOMS, roundsEach: ROUNDS,
    hosted: { serverMsPerSeatPrep: +(hosted.server / seatsPreps).toFixed(2), browserMsPerSeatPrep: +(hosted.host / seatsPreps).toFixed(2), kbPerSeatPrep: +(hosted.bytes / 1024 / seatsPreps).toFixed(1),
      snapshotAndSendMs: +(hosted.snapshot / seatsPreps).toFixed(2), encodeMs: +(hosted.encode / seatsPreps).toFixed(2), applyMovesMs: +(hosted.apply / seatsPreps).toFixed(2), staleTasks: hosted.stale, tasks: seatsPreps },
    localBaseline: { msPerSeatPrep: +(local.wall / seatsPreps).toFixed(2), note: 'bots on the server, 0 layouts: the same rooms, the whole match' },
  };
  console.log(`load report: ${JSON.stringify(report)}`);
  assert.ok(seatsPreps > ROOMS, `${seatsPreps} seat preps`);
});
