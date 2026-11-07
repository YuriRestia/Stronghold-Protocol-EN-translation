// server/match/botWorkerEnv.js — (fork) the static side of a bot seat's prep in a browser Worker (docs/host-browser-bots.md
// Part B5): the page's game data as the restored match reads it, one GameData per mode. It is also the root of what
// server/http/botModules.js serves under /match/: everything the Worker needs is imported from here.
//
// Runs in Node and in a browser Worker: no Node APIs.

import { createBotRun } from './botRunner.js';
import { createBotBattleRun, createBotBossRun } from './botBattleRun.js';
import { builtinBotStrategy } from './botStrategyList.js';
import { getDefaultRegistry } from './effectsMeta.js';
import { GameData } from './gamedata.js';
import { Battle } from '../sim/Battle.js';
import { DataSource } from '../sim/simdata.js';

export { createBotBattleRun, createBotBossRun, createBotRun };

/**
 * @param {any} data the game data (the Worker: the page's /data/*.json as it loaded them)
 * @returns {{ ds: any, envFor: (modeId: string) => any }}
 */
export function createBotWorkerEnv(data) {
  const ds = new DataSource(data, null);
  const registry = getDefaultRegistry();
  /** @type {Map<string, any>} */
  const gds = new Map();
  return {
    ds,
    envFor(modeId) {
      if (!gds.has(modeId)) gds.set(modeId, new GameData(data, modeId));
      return { data, gd: gds.get(modeId), ds, registry, BattleClass: Battle, strategyOf: builtinBotStrategy };
    },
  };
}
