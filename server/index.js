// server/index.js — process entry & boot (DESIGN §1, §2). Plain node:http + ws, no framework: startServer() below
// wires the modules under server/http/, in this order —
//
//   http/config.js     ROOT, the served directories, the environment (PORT 3000, HOST '::' dual-stack, TRUST_PROXY auto, DEBUG),
//                      which startServer() options go to net.js / lobby.js, the console logger
//   http/websocket.js  session wiring (SessionRegistry → Lobby → Network) and the WebSocket at /ws (maxPayload 64 KB,
//                      permessage-deflate from 1 KB; refused at upgrade with 404 / 429 per network / 503)
//   http/static.js     the static mounts (/ → public/, /data/, /shared/, /sim/ `.js` only), the /data.js browser stand-in,
//                      the content packs (/packs/index.json, /packs/<id>/<file> — the registry is packs.js)
//   http/media.js      /media/bgm/act1 → public/assets/audio/bgm/act1.mp3 (audio addressed without its extension)
//   http/files.js      one file → response: MIME, brotli / gzip + memory cache, ETag / Last-Modified / 304, Cache-Control, ranges
//   http/assetIndex.js the content hashes of public/assets and public/fonts (built in the background, cached in
//                      .cache/asset-hashes.json by path + size + mtime; Spine models share one hash)
//   http/assetViews.js the served /data/assets.json and /data/local-assets.json: every art URL with its hash segment
//                      (/assets/~<hash>/…, immutable when the hash matches); the committed files stay unchanged
//   http/buildTag.js   the build tag of the served browser runtime (/healthz `build`, public/js/ui/buildGuard.js)
//   http/routes.js     the request listener: security headers, 414 / 400 / 405, GET /healthz → JSON status, else static
//   http/traffic.js    the traffic counters: bytes sent per category (assets / audio / code / data) and on the
//                      WebSocket, since the start (GET /healthz?traffic=1)
//   http/loopStats.js  (fork) the event loop's lateness per minute, and match/simMeter.js the server-side simulation
//                      time per minute (both GET /healthz?traffic=1)
//   http/common.js     what every answer shares: security headers, URL split, error page, JSON replies, bare 400
//   http/boot.js       a pending update package first (update.js: old files deleted, the install verified against
//                      MANIFEST.json), banner (Local / LAN / tunnel URLs), port-in-use hint, graceful shutdown on SIGINT /
//                      SIGTERM
//
// Per-network limits for internet clients (see net.js clientAddress; local/LAN peers are exempt): open sockets
// (maxConnectionsPerAddr, refused at upgrade with 429), rooms and running matches (lobby.js).
//
// Operator notices: announce.js watches logs/announce.json (option `noticeFile`, null disables). Planned maintenance:
// maintenance.js watches logs/maintenance.json (option `maintenanceFile`, null disables; scripts/maintenance.mjs). presence.js sends
// the online count and the 搜寻队友 queue sizes (sys.online). Behind scripts/router.mjs (SP_GEN + SP_GEN_FILE, options
// `gen` / `genFile`) generation.js retires this process once the router's generations.json names a newer one.
//
// Programmatic use (tests): `const srv = await startServer({ port: 0, quiet: true }); … await srv.close();`
// The server only auto-listens when this file is the process entry point.

import http from 'node:http';
import path from 'node:path';
import { getData, loadData } from './data.js';
import { ROOT, listenAddress, bindCandidates, serveDirs, makeLogger, parseTrustProxy, assetIndexOptionsFrom } from './http/config.js';
import { WS_MAX_PAYLOAD, createSessionStack, attachWebSocket } from './http/websocket.js';
import { DATA_SHIM_JS, createStaticHandler } from './http/static.js';
import { createPackRegistry } from './packs.js';
import { createResourceManifest } from './resources.js';
import { MIME, COMPRESSIBLE, acceptsGzip, pickEncoding, parseRange } from './http/files.js';
import { BUILD_INPUTS, computeBuildTag, buildTag, resetBuildTag } from './http/buildTag.js';
import { createRequestHandler } from './http/routes.js';
import { createTrafficCounter } from './http/traffic.js';
import { createLoopStats } from './http/loopStats.js';
import { simMeter } from './match/simMeter.js';
import { createAssetIndex } from './http/assetIndex.js';
import { createManifestViews } from './http/assetViews.js';
import { answerClientError } from './http/common.js';
import { lanUrls, displayHost, isProcessEntry, runMain } from './http/boot.js';
import { NoticeBoard } from './announce.js';
import { AltArtLedger } from './altArt.js';
import { MaintenanceBoard } from './maintenance.js';
import { Presence } from './presence.js';
import { GenerationWatch } from './generation.js';
import { GEN_ID_RE } from '../shared/gen.js';

// The public API of this module (tests and tools import it from here); the code lives in ./http/.
export {
  ROOT, WS_MAX_PAYLOAD, DATA_SHIM_JS, MIME, COMPRESSIBLE, BUILD_INPUTS, computeBuildTag, buildTag, resetBuildTag,
  acceptsGzip, pickEncoding, parseRange, createStaticHandler, lanUrls, parseTrustProxy,
};

/**
 * Build and start the HTTP + WebSocket server.
 * @param {{
 *   port?: number, host?: string, quiet?: boolean, log?: object,
 *   publicDir?: string, dataDir?: string, sharedDir?: string, packsDir?: string,
 *   MatchClass?: Function, seedFn?: () => number,
 *   lobbyGraceMs?: number, reconnectWindowMs?: number, heartbeatMs?: number, helloTimeoutMs?: number,
 *   ratePerSec?: number, rateBurst?: number, maxConnections?: number, maxRooms?: number,
 *   maxConnectionsPerAddr?: number, maxRoomsPerAddr?: number, maxMatchesPerAddr?: number, resyncMinGapMs?: number,
 *   heavyPerSec?: number, heavyBurst?: number, trustProxy?: 'auto' | boolean, soloReconnectWindowMs?: number,
 *   noticeFile?: string | null, noticePollMs?: number, maintenanceFile?: string | null, maintenancePollMs?: number,
 *   presencePollMs?: number,
 *   warmResources?: boolean, resourceHashCache?: string | null,
 *   gen?: string | null, genFile?: string | null, genPollMs?: number, altArtDir?: string | null,
 *   assetIndex?: boolean | { cacheFile?: string | null, delayMs?: number },
 * }} [opts]
 *   assetIndex: the content-hash index (default on; false or SP_ASSET_INDEX=0: off — config.js assetIndexOptionsFrom)
 * @returns {Promise<{ port: number, host: string, url: string, server: http.Server, wss: import('ws').WebSocketServer,
 *                     lobby: import('./lobby.js').Lobby, network: import('./net.js').Network,
 *                     registry: import('./net.js').SessionRegistry, packs: ReturnType<typeof createPackRegistry>,
 *                     notices: NoticeBoard | null, presence: Presence, generation: GenerationWatch | null,
 *                     traffic: ReturnType<typeof createTrafficCounter>, assetIndex: ReturnType<typeof createAssetIndex> | null,
 *                     views: ReturnType<typeof createManifestViews> | null, close: () => Promise<void> }>}
 */
export async function startServer(opts = {}) {
  const { port, host } = listenAddress(opts);
  const log = opts.log || makeLogger(!!opts.quiet);
  const { publicDir, dataDir, sharedDir, packsDir } = serveDirs(opts);

  // The process-wide singleton serves the default data dir; a custom dir (tests) gets its own copy.
  const data = opts.dataDir ? loadData(dataDir, { log }) : getData({ dir: dataDir, log });
  const { registry, lobby, network } = createSessionStack(opts, { data, log });
  // content packs (docs/PACKS.md): scanned now — the start log names them — and again whenever their folders change
  const packs = createPackRegistry({ publicDir, dataDir, packsDir }, { log });
  packs.refresh(true);
  // asset preload file list (server/resources.js): hashed in the background now, so the first player does not wait
  const resources = createResourceManifest({ publicDir, log,
    hashCacheFile: opts.resourceHashCache === undefined ? path.join(ROOT, 'node_modules', '.cache', 'sp-resource-hashes.json') : opts.resourceHashCache });
  if (opts.warmResources) resources.warm(); // the real server (below); tests build it only when they ask for it
  // the content hashes of the art (built in the background once listening) and the manifests served with them
  const indexOptions = assetIndexOptionsFrom(opts, publicDir);
  const assetIndex = indexOptions ? createAssetIndex({ publicDir, log, ...indexOptions }) : null;
  const views = assetIndex ? createManifestViews({ dataDir, index: assetIndex, log }) : null;
  const serveStatic = createStaticHandler({ publicDir, dataDir, sharedDir, packsDir, packs, resources, log, assetIndex, views });
  const startedAt = Date.now();
  // The tag is per process (see buildTag): read the browser runtime once, here, not on every /healthz.
  resetBuildTag();
  buildTag();
  const noticeFile = opts.noticeFile === undefined ? path.join(ROOT, 'logs', 'announce.json') : opts.noticeFile;
  const notices = noticeFile ? new NoticeBoard({ file: noticeFile, registry, startedAt, pollMs: opts.noticePollMs, log }) : null;
  const maintenanceFile = opts.maintenanceFile === undefined ? path.join(ROOT, 'logs', 'maintenance.json') : opts.maintenanceFile;
  const maintenance = maintenanceFile
    ? new MaintenanceBoard({ file: maintenanceFile, registry, lobby, startedAt, pollMs: opts.maintenancePollMs, log })
    : null;
  lobby.maintenance = maintenance; // Lobby.startMatch & co. ask maintenance.closed()
  if (notices || maintenance) {
    const lobbyHello = lobby.onHello.bind(lobby);
    lobby.onHello = (session, info) => {
      try { lobbyHello(session, info); } finally { notices?.onHello(session); maintenance?.onHello(session); }
    };
  }
  const presence = new Presence({ network, lobby, pollMs: opts.presencePollMs });
  // behind scripts/router.mjs: this process is one generation (server/generation.js); both set, or neither
  const gen = opts.gen === undefined ? process.env.SP_GEN || null : opts.gen;
  const genFile = opts.genFile === undefined ? process.env.SP_GEN_FILE || null : opts.genFile;
  if (gen && !GEN_ID_RE.test(gen)) throw new Error(`SP_GEN ${JSON.stringify(gen)} is not a generation id`);
  const generation = gen && genFile ? new GenerationWatch({ gen, file: genFile, registry, lobby, pollMs: opts.genPollMs, log }) : null;
  // (fork) picked rooms + journal of the alternate result background (server/altArt.js); only the real server writes it
  if (opts.altArtDir) lobby.altArt = new AltArtLedger({ dir: opts.altArtDir, log, gen });
  if (generation) {
    const helloBefore = lobby.onHello.bind(lobby);
    lobby.onHello = (session, info) => {
      try { helloBefore(session, info); } finally { generation.onHello(session); }
    };
  }

  const traffic = createTrafficCounter();
  const loop = createLoopStats(); // (fork) /healthz?traffic=1 `loop` and `sim`: what blocks the main thread
  const server = http.createServer(createRequestHandler({ serveStatic, health: { startedAt, network, registry, lobby, traffic, assetIndex, views, generation, loop, sim: simMeter, maintenance }, log, trustProxy: network.opts.trustProxy }));
  server.on('clientError', answerClientError);
  const wss = attachWebSocket(server, { network, log, traffic });

  // The address actually bound. The default may fall back to IPv4; the returned host and url follow that.
  let boundHost;
  try {
    // A host with IPv6 switched off refuses '::'. Fall back to IPv4 rather than not booting. Only the default is
    // retried: an explicit HOST is literal (server/http/config.js bindCandidates).
    let bound = null;
    let lastError = null;
    const candidates = bindCandidates(host);
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      try {
        await new Promise((resolve, reject) => {
          const onError = (e) => { server.off('listening', onListening); reject(e); };
          const onListening = () => { server.off('error', onError); resolve(); };
          server.once('error', onError);
          server.once('listening', onListening);
          server.listen(port, candidate);
        });
        bound = candidate;
        break;
      } catch (e) {
        lastError = e;
        const retry = ['EAFNOSUPPORT', 'EADDRNOTAVAIL', 'EINVAL'].includes(e.code) && i < candidates.length - 1;
        if (!retry) break;
        log.warn(`[boot] cannot bind ${candidate} (${e.code}) — falling back to IPv4 only`);
      }
    }
    if (bound === null) throw lastError;
    boundHost = bound;
  } catch (e) {
    network.close(); // stop heartbeat/sweep timers of the half-built server
    assetIndex?.close();
    loop.stop();
    throw e;
  }
  server.on('error', (e) => log.error('[http] server error', e));
  notices?.start();
  maintenance?.start();
  presence.start();
  generation?.start();
  assetIndex?.start();

  const addr = server.address();
  const actualPort = typeof addr === 'object' && addr ? addr.port : port;
  const url = `http://${displayHost(boundHost)}:${actualPort}`;

  let closing = null;
  async function close() {
    if (closing) return closing;
    closing = (async () => {
      try { lobby.shutdown('shutdown'); } catch (e) { log.error('[shutdown] lobby', e); }
      notices?.stop();
      maintenance?.stop();
      presence.stop();
      loop.stop();
      generation?.stop();
      network.close();
      assetIndex?.close();
      await new Promise((resolve) => {
        server.close(() => resolve());
        server.closeIdleConnections?.();
        setTimeout(() => { server.closeAllConnections?.(); }, 500).unref();
      });
      try { wss.close(); } catch { /* ignore */ }
    })();
    return closing;
  }

  return { port: actualPort, host: boundHost, url, server, wss, lobby, network, registry, packs, notices, maintenance, presence, generation, traffic, assetIndex, views, close };
}

// `node server/index.js` / npm start: listen, print the banner, stop on SIGINT / SIGTERM (http/boot.js).
if (isProcessEntry(import.meta.url)) runMain(() => startServer({ warmResources: true, altArtDir: path.join(ROOT, 'logs') }));
