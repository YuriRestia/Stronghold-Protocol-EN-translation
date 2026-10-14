// scripts/router.mjs — the front door for zero-downtime restarts (Caddy → this → one server process per "generation").
// Never restarted by a deploy: scripts/generations.mjs starts the new generation, waits for its /healthz, then rewrites
// generations.json; this re-reads the file when it changes and sends new visitors to the new generation, while the old
// one keeps serving the pages (and the matches) that already run on it. URL layout: shared/gen.js.
//
//   /                      → 302 /_build/<current>/ (query kept: ?room=…, ?lang=…)
//   /_build/<gen>/…        → that generation's port, path unchanged (the server strips the prefix itself); an unknown
//                            or stopped generation answers a small "this version has ended" page (sockets: 404)
//   /healthz               → the router's own status: { ok, router: true, current, gens }
//   anything else          → the current generation (/assets /media /fonts /icons stay unprefixed: shared, CF-cached)
//
// HTTP and WebSocket upgrades are piped as they are (headers untouched: the game server keeps reading CF-Connecting-IP /
// X-Forwarded-For from a loopback peer, server/net.js clientAddress). Plain node, no dependencies.
//
//   SP_GEN_FILE=/opt/stronghold/generations.json PORT=3000 HOST=127.0.0.1 node scripts/router.mjs

import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { GEN_ID_RE, GEN_ROOT, splitGenPath } from '../shared/gen.js';

/**
 * Parse generations.json; null when unusable (the router then keeps the table it had).
 * @param {string} text
 * @returns {{ current: string, gens: Record<string, { port: number }> } | null}
 */
export function parseGenerations(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { return null; }
  if (!raw || typeof raw !== 'object' || typeof raw.current !== 'string' || !raw.gens || typeof raw.gens !== 'object') return null;
  const gens = {};
  for (const [id, g] of Object.entries(raw.gens)) {
    const port = Number(g?.port);
    if (GEN_ID_RE.test(id) && Number.isInteger(port) && port > 0 && port < 65536) gens[id] = { ...g, port };
  }
  return gens[raw.current] ? { current: raw.current, gens } : null;
}

/**
 * Where a request goes.
 * @param {string} url req.url
 * @param {{ current: string, gens: Record<string, { port: number }> } | null} table
 * @returns {{ kind: 'home', location: string } | { kind: 'proxy', port: number } | { kind: 'ended' } | { kind: 'health' } | { kind: 'down' }}
 */
export function route(url, table) {
  const q = url.indexOf('?');
  const path = q < 0 ? url : url.slice(0, q);
  const query = q < 0 ? '' : url.slice(q);
  if (path === '/healthz') return { kind: 'health' };
  if (!table) return { kind: 'down' };
  // the page itself only ever runs inside a generation (an unprefixed copy would follow `current` across deploys)
  if (path === '/' || path === '/index.html') return { kind: 'home', location: `${GEN_ROOT}${table.current}/${query}` };
  if (path.startsWith(GEN_ROOT)) {
    const { gen } = splitGenPath(path);
    const g = gen ? table.gens[gen] : null;
    return g ? { kind: 'proxy', port: g.port } : { kind: 'ended' };
  }
  return { kind: 'proxy', port: table.gens[table.current].port };
}

const ENDED_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stronghold Protocol</title><meta http-equiv="refresh" content="3;url=/"></head>
<body style="background:#0c0f0e;color:#c3cbc7;font-family:sans-serif;text-align:center;padding:48px">
<p>This version of the game has ended. Taking you to the current one…</p><p>该版本已结束，正在前往当前版本…</p>
<p><a href="/" style="color:#7fd1b9">Continue</a></p></body></html>`;

/**
 * Build the router (not listening yet).
 * @param {{ file: string, pollMs?: number, log?: { info: Function, warn: Function } }} opts
 */
export function createRouter({ file, pollMs = 1000, log = console }) {
  /** @type {ReturnType<typeof parseGenerations>} */
  let table = null;
  let stamp = null;
  const load = () => {
    let st;
    try { st = fs.statSync(file); } catch { if (table) log.warn(`[router] ${file} is gone; keeping current ${table.current}`); stamp = null; return; }
    const next = `${st.mtimeMs}:${st.size}`;
    if (next === stamp) return;
    let parsed = null;
    try { parsed = parseGenerations(fs.readFileSync(file, 'utf8')); } catch { /* half-written: next poll */ }
    if (!parsed) { log.warn(`[router] ignored unusable ${file}`); return; }
    stamp = next;
    if (table?.current !== parsed.current) log.info(`[router] current generation: ${parsed.current} (port ${parsed.gens[parsed.current].port})`);
    table = parsed;
  };
  load();
  const timer = setInterval(load, pollMs);
  timer.unref?.();

  const server = http.createServer((req, res) => {
    const r = route(req.url || '/', table);
    if (r.kind === 'health') {
      const body = JSON.stringify({ ok: !!table, router: true, current: table?.current ?? null, gens: table ? Object.keys(table.gens) : [] });
      res.writeHead(table ? 200 : 503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(body);
      return;
    }
    if (r.kind === 'down') { res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '5' }); res.end('Starting up, try again in a few seconds.\n'); return; }
    if (r.kind === 'home') { res.writeHead(302, { Location: r.location, 'Cache-Control': 'no-store' }); res.end(); return; }
    // 410 Gone (not 404): public/js/ui/buildGuard.js moves a page whose generation's /healthz says it is gone
    if (r.kind === 'ended') { res.writeHead(410, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(ENDED_HTML); return; }
    const up = http.request({ host: '127.0.0.1', port: r.port, method: req.method, path: req.url, headers: req.headers }, (ur) => {
      res.writeHead(ur.statusCode || 502, ur.headers);
      ur.pipe(res);
    });
    up.on('error', () => {
      if (!res.headersSent) { res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '5' }); res.end('Game server unavailable.\n'); } else res.destroy();
    });
    req.pipe(up);
  });

  // WebSocket upgrades: forward the raw request, then splice the two sockets
  server.on('upgrade', (req, socket, head) => {
    socket.on('error', () => {});
    const r = route(req.url || '/', table);
    if (r.kind !== 'proxy') { socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); return; }
    const up = net.connect(r.port, '127.0.0.1', () => {
      const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      up.write(`${lines.join('\r\n')}\r\n\r\n`);
      if (head?.length) up.write(head);
      up.pipe(socket);
      socket.pipe(up);
    });
    up.on('error', () => socket.destroy());
    socket.on('close', () => up.destroy());
    up.on('close', () => socket.destroy());
  });

  return { server, table: () => table, reload: load, close: () => { clearInterval(timer); return new Promise((ok) => server.close(() => ok())); } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.env.SP_GEN_FILE || '/opt/stronghold/generations.json';
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  const { server } = createRouter({ file });
  server.keepAliveTimeout = 65_000;
  server.listen(port, host, () => console.log(`[router] listening on ${host}:${port}, table ${file}`));
  const stop = () => { console.log('[router] stopping'); server.close(); setTimeout(() => process.exit(0), 500).unref(); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
