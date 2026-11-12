// server/matchmaker.js — 搜寻队友 by merging searching lobby rooms (rules: DESIGN §90). This file decides who merges
// with whom; the merge and the auto-start are Lobby methods (mergeRooms / autoStart).
// (fork) Rooms only meet rooms of their own pool (poolKey): the same official version, difficulty and size. A Grand
// Alliance (8 seats, shared/largeRoom.js) merges only with other Grand Alliances, and only when every squad of a source
// fits whole into one squad of the target (fitSquads); a squad never splits. A One for All Grand Alliance (room.oneForAll)
// merges only with other One for All rooms.

import { MAX_SEATS } from '../shared/constants.js';
import { DEFAULT_VERSION } from '../shared/versions.js';
import { SQUAD_SEATS } from '../shared/largeRoom.js';

export const MATCH_DEFAULTS = Object.freeze({
  matchTickMs: 2000,
  partialMergeAfterMs: 10_000, // 0 = exact fills only
  soloAiAfterMs: 120_000, // 单人匹配: queue.ai (play with AI teammates instead) is accepted after this wait
  // (fork) a full matchmade room of another version waits this long for its pages to load that version's data; the
  // seats still not ready then leave the room and it searches on [ASSUMED]
  contentWaitMs: 60_000,
});

/** Occupied seats; bots count. @param {import('./lobby.js').Room} room */
export function roomSize(room) {
  return room.seats.filter((s) => s && !s.left).length;
}

/** (fork) The seats a room fills to: MAX_SEATS, or a Grand Alliance's capacity. */
export function roomCap(room) {
  return room.capacity > MAX_SEATS ? room.capacity : MAX_SEATS;
}

/** (fork) A Grand Alliance room (shared/largeRoom.js). */
export function isLarge(room) { return roomCap(room) > MAX_SEATS; }

/** (fork) The official version a room plays. */
export function roomVersion(room) { return room.version ?? DEFAULT_VERSION; }

/** (fork) A One for All Grand Alliance (server/lobby.js Room.oneForAll); a normal room never is. */
export function isOneForAll(room) { return isLarge(room) && room.oneForAll === true; }

/**
 * (fork) The matchmaking pool of a room: rooms meet only rooms of the same version, difficulty and size, and a Grand
 * Alliance only one of the same strategy mode (Free pick or One for All). Rooms without One for All keep their old key.
 */
export function poolKey(room) { return `${roomVersion(room)}|${room.difficulty}|${roomCap(room)}${isOneForAll(room) ? '|ofa' : ''}`; }

/** (fork) Occupied seats per squad (seats 1–4, 5–8); a normal room has its players in the first. */
export function squadCounts(room) {
  const c = [0, 0];
  room.seats.forEach((s, i) => { if (s && !s.left) c[i >= SQUAD_SEATS ? 1 : 0]++; });
  return c;
}

/** (fork) Empty seats per squad of a Grand Alliance. */
export function squadFree(room) {
  return [0, 1].map((q) => room.seats.slice(q * SQUAD_SEATS, (q + 1) * SQUAD_SEATS).filter((s) => s == null).length);
}

/**
 * (fork) Where each squad of each source goes in `target`, keeping every squad whole: `out[i][q]` is the target squad of
 * source i's squad q, or null when they do not fit. A source is a room or its squad counts. Pure.
 * @param {any} target @param {any[]} sources @param {number[]} [free] the target's empty seats per squad
 * @returns {number[][] | null}
 */
export function fitSquads(target, sources, free = squadFree(target)) {
  const room = [...free];
  const items = [];
  sources.forEach((r, i) => (Array.isArray(r) ? r : squadCounts(r)).forEach((n, q) => { if (n) items.push({ i, q, n }); }));
  items.sort((a, b) => b.n - a.n || a.i - b.i || a.q - b.q);
  const out = sources.map(() => [0, 1]);
  const place = (k) => {
    if (k === items.length) return true;
    const it = items[k];
    for (const t of [0, 1]) {
      if (room[t] < it.n) continue;
      room[t] -= it.n;
      out[it.i][it.q] = t;
      if (place(k + 1)) return true;
      room[t] += it.n;
    }
    return false;
  };
  return place(0) ? out : null;
}

/** Every human connected, every one but the host ready. */
export function groupReady(room) {
  // (fork) seats held for a group on its way from another server (DESIGN §90.2): the room pauses until they sit down
  if (room.reservations?.length) return false;
  for (const s of room.seats) {
    if (!s || s.isBot || s.left) continue;
    if (!s.connected) return false;
    if (s.playerId !== room.hostId && !s.ready) return false;
  }
  return true;
}

export function isMatchable(room) {
  if (!room || room.disposed || room.match || room.mode !== 'coop' || !room.searching || !room.hostId) return false;
  // (fork) a room with gameplay plugins is joined by its code only: strangers never land in other rules (DESIGN §90);
  // nor does anyone land in a test room
  if (room.modded || room.test) return false;
  const n = roomSize(room);
  return n >= 1 && n < roomCap(room) && groupReady(room);
}

/**
 * This pass's merges, per pool (poolKey): exact fills to the room's size first, then partial merges for rooms that have
 * waited longer than `partialMergeAfterMs`. Grand Alliances merge only where fitSquads finds room. Pure.
 * @param {Iterable<any>} rooms
 * @param {number} now
 * @param {{ partialMergeAfterMs?: number }} [opts]
 * @returns {{ target: any, sources: any[], fills: boolean }[]}
 */
export function planMerges(rooms, now, { partialMergeAfterMs = MATCH_DEFAULTS.partialMergeAfterMs } = {}) {
  const buckets = new Map();
  for (const r of rooms) {
    if (!isMatchable(r)) continue;
    const key = poolKey(r);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ room: r, size: roomSize(r), since: r.searchSince ?? now });
  }
  const plans = [];
  for (const list of buckets.values()) {
    const cap = roomCap(list[0].room);
    const large = cap > MAX_SEATS;
    // squads stay whole in a Grand Alliance; a normal room takes anyone who fits
    const fits = (head, rest) => !large || !!fitSquads(head.room, rest.map((e) => e.room));
    // bigger groups first, then the longest search; the code keeps it deterministic
    list.sort((a, b) => b.size - a.size || a.since - b.since || (a.room.code < b.room.code ? -1 : 1));
    const used = new Set();
    for (const head of list) {
      if (used.has(head)) continue;
      const rest = fill(list, used, head, cap - head.size, (acc) => fits(head, acc), { n: 20_000 });
      if (!rest) continue;
      for (const e of [head, ...rest]) used.add(e);
      plans.push({ target: head.room, sources: rest.map((e) => e.room), fills: true });
    }
    if (!(partialMergeAfterMs > 0)) continue;
    for (const waiting of [...list].sort((a, b) => a.since - b.since)) {
      if (used.has(waiting) || now - waiting.since < partialMergeAfterMs) continue;
      // the one earlier in the list (bigger, longer search) is the target
      const pair = (mate) => {
        const [t, s] = list.indexOf(mate) < list.indexOf(waiting) ? [mate, waiting] : [waiting, mate];
        return fits(t, [s]) ? [t, s] : null;
      };
      const mate = list.find((e) => e !== waiting && !used.has(e) && e.size + waiting.size < cap && pair(e));
      if (!mate) continue;
      used.add(waiting);
      used.add(mate);
      const [target, source] = /** @type {any[]} */ (pair(mate));
      plans.push({ target: target.room, sources: [source.room], fills: false });
    }
  }
  return plans;
}

/**
 * Earliest combination of unused entries (list order, after `head`) whose sizes sum to `need` and that `ok` accepts, or
 * null. `budget` caps the search (a pool of many small Grand Alliances whose squads never fit).
 */
function fill(list, used, head, need, ok, budget, from = list.indexOf(head) + 1, acc = []) {
  if (need === 0) return ok(acc) ? [...acc] : null;
  for (let i = from; i < list.length; i++) {
    if (--budget.n < 0) return null;
    const e = list[i];
    if (used.has(e) || e.size > need) continue;
    acc.push(e);
    const rest = fill(list, used, head, need - e.size, ok, budget, i + 1, acc);
    acc.pop();
    if (rest) return rest;
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
      lobby.expireReservations?.();
      for (const room of [...lobby.rooms.values()]) {
        if (room.searching && !room.disposed && !room.match && roomSize(room) >= roomCap(room) && groupReady(room)) lobby.autoStart(room);
        // (fork) the content wait (Lobby.waitContent) is a full, ready room's: it starts over once the room is that again
        else if (room.contentWait) room.contentWait = null;
      }
      // 单人匹配 first (server/soloQueue.js): solos fill searching rooms exactly before rooms merge partially
      lobby.placeSolos();
      for (const p of planMerges(lobby.rooms.values(), lobby.now(), this.opts)) lobby.mergeRooms(p.target, p.sources);
    } catch (e) {
      this.lobby.log.error('[match] matchmaking pass failed', e);
    } finally {
      this.running = false;
    }
    this.syncTimer();
  }

  // partial merges are time-based, so a searching room needs the interval even when nothing changes; queued solos
  // too (a placement refused by a limit is retried)
  syncTimer() {
    const any = !this.stopped && (this.lobby.soloQueue.size > 0 || [...this.lobby.rooms.values()].some((r) => r.searching && !r.disposed && !r.match));
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
