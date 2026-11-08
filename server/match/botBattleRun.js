// server/match/botBattleRun.js — (fork) one bot field's real battle, played to its end off the server
// (docs/host-browser-bots.md Part B13). Used by the host's Worker and, in Node, by the tests' fake host.
//
// Runs in Node and in a browser Worker: no Node APIs.

import { TICK } from '../sim/constants.js';
import { attachLpMeter, battleProgress, compactResult, createBattleFromSpec, fitResult } from '../sim/spec.js';
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

/** Ticks between two looks at the clock while a boss field steps. */
const BOSS_CHECK_TICKS = 16;

/**
 * One bot-only boss field, played live: its pool is shared with the other fields, so it runs on the field's clock and reports
 * as a human's browser does (b.progress at 4 Hz, then b.result; public/js/battle/runner.js). Runs in Node and in a Worker.
 * @param {any} spec the field's BattleSpec
 * @param {{ ds: any, BattleClass?: any, battleId: string, now?: () => number }} env
 */
export function createBotBossRun(spec, { ds, BattleClass, battleId, now = () => performance.now() }) {
  const battle = createBattleFromSpec(spec, ds, { ...(BattleClass ? { BattleClass } : {}), quiet: true, recordEvents: false });
  const meter = attachLpMeter(battle);
  return {
    get finished() { return !!battle.finished; },
    /**
     * Step towards game time `gt`, for at most `budgetMs` (a late start catches up over several calls).
     * @returns {boolean} the battle has ended
     */
    stepTo(gt, budgetMs = Infinity) {
      const target = Math.floor(gt / TICK);
      const t0 = now();
      for (let n = 0; !battle.finished && (battle.tickCount || 0) < target; n++) {
        battle.step();
        if (n % BOSS_CHECK_TICKS === BOSS_CHECK_TICKS - 1 && now() - t0 >= budgetMs) break;
      }
      return !!battle.finished;
    },
    /** The b.progress body, as the page's runner writes it for a boss field. */
    progress() {
      const p = battleProgress(battle);
      const pool = battle.sharedBoss;
      const msg = { battleId, gt: Math.min(1e5, p.gt), killed: Math.min(p.killed, p.total), total: Math.min(1e5, p.total), done: !!p.done,
        leaks: Math.min(1e6, meter.lp), bossDmg: pool && Number.isFinite(pool.cum) ? pool.cum : 0 };
      if (Number.isFinite(p.resolved)) msg.resolved = Math.max(0, Math.min(msg.total, p.resolved));
      if (p.leaksBy) msg.leaksBy = p.leaksBy;
      if (pool?.byPlayer) msg.by = Object.fromEntries(Object.entries(pool.byPlayer).slice(0, 4));
      return msg;
    },
    syncPool(hp, acked) { battle.sharedBoss?.sync?.(hp, acked); },
    forceEnd(reason) { if (!battle.finished) battle.forceEnd(reason === 'timeout' ? 'timeout' : 'forced'); },
    /** The b.result's `result`. */
    result: () => fitResult(compactResult(battle.result()), { bossLike: true, battleId }),
  };
}
