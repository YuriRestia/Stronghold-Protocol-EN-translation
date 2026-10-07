// server/matchmaker.js — 搜寻队友 by merging searching lobby rooms (rules: DESIGN §27). This file decides who merges
// with whom; the merge and the auto-start are Lobby methods (mergeRooms / autoStart).

import { MAX_SEATS } from '../shared/constants.js';

export const MATCH_DEFAULTS = Object.freeze({
  matchTickMs: 2000,
  partialMergeAfterMs: 10_000, // 0 = exact fills only
});

/** Occupied seats; bots count. @param {import('./lobby.js').Room} room */
export function roomSize(room) {
  return room.seats.filter((s) => s && !s.left).length;
}

/** Every human connected, every one but the host ready. */
export function groupReady(room) {
  for (const s of room.seats) {
    if (!s || s.isBot || s.left) continue;
    if (!s.connected) return false;
    if (s.playerId !== room.hostId && !s.ready) return false;
  }
  return true;
}

export function isMatchable(room) {
  if (!room || room.disposed || room.match || room.mode !== 'coop' || !room.searching || !room.hostId) return false;
  const n = roomSize(room);
  return n >= 1 && n < MAX_SEATS && groupReady(room);
}

/**
 * This pass's merges, per difficulty: exact fills to MAX_SEATS first, then partial merges for rooms that have waited
 * longer than `partialMergeAfterMs`. Pure.
 * @param {Iterable<any>} rooms
 * @param {number} now
 * @param {{ partialMergeAfterMs?: number }} [opts]
 * @returns {{ target: any, sources: any[], fills: boolean }[]}
 */
export function planMerges(rooms, now, { partialMergeAfterMs = MATCH_DEFAULTS.partialMergeAfterMs } = {}) {
  const buckets = new Map();
  for (const r of rooms) {
    if (!isMatchable(r)) continue;
    if (!buckets.has(r.difficulty)) buckets.set(r.difficulty, []);
    buckets.get(r.difficulty).push({ room: r, size: roomSize(r), since: r.searchSince ?? now });
  }
  const plans = [];
  for (const list of buckets.values()) {
    // bigger groups first, then the longest search; the code keeps it deterministic
    list.sort((a, b) => b.size - a.size || a.since - b.since || (a.room.code < b.room.code ? -1 : 1));
    const used = new Set();
    for (const head of list) {
      if (used.has(head)) continue;
      const rest = fill(list, used, head, MAX_SEATS - head.size);
      if (!rest) continue;
      for (const e of [head, ...rest]) used.add(e);
      plans.push({ target: head.room, sources: rest.map((e) => e.room), fills: true });
    }
    if (!(partialMergeAfterMs > 0)) continue;
    for (const waiting of [...list].sort((a, b) => a.since - b.since)) {
      if (used.has(waiting) || now - waiting.since < partialMergeAfterMs) continue;
      const mate = list.find((e) => e !== waiting && !used.has(e) && e.size + waiting.size < MAX_SEATS);
      if (!mate) continue;
      used.add(waiting);
      used.add(mate);
      const [target, source] = list.indexOf(mate) < list.indexOf(waiting) ? [mate, waiting] : [waiting, mate];
      plans.push({ target: target.room, sources: [source.room], fills: false });
    }
  }
  return plans;
}

/** Earliest combination of unused entries (list order, after `head`) whose sizes sum to `need`, or null. */
function fill(list, used, head, need, from = list.indexOf(head) + 1) {
  if (need === 0) return [];
  for (let i = from; i < list.length; i++) {
    const e = list[i];
    if (used.has(e) || e.size > need) continue;
    const rest = fill(list, used, head, need - e.size, i + 1);
    if (rest) return [e, ...rest];
  }
  return null;
}

/** Runs planMerges on every change of a searching room (poke) and on a timer while any room searches. */
export class Matchmaker {
  /** @param {import('./lobby.js').Lobby} lobby @param {Partial<typeof MATCH_DEFAULTS>} [options] */
  constructor(lobby, options = {}) {
    this.lobby = lobby;
    this.opts = { ...MATCH_DEFAULTS };
    for (const k of Object.keys(MATCH_DEFAULTS)) if (options[k] != null) this.opts[k] = options[k];
    this.scheduled = false;
    this.running = false;
    /** @type {NodeJS.Timeout | null} */
    this.timer = null;
    this.stopped = false;
  }

  poke() {
    if (this.scheduled || this.stopped) return;
    this.scheduled = true;
    setImmediate(() => { this.scheduled = false; this.run(); });
  }

  run() {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      const lobby = this.lobby;
      for (const room of [...lobby.rooms.values()]) {
        if (room.searching && !room.disposed && !room.match && roomSize(room) >= MAX_SEATS && groupReady(room)) lobby.autoStart(room);
      }
      for (const p of planMerges(lobby.rooms.values(), lobby.now(), this.opts)) lobby.mergeRooms(p.target, p.sources);
    } catch (e) {
      this.lobby.log.error('[match] matchmaking pass failed', e);
    } finally {
      this.running = false;
    }
    this.syncTimer();
  }

  // partial merges are time-based, so a searching room needs the interval even when nothing changes
  syncTimer() {
    const any = !this.stopped && [...this.lobby.rooms.values()].some((r) => r.searching && !r.disposed && !r.match);
    if (any && !this.timer) {
      this.timer = setInterval(() => this.run(), this.opts.matchTickMs);
      this.timer.unref?.();
    } else if (!any && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
