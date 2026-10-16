// server/http/boot.js — running the server as a process (`node server/index.js`, npm start, scripts/launch.mjs, the
// Windows service's scripts/run-server.cmd, NSSM, systemd):
//
//   * first, an update package extracted over the install (UPDATE.json) is finished — old files deleted, the install
//     verified (server/update.js); one that does not match its MANIFEST.json keeps the server from starting (exit 1);
//   * the boot banner: release version, the Local URL, the LAN URLs when listening on every interface, the plugin
//     studio's address with its key (server/studio/key.js: this machine and the local network only), the cloudflared
//     command for internet play;
//   * a server that cannot start exits 1 (with a hint when the port is in use); unhandled rejections and uncaught
//     exceptions are logged, not fatal;
//   * graceful shutdown on SIGINT/SIGTERM (rooms get room.closed{reason:'shutdown'}, sockets close 1001); a second
//     signal exits at once, and the process exits anyway 5 s after the first. Ctrl+C in a terminal while matches are
//     live warns first (interruptGuard), and a second press within 10 s stops.

import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { APP_VERSION, DEV_BUILD } from '../../shared/constants.js';
import { limitKeyOf } from '../net.js';
import { applyPendingUpdate } from '../update.js';
import { ROOT } from './config.js';

/**
 * Non-internal addresses as http URLs — IPv4 first, then IPv6 (an IPv6 literal needs brackets: `http://[240e:…]:3000`).
 * Link-local (`fe80::`) is left out: a URL cannot carry the zone id. Several privacy addresses in one /64 collapse
 * to one URL (`limitKeyOf`).
 * @param {number} port
 */
export function lanUrls(port) {
  const v4 = [];
  const v6 = [];
  const v6Seen = new Set();
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.internal) continue;
      if (a.family === 'IPv4' || a.family === 4) { v4.push(`http://${a.address}:${port}`); continue; }
      if (a.family !== 'IPv6' && a.family !== 6) continue;
      if (/^fe80:/i.test(a.address)) continue;
      const prefix = limitKeyOf(a.address);
      if (v6Seen.has(prefix)) continue;
      v6Seen.add(prefix);
      v6.push(`http://[${a.address}]:${port}`);
    }
  }
  return [...v4, ...v6];
}

/**
 * The host as it appears in the local URL. A wildcard bind (`0.0.0.0` or `::`) reads `localhost`. An IPv6 literal
 * is bracketed (`http://[2001:db8::1]:3000`); an IPv4 address or a name is kept.
 * @param {string} host
 */
export function displayHost(host) {
  if (host === '0.0.0.0' || host === '::') return 'localhost';
  return host.includes(':') ? `[${host}]` : host;
}

/** Is the module whose `import.meta.url` is `metaUrl` the file node was started with? */
export function isProcessEntry(metaUrl) {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(metaUrl));
  } catch {
    return false;
  }
}

/**
 * Print the boot banner of a started server.
 * @param {{ url: string, host: string, port: number, studio?: { pageUrl: (base: string) => string | null } | null }} srv
 */
export function printBanner(srv) {
  console.log(`\n  卫戍协议：盟约 · Stronghold Protocol: Alliance v${APP_VERSION}`);
  if (DEV_BUILD) console.log('  ! 开发版（dev 分支）：不稳定，请勿用于公开服务器 · development build — unstable, not for public servers');
  console.log(`  Local:   ${srv.url}`);
  if (srv.host === '0.0.0.0' || srv.host === '::') {
    for (const u of lanUrls(srv.port)) console.log(`  LAN:     ${u}`);
  }
  // the plugin studio with its key: what a change in it needs (a raw TCP tunnel looks like this machine; the key does not)
  const studio = srv.studio?.pageUrl?.(srv.url);
  if (studio) console.log(`  Studio:  ${studio}  (插件工作台 · plugin studio — this machine and the LAN; the link carries its key)`);
  console.log('  Internet: cloudflared tunnel --url ' + `http://localhost:${srv.port}`);
  console.log('  Stop:    Ctrl+C (asks first while matches are running) · to update without ending them: npm run maintenance -- --help\n');
}

/** How long a Ctrl+C warning waits for the confirming second press. */
export const INTERRUPT_CONFIRM_MS = 10000;

/**
 * The Ctrl+C guard of runMain: returns the warning to print instead of stopping, or null to stop now. It warns only
 * for an interactive terminal with live matches, and not again within INTERRUPT_CONFIRM_MS (that press confirms).
 * @param {{ interactive: boolean, liveMatches: () => number, now?: () => number }} o
 * @returns {() => string | null}
 */
export function interruptGuard({ interactive, liveMatches, now = Date.now }) {
  let warnedAt = -Infinity;
  return () => {
    if (!interactive) return null;
    let live;
    try { live = liveMatches(); } catch { live = 0; }
    if (live <= 0 || now() - warnedAt <= INTERRUPT_CONFIRM_MS) return null;
    warnedAt = now();
    return `\n  ${live} match(es) in progress: stopping now ends ${live === 1 ? 'it' : 'them'}.\n`
      + `  Press Ctrl+C again within ${INTERRUPT_CONFIRM_MS / 1000} s to stop anyway, or stop once ${live === 1 ? 'it ends' : 'they end'}:\n`
      + '    npm run maintenance -- --close --stop-when-idle   (in another terminal; docs/DEPLOY.md 1.6)';
  };
}

/**
 * The process main: finish a pending update package, start the server, print the banner, stop gracefully on SIGINT /
 * SIGTERM.
 * @param {() => Promise<{ url: string, host: string, port: number, close: () => Promise<void> }>} start index.js startServer
 */
export async function runMain(start) {
  process.on('unhandledRejection', (e) => console.error('[process] unhandled rejection', e));
  process.on('uncaughtException', (e) => console.error('[process] uncaught exception', e));
  // before the data, the packs or the browser runtime are read: the files must be the new version's (server/update.js).
  // Nothing is listening yet, so returning ends the process with exit code 1 once the message is written.
  if (applyPendingUpdate(ROOT).state === 'failed') { process.exitCode = 1; return; }
  let srv;
  try {
    srv = await start();
  } catch (e) {
    if (e && e.code === 'EADDRINUSE') console.error(`端口已被占用 / port in use: ${e.port ?? process.env.PORT ?? 3000}. Try PORT=3001 npm start`);
    else console.error('[boot] failed to start', e);
    process.exit(1);
  }
  printBanner(srv);

  let stopping = false;
  const stop = (signal) => {
    if (stopping) { console.log('forced exit'); process.exit(1); }
    stopping = true;
    console.log(`\n[${signal}] shutting down…`);
    setTimeout(() => process.exit(0), 5000).unref();
    srv.close().then(() => process.exit(0), () => process.exit(1));
  };
  // Ctrl+C typed in the server's terminal while matches are live asks first (scripts/maintenance.mjs stops once they end);
  // a non-terminal SIGINT and SIGTERM (systemd, NSSM, Docker, the Windows service) stop at once, as before
  const interrupt = interruptGuard({ interactive: !!process.stdout.isTTY, liveMatches: () => srv.lobby?.stats().matches ?? 0 });
  process.on('SIGINT', () => {
    const warning = stopping ? null : interrupt();
    if (warning) console.log(warning);
    else stop('SIGINT');
  });
  process.on('SIGTERM', () => stop('SIGTERM'));
  // scripts/maintenance.mjs --stop-when-idle: the same clean shutdown once no match is live (server/maintenance.js)
  if (srv.maintenance) srv.maintenance.onStop = () => stop('maintenance');
}
