// ui/damageLog.js — the local player's damage per operator, round by round, for the damage chart (ui/damageChart.js)
// and the result screen's match chart (screens/result.js).
//
// The battle of a round runs in this client (battle/runner.js, client combat), and every unit counts its own damage
// (server/sim/damage.js `stats.dmg`): the log reads it (runner.damageUnits) a few times a second while a round's battle
// is kept — combat and the SETTLE after it — and writes the round's bars through, so the last reading before the runner
// drops the battle (the next prep) is the round's result. Nothing goes over the network. A page reload starts empty;
// a new match (its briefing) clears it.
//
//   damageLog.get() → { round: number|null /* the round being fought, null in prep */, history: { [round]: DamageRow[] } }
//   damageLog.subscribe(fn) → off

import { PHASE } from '../../../shared/constants.js';
import { groupDamage, sameRows, historyRounds } from './gameLogic/damage.js';
import { battleRunner } from '../battle/runner.js';
import { store as appStore } from '../store.js';

const LIVE_PHASES = new Set([PHASE.COMBAT, PHASE.UNITE, PHASE.FINAL_ASSAULT, PHASE.HIDDEN_CORE]);
const NEW_MATCH_PHASES = new Set([PHASE.LOBBY, PHASE.INFO_CHECK, PHASE.BAND_DRAFT, PHASE.BATTLE_CHECK]);
export const DAMAGE_POLL_MS = 250;

/**
 * @param {{ runner: any, store: any, setIv?: Function, clearIv?: Function, pollMs?: number }} deps
 */
export function createDamageLog({ runner, store, setIv = setInterval, clearIv = clearInterval, pollMs = DAMAGE_POLL_MS }) {
  let history = {};
  let round = null;      // the round whose battle is being read (combat, then its SETTLE)
  let myId = null;
  let ivH = null;
  let snap = { round: null, history };
  const listeners = new Set();

  const notify = () => {
    snap = { round, history };
    for (const fn of listeners) { try { fn(snap); } catch { /* a listener's own error */ } }
  };

  function poll() {
    if (round == null || !runner || !myId) return;
    const units = runner.damageUnits(myId);
    // no battle kept (not started yet, or already dropped): the round keeps its last reading
    if (!units) return;
    const rows = groupDamage(units);
    if (sameRows(rows, history[round])) return;
    history = { ...history, [round]: rows };
    notify();
  }

  const stop = () => { if (ivH != null) { clearIv(ivH); ivH = null; } };
  const start = () => { if (ivH == null) ivH = setIv(poll, pollMs); };

  function reset() {
    stop();
    round = null;
    if (historyRounds(history).length) { history = {}; notify(); }
  }

  function onState(s) {
    const pub = s?.match?.public || null;
    const phase = pub ? pub.phase : null;
    const id = s?.me?.playerId || null;
    if (id !== myId) { if (myId) reset(); myId = id; }
    if (phase && NEW_MATCH_PHASES.has(phase)) { reset(); return; }
    if (phase && LIVE_PHASES.has(phase) && Number.isInteger(pub.round)) {
      // a rejoined new match that skipped its briefing: an earlier round than the log already holds
      if (round == null && historyRounds(history).some((r) => r > pub.round)) reset();
      if (round !== pub.round) { round = pub.round; notify(); }
      start();
      return;
    }
    if (phase === PHASE.SETTLE && round != null) { poll(); return; }
    // prep / result / no match: the round is over (its last reading stays)
    if (round != null) { poll(); stop(); round = null; notify(); }
  }

  const offs = [];
  if (store && typeof store.subscribe === 'function') {
    offs.push(store.subscribe(onState));
    if (typeof store.get === 'function') onState(store.get());
  }
  // a battle that ends between two readings: read its final numbers at once
  if (runner && typeof runner.on === 'function') offs.push(runner.on('result', () => poll()));

  return {
    get: () => snap,
    subscribe(fn) {
      if (typeof fn !== 'function') return () => {};
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** Test hooks. */
    poll, reset,
    dispose() { stop(); for (const off of offs) { try { off?.(); } catch { /* ignore */ } } listeners.clear(); },
  };
}

/** The browser log (null in Node, like battleRunner). */
export const damageLog = battleRunner ? createDamageLog({ runner: battleRunner, store: appStore }) : null;
