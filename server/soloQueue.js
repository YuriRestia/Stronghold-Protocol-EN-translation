// server/soloQueue.js — 单人匹配 (DESIGN §90): a Doctor queues from the lobby without a room. The server only places
// queued Doctors when it can fill a room to its size, and starts that match at once: no room screen, no drip-feed.
// This file holds the queue and decides who goes where; the seating and the start are Lobby methods (placeSolos).
// The queue size is never sent to anyone.
// (fork) A Doctor queues for one or more official versions (`versions`) and may opt in to Grand Alliances (`large`):
// a room only takes Doctors who queued for its version, a Grand Alliance only those who opted in. A Grand Alliance
// that has searched longer than partialMergeAfterMs also takes opted-in Doctors who waited that long without filling
// it, as a partial merge would: they sit in its room until it fills [ASSUMED: else 8 seats would almost never fill].
// A One for All Grand Alliance only takes Doctors who also ticked its sub-opt-in (`oneForAll`, only with `large`).

import { MAX_SEATS } from '../shared/constants.js';
import { DEFAULT_VERSION, VERSIONS } from '../shared/versions.js';
import { roomSize, roomCap, roomVersion, isLarge, isOneForAll, isMatchable } from './matchmaker.js';

/** @typedef {{ playerId: string, difficulty: string, since: number, versions: string[], large: boolean, oneForAll: boolean }} SoloEntry */

/** The versions an entry queued for (an entry without the key: the default version). @param {any} e */
export function entryVersions(e) {
  return Array.isArray(e.versions) && e.versions.length ? e.versions : [DEFAULT_VERSION];
}

export class SoloQueue {
  constructor() {
    /** @type {Map<string, SoloEntry>} */
    this.entries = new Map();
  }

  /**
   * @param {string} playerId @param {string} difficulty @param {number} since
   * @param {{ versions?: string[], large?: boolean, oneForAll?: boolean }} [opts] @returns {SoloEntry}
   */
  add(playerId, difficulty, since, { versions = [DEFAULT_VERSION], large = false, oneForAll = false } = {}) {
    const e = { playerId, difficulty, since, versions: [...versions], large: large === true, oneForAll: large === true && oneForAll === true };
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

/** The versions entries queued for, the official order first (第二期下半 leads: it wins a Doctor who queued for several). */
function versionOrder(entries) {
  const seen = new Set(entries.flatMap(entryVersions));
  const known = VERSIONS.map((v) => v.id).filter((id) => seen.has(id));
  return [...known, ...[...seen].filter((id) => !known.includes(id)).sort()];
}

/**
 * This pass's placements. Pure.
 *   1. Searching rooms (longest search first) take the longest-waiting Doctors who queued for their version and difficulty
 *      (a Grand Alliance: who also opted in; a One for All one: who also ticked its sub-opt-in), only when that fills them. A room needing more than are left is skipped,
 *      so a smaller one behind it can still fill.
 *   2. The Doctors left over form new rooms of exactly MAX_SEATS, version by version (versionOrder).
 *   3. (fork) A Grand Alliance that has searched `partialMergeAfterMs` takes the opted-in Doctors left over who have
 *      waited as long, as many as it has seats (0 = off; cross-region plans are exact fills only).
 * Fewer than that wait: nobody is ever placed into a normal room that does not start.
 * @param {Iterable<any>} rooms
 * @param {SoloEntry[]} entries placeable entries, longest wait first
 * @param {{ now?: number, partialMergeAfterMs?: number }} [opts]
 * @returns {{ room: any | null, entries: SoloEntry[], version: string, difficulty: string }[]} room null = a new room
 */
export function planSolos(rooms, entries, { now = 0, partialMergeAfterMs = 0 } = {}) {
  if (!entries.length) return [];
  const left = new Set(entries);
  const takes = (e, r) => e.difficulty === r.difficulty && entryVersions(e).includes(roomVersion(r)) && (!isLarge(r) || e.large === true)
    && (!isOneForAll(r) || e.oneForAll === true);
  const waiting = [...rooms].filter((r) => isMatchable(r))
    .sort((a, b) => (a.searchSince ?? 0) - (b.searchSince ?? 0) || (a.code < b.code ? -1 : 1));
  const plans = [];
  for (const r of waiting) {
    const pool = entries.filter((e) => left.has(e) && takes(e, r));
    const need = roomCap(r) - roomSize(r);
    if (need > 0 && need <= pool.length) {
      const take = pool.slice(0, need);
      for (const e of take) left.delete(e);
      plans.push({ room: r, entries: take, version: roomVersion(r), difficulty: r.difficulty });
    }
  }
  for (const v of versionOrder(entries)) {
    const byDiff = new Map();
    for (const e of entries) {
      if (!left.has(e) || !entryVersions(e).includes(v)) continue;
      if (!byDiff.has(e.difficulty)) byDiff.set(e.difficulty, []);
      byDiff.get(e.difficulty).push(e);
    }
    for (const [difficulty, pool] of byDiff) {
      while (pool.length >= MAX_SEATS) {
        const take = pool.splice(0, MAX_SEATS);
        for (const e of take) left.delete(e);
        plans.push({ room: null, entries: take, version: v, difficulty });
      }
    }
  }
  if (partialMergeAfterMs > 0) {
    const placed = new Set(plans.map((p) => p.room).filter(Boolean));
    for (const r of waiting) {
      if (!isLarge(r) || placed.has(r) || now - (r.searchSince ?? now) < partialMergeAfterMs) continue;
      const pool = entries.filter((e) => left.has(e) && takes(e, r) && now - e.since >= partialMergeAfterMs);
      const take = pool.slice(0, roomCap(r) - roomSize(r));
      if (!take.length) continue;
      for (const e of take) left.delete(e);
      plans.push({ room: r, entries: take, version: roomVersion(r), difficulty: r.difficulty });
    }
  }
  return plans;
}
