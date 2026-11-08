// server/presence.js — the online count and the 搜寻队友 queue sizes for every client:
// `sys.online { online, searching: { [difficulty]: humans } }`. A new socket gets the counts on the next check (every
// 2 s), the title screen's (connected, no hello yet) included. (fork) A socket that already has them gets new ones at
// most once a minute (PRESENCE_REFRESH_MS), and only when they changed: the count is a rough figure, and resending it
// to every player on every change cost about 1.6 GB a day at 300 players, against about 50 MB now.

import { encode, sendRaw } from './net.js';
import { groupReady } from './matchmaker.js';

export const PRESENCE_POLL_MS = 2000;
/** (fork) How often a socket that already has the counts may get changed ones. */
export const PRESENCE_REFRESH_MS = 60_000;

/**
 * Open sockets, and the humans of searching rooms per difficulty (paused rooms are not in the queue).
 * @param {import('./net.js').Network} network @param {import('./lobby.js').Lobby} lobby
 */
export function countPresence(network, lobby) {
  const searching = {};
  for (const r of lobby.rooms.values()) {
    if (!r.searching || r.match || r.disposed || !groupReady(r)) continue;
    const n = r.seats.filter((s) => s && !s.isBot && !s.left).length;
    if (n) searching[r.difficulty] = (searching[r.difficulty] || 0) + n;
  }
  return { online: network.connectionCount, searching };
}

/**
 * (fork) This server's counts plus the other regions' (server/peerLink.js; none: just this server). `regions`: each
 * region's own online count ({ [id]: n }), this one and every region the link still hears from.
 */
export function withPeers(counts, peer) {
  if (!peer) return counts;
  const rest = peer.others();
  const searching = { ...counts.searching };
  for (const [d, n] of Object.entries(rest.searching)) searching[d] = (searching[d] || 0) + n;
  const self = peer.config?.self;
  const total = { online: counts.online + rest.online, searching };
  return self ? { ...total, regions: { ...(rest.byRegion || {}), [self]: counts.online } } : total;
}

export class Presence {
  /**
   * @param {{ network: import('./net.js').Network, lobby: import('./lobby.js').Lobby, pollMs?: number, refreshMs?: number,
   *   now?: () => number }} opts
   */
  constructor({ network, lobby, pollMs = PRESENCE_POLL_MS, refreshMs = PRESENCE_REFRESH_MS, now = Date.now }) {
    this.network = network;
    this.lobby = lobby;
    /** (fork) the other regions' numbers (server/peerLink.js), set by startServer */
    this.peer = null;
    this.pollMs = pollMs;
    this.refreshMs = refreshMs;
    this.now = now;
    /** the counts every told socket was last sent (a new socket gets newer ones) */
    this.last = null;
    /** when `last` was adopted, so it is resent to everybody at most every refreshMs */
    this.lastAt = -Infinity;
    /** sockets that already have counts */
    this.told = new WeakSet();
    this.timer = null;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.pollMs);
    this.timer.unref?.();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  frame() {
    return { t: 'sys.online', ...withPeers(countPresence(this.network, this.lobby), this.peer) };
  }

  /**
   * Send the counts to every socket that does not have them yet; changed counts go to everybody once refreshMs has
   * passed since the last time. @returns {number} sockets sent to
   */
  tick() {
    const data = encode(this.frame());
    if (!data) return 0;
    const at = this.now();
    if (data !== this.last && at - this.lastAt >= this.refreshMs) { this.last = data; this.lastAt = at; this.told = new WeakSet(); }
    let sent = 0;
    for (const ws of this.network.conns.keys()) {
      if (this.told.has(ws)) continue;
      if (sendRaw(ws, data)) { this.told.add(ws); sent++; }
    }
    return sent;
  }
}
