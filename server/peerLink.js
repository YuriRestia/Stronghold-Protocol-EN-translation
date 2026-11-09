// server/peerLink.js — (fork) the link between regions (DESIGN §8.7): signed HTTPS through Cloudflare, no firewall change and
// no socket to keep. A server that is not the arbiter (server/regions.js: the first region) posts its state to the arbiter's
// unprefixed /_peer/sync every POLL_MS; the router sends that to whichever generation is current, so a deploy needs no
// reconnecting. The answer carries the arbiter's state and the commands for this server (server/crossMatch.js); results go
// back with the next post, sent at once when there is one.
//
// Everything is optional by design. A link that is down, or a peer on another build, only makes each server local again:
// key joins never use it (the key names the server, shared/regions.js) and the counts shrink to this server's own.
// The same goes for the Grand Alliance room browser: each server's open rooms ride along with its state (`rooms`) and
// Lobby.roomList adds the other servers' (peerRooms); a link that is down lists this server's rooms only.
//
//   signature   HMAC-SHA256 of `<ms>.<body>` with SP_PEER_SECRET, in x-sp-peer-time / x-sp-peer-sig; 30 s of clock skew
//   tickets     `<base64url json>.<hmac>`: a moved group's seats, checked by the room's own server (Lobby.join)

import { createHmac, timingSafeEqual } from 'node:crypto';
import { isLocalHost } from '../shared/regions.js';
import { peerHostOf } from './regions.js';
import { PROTOCOL_VERSION } from '../shared/constants.js';
import { sendJson, sendError } from './http/common.js';

export const POLL_MS = 2000;
/** A peer unheard for this long counts as gone: its numbers leave the counts, its rooms leave the plans. */
export const PEER_FRESH_MS = 7000;
export const PEER_TIMEOUT_MS = 5000;
export const SIGNATURE_WINDOW_MS = 30_000;
export const MAX_BODY_BYTES = 256 * 1024;
export const SYNC_PATH = '/_peer/sync';
/** The rooms one region shows the others (Lobby.ownRoomList caps them too). */
export const MAX_PEER_ROOMS = 50;

/**
 * A room browser row from another server, only its known fields (it is shown to players), or null.
 * @param {any} r @param {string} region
 */
export function peerRoomRow(r, region) {
  if (!r || typeof r.code !== 'string' || !/^[A-Za-z0-9]{1,12}$/.test(r.code) || !Number.isInteger(r.seats) || !Number.isInteger(r.capacity)) return null;
  return {
    code: r.code, host: typeof r.host === 'string' ? r.host.slice(0, 64) : '', seats: r.seats, capacity: r.capacity,
    difficulty: typeof r.difficulty === 'string' ? r.difficulty : undefined,
    squads: Array.isArray(r.squads) && r.squads.length === 2 ? r.squads.map((n) => (Number.isInteger(n) ? n : 0)) : [r.seats, 0],
    ...(r.locked === true ? { locked: true } : {}), at: Number(r.at) || 0, region,
  };
}

const hmac = (secret, text) => createHmac('sha256', secret).update(text).digest('hex');
const same = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

export function signBody(secret, ms, body) { return hmac(secret, `${ms}.${body}`); }

/** @param {string} secret @param {unknown} ms @param {unknown} sig @param {string} body @param {number} now */
export function verifyBody(secret, ms, sig, body, now) {
  const t = Number(ms);
  if (!Number.isFinite(t) || Math.abs(now - t) > SIGNATURE_WINDOW_MS) return false;
  return same(signBody(secret, t, body), sig);
}

/** @param {string} secret @param {object} payload */
export function signTicket(secret, payload) {
  const text = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${text}.${hmac(secret, text)}`;
}

/** The ticket's payload, or null when forged, damaged or past its `exp`. @param {string} secret @param {unknown} ticket @param {number} now */
export function verifyTicket(secret, ticket, now) {
  if (typeof ticket !== 'string') return null;
  const dot = ticket.lastIndexOf('.');
  if (dot <= 0 || !same(hmac(secret, ticket.slice(0, dot)), ticket.slice(dot + 1))) return null;
  try {
    const payload = JSON.parse(Buffer.from(ticket.slice(0, dot), 'base64url').toString('utf8'));
    return payload && Number.isFinite(payload.exp) && payload.exp > now ? payload : null;
  } catch {
    return null;
  }
}

/** Two servers can share a match only on the same code: same generation, protocol and game data. */
export function compatible(a, b) {
  return !!a && !!b && a.gen === b.gen && a.proto === b.proto && a.cs === b.cs;
}

export class PeerLink {
  /**
   * @param {{ config: NonNullable<ReturnType<typeof import('./regions.js').regionConfigFrom>>,
   *   network: { connectionCount: number }, lobby: any, gen?: string | null, cs?: string | null, log?: any,
   *   fetch?: typeof fetch, now?: () => number, pollMs?: number, isActive?: (() => boolean) | null }} opts
   *   isActive: is this process the one that speaks for its region? (server/generation.js: a prepared or a retiring
   *   generation stays silent, or its posts would overwrite the current one's every 2 s for up to an hour); none: always
   */
  constructor({ config, network, lobby, gen = null, cs = null, log = {}, fetch: fetchFn = globalThis.fetch, now = Date.now, pollMs = POLL_MS, isActive = null }) {
    this.config = config;
    this.network = network;
    this.lobby = lobby;
    this.gen = gen;
    this.cs = cs;
    this.log = log;
    this.fetch = fetchFn;
    this.now = now;
    this.pollMs = pollMs;
    this.isActive = isActive;
    this.isArbiter = config.self === config.arbiter;
    /** @type {Map<string, { state: any, at: number }>} the last state of each other region */
    this.peers = new Map();
    /** arbiter: commands waiting for a region's next post; others: results waiting for the next post */
    this.outbox = new Map();
    this.results = [];
    /** set by server/crossMatch.js: runs a command here (others) / takes a result (arbiter) / plans (arbiter) */
    this.onCommand = null;
    this.onResult = null;
    this.onTick = null;
    this.timer = null;
    this.polling = false;
    this.repoll = false;
    this.failing = false;
    /** the other regions' rooms as the room browser last got them (noticeRooms) */
    this.roomsKey = '[]';
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.pollMs);
    this.timer.unref?.();
    this.tick();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  tick() {
    if (this.isActive && !this.isActive()) return;
    this.noticeRooms(); // a region that went quiet leaves the room browser
    if (!this.isArbiter) { void this.poll(); return; }
    try { this.onTick?.(); } catch (e) { this.log.error?.('[peer] planning failed', e); }
  }

  /**
   * The other regions' open Grand Alliance rooms for the room browser (Lobby.roomList), each with its `region`: only
   * regions still heard from and on this server's build (`compatible`: the same rules), so a link that is down or a
   * peer mid-deploy lists nothing here. The arbiter's answer also carries the regions other than this one.
   */
  peerRooms() {
    const me = { gen: this.gen, proto: PROTOCOL_VERSION, cs: this.cs };
    const out = [];
    const seen = new Set([this.config.self]);
    const add = (id, rows) => {
      if (seen.has(id) || !Array.isArray(rows) || !this.config.list.some((r) => r.id === id)) return;
      seen.add(id);
      for (const r of rows.slice(0, MAX_PEER_ROOMS)) { const row = peerRoomRow(r, id); if (row) out.push(row); }
    };
    for (const { id, state } of this.freshPeers()) {
      if (!compatible(me, state)) continue;
      add(id, state.rooms);
      for (const [r, rows] of Object.entries(state.others?.rooms || {})) add(r, rows);
    }
    return out;
  }

  /** The other regions' rooms changed (or went away): the pages watching the room browser get the list again. */
  noticeRooms() {
    if (typeof this.lobby.roomListChanged !== 'function') return;
    try {
      const key = JSON.stringify(this.peerRooms());
      if (key === this.roomsKey) return;
      this.roomsKey = key;
      this.lobby.roomListChanged();
    } catch (e) { this.log.error?.('[peer] room list failed', e); }
  }

  /** This server, as the other regions read it. */
  state() {
    const counts = this.lobby.presenceCounts?.() ?? { searching: {} };
    return {
      region: this.config.self, gen: this.gen, proto: PROTOCOL_VERSION, cs: this.cs,
      online: this.network.connectionCount, searching: counts.searching,
      // only a server with cross-region matchmaking on offers its waiters (SP_CROSS_MATCH)
      digest: this.lobby.crossTicket ? this.lobby.crossDigest() : null,
      // the open Grand Alliance rooms, for the other regions' room browsers (only while large rooms are on here)
      rooms: this.lobby.largeRooms === true && typeof this.lobby.ownRoomList === 'function' ? this.lobby.ownRoomList() : null,
    };
  }

  /** The other regions still heard from. @returns {{ id: string, state: any }[]} */
  freshPeers() {
    const out = [];
    const now = this.now();
    for (const [id, p] of this.peers) if (now - p.at <= PEER_FRESH_MS) out.push({ id, state: p.state });
    return out;
  }

  /**
   * The other regions' numbers together: sys.online adds them (server/presence.js). `byRegion`: each one's online count
   * on its own, for the lobby's per-server breakdown (public/js/ui/presence.js).
   */
  others() {
    const sum = { online: 0, searching: {}, byRegion: {} };
    for (const { id, state } of this.freshPeers()) {
      const own = Number(state.online) || 0;
      sum.online += own;
      sum.byRegion[id] = own;
      for (const [d, n] of Object.entries(state.searching || {})) sum.searching[d] = (sum.searching[d] || 0) + (Number(n) || 0);
      // the arbiter's answer already holds the regions other than the asker
      if (state.others) {
        sum.online += Number(state.others.online) || 0;
        for (const [d, n] of Object.entries(state.others.searching || {})) sum.searching[d] = (sum.searching[d] || 0) + (Number(n) || 0);
        for (const [r, n] of Object.entries(state.others.byRegion || {})) if (r !== this.config.self && !(r in sum.byRegion)) sum.byRegion[r] = Number(n) || 0;
      }
    }
    return sum;
  }

  /** Arbiter: a command for another region's current generation, delivered with its next post. */
  send(region, cmd) {
    if (!this.outbox.has(region)) this.outbox.set(region, []);
    this.outbox.get(region).push({ cmd, gen: this.peers.get(region)?.state?.gen ?? null });
  }

  /** Not the arbiter: post this server's state; run what comes back. */
  async poll() {
    if (this.polling) { this.repoll = true; return; }
    this.polling = true;
    // (fork) the arbiter's socket host when it has one (SP_REGION_SOCKETS)
    const host = peerHostOf(this.config, this.config.arbiter);
    const results = this.results;
    this.results = [];
    try {
      const body = JSON.stringify({ ...this.state(), results });
      const at = this.now();
      const res = await this.fetch(`${isLocalHost(host) ? 'http' : 'https'}://${host}${SYNC_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'stronghold-peer', 'x-sp-peer-time': String(at), 'x-sp-peer-sig': signBody(this.config.secret, at, body) },
        body,
        signal: AbortSignal.timeout(PEER_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reply = await res.json();
      if (this.failing) { this.failing = false; this.log.info?.('[peer] link to the arbiter is back'); }
      this.peers.set(this.config.arbiter, { state: reply, at: this.now() });
      this.noticeRooms();
      for (const cmd of Array.isArray(reply.cmds) ? reply.cmds : []) {
        this.results.push(this.runCommand(cmd));
        this.repoll = true;
      }
    } catch (e) {
      this.results = results.concat(this.results); // nothing was delivered
      if (!this.failing) { this.failing = true; this.log.warn?.(`[peer] link to the arbiter failed: ${e?.message || e}; matchmaking stays local`); }
    } finally {
      this.polling = false;
      if (this.repoll && this.timer) { this.repoll = false; void this.poll(); }
    }
  }

  runCommand(cmd) {
    try {
      return { id: cmd?.id, kind: cmd?.kind, ...(this.onCommand?.(cmd) ?? { ok: false }) };
    } catch (e) {
      this.log.error?.('[peer] command failed', e);
      return { id: cmd?.id, kind: cmd?.kind, ok: false };
    }
  }

  /** Arbiter: a post from another region. @param {any} msg @returns {object} the answer */
  onSync(msg) {
    this.peers.set(msg.region, { state: msg, at: this.now() });
    for (const r of Array.isArray(msg.results) ? msg.results : []) {
      try { this.onResult?.(msg.region, r); } catch (e) { this.log.error?.('[peer] result failed', e); }
    }
    // a deploy may have replaced the generation it was planned for: that one's rooms are not this one's, so it fails
    const cmds = [];
    const queued = this.outbox.get(msg.region) || [];
    this.outbox.delete(msg.region);
    for (const { cmd, gen } of queued) {
      if (gen === (msg.gen ?? null)) { cmds.push(cmd); continue; }
      try { this.onResult?.(msg.region, { id: cmd.id, kind: cmd.kind, ok: false, member: cmd.member }); } catch (e) { this.log.error?.('[peer] result failed', e); }
    }
    const rest = { online: 0, searching: {}, byRegion: {}, rooms: {} };
    for (const { id, state } of this.freshPeers()) {
      if (id === msg.region) continue;
      rest.online += Number(state.online) || 0;
      rest.byRegion[id] = Number(state.online) || 0;
      for (const [d, n] of Object.entries(state.searching || {})) rest.searching[d] = (rest.searching[d] || 0) + (Number(n) || 0);
      // a third region's rooms, for the asker's room browser: only when they share a build
      if (Array.isArray(state.rooms) && compatible(msg, state)) rest.rooms[id] = state.rooms;
    }
    this.noticeRooms();
    return { ...this.state(), digest: null, others: rest, cmds };
  }

  /** POST /_peer/sync (server/http/routes.js). The signature is checked before the body is parsed. */
  async handleHttp(req, res) {
    if (req.method !== 'POST' || !this.isArbiter) { sendError(req, res, 404, 'Not found'); return; }
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > MAX_BODY_BYTES) { sendError(req, res, 413, 'Too large'); return; }
      chunks.push(c);
    }
    const body = Buffer.concat(chunks).toString('utf8');
    if (!verifyBody(this.config.secret, req.headers['x-sp-peer-time'], req.headers['x-sp-peer-sig'], body, this.now())) {
      sendError(req, res, 403, 'Forbidden');
      return;
    }
    let msg;
    try { msg = JSON.parse(body); } catch { sendError(req, res, 400, 'Bad request'); return; }
    if (!msg || !this.config.list.some((r) => r.id === msg.region && r.id !== this.config.self)) { sendError(req, res, 400, 'Bad request'); return; }
    res.setHeader('Cache-Control', 'no-store');
    sendJson(req, res, 200, this.onSync(msg));
  }

  /** /healthz: is the link up? (public, so no addresses or numbers beyond what sys.online shows.) */
  report() {
    return {
      arbiter: this.config.arbiter,
      up: this.isArbiter ? this.freshPeers().length === this.config.list.length - 1 : this.freshPeers().length > 0,
      peers: this.freshPeers().map((p) => ({ id: p.id, gen: p.state.gen ?? null })),
    };
  }
}
