// server/http/trafficDetail.js — (fork) the DEV traffic meter (SERVER COST rule, changes/README.md "Server cost"):
// WebSocket messages and payload bytes per message type (`t`), per room and per second, so a change's server cost can
// be measured in a test match and extrapolated to 300 players (tools/traffic-report.mjs).
//
// Off unless SP_TRAFFIC_METER=1, and never on a production or packaged server (NODE_ENV=production, a generation
// deploy with SP_GEN, or a release tree's marker file): then nothing is created and no socket is wrapped, so it costs
// nothing. On, it is bounded: at most MAX_TYPES message types and MAX_ROOMS rooms (the rest count under "(other)"), and
// the last MAX_SECONDS seconds. It is read with GET /healthz?traffic=1 from the machine itself (`trafficDetail`) and
// reset with ?trafficReset=1; nothing is written anywhere.

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LLM_RELEASE_MARKER } from '../match/llmRelease.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MAX_TYPES = 200;
export const MAX_ROOMS = 1000;
export const MAX_SECONDS = 3600;
const OTHER = '(other)';

/**
 * Is the dev traffic meter on for this process?
 * @param {Record<string, string | undefined>} env
 * @param {string} [root] the server's checkout (a release tree carries LLM_RELEASE_MARKER)
 */
export function trafficMeterEnabled(env, root = REPO_ROOT) {
  if (env.SP_TRAFFIC_METER !== '1') return false;
  if (env.NODE_ENV === 'production' || env.SP_GEN) return false;
  return !existsSync(join(root, LLM_RELEASE_MARKER));
}

/** Length of a ws payload (Buffer, ArrayBuffer, Buffer list or string). */
function payloadBytes(data) {
  if (Array.isArray(data)) return data.reduce((n, b) => n + payloadBytes(b), 0);
  return data && typeof data.byteLength === 'number' ? data.byteLength : typeof data === 'string' ? Buffer.byteLength(data) : 0;
}

const TYPE_AT_START = /^\{\s*"t"\s*:\s*"([^"\\]{1,40})"/;
/**
 * The message type: the `t` of a JSON message (read from its start when `t` comes first, as JSON.stringify of
 * `{ t, … }` writes it; else parsed when small), "binary" for binary frames, "?" otherwise.
 */
export function messageType(data) {
  let s = data;
  if (typeof s !== 'string') {
    if (!data || typeof data.byteLength !== 'number' || Array.isArray(data)) return 'binary';
    const head = Buffer.from(data.buffer ?? data, data.byteOffset ?? 0, Math.min(data.byteLength, 64)).toString('utf8');
    if (!head.startsWith('{')) return 'binary';
    s = data.byteLength <= 64 * 1024 ? Buffer.from(data.buffer ?? data, data.byteOffset ?? 0, data.byteLength).toString('utf8') : head;
  }
  const m = TYPE_AT_START.exec(s);
  if (m) return m[1];
  if (s.length <= 64 * 1024) { try { const t = JSON.parse(s)?.t; if (typeof t === 'string' && t.length <= 40) return t; } catch { /* not JSON */ } }
  return '?';
}

/**
 * The dev traffic meter.
 * @param {{ now?: () => number, roomOf?: (ws: object) => string | null }} [opts] roomOf: the room a socket's session
 *   is in (null: in the lobby)
 */
export function createTrafficDetail({ now = Date.now, roomOf = () => null } = {}) {
  let startedAt = now();
  /** @type {Map<string, { outN: number, outBytes: number, inN: number, inBytes: number }>} */
  let types = new Map();
  /** @type {Map<string, { outN: number, outBytes: number, inN: number, inBytes: number, sockets: Set<object> }>} */
  let rooms = new Map();
  /** @type {Map<number, { outN: number, outBytes: number, inN: number, inBytes: number, open: number }>} */
  let seconds = new Map();
  const live = new Set();
  let socketSeconds = 0; // open sockets summed over the seconds that had traffic (for the per-player rate)

  const row = () => ({ outN: 0, outBytes: 0, inN: 0, inBytes: 0 });
  /** The row of `key`, or of "(other)" once `max` keys are in (the map then holds at most max + 1). */
  const capped = (map, key, max, make) => {
    let r = map.get(key);
    if (r) return r;
    if (map.size < max) { r = make(); map.set(key, r); return r; }
    r = map.get(OTHER);
    if (!r) { r = make(); map.set(OTHER, r); }
    return r;
  };

  function record(dir, ws, data) {
    const bytes = payloadBytes(data);
    const n = dir === 'out' ? 'outN' : 'inN', b = dir === 'out' ? 'outBytes' : 'inBytes';
    const t = capped(types, messageType(data), MAX_TYPES, row);
    t[n]++; t[b] += bytes;
    const room = capped(rooms, String(roomOf(ws) ?? '(lobby)'), MAX_ROOMS, () => ({ ...row(), sockets: new Set() }));
    room[n]++; room[b] += bytes;
    if (room.sockets.size < 64) room.sockets.add(ws);
    const sec = Math.floor(now() / 1000);
    let s = seconds.get(sec);
    if (!s) {
      s = { ...row(), open: live.size };
      seconds.set(sec, s);
      socketSeconds += live.size;
      if (seconds.size > MAX_SECONDS) seconds.delete(seconds.keys().next().value);
    }
    s[n]++; s[b] += bytes;
  }

  return {
    /** Wrap one socket: count every message it sends and receives. */
    attach(ws) {
      live.add(ws);
      const send = ws.send;
      ws.send = function detailSend(data, ...rest) {
        record('out', ws, data);
        return send.call(this, data, ...rest);
      };
      ws.on('message', (data) => record('in', ws, data));
      ws.once('close', () => live.delete(ws));
    },
    /** Start counting again (between test matches). */
    reset() {
      startedAt = now(); types = new Map(); rooms = new Map(); seconds = new Map(); socketSeconds = 0;
    },
    /** The counts (plain JSON): totals, per type, per room, per second (the last up to 120), the peak second. */
    snapshot() {
      const strip = ({ sockets, ...r }) => ({ ...r, ...(sockets ? { sockets: sockets.size } : {}) });
      const total = row();
      for (const t of types.values()) { total.outN += t.outN; total.outBytes += t.outBytes; total.inN += t.inN; total.inBytes += t.inBytes; }
      const secs = [...seconds].map(([t, s]) => ({ t, ...s }));
      const peak = secs.reduce((p, s) => (!p || s.outBytes + s.inBytes > p.outBytes + p.inBytes ? s : p), null);
      return {
        meter: 'dev',
        since: new Date(startedAt).toISOString(),
        seconds: Math.max(1, Math.round((now() - startedAt) / 1000)),
        open: live.size,
        socketSeconds,
        activeSeconds: seconds.size,
        total,
        types: Object.fromEntries([...types].sort((a, b) => (b[1].outBytes + b[1].inBytes) - (a[1].outBytes + a[1].inBytes))),
        rooms: Object.fromEntries([...rooms].map(([k, r]) => [k, strip(r)])),
        peak: peak ? { t: peak.t, outBytes: peak.outBytes, inBytes: peak.inBytes, open: peak.open } : null,
        perSecond: secs.slice(-120),
      };
    },
  };
}

const MB = 1e6, GB = 1e9, DAY = 86400;
/**
 * The summary of a snapshot: MB/s (average over the seconds with traffic, and the peak second) and GB/day, per
 * player (one socket = one player) and extrapolated to `players` concurrent players.
 * @param {ReturnType<ReturnType<typeof createTrafficDetail>['snapshot']>} s
 * @param {number} [players]
 */
export function summarize(s, players = 300) {
  const active = Math.max(1, s.activeSeconds);
  const playerSeconds = Math.max(1, s.socketSeconds);
  const avgOut = s.total.outBytes / active, avgIn = s.total.inBytes / active;
  const perPlayerOut = s.total.outBytes / playerSeconds, perPlayerIn = s.total.inBytes / playerSeconds;
  const peakOpen = Math.max(1, s.peak?.open || 1);
  const peakPerPlayerOut = (s.peak?.outBytes || 0) / peakOpen, peakPerPlayerIn = (s.peak?.inBytes || 0) / peakOpen;
  const r = (x, d = 3) => Number(x.toFixed(d));
  return {
    measured: { seconds: s.seconds, activeSeconds: s.activeSeconds, avgPlayers: r(playerSeconds / active, 2), messagesOut: s.total.outN, messagesIn: s.total.inN,
      outMBps: r(avgOut / MB, 4), inMBps: r(avgIn / MB, 4), peakOutMBps: r((s.peak?.outBytes || 0) / MB, 4), peakInMBps: r((s.peak?.inBytes || 0) / MB, 4) },
    perPlayer: { outMBps: r(perPlayerOut / MB, 5), inMBps: r(perPlayerIn / MB, 5), outGBday: r(perPlayerOut * DAY / GB, 3), inGBday: r(perPlayerIn * DAY / GB, 3),
      peakOutMBps: r(peakPerPlayerOut / MB, 5), peakInMBps: r(peakPerPlayerIn / MB, 5) },
    [`players${players}`]: { outMBps: r(perPlayerOut * players / MB, 3), inMBps: r(perPlayerIn * players / MB, 3),
      outGBday: r(perPlayerOut * players * DAY / GB, 1), inGBday: r(perPlayerIn * players * DAY / GB, 1),
      peakOutMBps: r(peakPerPlayerOut * players / MB, 3), peakInMBps: r(peakPerPlayerIn * players / MB, 3) },
    types: Object.entries(s.types).slice(0, 15).map(([t, v]) => ({ t, outN: v.outN, outKB: r(v.outBytes / 1e3, 1), inN: v.inN, inKB: r(v.inBytes / 1e3, 1),
      share: r((v.outBytes + v.inBytes) / Math.max(1, s.total.outBytes + s.total.inBytes), 3) })),
  };
}
