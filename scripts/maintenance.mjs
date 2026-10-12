// Planned maintenance, for the operator of a running server (see server/maintenance.js; docs/DEPLOY.md §1.6).
// Also `npm run maintenance -- …`. For a server started by hand from source, one line updates it (README):
//   npm run maintenance -- --close --stop-when-idle --back-in 20 --wait && git checkout -- data/assets.json && git pull && npm ci && scripts/start.sh
//
//   node scripts/maintenance.mjs --status            live rooms / matches / players, and the maintenance in force
//   node scripts/maintenance.mjs --in 15             countdown for every player: "Server maintenance in 14:59"
//   node scripts/maintenance.mjs --at 21:30          …or at a clock time (this machine's local time; tomorrow if past)
//   node scripts/maintenance.mjs --close             no new matches from now on (running matches play on)
//   node scripts/maintenance.mjs --open              allow new matches again (keeps the countdown)
//   node scripts/maintenance.mjs --stop-when-idle    stop the server cleanly as soon as no match is live (once)
//   node scripts/maintenance.mjs --keep-running      cancel --stop-when-idle (keeps the rest)
//   node scripts/maintenance.mjs --back-in 20        expected downtime, shown to players (or --back-at 21:45)
//   node scripts/maintenance.mjs --message "…"       a line of text in the players' bar (--message "" removes it)
//   node scripts/maintenance.mjs --wait              after the rest: wait until the server has stopped (needs
//                                                    --stop-when-idle); exit 0 = stopped, 1 = no server answering,
//                                                    3 = it was started again meanwhile (a service manager), 130 = Ctrl+C
//   node scripts/maintenance.mjs --cancel            remove all of it (the countdown bar disappears)
//   node scripts/maintenance.mjs --status --json     the same as JSON: { file, server } (for scripts; a stable shape)
//
// Options combine and add to what is already set: `--in 15 --close --stop-when-idle` in one go, or one at a time.
// Reaching the time does nothing by itself: matches are never cut. Stopping only happens with --stop-when-idle
// (when the last match ends) or when you stop the server; starting it again is up to you (or your service manager).
// Writes logs/maintenance.json; the server picks it up within ~2 s. A file written while the server was down is
// ignored by the next start. On the VPS, run it as the service user:
//   cd /opt/stronghold/app && sudo -u stronghold node scripts/maintenance.mjs --close
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_MINUTES = 7 * 24 * 60;

const MESSAGE_MAX = 200; // server/maintenance.js MAINTENANCE_MESSAGE_MAX
const WAIT_POLL_MS = 2000;

const USAGE = `Usage:
  node scripts/maintenance.mjs --status [--json]                   what the server is doing, and the maintenance in force
  node scripts/maintenance.mjs [--in MIN | --at HH:MM] [--close | --open] [--stop-when-idle | --keep-running]
                               [--back-in MIN | --back-at HH:MM] [--message TEXT] [--wait]
  node scripts/maintenance.mjs --cancel                            remove the maintenance
Options: --file <path> (default logs/maintenance.json), --port <n> of the server (default $PORT or 3000),
--host <address> where it listens (default: 127.0.0.1, then ::1).
--wait blocks until the server has stopped (needs --stop-when-idle): exit 0 stopped, 1 no server answering,
3 started again meanwhile, 130 interrupted. Docs: docs/DEPLOY.md section 1.6.`;

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

/**
 * The next local HH:MM after `now` (today, or tomorrow when it has passed).
 * @param {string} hhmm
 * @param {number} now
 * @returns {number | null}
 */
export function nextClockTime(hhmm, now) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  const d = new Date(now);
  d.setHours(h, min, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return d.getTime();
}

/**
 * The new maintenance state from the current one and the options (null = nothing left: remove the file).
 * @param {{ at?: number | null, closed?: boolean, stopWhenIdle?: boolean, backIn?: number | null, backAt?: number | null,
 *   message?: string | null } | null} cur
 * @param {{ in?: string, at?: string, close?: boolean, open?: boolean, 'stop-when-idle'?: boolean, 'keep-running'?: boolean,
 *   'back-in'?: string, 'back-at'?: string, message?: string }} opt
 * @param {number} now
 * @returns {{ createdAt: number, at: number | null, closed: boolean, stopWhenIdle: boolean, backIn: number | null,
 *   backAt: number | null, message: string | null } | null}
 */
export function nextState(cur, opt, now) {
  if (opt.in != null && opt.at != null) throw new Error('Use either --in or --at, not both.');
  if (opt.close && opt.open) throw new Error('Use either --close or --open, not both.');
  if (opt['stop-when-idle'] && opt['keep-running']) throw new Error('Use either --stop-when-idle or --keep-running, not both.');
  let at = Number.isFinite(cur?.at) ? cur.at : null;
  if (opt.in != null) {
    const minutes = Number(opt.in);
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > MAX_MINUTES) throw new Error(`--in must be a number of minutes from 1 to ${MAX_MINUTES}.`);
    at = now + Math.round(minutes * 60000);
  }
  if (opt.at != null) {
    at = nextClockTime(opt.at, now);
    if (at == null) throw new Error('--at must be a time like 21:30 (24-hour clock).');
  }
  let closed = cur?.closed === true;
  if (opt.close) closed = true;
  if (opt.open) closed = false;
  let stopWhenIdle = cur?.stopWhenIdle === true;
  if (opt['stop-when-idle']) stopWhenIdle = true;
  if (opt['keep-running']) stopWhenIdle = false;
  if (opt['back-in'] != null && opt['back-at'] != null) throw new Error('Use either --back-in or --back-at, not both.');
  let backIn = Number.isFinite(cur?.backIn) ? cur.backIn : null;
  let backAt = Number.isFinite(cur?.backAt) ? cur.backAt : null;
  if (opt['back-in'] != null) {
    const minutes = Number(opt['back-in']);
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > MAX_MINUTES) throw new Error(`--back-in must be a number of minutes from 1 to ${MAX_MINUTES}.`);
    backIn = minutes;
    backAt = null;
  }
  if (opt['back-at'] != null) {
    backAt = nextClockTime(opt['back-at'], now);
    if (backAt == null) throw new Error('--back-at must be a time like 21:45 (24-hour clock).');
    backIn = null;
  }
  let message = typeof cur?.message === 'string' ? cur.message : null;
  if (opt.message != null) {
    const text = String(opt.message).trim();
    if (text.length > MESSAGE_MAX) throw new Error(`--message is too long: ${text.length} characters (max ${MESSAGE_MAX}).`);
    message = text || null;
  }
  const any = at != null || closed || stopWhenIdle || message;
  return any ? { createdAt: now, at, closed, stopWhenIdle, backIn, backAt, message } : null;
}

/** One line per part of a state, for the terminal. */
export function describe(s, now = Date.now()) {
  if (!s) return ['No maintenance set.'];
  const lines = [];
  if (Number.isFinite(s.at)) {
    const left = s.at - now;
    lines.push(left > 0
      ? `Countdown to ${new Date(s.at).toLocaleString()} (${Math.ceil(left / 60000)} min left).`
      : `Maintenance time ${new Date(s.at).toLocaleString()} has passed (players see "maintenance now").`);
  }
  lines.push(s.closed ? 'Closed: no new matches.' : 'Open: new matches allowed.');
  if (s.stopWhenIdle) lines.push('The server stops as soon as no match is live.');
  if (Number.isFinite(s.backAt)) lines.push(`Players are told it is back around ${new Date(s.backAt).toLocaleString()}.`);
  else if (Number.isFinite(s.backIn)) lines.push(`Players are told it is down for about ${s.backIn} min.`);
  if (s.message) lines.push(`Message: ${s.message}`);
  return lines;
}

function readState(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function writeFailed(e, file) {
  if (e?.code === 'EACCES' || e?.code === 'EPERM') {
    fail(`Permission denied writing ${file}.\nOn the server run it as the service user: sudo -u stronghold node scripts/maintenance.mjs …`);
  }
  fail(`Could not write ${file}: ${e?.message || e}`);
}

const PROBE_TIMEOUT_MS = 10000;
/** Where to look for the server: --host, else IPv4 then IPv6 loopback (the default bind `::` answers both). */
let PROBE_HOSTS = ['127.0.0.1', '::1'];
const urlOf = (host, port) => `http://${host.includes(':') ? `[${host}]` : host}:${port}/healthz`;

/**
 * Ask every candidate address for /healthz. `ours`: the first answer that is this game's server (a JSON body with
 * `ok` and `version`). Otherwise one entry per address: `refused` (nothing listens there), `timeout` (no answer within
 * PROBE_TIMEOUT_MS: maybe busy), `other` (something else answers: another program on the port), `error`.
 * @returns {Promise<{ ours: any, host?: string, tries: Array<{ host: string, kind: string, detail: string }> }>}
 */
export async function probe(port, hosts = PROBE_HOSTS, timeoutMs = PROBE_TIMEOUT_MS) {
  const tries = [];
  for (const host of hosts) {
    try {
      const res = await fetch(urlOf(host, port), { signal: AbortSignal.timeout(timeoutMs) });
      let body = null;
      try { body = await res.json(); } catch { /* not JSON */ }
      if (res.ok && body && body.ok === true && body.version != null) return { ours: body, host, tries };
      tries.push({ host, kind: 'other', detail: `answered HTTP ${res.status}, but not as this game's server (another program on port ${port}?)` });
    } catch (e) {
      // a timeout is a DOMException (name TimeoutError, numeric code 23); a refused connection has cause.code
      const code = e?.name === 'TimeoutError' || e?.name === 'AbortError' ? e.name : e?.cause?.code || e?.code || e?.name;
      if (code === 'ECONNREFUSED' || code === 'EADDRNOTAVAIL' || code === 'ENETUNREACH' || code === 'EHOSTUNREACH') tries.push({ host, kind: 'refused', detail: `nothing listening (${code})` });
      else if (code === 'TimeoutError' || code === 'AbortError') tries.push({ host, kind: 'timeout', detail: `no answer within ${timeoutMs / 1000} s (busy?)` });
      else tries.push({ host, kind: 'error', detail: String(code || e) });
    }
  }
  return { ours: null, tries };
}

/** Our server is gone: no address answers as ours, and none merely timed out. */
export const stopped = (r) => !r.ours && r.tries.every((t) => t.kind === 'refused' || t.kind === 'other');

const explain = (r, port) => r.tries.map((t) => `  ${urlOf(t.host, port)}: ${t.detail}`).join('\n');

async function statusJson(file, port) {
  const r = await probe(port);
  console.log(JSON.stringify({ file: readState(file), server: r.ours }, null, 2));
}

/**
 * Wait until the server on `port` has stopped. Exit codes: 0 stopped, 1 no server answering at the start, 3 it was
 * started again meanwhile (uptime went back), 130 interrupted (the maintenance stays set). A slow answer is not a stop.
 * `first`: the answer seen just before the file was written — an idle server may stop before the next probe, which is
 * the stop being waited for, not a missing server.
 */
async function waitForStop(port, first = null) {
  let r = first ?? await probe(port);
  if (!r.ours) {
    console.error(`Could not reach this game's server — nothing to wait for:\n${explain(r, port)}\nUse --port / --host if it listens elsewhere.`);
    process.exit(1);
  }
  process.on('SIGINT', () => {
    console.error('\nStopped waiting. The maintenance is still set: undo it with `node scripts/maintenance.mjs --cancel`.');
    process.exit(130);
  });
  PROBE_HOSTS = [r.host]; // keep asking where it answered
  let h = r.ours;
  let lastMatches = null;
  let lastUptime = h.uptimeSec;
  console.log(`Waiting for the server at ${urlOf(r.host, port)} to stop (Ctrl+C stops waiting; the maintenance stays set)…`);
  for (;;) {
    if (h.matches !== lastMatches) {
      console.log(`  ${h.matches} live match(es)${h.matches > 0 ? ': the server stops when they end' : ''}`);
      lastMatches = h.matches;
    }
    await new Promise((res) => setTimeout(res, WAIT_POLL_MS));
    r = await probe(port);
    if (!r.ours) {
      if (stopped(r)) { console.log('Server stopped.'); return; }
      console.log(`  no answer this time, still waiting:\n${explain(r, port)}`);
      continue;
    }
    h = r.ours;
    if (h.uptimeSec < lastUptime) {
      console.error('The server was started again meanwhile (a service manager?). Not continuing: update it the way your setup does (docs/DEPLOY.md).');
      process.exit(3);
    }
    lastUptime = h.uptimeSec;
  }
}

async function status(file, port) {
  console.log('Maintenance file:');
  for (const l of describe(readState(file))) console.log(`  ${l}`);
  const r = await probe(port);
  if (!r.ours) {
    console.log(`\nServer: could not reach this game's server:\n${explain(r, port)}\nUse --port / --host if it listens elsewhere.`);
    return;
  }
  const h = r.ours;
  const url = urlOf(r.host, port);
  console.log(`\nServer (${url}): up ${Math.round((h.uptimeSec || 0) / 60)} min, version ${h.app}`);
  console.log(`  ${h.matches} live match(es), ${h.rooms} room(s), ${h.humans} player(s) seated, ${h.spectators ?? 0} spectator(s), ${h.sessions} session(s)`);
  if (h.maintenance === undefined) console.log('  (this server version does not report maintenance)');
  else if (h.maintenance === null) console.log('  No maintenance in force on the server.');
  else for (const l of describe(h.maintenance)) console.log(`  In force: ${l}`);
}

async function main() {
  let args;
  try {
    args = parseArgs({
      options: {
        status: { type: 'boolean' },
        in: { type: 'string' },
        at: { type: 'string' },
        close: { type: 'boolean' },
        open: { type: 'boolean' },
        'stop-when-idle': { type: 'boolean' },
        'keep-running': { type: 'boolean' },
        'back-in': { type: 'string' },
        'back-at': { type: 'string' },
        message: { type: 'string' },
        wait: { type: 'boolean' },
        json: { type: 'boolean' },
        cancel: { type: 'boolean' },
        file: { type: 'string' },
        port: { type: 'string' },
        host: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (e) {
    fail(`${e.message}\n\n${USAGE}`);
  }
  const opt = args.values;
  const file = path.resolve(opt.file || path.join(ROOT, 'logs', 'maintenance.json'));
  const port = Number(opt.port || process.env.PORT || 3000);
  if (opt.host) PROBE_HOSTS = [opt.host.replace(/^\[|\]$/g, '')];
  const changes = ['in', 'at', 'close', 'open', 'stop-when-idle', 'keep-running', 'back-in', 'back-at', 'message'].some((k) => opt[k] != null);

  if (opt.help) { console.log(USAGE); return; }
  if (opt.cancel) {
    if (changes || opt.wait) fail('--cancel removes everything; use it alone.');
    try { fs.rmSync(file, { force: true }); } catch (e) { writeFailed(e, file); }
    console.log('Maintenance cancelled. Players see the bar disappear within a few seconds.');
    return;
  }
  if (!changes && !opt.wait) {
    if (opt.json) { await statusJson(file, port); return; }
    if (!opt.status) console.log(`${USAGE}\n`);
    await status(file, port);
    return;
  }
  if (!changes) {
    // --wait alone: wait for a stop that is already set
    if (readState(file)?.stopWhenIdle !== true) fail('--wait needs --stop-when-idle (now or set earlier): otherwise the server never stops by itself.');
    await waitForStop(port);
    return;
  }
  let next;
  try { next = nextState(readState(file), opt, Date.now()); } catch (e) { fail(e.message); }
  if (opt.wait && next?.stopWhenIdle !== true) fail('--wait needs --stop-when-idle: otherwise the server never stops by itself.');
  let seen = null;
  if (opt.wait) {
    // check the server first: a typo in --port must not leave a setting behind and then fail the chain halfway
    const r = seen = await probe(port);
    if (!r.ours) fail(`Could not reach this game's server; nothing was changed:\n${explain(r, port)}\nUse --port / --host if it listens elsewhere.`);
  }
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (next) fs.writeFileSync(file, `${JSON.stringify(next)}\n`);
    else fs.rmSync(file, { force: true });
  } catch (e) {
    writeFailed(e, file);
  }
  for (const l of describe(next)) console.log(l);
  console.log('The server picks it up within ~2 s.');
  if (opt.status) await status(file, port);
  if (opt.wait) await waitForStop(port, seen);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
