// server/match/chatLimit.js — (fork) the server's spam limits for one chat sender, shared by match chat (g.chat,
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
//   * one budget for every chat line this process sends (chatBudgetTake): CHAT_BUDGET_BYTES_PER_S on the wire, with a
//     slice only match chat may use and a fair share per room; over it a line is dropped and the sender told the chat is
//     busy — the hard ceiling of chat traffic, whatever the player count.
// A refused line gets no reply frame, so spam cannot make the server talk back; only the start of a pause is told to the
// sender (once). State is a few numbers per sender, bounded; nothing is written anywhere.

import {
  CHAT_BUDGET_BYTES_PER_S, CHAT_BURST_LINES, CHAT_BURST_MS, CHAT_COOLDOWN_GRACE_MS, CHAT_DUPLICATE_LINES, CHAT_DUPLICATE_MS,
  CHAT_FRAME_OVERHEAD, CHAT_LONG_LINES, CHAT_LONG_MS, CHAT_MATCH_RESERVE, CHAT_NETWORK_LINES, CHAT_PAUSE_FORGIVE_MS,
  CHAT_PAUSE_STEPS_MS, CHAT_ROOM_SHARE,
} from '../../shared/constants.js';

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
// One ceiling for this process: CHAT_BUDGET_BYTES_PER_S (the operator's SP_CHAT_BUDGET_KBPS overrides it), split into two
// token buckets, each two seconds deep (user, 2026-11-11, "per room fair share & match reserve"):
//   * the match reserve, CHAT_MATCH_RESERVE of the ceiling (SP_CHAT_MATCH_RESERVE): only match chat draws from it (first),
//     so lobby or room spam never blocks in-game chat;
//   * the shared pool, the rest: room chat, and match chat once its reserve is spent.
// On top, each room has its own bucket of CHAT_ROOM_SHARE of the ceiling (SP_CHAT_ROOM_SHARE), so one spamming room only
// silences itself (room chat is keyed by the room code, match chat by "match:" + its room code). A full room bucket lets
// one line through even when it is bigger than the bucket (a heavily watched match), and the room then waits out the
// debt. Idle room buckets are full again after two seconds and are forgotten on a sweep, so the table stays as small as
// the rooms chatting right now.
const ENV = globalThis.process?.env ?? {};
const envNum = (name, def, ok) => {
  const raw = ENV[name];
  const v = Number(raw);
  return raw != null && raw !== '' && Number.isFinite(v) && ok(v) ? v : def;
};
const CONF_RATE = envNum('SP_CHAT_BUDGET_KBPS', CHAT_BUDGET_BYTES_PER_S / 1024, (v) => v > 0) * 1024;
const CONF_SHARE = envNum('SP_CHAT_ROOM_SHARE', CHAT_ROOM_SHARE, (v) => v > 0 && v <= 1);
const CONF_RESERVE = envNum('SP_CHAT_MATCH_RESERVE', CHAT_MATCH_RESERVE, (v) => v >= 0 && v < 1);
let budgetRate = CONF_RATE;
let roomShare = CONF_SHARE;
let matchReserve = CONF_RESERVE;
const bucket = (rate) => ({ rate, tokens: rate * 2, at: null });
const fill = (b, now) => {
  if (b.at == null) b.at = now;
  b.tokens = Math.min(b.rate * 2, b.tokens + Math.max(0, now - b.at) * b.rate / 1000);
  b.at = now;
};
let shared = bucket(budgetRate * (1 - matchReserve));
let reserve = bucket(budgetRate * matchReserve);
/** @type {Map<string, ReturnType<typeof bucket>>} room key → its fair-share bucket */
const rooms = new Map();
let sweptAt = -Infinity;
const SWEEP_MS = 10_000;
/** Wire bytes of one line to `recipients` players: the frame's UTF-8 bytes plus CHAT_FRAME_OVERHEAD each. */
export const chatWireBytes = (frameBytes, recipients) => Math.max(0, recipients) * (frameBytes + CHAT_FRAME_OVERHEAD);
/** UTF-8 bytes of an encoded frame, in Node and in browsers (the bot Worker loads this module too). */
const ENCODER = typeof TextEncoder === 'function' ? new TextEncoder() : null;
export const utf8Bytes = (s) => (ENCODER ? ENCODER.encode(s).length : String(s).length * 3);
/**
 * May a line that costs `bytes` on the wire go out now? Takes them from the budget when it may: from the room's fair
 * share (when `room` is given) and from the match reserve (match chat, first) or the shared pool.
 * @param {number} bytes @param {number} now ms
 * @param {{ room?: string|null, match?: boolean }} [opts]
 * @returns {boolean}
 */
export function chatBudgetTake(bytes, now, { room = null, match = false } = {}) {
  if (now - sweptAt >= SWEEP_MS) {
    sweptAt = now;
    for (const [key, b] of rooms) if (now - b.at >= 2000) rooms.delete(key);
  }
  fill(shared, now);
  fill(reserve, now);
  let rb = null;
  if (room != null) {
    rb = rooms.get(room) || bucket(budgetRate * roomShare);
    fill(rb, now);
    if (bytes > rb.tokens && rb.tokens < rb.rate * 2) return false;
  }
  const fromReserve = match ? Math.min(bytes, reserve.tokens) : 0;
  if (bytes - fromReserve > shared.tokens) return false;
  reserve.tokens -= fromReserve;
  shared.tokens -= bytes - fromReserve;
  if (rb) { rb.tokens -= bytes; rooms.set(room, rb); }
  return true;
}
/**
 * Tests: a fresh budget at `bytesPerS`, room share and match reserve (each left out = the configured one).
 * @param {number|null} [bytesPerS] @param {{ roomShare?: number, matchReserve?: number }} [opts]
 */
export function chatBudgetReset(bytesPerS = null, opts = {}) {
  budgetRate = bytesPerS ?? CONF_RATE;
  roomShare = opts.roomShare ?? CONF_SHARE;
  matchReserve = opts.matchReserve ?? CONF_RESERVE;
  shared = bucket(budgetRate * (1 - matchReserve));
  reserve = bucket(budgetRate * matchReserve);
  rooms.clear();
  sweptAt = -Infinity;
}
/** Tests / diagnostics: how many room buckets are kept right now. */
export const chatBudgetRooms = () => rooms.size;
