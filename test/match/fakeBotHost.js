// test/match/fakeBotHost.js — the executor of a bot seat's prep (Match opts.botExecutor) without a browser: the real bot
// code on the restored match, in this process, over JSON as the wire would carry it. See docs/host-browser-bots.md Part D.
import { getData } from '../../server/data.js';
import { GameData } from '../../server/match/gamedata.js';
import { getDefaultRegistry } from '../../server/match/effectsMeta.js';
import { getBotStrategy } from '../../server/match/botStrategies.js';
import { createBotRun } from '../../server/match/botRunner.js';
import { createBotBattleRun, createBotBossRun } from '../../server/match/botBattleRun.js';
import { DataSource } from '../../server/sim/simdata.js';
import { Battle } from '../../server/sim/Battle.js';

export const wire = (v) => JSON.parse(JSON.stringify(v));

/** The static side of the copy: what a Worker gets from the page and its own modules. */
export function nodeBotEnv({ data = getData({ log: { warn() {}, error() {}, info() {} } }), modeId, ...extra }) {
  return { data, gd: new GameData(data, modeId), ds: new DataSource(data, null), registry: getDefaultRegistry(), BattleClass: Battle,
    strategyOf: (id) => getBotStrategy(id), ...extra };
}

/**
 * @param {() => any} match the match it answers (known only after construction)
 * @param {any} env nodeBotEnv
 * @param {{ tamper?: (batch: any, world: any) => void }} [hooks]
 * @returns {any} the executor, with what it saw: tasks, acks, worlds, sizes, cancelled
 */
export function createFakeBotHost(match, env, { tamper = null } = {}) {
  const host = {
    tasks: [], acks: [], worlds: [], sizes: [], cancelled: [],
    cancel(id) { host.cancelled.push(id); },
    submit({ taskId, world }) {
      const text = JSON.stringify(world);
      host.sizes.push(text.length);
      const sent = JSON.parse(text);
      host.worlds.push(sent);
      host.tasks.push(taskId);
      const run = createBotRun(sent, env);
      const send = (batch, body) => {
        const out = wire({ batch, ...body });
        tamper?.(out, sent);
        const ack = match().receiveBotBatch(taskId, out);
        host.acks.push({ taskId, batch, ...ack });
        return ack;
      };
      if (sent.pick) { send('final', run.pick()); return; }
      const plan = send('plan', run.plan());
      if (plan.stale || plan.error) return;
      run.rehearse();
      send('final', run.finish());
    },
  };
  return host;
}

/**
 * Answers every b.botBattle frame the way a browser's Worker does, a moment after it arrives (docs/host-browser-bots.md B13).
 * @param {any} h a test/match/harness.js match
 * @param {{ ds: any, BattleClass?: any, around?: (fn: () => any) => any }} o `around` wraps the simulation (tests tell it from the server's own)
 * @returns {{ frames: number }}
 */
export function attachFakeBattleHost(h, { ds, BattleClass, around = (fn) => fn() }) {
  const host = { frames: 0, live: new Map(), reports: 0, mute: null };
  /** A boss field on the field's clock, reporting at 4 Hz, as botWorker.js does. */
  const startLive = (pid, msg, spec) => {
    const run = around(() => createBotBossRun(spec, { ds, BattleClass, battleId: msg.battleId, now: () => 0 }));
    const job = { run, pid, t0: h.m.sched.now(), elapsed: msg.live.elapsed, speed: msg.live.speed, fieldId: spec.fieldId };
    host.live.set(msg.battleId, job);
    const finish = () => {
      host.live.delete(msg.battleId);
      h.m.handle(pid, wire({ t: 'b.progress', ...run.progress() }));
      h.m.handle(pid, wire({ t: 'b.result', battleId: msg.battleId, result: run.result() }));
    };
    job.finish = finish;
    const tick = () => {
      if (host.live.get(msg.battleId) !== job || h.m.disposed) return;
      if (host.mute?.(pid, msg.battleId)) return;
      around(() => run.stepTo((job.elapsed + (h.m.sched.now() - job.t0) / 1000) * job.speed));
      if (run.finished) { finish(); return; }
      host.reports++;
      h.m.handle(pid, wire({ t: 'b.progress', ...run.progress() }));
      h.m.later(250, tick);
    };
    h.m.later(1, tick);
  };
  host.onLive = (msg) => {
    if (msg.t === 'b.pool') { for (const job of host.live.values()) job.run.syncPool(msg.hp, msg.acked ? msg.acked[job.fieldId] : undefined); return; }
    const job = host.live.get(msg.battleId);
    if (!job) return;
    if (msg.t === 'b.botBattleCancel' || msg.reason === 'takeover') { host.live.delete(msg.battleId); return; }
    around(() => job.run.forceEnd(msg.reason));
    h.m.later(0, () => { if (host.live.get(msg.battleId) === job) job.finish(); });
  };
  h.onBroadcast.push((msg) => { if (msg.t === 'b.pool') host.onLive(msg); });
  h.onSend.push((pid, msg) => {
    if (msg.t === 'b.pool' || msg.t === 'b.end' || msg.t === 'b.botBattleCancel') { host.onLive?.(msg); return; }
    if (msg.t !== 'b.botBattle') return;
    host.frames++;
    const spec = wire(msg.spec);
    if (msg.live) { startLive(pid, msg, spec); return; }
    h.m.later(1, () => {
      const body = around(() => {
        const run = createBotBattleRun(spec, { ds, BattleClass });
        run.run();
        return run.output();
      });
      h.m.handle(pid, wire({ t: 'b.botBattleResult', battleId: msg.battleId, ...body }));
    });
  });
  return host;
}
