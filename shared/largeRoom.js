// shared/largeRoom.js — (fork) 8-player rooms ("Large rooms", DESIGN §91), shared by the server and the page.
//
// [ASSUMED] A remake-only mode, the maintainer's decision of 2026-11-08: an 8-seat co-op room for humans only, found in
// the lobby's room list, joined by key or filled by matchmaking (DESIGN §90.4, 2026-11-08), never by AI. Seats 1–4 are squad A and seats 5–8 squad B;
// the players choose where they sit (no automatic balancing). When both squads have players, each squad drafts on its
// own in parallel, the whole room shares one operator / equipment pool that grows with the room, the 联防 relays across
// the room (at most 2 rounds) and everyone fights one shared leader. Everyone in one squad plays today's rules.

import { MAX_SEATS } from './constants.js';

/** Seats of a large room. */
export const LARGE_ROOM_SEATS = 8;
/** Seats of one squad (the official room size). */
export const SQUAD_SEATS = MAX_SEATS;
/** At most this many 联防 rounds in a relay (round 1 + one more). */
export const RELAY_MAX_ROUNDS = 2;
/** Idle prep rounds in a row before a seat is removed (a warning after one round fewer). */
export const IDLE_PREP_ROUNDS = 3;

/** A locked room's password: 4 letters, A–Z, case-insensitive (stored upper case). */
export const ROOM_PASSWORD_RE = /^[A-Za-z]{4}$/;
/** Wrong passwords a session may try in ROOM_PASSWORD_WINDOW_MS before it is told to slow down (RATE). */
export const ROOM_PASSWORD_TRIES = 6;
export const ROOM_PASSWORD_WINDOW_MS = 60_000;

/**
 * [ASSUMED] (fork, user 2026-11-11: seat-hopping spam) A member changes squad at most once per SQUAD_MOVE_GAP_MS and
 * SQUAD_MOVES_PER_WINDOW times per SQUAD_MOVE_WINDOW_MS. Kept on the room per player (a reconnect or a rejoin does not
 * reset it); the page counts its own moves the same way to show the wait.
 */
export const SQUAD_MOVE_GAP_MS = 5_000;
export const SQUAD_MOVES_PER_WINDOW = 4;
export const SQUAD_MOVE_WINDOW_MS = 60_000;
/** The players whose move times a room keeps (the oldest is dropped beyond it): a bound, not a rule. */
export const SQUAD_MOVE_LOG_MAX = 16;

/**
 * Milliseconds a member must still wait before the next squad move, 0 when it may move now.
 * @param {number[]} times this member's earlier moves (epoch ms, any order; older than the window ignored) @param {number} now
 */
export function squadMoveWait(times, now) {
  const recent = (Array.isArray(times) ? times : []).filter((t) => Number.isFinite(t) && now - t < SQUAD_MOVE_WINDOW_MS && t <= now).sort((a, b) => a - b);
  if (!recent.length) return 0;
  const gap = recent[recent.length - 1] + SQUAD_MOVE_GAP_MS - now;
  const full = recent.length >= SQUAD_MOVES_PER_WINDOW ? recent[recent.length - SQUAD_MOVES_PER_WINDOW] + SQUAD_MOVE_WINDOW_MS - now : 0;
  return Math.max(0, gap, full);
}

/** A member's move times kept after a move at `now`: the window's, at most SQUAD_MOVES_PER_WINDOW, oldest dropped. */
export function squadMoveLog(times, now) {
  const kept = (Array.isArray(times) ? times : []).filter((t) => Number.isFinite(t) && now - t < SQUAD_MOVE_WINDOW_MS && t <= now);
  kept.push(now);
  return kept.sort((a, b) => a - b).slice(-SQUAD_MOVES_PER_WINDOW);
}

/** The room capacities a co-op room may have. */
export const ROOM_CAPACITIES = Object.freeze([MAX_SEATS, LARGE_ROOM_SEATS]);

/** Squad index (0 = A, 1 = B) of a seat index (0-based). */
export const squadOfSeat = (seat) => (Number.isInteger(seat) && seat >= SQUAD_SEATS ? 1 : 0);

/**
 * The room scale of a match that started with `players` seats: players ÷ 4 above 4, else 1. Pool copies (rounded up),
 * the Hidden Core threshold (rounded up) and the leader fight's overtime drain are multiplied by it.
 */
export const roomScaleFor = (players) => (Number.isInteger(players) && players > SQUAD_SEATS ? players / SQUAD_SEATS : 1);

/** A count scaled by the room scale, rounded up; unchanged at scale 1. */
export const scaleCount = (n, scale) => (scale > 1 && Number.isFinite(n) ? Math.ceil(n * scale) : n);
