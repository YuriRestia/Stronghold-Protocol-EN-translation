// server/match/botBattleRun.js — (fork) one bot field's real battle, played to its end off the server
// (docs/host-browser-bots.md Part B13). Used by the host's Worker and, in Node, by the tests' fake host.
//
// Runs in Node and in a browser Worker: no Node APIs.

import { compactResult, createBattleFromSpec } from '../sim/spec.js';
import { HeadlessJob } from './fields.js';

/** Samples of the progress timeline an answer carries (the wire's own limit is shared/protocol.js BOT_TIMELINE_MAX). */
const TIMELINE_KEEP = 300;

/** Thin a long timeline evenly, always keeping its last sample (timelineAt reads it by binary search, so order stays). */
function thin(timeline) {
  if (timeline.length <= TIMELINE_KEEP) return timeline;
  const step = timeline.length / (TIMELINE_KEEP - 1);
  const out = [];
  for (let i = 0; i < TIMELINE_KEEP - 1; i++) out.push(timeline[Math.floor(i * step)]);
  out.push(timeline[timeline.length - 1]);
  return out;
}

/**
 * @param {any} spec the field's BattleSpec
 * @param {{ ds: any, BattleClass?: any }} env
 * @returns {{ run: (budgetMs?: number) => boolean, output: () => { result: any, timeline: any[] } }} `run` is true once the
 *   battle ended and false when `budgetMs` ran out; `output` is the b.botBattleResult body
 */
export function createBotBattleRun(spec, { ds, BattleClass }) {
  const battle = createBattleFromSpec(spec, ds, { ...(BattleClass ? { BattleClass } : {}), quiet: true, recordEvents: false });
  const job = new HeadlessJob(battle, { players: (spec.players || []).map((p) => p.playerId) });
  return {
    run: (budgetMs = Infinity) => job.run(budgetMs),
    output() {
      const out = job.output();
      return { result: compactResult(out.result), timeline: thin(out.timeline) };
    },
  };
}
