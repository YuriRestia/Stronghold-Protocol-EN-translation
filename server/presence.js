// server/presence.js — the online count and the 搜寻队友 queue sizes for every client:
// `sys.online { online, searching: { [difficulty]: humans } }`. It goes to every open socket, the title screen's
// (connected, no hello yet) included, when either number changes and to a new socket on its first check.

import { encode, sendRaw } from './net.js';
import { groupReady } from './matchmaker.js';

export const PRESENCE_POLL_MS = 2000;

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

export class Presence {
  /** @param {{ network: import('./net.js').Network, lobby: import('./lobby.js').Lobby, pollMs?: number }} opts */
  constructor({ network, lobby, pollMs = PRESENCE_POLL_MS }) {
    this.network = network;
    this.lobby = lobby;
    this.pollMs = pollMs;
    this.last = null;
    /** sockets that already have `last` */
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
    return { t: 'sys.online', ...countPresence(this.network, this.lobby) };
  }

  /** Send the counts to every socket that does not have them yet. @returns {number} sockets sent to */
  tick() {
    const data = encode(this.frame());
    if (!data) return 0;
    if (data !== this.last) { this.last = data; this.told = new WeakSet(); }
    let sent = 0;
    for (const ws of this.network.conns.keys()) {
      if (this.told.has(ws)) continue;
      if (sendRaw(ws, data)) { this.told.add(ws); sent++; }
    }
    return sent;
  }
}
