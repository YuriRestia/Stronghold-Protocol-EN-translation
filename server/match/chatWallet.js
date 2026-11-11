// server/match/chatWallet.js — match chat, a remake feature of this fork. Deliberately cruel: last round's kills are the
// letters a player can type until the next round's result, a new amount replaces whatever was left, and a player with no
// letters (round 1, zero kills) has the emotes. Rules and bandwidth: docs/design/network.md "Match chat".
//
//   noteChatKills(m, field, result)   a field's result is in: remember each of its players' kills
//   settleChatWallet(ps, round)       the round's kills become the wallet
//   sendChat(m, ps, raw)              g.chat: clean, chop to the wallet, send to the room but the sender
//
// Every limit is enforced here; the browser only mirrors them. Nothing here answers with an error frame: a refused line
// costs no download, and a page that follows the rules never has one refused. Nothing is stored or replayed.

import { CHAT_BUSY_MS, CHAT_COOLDOWN_MS, CHAT_MAX_LETTERS } from '../../shared/constants.js';
import { chatLine, letterCount } from '../../shared/text.js';
import { msg } from '../../shared/i18n.js';
import { chatBudgetTake, chatLimitCheck, chatLimitGate, chatLimitState, chatWireBytes, utf8Bytes } from '../chatLimit.js';
import { creditedKillsOf } from '../sim/spec.js';
import { OK } from './match/common.js';

/** The operator's off switch, SP_CHAT=0: the page hides the box (m.private has no wallet) and g.chat does nothing. */
export const CHAT_ON = globalThis.process?.env?.SP_CHAT !== '0'; // (fork) this module also loads in the bot Worker

/**
 * Enemies the server scheduled on a field (bounties and bosses included, runtime split children and summons not): the
 * most kills a browser's report can buy. Infinity for a field without a spec — the legacy server-run battles, whose result
 * did not come from a browser.
 * @param {{ spec?: { spawns?: any[] } } | null | undefined} field @returns {number}
 */
export function scheduledEnemies(field) {
  const spawns = field?.spec?.spawns;
  if (!Array.isArray(spawns)) return Infinity;
  let n = 0;
  for (const s of spawns) if (s) n += Math.max(1, Math.floor(Number(s.count) || 1));
  return n;
}

/**
 * A field's result is in. A stand-in for a field that never reported (a dropped connection) says nothing about the
 * player's kills, so it leaves them unset and settleChatWallet keeps the old wallet.
 * @param {any} m the match @param {any} field @param {any} res
 */
export function noteChatKills(m, field, res) {
  if (!res || res.synthetic) return;
  const cap = scheduledEnemies(field);
  for (const pid of field.players) {
    const pp = res.perPlayer && res.perPlayer[pid];
    const ps = m.players.get(pid);
    if (pp && ps) ps.chatPending = (ps.chatPending ?? 0) + Math.min(creditedKillsOf(pp), cap);
  }
}

/**
 * The round's kills replace the wallet: nothing carries over. Settlement only visits living players, so a defeated one
 * keeps the letters of their last round as last words and gets no more.
 * @param {any} ps @param {number} round
 */
export function settleChatWallet(ps, round) {
  if (ps.chatPending == null) return;
  ps.chatLeft = Math.min(ps.chatPending, CHAT_MAX_LETTERS);
  ps.chatRound = round;
  ps.chatPending = null;
  ps.dirty();
}

/**
 * g.chat: spends letters and sends the line. Spectators never get here (Lobby refuses their g.* intents).
 * (fork, 2026-11-11) The line is plain text (shared/text.js chatLine: no tags, emoji or symbols) and at most
 * CHAT_LINE_LETTERS letters, whatever the wallet holds; the spam limits are server/chatLimit.js's with this chat's 3 s gap,
 * and the start of a pause is the only refusal the sender hears of (a toast).
 * @param {any} m the match @param {any} ps the sender @param {string} raw @returns {{ ok: true }}
 */
export function sendChat(m, ps, raw) {
  if (!CHAT_ON || ps.isBot || !(ps.chatLeft > 0) || typeof raw !== 'string') return OK;
  const now = m.sched.now();
  if (!ps.chatLimit) ps.chatLimit = chatLimitState();
  if (!chatLimitGate(ps.chatLimit, now, { gapMs: CHAT_COOLDOWN_MS })) return OK;
  const text = chatLine(raw, Math.min(ps.chatLeft, CHAT_MAX_LETTERS));
  if (!text) return OK;
  const lim = chatLimitCheck(ps.chatLimit, text, now, { gapMs: CHAT_COOLDOWN_MS });
  if (!lim.ok) {
    if (lim.newPause) {
      const n = Math.ceil((lim.pausedUntil - now) / 1000);
      m.toast(ps, 'warn', msg('发送太快了，聊天暂停 {n} 秒。', { n })); // en: "You're sending too fast. Chat paused for {n} s."
    }
    return OK;
  }
  // the server-wide chat budget (server cost), shared with room chat in this process; its clock is the wall clock
  const frame = { t: 'm.chat', p: ps.seat, x: text };
  const recipients = Math.max(0, (m.players?.size ?? 0) + (m.spectators?.size ?? 0) - 1);
  const wall = Date.now();
  if (!chatBudgetTake(chatWireBytes(utf8Bytes(JSON.stringify(frame)), recipients), wall)) {
    if (wall - (ps.chatBusyAt ?? -Infinity) >= CHAT_BUSY_MS) {
      ps.chatBusyAt = wall;
      m.toast(ps, 'warn', msg('聊天繁忙，请稍后再试。')); // en: "Chat is busy. Try again in a moment."
    }
    return OK;
  }
  ps.chatLeft -= letterCount(text);
  m.broadcast(frame, ps.playerId);
  return OK;
}
