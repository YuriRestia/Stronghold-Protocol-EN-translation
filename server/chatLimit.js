// server/chatLimit.js — (fork) the server's spam limits for one chat sender, shared by match chat (g.chat,
// server/match/chatWallet.js) and room chat (room.chat, server/lobby.js). The page is not trusted: it keeps to these
// limits by itself, and the server refuses whatever goes past them. Rules (docs/design/network.md "Chat limits"):
//   * a gap between lines (room ROOM_CHAT_GAP_MS, match CHAT_COOLDOWN_MS), with CHAT_COOLDOWN_GRACE_MS of jitter allowed;
//     a line inside the gap is dropped;
//   * at most CHAT_BURST_LINES lines in any CHAT_BURST_MS: the next one starts a pause of CHAT_PAUSE_STEPS_MS — 30 s,
//     then 60 s, then 120 s for repeat offences — and one step is forgiven per CHAT_PAUSE_FORGIVE_MS without a pause;
//   * a line equal to one of the sender's last CHAT_DUPLICATE_LINES within CHAT_DUPLICATE_MS (case and spacing aside)
//     is dropped, and still counts toward the burst;
//   * at most CHAT_LONG_LINES lines in any CHAT_LONG_MS (5 min): the next one starts a pause too, so a sender who keeps
//     just under the burst all day is held to a fraction of it (server cost, user 2026-11-11);
//   * every session of one network together: at most CHAT_NETWORK_LINES lines in any CHAT_BURST_MS (chatNetworkCheck);
//   * one budget for every chat line this process sends (chatBudgetTake): CHAT_BUDGET_BYTES_PER_S on the wire; over it a
//     line is dropped and the sender told the chat is busy — the hard ceiling of chat traffic, whatever the player count.
// A refused line gets no reply frame, so spam cannot make the server talk back; only the start of a pause is told to the
// sender (once). State is a few numbers per sender, bounded; nothing is written anywhere.

import {
  CHAT_BUDGET_BYTES_PER_S, CHAT_BURST_LINES, CHAT_BURST_MS, CHAT_COOLDOWN_GRACE_MS, CHAT_DUPLICATE_LINES, CHAT_DUPLICATE_MS,
  CHAT_FRAME_OVERHEAD, CHAT_LONG_LINES, CHAT_LONG_MS, CHAT_NETWORK_LINES, CHAT_PAUSE_FORGIVE_MS, CHAT_PAUSE_STEPS_MS,
} from '../shared/constants.js';

/** A fresh sender state. Kept on the lobby session (room chat: survives reconnects) or on the match's PlayerState. */
export const chatLimitState = () => ({ lastAt: -Infinity, triedAt: -Infinity, times: [], long: [], recent: [], strikes: 0, strikeAt: -Infinity, pausedUntil: 0 });

/**
 * The cheap gate, before a line is even cleaned (server cost: a flood of junk must not buy a filter run per frame): refused
 * while paused or inside the gap since the last *attempt* — a line that cleans down to nothing still counts.
 * @param {ReturnType<typeof chatLimitState>} st @param {number} now @param {{ gapMs: number }} opts @returns {boolean}
 */
export function chatLimitGate(st, now, { gapMs }) {
  if (now < st.pausedUntil) return false;
  if (now - (st.triedAt ?? -Infinity) < gapMs - CHAT_COOLDOWN_GRACE_MS) return false;
  st.triedAt = now;
  return true;
}

const fold = (text) => text.toLowerCase().replace(/\s+/g, '');

/**
 * May this (already cleaned, non-empty) line go out now? Records it when it may.
 * @param {ReturnType<typeof chatLimitState>} st @param {string} text @param {number} now ms
 * @param {{ gapMs: number }} opts
 * @returns {{ ok: true } | { ok: false, why: 'paused'|'gap'|'duplicate'|'burst', pausedUntil?: number, newPause?: boolean }}
 */
export function chatLimitCheck(st, text, now, { gapMs }) {
  if (now < st.pausedUntil) return { ok: false, why: 'paused', pausedUntil: st.pausedUntil };
  if (now - st.lastAt < gapMs - CHAT_COOLDOWN_GRACE_MS) return { ok: false, why: 'gap' };
  while (st.times.length && now - st.times[0] >= CHAT_BURST_MS) st.times.shift();
  if (!st.long) st.long = [];
  while (st.long.length && now - st.long[0] >= CHAT_LONG_MS) st.long.shift();
  if (st.times.length >= CHAT_BURST_LINES || st.long.length >= CHAT_LONG_LINES) {
    // forgive a step per quiet stretch since the last pause, then take the next step
    if (st.strikes > 0 && Number.isFinite(st.strikeAt)) {
      st.strikes = Math.max(0, st.strikes - Math.floor((now - st.strikeAt) / CHAT_PAUSE_FORGIVE_MS));
    }
    const step = CHAT_PAUSE_STEPS_MS[Math.min(st.strikes, CHAT_PAUSE_STEPS_MS.length - 1)];
    st.strikes = Math.min(st.strikes + 1, CHAT_PAUSE_STEPS_MS.length);
    st.strikeAt = now;
    st.pausedUntil = now + step;
    st.times.length = 0;
    const why = st.long.length >= CHAT_LONG_LINES ? 'long' : 'burst';
    if (why === 'long') st.long.length = 0;
    return { ok: false, why, pausedUntil: st.pausedUntil, newPause: true };
  }
  const key = fold(text);
  st.recent = st.recent.filter((r) => now - r.at < CHAT_DUPLICATE_MS);
  st.times.push(now);
  st.long.push(now);
  st.lastAt = now;
  if (st.recent.some((r) => r.key === key)) return { ok: false, why: 'duplicate' };
  st.recent.push({ key, at: now });
  if (st.recent.length > CHAT_DUPLICATE_LINES) st.recent.shift();
  return { ok: true };
}

/**
 * The per-network cap: every session of one network address together. `table` is the caller's Map (network key → recent
 * line times); entries empty out as their times age and are deleted then, so it stays as small as the active networks.
 * @param {Map<string, number[]>} table @param {string} key @param {number} now @returns {boolean} may it go out
 */
export function chatNetworkCheck(table, key, now) {
  if (!key) return true;
  const times = (table.get(key) || []).filter((t) => now - t < CHAT_BURST_MS);
  if (times.length >= CHAT_NETWORK_LINES) { table.set(key, times); return false; }
  times.push(now);
  table.set(key, times);
  return true;
}

/** Drop networks with no recent line (call now and then; the lobby does it on its sweep). */
export function chatNetworkSweep(table, now) {
  for (const [key, times] of table) if (!times.length || now - times[times.length - 1] >= CHAT_BURST_MS) table.delete(key);
}

// ---- the server-wide budget ---------------------------------------------------------------------------------------
// One token bucket for this process: CHAT_BUDGET_BYTES_PER_S (the operator's SP_CHAT_BUDGET_KBPS overrides it), holding at
// most two seconds' worth. Its state is two numbers.
const ENV_KBPS = Number(globalThis.process?.env?.SP_CHAT_BUDGET_KBPS);
let budgetRate = Number.isFinite(ENV_KBPS) && ENV_KBPS > 0 ? ENV_KBPS * 1024 : CHAT_BUDGET_BYTES_PER_S;
let budget = { tokens: budgetRate * 2, at: null };
/** Wire bytes of one line to `recipients` players: the frame's UTF-8 bytes plus CHAT_FRAME_OVERHEAD each. */
export const chatWireBytes = (frameBytes, recipients) => Math.max(0, recipients) * (frameBytes + CHAT_FRAME_OVERHEAD);
/** UTF-8 bytes of an encoded frame, in Node and in browsers (the bot Worker loads this module too). */
const ENCODER = typeof TextEncoder === 'function' ? new TextEncoder() : null;
export const utf8Bytes = (s) => (ENCODER ? ENCODER.encode(s).length : String(s).length * 3);
/**
 * May a line that costs `bytes` on the wire go out now? Takes them from the budget when it may.
 * @param {number} bytes @param {number} now ms @returns {boolean}
 */
export function chatBudgetTake(bytes, now) {
  if (budget.at == null) budget.at = now;
  budget.tokens = Math.min(budgetRate * 2, budget.tokens + Math.max(0, now - budget.at) * budgetRate / 1000);
  budget.at = now;
  if (bytes > budget.tokens) return false;
  budget.tokens -= bytes;
  return true;
}
/** Tests: a fresh budget at `bytesPerS` (default the configured one). */
export function chatBudgetReset(bytesPerS = null) {
  if (bytesPerS != null) budgetRate = bytesPerS;
  budget = { tokens: budgetRate * 2, at: null };
}
