// server/matchmaker.js — matchmaking by merging lobby rooms (a remake feature: the official 搜寻队友 pairs strangers; here
// it rides on the existing lobby, DESIGN §25). Owned by server/lobby.js (`lobby.matchmaker`); the merge itself and the
// auto-start are Lobby methods (mergeRooms / autoStart), this file only decides who goes where and when.
//
// Rules (owner's decisions 2026-10; ▸ = choices where they were silent):
//   * Only co-op rooms search. The host turns it on with room.search {on:true}, and only while every other human of the
//     room is connected and ready (`groupReady`). A searching room that stops being ready (someone un-readies, a friend
//     joins by code, the difficulty changes, someone drops) is paused, not cancelled: it is skipped until it is ready again.
//   * AI seats count as filled: a room's size is its occupied seats (humans + bots); bots are never displaced.
//   * Rooms merge whole: a pre-made room's humans, bots (and spectators, while seats last) all move together into one
//     target room, so nobody is ever left behind. Only rooms of the same difficulty merge.
//   * A searching room that is full and ready starts its match at once (no countdown; the briefing is the buffer) —
//     filled by a merge, a friend's join or the host's AI. Rooms that do not search keep the manual room.start.
//   * Planning (`planMerges`), per difficulty: first exact fills to MAX_SEATS (bigger groups first, then the longest
//     search); then ▸ partial merges for rooms that have searched longer than `partialMergeAfterMs` (e.g. 1+1 → a
//     searching pair), so a quiet server does not leave everyone alone. Target = the bigger group, then the older search.
//   * The search stops when a match starts and stays off after it (▸ no automatic re-queue).

import { MAX_SEATS } from '../shared/constants.js';

/** Tunables (Lobby options pass through: startServer({ matchTickMs, partialMergeAfterMs })). */
export const MATCH_DEFAULTS = Object.freeze({
  matchTickMs: 2000,          // re-plan this often while some room searches (merges are also planned on every change)
  partialMergeAfterMs: 10_000, // a room searching this long merges with any room that fits (0 = exact fills only)
});

/** Occupied seats (humans that have not departed + bots). @param {import('./lobby.js').Room} room */
export function roomSize(room) {
  return room.seats.filter((s) => s && !s.left).length;
}

/** Every human other than the host connected and ready (the host's search / start counts as its ready). */
export function groupReady(room) {
  for (const s of room.seats) {
    if (!s || s.isBot || s.left) continue;
    if (!s.connected) return false;
    if (s.playerId !== room.hostId && !s.ready) return false;
  }
  return true;
}

/** A room the planner may merge right now. */
export function isMatchable(room) {
  if (!room || room.disposed || room.match || room.mode !== 'coop' || !room.searching || !room.hostId) return false;
  const n = roomSize(room);
  return n >= 1 && n < MAX_SEATS && groupReady(room);
}

/**
 * Decide this pass's merges. Pure: reads the rooms, changes nothing.
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
    // bigger groups first, then the longest search, then the code (deterministic)
    list.sort((a, b) => b.size - a.size || a.since - b.since || (a.room.code < b.room.code ? -1 : 1));
    const used = new Set();
    // 1) exact fills: the first (biggest / oldest) unused room plus the earliest combination that completes it
    for (const head of list) {
      if (used.has(head)) continue;
      const rest = fill(list, used, head, MAX_SEATS - head.size);
      if (!rest) continue;
      for (const e of [head, ...rest]) used.add(e);
      plans.push({ target: head.room, sources: rest.map((e) => e.room), fills: true });
    }
    // 2) partial merges: a room waiting past the delay joins the biggest unused room it fits with
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

/** Runs the plan against a Lobby: on every room change of a searching room (poke) and on a timer while any searches. */
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

  /** A searching room changed: plan again on the next macrotask (coalesced). */
  poke() {
    if (this.scheduled || this.stopped) return;
    this.scheduled = true;
    setImmediate(() => { this.scheduled = false; this.run(); });
  }

  /** One pass: auto-start full ready rooms, then carry out the merges. */
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

  /** Keep the interval only while some room searches (partial merges are time-based). */
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
