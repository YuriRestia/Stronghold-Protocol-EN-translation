// server/regions.js — (fork) this server's place among several (DESIGN §8.7; the rules of keys: shared/regions.js). All off
// unless the operator names the regions: without SP_REGIONS / SP_REGION a server behaves as it always did.
//
//   SP_REGIONS       sg=stronghold-en.dev,us=us.stronghold-en.dev   every region, the same text on each; the page's domain
//                    first. The first region is the arbiter of cross-region matchmaking (server/crossMatch.js).
//   SP_REGION        sg                  which one this server is
//   SP_REGION_AUTO   1                   browsers pick the faster region by themselves; off, a browser stays on the page's
//                                        server unless it asks with ?region=<id> (the operator's private test)
//   SP_CROSS_MATCH   1                   matchmaking across regions (needs SP_PEER_SECRET)
//   SP_PEER_SECRET   <text, 32+ chars>   signs the calls between servers and the tickets of a moved group; the same on
//                                        every region, never in git
//   SP_CROSS_AFTER_MS 15000              how long a search stays local before it may cross regions
//   SP_REGION_SOCKETS sg=sg.example.com  (fork) optional per-region socket host. Browsers use it for the socket and the
//                                        ping test, and the region's host when it cannot be reached; the link between
//                                        the servers posts to it. The same text on every region; a region without an
//                                        entry keeps its host for everything.

import { parseRegions, regionLetters, isLocalHost, isRegionHost } from '../shared/regions.js';

export const CROSS_AFTER_MS = 15_000;
export const PEER_SECRET_MIN_LEN = 32;

/**
 * @param {Record<string, string | undefined>} [env]
 * @param {{ warn?: (text: string) => void }} [log]
 * @returns {{ self: string, list: { id: string, host: string }[], letters: string, arbiter: string, auto: boolean,
 *   crossMatch: boolean, secret: string | null, crossAfterMs: number } | null}
 */
/**
 * (fork) `SP_REGION_SOCKETS` → `{ [id]: host }` for the regions of `list`. An entry for an unknown region, a bad host or a
 * host equal to the region's own is left out (warned): that region keeps its host.
 * @param {unknown} raw @param {{ id: string, host: string }[]} list @param {{ warn?: (text: string) => void }} [log]
 * @returns {Record<string, string>}
 */
export function parseRegionSockets(raw, list, log = {}) {
  const out = {};
  if (typeof raw !== 'string' || !raw.trim()) return out;
  for (const part of raw.split(',')) {
    const at = part.indexOf('=');
    const id = at < 0 ? '' : part.slice(0, at).trim();
    const host = at < 0 ? '' : part.slice(at + 1).trim();
    const region = list.find((r) => r.id === id);
    if (!region || !isRegionHost(host) || host === region.host || id in out) {
      log.warn?.(`[regions] SP_REGION_SOCKETS entry "${part.trim()}" ignored: needs id=host for a listed region and a host of its own`);
      continue;
    }
    out[id] = host;
  }
  return out;
}

export function regionConfigFrom(env = process.env, log = {}) {
  const raw = env.SP_REGIONS;
  if (!raw) return null;
  const sockets = parseRegionSockets(env.SP_REGION_SOCKETS, parseRegions(raw), log);
  // (fork) `socket`: the region's socket host, when it has one (SP_REGION_SOCKETS)
  const list = parseRegions(raw).map((r) => (sockets[r.id] ? { ...r, socket: sockets[r.id] } : r));
  const self = String(env.SP_REGION || '').trim();
  if (!list.length || !list.some((r) => r.id === self)) {
    log.warn?.(`[regions] SP_REGIONS / SP_REGION ignored: need two or more id=host entries and this server's id, got "${raw}" / "${self}"`);
    return null;
  }
  let secret = String(env.SP_PEER_SECRET || '').trim() || null;
  if (secret && secret.length < PEER_SECRET_MIN_LEN) {
    log.warn?.(`[regions] SP_PEER_SECRET ignored: at least ${PEER_SECRET_MIN_LEN} characters are required; the servers stay unlinked`);
    secret = null;
  }
  const after = Number(env.SP_CROSS_AFTER_MS);
  return {
    self,
    list,
    letters: regionLetters(list, self),
    arbiter: list[0].id,
    auto: env.SP_REGION_AUTO === '1',
    crossMatch: env.SP_CROSS_MATCH === '1' && !!secret,
    secret,
    crossAfterMs: Number.isFinite(after) && after >= 0 ? after : CROSS_AFTER_MS,
  };
}

/**
 * The sources the page's policy adds to connect-src for the other regions' sockets (server/http/csp.js). (fork) Every
 * region's socket host too, this one's included: the page's own host is 'self', its socket host is not.
 */
export function regionConnectSources(config) {
  if (!config) return [];
  const ws = (host) => `${isLocalHost(host) ? 'ws' : 'wss'}://${host}`;
  const out = [];
  for (const r of config.list) {
    if (r.id !== config.self) out.push(ws(r.host));
    if (r.socket) out.push(ws(r.socket));
  }
  return [...new Set(out)];
}

/** (fork) The host this server reaches another region on: its socket host when it has one (server/peerLink.js). */
export function peerHostOf(config, id) {
  const r = config?.list.find((x) => x.id === id);
  return r ? r.socket || r.host : null;
}

/** What a page reads of the regions in /healthz (never the secret). */
export function regionsReport(config) {
  return config ? { self: config.self, list: config.list, auto: config.auto } : null;
}
