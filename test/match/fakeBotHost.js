// test/match/fakeBotHost.js — the executor of a bot seat's prep (Match opts.botExecutor) without a browser: the real bot
// code on the restored match, in this process, over JSON as the wire would carry it. See docs/host-browser-bots.md Part D.
import { getData } from '../../server/data.js';
import { GameData } from '../../server/match/gamedata.js';
import { getDefaultRegistry } from '../../server/match/effectsMeta.js';
import { getBotStrategy } from '../../server/match/botStrategies.js';
import { createBotRun } from '../../server/match/botRunner.js';
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
      const plan = send('plan', run.plan());
      if (plan.stale || plan.error) return;
      run.rehearse();
      send('final', run.finish());
    },
  };
  return host;
}
