// server/soloQueue.js — 单人匹配 (DESIGN §26): a Doctor queues from the lobby without a room. The server only places
// queued Doctors when it can fill a room to MAX_SEATS, and starts that match at once: no room screen, no drip-feed.
// This file holds the queue and decides who goes where; the seating and the start are Lobby methods (placeSolos).
// The queue size is never sent to anyone.

import { MAX_SEATS } from '../shared/constants.js';
import { roomSize, isMatchable } from './matchmaker.js';

/** @typedef {{ playerId: string, difficulty: string, since: number }} SoloEntry */

export class SoloQueue {
  constructor() {
    /** @type {Map<string, SoloEntry>} */
    this.entries = new Map();
  }

  /** @param {string} playerId @param {string} difficulty @param {number} since @returns {SoloEntry} */
  add(playerId, difficulty, since) {
    const e = { playerId, difficulty, since };
    this.entries.set(playerId, e);
    return e;
  }

  get(playerId) { return this.entries.get(playerId) || null; }

  /** @returns {boolean} it was queued */
  remove(playerId) { return this.entries.delete(playerId); }

  get size() { return this.entries.size; }

  /** Longest wait first; the id keeps it deterministic. @returns {SoloEntry[]} */
  list() {
    return [...this.entries.values()].sort((a, b) => a.since - b.since || (a.playerId < b.playerId ? -1 : 1));
  }

  clear() { this.entries.clear(); }
}

/**
 * This pass's placements, per difficulty. Pure.
 *   1. Searching rooms (longest search first) take the longest-waiting solos, only when that fills them to MAX_SEATS.
 *      A room needing more solos than are left is skipped, so a smaller one behind it can still fill.
 *   2. The solos left over form new rooms of exactly MAX_SEATS.
 * Fewer than that wait: nobody is ever placed into a room that does not start.
 * @param {Iterable<any>} rooms
 * @param {SoloEntry[]} entries placeable entries, longest wait first
 * @returns {{ room: any | null, entries: SoloEntry[] }[]} room null = a new room
 */
export function planSolos(rooms, entries) {
  const byDiff = new Map();
  for (const e of entries) {
    if (!byDiff.has(e.difficulty)) byDiff.set(e.difficulty, []);
    byDiff.get(e.difficulty).push(e);
  }
  if (!byDiff.size) return [];
  const waiting = [...rooms].filter((r) => isMatchable(r) && byDiff.has(r.difficulty))
    .sort((a, b) => (a.searchSince ?? 0) - (b.searchSince ?? 0) || (a.code < b.code ? -1 : 1));
  const plans = [];
  for (const r of waiting) {
    const pool = byDiff.get(r.difficulty);
    const need = MAX_SEATS - roomSize(r);
    if (need > 0 && need <= pool.length) plans.push({ room: r, entries: pool.splice(0, need) });
  }
  for (const pool of byDiff.values()) {
    while (pool.length >= MAX_SEATS) plans.push({ room: null, entries: pool.splice(0, MAX_SEATS) });
  }
  return plans;
}
