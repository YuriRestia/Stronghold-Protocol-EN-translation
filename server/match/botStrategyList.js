// server/match/botStrategyList.js — (fork) the built-in bot strategies, without the LLM gate's Node imports: what a browser
// Worker may load (docs/host-browser-bots.md). botStrategies.js adds the external host and the selection rules on top.
import { createBotRegistry } from './botStrategyContract.js';
import { ADAPTIVE_BOT, IOLETA_ADAPTIVE_BOT } from './botAdaptive.js';
import { IOLETA_BOT } from './botIoleta.js';

export const BUILTIN_BOTS = Object.freeze([IOLETA_BOT, ADAPTIVE_BOT, IOLETA_ADAPTIVE_BOT]);

const BUILTIN_REGISTRY = createBotRegistry([...BUILTIN_BOTS]);

/**
 * A strategy by id for a seat played in a browser. The external host never runs there: like a release build, that id plays the
 * original bot. An id this code does not know throws, and the task is answered as failed.
 * @param {string} id
 */
export function builtinBotStrategy(id) {
  const key = !id || id === 'external' ? 'legacy' : id;
  if (!Object.hasOwn(BUILTIN_REGISTRY, key)) throw new Error(`Unknown bot strategy: ${String(id)}`);
  return BUILTIN_REGISTRY[key];
}
