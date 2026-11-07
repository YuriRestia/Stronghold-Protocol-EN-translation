// server/crossMatch.js — (fork) matchmaking across regions (DESIGN §90.2). Each server matches its own searches first; one
// that has waited `crossAfterMs` also enters this pass, on the arbiter (server/regions.js), with the other regions' waiters
// reported over server/peerLink.js. A cross-region plan is always an exact fill to MAX_SEATS: nobody is ever moved into a
// room that does not start at once, and nobody moves twice. Partial merges stay local.
//
//   1. reserve  the target server (the region with the most humans; a tie: the longest wait) merges its own members into one
//               room and holds seats for the others (Lobby.crossReserve), answering a signed ticket
//   2. move     each other server checks its members are still waiting and sends them room.move { region, code, ticket }
//               (Lobby.crossMove); a member that changed its mind is `release`d, and the seats reopen
//   3. arrive   the browsers connect to the target and join with the ticket; the match starts when the last one sits down.
//               Seats nobody claimed expire (Lobby.expireReservations) and that room goes on searching.
//
// planCross is pure; CrossMatch runs on the arbiter only.

import { randomBytes } from 'node:crypto';
import { MAX_SEATS } from '../shared/constants.js';
import { planMerges } from './matchmaker.js';
import { planSolos } from './soloQueue.js';
import { compatible } from './peerLink.js';

/** Seats and tickets wait this long for a moved group (a cold socket through Cloudflare takes a second or two). */
export const RESERVE_TTL_MS = 15_000;
/** A plan with no outcome by then is forgotten, and its members may be planned again. */
export const PLAN_TTL_MS = 25_000;

/** A digest entry as a room the pure matchmakers can read. */
function pseudoRoom(region, e, now) {
  const seats = [];
  for (let i = 0; i < e.humans; i++) seats.push({ playerId: `h${i}`, connected: true, ready: true });
  for (let i = 0; i < e.bots; i++) seats.push({ playerId: `b${i}`, isBot: true });
  while (seats.length < MAX_SEATS) seats.push(null);
  return { code: e.code, region, wait: e.wait, humans: e.humans, bots: e.bots, seats, hostId: 'h0', mode: 'coop', searching: true, difficulty: e.difficulty, searchSince: now - e.wait };
}

/**
 * This pass's cross-region plans. Pure.
 * @param {{ id: string, rooms: { code: string, humans: number, bots: number, difficulty: string, wait: number }[],
 *   solos: { id: string, difficulty: string, wait: number }[] }[]} regions every region's waiters
 * @param {number} now
 * @param {{ crossAfterMs: number, busy?: Set<string> }} opts busy: `room:<code>` / `solo:<id>` already in a plan
 * @returns {{ difficulty: string, target: string, members: { region: string, rooms: string[], solos: string[], humans: number, bots: number }[] }[]}
 */
export function planCross(regions, now, { crossAfterMs, busy = new Set() }) {
  const rooms = [];
  const solos = [];
  for (const r of regions) {
    for (const e of r.rooms || []) if (e.wait >= crossAfterMs && !busy.has(`room:${e.code}`)) rooms.push(pseudoRoom(r.id, e, now));
    for (const e of r.solos || []) if (e.wait >= crossAfterMs && !busy.has(`solo:${e.id}`)) solos.push({ playerId: e.id, region: r.id, difficulty: e.difficulty, since: now - e.wait, wait: e.wait });
  }
  solos.sort((a, b) => a.since - b.since || (a.playerId < b.playerId ? -1 : 1));
  const raw = [];
  const taken = new Set();
  for (const p of planSolos(rooms, solos)) {
    if (p.room) taken.add(p.room);
    raw.push({ difficulty: p.entries[0].difficulty, rooms: p.room ? [p.room] : [], solos: p.entries });
  }
  for (const p of planMerges(rooms.filter((r) => !taken.has(r)), now, { partialMergeAfterMs: 0 })) {
    raw.push({ difficulty: p.target.difficulty, rooms: [p.target, ...p.sources], solos: [] });
  }
  const plans = [];
  for (const p of raw) {
    const by = new Map();
    const member = (region) => {
      if (!by.has(region)) by.set(region, { region, rooms: [], solos: [], humans: 0, bots: 0, wait: 0 });
      return by.get(region);
    };
    for (const r of p.rooms) { const m = member(r.region); m.rooms.push(r.code); m.humans += r.humans; m.bots += r.bots; m.wait = Math.max(m.wait, r.wait); }
    for (const e of p.solos) { const m = member(e.region); m.solos.push(e.playerId); m.humans += 1; m.wait = Math.max(m.wait, e.wait); }
    if (by.size < 2) continue; // one server's own matchmaker takes this
    const members = [...by.values()];
    const best = [...members].sort((a, b) => b.humans - a.humans || b.wait - a.wait || (a.region < b.region ? -1 : 1))[0];
    plans.push({ difficulty: p.difficulty, target: best.region, members: members.map(({ wait, ...m }) => m) });
  }
  return plans;
}

export class CrossMatch {
  /**
   * @param {{ config: any, lobby: any, link: import('./peerLink.js').PeerLink, now?: () => number, log?: any }} opts
   */
  constructor({ config, lobby, link, now = Date.now, log = {} }) {
    this.config = config;
    this.lobby = lobby;
    this.link = link;
    this.now = now;
    this.log = log;
    /** @type {Map<string, { plan: any, code: string | null, rid: string | null, at: number, keys: string[] }>} */
    this.inflight = new Map();
    link.onCommand = (cmd) => this.run(cmd);
    if (link.isArbiter) {
      link.onTick = () => this.pass();
      link.onResult = (region, res) => this.result(res);
    }
  }

  /** A command here, wherever it was planned. */
  run(cmd) {
    switch (cmd?.kind) {
      case 'reserve': return this.lobby.crossReserve(cmd);
      case 'move': return this.lobby.crossMove(cmd);
      case 'release': return this.lobby.crossRelease(cmd);
      default: return { ok: false };
    }
  }

  /** To a region: run here when that is this server, else queued for its next post. */
  order(region, cmd) {
    if (region !== this.config.self) { this.link.send(region, cmd); return; }
    this.result({ id: cmd.id, kind: cmd.kind, ...this.run(cmd) });
  }

  /** One planning pass on the arbiter. */
  pass() {
    const now = this.now();
    const busy = new Set();
    for (const [id, f] of this.inflight) {
      if (now - f.at > PLAN_TTL_MS) { this.inflight.delete(id); continue; }
      for (const k of f.keys) busy.add(k);
    }
    const mine = this.link.state();
    if (!mine.digest) return;
    const regions = [{ id: this.config.self, ...mine.digest }];
    // a peer on another build plays other rules: during a rolling deploy each server is local again
    for (const { id, state } of this.link.freshPeers()) if (state.digest && compatible(mine, state)) regions.push({ id, ...state.digest });
    if (regions.length < 2) return;
    for (const plan of planCross(regions, now, { crossAfterMs: this.config.crossAfterMs, busy })) this.start(plan);
  }

  start(plan) {
    const id = randomBytes(6).toString('hex');
    const keys = [];
    for (const m of plan.members) {
      for (const c of m.rooms) keys.push(`room:${c}`);
      for (const s of m.solos) keys.push(`solo:${s}`);
    }
    this.inflight.set(id, { plan, code: null, rid: null, at: this.now(), keys });
    const home = plan.members.find((m) => m.region === plan.target);
    const incoming = plan.members.filter((m) => m !== home);
    this.log.info?.(`[cross] ${plan.difficulty} match on ${plan.target}: ${plan.members.map((m) => `${m.region} ${m.humans}+${m.bots}`).join(', ')}`);
    this.order(plan.target, {
      id, kind: 'reserve', difficulty: plan.difficulty, rooms: home.rooms, solos: home.solos,
      humans: incoming.reduce((n, m) => n + m.humans, 0), bots: incoming.reduce((n, m) => n + m.bots, 0), ttlMs: RESERVE_TTL_MS,
    });
  }

  /** A command's outcome, from any region. */
  result(res) {
    const f = this.inflight.get(res?.id);
    if (!f) return;
    const { plan } = f;
    if (res.kind === 'reserve') {
      if (!res.ok) { this.inflight.delete(res.id); return; } // the target changed meanwhile: nobody moved, plan again
      f.code = res.code;
      f.rid = res.rid;
      f.left = plan.members.length - 1;
      for (const m of plan.members) {
        if (m.region === plan.target) continue;
        this.order(m.region, { id: res.id, kind: 'move', member: m.region, region: plan.target, code: res.code, ticket: res.ticket, rooms: m.rooms, solos: m.solos, humans: m.humans, bots: m.bots });
      }
      return;
    }
    if (res.kind === 'move') {
      if (!res.ok) {
        const m = plan.members.find((x) => x.region === res.member);
        if (m) this.order(plan.target, { id: `${res.id}r`, kind: 'release', code: f.code, rid: f.rid, humans: m.humans });
      }
      if (--f.left <= 0) this.inflight.delete(res.id);
    }
  }
}
