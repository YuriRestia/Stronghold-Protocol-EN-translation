// E2E harness controls: end the current timed phase now, hold / release a running battle. Browser tests on the real
// server (startRealServer({ fast }) → test/e2e/fastServer.mjs) use them so a check during a battle gets a guaranteed
// window at a fast combat speed, and a phase whose checks are done does not wait out its timer.
//
// Only test/e2e/fastServer.mjs installs them (harnessMatchClass around its FastMatch) and only that process answers
// them, over its Node IPC channel from the test process (startRealServer's srv.endPhase / srv.hold / srv.release).
// Nothing here is reachable from a socket: the production entry (server/index.js) neither loads this file nor listens
// for these messages, and a match of server/match/Match.js has none of these methods (test/match/harness-control.test.js).
//
// No shortcut around game logic:
//   * end phase: the phase deadline's own callback, run through the match's scheduler (later(0)) exactly as the expired
//     timer would run it. Refused when no deadline is armed (an untimed phase, or a battle: its end is the fields').
//   * hold: the solo pause's freeze (Match._freezeBattle: field clocks, result deadlines, server release timers, the
//     boss clock) published as m.public.hold, so the pages' battle runners stop their local clocks without the 暂停中
//     plate. release: the pause's own resume (every clock and deadline moves on by the held time). The battle phase
//     ending drops a hold like a pause.

/** The IPC message tag of a harness command (test process → fastServer.mjs) and of its answer. */
export const HARNESS_MSG = 'sp-harness';
export const HARNESS_CMDS = Object.freeze(['endPhase', 'hold', 'release', 'state']);

/**
 * A Match subclass that remembers the callback of the phase deadline it armed, for endPhaseNow.
 * @template {new (...a: any[]) => any} T @param {T} Base @returns {T}
 */
export function harnessMatchClass(Base) {
  return class HarnessMatch extends Base {
    constructor(...args) {
      super(...args);
      if (!('_harnessPhaseFn' in this)) this._harnessPhaseFn = null;
    }

    setDeadline(seconds, fn, opts) {
      this._harnessPhaseFn = null;
      super.setDeadline(seconds, fn, opts);
      // armed only when the match set a phase timer (seconds > 0 with a callback; never in virtual-instant time)
      if (this._phaseTimer != null && typeof fn === 'function') this._harnessPhaseFn = fn;
    }
  };
}

const done = (m, extra = {}) => ({ ok: true, phase: m.phase, round: m.round, ...extra });
const refused = (code, m) => ({ ok: false, code, phase: m?.phase ?? null, round: m?.round ?? null });

/**
 * Expire the current phase deadline at once: its callback, run by the scheduler as the timer would. `phase`: only when
 * the match is still in that phase (a page that has not seen the next phase yet never ends the one after it).
 */
export function endPhaseNow(m, phase = null) {
  if (typeof m?.setDeadline !== 'function' || !('_harnessPhaseFn' in m)) return refused('NOT_HARNESS', m);
  if (phase != null && m.phase !== phase) return refused('WRONG_PHASE', m);
  const fn = m._harnessPhaseFn;
  if (m._phaseTimer == null || typeof fn !== 'function') return refused('NO_DEADLINE', m);
  const from = m.phase;
  m.cancel(m._phaseTimer);
  m._harnessPhaseFn = null;
  m.deadline = m.sched.now();
  m._phaseTimer = m.later(0, () => { m._phaseTimer = null; fn(); });
  return done(m, { from });
}

/** Freeze the running battle (the pause's freeze, published as m.public.hold). */
export function holdBattle(m) {
  if (typeof m?._freezeBattle !== 'function' || !('_harnessPhaseFn' in m)) return refused('NOT_HARNESS', m);
  if (m.paused) return refused(m.pauseQuiet ? 'HELD' : 'PAUSED', m);
  m.pauseQuiet = true;
  const r = m._freezeBattle();
  if (!r || !r.ok || !m.paused) { m.pauseQuiet = false; return refused(r?.error || 'NO_BATTLE', m); }
  return done(m, { held: true });
}

/** End a hold: every clock and deadline moves on by the held time (the pause's resume). */
export function releaseBattle(m) {
  if (typeof m?._resume !== 'function' || !('_harnessPhaseFn' in m)) return refused('NOT_HARNESS', m);
  if (!m.paused || !m.pauseQuiet) return refused('NOT_HELD', m);
  m._resume();
  return done(m, { held: false });
}

/**
 * Answer one IPC message in fastServer.mjs: `{ tag: HARNESS_MSG, id, cmd, room, phase? }` → `{ tag, id, ...result }`.
 * `room` is the room code (the match is the room's in-process match).
 */
export function handleHarnessMessage(lobby, msg) {
  if (!msg || msg.tag !== HARNESS_MSG) return null;
  const reply = (r) => ({ tag: HARNESS_MSG, id: msg.id, ...r });
  if (!HARNESS_CMDS.includes(msg.cmd)) return reply(refused('BAD_CMD', null));
  const m = lobby?.getRoom?.(String(msg.room || ''))?.match;
  if (!m) return reply(refused('NO_MATCH', null));
  if (msg.cmd === 'endPhase') return reply(endPhaseNow(m, typeof msg.phase === 'string' ? msg.phase : null));
  if (msg.cmd === 'hold') return reply(holdBattle(m));
  if (msg.cmd === 'release') return reply(releaseBattle(m));
  return reply(done(m, { held: !!(m.paused && m.pauseQuiet), deadline: m._phaseTimer != null }));
}
