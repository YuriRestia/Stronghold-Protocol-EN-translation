// shared/largeRoom.js — (fork) 8-player rooms ("Large rooms", DESIGN §91), shared by the server and the page.
//
// [ASSUMED] A remake-only mode, the maintainer's decision of 2026-11-08: an 8-seat co-op room for humans only, found in
// the lobby's room list or joined by key, never filled by matchmaking or AI. Seats 1–4 are squad A and seats 5–8 squad B;
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
