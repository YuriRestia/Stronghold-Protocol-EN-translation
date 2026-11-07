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

import { CHAT_COOLDOWN_MS, CHAT_COOLDOWN_GRACE_MS, CHAT_MAX_LETTERS } from '../../shared/constants.js';
import { cleanChat, letterCount, chopChat } from '../../shared/text.js';
import { creditedKillsOf } from '../sim/spec.js';
import { OK } from './match/common.js';

/** The operator's off switch, SP_CHAT=0: the page hides the box (m.private has no wallet) and g.chat does nothing. */
export const CHAT_ON = process.env.SP_CHAT !== '0';

/** More than this many UTF-16 units cannot survive the chop, so they are never even cleaned. */
const RAW_LIMIT = CHAT_MAX_LETTERS * 8;

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
 * @param {any} m the match @param {any} ps the sender @param {string} raw @returns {{ ok: true }}
 */
export function sendChat(m, ps, raw) {
  if (!CHAT_ON || ps.isBot || !(ps.chatLeft > 0)) return OK;
  const now = m.sched.now();
  if (now - ps.lastChatAt < CHAT_COOLDOWN_MS - CHAT_COOLDOWN_GRACE_MS) return OK;
  const text = chopChat(cleanChat(raw.slice(0, RAW_LIMIT)), ps.chatLeft);
  if (!text) return OK;
  ps.lastChatAt = now;
  ps.chatLeft -= letterCount(text);
  m.broadcast({ t: 'm.chat', p: ps.seat, x: text }, ps.playerId);
  return OK;
}
